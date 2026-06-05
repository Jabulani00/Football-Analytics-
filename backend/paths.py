"""Shared paths for the Scoreline backend (Python data/ML pipeline)."""

from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_ROOT.parent
FRONTEND_ROOT = PROJECT_ROOT / "frontend"

DB_PATH = BACKEND_ROOT / "scoreline.db"
ASSETS_DATA_DIR = FRONTEND_ROOT / "assets" / "data"
ASSETS_MODELS_DIR = FRONTEND_ROOT / "assets" / "models" / "btts"
