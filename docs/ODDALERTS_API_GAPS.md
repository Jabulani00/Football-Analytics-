# Data NOT Available on the OddAlerts API

What the **current** Scoreline data source (`https://data.oddalerts.com/api`)
does **not** return — verified by live probing and Postman catalogue review
(June 2026).

Use this when scoping features, quoting add-ons, or explaining why some
Flashscore-style screens need a **second data source** or must be **derived /
omitted**.

Related docs:

- [ODDALERTS_API_DATA_CATALOG.md](./ODDALERTS_API_DATA_CATALOG.md) — everything
  the API **does** provide
- [ODDALERTS_INTEGRATION.md](./ODDALERTS_INTEGRATION.md) — how the app calls the API

---

## 1. Quick summary

| Area | On OddAlerts? | What we do instead |
| ---- | ------------- | ------------------- |
| Goal scorer names | **No** | Optional **API-Football** (`API_FOOTBALL_KEY`) |
| Goal exact minute | **No** | API-Football events, or 15‑min buckets (see below) |
| Assists | **No** | API-Football |
| Cards / subs by minute & player | **No** | Not shown (only aggregate card counts in `stats`) |
| Match incident timeline | **No** | Goals timeline built from API-Football + OddAlerts buckets |
| Confirmed starting XI | **No** | Full **squad** from `GET /players/fixture/:id` (not matchday XI) |
| Live stats by half | **No** | Full-match `stats` only; HT score from `ht_score`; 2H derived |
| World Cup group labels (A–L) | **No** | Client-side grouping from fixtures + standings |
| Commentary / VAR / injuries feed | **No** | Not in API |
| Bookmaker live in-play odds stream | **Partial** | Pre-match `odds` on fixture; `odds/latest` exists, not full live ladder |

---

## 2. Match events (Flashscore “Summary” incidents)

These are **not** available on `GET /fixtures/:id`, regardless of `include`:

| Tried `include` (no effect) | Expected Flashscore data |
| ----------------------------- | ------------------------ |
| `events`, `goals`, `scorers` | Goal minute + player + assist |
| `cards`, `bookings` | Yellow/red by minute + player |
| `substitutions`, `subs` | Sub on/off + minute |
| `timeline`, `incidents`, `commentary` | Full incident feed |
| `lineups` | Confirmed XI with bench order |
| `live` | Extra live incident block |

**Valid includes** on fixture detail: `probability`, `stats`, `odds`, `h2h`,
`referee` only.

There is **no** dedicated endpoint such as `fixtures/:id/events` or
`goal_timing/fixture/:id` in the published API.

### What the app shows today

| UI element | Source |
| ---------- | ------ |
| Scorer name + exact minute | **API-Football** (`fixtures/events`) when key configured |
| Running score per goal | Computed in app from API-Football goals |
| Halftime divider | `ht_score` on OddAlerts fixture |
| Goals by 15‑min period | OddAlerts `GET /stats/fixture/:id?include_frozen=true&include=goal_timing` |
| Period-only “Goal” (no name) | OddAlerts buckets when API-Football unavailable |

---

## 3. Goal timing (`stats/fixture`) — limits

OddAlerts exposes **team-level goal timing buckets**, not a per-goal event list.

| Field | What it actually is | What it is **not** |
| ----- | ------------------- | ------------------ |
| `goal_timing` | Count of goals in 15‑min windows (`m0_15` … `m75_90`) | Minute-by-minute goal list |
| `goal_timing_for` / `goal_timing_against` | Same buckets for goals scored / conceded | Per-scorer breakdown |
| `goal_timings` (in `coverage`) | **Coverage flag** (% of matches with timing data) | Array of `{ minute, player }` |
| `first_goal_time` | Season-style aggregate (often not a single match minute) | First goal minute for this match |
| Frozen rows (`fixture_id` set) | Sometimes match-specific buckets | Unreliable on all comps; big tournaments often have **no** frozen row |

**Probed and rejected:**

- `include=goal_timing` on `fixtures/:id` → no extra fields
- `goal_timing/fixture/:id`, `fixtures/:id/goal_timing` → not in API
- Per-match arrays with `minute` / `player` keys → **never returned**

The app only shows period buckets when frozen stats **pass validation**
(bucket totals match the match score). When validation fails (common on World Cup
and other big comps where frozen rows carry season aggregates), the app **falls
back to score-based period estimates** using `ht_score` and full-time goals.

---

## 4. Player & lineup data

| Data | OddAlerts | Notes |
| ---- | --------- | ----- |
| Full squad (all registered players) | Yes — `GET /players/fixture/:id` | Paginated roster by position |
| Confirmed starting 11 | **No** | Formations (`home_formation`) may exist; who started does not |
| Bench / subs used | **No** | |
| Shirt numbers on pitch for this match | Partial | From squad list, not match-specific selection |
| Missing / injured / suspended players | **No** | |
| Player photos | **No** | App uses TheSportsDB for club badges only |
| Player season stats in this match | **No** on fixture | Season aggregates elsewhere in stats endpoints |

