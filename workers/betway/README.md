# Betway pre-match snapshot worker

> Production scheduling has moved to the Supabase `betway-hunt` and
> `betway-verify` Edge Functions. This Python/Scrapling package remains as a
> local diagnostic tool and manually triggered fallback; GitHub Actions no
> longer schedules it.

This standalone worker uses Scrapling's regular HTTP fetcher to read the public
JSON listing that Betway South Africa's Soccer / Upcoming page itself requests.
It captures bookmaker event IDs, teams, league and region, scheduled kickoff,
fixture status, and the 1X2 decimal prices.

The endpoint is paginated with `Skip` / `Take`. A snapshot is emitted only after
every response is valid and the API's `isFinalPage` flag is reached. HTTP errors,
malformed responses, non-terminal empty pages, repeated event IDs, or a
page-limit hit fail the capture. An empty first page is accepted only when the
API explicitly marks it as final; persistence then requires three consecutive
complete empty snapshots before confirming any disappearance.
The source currently returns eSoccer entries despite the `isEsport=false` filter,
so the worker excludes entries whose region or league labels identify esports.
Live, finished, and already-started events are also excluded from the pre-match
set. Suspended 1X2 markets and missing individual prices remain attached to the
fixture; neither means the fixture was removed.

Kickoff timestamps are normalized from Betway's epoch value to UTC while
retaining the South African local label and timezone. The worker does not infer removals. With `--persist`, it writes a complete
snapshot through the service-only Supabase RPC; failed captures are recorded
without changing missing-fixture counters.

The public listing does not expose an explicit cancellation or postponement
status. A fixture that is canceled and disappears may therefore be
indistinguishable from a bookmaker removal. The migration marks repeated
absences `unverified`; treat them only as candidates and do not surface them as
confirmed removals until an authoritative fixture-status source verifies them.

## Status verification prerequisites

Apply both migrations, in order:

1. `supabase/migrations/20261011230000_betway_hunt.sql`
2. `supabase/migrations/20261012090000_betway_status_verification.sql`

The second migration adds a service-only claim/resolve workflow, an audit trail,
and a hard limit of 80 API-Football fixture-date requests per UTC day. It
retries unresolved candidates no more than three times, at least one hour
apart. Failed, ambiguous, unsupported, or incomplete lookups remain
`unverified`; only a unique upcoming-fixture match with matching teams,
competition, and kickoff can verify an absence.
Cancelled, postponed, rescheduled, started, and finished matches are rejected
as bookmaker removals and recorded with their source status.

The Supabase production verifier calls API-Football directly. Configure
`API_FOOTBALL_KEY` as a Supabase Edge Function secret, not a public frontend
variable. Follow [the Supabase worker runbook](../../docs/BETWAY_SUPABASE_WORKERS.md)
for secrets, deployment, scheduling, and verification.

The legacy Python fallback can still use the older protected Vercel proxy when
run manually. Only for that fallback:

1. In **Vercel → Project → Settings → Environment Variables**, add
   `API_FOOTBALL_KEY` for the **Production** environment. The live football
   proxy previously reported this exact variable as missing, so confirm the
   exact name and Production scope; do not add the API key to GitHub or this
   repository.
2. Generate a separate, high-entropy random token. Add it to Vercel as
   `BETWAY_STATUS_PROXY_TOKEN` for **Production**, and add the same value to
   GitHub repository **Settings → Secrets and variables → Actions → Secrets**
   under the name `BETWAY_STATUS_PROXY_TOKEN`. Never paste the token into
   chat, source files, workflow logs, or command output.
3. Redeploy the Vercel project after setting its environment variables. The
   protected server endpoint is `/betway-status`.
4. Add the GitHub Actions **variable** `BETWAY_STATUS_PROXY_URL` with the full
   HTTPS production endpoint, for example
   `https://your-production-domain.example/betway-status`.

## Supabase and schedule

Supabase Cron now invokes `betway-hunt` every five minutes and
`betway-verify` every fifteen minutes. The GitHub workflow is manual-only and
is not part of production scheduling. Database advisory locks and transactional
RPCs serialize state changes so overlapping persistence calls cannot split
current fixture state from the removal audit trail.

## Run

From this directory:

```powershell
python -m pip install .
python -m unittest -v
betway-snapshot --output betway-snapshot.json
```

The output path is optional; without it, the complete snapshot is written to
stdout. Treat a non-zero exit status as a failed capture and never use it to
advance missing-fixture confirmations. Add `--persist` to use the Supabase RPC
instead of printing the snapshot.
