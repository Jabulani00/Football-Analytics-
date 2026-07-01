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
| **Fixtures**  | `GET /fixtures/upcoming?days=2`               | Upcoming (not-started) fixtures        |
| **All**       | `live` + `upcoming?days=1`                    | Live/finished now, then soonest upcoming |

**Section toggles** (applied to every tab):

- **Clubs / Countries** — club football vs national-team (international) competitions.
- **Men / Women** — men's vs women's competitions.

On the **Countries** side the left **sidebar** lists the loaded tournaments and
filters the feed to one. On the **Clubs** side the sidebar becomes a
**Country → Leagues/Cups** browser that opens a full standings table (see §8).

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
| `THESPORTSDB_KEY`                 | server (Vercel) | TheSportsDB key for the `/teamlogo` route (default `123`) |
| `EXPO_PUBLIC_THESPORTSDB_KEY`     | client          | TheSportsDB key for direct native logo lookups     |

There is **no hardcoded token fallback** — copy `frontend/.env.example` →
`frontend/.env` and set `ODDALERTS_TOKEN` (and `EXPO_PUBLIC_ODDALERTS_TOKEN` for
native) before running. The logo key defaults to the public test key `123`.

### Setup walkthrough

**1. Local development**

```bash
cd frontend
cp .env.example .env          # Windows: copy .env.example .env
```

Edit `frontend/.env`:

```bash
# OddAlerts (required)
ODDALERTS_TOKEN=your_oddalerts_token            # used by the web proxy (server-side)
EXPO_PUBLIC_ODDALERTS_TOKEN=your_oddalerts_token # used by native (direct calls)

# Club logos via TheSportsDB (optional — defaults to the shared test key "123")
THESPORTSDB_KEY=123
EXPO_PUBLIC_THESPORTSDB_KEY=123
```

Then `npm run web` (or `npm run start` for native). `.env` is git-ignored.

> After changing `.env` **or** adding/editing an `+api.ts` route, **restart**
> the dev server — env vars and API routes are only read on boot, not hot-reloaded.

**2. Production (Vercel)**

In **Project Settings → Environment Variables** add (Production + Preview):

| Name              | Value                | Notes                              |
| ----------------- | -------------------- | ---------------------------------- |
| `ODDALERTS_TOKEN` | your token           | required; used by `/oddalerts`     |
| `THESPORTSDB_KEY` | your key (or `123`)  | optional; used by `/teamlogo`      |

`EXPO_PUBLIC_*` vars are only needed for native builds, not the Vercel web build.
After adding/changing a variable you must **redeploy** — Vercel injects env vars
at build time, so an existing deployment won't pick them up until rebuilt.

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
- **Token must be configured** (no hardcoded fallback) — set it in `.env` / Vercel.
- **Gender / club-vs-country are heuristic** (no API field) — rare mislabels are
  possible and tuned via regex.
- **`/competitions` ignores `country_ids`** — the whole list (~2.4k) is fetched
  once and grouped client-side; points-vs-tier / movement need a season's full
  results over a derived window (paginated, cached, approximate for old seasons).
- **Result volume is paginated** (250/page; client fetches up to 3–8 pages).
- **Lineups are best-effort** — the feed has no confirmed starting XI or events
  (goals/cards/subs), so the pitch is arranged by squad position.
- **Logos are crowd-sourced** (TheSportsDB) — sparse for lower leagues; initials
  fallback covers the gaps.

---

## 5. Key endpoints (verified)

```
GET /api/fixtures/live                          # in-play + HT + recently finished
GET /api/fixtures/upcoming?days=N               # scheduled (paginated)
GET /api/fixtures/between?from=UNIX&to=UNIX      # results / any window (paginated)
        &competitions=ID                         #   optional competition filter
GET /api/fixtures/:id?include=probability,stats,odds,h2h,referee  # single fixture detail
GET /api/countries                               # all countries (id, name, code, slug)
GET /api/competitions?include=seasons            # ALL competitions + season history
GET /api/stats/season/:id                        # season standings (points home/away)
GET /api/bookmakers | /api/value/upcoming | /api/trends/:TREND | /api/odds/latest

# App-local proxy route (not OddAlerts):
GET /teamlogo?name=Arsenal                       # → { badge } from TheSportsDB
```

`from`/`to` are **unix seconds**. `competitions` accepts comma-separated IDs.

Live statuses seen: `NS`, `LIVE`, `1H`, `2H`, `HT`, `FT`, `AET`, `FT_PEN`,
`AWARDED`, `POSTPONED`, `CANCELLED`, `AWAITING_UPDATES`.

> **Note:** the API **ignores `country_ids` on `/competitions`**, so the app
> fetches every page once (`include=seasons`, ~10 pages) and groups by country
> **client-side** (cached in-module in `services/oddAlerts.ts`).

---

