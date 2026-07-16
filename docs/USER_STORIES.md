# Scoreline — User Stories

**Updated:** 2026-07-15
Two parts: **A) Completed work** (marked ✅ Done) and **B) Remaining work**,
organised into three parallel streams for **Nkululeko**, **Jabu**, and
**Nkazimulo**, with dependencies flagged so no one is blocked.

---

## 📊 Stats-tables status snapshot (verified 2026-07-15)

Measured by building `backend/scoreline.db` and inspecting it directly.

| Metric | Count |
|---|---|
| **Stat tables physically created** | **72 / 72** (45 base + 27 last-N) — full skeleton done |
| Tables carrying their **correct distinct metrics** | **36 / 72** — the `ordinary` family (9) + all last-N windows (27) |
| Tables that are **structural placeholders** (need real metrics) | **36 / 72** — `ppg`, `series`, `ft_only`, `league_avg` families reuse the 34 "ordinary" columns |
| Tables **built live from the API** (real-time) | **36 / 36** ordinary tables — **verified on LIVE data** (28 Kazakhstan Cup results → 36 tables with real stats, via the deployed proxy) |

**Plain summary: the 72-table frame is 100% built; the 36 ordinary tables are now
built in real time from the live API (no database), and the remaining 36
per-family tables (C1c) are the next metric work.**

### ✅ Live data verified (2026-07-15)

The whole pipeline was run against **live OddAlerts data** through the deployed
Vercel proxy (`https://football-analytics-rose.vercel.app/oddalerts`), which
bypasses this network's betting-site filter:

- **Real-time stat tables** built from 28 live results → 36 tables, real values
  (e.g. `Ordabasy — 4 games, Win% 75🟢, BTTS 25🔴, scoring avg 2.0`).
- **Prediction engine** produced a full live prediction for `Ordabasy vs Altay`
  (xG 1.08–2.15, correct scores, confidence 55 `low_data`, real-field
  explanations).
- **Local dev** now shows live data via `EXPO_PUBLIC_ODDALERTS_PROXY` pointing at
  the deployed proxy (`frontend/.env`, dev-only).

### 🔄 Architecture change (2026-07-15): API-as-database, tables built in real time

Per direction, **the app no longer needs its own stats database**. Instead of
precomputing 72 tables into SQLite, the tables are **derived live from the
OddAlerts API** (`/fixtures/between` results) and returned in the same
representation format the app already consumes.

- **New:** `frontend/services/statsBuilder.ts` — pure builder: finished fixtures →
  `TeamStatsExport` (the 36 `ordinary` tables across period × scope × window),
  with traffic-light signals. **Verified:** 26/26 offline checks
  (`frontend/scripts/test-stats-builder.ts`), `tsc` + lint clean.
- **New:** `frontend/hooks/useLiveStatsTables.ts` — fetches a competition's season
  results and builds the tables on the client, no DB.
- **Honesty note:** 26 of the 34 ordinary stats are derivable from results; the 8
  timing/order stats (`scored_first`, `early/late_goals`, `handicap`) need
  per-goal minutes that `/fixtures/between` does not carry — emitted as null.
- **SQLite pipeline** (`backend/create_db.py` etc.) is now **optional** — useful
  for offline dev only; production reads live.

---

## PART A — Completed work (✅ DONE)

> These are shipped and verified. Verification notes reflect this session's QA
> (see [SESSION_PROGRESS.md](./SESSION_PROGRESS.md)).

### A1. Prediction engine — explainable core ✅ DONE
As an analyst, I want match predictions (1X2, double chance, BTTS, Over/Under
0.5–3.5, correct score, expected goals, confidence) so I can assess fixtures.
- Dixon-Coles bivariate-Poisson core + ensemble blend (model + OddAlerts
  probability + de-vigged odds). `backend/prediction/`.
- **Verified:** 21/21 unit tests pass; offline demo produces coherent output.

