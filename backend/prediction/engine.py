"""Prediction orchestrator: MatchInputs -> PredictionResult.

Pipeline: strengths -> Poisson score matrix -> per-market ensemble blend ->
confidence -> explanations. Pure stdlib; no network, no external deps.
"""

from __future__ import annotations

from . import config, confidence, ensemble, features, poisson
from .models import MatchInputs, PredictionResult


def _api_1x2(api: dict[str, float]) -> tuple[float, float, float] | None:
    keys = ("home_win", "draw", "away_win")
    if not all(k in api for k in keys):
        return None
    h, d, a = (api[k] for k in keys)
    s = h + d + a
    if s <= 0:
        return None
    return h / s, d / s, a / s


def _market_1x2(market: dict[str, float]) -> tuple[float, float, float] | None:
    keys = ("home_win", "draw", "away_win")
    if not all(k in market for k in keys):
        return None
    return market["home_win"], market["draw"], market["away_win"]


def _api_over_key(line: float) -> str:
    # 0.5 -> o05, 1.5 -> o15, 2.5 -> o25, 3.5 -> o35
    return "o" + f"{int(line)}5" if line >= 1 else "o05"


def _double_chance(home: float, draw: float, away: float) -> tuple[str, float]:
    options = {"1X": home + draw, "12": home + away, "X2": draw + away}
    pick = max(options, key=options.get)
    return pick, options[pick]


def _pct_vs_league(per_game: float, league_avg: float) -> int:
    if league_avg <= 0:
        return 0
    return round((per_game / league_avg - 1.0) * 100)


def predict_match(inputs: MatchInputs) -> PredictionResult:
    league_avg = inputs.league.avg if inputs.league.avg > 0 else config.DEFAULT_LEAGUE_HOME_GOALS

    # 1) Strengths -> lambdas -> score matrix.
    strengths = features.compute_strengths(inputs)
    matrix = poisson.build_score_matrix(strengths.lam_home, strengths.lam_away)

    # 2) Data-availability flags.
    has_api = bool(inputs.api_probability)
    has_market = bool(inputs.market_probability)
    min_played = min(inputs.home_season.played, inputs.away_season.played)
    sparse = min_played < config.SPARSE_MATCH_THRESHOLD

    data_flags: list[str] = []
    if inputs.home_season.team_id is None or inputs.away_season.team_id is None:
        data_flags.append("no_team_ids")
    if sparse:
        data_flags.append("low_data")
    if not has_market:
        data_flags.append("no_odds")
    if not has_api:
        data_flags.append("no_api_probability")

    weights = ensemble.choose_weights(sparse=sparse, has_odds=has_market, has_api=has_api)

    # 3) Model market probabilities from the score matrix.
    m_home, m_draw, m_away = matrix.outcome_probs()
    api_1x2 = _api_1x2(inputs.api_probability) if has_api else None
    market_1x2 = _market_1x2(inputs.market_probability) if has_market else None

    home_win, draw, away_win = ensemble.blend_1x2((m_home, m_draw, m_away), api_1x2, market_1x2, weights)

    # 4) Derived + blended secondary markets.
    dc_pick, dc_prob = _double_chance(home_win, draw, away_win)

    btts_model = matrix.btts_yes()
    btts_value, _ = ensemble.blend_binary(
        btts_model,
        inputs.api_probability.get("btts") if has_api else None,
        inputs.market_probability.get("btts") if has_market else None,
        weights,
    )

    markets: dict[str, object] = {
        "double_chance": {"pick": dc_pick, "probability": round(dc_prob, 4)},
        "btts": {"pick": "Yes" if btts_value >= 0.5 else "No", "probability": round(btts_value, 4)},
    }

    for line in config.OVER_UNDER_LINES:
        over_model = matrix.over_prob(line)
        over_value, _ = ensemble.blend_binary(
            over_model,
            inputs.api_probability.get(_api_over_key(line)) if has_api else None,
            inputs.market_probability.get(f"over_{line}") if has_market else None,
            weights,
        )
        key = f"over_{str(line).replace('.', '')}"  # over_05, over_15, over_25, over_35
        markets[key] = {
            "pick": "Over" if over_value >= 0.5 else "Under",
            "probability": round(over_value, 4),
        }

    # 5) Correct score from the matrix.
    correct_score = [
        {"score": s, "p": round(p, 4)} for s, p in matrix.top_scores(config.TOP_CORRECT_SCORES)
    ]

    # 6) Confidence.
    sources_1x2 = [s for s in ((m_home, m_draw, m_away), api_1x2, market_1x2) if s is not None]
    completeness_flags = {
        "season": inputs.home_season.played > 0 and inputs.away_season.played > 0,
        "form": inputs.home_form.matches > 0 or inputs.away_form.matches > 0,
        "h2h": inputs.h2h.matches >= 3,
        "api_probability": has_api,
        "odds": has_market,
    }
    conf = confidence.compute_confidence(
        probs_1x2=(home_win, draw, away_win),
        sources_1x2=sources_1x2,
        home_played=inputs.home_season.played,
        away_played=inputs.away_season.played,
        completeness_flags=completeness_flags,
        data_flags=data_flags,
    )

    # 7) Explanations tied to real fields.
    explanation = _build_explanation(
        inputs, strengths, league_avg, btts_value, (m_home, m_draw, m_away), api_1x2, market_1x2
    )

    return PredictionResult(
        fixture_id=inputs.fixture_id,
        home_team=inputs.home_name,
        away_team=inputs.away_name,
        home_win=home_win,
        draw=draw,
        away_win=away_win,
        expected_goals_home=strengths.lam_home,
        expected_goals_away=strengths.lam_away,
        markets=markets,
        correct_score=correct_score,
        confidence=conf,
        data_flags=data_flags,
        explanation=explanation,
    )


