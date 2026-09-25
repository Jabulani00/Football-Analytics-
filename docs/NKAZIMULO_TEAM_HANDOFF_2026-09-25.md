# Nkazimulo Stream C — Team Handoff

**Report date:** 2026-09-25

**Repository:** `Jabulani00/Football-Analytics-`

**Production URL:** https://football-analytics-rose.vercel.app/analytics

**Released implementation commit:** `c4bb547`

## Executive summary

The Stream C application work for the Hollywoodbets hunt, odds fusion and value
rules, configurable strategies, shared bet slip, and extra-bookmaker comparison
has been implemented, tested, committed to `main`, and deployed by Vercel. The
production page responds successfully and its JavaScript bundle contains the new
Hollywoodbets and Odds Fusion interface.

The Supabase database and crawler backend are now deployed to project
`zymspnykcnqczqdnernb`. All three migrations are present remotely, advisors
report no warning-or-higher issues, Cron and `pg_net` are enabled, Vault and the
private worker secret are configured, and the one-minute crawler is healthy.
The verified run at 07:16 UTC processed four leagues and nine events in 4.6
seconds and returned HTTP 200.

The deployed web bundle now contains the target Supabase URL and publishable
key, and read-only Data API checks succeed for events, changes, and crawl state.
The no-key Hunt `GET` endpoint is also deployed. Production verification returned
HTTP 200 with CORS enabled, while an unauthenticated crawler `POST` remained
blocked with HTTP 401. The focused Hunt suite passes all 164 tests.

## Work completed

### Repository and deployment

- Fast-forwarded `main` through five incoming commits, from `a70d071` to
  `bf4cb47`, before applying the Stream C release.
- Restored the local Stream C work without merge conflicts and fixed TypeScript
  issues found in the combined incoming code.
- Committed 42 implementation, test, migration, and documentation files as
  `c4bb547` (`feat: complete Stream C betting analytics sprint`).
- Pushed `c4bb547` directly to `origin/main`.
- GitHub reported the Vercel deployment as successful.
- Confirmed the public Analytics route returns HTTP 200 and the deployed bundle
  contains the new sprint UI.

### Hollywoodbets hunt

- Implemented country, kickoff, team, and league-aware fixture matching,
  including aliases and squad separation.
- Added coverage reconciliation for fixtures missing from either Scoreline or
  Hollywoodbets.
- Added current event state, crawl health, and append-only change history for
  added, removed, suspended, reopened, shortened, and drifted events.
- Added confirmed-removal handling, malformed-response rejection, rotating crawl
  windows, a bounded runtime, expiring lease, and idempotent tournament updates.
- Added the Analytics → Hollywoodbets health, history, removal, and coverage UI.

Primary files:

- `frontend/services/hollywoodMatch.ts`
- `frontend/services/hollywoodHunt.ts`
- `frontend/hooks/useHollywoodHunt.ts`
- `frontend/components/analytics/HollywoodOddsPanel.tsx`
- `supabase/functions/hollywood-hunt/index.ts`
- `supabase/functions/_shared/hollywoodHuntRunner.ts`

### Odds fusion and value rules

- Added fractional-to-decimal normalization and de-vigged bookmaker
  probabilities.
- Added model-versus-book comparison for supported 1X2, BTTS, and totals 0.5,
  1.5, 2.5, and 3.5 markets.
- Implemented the documented opposition boundary, watch band, favourite ratio,
  model/book agreement, positive expected value, and probability-gap checks.
- Preserved unavailable model evidence as missing rather than creating false
  zero edges.

Primary files:

- `frontend/services/hollywoodFusion.ts`
- `frontend/services/hollywoodValueRules.ts`
- `frontend/hooks/useHollywoodPopularOdds.ts`
- `frontend/components/analytics/OddsFusionPanel.tsx`

### Strategies and bet slip

- Added configurable evidence, minimum compliance, minimum odds, and minimum
  edge.
- Joined standings, recent form, H2H, motivation, Bhozoma, separator, and value
  evidence without fabricating unavailable inputs.
- Corrected the strategy engine so the configured compliance threshold is
  honoured when required evidence is present.
- Added local strategy saving and evaluation history.
- Added a shared slip for Hollywood, fusion, strategy, and extra-bookmaker legs.
- Added accumulator/singles calculations, persistence, sharing/copying,
  bookmaker retention, and Hollywood Share-A-Bet export for eligible slips.
- Prepared authenticated Supabase tables and owner-only RLS policies for future
  cross-device strategies, evaluations, and slips.

Primary files:

- `frontend/services/strategyEngine.ts`
- `frontend/hooks/useSavedStrategies.ts`
- `frontend/components/analytics/StrategiesPanel.tsx`
- `frontend/hooks/useAnalyticsBetSlip.ts`
- `frontend/services/betSlipShare.ts`
- `frontend/components/analytics/BetSlipPanel.tsx`

### Extra bookmakers

- Added the eleven priority bookmakers with honest live, provider, or planned
  status.
