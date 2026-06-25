# OddAlerts API — Full Data Catalogue

Complete reference of **what the API returns** (verified June 2026 against
`https://data.oddalerts.com/api`) and how the Scoreline app surfaces it.

- Postman docs: <https://documenter.getpostman.com/view/17615275/2s935uG1WF>
- Integration guide: [ODDALERTS_INTEGRATION.md](./ODDALERTS_INTEGRATION.md)
- Probe scripts: `frontend/scripts/probe-api.mjs`, `probe-api2.mjs`

---

## 1. What the API does **not** provide

These were tested with `include=events|goals|cards|substitutions|lineups|timeline|incidents|commentary` on fixture detail — **no extra fields** are returned:

| Missing data | Notes |
| ------------ | ----- |
| Goal scorers / assists | No per-goal timeline |
| Bookings with minute | Only aggregate card counts in `stats` |
| Substitutions | Not exposed |
| Confirmed starting XI | Use `GET /players/fixture/:id` (full squad by position) |
| Live stats split by half | Only **full-match** stats + `ht_score` string |
| Player-level match events | No Flashscore-style incident feed |

The app derives **2nd-half score** as `FT − HT` when both are known. For **goal
scorers and minutes**, use the optional **API-Football** add-on
(`API_FOOTBALL_KEY` — see `frontend/.env.example` and `services/apiFootball.ts`).

---

## 2. Fixture list endpoints

All return paginated envelopes:

```json
{ "info": { "count", "page", "per_page", "next_page_url" }, "data": [ … ] }
```

### `GET /fixtures/live`

In-play, half-time, and recently finished (~30 fixtures, single page).

### `GET /fixtures/upcoming?days=N`

Scheduled fixtures. Optional: `competitions`, `teams`, `page`.

### `GET /fixtures/between?from=UNIX&to=UNIX`

Results and arbitrary windows. Optional: `competitions`, `page`.

### Base fixture object (`data[]`)

| Field | Type | Description |
| ----- | ---- | ----------- |
| `id` | number | Fixture ID |
| `home_name`, `away_name` | string | Team names |
| `home_id`, `away_id` | number \| null | Team IDs |
| `competition_id` | number | Competition ID |
| `competition_country` | string | Country label |
| `competition_name` | string | League/cup name |
| `competition_type` | string | e.g. league type |
| `competition_predictability` | string \| null | `high` / `medium` / `low` |
| `season` | string | e.g. `2025/2026` |
| `season_id` | number \| null | Season ID for standings |
| `status` | string | `NS`, `LIVE`, `1H`, `2H`, `HT`, `FT`, `AET`, `FT_PEN`, `POSTPONED`, … |
| `home_goals`, `away_goals` | number \| null | Full-time score |
| `ht_score` | string \| null | Half-time, e.g. `1-0` |
| `elapsed` | number \| null | Match minute |
| `elapsed_seconds` | number \| null | Sub-minute precision |
| `time_added` | number \| null | Stoppage time added |
| `home_position`, `away_position` | number \| null | Table position before match |
| `home_played`, `away_played` | number \| null | Games played in season |
| `venue` | string \| null | Stadium |
| `home_formation`, `away_formation` | string \| null | e.g. `4-3-3` |
| `referee_id` | number \| null | Referee ID |
| `unix` | number | Kick-off unix seconds |
| `date` | string | Human date |
| `ko_human` | string | Kick-off time |
| `has_odds` | boolean | Whether odds exist |
| `is_friendly` | boolean | Friendly match |
| `is_cup` | boolean | Cup vs league |

---

## 3. Fixture detail — `GET /fixtures/:id?include=…`

### Valid `include` values (verified)

| Include | Adds |
| ------- | ---- |
| `probability` | Model percentages (see §3.2) |
| `stats` | Live/full-match stats (see §3.3) |
| `odds` | Pre-match odds by market (see §3.4) |
| `h2h` | Head-to-head history (see §3.5) |
| `referee` | `{ id, name, … }` |

Comma-separate: `include=probability,stats,odds,h2h,referee`