def _build_explanation(
    inputs: MatchInputs,
    strengths: features.Strengths,
    league_avg: float,
    btts_value: float,
    model_1x2: tuple[float, float, float],
    api_1x2: tuple[float, float, float] | None,
    market_1x2: tuple[float, float, float] | None,
) -> list[str]:
    lines: list[str] = []
    hs, as_ = inputs.home_season, inputs.away_season

    if hs.played > 0:
        lines.append(
            f"{inputs.home_name} score {hs.gf_per_game:.2f}/game "
            f"({hs.goals_for}/{hs.played}), {_pct_vs_league(hs.gf_per_game, league_avg):+d}% vs league avg {league_avg:.2f}"
        )
    if as_.played > 0:
        lines.append(
            f"{inputs.away_name} concede {as_.ga_per_game:.2f}/game "
            f"({as_.goals_against}/{as_.played}) away — defence strength {strengths.away_defense:.2f}"
        )

    lines.append(
        f"Model expected goals {strengths.lam_home:.2f}-{strengths.lam_away:.2f} "
        f"→ BTTS {'Yes' if btts_value >= 0.5 else 'No'} at {btts_value * 100:.0f}%"
    )

    if inputs.h2h.matches >= 2:
        lines.append(
            f"BTTS in {inputs.h2h.btts_hits}/{inputs.h2h.matches} recent H2H meetings "
            f"(avg {inputs.h2h.avg_total_goals:.1f} goals)"
        )

    if inputs.home_form.matches > 0:
        lines.append(
            f"{inputs.home_name} form: {inputs.home_form.ppg:.2f} PPG, "
            f"{inputs.home_form.gf_per_game:.1f} scored/game over last {inputs.home_form.matches}"
        )

    # Agreement note when we could cross-check independent models.
    sources = [s for s in (model_1x2, api_1x2, market_1x2) if s is not None]
    if len(sources) >= 2:
        labels = ["model"]
        if api_1x2 is not None:
            labels.append("OddAlerts")
        if market_1x2 is not None:
            labels.append("market")
        homes = ", ".join(f"{lbl} {src[0] * 100:.0f}%" for lbl, src in zip(labels, sources))
        lines.append(f"Home-win agreement — {homes}")

    return lines
