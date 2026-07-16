"""Pydantic response schemas for the FastAPI layer (requires `pydantic`).

Mirrors PredictionResult.to_dict() so the OpenAPI docs describe the real shape.
"""

from __future__ import annotations

from typing import Any

try:
    from pydantic import BaseModel, Field
except ImportError as exc:  # pragma: no cover
    raise ImportError("schemas needs pydantic. pip install fastapi pydantic") from exc


class MatchRef(BaseModel):
    home_team: str
    away_team: str
    fixture_id: int


class OneXTwo(BaseModel):
    home_win: float
    draw: float
    away_win: float


class ExpectedGoals(BaseModel):
    home: float
    away: float
    note: str


class CorrectScore(BaseModel):
    score: str
    p: float


class PredictionResponse(BaseModel):
    match: MatchRef
    prediction: OneXTwo
    markets: dict[str, Any]
    expected_goals: ExpectedGoals
    correct_score: list[CorrectScore]
    confidence: float
    data_flags: list[str] = Field(default_factory=list)
    explanation: list[str] = Field(default_factory=list)
