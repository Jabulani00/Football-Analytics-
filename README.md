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

## Live data (OddAlerts)

The scores feed, match detail (summary, lineups, H2H, standings), the
Country → League/Cup → standings browser and team fixtures are powered by the
**OddAlerts Football Data API**. The API sends no CORS headers, so web requests
go through a server-side proxy (`frontend/app/oddalerts+api.ts`, served at
`/oddalerts`) that injects the token — the token is never exposed to the browser.
Club logos come from **TheSportsDB** via a second proxy (`/teamlogo`).

### Configure the token

```bash
cp frontend/.env.example frontend/.env
# then edit frontend/.env and set your token
```

| Variable | Where | Purpose |
|----------|-------|---------|
| `ODDALERTS_TOKEN` | server (proxy) | Web requests. **Secret.** Required. |
| `EXPO_PUBLIC_ODDALERTS_TOKEN` | client | Direct calls on native (iOS/Android) dev only |
| `THESPORTSDB_KEY` | server (proxy) | Club logos via `/teamlogo` (optional; defaults to `123`) |
| `EXPO_PUBLIC_THESPORTSDB_KEY` | client | Logo lookups on native (optional) |

> Restart the dev server after editing `.env` or adding an `+api.ts` route — env
> vars and API routes are only read on boot.

### Usage limits

- **OddAlerts:** ~**300 requests/window** per token (`X-RateLimit-Limit: 300`);
  over-limit returns HTTP 429. The app stays well under this with edge caching,
  one-time competition/country caches, paginated caps, 25s live polling and
  request de-duplication.
- **TheSportsDB:** the shared test key `123` is heavily rate-limited (`error
  1015`); when it fails, logos fall back to team initials. Set your own
  `THESPORTSDB_KEY` for reliable badges.

`frontend/.env` is git-ignored. Full details (endpoints, limits, how to avoid
throttling): [`docs/ODDALERTS_INTEGRATION.md`](docs/ODDALERTS_INTEGRATION.md).

---

## Deploy (Vercel)

Root `vercel.json` builds the Expo **server** output from `frontend/`:

- **Install:** `npm install && cd frontend && npm install`
- **Build:** `cd frontend && npm run vercel-build`
- **Static output:** `frontend/dist/client`
- **Serverless function:** `api/index.js` boots the Expo server bundle (`frontend/dist/server`), which serves the `/oddalerts` proxy and SSR routes.

Steps:

1. Push to GitHub and import the repo in [Vercel](https://vercel.com/new).
2. In **Project Settings → Environment Variables**, add `ODDALERTS_TOKEN` (your token) for Production + Preview. Optionally add `THESPORTSDB_KEY` for club logos.
3. Deploy. Vercel picks up `vercel.json` automatically (framework preset: *Other*).

> Without `ODDALERTS_TOKEN`, the proxy returns HTTP 500 and the feed will be empty.
> After adding/changing an env var on Vercel, **redeploy** — vars are injected at build time.

### Routes

| URL | Screen |
|-----|--------|
| `/` | Live scores feed (Live / Results / Fixtures, club/country, men/women) |
| `/match/:id` | Match detail — Summary, Lineups (pitch), H2H, Standings |
| `/team/:slug` | Team's upcoming fixtures |
| `/league/:id` | League view |
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

Live fixtures/results/standings come from the **OddAlerts API** (via the `/oddalerts` proxy). The bundled `assets/data/*.json` (from `mock/` or the backend export) still powers the analytics/stats and ML screens.

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
