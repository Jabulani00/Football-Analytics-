"""Fetch-and-predict orchestration (requires httpx via oddalerts_client).

Ties the async client to the pure engine: for a fixture it gathers season
stats, a results window (baseline + form), H2H, the API probability model and
odds, builds MatchInputs, and returns a PredictionResult.
"""

from __future__ import annotations

from typing import Any

from . import parsing
from .engine import predict_match
from .models import MatchInputs, TeamForm
from .oddalerts_client import OddAlertsClient, season_window_unix


async def build_inputs_for_fixture(
    client: OddAlertsClient, fixture: dict[str, Any]
) -> MatchInputs:
    fixture_id = int(fixture["id"])
    home_id = fixture.get("home_id")
    away_id = fixture.get("away_id")
    season_id = fixture.get("season_id")
    competition_id = fixture.get("competition_id")
    season_name = fixture.get("season", "")

    # Detail: probability + odds + h2h in one call.
    detail = await client.fixture_detail(fixture_id, include="probability,odds,h2h")
    api_prob = parsing.parse_api_probability(detail.get("probability") or {})
    market_prob = parsing.parse_market_probability(detail.get("odds") or {})
    h2h = parsing.parse_h2h(detail.get("h2h") or [], home_id)

    # Season aggregates for strengths.
    season_rows: list[dict[str, Any]] = []
    if season_id is not None:
        season_rows = await client.season_stats(int(season_id))
    home_season = parsing.find_season_row(season_rows, home_id, fixture.get("home_name", "Home"))
    away_season = parsing.find_season_row(season_rows, away_id, fixture.get("away_name", "Away"))

    # One results window for the whole competition → baseline + both teams' form.
    league_results: list[dict[str, Any]] = []
    if competition_id is not None and season_name:
        from_unix, to_unix = season_window_unix(season_name)
        league_results = await client.fixtures_between(
            from_unix, to_unix, teams=None
        )
        # Keep only this competition's matches for the baseline.
        league_results = [
            fx for fx in league_results if fx.get("competition_id") == competition_id
        ]

    league = parsing.parse_league_baseline(league_results)
    home_form = (
        parsing.parse_team_form(league_results, int(home_id)) if home_id is not None else TeamForm()
    )
    away_form = (
        parsing.parse_team_form(league_results, int(away_id)) if away_id is not None else TeamForm()
    )

    return MatchInputs(
        fixture_id=fixture_id,
        home_name=fixture.get("home_name", "Home"),
        away_name=fixture.get("away_name", "Away"),
        league=league,
        home_season=home_season,
        away_season=away_season,
        home_form=home_form,
        away_form=away_form,
        h2h=h2h,
        api_probability=api_prob,
        market_probability=market_prob,
    )


async def predict_fixture(client: OddAlertsClient, fixture: dict[str, Any]) -> dict[str, Any]:
    inputs = await build_inputs_for_fixture(client, fixture)
    return predict_match(inputs).to_dict()


async def predict_upcoming(
    client: OddAlertsClient, days: int = 3, limit: int | None = None
) -> list[dict[str, Any]]:
    fixtures = await client.upcoming_fixtures(days=days)
    if limit is not None:
        fixtures = fixtures[:limit]
    results: list[dict[str, Any]] = []
    for fx in fixtures:
        try:
            results.append(await predict_fixture(client, fx))
        except Exception as exc:  # keep the batch alive if one fixture fails
            results.append(
                {
                    "match": {
                        "home_team": fx.get("home_name"),
                        "away_team": fx.get("away_name"),
                        "fixture_id": fx.get("id"),
                    },
                    "error": str(exc),
                }
            )
    return results
