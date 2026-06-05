"""Export SQLite tables and fixtures to assets/data/ for the Expo app."""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from paths import ASSETS_DATA_DIR, ASSETS_MODELS_DIR, DB_PATH
from schema import ORDINARY_STATS, all_table_names

# Fixture snapshot (mirrors mock/fixturesData.ts — key fixtures for dev)
FIXTURES_EXPORT = [
    {
        "id": "spl_001",
        "leagueId": "spl",
        "date": "2026-05-21",
        "kickoff": "15:00",
        "status": "FT",
        "homeTeam": {"name": "Celtic", "shortName": "CEL", "score": 3},
        "awayTeam": {"name": "Rangers", "shortName": "RAN", "score": 1},
    },
    {
        "id": "epl_001",
        "leagueId": "epl",
        "date": "2026-05-21",
        "kickoff": "17:30",
        "status": "NS",
        "homeTeam": {"name": "Arsenal", "shortName": "ARS", "score": None},
        "awayTeam": {"name": "Chelsea", "shortName": "CHE", "score": None},
    },
    {
        "id": "epl_002",
        "leagueId": "epl",
        "date": "2026-05-21",
        "kickoff": "20:00",
        "status": "NS",
        "homeTeam": {"name": "Liverpool", "shortName": "LIV", "score": None},
        "awayTeam": {"name": "Manchester City", "shortName": "MCI", "score": None},
    },
]


def export_team_stats(conn: sqlite3.Connection) -> dict:
    cur = conn.cursor()
    payload: dict = {"meta": {"tables": len(all_table_names()), "statsPerTable": len(ORDINARY_STATS)}, "tables": {}}

    for table in all_table_names():
        cur.execute(f"SELECT * FROM {table}")
        cols = [d[0] for d in cur.description]
        rows = []
        for row in cur.fetchall():
            rows.append(dict(zip(cols, row)))
        payload["tables"][table] = rows

    return payload


def default_scaler() -> dict:
    features = [
        "home_btts_pct",
        "home_over25_pct",
        "home_cs_pct",
        "home_ppg",
        "home_avg_goals",
        "away_btts_pct",
        "away_over25_pct",
        "away_cs_pct",
        "away_ppg",
        "away_avg_goals",
    ]
    return {
        "feature_names": features,
        "mean": [55, 52, 35, 1.6, 2.5, 55, 52, 35, 1.6, 2.5],
        "std": [12, 14, 10, 0.4, 0.6, 12, 14, 10, 0.4, 0.6],
        "weights": [0.08, 0.05, -0.03, 0.12, 0.06, 0.08, 0.05, -0.03, 0.12, 0.06],
        "bias": -0.35,
        "market": "btts",
    }


def main() -> None:
    ASSETS_DATA_DIR.mkdir(parents=True, exist_ok=True)
    ASSETS_MODELS_DIR.mkdir(parents=True, exist_ok=True)

    if not DB_PATH.exists():
        raise SystemExit("Run create_db.py and calculate_stats.py first.")

    conn = sqlite3.connect(DB_PATH)

    team_stats = export_team_stats(conn)
    team_stats["meta"]["exported_at"] = datetime.now(timezone.utc).isoformat()

    fixtures = {
        "meta": {"exported_at": datetime.now(timezone.utc).isoformat(), "count": len(FIXTURES_EXPORT)},
        "fixtures": FIXTURES_EXPORT,
    }

    (ASSETS_DATA_DIR / "team_stats.json").write_text(json.dumps(team_stats, indent=2), encoding="utf-8")
    (ASSETS_DATA_DIR / "fixtures.json").write_text(json.dumps(fixtures, indent=2), encoding="utf-8")
    (ASSETS_MODELS_DIR / "scaler.json").write_text(json.dumps(default_scaler(), indent=2), encoding="utf-8")

    conn.close()
    print(f"Exported to {ASSETS_DATA_DIR}")


if __name__ == "__main__":
    main()