> **Full field catalogue:** see [ODDALERTS_API_DATA_CATALOG.md](./ODDALERTS_API_DATA_CATALOG.md)
> for every fixture/H2H/stats/odds/probability key, what is **not** available
> (goal scorers, events), and how each match-detail tab maps to API data.

---

## 6. Match detail (six tabs)

`MatchDetailScreen` loads `GET /fixtures/:id?include=probability,stats,odds,h2h,referee`
plus `GET /players/fixture/:id` (squads) and `GET /stats/season/:seasonId` (table).

| Tab | Data shown |
| --- | ---------- |
| **Summary** | Match info, **pressure monitor** (`stats` pressure + live trace), goals timeline, FT/HT/2H, win-probability snapshot |
| **Stats** | All `stats` home/away pairs (possession, shots, xG, corners, cards, …) |
| **Odds** | Full `probability` model + every `odds` market returned |
| **H2H** | Past meetings with HT, BTTS/O2.5 tags, possession/corners/cards |
| **Lineups** | Squad by position on pitch (formations when available) |
| **Table** | Season standings + position movement from this result |

Half-time score comes from `ht_score`; second half is **derived** (FT − HT). The API
does not expose per-minute goals, assists, cards or substitutions.

### Pressure monitor (match summary)

OddAlerts does **not** ship a dedicated “match summary” endpoint. The **pressure
monitor** is part of fixture `stats` — request any fixture with `include=stats`
(same call as match detail today).

| Stat field | Meaning |
| ---------- | ------- |
| `home_pressure` / `away_pressure` | Current pressure index (% — sums to ~100) |
| `home_pressure_avg` / `away_pressure_avg` | Match-average pressure split |
| `home_possession` / `away_possession` | Often published alongside pressure |

There is **no historical pressure series** in the API. Per **Joe @ OddAlerts**:

> The pressure monitor is available by including `&include=stats` on any fixture
> endpoint. For live tracking, save the values every minute (or however often you like).

The app **polls every 60 seconds** during `LIVE` / `1H` / `2H` / `HT`, appends each
`home_pressure` / `away_pressure` sample client-side, and persists the trace in
**sessionStorage** while you stay on the match page (`useMatchDetail` +
`PressureMonitorPanel` on the **Summary** tab).

Goal and card markers on the chart come from OddAlerts `stats/fixture` frozen rows
(half-time goal splits + `cards_1h_for` / `cards_2h_for`). Exact scorer names are
not in the OddAlerts feed.


---

## 7. Usage limits & how to avoid throttling

### OddAlerts limits (verified from response headers)

Every response carries rate-limit headers:

```
X-RateLimit-Limit: 300
X-RateLimit-Remaining: 299
```

- **Budget:** ~**300 requests per window** per token. When exceeded the API
  returns **HTTP 429** (Too Many Requests).
- Pagination is **250 items/page**; each page is one request.

### TheSportsDB limits (club logos)

- The free shared test key **`123` is aggressively rate-limited** by Cloudflare
  and frequently returns `error code: 1015`. When that happens the `/teamlogo`
  route returns `{ "badge": null }` and the UI falls back to **team initials** —
  nothing breaks, logos just don't show.
- For reliable logos, get your own key and set `THESPORTSDB_KEY`.

### How the app stays under the limits

| Technique | Where | Effect |
| --------- | ----- | ------ |
| **Edge cache** on the proxy | `app/oddalerts+api.ts` (`s-maxage=10, stale-while-revalidate=30`) | Repeated identical requests within ~10s are served from cache, not the API |
| **Competitions fetched once + cached** | `fetchAllCompetitions()` in-module cache | ~10 requests total per session for the whole 2.4k-competition list |
| **Countries cached once** | `fetchCountries()` in-module cache | One request per session |
| **Points-vs-tier cached per season** | `computeTierPoints()` (`tierCache`) | A season's results window is fetched once, then reused |
| **Pagination caps** | `fetchAllFixturesBetween({ maxPages })` | Hard stop at 3–8 pages so one view can't spend the whole budget |
| **Single-flight de-dup** | logo + competitions caches | Concurrent requests for the same key share one in-flight promise |
| **Polling only when needed** | `useLiveFixtures` (25s) | Live views refresh every 25s; non-live views don't poll |
| **`AbortController`** | fetch hooks | Stale requests are cancelled on navigation/filter change |

### If you still hit 429 / 1015

- Increase the proxy `s-maxage` in `app/oddalerts+api.ts` (e.g. `30`–`60`) to
  serve more from the edge cache.
- Raise the live-poll interval above 25s in `useLiveFixtures.ts`.
- Lower `maxPages` for `fetchAllFixturesBetween` (fewer result pages per view).
- Avoid rapid season-switching on the standings panel (each new season can
  trigger a paginated results fetch the first time).
- For logos, use a real `THESPORTSDB_KEY` instead of the shared `123`.

---

## 8. File structure (integration-relevant)

