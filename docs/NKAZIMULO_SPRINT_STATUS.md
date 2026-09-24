# Nkazimulo Stream C — Sprint Status

**Updated:** 2026-09-24

**Source:** `docs/SKM_301i26082719570.pdf`, especially Sections 10–13

**Existing public site:** https://football-analytics-rose.vercel.app/

## Status at a glance

The Stream C implementation is complete locally for the Hollywood hunt engine,
machine-versus-book fusion, configurable strategy calls, shared bet slip, and
OddAlerts-supplied extra-bookmaker offers. It is not yet present on the public
site. Database migrations, the crawler Edge Function, Supabase environment
values, and the Vercel build still need to be deployed and verified.

The local `main` branch is level with `origin/main`. Five incoming commits
(`a70d071` through `bf4cb47`) were fast-forwarded on 2026-09-24, the Stream C
working changes were restored without conflicts, and the combined codebase was
re-verified. The temporary update stash has been removed; older unrelated
stashes were left untouched.

## Implemented locally

### Hollywood script and hunt history

- The Section 10 four-part fixture matcher uses country, kickoff, team identity,
  and league, including aliases and separate senior/reserve/youth/women squads.
- Coverage reconciliation reports our missing fixtures and Hollywood-only
  listings.
- Supabase migrations store current listings, crawl health, and an append-only
  change history for added, removed, suspended, reopened, shortened, and drifted
  events.
- The hosted runner uses a global expiring lease, rotating country/tournament
  windows, a bounded execution budget, malformed-response rejection, confirmed
  removals, and one idempotent transactional RPC per tournament.
- The Analytics → Hollywoodbets panel reads crawler health, current/removed
  listings, recent changes, and coverage gaps.

Main code:

- `frontend/services/hollywoodMatch.ts`
- `frontend/services/hollywoodHunt.ts`
- `frontend/hooks/useHollywoodHunt.ts`
- `frontend/components/analytics/HollywoodOddsPanel.tsx`
- `supabase/migrations/20260911090000_hollywood_hunt.sql`
- `supabase/migrations/20260920232256_harden_hollywood_hunt_crawler.sql`
- `supabase/functions/hollywood-hunt/index.ts`

### Odds fusion and value rules

- Hollywood selections are converted from fractional to decimal odds at the
  provider boundary.
- Book probabilities are de-vigged before comparison.
- Real matched model probabilities feed 1X2, BTTS, and Over/Under 0.5, 1.5, 2.5,
  and 3.5 rows. Missing model data stays visibly missing instead of becoming a
  false zero edge.
- The PDF's 0.30 opposition boundary, 0.35–0.65 watch range, topdog/underdog
  ratio check, machine/book agreement, positive expected value, and minimum
  probability-gap rules are implemented.
- All Hollywood market selections remain browsable and can reach the slip even
  when the machine cannot price that market.

Main code:

- `frontend/services/hollywoodFusion.ts`
- `frontend/services/hollywoodValueRules.ts`
- `frontend/hooks/useHollywoodPopularOdds.ts`
- `frontend/components/analytics/OddsFusionPanel.tsx`

### Strategies and bet slip

- Users can select real evidence layers, minimum compliance, minimum odds, and
  minimum edge, then save a named strategy locally.
- Calls join live standings, recent form, H2H, motivation, Bhozoma, separator,
  and value evidence. Missing evidence blocks a call rather than inventing a
  number.
- The minimum-compliance setting is honoured; a complete evaluation qualifies
  when its pass rate reaches the configured threshold.
- One shared slip accepts Hollywood, fusion, strategy, and extra-bookmaker legs,
  remembers them in browser storage, supports accumulator/singles calculations,
  shares or copies a bookmaker-aware summary, and can export an all-Hollywood
  accumulator to Share-A-Bet.
- Authenticated Supabase tables and owner-only RLS policies are prepared for
  strategies, evaluations, and slips.

Main code:

- `frontend/services/strategyEngine.ts`
- `frontend/hooks/useSavedStrategies.ts`
- `frontend/components/analytics/StrategiesPanel.tsx`
- `frontend/hooks/useAnalyticsBetSlip.ts`
- `frontend/services/betSlipShare.ts`
- `frontend/components/analytics/BetSlipPanel.tsx`
- `supabase/migrations/20260923120632_analytics_strategy_and_bet_slip.sql`

### Extra bookmakers

- The eleven priority bookmakers from the notes are represented with honest
  LIVE, PROVIDER, or PLANNED status.
- Paginated OddAlerts value offers are normalized by bookmaker.
- Matching Hollywood and provider offers are compared only when fixture,
  kickoff, market, and selection agree; the best price can be added to the slip.

Main code:

- `frontend/services/bookmakerAdapter.ts`
- `frontend/services/oddAlerts.ts`
- `frontend/hooks/useHollywoodPopularOdds.ts`
- `frontend/components/analytics/OddsFusionPanel.tsx`

## Not live yet

The existing public URL still serves the earlier deployment. Do not present it
as evidence of these changes until the deployment steps below finish.

1. Sign the Supabase CLI into an account with Owner, Administrator, or Developer
   access to project `zymspnykcnqczqdnernb`.
2. Validate and push the three migrations.
3. set `HUNT_CRON_SECRET`, deploy `hollywood-hunt`, and schedule the one-minute
   Cron invocation.
4. Ensure the public Supabase URL/key and existing provider secrets are present
   in the hosting environment. The current contributor does not have Vercel
   access, so any missing build-time value must be supplied by the deployment
   owner or exposed through a deliberately committed public-client fallback.
5. Push the verified commit to `main` to trigger the existing Vercel deployment,
   then smoke-test all four Analytics tabs on the public URL.

Deployment commands and verification queries are in
`docs/HOLLYWOOD_HUNT_SUPABASE.md`.

## Remaining product gaps

These are deliberately not presented as completed:

- Correct-score/multiscore machine value requires genuine score probabilities
  for the same fixture; no probability is fabricated when that source is absent.
- Recorded compliance currently accumulates real complete evaluations from the
  browser forward. A true historical backtest needs stored historical prices and
  fixture outcomes.
- Settlement, wins/losses, and ROI need a verified result join.
- Cross-device strategy/slip sync needs the app's sign-in story; the database
  schema and RLS are ready, but the current UI falls back to local device storage.
- Direct scripts for every listed bookmaker are not implemented. Extra books are
  live only when OddAlerts exposes their value offers; the rest remain labelled
  planned.

## Verification

- Stream-specific Hollywood/hunt/fusion and value/strategy/bookmaker/slip tests
  pass.
- The complete frontend test command passes.
- TypeScript type checking passes.
- Lint has zero errors; the remaining warnings are pre-existing and outside this
  stream.
- The production web export builds successfully locally.
- CodeRabbit CLI 0.8.0 is installed and authenticated. Its diagnostics pass, but
  the review service closed two review connections before analysis, so no
  CodeRabbit findings have been applied yet.
