"""Football prediction intelligence layer.

Explainable Dixon-Coles bivariate-Poisson core, blended with the OddAlerts
probability model and (when present) de-vigged market odds.

Design: docs/PREDICTION_ENGINE_DESIGN.md
Data contract: docs/ODDALERTS_API_DATA_CATALOG.md

Import layers:
  - Pure core (stdlib only, no installs needed): poisson, features, ensemble,
    confidence, engine, config, models.
  - I/O layer (needs `httpx`): oddalerts_client.
  - HTTP layer (needs `fastapi`, `pydantic`, `uvicorn`): api, schemas.
"""

from __future__ import annotations

from .engine import predict_match
from .models import PredictionResult

__all__ = ["predict_match", "PredictionResult"]