```
Odds-APP/
├─ api/
│  └─ index.js                     # Vercel entry → boots Expo server bundle
├─ frontend/
│  ├─ app/
│  │  ├─ oddalerts+api.ts          # Expo API route = the OddAlerts proxy
│  │  ├─ teamlogo+api.ts           # Expo API route = TheSportsDB logo proxy
│  │  └─ (scores)/
│  │     ├─ _layout.tsx            # FlashscoreShell wrapper
│  │     └─ index.tsx              # LiveScoresFeed OR StandingsPanel (by panel mode)
│  ├─ components/
│  │  ├─ home/LiveScoresFeed.tsx   # feed: filters, results window, grouping
│  │  ├─ scores/
│  │  │  ├─ CompetitionHeader.tsx  # country/league group header
│  │  │  └─ ScoresMatchRow.tsx     # one match row (logo + live min / FT / kickoff)
│  │  ├─ standings/
│  │  │  ├─ StandingsPanel.tsx     # competition header + season selector + table/cup
│  │  │  └─ StandingsTable.tsx     # zoned table, home/away pts, tier breakdown
│  │  ├─ match-detail/MatchDetailScreen.tsx  # summary/stats/odds/H2H/lineups/table
│  │  ├─ utils/matchDetailDisplay.ts         # stat rows, odds labels, HT/2H parsing
│  │  ├─ shared/TeamLogo.tsx       # badge (TheSportsDB) with initials fallback
│  │  └─ layout/
│  │     ├─ SiteHeader.tsx         # status tabs + Clubs/Countries + Men/Women
│  │     ├─ LeagueSidebar.tsx      # Country → Leagues/Cups browser (Clubs) / feed list
│  │     └─ ScoresFilterContext.tsx# shared filter + competition + panel state
│  ├─ hooks/
│  │  ├─ useLiveFixtures.ts        # fetch + poll + map per view
│  │  └─ useStandings.ts           # season standings + points-vs-tier
│  ├─ services/
│  │  ├─ oddAlerts.ts              # API client, types, standings/zone/tier/movement
│  │  └─ logos.ts                  # cached club-badge lookup (proxy/native)
│  └─ utils/countryFlags.ts        # country name → emoji flag
├─ docs/
│  ├─ ODDALERTS_INTEGRATION.md      # (this file)
│  └─ ODDALERTS_API_DATA_CATALOG.md # full API field reference
├─ app.json                        # web.output: "server" (frontend)
└─ vercel.json                     # Expo server hosting config
```

---

## 9. How to run the project

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
3. Add the env var **`ODDALERTS_TOKEN`** in the Vercel project settings (and
   optionally **`THESPORTSDB_KEY`** for higher logo rate limits).

### Quick API sanity check (optional)

```bash
curl "https://data.oddalerts.com/api/fixtures/live?api_token=YOUR_TOKEN"
curl "https://data.oddalerts.com/api/fixtures/between?from=1781000000&to=1781600000&api_token=YOUR_TOKEN"
```

---

## 10. League/season standings browser (Clubs side)

On the **Clubs** segment the left sidebar is a **Country → Leagues/Cups** drill-down:

1. `GET /api/competitions?include=seasons` is fetched once and cached, then grouped
   by country client-side (`clubCompetitionsByCountry`). Each country expands into
   its **Leagues** and **Cups & Tournaments**.
2. Picking a competition opens `StandingsPanel` with a **season selector** (current
   season first, then the full `seasons[]` history).
3. **League** type → `GET /api/stats/season/:id` builds the table
   (`fetchSeasonStandings`):
   - **Three zones** coloured by table thirds — **green** (top), **yellow** (middle),
     **red** (bottom) — via `assignZones`.
   - **Home Pts / Away Pts** columns come straight from `points.home` / `points.away`.
   - Expanding a row shows **points by opponent zone** (vs Top / Mid / Bottom),
     computed from the season's finished results (`computeTierPoints`, cached per
     season — derives the date window from the season name and tallies points each
     team took off top/mid/bottom opponents).
4. **Cup** type has no league table → `StandingsPanel` lists that season's
   fixtures/results grouped by date instead.

### Post-match standings movement

`MatchDetailScreen` (live **or** finished) rebuilds the table *without* the current
result (`standingsMovement`) and shows each team's **current position + arrow**
(▲ up / ▼ down / = same) on the scoreboard and beside the team in the Standings tab.

### Club logos

`TeamLogo` resolves a badge from **TheSportsDB** (`services/logos.ts`, cached) —
through the `/teamlogo` proxy on web, directly on native — and falls back to an
initials monogram (or the country flag for national teams). Badges render in match
rows, the standings table and the match header.

> **Trade-offs:** the competition list (~2.4k items) is fetched once and cached;
> points-vs-tier and old-season movement need a season's full results over a
> derived date window (paginated, cached), so old-season windows are approximate
> from the season name. TheSportsDB is crowd-sourced — great for major clubs,
> sparse for lower leagues, where the initials/flag fallback keeps the UI clean.
