# Scoreline Backend

Python data and ML pipeline — **no HTTP server**. SQLite is the source of truth during development; exports are written into `frontend/assets/` for the Expo app to bundle.

---

## Structure

```
backend/
├── paths.py              # Shared paths (DB, frontend assets)
├── schema.py             # 72-table schema, 34 stats + signals
├── create_db.py          # Create scoreline.db + seed teams
├── calculate_stats.py    # Populate all tables with mock stats
├── export_for_expo.py    # SQLite → frontend/assets/data/
├── build_vectors.py      # Similar-match evidence JSON
├── train_btts.py         # Train BTTS model → TF.js (optional)
└── requirements.txt
```

**Database file:** `backend/scoreline.db` (gitignored — regenerate locally)

**Export target:** `frontend/assets/data/` and `frontend/assets/models/btts/`

---

## Setup

```bash
# From repo root
npm run install:backend

# Or manually
cd backend
python -m pip install -r requirements.txt
```

### Optional ML training deps

```bash
pip install tensorflow tensorflowjs
```

---

## Commands

From **repository root**:

```bash
npm run db:setup      # create_db.py + calculate_stats.py
npm run db:export     # export_for_expo.py + build_vectors.py
npm run train:btts    # train_btts.py (needs TensorFlow)
```

From **backend/** directly:

```bash
python create_db.py
python calculate_stats.py
python export_for_expo.py
python build_vectors.py
python train_btts.py
```

---

## SQLite schema

| Group | Count | Description |
|-------|-------|-------------|
| Base tables | 45 | 5 stat families × FT/HT/2H × Overall/Home/Away |
| Last-N tables | 27 | last10 / last8 / last6 × period × split |

Each table row: `team_name`, `league_id`, `season`, **34 stat columns**, **34 `_signal` columns** (green ≥65%, yellow 45–64%, red <45%).

---

## Export files

| File | Written to |
|------|------------|
| `team_stats.json` | `frontend/assets/data/` |
| `fixtures.json` | `frontend/assets/data/` |
| `similar_matches.json` | `frontend/assets/data/` |
| `scaler.json` | `frontend/assets/models/btts/` |
| TF.js model | `frontend/assets/models/btts/` (after training) |

After export, rebuild or refresh the frontend:

```bash
cd ../frontend && npm run web
```

---

## Phase status

| Phase | Backend work |
|-------|----------------|
| 1 | Scraping scripts, seed data, SQLite ✅ (mock) |
| 2 | 72 tables populated, colour signals ✅ |
| 3 | Streams & groupings (pending) |
| 4 | Strategy engine (pending) |
| 5 | Bet-slip data feeds (pending) |

See [docs/SCORELINE_DEV_PROMPT.md](../docs/SCORELINE_DEV_PROMPT.md) and [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md).

---

## Rules

1. **No external API calls** until explicitly instructed.
2. Do not hand-edit JSON in `frontend/assets/data/` — export from SQLite.
3. Keep the 72-table schema; flag any renames with the team.
