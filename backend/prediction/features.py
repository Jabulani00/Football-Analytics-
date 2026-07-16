"""Turn MatchInputs into the two Poisson means (expected goals).

Strengths use CONFIRMED season fields only (goals_for/against/played totals),
normalized by a league baseline measured from real results. Home advantage is
carried by the baseline's home vs away split, not by unverified venue-split
fields. See docs/PREDICTION_ENGINE_DESIGN.md Sections 1-4.
"""

from __future__ import annotations

from dataclasses import dataclass

from . import config
from .models import H2HSummary, LeagueBaseline, MatchInputs, TeamForm, TeamSeason


@dataclass
class Strengths:
    home_attack: float
    home_defense: float
    away_attack: float
    away_defense: float
    lam_home: float
    lam_away: float


def _shrink(strength: float, sample: int) -> float:
    """Pull a strength toward the league mean (1.0) for small samples."""
    if sample <= 0:
        return 1.0
    w = sample / (sample + config.PRIOR_MATCHES)
    return w * strength + (1.0 - w) * 1.0


def _season_strengths(team: TeamSeason, league_avg: float) -> tuple[float, float]:
    """(attack, defense) where 1.0 == league average. Defense >1 == leaky."""
    if team.played <= 0 or league_avg <= 0:
        return 1.0, 1.0
    attack = _shrink(team.gf_per_game / league_avg, team.played)
    defense = _shrink(team.ga_per_game / league_avg, team.played)
    return attack, defense


def _form_strengths(form: TeamForm, league_avg: float) -> tuple[float, float] | None:
    if form.matches <= 0 or league_avg <= 0:
        return None
    attack = _shrink(form.gf_per_game / league_avg, form.matches)
    defense = _shrink(form.ga_per_game / league_avg, form.matches)
    return attack, defense


def _blend_season_form(
    season: tuple[float, float],
    form: tuple[float, float] | None,
    form_matches: int,
) -> tuple[float, float]:
    if form is None:
        return season
    if form_matches >= config.FORM_MATURE_SAMPLE:
        sw, fw = 0.5, 0.5
    else:
        sw, fw = config.SEASON_WEIGHT, config.FORM_WEIGHT
    return (
        sw * season[0] + fw * form[0],
        sw * season[1] + fw * form[1],
    )


def _h2h_multiplier(h2h: H2HSummary, league_avg: float) -> float:
    """Small symmetric nudge on total goals from H2H scoring tendency."""
    if h2h.matches < 2 or league_avg <= 0:
        return 1.0
    expected_total = 2.0 * league_avg
    if expected_total <= 0:
        return 1.0
    deviation = (h2h.avg_total_goals - expected_total) / expected_total
    weight = min(1.0, h2h.matches / config.H2H_FULL_WEIGHT_SAMPLE)
    nudge = max(-config.H2H_MAX_NUDGE, min(config.H2H_MAX_NUDGE, deviation * weight))
    return 1.0 + nudge


def compute_strengths(inputs: MatchInputs) -> Strengths:
    league = inputs.league
    league_avg = league.avg if league.avg > 0 else config.DEFAULT_LEAGUE_HOME_GOALS

    home_season = _season_strengths(inputs.home_season, league_avg)
    away_season = _season_strengths(inputs.away_season, league_avg)

    home_att, home_def = _blend_season_form(
        home_season, _form_strengths(inputs.home_form, league_avg), inputs.home_form.matches
    )
    away_att, away_def = _blend_season_form(
        away_season, _form_strengths(inputs.away_form, league_avg), inputs.away_form.matches
    )

    # Expected goals: baseline venue mean x attacker strength x defender leakiness.
    lam_home = league.home_goals * home_att * away_def
    lam_away = league.away_goals * away_att * home_def

    # H2H nudge scales both sides' goals by the same factor (goal-friendliness).
    mult = _h2h_multiplier(inputs.h2h, league_avg)
    lam_home *= mult
    lam_away *= mult

    return Strengths(
        home_attack=home_att,
        home_defense=home_def,
        away_attack=away_att,
        away_defense=away_def,
        lam_home=lam_home,
        lam_away=lam_away,
    )
