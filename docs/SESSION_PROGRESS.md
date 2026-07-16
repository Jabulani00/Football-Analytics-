# Session Progress — App Test & Fix (QA)

**Date:** 2026-07-15
**Role:** Full-Stack Developer / QA Engineer
**Scope:** Run the Scoreline app, test every screen end-to-end, fix what is broken, document.

---

## 1. State of the app BEFORE this session

- **Frontend:** Expo React Native (web target) app, "Scoreline", with screens for
  Scores/Results, League detail, Match detail (6 tabs), Team profile, and an
  Analytics/Betting-Intelligence hub. Data comes from the **OddAlerts API** via a
  server-side proxy route (`app/oddalerts+api.ts`).
- **Backend:** Python data pipeline + the new **prediction engine**
  (`backend/prediction/`, added in the prior session).
- **Known unknown:** the app had never been run+tested end-to-end in one pass in
  this environment. Build health, runtime errors, and per-screen rendering were
  unverified.

---

## 2. Environment constraint (affects what could be tested live)

This QA machine sits behind a **TLS-intercepting proxy** that severs all outbound
HTTPS to `data.oddalerts.com`. Every data call therefore returns **502 Bad
Gateway** from the app's proxy. This is an **environment limitation, not an app
defect** — verified independently across Python (httpx/urllib) and Node, all of
which are reset by the same proxy. In the client's normal environment (where the
app already reaches the API), live data will load.

**Consequence:** data-driven views could not be exercised with *live* data here.
They were instead verified for (a) clean mount, (b) correct API call being fired,
and (c) graceful error handling. Screens backed by **bundled sample data**
(the Analytics hub) were tested fully.

---

## 3. What was tested, and results

| # | Area | How tested | Result |
|---|------|-----------|--------|
| 1 | App build & boot | `expo start --web`, load `/` | ✅ Builds & serves (HTTP 200), renders |
| 2 | Console health | Browser console, all routes | ✅ **Zero JS errors** (only a benign Reanimated dev warning) |
| 3 | Type safety | `tsc --noEmit` | ✅ Clean (0 errors) |
| 4 | Lint | `expo lint` | ⚠️→✅ 1 error + 9 warnings found, **all fixed** |
| 5 | Home / Scores shell | Visual | ✅ Header, tabs, filters, date strips render |
| 6 | Results/LIVE/Fixtures/All tabs | Click-through | ✅ Switch correctly; fire the right query (`between` vs `upcoming`) |
| 7 | Clubs/Countries, Men/Women toggles | Click-through | ✅ Toggle state; Countries mode hides country search as designed |
| 8 | Date filters (Today/2/4/7 days) | Visual + click | ✅ Selectable, active state correct |
| 9 | Data error handling | Forced by 502 | ✅ Graceful "Couldn't load…" + working **Retry** on every data view |
| 10 | Analytics → Overview | Nav + visual | ✅ Renders (72 tables / 100+ metrics / 5 sources cards) |
| 11 | Analytics → Stats Tables | Nav + scroll | ✅ Period sub-tabs + colour-banded sample stat table |
| 12 | Analytics → Streams | Nav | ✅ Workflow chips + active-stream cards |
| 13 | Analytics → Strategies | Nav + scroll | ✅ Strategy call-out cards with motives + odds chips |
| 14 | Match detail route | Direct nav `/match/:id` | ✅ Mounts, graceful error state, **no hooks crash** (post-fix) |
| 15 | Team route | Direct nav `/team/:id` | ✅ Mounts, "Upcoming fixtures" header + error state |
| 16 | League route | Direct nav `/league/:id` | ✅ Mounts, "League not found" (list is API-gated) |
| 17 | Modal route | Direct nav `/modal` | ⚠️ Mounts, but is **default Expo boilerplate** (see Obs. B) |

---

## 4. Bugs found & fixes applied

### BUG-1 (High) — Match detail screen: React hooks-order crash
- **Symptom / risk:** `MatchDetailScreen.tsx` called `useMemo` (for
  `groupCompetition`) **after two early returns** (`loading` and `error/!detail`
  guards). On the normal loading→loaded transition the render then executes *one
  more hook* than the previous render, which makes React throw *"Rendered more
  hooks than during the previous render,"* crashing the entire match-detail screen
  the moment a match finishes loading.
- **Root cause:** a hook placed below conditional `return` statements — a
  violation of the Rules of Hooks (caught by `react-hooks/rules-of-hooks`).
- **Fix:** hoisted the `groupCompetition` `useMemo` above the early returns and
  added a `!detail` null-guard, so the hook runs on every render and hook order is
  stable. `MatchDetailScreen.tsx`.
- **Re-test:** `tsc` clean; lint error gone (0 errors); match route mounts with no
  console error. (Live loaded-state path needs API data unavailable in this
  sandbox; the fix is confirmed authoritatively by the linter's hooks rule + type
  check.)

### BUG-2 (Low) — 9 unused-import lint warnings
- **Symptom:** dead imports (`layout`, `theme`, `Platform`, an unused
  `ComplianceBadge` import) across 9 components. Non-breaking, but noise that
  hides real warnings and bloats the bundle slightly.
- **Fix:** removed each unused import. Files: `PredictionBar.tsx`,
  `analytics/AnalyticsHub.tsx`, `analytics/ComplianceBadge.tsx`,
  `analytics/StatsTablesPanel.tsx`, `home/HomeScreen.tsx`,
  `league/LeagueStandingsPanel.tsx`, `match-detail/TeamUpcomingScreen.tsx`,
  `standings/StandingsPanel.tsx`, `stats/StatValueCell.tsx`.
- **Re-test:** `expo lint` now reports **0 problems**; `tsc` clean.

### Observations (not bugs — logged for follow-up)
- **Obs. A — Live data blocked in this environment.** All OddAlerts calls 502 due
  to the machine's TLS proxy. Not an app defect; the app degrades gracefully.
  Will resolve in the client's normal network.
- **Obs. B — `/modal` is unused Expo boilerplate** ("This is a modal"). Harmless
  but dead; should be removed or repurposed.
- **Obs. C — Analytics header shows the sample dataset's date** (21 May 2026)
  while live screens show the real date (15 Jul 2026). Cosmetic; tied to the
  bundled sample data, not a logic error.

---

## 5. State of the app AFTER this session

- **Builds and runs cleanly**, no JavaScript/runtime errors, `tsc` clean,
  **lint clean (0 problems)** — was 1 error + 9 warnings.
- **The one crash-class bug is fixed** — the match-detail screen can no longer
  crash on the loading→loaded transition.
- **All routes mount** and every data view **fails gracefully with a Retry**
  instead of a blank/broken screen.
- **The Analytics hub is fully functional** on bundled sample data.
- **Remaining work is data/feature build-out**, not breakage — captured as user
  stories in [USER_STORIES.md](./USER_STORIES.md).

### Files changed this session
- Fix: `frontend/components/match-detail/MatchDetailScreen.tsx` (hooks order)
- Cleanup: 9 components (unused imports) — see BUG-2 list.