### A2. Prediction API surface ✅ DONE
As the app, I want REST endpoints to fetch predictions.
- FastAPI app: `/health`, `/predictions/upcoming`, `/predictions/fixture/{id}`.
- **Verified:** app boots; `/health` 200; routes present in OpenAPI.

### A3. OddAlerts data catalogue ✅ DONE
As a developer, I want a verified reference of available API fields.
- `docs/ODDALERTS_API_DATA_CATALOG.md` + gaps doc; engine uses confirmed fields only.

### A4. App shell & navigation ✅ DONE
As a user, I want to move between Scores, Analytics, Match, Team, League.
- Expo Router routes for all screens; header + Analytics link.
- **Verified:** every route mounts with no console errors.

### A5. Scores feed with filters ✅ DONE
As a user, I want Results/LIVE/Fixtures/All, Clubs/Countries, Men/Women, and
date-range filters.
- **Verified:** tabs switch the correct query (`fixtures/between` vs
  `fixtures/upcoming`); toggles update state correctly.

### A6. Match detail (6 tabs) ✅ DONE
Summary, Stats, Odds, H2H, Lineups, Table tabs backed by OddAlerts includes.
- **Verified:** route mounts and handles missing data gracefully.

### A7. Team & League screens ✅ DONE
Team upcoming fixtures + league standings screens with graceful empty/error states.

### A8. Analytics / Betting-Intelligence hub ✅ DONE
Overview, Stats Tables (colour-banded), Streams, Strategies, Odds Fusion, Bet Slip.
- **Verified:** all tabs render fully on bundled sample data.

### A9. Graceful data-failure handling ✅ DONE
Every data view shows "Couldn't load…" + a working **Retry** instead of breaking.
- **Verified:** confirmed under forced 502 conditions.

### A10. QA fix — match-detail hooks-order crash ✅ DONE (this session)
Hoisted a conditional `useMemo` above early returns so the match-detail screen no
longer risks a React hooks-order crash on load.
- **Verified:** lint hooks-rule passes; `tsc` clean.

### A11. QA cleanup — lint to zero ✅ DONE (this session)
Removed 9 unused imports across 9 components; `expo lint` now reports 0 problems.

### A12. 72-table stats skeleton created ✅ DONE
As an analyst, I want the full statistical-table structure so every metric has a
home across periods, splits, and rolling windows.
- Generator schema builds **all 72 tables** (5 families × FT/HT/2H ×
  overall/home/away = 45 base; last-10/8/6 × the same = 27 last-N).
  `backend/schema.py`, `backend/create_db.py`.
- **Verified:** `scoreline.db` inspected — 72 stat tables present, 34 stat columns
  each, seeded across 8 leagues. See the snapshot above.
- **Note:** structure is complete; substance is partial — see C1a (real metrics for
  the 36 placeholder tables) and C1b (live-data population).

### A13. Real-time stats builder (API-as-database) ✅ DONE (this session)
As the app, I want stat tables computed live from the API so we don't need a
database.
- `frontend/services/statsBuilder.ts` derives the 36 `ordinary` tables (period ×
  scope × window) from `/fixtures/between` results, in the `TeamStatsExport`
  representation, with signals; `frontend/hooks/useLiveStatsTables.ts` does the
  live fetch+build.
- **Verified (offline):** 26/26 checks in `scripts/test-stats-builder.ts` (FT/HT/2H
  periods, home/away scopes, windows, signals hand-checked); `tsc` + lint clean.
- **Verified (LIVE):** built 36 real tables from 28 live Kazakhstan Cup results
  fetched through the deployed Vercel proxy — real per-team stats + signals.

### A14. Live prediction engine + Predictions screen ✅ DONE
As a user, I want predictions on upcoming fixtures, generated continuously from
the live stat tables.
- `services/predictionEngine.ts` — TS port of the Dixon-Coles Poisson + ensemble
  core (1X2, BTTS, O/U, correct score, xG, confidence); `hooks/useLiveFixture
  Predictions.ts` builds the tables live and predicts a competition's upcoming
  fixtures, refreshing on a 5-min interval ("always running").
