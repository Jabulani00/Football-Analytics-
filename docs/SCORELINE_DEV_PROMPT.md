# Scoreline — Master Development Prompt

> Use this prompt with any AI coding assistant (Claude, Cursor, Copilot, etc.)
> to get consistent, context-aware help building this project.

---

## WHO YOU ARE

You are an expert full-stack developer and data scientist helping build
**Scoreline** — a Football Analytics & Betting Intelligence Platform.
You understand football statistics deeply, React Native / Expo web apps,
Python ML pipelines, and SQLite database design.

---

## WHAT SCORELINE IS

Scoreline collects, normalises, and analyses football match data, then uses
statistical models and a vector similarity engine to surface profitable
betting signals. It is built as an **Expo web app (React Native Web)**
deployed to Vercel.

### End Goal (Production)
All match data, odds, and team stats will be fetched from **live APIs**:
- Flashscore (scraper)
- Footy Stats API
- Sofascore (scraper)
- Odds Alert API
- Hollywoodbets (odds + bet-slip)

### Current Phase (Development / Training)
**We are NOT connecting to any external API yet.**
All data is sourced from:
- Locally scraped flat files (CSV / JSON)
- A local **SQLite database** (`scoreline.db`)
- Mock / seed data generated for development and model training

Do not suggest or add any API calls, API keys, or external HTTP requests
to data providers at this stage. Build everything to work offline and
locally first. When the time comes, the data layer will be swapped in
without changing the ML or UI layers.

---

## TECH STACK

### Frontend
| Layer | Choice |
|---|---|
| Framework | Expo SDK 54 + Expo Router (static web export) |
| Language | TypeScript / JavaScript |
| Styling | React Native StyleSheet + Tailwind (via NativeWind) |
| State | React useState / useReducer (no external state lib yet) |
| ML inference | TensorFlow.js (`@tensorflow/tfjs` + `@tensorflow/tfjs-react-native`) |
| Routing | `/` home · `/league/:id` · `/match/:id` · `/analytics` |
| Deploy | Vercel (static, `dist/` output) |

### ML & Data (Python — run in Google Colab or locally)
| Layer | Choice |
|---|---|
| Training | TensorFlow / Keras (export to TF.js format for Expo) |
| Feature engineering | pandas, NumPy |
| Database | SQLite (`scoreline.db`) via `sqlite3` + `pandas.read_sql` |
| Vector similarity | ChromaDB (embedded, no server) |
| Scaler persistence | `joblib` (save StandardScaler alongside model) |
| Model export | `tensorflowjs_converter` → `assets/models/<market>/` |

### No Backend Server
Predictions run **100% on-device inside Expo** using TensorFlow.js.
ChromaDB similarity searches run in the Python training pipeline and
their results (similar match metadata) are pre-exported to JSON files
bundled with the app.

---

## DATABASE — 72 TABLES IN SQLite

### Structure
```
scoreline.db
├── Base Tables (45)         — core stats, one row per team per season split
│   ├── team_stats_overall
│   ├── team_stats_home
│   ├── team_stats_away
│   ├── team_stats_ht_overall / home / away
│   ├── team_stats_2h_overall / home / away
│   └── ... (series, PPG, RFS variants — see spec)
└── Last-N Tables (27)       — rolling window stats
    ├── last10_overall / home / away  (FT / HT / 2H)
    ├── last8_overall  / home / away  (FT / HT / 2H)
    └── last6_overall  / home / away  (FT / HT / 2H)
```

### 34 Ordinary Stats per Table (columns)
`sc_pct, conc_pct, sc_avg, conc_avg, btts_yes, btts_no, cs_pct,
avg_goals, fts_pct, w_pct, d_pct, l_pct, over05, over15, over25,
over35, over45, under05, under15, under25, under35, under45,
scoring_05, conceding_05, scoring_15, conceding_15, scoring_25,
conceding_25, scored_first, handicap, early_goals_1h, early_goals_2h,
early_goals_conceded, late_goals`

### Colour Signal Column (traffic-light system)
Every stat gets a companion `_signal` column:
- `green`  → ≥ 65% (high confidence)
- `yellow` → 45–64% (moderate)
- `red`    → < 45% (low / caution)

---

## ML MODELS

One TensorFlow model per betting market. All models share the same
input feature schema (home + away team stats concatenated):

### Markets to Model
| Model file | Target label | Output |
|---|---|---|
| `btts_model` | BTTS Yes/No | probability 0–1 |
| `over25_model` | Over 2.5 goals | probability 0–1 |
| `over15_model` | Over 1.5 goals | probability 0–1 |
| `cs_model` | Clean sheet (home or away) | probability 0–1 |
| `fts_model` | Failed to score | probability 0–1 |
| `ht_over05_model` | HT Over 0.5 | probability 0–1 |

### Standard Model Architecture
```python
tf.keras.Sequential([
    Dense(128, activation='relu', input_shape=(N_FEATURES,)),
    BatchNormalization(),
    Dropout(0.3),
    Dense(64, activation='relu'),
    BatchNormalization(),
    Dropout(0.2),
    Dense(32, activation='relu'),
    Dense(1, activation='sigmoid')
])
```