**Invalid / no-op includes** (no extra data): `events`, `goals`, `cards`,
`substitutions`, `lineups`, `players`, `timeline`, `incidents`, `commentary`.

### Extra top-level fields on detail

| Field | Type | Description |
| ----- | ---- | ----------- |
| `season_progress` | number \| null | % of season completed |
| `winning_team` | number \| null | Team ID of winner (finished games) |

---

### 3.1 Match summary (UI: **Summary** tab)

Everything above plus:

- **Score breakdown**: FT, HT (`ht_score`), derived 2H
- **Match information**: date, KO, venue, formations, table positions, games played, season progress, predictability, cup/friendly, odds flag, referee
- **Win probability** snapshot: home / draw / away + BTTS, O2.5, home HT lead %

---

### 3.2 Probability model (`probability`)

All values are **percentages** (0–100).

| Group | Keys |
| ----- | ---- |
| Full-time result | `home_win`, `draw`, `away_win` |
| Half-time | `home_win_ht`, `draw_ht` |
| BTTS | `btts`, `btts_no` |
| Total goals FT | `o05`, `o15`, `o25`, `o35`, `o45`, `u05`, `u15`, `u25`, `u35`, `u45` |
| First-half goals | `o0_1h_goals` |
| Team goals | `o05_home_goals`, `o15_home_goals`, `o05_away_goals`, `o15_away_goals` |
| Score first | `home_score_first`, `draw_score_first`, `away_score_first` |
| Double chance | `double_chance_1x`, `double_chance_12`, `double_chance_x2` |
| Corners (model) | `o4_corners` … `o11_corners` |

UI: **Odds** tab → grouped probability sections.

---

### 3.3 Match stats (`stats`)

**Full match only** — not split into 1H/2H. Shown when live or finished.

| Category | Home key | Away key |
| -------- | -------- | -------- |
| Possession | `home_possession` | `away_possession` |
| Pressure | `home_pressure`, `home_pressure_avg` | `away_pressure`, `away_pressure_avg` |
| Shots | `home_shots`, `home_shots_on` | `away_shots`, `away_shots_on` |
| Attacks | `home_attacks`, `home_dang_attacks` | `away_attacks`, `away_dang_attacks` |
| xG | `home_xg`, `home_xgot` | `away_xg`, `away_xgot` |
| Set pieces | `home_corners`, `home_offsides`, `home_throw_ins`, `home_goal_kicks` | away equivalents |
| Discipline | `home_fouls`, `home_tackles`, `home_yellow_cards`, `home_red_cards` | away equivalents |

Aggregate totals (no home/away): `attacks`, `shots`, `shots_on`, `corners`,
`cards`, `dang_attacks`, `offsides`, `tackles`, `goal_kicks`, `throw_ins`.

UI: **Stats** tab → categories (General, Attacking, Expected goals, Set pieces, Discipline).

---

### 3.4 Odds (`odds`)

Nested object: `odds[market_key][outcome_key] = decimal_odds`.

| Market key | Example outcomes |
| ---------- | ---------------- |
| `ft_result` | `home`, `draw`, `away` |
| `ht_result` | `home`, `draw`, `away` |
| `double_chance` | `home_draw`, `home_away`, `draw_away` |
| `btts` | `yes`, `no` |
| `btts_1h`, `btts_2h` | `yes`, `no` |
| `btts_o25` | `yes` |
| `dnb` | `home`, `away` |
| `total_goals` | `over_05` … `over_45`, `under_05` … `under_45` |
| `total_goals_1h` | `over_05`, `over_15`, `under_05`, `under_15` |
| `total_goals_2h` | same pattern |
| `goal_line_1h` | `over_1`, `under_1` |
| `home_goals`, `away_goals` | `over_05`, `over_15`, `under_05`, `under_15` |
| `total_corners` | many over/under lines |
| `asian_corners`, `asian_corners_1h` | Asian lines |
| `asian_handicap` | `home_p1`, `away_m025`, … |
| `highest_scoring_half` | `first_half`, `second_half`, `tie` |

UI: **Odds** tab → all markets as labelled chips.

---

### 3.5 Head-to-head (`h2h[]`)

