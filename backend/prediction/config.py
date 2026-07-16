"""Tunable weights and constants for the prediction engine.

Everything the model treats as a "magic number" lives here so it can be tuned
without touching logic. Values map directly to docs/PREDICTION_ENGINE_DESIGN.md
(Sections 3, 4, 7, 8).
"""

from __future__ import annotations

from dataclasses import dataclass, field


# --- League fallbacks (used only when results are too sparse to measure) -----
# Typical association-football goal rates. Home teams score more than away.
DEFAULT_LEAGUE_HOME_GOALS = 1.45
DEFAULT_LEAGUE_AWAY_GOALS = 1.15

# Minimum finished matches before we trust a measured league baseline.
MIN_BASELINE_MATCHES = 20


# --- Poisson / Dixon-Coles core ----------------------------------------------
# Max goals per team in the score matrix (0..MAX_GOALS inclusive).
MAX_GOALS = 8

# Dixon-Coles low-score dependency. Negative rho lifts 0-0 and 1-1 (draw
# inflation) and trims 1-0 / 0-1 — the well-known correction to independent
# Poisson. Empirically fitted values sit near -0.13.
DIXON_COLES_RHO = -0.13


# --- Strength construction (Layer A) -----------------------------------------
# Season vs recent-form blend for attack/defence strengths.
SEASON_WEIGHT = 0.60
FORM_WEIGHT = 0.40
# Once a team has >= this many form matches, shift to a 50/50 season/form blend.
FORM_MATURE_SAMPLE = 8

# Bayesian shrinkage toward the league mean for small samples. Strength is
# pulled toward 1.0 with a prior worth PRIOR_MATCHES games.
PRIOR_MATCHES = 6

# H2H nudge: max +/- fraction applied to expected goals, scaled by sample.
H2H_MAX_NUDGE = 0.05
H2H_FULL_WEIGHT_SAMPLE = 6

# Clamp expected goals to a sane range so a broken strength can't explode.
MIN_LAMBDA = 0.15
MAX_LAMBDA = 5.0


# --- Ensemble blend (Layer B) ------------------------------------------------
@dataclass(frozen=True)
class BlendWeights:
    model: float
    api: float
    market: float

    def normalized(self) -> "BlendWeights":
        total = self.model + self.api + self.market
        if total <= 0:
            return BlendWeights(1.0, 0.0, 0.0)
        return BlendWeights(self.model / total, self.api / total, self.market / total)


# Scenario -> weights. Renormalized in code when a source is missing.
BLEND_WITH_ODDS = BlendWeights(model=0.40, api=0.30, market=0.30)
BLEND_NO_ODDS = BlendWeights(model=0.55, api=0.45, market=0.00)
BLEND_SPARSE = BlendWeights(model=0.25, api=0.75, market=0.00)

# A team with fewer than this many season matches is "sparse".
SPARSE_MATCH_THRESHOLD = 6


# --- Confidence (Section 8) --------------------------------------------------
@dataclass(frozen=True)
class ConfidenceWeights:
    margin: float = 0.40
    agreement: float = 0.25
    sample: float = 0.20
    completeness: float = 0.15


CONFIDENCE_WEIGHTS = ConfidenceWeights()

# Sample fully "counts" at this many matches (min of the two teams).
CONFIDENCE_FULL_SAMPLE = 12

# Hard caps applied AFTER the weighted blend, keyed by data flag.
CONFIDENCE_CAPS: dict[str, float] = {
    "no_team_ids": 40.0,
    "low_data": 55.0,
    "no_api_probability": 70.0,
}


# --- Correct score output ----------------------------------------------------
TOP_CORRECT_SCORES = 3


# --- Markets we emit over/under lines for ------------------------------------
OVER_UNDER_LINES: tuple[float, ...] = (0.5, 1.5, 2.5, 3.5)
