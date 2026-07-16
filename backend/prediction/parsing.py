"""Map raw OddAlerts JSON into engine inputs.

Field names verified against docs/ODDALERTS_API_DATA_CATALOG.md and
frontend/services/oddAlerts.ts. Everything here is pure stdlib and defensive:
unknown/missing fields degrade rather than raise.
"""

from __future__ import annotations

from typing import Any

from . import config, ensemble
from .models import H2HSummary, LeagueBaseline, TeamForm, TeamSeason

FINISHED_STATUSES = {"FT", "AET", "FT_PEN"}


def _cell_total(cell: Any) -> int:
    """Season stat cells are {total, home, away}; tolerate plain numbers too."""
    if isinstance(cell, dict):
        return int(cell.get("total") or 0)
    if isinstance(cell, (int, float)):
        return int(cell)
    return 0


def _cell(cell: Any, key: str) -> int:
    if isinstance(cell, dict):
        return int(cell.get(key) or 0)
    return 0


def parse_team_season(row: dict[str, Any]) -> TeamSeason:
    """One row of GET /stats/season/:seasonId → TeamSeason."""
    return TeamSeason(
        team_id=row.get("team_id"),
        name=row.get("name", "Unknown"),
        played=_cell_total(row.get("played")),
        goals_for=_cell_total(row.get("goals_for")),
        goals_against=_cell_total(row.get("goals_against")),
        points_total=_cell_total(row.get("points")),
        points_home=_cell(row.get("points"), "home"),
        points_away=_cell(row.get("points"), "away"),
    )


def find_season_row(season_data: list[dict[str, Any]], team_id: int | None, name: str) -> TeamSeason:
    """Locate a team in a season-stats payload by id, falling back to name."""
    for row in season_data:
        if team_id is not None and row.get("team_id") == team_id:
            return parse_team_season(row)
    lowered = (name or "").lower()
    for row in season_data:
        if str(row.get("name", "")).lower() == lowered:
            return parse_team_season(row)
    # Not found → empty season (engine will shrink to league mean, flag low_data).
    return TeamSeason(team_id=team_id, name=name, played=0, goals_for=0, goals_against=0)


def parse_league_baseline(fixtures: list[dict[str, Any]]) -> LeagueBaseline:
    """Measure league home/away goal averages from finished results."""
    home_goals = away_goals = matches = 0
    for fx in fixtures:
        if fx.get("status") not in FINISHED_STATUSES:
            continue
        hg, ag = fx.get("home_goals"), fx.get("away_goals")
        if hg is None or ag is None:
            continue
        home_goals += int(hg)
        away_goals += int(ag)
        matches += 1

    if matches >= config.MIN_BASELINE_MATCHES:
        return LeagueBaseline(
            home_goals=home_goals / matches,
            away_goals=away_goals / matches,
            matches=matches,
            measured=True,
        )
    return LeagueBaseline(
        home_goals=config.DEFAULT_LEAGUE_HOME_GOALS,
        away_goals=config.DEFAULT_LEAGUE_AWAY_GOALS,
        matches=matches,
        measured=False,
    )


def parse_team_form(
    fixtures: list[dict[str, Any]], team_id: int, last_n: int = 5
) -> TeamForm:
    """Rolling form for one team from its finished fixtures (newest first assumed)."""
    finished = [
        fx
        for fx in fixtures
        if fx.get("status") in FINISHED_STATUSES
        and fx.get("home_goals") is not None
        and fx.get("away_goals") is not None
        and team_id in (fx.get("home_id"), fx.get("away_id"))
    ]
    finished.sort(key=lambda fx: fx.get("unix", 0), reverse=True)

    form = TeamForm()
    for fx in finished[:last_n]:
        is_home = fx.get("home_id") == team_id
        gf = int(fx["home_goals"] if is_home else fx["away_goals"])
        ga = int(fx["away_goals"] if is_home else fx["home_goals"])
        form.matches += 1
        form.goals_for += gf
        form.goals_against += ga
        form.points += 3 if gf > ga else (1 if gf == ga else 0)
        if gf > 0 and ga > 0:
            form.btts_hits += 1
        if gf + ga > 2:
            form.over25_hits += 1
    return form


def parse_h2h(h2h: list[dict[str, Any]], home_team_id: int | None) -> H2HSummary:
    """include=h2h[] → summary relative to the CURRENT fixture's home team.

    Historical rows carry their own home/away orientation, so we resolve each
    result to the current home team using team1_win/team2_win when present,
    else by matching ids.
    """
    summary = H2HSummary()
    for m in h2h:
        hg, ag = m.get("home_goals"), m.get("away_goals")
        if hg is None or ag is None:
            continue
        hg, ag = int(hg), int(ag)
        summary.matches += 1
        summary.total_goals += m.get("total_goals", hg + ag)
        if m.get("btts", hg > 0 and ag > 0):
            summary.btts_hits += 1
        if (hg + ag) > 2:
            summary.over25_hits += 1

        if m.get("draw") or hg == ag:
            summary.draws += 1
            continue
        # Prefer explicit relative flags; else infer from historical home id.
        if "team1_win" in m or "team2_win" in m:
            # team1 == current fixture home team by API convention.
            if m.get("team1_win"):
                summary.home_team_wins += 1
            else:
                summary.away_team_wins += 1
        elif home_team_id is not None and m.get("home_id") == home_team_id:
            summary.home_team_wins += 1 if hg > ag else 0
            summary.away_team_wins += 1 if ag > hg else 0
        else:
            summary.home_team_wins += 1 if ag > hg else 0
            summary.away_team_wins += 1 if hg > ag else 0
    return summary


def parse_api_probability(prob: dict[str, Any]) -> dict[str, float]:
    """include=probability → engine keys, converted from percentages to 0..1."""
    if not prob:
        return {}
    wanted = (
        "home_win", "draw", "away_win",
        "btts", "btts_no",
        "o05", "o15", "o25", "o35", "o45",
        "double_chance_1x", "double_chance_12", "double_chance_x2",
    )
    out: dict[str, float] = {}
    for k in wanted:
        v = prob.get(k)
        if isinstance(v, (int, float)):
            out[k] = float(v) / 100.0
    return out


def parse_market_probability(odds: dict[str, Any]) -> dict[str, float]:
    """include=odds → de-vigged engine keys (home_win/draw/away_win, btts,
    over_0.5..over_3.5). Missing markets are simply omitted."""
    if not odds:
        return {}
    out: dict[str, float] = {}

    ft = odds.get("ft_result") or {}
    devig = ensemble.devig_1x2(ft.get("home"), ft.get("draw"), ft.get("away")) if ft else None
    if devig:
        out["home_win"], out["draw"], out["away_win"] = devig

    btts = odds.get("btts") or {}
    p_btts = ensemble.devig_binary(btts.get("yes"), btts.get("no"))
    if p_btts is not None:
        out["btts"] = p_btts

    totals = odds.get("total_goals") or {}
    for line in config.OVER_UNDER_LINES:
        tag = f"{int(line)}5" if line >= 1 else "05"  # 0.5->05, 2.5->25
        p = ensemble.devig_binary(totals.get(f"over_{tag}"), totals.get(f"under_{tag}"))
        if p is not None:
            out[f"over_{line}"] = p

    return out