| Field | Type | Description |
| ----- | ---- | ----------- |
| `id` | number | Past fixture ID |
| `home_name`, `away_name` | string | Teams (historical home/away) |
| `home_goals`, `away_goals` | number | Full-time |
| `ht_score` | string \| null | Half-time |
| `total_goals` | number | Sum of goals |
| `btts` | boolean | Both teams scored |
| `over_05` … `over_35` | boolean | Goal-line flags |
| `home_win`, `away_win`, `draw` | boolean | Result flags |
| `team1_win`, `team2_win` | boolean | Relative to current fixture teams |
| `date` | string | e.g. `07 May 2026` |
| `league` | string | Competition name |
| `stats` | object | Optional mini-stats: `possession`, `cards`, `corners` each `{ home, away }` |

UI: **H2H** tab → card per meeting with HT, tags, mini-stats.

---

## 4. Squads — `GET /players/fixture/:fixtureId`

Paginated player roster (not confirmed XI).

| Field | Description |
| ----- | ----------- |
| `id` | Player ID |
| `team_id` | Club ID |
| `teams` | number[] | Team IDs linked |
| `nationality` | string |
| `names` | `{ name, common_name, firstname, lastname }` |
| `position_id` | 1=GK, 2=DEF, 3=MID, 4=FWD |
| `detailed_position_id` | Granular role (RB, LW, …) |
| `shirt_number` | number \| null |

UI: **Lineups** tab → pitch by position.

---

## 5. Standings — `GET /stats/season/:seasonId`

Per-team season aggregates (used for table + movement). Includes **1H/2H splits at team-season level** (not per match), e.g.:

- `goals_for_1h`, `goals_for_2h`, `goals_against_1h`, `goals_against_2h`
- `btts_1h`, `btts_2h`, `corners_1h_total`, `cards_1h_total`, …
- `points` with `home` / `away` breakdown (in mapped `StandingRow`)

UI: **Table** tab on match detail; full standings browser in Clubs sidebar.

---

## 6. Countries & competitions

### `GET /countries`

250 countries: `id`, `name`, `code`, `slug`.

### `GET /competitions?include=seasons`

~2,415 competitions. **`country_ids` filter is ignored** — fetch all pages once,
group client-side.

Each competition: `id`, `name`, `country_id`, `is_cup`, `is_friendly`, `seasons[]`
with `id`, `name`, `year`, etc.

---

## 7. Other endpoints (not yet in main UI)

| Endpoint | Purpose |
| -------- | ------- |
| `GET /bookmakers` | List of bookmakers (`id`, `name`, `slug`) |
| `GET /odds/latest` | Latest odds rows across fixtures |
| `GET /value/upcoming` | Value bets with multi-bookmaker odds movement |
| `GET /trends/:TREND` | Trending markets |

### `value/upcoming` sample fields

`id`, `market`, teams, `status`, scores, `ht_score`, `corners`, `competition`
object, `odds[]` (bookmaker lines with opening/peak/latest/value %), `probability`,
`result`.

---

## 8. App UI mapping (match detail)

| Tab | API sources |
| --- | ----------- |
| **Summary** | Base fixture + `season_progress` + `probability` (snapshot) + score breakdown |
| **Stats** | `stats` (all home/away pairs) |
| **Odds** | `probability` (full) + `odds` (all markets) |
| **H2H** | `h2h` (full objects) |
| **Lineups** | `players/fixture/:id` + `home_formation` / `away_formation` |
| **Table** | `stats/season/:seasonId` |

Header scoreboard: FT, HT, derived 2H, positions, movement arrows.

---

## 9. Rate limits

`X-RateLimit-Limit: 300` per window. The `/oddalerts` proxy sets
`Cache-Control: s-maxage=10`. Competition list is cached in-module after first load.

---

## 10. Files

| File | Role |
| ---- | ---- |
| `frontend/services/oddAlerts.ts` | API client + types |
| `frontend/utils/matchDetailDisplay.ts` | Stat rows, probability groups, odds labels, HT/2H parsing |
| `frontend/components/match-detail/MatchDetailScreen.tsx` | Six-tab match UI |
| `frontend/app/oddalerts+api.ts` | Web proxy |
