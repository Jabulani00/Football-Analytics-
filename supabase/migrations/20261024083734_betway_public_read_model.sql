begin;

-- The Betway worker tables stay write-locked to service_role. The browser gets
-- read-only access to a deliberately small set of public sportsbook fields and
-- bounded time windows; secrets, failure messages and worker audit details are
-- not exposed.
create policy "Public reads recent Betway crawl summaries"
on public.bw_crawl_run for select
to anon, authenticated
using (captured_at >= now() - interval '7 days');

create policy "Public reads relevant Betway events"
on public.bw_event for select
to anon, authenticated
using (start_time >= now() - interval '1 day');

create policy "Public reads recent Betway removal states"
on public.bw_removal_episode for select
to anon, authenticated
using (
  missing_since >= now() - interval '30 days'
  and state in ('pending', 'confirmed')
);

create policy "Public reads recent Betway changes"
on public.bw_change for select
to anon, authenticated
using (observed_at >= now() - interval '24 hours');

grant select (
  run_id, captured_at, completed_at, status, pages_captured,
  source_event_count, excluded_event_count, fixture_count
) on public.bw_crawl_run to anon, authenticated;

grant select (
  provider_event_id, home_team, away_team, competition, start_time,
  fixture_status, lifecycle_state, odds_home, odds_draw, odds_away,
  market_open, market_suspended, missing_count, missing_since,
  last_seen_at, removed_at, updated_at
) on public.bw_event to anon, authenticated;

grant select (
  episode_id, provider_event_id, episode_number, state, verification_status,
  missing_crawls, missing_since, last_missing_at, confirmed_at, ended_at,
  odds_home, odds_draw, odds_away, verification_attempts,
  verification_next_attempt_at, verification_last_attempt_at,
  verification_source_status, verification_source_fixture_id,
  verification_source_kickoff
) on public.bw_removal_episode to anon, authenticated;

grant select (
  change_id, provider_event_id, observed_at, change_type, old_values, new_values
) on public.bw_change to anon, authenticated;

create view public.bw_public_crawl_run
with (security_invoker = true)
as
select
  run_id, captured_at, completed_at, status, pages_captured,
  source_event_count, excluded_event_count, fixture_count
from public.bw_crawl_run;

create view public.bw_public_event
with (security_invoker = true)
as
select
  provider_event_id, home_team, away_team, competition, start_time,
  fixture_status, lifecycle_state, odds_home, odds_draw, odds_away,
  market_open, market_suspended, missing_count, missing_since,
  last_seen_at, removed_at, updated_at
from public.bw_event;

create view public.bw_public_removal_episode
with (security_invoker = true)
as
select
  episode_id, provider_event_id, episode_number, state, verification_status,
  missing_crawls, missing_since, last_missing_at, confirmed_at, ended_at,
  odds_home, odds_draw, odds_away, verification_attempts,
  verification_next_attempt_at, verification_last_attempt_at,
  verification_source_status, verification_source_fixture_id,
  verification_source_kickoff
from public.bw_removal_episode;

create view public.bw_public_change
with (security_invoker = true)
as
select change_id, provider_event_id, observed_at, change_type, old_values, new_values
from public.bw_change;

revoke all on public.bw_public_crawl_run from public;
revoke all on public.bw_public_event from public;
revoke all on public.bw_public_removal_episode from public;
revoke all on public.bw_public_change from public;

grant select on public.bw_public_crawl_run to anon, authenticated;
grant select on public.bw_public_event to anon, authenticated;
grant select on public.bw_public_removal_episode to anon, authenticated;
grant select on public.bw_public_change to anon, authenticated;

commit;
