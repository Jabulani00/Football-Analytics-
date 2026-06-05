"""Build similar-match evidence JSON (ChromaDB-style output, pre-exported for Expo)."""

from __future__ import annotations

import json
import math
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from paths import ASSETS_DATA_DIR, DB_PATH

OUT_PATH = ASSETS_DATA_DIR / "similar_matches.json"

HISTORICAL_MATCHES = [
    {"id": "hist_001", "home": "Man City", "away": "Liverpool", "score": "2-1", "btts": True, "over25": True,
     "vector": [62, 58, 32, 2.1, 2.8, 60, 55, 28, 1.9, 2.6]},
    {"id": "hist_002", "home": "Arsenal", "away": "Chelsea", "score": "1-1", "btts": True, "over25": False,
     "vector": [58, 48, 38, 2.0, 2.2, 56, 50, 30, 1.8, 2.3]},
    {"id": "hist_003", "home": "Bayern Munich", "away": "Dortmund", "score": "3-2", "btts": True, "over25": True,
     "vector": [65, 62, 25, 2.3, 3.1, 63, 58, 22, 2.0, 2.9]},
    {"id": "hist_004", "home": "Real Madrid", "away": "Barcelona", "score": "2-0", "btts": False, "over25": False,
     "vector": [55, 45, 42, 2.2, 2.4, 54, 48, 35, 2.1, 2.5]},
    {"id": "hist_005", "home": "Celtic", "away": "Rangers", "score": "2-2", "btts": True, "over25": True,
     "vector": [60, 52, 30, 1.9, 2.7, 58, 54, 32, 1.7, 2.6]},
    {"id": "hist_006", "home": "PSG", "away": "Monaco", "score": "1-0", "btts": False, "over25": False,
     "vector": [52, 40, 45, 2.0, 2.0, 50, 46, 38, 1.6, 2.1]},
    {"id": "hist_007", "home": "Inter Milan", "away": "Napoli", "score": "3-1", "btts": True, "over25": True,
     "vector": [57, 55, 33, 2.1, 2.9, 59, 53, 29, 1.9, 2.7]},
    {"id": "hist_008", "home": "Newcastle", "away": "Tottenham", "score": "0-0", "btts": False, "over25": False,
     "vector": [48, 42, 40, 1.5, 1.8, 50, 44, 36, 1.7, 2.0]},
    {"id": "hist_009", "home": "Lyon", "away": "Marseille", "score": "2-1", "btts": True, "over25": True,
     "vector": [54, 50, 34, 1.8, 2.5, 53, 49, 31, 1.8, 2.4]},
    {"id": "hist_010", "home": "Ajax", "away": "PSV", "score": "1-2", "btts": True, "over25": True,
     "vector": [61, 56, 28, 2.0, 2.8, 64, 60, 26, 2.2, 3.0]},
]

FIXTURE_VECTORS: dict[str, dict] = {
    "spl_001": {"fixture": "Celtic vs Rangers", "vector": [60, 52, 30, 1.9, 2.7, 58, 54, 32, 1.7, 2.6]},
    "epl_001": {"fixture": "Arsenal vs Chelsea", "vector": [58, 50, 36, 2.1, 2.4, 55, 48, 33, 1.9, 2.2]},
    "epl_002": {"fixture": "Liverpool vs Manchester City", "vector": [62, 56, 30, 2.2, 2.9, 63, 58, 28, 2.1, 2.8]},
}


def cosine_similarity(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(x * x for x in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


def build_fixture_evidence(fixture_id: str, label: str, vector: list[float]) -> dict:
    scored = []
    for m in HISTORICAL_MATCHES:
        sim = cosine_similarity(vector, m["vector"])
        scored.append({**m, "similarity_score": round(sim, 3)})
    scored.sort(key=lambda x: x["similarity_score"], reverse=True)
    top = scored[:10]
    btts_hits = sum(1 for m in top if m["btts"])
    over_hits = sum(1 for m in top if m["over25"])
    n = len(top) or 1
    return {
        "fixture": label,
        "similar_matches": [
            {
                "home": m["home"],
                "away": m["away"],
                "score": m["score"],
                "btts": m["btts"],
                "over25": m["over25"],
                "similarity_score": m["similarity_score"],
            }
            for m in top
        ],
        "btts_hit_rate": round(btts_hits / n, 2),
        "over25_hit_rate": round(over_hits / n, 2),
    }


def main() -> None:
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload: dict = {
        "meta": {"exported_at": datetime.now(timezone.utc).isoformat(), "method": "cosine_similarity"},
        "fixtures": {},
    }

    for fixture_id, info in FIXTURE_VECTORS.items():
        payload["fixtures"][fixture_id] = build_fixture_evidence(
            fixture_id, info["fixture"], info["vector"]
        )

    # Default evidence for any fixture not explicitly mapped
    payload["default"] = build_fixture_evidence(
        "default", "Generic fixture", [55, 52, 35, 1.8, 2.5, 55, 52, 35, 1.8, 2.5]
    )

    OUT_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Wrote {OUT_PATH}")


if __name__ == "__main__":
    main()