---

## 5. Match statistics — granularity gaps

`stats` on fixture detail is **full match only** (home/away pairs).

| Available | Not available |
| --------- | ------------- |
| Possession, shots, xG, corners, fouls, cards (totals) | Same stats **split by 1st / 2nd half** for this match |
| `ht_score` string (e.g. `1-0`) | HT possession, HT shots, etc. on fixture |
| Pressure, attacks, dangerous attacks | Pass maps, heatmaps, shot locations |
| Aggregate `cards` total | Which player was booked |

**Derived in app:** second-half score = full-time goals minus half-time goals
when `ht_score` parses correctly.

Season standings (`GET /stats/season/:seasonId`) include **team-season** 1H/2H
goal splits — that is **not** the same as live half-time stats for one match.

---

## 6. Competitions, cups & tables

| Data | OddAlerts | Notes |
| ---- | --------- | ----- |
| League standings | Yes — per `season_id` | Home/away points, zones |
| Cup knockout bracket tree | **No** | Cup results are fixtures, not a bracket object |
| World Cup / Euro **group name** (A, B, C…) | **No** | App infers groups from fixture clustering |
| Promotion / relegation play-off slots | **No** explicit | Zones are client-defined |
| `competitions?country_ids=` filter | **Ignored** | Must fetch all competitions, filter client-side |

---

## 7. Odds & betting

| Data | OddAlerts | Notes |
| ---- | --------- | ----- |
| Pre-match odds (many markets) | Yes — `odds` on fixture | `ft_result`, totals, corners, AH, etc. |
| Model probabilities | Yes — `probability` | Percentages, not bookmaker prices |
| `value/upcoming` | Yes | Multi-bookmaker movement on selected markets |
| Live in-play odds updating every second | **Not on fixture detail** | `odds/latest` is a separate feed |
| Hollywoodbets / local book APIs | **No** | Out of scope for OddAlerts |
| Bet placement | **No** | |

---

## 8. Media & metadata

| Data | On API? |
| ---- | ------- |
| Match highlights video URL | **No** |
| Live text commentary | **No** |
| Attendance (sometimes on other providers) | **Not** on standard fixture object |
| Referee name | Yes — with `include=referee` |
| Venue | Often on fixture `venue` |
| Weather | **No** |

---

## 9. Head-to-head gaps

`h2h[]` on fixture detail is strong for **past results** but still lacks:

- Goal scorers in those historical matches
- Incident timelines for past games
- xG or full stat sheets (only optional mini: possession, corners, cards)

---

## 10. Flashscore feature comparison

| Flashscore Summary | OddAlerts alone | Scoreline today |
| ------------------ | --------------- | --------------- |
| Goal scorer + minute | No | API-Football |
| Assist on goal | No | API-Football |
| Running score at each goal | No | App computes from API-Football |
| Yellow / red cards timeline | No | Not shown |
| Substitutions timeline | No | Not shown |
| “1st half / 2nd half” incident blocks | No | HT label + derived 2H score |
| Confirmed lineups | No | Squad pitch view only |
| Live match stats by half | No | Full-match stats only |
| Group tables A–L (World Cup) | No | Client-computed groups |

---

## 11. Secondary sources used in the app

| Provider | Env variable | Used for |
| -------- | ------------ | -------- |
| **API-Football** (api-sports.io) | `API_FOOTBALL_KEY` / `EXPO_PUBLIC_API_FOOTBALL_KEY` | Goal scorers, minutes, assists |
| **TheSportsDB** | `THESPORTSDB_KEY` | Club badge images (not player photos) |

Without API-Football, the **Goals** panel on match Summary can still show
**15-minute period buckets** from OddAlerts when frozen stats validate — but
**not player names**.

---

## 12. Optional add-ons (from project quotation)

Items that **require data outside OddAlerts** are listed as separate scope in
[QUOTATION_R75000.md](./QUOTATION_R75000.md) Section 4:

- Flashscore / Sofascore / Footy Stats scrapers
- Full transfers & player profiles
- Hollywoodbets integration
- ML models trained on richer historical features

---

## 13. Verification

Probe scripts in `frontend/scripts/`:

| Script | Purpose |
| ------ | ------- |
| `probe-api.mjs` | General endpoint discovery |
| `probe-goals.mjs`, `probe-goals2.mjs`, `probe-goals3.mjs` | Goal / event includes |
| `probe-goal-timing.mjs`, `probe-goal-timing2.mjs` | `stats/fixture` goal_timing |
| `timing-dump.json` | Sample frozen timing response |

Re-run with `ODDALERTS_TOKEN` in `frontend/.env` after API changes.