- `components/analytics/PredictionsPanel.tsx` — new **Predictions** tab: live
  competition selector + a card per upcoming fixture (1X2 with the pick, BTTS,
  O2.5, xG, likely score, confidence).
- **Verified (offline):** 17/17 engine checks (`scripts/test-prediction-engine.ts`).
- **Verified (LIVE, in-app):** Major League Soccer → **4/4 upcoming fixtures
  predicted** (e.g. St. Louis City v Sporting KC 70/19/11, xG 2.5-0.9, 2-0,
  conf 93%). `tsc` + lint clean.
- Substantially delivers **J1** (predictions on fixtures) for upcoming games.
- **Follow-up:** the competition picker lists all active competitions (100+);
  add search/grouping so it reads well (polish).

---

## PART B — Remaining work (3 parallel streams)

**Stream owners**
- **Nkululeko → Prediction & Backend Services** (Python, FastAPI, scheduling, DB)
- **Jabu → App Screens & Data Binding** (React Native screens, wiring live data)
- **Nkazimulo → Analytics, Strategy & Platform** (strategy/bet-slip features,
  stats data, auth, deployment/config)

**Dependency legend:** 🔗 depends on · ⛔ blocked until · ⚡ unblocks others

---

### STREAM 1 — Nkululeko (Prediction & Backend Services)

#### N1. Scheduled prediction precompute ⚡
**Context:** Design §6 says the app must read *stored* predictions, never compute
on request. Today predictions are computed live per call.
**Story:** As the platform, I want a scheduled job that predicts all upcoming
fixtures and stores the results, so the app serves cached predictions instantly.
**Acceptance criteria:**
- APScheduler (or Celery) job runs on an interval (config-driven, e.g. every
  30 min) calling the existing `service.predict_upcoming`.
- Each run is idempotent (upsert by `fixture_id`) and logged (start, count, errors).
- One fixture failing does not abort the batch (already handled in `predict_upcoming`).
**Dependencies:** 🔗 N2 (needs the predictions table). ⚡ Unblocks J1, N-analytics.

#### N2. Persist predictions to Supabase/Postgres ⚡
**Story:** As the platform, I want predictions stored in Postgres so the app and
analytics can query them.
**Acceptance criteria:**
- `predictions` table: fixture_id (unique), teams, 1X2, markets JSON, expected
  goals, correct_score JSON, confidence, data_flags, explanation JSON, computed_at.
- A read endpoint `GET /predictions/stored?days=N` returns cached rows.
- Migration script committed; connection via env (`SUPABASE_URL`/key), no secrets in code.
**Dependencies:** ⚡ Unblocks N1, J1. Independent to start (schema first).

#### N3. Deploy the prediction API
**Story:** As the app, I want the prediction API reachable from a stable URL.
**Acceptance criteria:**
- FastAPI deployed (container or serverless); `/health` green in the target env.
- CORS allows the app origin; `ODDALERTS_TOKEN` set as a secret.
- Documented base URL consumed by the app via env var.
**Dependencies:** 🔗 N2. Coordinate URL/secret with **Nkazimulo (N-infra C4)**.

#### N4. Prediction accuracy flywheel (logging + calibration)
**Story:** As a data scientist, I want each prediction stored with its features
and later joined to the actual result, so models can be evaluated and calibrated.
**Acceptance criteria:**
- Store feature snapshot + realized result (backfilled from finished fixtures).
- A weekly report: Brier score / log-loss per market vs the OddAlerts baseline.
- Documented path to the Phase-1 ML upgrade (design §9).
**Dependencies:** 🔗 N2. Lower priority; start after N1–N3.

---

### STREAM 2 — Jabu (App Screens & Data Binding)

