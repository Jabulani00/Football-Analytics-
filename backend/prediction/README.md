# Prediction Engine (`backend/prediction/`)

Explainable football predictions over the OddAlerts API. Implements
[docs/PREDICTION_ENGINE_DESIGN.md](../../docs/PREDICTION_ENGINE_DESIGN.md).

## Layers

| Module | Deps | Role |
| ------ | ---- | ---- |
| `config.py` | stdlib | All tunable weights/constants |
| `models.py` | stdlib | Feature + result dataclasses |
| `poisson.py` | stdlib | Dixon-Coles bivariate-Poisson score matrix |
| `features.py` | stdlib | Season+form strengths → expected goals (λ) |
| `ensemble.py` | stdlib | Blend model / API / market probabilities |
| `confidence.py` | stdlib | 0–100 confidence score |
| `engine.py` | stdlib | Orchestrator → `PredictionResult` |
| `parsing.py` | stdlib | Raw OddAlerts JSON → engine inputs |
| `oddalerts_client.py` | `httpx` | Async API client |
| `service.py` | `httpx` | Fetch-and-predict per fixture |
| `schemas.py` / `api.py` | `fastapi`, `pydantic` | REST layer |

The **pure core** (everything above `oddalerts_client`) has **zero external
dependencies** — it runs and tests on a bare Python 3.10+.

## Run the offline demo (no API token, no installs)

```bash
cd backend
python -m prediction.demo
```

Prints a full prediction (the exact response shape) from synthetic inputs.

## Run the tests

```bash
cd backend
python tests/test_prediction.py        # built-in runner, no pytest needed
# or
python -m pytest tests/test_prediction.py
```

## Run the live API

```bash
cd backend
pip install -r requirements.txt
# set your token (see frontend/.env.example)
export ODDALERTS_TOKEN=your_token_here          # Windows PS: $env:ODDALERTS_TOKEN="..."
uvicorn prediction.api:app --reload --port 8000
```

Then:

```
GET http://localhost:8000/health
GET http://localhost:8000/predictions/upcoming?days=3&limit=10
GET http://localhost:8000/predictions/fixture/{fixture_id}
```

## What the engine outputs

Home/Draw/Away, Double Chance, BTTS, Over/Under 0.5–3.5, Correct Score (top 3),
Expected Goals (λ estimate), Confidence %, `data_flags`, and an `explanation[]`
where every line cites a real OddAlerts field. See the design doc §0 for the
four data gaps (no pre-match xG, no per-match half splits, correct-score/xG
derived) that shape these outputs.

## Production note

Per design §6, deploy this as a **scheduled precompute** (APScheduler/Celery)
that writes predictions to Postgres/Supabase; the app then reads cached rows.
The live endpoints here are the compute path and the dev entry point.
```
