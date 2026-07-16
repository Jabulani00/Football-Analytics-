"""Plain dataclasses shared across the pure core (no external deps).

These are the internal feature/result types. The FastAPI request/response
schemas (pydantic) live in schemas.py and are built from these.
"""

from __future__ import annotations

from dataclasses import dataclass, field


# --- Inputs ------------------------------------------------------------------
@dataclass
class LeagueBaseline:
    """League-average goals per match, measured from finished results."""

    home_goals: float
    away_goals: float
    matches: int
    measured: bool  # False => using DEFAULT_LEAGUE_* fallbacks

    @property
    def avg(self) -> float:
        return (self.home_goals + self.away_goals) / 2.0


@dataclass
class TeamSeason:
    """Overall season aggregates from GET /stats/season/:seasonId.

    Only confirmed fields (goals_for.total, goals_against.total, played.total,
    points.{total,home,away}) are required; venue splits are optional.
    """

    team_id: int | None
    name: str
    played: int
    goals_for: int
    goals_against: int
    points_total: int = 0
    points_home: int = 0
    points_away: int = 0

    @property
    def gf_per_game(self) -> float:
        return self.goals_for / self.played if self.played else 0.0

    @property
    def ga_per_game(self) -> float:
        return self.goals_against / self.played if self.played else 0.0

    @property
    def ppg(self) -> float:
        return self.points_total / self.played if self.played else 0.0


@dataclass
class TeamForm:
    """Rolling last-N form measured from GET /fixtures/between."""

    matches: int = 0
    goals_for: int = 0
    goals_against: int = 0
    points: int = 0
    btts_hits: int = 0
    over25_hits: int = 0

    @property
    def gf_per_game(self) -> float:
        return self.goals_for / self.matches if self.matches else 0.0

    @property
    def ga_per_game(self) -> float:
        return self.goals_against / self.matches if self.matches else 0.0

    @property
    def ppg(self) -> float:
        return self.points / self.matches if self.matches else 0.0

    @property
    def btts_rate(self) -> float:
        return self.btts_hits / self.matches if self.matches else 0.0


@dataclass
class H2HSummary:
    """Head-to-head history from include=h2h."""

    matches: int = 0
    total_goals: int = 0
    btts_hits: int = 0
    over25_hits: int = 0
    home_team_wins: int = 0  # wins for the current fixture's home team
    away_team_wins: int = 0
    draws: int = 0

    @property
    def avg_total_goals(self) -> float:
        return self.total_goals / self.matches if self.matches else 0.0

    @property
    def btts_rate(self) -> float:
        return self.btts_hits / self.matches if self.matches else 0.0


@dataclass
class MatchInputs:
    """Everything the engine needs for one fixture."""

    fixture_id: int
    home_name: str
    away_name: str
    league: LeagueBaseline
    home_season: TeamSeason
    away_season: TeamSeason
    home_form: TeamForm = field(default_factory=TeamForm)
    away_form: TeamForm = field(default_factory=TeamForm)
    h2h: H2HSummary = field(default_factory=H2HSummary)
    # OddAlerts probability model (already /100 into 0..1), keyed like the API:
    # home_win, draw, away_win, btts, o05..o45, double_chance_1x/12/x2 ...
    api_probability: dict[str, float] = field(default_factory=dict)
    # De-vigged market-implied probabilities per our internal market keys.
    market_probability: dict[str, float] = field(default_factory=dict)


# --- Output ------------------------------------------------------------------
@dataclass
class MarketProb:
    """A single blended market probability with its component sources."""

    value: float
    model: float | None = None
    api: float | None = None
    market: float | None = None


@dataclass
class PredictionResult:
    fixture_id: int
    home_team: str
    away_team: str
    home_win: float
    draw: float
    away_win: float
    expected_goals_home: float
    expected_goals_away: float
    markets: dict[str, object]
    correct_score: list[dict[str, object]]
    confidence: float
    data_flags: list[str]
    explanation: list[str]

    def to_dict(self) -> dict:
        """Response shape from docs/PREDICTION_ENGINE_DESIGN.md Section 11."""
        return {
            "match": {
                "home_team": self.home_team,
                "away_team": self.away_team,
                "fixture_id": self.fixture_id,
            },
            "prediction": {
                "home_win": round(self.home_win, 4),
                "draw": round(self.draw, 4),
                "away_win": round(self.away_win, 4),
            },
            "markets": self.markets,
            "expected_goals": {
                "home": round(self.expected_goals_home, 3),
                "away": round(self.expected_goals_away, 3),
                "note": "model estimate (Poisson lambda), not post-match API xG",
            },
            "correct_score": self.correct_score,
            "confidence": round(self.confidence, 1),
            "data_flags": self.data_flags,
            "explanation": self.explanation,
        }
