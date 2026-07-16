"""Offline demo: run a full prediction on synthetic inputs, no network needed.

    cd backend
    python -m prediction.demo

Proves the pure core end-to-end and prints the exact API response shape.
"""

from __future__ import annotations

import json

from .engine import predict_match
from .models import H2HSummary, LeagueBaseline, MatchInputs, TeamForm, TeamSeason


def sample_inputs() -> MatchInputs:
    # A strong home side vs a leaky away side, in a slightly high-scoring league.
    league = LeagueBaseline(home_goals=1.55, away_goals=1.20, matches=180, measured=True)
    home = TeamSeason(
        team_id=101, name="Riverside FC", played=19,
        goals_for=38, goals_against=17, points_total=40, points_home=26, points_away=14,
    )
    away = TeamSeason(
        team_id=202, name="Hilltop United", played=19,
        goals_for=22, goals_against=31, points_total=20, points_home=13, points_away=7,
    )
    home_form = TeamForm(matches=5, goals_for=11, goals_against=4, points=13, btts_hits=2, over25_hits=4)
    away_form = TeamForm(matches=5, goals_for=5, goals_against=9, points=4, btts_hits=3, over25_hits=3)
    h2h = H2HSummary(matches=6, total_goals=19, btts_hits=4, over25_hits=4, home_team_wins=4, away_team_wins=1, draws=1)

    # OddAlerts probability model (percentages) and a de-vigged market anchor.
    api_probability = {
        "home_win": 0.60, "draw": 0.23, "away_win": 0.17,
        "btts": 0.55, "o05": 0.94, "o15": 0.78, "o25": 0.55, "o35": 0.30,
    }
    market_probability = {
        "home_win": 0.58, "draw": 0.24, "away_win": 0.18,
        "btts": 0.53, "over_2.5": 0.57,
    }

    return MatchInputs(
        fixture_id=999001,
        home_name=home.name,
        away_name=away.name,
        league=league,
        home_season=home,
        away_season=away,
        home_form=home_form,
        away_form=away_form,
        h2h=h2h,
        api_probability=api_probability,
        market_probability=market_probability,
    )


def main() -> None:
    result = predict_match(sample_inputs())
    print(json.dumps(result.to_dict(), indent=2))


if __name__ == "__main__":
    main()
