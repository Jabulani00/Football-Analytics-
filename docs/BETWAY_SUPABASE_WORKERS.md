# Betway workers on Supabase

Betway capture and status verification run entirely on Supabase. GitHub Actions
is no longer required in production.

## Runtime

- `betway-hunt` runs every five minutes, reads every page of Betway South
  Africa's public upcoming-soccer feed, rejects incomplete responses, and calls
  the transactional `apply_betway_snapshot` RPC. Betway's live ordering can
  overlap at page boundaries, so the worker requires two terminal-page passes
  and persists their union. This conservative stabilization avoids turning a
  boundary shift into a false removal. Both passes and any retry must finish in
  a fixed 120-second budget, below Supabase's 150-second free-plan limit.
- `betway-verify` runs at minutes 2, 17, 32, and 47. It claims at most five
  confirmed pre-kickoff absences, checks their status with API-Football, and
  records verified, cancelled, postponed, rescheduled, started, finished, or
  unverified decisions.
- The database continues to require two complete misses for a normal removal
  and three for an empty or unusually large drop. It preserves the bookmaker
  name and the last Betway 1X2 prices.

## One-time secret setup

Generate one long random value locally. Store that same value as the Edge
Function secret and as a Vault secret. Do not commit it or prefix it with
`EXPO_PUBLIC_`.

```powershell
npx supabase secrets set BETWAY_CRON_SECRET=<long-random-value>
npx supabase secrets set API_FOOTBALL_KEY=<existing-api-football-key>
```

In Supabase SQL Editor, store the same cron value for the database scheduler:

```sql
select vault.create_secret('<same-long-random-value>', 'betway_cron_secret');
```

If that Vault name already exists, update it rather than creating a duplicate.

## Deploy

```powershell
npx supabase db push --dry-run
npx supabase db push
npx supabase functions deploy betway-hunt --no-verify-jwt
npx supabase functions deploy betway-verify --no-verify-jwt
```

## Verify

After ten minutes, run in SQL Editor:

```sql
select run_id, captured_at, completed_at, status, pages_captured,
       source_event_count, excluded_event_count, fixture_count, failure_message
from public.bw_crawl_run
order by captured_at desc
limit 10;

select provider_event_id, home_team, away_team, start_time, lifecycle_state,
       fixture_status, odds_home, odds_draw, odds_away, last_seen_at, removed_at
from public.bw_event
order by last_seen_at desc
limit 20;

select jobname, schedule, active
from cron.job
where jobname like 'betway-%'
order by jobname;
```

A `complete` crawl proves the full paginated feed was accepted. A `failed`
crawl is visible but cannot increment missing counts or create removals.