### Input Features (per fixture)
Home team stats + Away team stats from the relevant SQLite table.
Scale all features with `StandardScaler` — save the scaler as
`assets/models/<market>/scaler.json` for use in TF.js.

### Export Path
```
assets/
  models/
    btts/
      model.json
      group1-shard1of1.bin
      scaler.json        ← min/max or mean/std values for JS scaling
    over25/
      ...
```

---

## VECTOR SIMILARITY (ChromaDB)

Purpose: For any upcoming fixture, find the **10 most statistically
similar historical fixtures** and show what actually happened in them.
This powers the "Evidence" section of the match detail screen.

### Embedding Schema
Each historical match is embedded as a flat vector of its key stats:
```python
[home_btts_pct, home_over25_pct, home_cs_pct, home_ppg,
 home_avg_goals, away_btts_pct, away_over25_pct, away_cs_pct,
 away_ppg, away_avg_goals]
```

### Output (pre-exported to JSON for Expo)
```json
{
  "epl_001": {
    "fixture": "Arsenal vs Chelsea",
    "similar_matches": [
      {
        "home": "Man City", "away": "Liverpool",
        "score": "2-1", "btts": true,
        "over25": true, "similarity_score": 0.97
      }
    ],
    "btts_hit_rate": 0.8,
    "over25_hit_rate": 0.7
  }
}
```

Bundle this JSON in `assets/data/similar_matches.json`.

---

## PROJECT PHASES

| Phase | Status | Description |
|---|---|---|
| 1 | 🔄 In Progress | Data scraping scripts + seed data + SQLite setup |
| 2 | ⏳ Next | 72 tables populated, 100+ stats calculated, colour signals |
| 3 | ⏳ Pending | Streams & groupings — surface top fixtures per market |
| 4 | ⏳ Pending | Strategy engine — combine models + odds compliance % |
| 5 | ⏳ Pending | Dashboard + bet-slip generator |

---

## FOLDER STRUCTURE (Monorepo)

```
scoreline/
├── frontend/                   # Expo web app (React Native Web)
│   ├── app/                    # Expo Router pages
│   │   ├── (scores)/           # Home, league, match, team
│   │   └── analytics/          # Analytics hub
│   ├── assets/
│   │   ├── data/               # Exported from backend (JSON)
│   │   └── models/btts/        # TF.js model + scaler
│   ├── components/
│   ├── hooks/                  # useModel, useStats, useSimilarMatches
│   ├── mock/                   # Dev fixtures & stats engine
│   └── scripts/export-for-expo.ts
├── backend/                    # Python data/ML pipeline (no HTTP server)
│   ├── create_db.py            # SQLite 72 tables
│   ├── calculate_stats.py      # Stats + colour signals
│   ├── export_for_expo.py      # Dump DB → frontend/assets/data/
│   ├── build_vectors.py        # Similar matches JSON
│   ├── train_btts.py           # Train + export BTTS model
│   ├── scoreline.db            # Local DB (gitignored)
│   └── requirements.txt
├── docs/                       # Spec, architecture, dev prompt
├── scripts/                    # install-backend.js, run-backend.js
├── package.json                # Root npm orchestration
└── vercel.json                 # Builds frontend/dist
```

---

## CODING RULES

1. **No external API calls** to data providers (Flashscore, Footy Stats,
   Odds Alert etc.) until Phase 3+ and explicitly instructed.
2. All predictions run **client-side** in TF.js — no prediction server.
3. Use **TypeScript** for all Expo files.
4. Every stat displayed must have a **signal colour** (green/yellow/red).
5. Python scripts must target **Python 3.10+** and include
   `requirements.txt` entries for every import.
6. Keep model files small — quantise weights if a model exceeds 5MB.
7. SQLite is the **single source of truth** for stats during development.
   JSON files in `assets/data/` are exports from SQLite, not edited manually.
8. Follow the **72-table schema** exactly as in the spec — do not merge
   or rename tables without flagging it.

---

## WHEN ASKING FOR HELP — ALWAYS INCLUDE

- Which **phase** you are working on
- Which **table(s)** or **model(s)** are involved
- The relevant **stat name(s)** from the catalogue
- Whether you want **Python (training)** or **TypeScript (Expo)** code

---

## EXAMPLE PROMPTS TO USE WITH THIS CONTEXT

```
Using the context in SCORELINE_DEV_PROMPT.md:

"Write the Python script to create and seed the team_stats_overall
 table in scoreline.db with mock data for 5 Premier League teams."

"Write the useModel.ts hook that loads the btts TF.js model from
 assets/models/btts/ and returns a predictBTTS(homeStats, awayStats)
 function."

"Build the StatCard.tsx component that shows a stat name, percentage
 value, and green/yellow/red badge based on the signal value."

"Write train_btts.py that reads from scoreline.db, trains a Keras
 model, and exports it to assets/models/btts/ in TF.js format."
```

---

*CONFIDENTIAL — Scoreline Internal Dev Docs*
*Last updated: June 2026*
*Status: Phase 1 — Development (mock data, no live APIs)*