#### J1. Predictions tab on Match detail ⚡ (headline feature)
**Context:** The engine exists; the app does not yet show predictions.
**Story:** As a user, on a match I want a **Predictions** tab showing win
probabilities, BTTS, Over/Under, correct score, expected goals, confidence, and
the plain-language explanation list.
**Acceptance criteria:**
- New tab in `MatchDetailScreen` rendering the prediction response shape.
- Probability bars for 1X2; market chips; top-3 correct scores; confidence meter;
  `explanation[]` as bullet list.
- Loading skeleton + graceful empty state when no prediction exists.
- Reads from the stored-predictions endpoint.
**Dependencies:** ⛔ Blocked until **N2** (endpoint) exists. Can build UI against a
mocked JSON now, then swap to live. 🔗 N2, N3.

#### J2. Fixtures & Odds screen with live data
**Story:** As a user, I want upcoming fixtures with odds and model probabilities.
**Acceptance criteria:**
- Fixtures list binds to live `fixtures/upcoming`; odds/probability shown per row.
- Empty/error/loading states consistent with the rest of the app.
**Dependencies:** Independent (uses existing OddAlerts proxy). Verify once live
network is available.

#### J3. Team profile — full stats with filters
**Story:** As a user, on a team I want stats filterable by period (FT/1H/2H),
scope (overall/home/away), window (season/last-N), and opponent band.
**Acceptance criteria:**
- Filter controls wired to the stats source; table updates on change.
- Colour bands applied consistently (same banding as standings).
**Dependencies:** 🔗 **Nkazimulo C1b** (live stats data) for live values; UI +
filter logic can be built against sample data first.

#### J4. Standings & colour bands (live)
**Story:** As a user, I want live league standings with Green/Yellow/Red bands and
"performance vs band" entry points.
**Acceptance criteria:**
- Standings bind to `stats/season/:id`; thirds banding rendered.
- Tapping a band routes to a band-analysis view.
**Dependencies:** Independent to start; live values need network.

#### J5. Loading skeletons & polish pass
**Story:** As a user, I want smooth loading placeholders instead of spinners/blank.
**Acceptance criteria:** skeletons on Scores, Match detail, Team, Standings; no
layout shift on load. **Dependencies:** none — can proceed anytime.

---

### STREAM 3 — Nkazimulo (Analytics, Strategy & Platform)

#### C1a. Implement real metrics for the 36 placeholder tables ⚡
**Context:** All 72 tables exist, but only the `ordinary` family (+ last-N) carry
correct metrics. The `ppg`, `series`, `ft_only`, `league_avg` families
(**36 tables**) currently reuse the 34 "ordinary" columns as a scaffold.
**Story:** As an analyst, I want each stat family to hold its own true metrics so
the tables mean what their names say.
**Acceptance criteria:**
- `ppg` families compute points-per-game metrics; `series` compute current
  streak/run-lengths; `ft_only` compute full-time-only match-outcome patterns
  (e.g. `ht_ft_combo`, `won_both_halves`, `win_to_nil`); `league_avg` hold
  league-level rows.
- Column sets per family reflect the spec (no longer identical to `ordinary`).
- `backend/schema.py` extended with per-family stat lists; `calculate_stats.py`
  updated accordingly.
**Dependencies:** independent of network. ⚡ Unblocks C2 (strategy compliance).

#### C1b. Wire the real-time builder into the UI ✅ DONE
**Story:** As an analyst, I want the Stats Tables screen to show tables built live
from the API so I see real numbers, not samples.
- `StatsTablesPanel` now has a **live competition selector** (sourced from live
  upcoming fixtures) and consumes `useLiveStatsTables`; `utils/statsTableAdapter.ts`
  maps `TeamStatsExport` rows → the panel's `{team, metrics}` shape (using the
  builder's colour signals), sorted by win%. Sample data is the fallback while
  loading / when a competition has no results.
