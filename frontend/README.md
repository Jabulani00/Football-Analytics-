# Scoreline Frontend

Expo web app (React Native Web) — Flashscore-style scores UI with embedded betting intelligence and client-side ML predictions.

---

## Structure

```
frontend/
├── app/                    # Expo Router routes
│   ├── (scores)/           # Shell: home, league, match, team
│   └── analytics/          # Analytics hub (outside scores shell)
├── components/             # UI (layout, match, league, stats, analytics)
├── hooks/                  # useStats, useModel, useSimilarMatches
├── mock/                   # Dev fixtures, stats engine, H2H, teams
├── assets/
│   ├── data/               # Exported from backend (or npm run export-data)
│   └── models/btts/        # TF.js scaler / model weights
├── data/assetLoader.ts     # Bundled JSON imports
├── scripts/export-for-expo.ts
├── styles/                 # theme, elevation tokens
└── types/                  # TypeScript types
```

---

## Commands

Run from **repository root** (recommended) or from this folder:

```bash
# From repo root
npm run dev
npm run export-data
npm run build

# From frontend/
npm install
npm run web
npm run export-data
npm run build
```

| Script | Description |
|--------|-------------|
| `npm run web` | Dev server |
| `npm run export-data` | Generate `assets/data/*.json` from mock fixtures |
| `npm run db:setup` | Python: create SQLite DB (calls `../backend/`) |
| `npm run db:export` | Python: export DB → `assets/data/` |
| `npm run build` | export-data + static web export → `dist/` |

---

## Key routes

| Route | Component |
|-------|-----------|
| `/` | `LiveScoresFeed` |
| `/league/[id]` | `LeagueScreen` |
| `/match/[id]` | `MatchScreen` (Summary → predictions + evidence) |
| `/team/[slug]` | `TeamScreen` |
| `/analytics` | `AnalyticsHub` |

---

## Hooks & data

| Hook | Source | Purpose |
|------|--------|---------|
| `useStats` | `assets/data/team_stats.json` + mock fallback | Team/fixture stats |
| `useSimilarMatches` | `assets/data/similar_matches.json` | Vector evidence panel |
| `useModel` | `assets/models/btts/` + TF.js | BTTS / Over 2.5 predictions |

Regenerate assets after backend changes:

```bash
npm run db:export    # from Python SQLite
# or
npm run export-data  # from TypeScript mocks (no Python)
```

---

## Path alias

`@/*` → project root of `frontend/` (see `tsconfig.json`).

---

## Deploy

Production build output: `frontend/dist/`. Root `vercel.json` configures Vercel to build this folder.

See [root README](../README.md) for full monorepo setup.
