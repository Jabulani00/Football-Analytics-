"""Train BTTS model from scoreline.db and export TF.js assets."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

import numpy as np

from paths import ASSETS_MODELS_DIR, DB_PATH

MODEL_DIR = ASSETS_MODELS_DIR

FEATURE_MAP = {
    "home_btts_pct": ("ordinary_ft_overall", "btts_yes", "home"),
    "home_over25_pct": ("ordinary_ft_overall", "over25", "home"),
    "home_cs_pct": ("ordinary_ft_overall", "cs_pct", "home"),
    "home_avg_goals": ("ordinary_ft_overall", "avg_goals", "home"),
    "away_btts_pct": ("ordinary_ft_overall", "btts_yes", "away"),
    "away_over25_pct": ("ordinary_ft_overall", "over25", "away"),
    "away_cs_pct": ("ordinary_ft_overall", "cs_pct", "away"),
    "away_avg_goals": ("ordinary_ft_overall", "avg_goals", "away"),
}


def fetch_team_stat(conn: sqlite3.Connection, table: str, team: str, league: str, col: str) -> float:
    cur = conn.cursor()
    cur.execute(
        f"SELECT {col} FROM {table} WHERE team_name = ? AND league_id = ? LIMIT 1;",
        (team, league),
    )
    row = cur.fetchone()
    return float(row[0]) if row else 50.0


def build_training_rows(conn: sqlite3.Connection) -> tuple[np.ndarray, np.ndarray]:
    """Synthetic labels: BTTS likely when both teams have high btts_yes and over25."""
    cur = conn.cursor()
    cur.execute("SELECT DISTINCT team_name, league_id FROM teams;")
    teams = cur.fetchall()

    X_rows: list[list[float]] = []
    y_rows: list[float] = []

    for i, (home, league) in enumerate(teams):
        for j, (away, _) in enumerate(teams):
            if i == j:
                continue
            feats = []
            for _, (table, col, side) in FEATURE_MAP.items():
                team = home if side == "home" else away
                feats.append(fetch_team_stat(conn, table, team, league, col))
            # home_ppg proxy from w_pct
            feats.insert(3, fetch_team_stat(conn, "ppg_ft_overall", home, league, "w_pct") / 33)
            feats.insert(8, fetch_team_stat(conn, "ppg_ft_overall", away, league, "w_pct") / 33)
            prob = 1 / (1 + np.exp(-(0.04 * (feats[0] + feats[5]) + 0.03 * (feats[1] + feats[6]) - 5)))
            X_rows.append(feats)
            y_rows.append(prob)

    return np.array(X_rows, dtype=np.float32), np.array(y_rows, dtype=np.float32)


def export_scaler(X: np.ndarray, model) -> None:
    mean = X.mean(axis=0).tolist()
    std = X.std(axis=0).tolist()
    std = [s if s > 1e-6 else 1.0 for s in std]

    weights = model.layers[0].get_weights()[0].flatten().tolist()
    bias = float(model.layers[0].get_weights()[1][0])

    scaler = {
        "feature_names": list(FEATURE_MAP.keys()),
        "mean": mean,
        "std": std,
        "weights": weights,
        "bias": bias,
        "market": "btts",
    }
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    (MODEL_DIR / "scaler.json").write_text(json.dumps(scaler, indent=2), encoding="utf-8")


def main() -> None:
    try:
        import tensorflow as tf
    except ImportError as exc:
        raise SystemExit("Install tensorflow: pip install tensorflow") from exc

    if not DB_PATH.exists():
        raise SystemExit("Run create_db.py and calculate_stats.py first.")

    conn = sqlite3.connect(DB_PATH)
    X, y = build_training_rows(conn)
    conn.close()

    n_features = X.shape[1]
    model = tf.keras.Sequential(
        [
            tf.keras.layers.Dense(32, activation="relu", input_shape=(n_features,)),
            tf.keras.layers.Dropout(0.2),
            tf.keras.layers.Dense(16, activation="relu"),
            tf.keras.layers.Dense(1, activation="sigmoid"),
        ]
    )
    model.compile(optimizer="adam", loss="binary_crossentropy", metrics=["accuracy"])
    model.fit(X, y, epochs=25, batch_size=32, verbose=0)

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    model.save(MODEL_DIR / "keras_model", save_format="tf")

    try:
        import tensorflowjs as tfjs

        tfjs.converters.save_keras_model(model, str(MODEL_DIR))
        print(f"Exported TF.js model to {MODEL_DIR}")
    except ImportError:
        print("tensorflowjs not installed — exported scaler only via export_for_expo.py")

    export_scaler(X, model)
    print("Training complete.")


if __name__ == "__main__":
    main()
