# Scoreline frontend

Expo SDK 54 app (React Native Web). Live scores, league and match screens, and the stat boards all read OddAlerts through the same-origin `/oddalerts` proxy. The full request path, cache rules, and flow diagrams are in the [root README](../README.md).

## Layout

```
frontend/
├── app/                         Expo Router
│   ├── (scores)/                Shell: /, /league/:id, /match/:id, /team/:slug
│   ├── analytics/               Analytics hub
│   ├── sl-stats/                SL-STATS
│   ├── additional-stats/        PPG, series, FT patterns, league averages
│   ├── stats-ordinary/          Scoreline rates, top 200
│   ├── full-time-stats/         Both-halves, HT/FT, half goal lines
│   ├── oddalerts+api.ts         OddAlerts proxy
│   ├── hollywood+api.ts         Hollywoodbets proxy
│   ├── teamlogo+api.ts          TheSportsDB badges
│   └── football+api.ts          API-Football events
├── components/                  Screens, tables, match and league panels
├── hooks/                       Query and effect hooks
├── services/                    API client, cache, stats builder, SL-STATS
├── utils/                       Engines, ranking, compliance colour
├── mock/                        Sample rows for analytics tables
├── scripts/                     Offline tests (`npx tsx`)
└── assets/data/                 Optional JSON from the offline export
```

`@/*` points at this folder.

## Commands

From the repo root, `npm run dev` is the usual start. From this folder:

| Script | What it does |
|--------|----------------|
| `npm run web` | Dev server at http://localhost:8081 |
| `npm test` | Offline checks, no network |
| `npm run export-data` | Write mock JSON into `assets/data/` |
| `npm run build` | Mock export, then `expo export -p web` |

`app.json` sets `web.output` to `server`, so the `+api.ts` routes run in dev and in the exported server bundle.

## Routes

| URL | Screen |
|-----|--------|
| `/` | `LiveScoresFeed` inside `FlashscoreShell` |
| `/league/[id]` | `LeagueScreen` |
| `/match/[id]` | `MatchDetailScreen` |
| `/team/[slug]` | Upcoming fixtures for that club |
| `/analytics` | `AnalyticsHub` |
| `/sl-stats` | `SlStatsScreen` |
| `/additional-stats` | `AdditionalStatsScreen` |
| `/stats-ordinary` | `StatBoardScreen` in ordinary mode |
| `/full-time-stats` | `StatBoardScreen` in full-time mode |

Phone navigation is `components/layout/AppNavMenu.tsx`. Wide screens use the text links in `components/layout/SiteHeader.tsx`.

## Where live numbers come from

| Hook or module | Feed | Used by |
|----------------|------|---------|
| `useLiveFixtures` | `fixtures/live`, `fixtures/upcoming`, `fixtures/between` | Scores |
| `useMatchDetail` | `fixtures/:id` plus related stats | Match |
| `useStandings` / `fetchSeasonStandings` | `stats/season/:id` | League table and measured timing |
| `useLiveStatsTables` | `fixtures/between`, then `buildStatsTables` | One competition on the stat pages |
| `useSlStats` | Competitions, upcoming, and season results | SL-STATS, and the all-leagues board |
| `useCatalogueTables` | The two paths above | Ordinary and Full-time only |
| `services/statsBuilder.ts` | Finished scores already fetched | 72 stat tables |
| `useStats`, `useModel`, `useSimilarMatches` | `assets/data` and `assets/models` | Offline analytics and the BTTS model |

Copy `.env.example` to `.env` and set `ODDALERTS_TOKEN` before expecting a live feed. Restart Expo after changing it.
