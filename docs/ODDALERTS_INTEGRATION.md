# OddAlerts API Integration

This document explains how the Scoreline app connects to the **OddAlerts Football
Data API**, how matches are displayed Flashscore-style (results, live, upcoming,
split by men/women and clubs/countries), the pros & cons of the approach, the
relevant file structure, and how to run the project.

- API docs: <https://documenter.getpostman.com/view/17615275/2s935uG1WF>
- Base URL: `https://data.oddalerts.com/api`
- Auth: `?api_token=YOUR_TOKEN` query parameter

> **The app uses live API data only — there is no dummy/mock data in the scores
> experience.** The feed, the competition sidebar, the live counts and the header
> date are all driven by the OddAlerts API.

---

## 1. What's shown (current scope)

A Flashscore-style feed grouped by **country → competition**, with two filter
dimensions on top of the status tabs:

**Status tabs** (`SiteHeader`):

| Tab           | Source endpoint                              | Shows                                  |
| ------------- | -------------------------------------------- | -------------------------------------- |
| **Results** (default) | `GET /fixtures/between?from=&to=`     | Finished games over a 1–7 day window   |
| **LIVE**      | `GET /fixtures/live`                          | In-play + half-time (auto-refresh 25s) |
| **Scheduled** | `GET /fixtures/upcoming?days=2`               | Upcoming (not-started) fixtures        |
| **All**       | `live` + `upcoming?days=1`                    | Live/finished now, then soonest upcoming |

**Section toggles** (applied to every tab):

- **Clubs / Countries** — club football vs national-team (international) competitions.
- **Men / Women** — men's vs women's competitions.

Tapping a competition in the left **sidebar** filters the feed to that single
league/tournament; "clear" returns to the full list.

### Results day-window

The Results tab has a `Today / 2 / 4 / 7 days` selector that controls the
`from`/`to` window passed to `/fixtures/between`.

---

## 2. Men/Women & Clubs/Countries classification

The OddAlerts API has **no gender or national-team field**, so the app infers
them in `services/oddAlerts.ts` (`detectGender`, `detectKind`):

- **Women** — competition name matches `women|feminin|frauen|WSL|NWSL|WPSL|…`,
  **or** either team name uses OddAlerts' `" W"` suffix convention (e.g.
  `Linfield W`).
- **Countries (national teams)** — competition name matches tournament patterns
  (`World Cup`, `Nations League`, `Euro`, `Copa América`, `AFCON`, `qualification`,
  `International Friendlies`, …) and does **not** contain `Club`. Everything else
  is **Clubs**.

These are heuristics (not API truth) and can be tuned in the two regexes if an
edge case is mislabelled.

---

## 3. How the connection works (architecture)

The OddAlerts API sends **no CORS headers**, so a browser cannot call it
directly. The app uses two transports:

- **Web → an Expo Router API route** at `/oddalerts` (`app/oddalerts+api.ts`).
  This server-side route injects the token, relays the request and adds CORS.
  It is served automatically by `expo start` **in local development** and by the
  exported server bundle in production — so **web works with no extra setup**.
- **Native (iOS/Android) → direct** calls to `data.oddalerts.com` with the token
  as a query param (native is not subject to browser CORS).

```
   Web browser                         Native app
        │  fetch('/oddalerts?path=…')       │  fetch('https://data.oddalerts.com/api/…?api_token=…')
        ▼                                   ▼
  Expo API route (server)            (direct, no proxy)
   app/oddalerts+api.ts ──────────────────────────────► data.oddalerts.com/api
   (token injected server-side)
```

Because web uses server output (`app.json` → `web.output: "server"`), the proxy
runs both locally and in production. For Vercel, `api/index.js` boots the Expo
server bundle via `@expo/server/adapter/vercel`.

### Request flow

1. `SiteHeader` sets the active tab + Clubs/Countries + Men/Women in
   `ScoresFilterContext`.
2. `useLiveFixtures(view, { resultsDays })` calls the right endpoint(s), maps raw
   fixtures (`mapFixture`, which also computes `gender` + `kind`), and polls every
   25s for live-bearing views.
3. `LiveScoresFeed` filters by gender/kind, groups with `groupByCompetition`,
   publishes the competition list to the context (for the sidebar), and applies
   the selected-competition filter.
4. `CompetitionHeader` + `ScoresMatchRow` render each group.

### Environment variables

| Variable                          | Where           | Purpose                                          |
| --------------------------------- | --------------- | ------------------------------------------------ |
| `ODDALERTS_TOKEN`                 | server (Vercel) | Token used by the `/oddalerts` route. Set in prod. |
| `EXPO_PUBLIC_ODDALERTS_TOKEN`     | client          | Token for direct native calls (optional override) |
| `EXPO_PUBLIC_ODDALERTS_PROXY`     | client          | Proxy URL override (default `/oddalerts`)          |
| `EXPO_PUBLIC_ODDALERTS_BASE_URL`  | client          | Direct base URL override                           |

The token also has a hardcoded development fallback in `app/oddalerts+api.ts` and
`services/oddAlerts.ts` so the app runs out of the box.

---

## 4. Pros & Cons

### Pros

- **Web works in dev with one command** (`npm run web`) — the Expo API route is
  served by the dev server; no separate proxy process or `vercel dev` needed.
