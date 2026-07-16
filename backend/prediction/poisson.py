"""Dixon-Coles bivariate-Poisson goals model (pure stdlib).

Two expected-goal means produce a full score matrix, and every market is read
off that one matrix so predictions are internally consistent.

Reference: Dixon & Coles (1997), "Modelling Association Football Scores and
Inefficiencies in the Football Betting Market".
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from . import config


def poisson_pmf(k: int, lam: float) -> float:
    """P(X = k) for X ~ Poisson(lam)."""
    if lam <= 0:
        return 1.0 if k == 0 else 0.0
    return math.exp(-lam) * lam**k / math.factorial(k)


def dixon_coles_tau(i: int, j: int, lam_home: float, lam_away: float, rho: float) -> float:
    """Low-score dependency correction. Only the four lowest cells change."""
    if i == 0 and j == 0:
        return 1.0 - lam_home * lam_away * rho
    if i == 0 and j == 1:
        return 1.0 + lam_home * rho
    if i == 1 and j == 0:
        return 1.0 + lam_away * rho
    if i == 1 and j == 1:
        return 1.0 - rho
    return 1.0


@dataclass
class ScoreMatrix:
    """Normalized P(home=i, away=j) grid plus the lambdas that built it."""

    grid: list[list[float]]
    lam_home: float
    lam_away: float

    @property
    def max_goals(self) -> int:
        return len(self.grid) - 1

    # --- Outcome markets -----------------------------------------------------
    def outcome_probs(self) -> tuple[float, float, float]:
        """(home_win, draw, away_win)."""
        home = draw = away = 0.0
        for i, row in enumerate(self.grid):
            for j, p in enumerate(row):
                if i > j:
                    home += p
                elif i == j:
                    draw += p
                else:
                    away += p
        return home, draw, away

    def btts_yes(self) -> float:
        p_home_zero = sum(self.grid[0])  # home scores 0
        p_away_zero = sum(row[0] for row in self.grid)  # away scores 0
        p_nil_nil = self.grid[0][0]
        return max(0.0, 1.0 - p_home_zero - p_away_zero + p_nil_nil)

    def over_prob(self, line: float) -> float:
        """P(total goals > line). Use half lines (0.5, 1.5, ...)."""
        threshold = math.floor(line)  # goals strictly greater than `line`
        over = 0.0
        for i, row in enumerate(self.grid):
            for j, p in enumerate(row):
                if i + j > threshold:
                    over += p
        return over

    def top_scores(self, n: int) -> list[tuple[str, float]]:
        cells = [
            (f"{i}-{j}", p)
            for i, row in enumerate(self.grid)
            for j, p in enumerate(row)
        ]
        cells.sort(key=lambda c: c[1], reverse=True)
        return cells[:n]


def build_score_matrix(
    lam_home: float,
    lam_away: float,
    rho: float = config.DIXON_COLES_RHO,
    max_goals: int = config.MAX_GOALS,
) -> ScoreMatrix:
    """Bivariate Poisson grid with Dixon-Coles correction, renormalized to 1."""
    lam_home = _clamp(lam_home, config.MIN_LAMBDA, config.MAX_LAMBDA)
    lam_away = _clamp(lam_away, config.MIN_LAMBDA, config.MAX_LAMBDA)

    home_pmf = [poisson_pmf(i, lam_home) for i in range(max_goals + 1)]
    away_pmf = [poisson_pmf(j, lam_away) for j in range(max_goals + 1)]

    grid: list[list[float]] = []
    total = 0.0
    for i in range(max_goals + 1):
        row: list[float] = []
        for j in range(max_goals + 1):
            tau = dixon_coles_tau(i, j, lam_home, lam_away, rho)
            # tau can dip below 0 for extreme rho; clamp to keep probabilities valid.
            p = home_pmf[i] * away_pmf[j] * max(tau, 1e-9)
            row.append(p)
            total += p
        grid.append(row)

    if total > 0:
        grid = [[p / total for p in row] for row in grid]
    return ScoreMatrix(grid=grid, lam_home=lam_home, lam_away=lam_away)


def _clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))
