"""Tests for the pure prediction core (stdlib only — no pytest required).

Run either way:
    python -m pytest backend/tests/test_prediction.py
    python backend/tests/test_prediction.py        # falls back to a plain runner
"""

from __future__ import annotations

import os
import sys

# Allow `python backend/tests/test_prediction.py` from the repo root.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from prediction import config, confidence, ensemble, poisson  # noqa: E402
from prediction.engine import predict_match  # noqa: E402
from prediction.models import (  # noqa: E402
    H2HSummary,
    LeagueBaseline,
    MatchInputs,
    TeamForm,
    TeamSeason,
)
from prediction import parsing  # noqa: E402

TOL = 1e-9


# --- Poisson core ------------------------------------------------------------
def test_poisson_pmf_sums_to_one():
    total = sum(poisson.poisson_pmf(k, 1.7) for k in range(50))
    assert abs(total - 1.0) < 1e-6


def test_poisson_pmf_zero_lambda():
    assert poisson.poisson_pmf(0, 0.0) == 1.0
    assert poisson.poisson_pmf(1, 0.0) == 0.0


def test_score_matrix_normalized():
    m = poisson.build_score_matrix(1.6, 1.1)
    total = sum(p for row in m.grid for p in row)
    assert abs(total - 1.0) < 1e-9


def test_outcome_probs_sum_to_one():
    m = poisson.build_score_matrix(1.8, 1.0)
    h, d, a = m.outcome_probs()
    assert abs((h + d + a) - 1.0) < 1e-9
    assert h > a  # stronger home lambda wins more often


def test_symmetric_lambdas_symmetric_outcomes():
    m = poisson.build_score_matrix(1.3, 1.3)
    h, d, a = m.outcome_probs()
    assert abs(h - a) < 1e-9


def test_over_line_semantics():
    m = poisson.build_score_matrix(1.4, 1.2)
    # Over 0.5 == 1 - P(0-0).
    assert abs(m.over_prob(0.5) - (1.0 - m.grid[0][0])) < 1e-9
    # Monotonic: harder lines are less likely.
    assert m.over_prob(0.5) > m.over_prob(1.5) > m.over_prob(2.5) > m.over_prob(3.5)


def test_btts_monotonic_in_lambdas():
    low = poisson.build_score_matrix(0.6, 0.6).btts_yes()
    high = poisson.build_score_matrix(2.2, 2.2).btts_yes()
    assert high > low
    assert 0.0 <= low <= 1.0 and 0.0 <= high <= 1.0


def test_dixon_coles_lifts_draws():
    lam = 1.1
    with_dc = poisson.build_score_matrix(lam, lam, rho=-0.13)
    no_dc = poisson.build_score_matrix(lam, lam, rho=0.0)
    assert with_dc.outcome_probs()[1] > no_dc.outcome_probs()[1]


# --- Ensemble ----------------------------------------------------------------
def test_devig_1x2_normalizes():
    p = ensemble.devig_1x2(2.0, 3.5, 4.0)
    assert p is not None
    assert abs(sum(p) - 1.0) < 1e-9


def test_blend_1x2_sums_to_one():
    w = config.BLEND_WITH_ODDS.normalized()
    out = ensemble.blend_1x2((0.5, 0.3, 0.2), (0.6, 0.25, 0.15), (0.55, 0.28, 0.17), w)
    assert abs(sum(out) - 1.0) < 1e-9


def test_blend_binary_skips_missing_sources():
    w = ensemble.choose_weights(sparse=False, has_odds=False, has_api=True)
    val, parts = ensemble.blend_binary(0.7, 0.5, None, w)
    assert 0.5 <= val <= 0.7
    assert parts["market"] is None


def test_choose_weights_renormalize():
    w = ensemble.choose_weights(sparse=False, has_odds=False, has_api=False)
    assert abs((w.model + w.api + w.market) - 1.0) < 1e-9
    assert w.model == 1.0  # only the model remains


# --- Confidence --------------------------------------------------------------
def test_confidence_in_range_and_capped():
    conf = confidence.compute_confidence(
        probs_1x2=(0.34, 0.33, 0.33),
        sources_1x2=[(0.34, 0.33, 0.33)],
        home_played=2,
        away_played=2,
        completeness_flags={"a": True, "b": False},
        data_flags=["low_data"],
    )
    assert 0.0 <= conf <= config.CONFIDENCE_CAPS["low_data"]


def test_confidence_decisive_beats_coinflip():
    flags = {"season": True, "form": True, "h2h": True, "api": True, "odds": True}
    decisive = confidence.compute_confidence(
        (0.75, 0.15, 0.10), [(0.75, 0.15, 0.10), (0.74, 0.16, 0.10)], 15, 15, flags, []
    )
    coinflip = confidence.compute_confidence(
        (0.34, 0.33, 0.33), [(0.34, 0.33, 0.33), (0.40, 0.30, 0.30)], 15, 15, flags, []
    )
    assert decisive > coinflip