- **Token stays server-side on web**; the browser only talks to `/oddalerts`.
- **No CORS issues** — the route adds the headers the API omits.
- **Native works directly**, no proxy required.
- **Single source of truth** — one `services/oddAlerts.ts` boundary and one proxy
  route; adding endpoints touches one or two files.
- **Rate-limit friendly** — the route sets a 10s edge cache; the API allows
  300 req/window.
- **No dummy data** — feed, sidebar, counts and date are all live.

### Cons / trade-offs

- **Web is now server output** (`web.output: "server"`) instead of a pure static
  SPA. Production must run the Expo server bundle (Vercel config provided).
- **Native ships a fallback token** for convenience; rotate / proxy it for a
  public release.
- **Gender / club-vs-country are heuristic** (no API field) — rare mislabels are
  possible and tuned via regex.
- **No season-list endpoint** — full-season results are assembled from
  `/fixtures/between` over a window, not one call.
- **Result volume is paginated** (250/page; client fetches up to 3 pages).
- **Match detail / older mock pages** (`/league/[id]`, `/match/[id]`, analytics)
  are not yet wired to the API; the main scores flow no longer links to them.

---

## 5. Key endpoints (verified)

```
GET /api/fixtures/live                          # in-play + HT + recently finished
GET /api/fixtures/upcoming?days=N               # scheduled (paginated)
GET /api/fixtures/between?from=UNIX&to=UNIX      # results / any window (paginated)
        &competitions=ID                         #   optional competition filter
GET /api/fixtures/:id?include=probability,stats  # single fixture detail
GET /api/countries                               # all countries
GET /api/competitions?country_ids=1&include=seasons   # leagues + current/last seasons
GET /api/bookmakers | /api/value/upcoming | /api/trends/:TREND | /api/odds/latest
```

`from`/`to` are **unix seconds**. `competitions` accepts comma-separated IDs.
Live statuses seen: `NS`, `LIVE`, `1H`, `2H`, `HT`, `FT`, `AET`, `FT_PEN`,
`AWARDED`, `POSTPONED`, `CANCELLED`, `AWAITING_UPDATES`.

---

## 6. File structure (integration-relevant)

```
Odds-APP/
├─ api/
│  └─ index.js                     # Vercel entry → boots Expo server bundle
├─ frontend/
│  ├─ app/
│  │  ├─ oddalerts+api.ts          # Expo API route = the OddAlerts proxy
│  │  └─ (scores)/
│  │     ├─ _layout.tsx            # FlashscoreShell wrapper
│  │     └─ index.tsx              # renders <LiveScoresFeed />
│  ├─ components/
│  │  ├─ home/LiveScoresFeed.tsx   # feed: filters, results window, grouping
│  │  ├─ scores/
│  │  │  ├─ CompetitionHeader.tsx  # country/league group header
│  │  │  └─ ScoresMatchRow.tsx     # one match row (live min / FT / kickoff)
│  │  └─ layout/
│  │     ├─ SiteHeader.tsx         # status tabs + Clubs/Countries + Men/Women
│  │     ├─ LeagueSidebar.tsx      # API-driven competition list (filters feed)
│  │     └─ ScoresFilterContext.tsx# shared filter + competition state
│  ├─ hooks/useLiveFixtures.ts     # fetch + poll + map per view
│  ├─ services/oddAlerts.ts        # API client, types, status & gender/kind logic
│  └─ utils/countryFlags.ts        # country name → emoji flag
├─ docs/ODDALERTS_INTEGRATION.md   # (this file)
├─ app.json                        # web.output: "server" (frontend)
└─ vercel.json                     # Expo server hosting config
```

---

## 7. How to run the project

### Prerequisites

- Node.js **≥ 20**, npm
- (optional) Expo Go app, or an iOS/Android simulator

### Install

```bash
cd frontend
npm install
```

### Web (works out of the box now)

```bash
cd frontend
npm run web        # http://localhost:8081 — the /oddalerts proxy is served too
```

### Native (phone / simulator)

```bash
cd frontend
npm run start      # press i / a, or scan the QR with Expo Go
# or: npm run android   |   npm run ios
```

### Deploy to Vercel

1. Push the repo. `vercel.json` builds `frontend` (`expo export -p web`) producing
   `frontend/dist/client` (static assets) + `frontend/dist/server` (server bundle).
2. `api/index.js` serves the app + the `/oddalerts` route via
   `@expo/server/adapter/vercel`.
3. Add the env var **`ODDALERTS_TOKEN`** in the Vercel project settings.

### Quick API sanity check (optional)

```bash
curl "https://data.oddalerts.com/api/fixtures/live?api_token=YOUR_TOKEN"
curl "https://data.oddalerts.com/api/fixtures/between?from=1781000000&to=1781600000&api_token=YOUR_TOKEN"
```

---

## 8. Next step: full league/season browser

The data is exposed; only UI remains:

1. `GET /api/countries` → choose a country.
2. `GET /api/competitions?country_ids=<id>&include=seasons` → each competition has
   `current_season` + a `seasons[]` list (`season_id`, `season_name`, `played`,
   `progress`).
3. `GET /api/fixtures/between?competitions=<id>&from=<season_start>&to=<now>` →
   that competition's results, grouped by matchday/date.