- Added pagination and normalization for OddAlerts bookmaker offers.
- Added comparison only when fixture, kickoff, market, and selection agree.
- Added the best matching available price to the shared slip.

Primary files:

- `frontend/services/bookmakerAdapter.ts`
- `frontend/services/oddAlerts.ts`
- `frontend/components/analytics/OddsFusionPanel.tsx`

### Supabase schema and security preparation

- Prepared three ordered migrations:
  - `20260911090000_hollywood_hunt.sql`
  - `20260920232256_harden_hollywood_hunt_crawler.sql`
  - `20260923120632_analytics_strategy_and_bet_slip.sql`
- Enabled RLS on exposed tables.
- Added read-only public policies only for public bookmaker/crawl data.
- Added owner-scoped authenticated policies for strategies, evaluations, and
  slips.
- Added explicit Data API grants for Supabase's newer table-exposure rules.
- Restricted crawler writes and RPC execution to `service_role`.
- No service-role key or other secret is stored in the repository.

## Verification completed

- Full frontend test command passed.
- Hollywood Hunt tests: 161 passed.
- Value/strategy tests: 24 passed.
- Power Dynamics tests: 139 passed.
- Streamline fixture tests: 6 passed.
- All other included suites passed.
- TypeScript type checking passed.
- Lint passed with zero errors and three pre-existing warnings.
- Production Expo web export passed.
- `git diff --check` passed for the release commit.
- Vercel deployment completed successfully.
- Public Analytics route returned HTTP 200.
- CodeRabbit CLI 0.8.0 was installed and authenticated; diagnostics passed. Two
  review attempts ended when the remote WebSocket closed before analysis, so no
  CodeRabbit findings were applied.

## Supabase CLI installation

The repository pins Supabase CLI `2.117.0` as a development dependency. Every
contributor therefore uses the same version and no global installation is
required.

PowerShell on this workstation blocks `.ps1` launchers, so do not run bare
`npx` or `npm`. Use the Windows `.cmd` launchers:

```powershell
npm.cmd install
npm.cmd run supabase:version
npm.cmd run supabase:login
```

The direct equivalent is:

```powershell
.\node_modules\.bin\supabase.cmd --version
.\node_modules\.bin\supabase.cmd login
```

Changing the system execution policy is not required.

## Deployment status and remaining work

### Supabase Edge Function — completed

The CLI was re-authenticated with the account that owns access to
`zymspnykcnqczqdnernb`, and the updated `hollywood-hunt` function was deployed
with JWT gateway verification disabled for its intentional no-key public read.
The handler itself keeps crawler writes protected by `HUNT_CRON_SECRET`.

Verified production behavior:

- `GET` returned HTTP 200 and the public Hunt snapshot.
- `OPTIONS` returned HTTP 204 with `GET, POST, OPTIONS` CORS support.
- `POST` without `x-cron-secret` returned HTTP 401.
- The response contained 200 recent changes, 191 crawl-state records, 1,000
  current events, and no removed events at verification time.

### Vercel public configuration — completed

The Vercel owner supplied:

```text
EXPO_PUBLIC_SUPABASE_URL=https://zymspnykcnqczqdnernb.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<publishable-key>
```

The live JavaScript bundle was checked without printing the key and contains
both the target project URL and the `sb_publishable_` key prefix. Direct public
reads returned 901 events, 921 changes, and 164 crawler-state records at the
time of verification.

The no-key Hunt fallback should also be retained after Vercel is configured. It
exposes only the already-public event/change/health payload and keeps the Hunt
panel readable during a missing-variable or key-rotation incident.

### 1. Commit and release the pending local update

The pinned Supabase CLI, updated handoff report, proxy routing, public Hunt GET
endpoint, frontend no-key fallback, and tests are currently local. Commit them,
push `main`, wait for the Vercel deployment, and perform the smoke test below.

### 2. Final production smoke test

After Supabase and the public configuration are available, verify:

- Hollywoodbets shows database-connected crawl health.
- Current, removed, changed, and coverage-gap sections load.
- Odds Fusion produces only evidence-backed rows.
- Strategies generate calls and add selections to the slip.
- Bet Slip calculates singles and accumulator returns correctly.
- Extra-bookmaker offers show the correct live/provider/planned status.
- The browser console exposes no secrets and reports no missing tables.

## Known product gaps after deployment

- Correct-score/multiscore fusion requires genuine model score probabilities.
- Historical backtesting requires stored historical prices and results.
- Settlement, win/loss tracking, and ROI require a verified results join.
- Cross-device strategy/slip sync requires the authentication UX; schema and
  RLS are ready, while the current UI uses local storage.
- Direct integrations for every priority bookmaker are not implemented. Extra
  bookmakers are live only when OddAlerts supplies matching offers.

## Definition of fully complete

Stream C is fully deployed when:

- The Owner/Administrator-authorized public GET function update is deployed.
- Production contains the target Supabase public configuration.
- The Hollywoodbets panel shows live database-backed health and events.
- All Analytics tabs pass the production smoke test.