# --- Parsing -----------------------------------------------------------------
def test_parse_team_season_cell_shapes():
    row = {
        "team_id": 5, "name": "X",
        "played": {"total": 10}, "goals_for": {"total": 18},
        "goals_against": {"total": 9}, "points": {"total": 22, "home": 14, "away": 8},
    }
    ts = parsing.parse_team_season(row)
    assert ts.played == 10 and ts.goals_for == 18 and ts.points_home == 14
    assert abs(ts.gf_per_game - 1.8) < TOL


def test_parse_league_baseline_falls_back_when_sparse():
    baseline = parsing.parse_league_baseline([{"status": "FT", "home_goals": 2, "away_goals": 1}])
    assert baseline.measured is False
    assert baseline.home_goals == config.DEFAULT_LEAGUE_HOME_GOALS


def test_parse_market_probability_devigs():
    odds = {
        "ft_result": {"home": 2.0, "draw": 3.5, "away": 4.0},
        "btts": {"yes": 1.8, "no": 2.0},
        "total_goals": {"over_25": 1.9, "under_25": 1.9},
    }
    mp = parsing.parse_market_probability(odds)
    assert abs((mp["home_win"] + mp["draw"] + mp["away_win"]) - 1.0) < 1e-9
    assert abs(mp["over_2.5"] - 0.5) < 1e-9


# --- Engine end-to-end -------------------------------------------------------
def _synthetic_inputs(**overrides) -> MatchInputs:
    base = dict(
        fixture_id=1,
        home_name="Home",
        away_name="Away",
        league=LeagueBaseline(1.5, 1.15, 200, True),
        home_season=TeamSeason(1, "Home", 19, 38, 17, 40, 26, 14),
        away_season=TeamSeason(2, "Away", 19, 20, 30, 19, 12, 7),
        home_form=TeamForm(5, 11, 4, 13, 2, 4),
        away_form=TeamForm(5, 5, 9, 4, 3, 3),
        h2h=H2HSummary(6, 19, 4, 4, 4, 1, 1),
        api_probability={"home_win": 0.60, "draw": 0.23, "away_win": 0.17, "btts": 0.55,
                         "o05": 0.94, "o15": 0.78, "o25": 0.55, "o35": 0.30},
        market_probability={"home_win": 0.58, "draw": 0.24, "away_win": 0.18, "btts": 0.53,
                            "over_2.5": 0.57},
    )
    base.update(overrides)
    return MatchInputs(**base)


def test_engine_probabilities_valid():
    result = predict_match(_synthetic_inputs())
    p = result.to_dict()["prediction"]
    assert abs((p["home_win"] + p["draw"] + p["away_win"]) - 1.0) < 1e-6
    assert p["home_win"] > p["away_win"]  # strong home side
    assert result.expected_goals_home > result.expected_goals_away
    assert 0.0 <= result.confidence <= 100.0


def test_engine_emits_all_markets():
    d = predict_match(_synthetic_inputs()).to_dict()
    for key in ("double_chance", "btts", "over_05", "over_15", "over_25", "over_35"):
        assert key in d["markets"], key
    assert len(d["correct_score"]) == config.TOP_CORRECT_SCORES
    assert d["explanation"]  # never empty for populated inputs


def test_engine_degrades_without_optional_sources():
    sparse = _synthetic_inputs(
        home_season=TeamSeason(1, "Home", 2, 3, 2, 4, 3, 1),
        away_season=TeamSeason(2, "Away", 2, 1, 3, 1, 0, 1),
        api_probability={},
        market_probability={},
        h2h=H2HSummary(),
        home_form=TeamForm(),
        away_form=TeamForm(),
    )
    result = predict_match(sparse)
    d = result.to_dict()
    assert "low_data" in d["data_flags"]
    assert "no_odds" in d["data_flags"]
    assert "no_api_probability" in d["data_flags"]
    assert result.confidence <= config.CONFIDENCE_CAPS["low_data"]


def test_no_team_ids_caps_confidence():
    result = predict_match(_synthetic_inputs(
        home_season=TeamSeason(None, "Home", 19, 38, 17, 40, 26, 14),
    ))
    assert "no_team_ids" in result.data_flags
    assert result.confidence <= config.CONFIDENCE_CAPS["no_team_ids"]


# --- Plain runner (no pytest) ------------------------------------------------
def _run_all() -> int:
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    failed = 0
    for t in tests:
        try:
            t()
            print(f"  PASS  {t.__name__}")
        except AssertionError as e:
            failed += 1
            print(f"  FAIL  {t.__name__}: {e}")
        except Exception as e:  # noqa: BLE001
            failed += 1
            print(f"  ERROR {t.__name__}: {type(e).__name__}: {e}")
    print(f"\n{len(tests) - failed}/{len(tests)} passed")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(_run_all())
