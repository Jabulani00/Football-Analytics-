# Hollywood Hunt — Supabase deployment

The repository targets Supabase project `zymspnykcnqczqdnernb`. The crawler can
be developed without a database connection, but history, removal signals, and
the hourly hunt view only become live after the migration and Edge Function are
deployed.

## 1. Link the repository

Authenticate with a Supabase account that has Owner, Administrator, or
Developer access to the project, then run from the repository root:

```powershell
npx supabase login
npx supabase link --project-ref zymspnykcnqczqdnernb
npx supabase db push --dry-run
npx supabase db push
```

The migrations create `hw_event`, `hw_change`, `hw_crawl_state`, and the
expiring `hw_runner_lease`. Public clients receive explicit `SELECT` grants on
the three reporting tables plus read-only RLS policies. The lease and all
mutation RPCs remain service-role-only.

## 2. Deploy the one-minute crawler

Generate a long random value for `HUNT_CRON_SECRET`; use the same value in the
function secret and the Cron request header. Never use an `EXPO_PUBLIC_` name
for this secret or for the service-role key.

```powershell
npx supabase secrets set HUNT_CRON_SECRET=<long-random-secret>
npx supabase functions deploy hollywood-hunt --no-verify-jwt
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are supplied automatically to a
hosted Edge Function. Optional tuning secrets are:

- `HUNT_COUNTRIES_PER_RUN` — country window per minute; default `1`.
- `HUNT_MAX_TOURNAMENTS_PER_RUN` — safety ceiling; default `20`.
- `HUNT_DRIFT_PP` — de-vigged favourite move that creates a signal; default `3`.
- `HUNT_RUN_BUDGET_MS` — whole-run deadline; default `45000`, maximum `50000`.
- `HUNT_CONFIRM_REMOVAL_AFTER` — complete misses before a normal removal;
  default `2`. Empty or ≥50% drop responses always require at least `3`.
- `HUNT_HOLLYWOOD_PROXY_URL` — optional allowlisted server proxy used when
  Hollywood blocks the Supabase Edge Function's outbound IP. Production uses
  `https://football-analytics-rose.vercel.app/hollywood`.

The runner rotates both countries and tournament windows every minute, holds an
expiring global lease to prevent overlap, and stops before its request budget is
exhausted. A malformed Hollywood response is rejected. A valid empty response
is retained as a warning state, but cannot remove fixtures until it repeats on
three complete crawls. Each tournament is applied by one transactional,
idempotent RPC, so a retry cannot split current state from change history or
increment removal confirmation twice.

## 3. Schedule it

Enable the Cron and `pg_net` integrations in the Supabase dashboard. Store the
project URL and the same cron secret in Vault. The function has platform JWT
verification disabled because it is a worker, then authenticates the private
`x-cron-secret` header in its own handler:

```sql
select vault.create_secret(
  'https://zymspnykcnqczqdnernb.supabase.co',
  'hollywood_hunt_project_url'
);
select vault.create_secret('<same-long-random-secret>', 'hollywood_hunt_cron_secret');
```

Then create the one-minute job:

```sql
select cron.schedule(
  'hollywood-hunt-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url := (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'hollywood_hunt_project_url'
      limit 1
    ) || '/functions/v1/hollywood-hunt',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'hollywood_hunt_cron_secret' limit 1
      )
    ),
    body := '{}'::jsonb
  );
  $$
);
```

## 4. Connect the web application

Set these in Vercel for Production and Preview, then redeploy. If you do not
have access to the Vercel project, ask its owner to confirm these values; a push
to `main` can trigger a build, but it cannot create missing Vercel environment
variables:

```text
EXPO_PUBLIC_SUPABASE_URL=https://zymspnykcnqczqdnernb.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<publishable-or-anon-key>
```

When Vercel variables are unavailable, the app falls back to a public `GET` on
the deployed `hollywood-hunt` function. That endpoint returns only the
read-only event, change, and crawl-health payload. Authenticated strategy and
slip synchronization still requires normal Supabase Auth and a publishable key.

Do not put `SUPABASE_SERVICE_ROLE_KEY` in Vercel's public Expo environment. The
frontend either reads the RLS-protected hunt tables or the read-only Function
payload; crawler writes remain private inside the Edge Function.

## 5. Verify

After two or more runs, confirm:

```sql
select count(*) from public.hw_event;
select * from public.hw_crawl_state order by last_crawled desc limit 10;
select * from public.hw_change order by observed_at desc limit 20;
```

The Analytics → Hollywoodbets tab should change from “Database not connected”
to crawler health, the last successful crawl, current/removed counts, the
previous hour's change signals, and Scoreline-v-Hollywood coverage gaps. It
refreshes every 60 seconds without requiring a page reload.
