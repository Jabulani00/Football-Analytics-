"""FastAPI app exposing the prediction engine (requires fastapi + uvicorn).

Run:
    cd backend
    uvicorn prediction.api:app --reload --port 8000

Endpoints:
    GET /health
    GET /predictions/upcoming?days=3&limit=20
    GET /predictions/fixture/{fixture_id}

Per docs/PREDICTION_ENGINE_DESIGN.md Section 6, a production deployment should
precompute predictions on a schedule and have the app read cached rows; these
live endpoints are the compute path and the dev/manual entry point.
"""

from __future__ import annotations

import os

try:
    from fastapi import FastAPI, HTTPException, Query
except ImportError as exc:  # pragma: no cover
    raise ImportError("api needs fastapi. pip install fastapi uvicorn[standard]") from exc

from . import service
from .oddalerts_client import OddAlertsClient, OddAlertsError

app = FastAPI(
    title="Scoreline Prediction Engine",
    version="0.1.0",
    description="Explainable Dixon-Coles + ensemble football predictions over the OddAlerts API.",
)


def _client() -> OddAlertsClient:
    try:
        return OddAlertsClient()
    except OddAlertsError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.get("/health")
async def health() -> dict[str, object]:
    return {"status": "ok", "token_configured": bool(os.environ.get("ODDALERTS_TOKEN"))}


@app.get("/predictions/upcoming")
async def upcoming(
    days: int = Query(3, ge=1, le=14),
    limit: int = Query(20, ge=1, le=100),
) -> dict[str, object]:
    client = _client()
    try:
        predictions = await service.predict_upcoming(client, days=days, limit=limit)
    finally:
        await client.aclose()
    return {"count": len(predictions), "predictions": predictions}


@app.get("/predictions/fixture/{fixture_id}")
async def fixture(fixture_id: int) -> dict[str, object]:
    client = _client()
    try:
        detail = await client.fixture_detail(
            fixture_id, include="probability,odds,h2h,referee"
        )
        if not detail:
            raise HTTPException(status_code=404, detail=f"Fixture {fixture_id} not found")
        detail.setdefault("id", fixture_id)
        prediction = await service.predict_fixture(client, detail)
    finally:
        await client.aclose()
    return prediction