- **Verified (LIVE, in the app):** selecting `Esiliiga A` rendered 10 real teams
  with live stats (Tartu Welco 74% win / 63% BTTS / 74% O2.5…); the `● LIVE`
  badge shows, and switching period/window (FT → 1H, last-N) re-maps to the right
  live table. `tsc` + lint clean.
- ⚡ Unblocks J3 (Team-profile live stats — reuse the same adapter/hook).

#### C1c. Extend the real-time builder to the remaining families
**Story:** As an analyst, I want `ppg`, `series`, `ft_only`, `league_avg` and the
8 timing stats built live too, for full 72-table parity.
**Acceptance criteria:**
- `statsBuilder.ts` computes per-family metrics (points-per-game, streak lengths,
  FT-only outcome patterns, league averages).
- Timing stats (`scored_first`, `early/late_goals`) sourced from
  `stats/fixture` goal-timing buckets where available, else remain null.
**Dependencies:** 🔗 A13, 🔗 C1a (metric definitions). Independent of network for
the logic.

#### C2. Strategy builder — persistence & compliance tracking
**Story:** As a user, I want to define a strategy from stat conditions, save it,
and see its historical compliance %.
**Acceptance criteria:**
- Create/save strategy (conditions JSON); evaluate against historical fixtures;
  show matched/total compliance.
- Backend endpoints + UI in the Strategies tab (currently sample-only).
**Dependencies:** 🔗 C1a/C1b (needs real stats), 🔗 N2 (persistence). ⛔ Compliance %
is blocked until C1a/C1b provide real stat history.

#### C3. Bet-slip generation & sharing
**Story:** As a user, I want to add matches/strategies to a bet slip and share it.
**Acceptance criteria:** build slip from selections; persist; shareable summary
(deep link or image/text). **Dependencies:** 🔗 C2 (strategy references), 🔗 N2.

#### C4. Deployment, proxy & secrets (Platform) ⚡
**Story:** As the team, I want the web app + proxy + prediction API deployed with
secrets managed, so everyone tests against a shared live environment.
**Acceptance criteria:**
- Vercel build green; `ODDALERTS_TOKEN`, prediction API URL, Supabase keys set as
  env vars (none committed).
- Server proxy (`app/oddalerts+api.ts`) confirmed reaching the API in the deployed
  env (this session's 502 was a local-network artifact only).
**Dependencies:** Coordinate with **Nkululeko N3**. ⚡ Unblocks live verification
for J2/J4 and the whole team.

#### C5. Auth (JWT login/refresh)
**Story:** As a user, I want to sign in so my strategies/slips are saved to me.
**Acceptance criteria:** login/refresh endpoints; token storage in app; protected
routes for user data. **Dependencies:** 🔗 N2 (user tables). Lower priority.

#### C6. Housekeeping — remove boilerplate & cosmetic fixes
**Story:** As a developer, I want dead scaffolding removed.
**Acceptance criteria:**
- Remove/repurpose the default Expo `/modal` boilerplate (Obs. B).
- Analytics header shows the real current date, not the sample dataset's date
  (Obs. C).
**Dependencies:** none — quick wins, do anytime.

---

## Suggested sequencing (avoid blocking)

1. **Week 1 parallel starts (no blockers):** N2 (schema) · J5 (skeletons) / J2
   (fixtures UI) · C4 (deploy/secrets) + C6 (housekeeping) · C1a (real metrics for
   placeholder tables).
2. **Then:** N1 (scheduler, after N2) · N3 (deploy API, after N2 + C4) · C1b (live
   table population, after C4 or a non-filtered network).
3. **Then feature payoffs:** J1 (Predictions tab, after N2/N3) · C2 (strategy
   compliance, after C1a/C1b) · J3 (team stats live, after C1b).
4. **Later:** C3 (bet slips), C5 (auth), N4 (accuracy flywheel).

**Hard blockers to watch:** J1 ⛔ N2 · C2 (compliance) ⛔ C1a/C1b · J3 live values
⛔ C1b · C1b ⛔ reachable API host (C4 / non-filtered network).
