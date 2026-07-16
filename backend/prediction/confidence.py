"""Confidence score: a 0-100 blend of decisiveness, model agreement, data
volume, and source completeness. See docs/PREDICTION_ENGINE_DESIGN.md Section 8.
"""

from __future__ import annotations

from . import config


def margin_score(probs_1x2: tuple[float, float, float]) -> float:
    """How decisive the top outcome is (top minus second), scaled to ~[0, 1]."""
    ordered = sorted(probs_1x2, reverse=True)
    gap = ordered[0] - ordered[1]
    # A 0.5 gap (e.g. 60/10/...) is already very decisive -> saturate near there.
    return min(1.0, gap / 0.5)


def agreement_score(sources_1x2: list[tuple[float, float, float]]) -> float:
    """1 - mean pairwise L1 distance between available 1X2 vectors."""
    present = [s for s in sources_1x2 if s is not None]
    if len(present) < 2:
        return 0.6  # neutral-ish when we can't cross-check
    dists: list[float] = []
    for a in range(len(present)):
        for b in range(a + 1, len(present)):
            l1 = sum(abs(present[a][k] - present[b][k]) for k in range(3))
            dists.append(l1 / 2.0)  # L1 over a simplex is in [0, 2]
    mean_dist = sum(dists) / len(dists)
    return max(0.0, 1.0 - mean_dist)


def sample_score(home_played: int, away_played: int) -> float:
    return min(1.0, min(home_played, away_played) / config.CONFIDENCE_FULL_SAMPLE)


def completeness_score(flags: dict[str, bool]) -> float:
    """Fraction of the five expected sources that were available."""
    return sum(1.0 for present in flags.values() if present) / max(1, len(flags))


def compute_confidence(
    probs_1x2: tuple[float, float, float],
    sources_1x2: list[tuple[float, float, float]],
    home_played: int,
    away_played: int,
    completeness_flags: dict[str, bool],
    data_flags: list[str],
) -> float:
    w = config.CONFIDENCE_WEIGHTS
    score = (
        w.margin * margin_score(probs_1x2)
        + w.agreement * agreement_score(sources_1x2)
        + w.sample * sample_score(home_played, away_played)
        + w.completeness * completeness_score(completeness_flags)
    )
    value = 100.0 * score

    # Apply hard caps for degraded-data situations.
    for flag in data_flags:
        if flag in config.CONFIDENCE_CAPS:
            value = min(value, config.CONFIDENCE_CAPS[flag])

    return max(0.0, min(100.0, value))
