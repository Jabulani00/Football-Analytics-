"""Layer B: blend our Poisson model with the OddAlerts probability model and
(when present) de-vigged market-implied probabilities.

See docs/PREDICTION_ENGINE_DESIGN.md Section 3.2 and 7.
"""

from __future__ import annotations

from . import config
from .config import BlendWeights


def choose_weights(sparse: bool, has_odds: bool, has_api: bool) -> BlendWeights:
    """Pick a scenario weight set, then drop+renormalize missing sources."""
    if sparse:
        w = config.BLEND_SPARSE
    elif has_odds:
        w = config.BLEND_WITH_ODDS
    else:
        w = config.BLEND_NO_ODDS

    model = w.model
    api = w.api if has_api else 0.0
    market = w.market if has_odds else 0.0
    return BlendWeights(model=model, api=api, market=market).normalized()


def blend_binary(
    model_p: float,
    api_p: float | None,
    market_p: float | None,
    weights: BlendWeights,
) -> tuple[float, dict[str, float | None]]:
    """Blend a single 'yes/over' probability. Missing sources are skipped and
    the remaining weights renormalized so the result stays in [0, 1]."""
    parts: list[tuple[float, float]] = [(weights.model, model_p)]
    if api_p is not None and weights.api > 0:
        parts.append((weights.api, api_p))
    if market_p is not None and weights.market > 0:
        parts.append((weights.market, market_p))

    total_w = sum(w for w, _ in parts)
    if total_w <= 0:
        value = model_p
    else:
        value = sum(w * p for w, p in parts) / total_w
    value = max(0.0, min(1.0, value))
    return value, {"model": model_p, "api": api_p, "market": market_p}


def blend_1x2(
    model: tuple[float, float, float],
    api: tuple[float, float, float] | None,
    market: tuple[float, float, float] | None,
    weights: BlendWeights,
) -> tuple[float, float, float]:
    """Blend the three-way result, renormalizing to sum 1."""
    keys = range(3)
    parts: list[tuple[float, tuple[float, float, float]]] = [(weights.model, model)]
    if api is not None and weights.api > 0:
        parts.append((weights.api, api))
    if market is not None and weights.market > 0:
        parts.append((weights.market, market))

    total_w = sum(w for w, _ in parts) or 1.0
    blended = [sum(w * probs[k] for w, probs in parts) / total_w for k in keys]
    s = sum(blended)
    if s > 0:
        blended = [b / s for b in blended]
    return blended[0], blended[1], blended[2]


def devig_1x2(odds_home: float, odds_draw: float, odds_away: float) -> tuple[float, float, float] | None:
    """Convert decimal 1X2 odds to normalized (overround-removed) probabilities."""
    try:
        raw = [1.0 / odds_home, 1.0 / odds_draw, 1.0 / odds_away]
    except (ZeroDivisionError, TypeError):
        return None
    total = sum(raw)
    if total <= 0:
        return None
    return raw[0] / total, raw[1] / total, raw[2] / total


def devig_binary(odds_yes: float | None, odds_no: float | None) -> float | None:
    """De-vig a two-way market to the 'yes' probability."""
    if not odds_yes or odds_yes <= 0:
        return None
    p_yes = 1.0 / odds_yes
    if odds_no and odds_no > 0:
        p_no = 1.0 / odds_no
        total = p_yes + p_no
        if total > 0:
            return p_yes / total
    return min(1.0, p_yes)
