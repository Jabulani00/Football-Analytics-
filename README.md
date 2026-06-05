# Scoreline

**Football Analytics & Betting Intelligence Platform**

Monorepo with a clear split between the **Expo web frontend** and the **Python data/ML backend**. All predictions run client-side (TensorFlow.js); the backend builds SQLite stats, exports JSON bundles, and trains models offline.

---

## Repository layout

```
scoreline/
├── frontend/          # Expo SDK 54 + React Native Web (Vercel deploy target)
├── backend/           # Python: SQLite, stats engine, ML training, JSON export
├── docs/              # Product spec, dev prompt, architecture notes
├── scripts/           # Root helpers (install-backend, run-backend)
├── package.json       # Root npm scripts (orchestration)
├── vercel.json        # Points build → frontend/dist
└── README.md          # This file
```

| Folder | Role |
|--------|------|
| [`frontend/`](frontend/README.md) | Flashscore-style UI, fixtures, stats dashboards, TF.js inference |
| [`backend/`](backend/README.md) | `scoreline.db` (72 tables), export to `frontend/assets/data/` |
| [`docs/`](docs/) | `Football_Analytics_Project_Spec.md`, `SCORELINE_DEV_PROMPT.md`, architecture |

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for data flow and phase roadmap.

---

## Prerequisites

| Tool | Version | Used by |
|------|---------|---------|
| **Node.js** | 20+ (see `.nvmrc`) | Frontend |
| **npm** | 10+ | Frontend |
| **Python** | 3.10+ (optional for TS-only dev) | Backend |

---

## Install everything

From the repository root:

```bash
npm run install:all
```

This runs:

1. `npm install --prefix frontend` — Expo, React, TensorFlow.js, etc.
2. `pip install -r backend/requirements.txt` — NumPy, pandas (TensorFlow optional)

If Python is not installed, frontend still works via `npm run export-data` (TypeScript mock export).

---

## Development

```bash
# Start Expo web dev server
npm run dev
# → http://localhost:8081

# Regenerate bundled JSON (no Python required)
npm run export-data

# Full backend pipeline (requires Python)
npm run db:setup      # create scoreline.db + populate 72 tables
npm run db:export     # export → frontend/assets/data/

# Production static build
npm run build
```

---

## Deploy (Vercel)

Root `vercel.json` builds from `frontend/`:

- **Install:** `cd frontend && npm install`
- **Build:** `cd frontend && npm run build`
- **Output:** `frontend/dist`

Import the repo in [Vercel](https://vercel.com/new) — no env vars required for mock-data builds.

### Routes

| URL | Screen |
|-----|--------|
| `/` | Live scores feed |
| `/league/:id` | League (results, standings, …) |
| `/match/:id` | Match detail + ML predictions |
| `/team/:slug` | Team profile |
| `/analytics` | Analytics hub |

---

## Data flow (summary)

```
backend/scoreline.db  ──export──►  frontend/assets/data/*.json
backend/train_btts.py ──export──►  frontend/assets/models/btts/
                                           │
                                           ▼
                              Expo app (useStats, useModel, useSimilarMatches)
```

During Phase 1 development there are **no live API calls**. Mock fixtures live in `frontend/mock/`; SQLite exports mirror them for training.

---

## Documentation index

| Document | Description |
|----------|-------------|
| [frontend/README.md](frontend/README.md) | UI structure, components, hooks |
| [backend/README.md](backend/README.md) | Python scripts, SQLite schema, ML export |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design & phases |
| [docs/Football_Analytics_Project_Spec.md](docs/Football_Analytics_Project_Spec.md) | Full product requirements |
| [docs/SCORELINE_DEV_PROMPT.md](docs/SCORELINE_DEV_PROMPT.md) | AI/dev context prompt |

---

## Tech stack

- **Frontend:** Expo 54, Expo Router, TypeScript, TensorFlow.js, Vercel static export
- **Backend:** Python 3.10+, SQLite, NumPy/pandas, optional TensorFlow/Keras + tensorflowjs

*CONFIDENTIAL — Scoreline internal project*
