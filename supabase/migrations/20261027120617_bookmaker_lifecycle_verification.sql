begin;

-- A disappearance is only a bookmaker removal after an independent fixture
-- source still reports the match as NS at the same kickoff. Everything else
-- gets its own terminal lifecycle state and is excluded from removal signals.

alter table public.hw_event
  add column verification_status text not null default 'not_required',
  add column verification_attempts smallint not null default 0
    check (verification_attempts >= 0),
  add column verification_next_attempt_at timestamptz not null default now(),
  add column verification_last_attempt_at timestamptz,
  add column verification_reason text,
  add column verification_source_status text,
  add column verification_source_fixture_id text,
  add column verification_source_kickoff timestamptz;

alter table public.hw_event
  add constraint hw_event_verification_status_valid
  check (verification_status in ('not_required', 'pending', 'verified', 'rejected'));

alter table public.hw_event
  drop constraint hw_event_lifecycle_state_valid,
  add constraint hw_event_lifecycle_state_valid
  check (lifecycle_state in (
    'active', 'pending_removal', 'removed_pre_kickoff', 'suspended',
    'rescheduled', 'started', 'expired', 'reopened', 'cancelled',
    'postponed', 'abandoned'
  ));

alter table public.hw_change
  drop constraint hw_change_kind_valid,
  add constraint hw_change_kind_valid
  check (kind in (
    'added', 'pending_removal', 'removed', 'expired', 'suspended',
    'reopened', 'rescheduled', 'started', 'cancelled', 'postponed',
    'abandoned', 'shortened', 'drifted'
  ));

create table public.hw_status_verification_attempt (
  attempt_id bigint generated always as identity primary key,
  event_id bigint not null references public.hw_event (event_id),
  attempted_at timestamptz not null default now(),
  decision text not null check (decision in (
    'verified', 'cancelled', 'postponed', 'rescheduled', 'suspended',
    'abandoned', 'started', 'finished', 'unverified'
  )),
  reason text,
  source_status text,
  source_fixture_id text,
  source_kickoff timestamptz
);

create index hw_status_verification_attempt_event_idx
  on public.hw_status_verification_attempt (event_id, attempted_at desc);
create index hw_event_verification_queue_idx
  on public.hw_event (verification_next_attempt_at, start_time)
  where lifecycle_state = 'pending_removal' and verification_status = 'pending';

alter table public.hw_status_verification_attempt enable row level security;
revoke all on public.hw_status_verification_attempt from public, anon, authenticated;
grant all on public.hw_status_verification_attempt to service_role;
grant usage, select on sequence public.hw_status_verification_attempt_attempt_id_seq to service_role;

create or replace function public.set_hw_event_lifecycle_state()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if tg_op = 'UPDATE' and not new.market_open then
    new.odds_home := coalesce(new.odds_home, old.odds_home);
    new.odds_draw := coalesce(new.odds_draw, old.odds_draw);
    new.odds_away := coalesce(new.odds_away, old.odds_away);
  end if;

  -- Any fresh sighting supersedes a prior disappearance classification.
  if tg_op = 'UPDATE'
     and new.last_seen > old.last_seen
     and new.removed_at is null
     and coalesce(new.missing_count, 0) = 0
     and old.lifecycle_state in (
       'pending_removal', 'removed_pre_kickoff', 'cancelled', 'postponed',
       'abandoned', 'rescheduled', 'suspended'
     ) then
    new.lifecycle_state := case
      when new.start_time <= new.last_seen then 'started'
      when not new.market_open then 'suspended'
      else 'reopened'
    end;
    new.verification_status := 'not_required';
    new.verification_attempts := 0;
    new.verification_reason := null;
    new.verification_source_status := null;
    new.verification_source_fixture_id := null;
    new.verification_source_kickoff := null;
    return new;
  end if;

  if new.removed_at is not null then
    if new.start_time <= new.removed_at then
      new.lifecycle_state := 'expired';
      new.verification_status := 'rejected';
      new.verification_reason := 'scheduled_kickoff_elapsed';
    elsif new.verification_status = 'verified' then
      new.lifecycle_state := 'removed_pre_kickoff';
    else
      new.lifecycle_state := 'pending_removal';
      new.verification_status := 'pending';
      new.verification_next_attempt_at := least(new.verification_next_attempt_at, now());
    end if;
  elsif tg_op = 'UPDATE'
    and new.verification_status = 'rejected'
    and new.lifecycle_state in (
      'cancelled', 'postponed', 'abandoned', 'rescheduled',
      'suspended', 'started', 'expired'
    ) then
    return new;
  elsif tg_op = 'UPDATE' and new.start_time is distinct from old.start_time then
    insert into public.hw_change (observed_at, event_id, kind, before_odds, after_odds)
    values (
      new.last_seen,
      new.event_id,
      'rescheduled',
      case when old.odds_home is not null and old.odds_draw is not null and old.odds_away is not null
        then jsonb_build_object('home', old.odds_home, 'draw', old.odds_draw, 'away', old.odds_away) end,
      case when new.odds_home is not null and new.odds_draw is not null and new.odds_away is not null
        then jsonb_build_object('home', new.odds_home, 'draw', new.odds_draw, 'away', new.odds_away) end
    );
    new.lifecycle_state := case when new.start_time > new.last_seen then 'rescheduled' else 'started' end;
  elsif new.start_time <= new.last_seen then
    new.lifecycle_state := 'started';
  elsif coalesce(new.missing_count, 0) > 0 then
    new.lifecycle_state := 'pending_removal';
  elsif not new.market_open then
    new.lifecycle_state := 'suspended';
  else
    new.lifecycle_state := 'active';
  end if;
  return new;
end
$function$;

create or replace function public.classify_hw_disappearance()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_event public.hw_event%rowtype;
begin
  if new.kind = 'removed' then
    select event.* into v_event
    from public.hw_event as event
    where event.event_id = new.event_id;

    if v_event.start_time <= new.observed_at then
      new.kind := 'expired';
    elsif v_event.lifecycle_state <> 'removed_pre_kickoff'
       or v_event.verification_status <> 'verified' then
      new.kind := 'pending_removal';
    end if;
  end if;
  return new;
end
$function$;

-- Existing future removals pre-date independent verification. Re-queue them
-- rather than presenting historical inference as verified fact.
update public.hw_event
set lifecycle_state = 'pending_removal',
    verification_status = 'pending',
    verification_next_attempt_at = now()
where lifecycle_state = 'removed_pre_kickoff'
  and start_time > now();

alter function public.apply_hollywood_tournament_crawl_classified(
  uuid, integer, integer, text, timestamptz, jsonb, numeric, integer
) rename to apply_hollywood_tournament_crawl_classified_core;

revoke all on function public.apply_hollywood_tournament_crawl_classified_core(
  uuid, integer, integer, text, timestamptz, jsonb, numeric, integer
) from public, anon, authenticated;
grant execute on function public.apply_hollywood_tournament_crawl_classified_core(
  uuid, integer, integer, text, timestamptz, jsonb, numeric, integer
) to service_role;

create function public.apply_hollywood_tournament_crawl_classified(
  p_crawl_key uuid,
  p_category_id integer,
  p_tournament_id integer,
  p_tournament text,
  p_observed_at timestamptz,
  p_events jsonb,
  p_drift_pp numeric,
  p_confirm_removal_after integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_result jsonb;
  v_pending integer;
begin
  v_result := public.apply_hollywood_tournament_crawl_classified_core(
    p_crawl_key, p_category_id, p_tournament_id, p_tournament,
    p_observed_at, p_events, p_drift_pp, p_confirm_removal_after
  );
  if v_result ? 'verification_pending' then
    return v_result;
  end if;

  select count(*)::integer into v_pending
  from public.hw_change
  where crawl_key = p_crawl_key and kind = 'pending_removal';

  v_result := jsonb_set(
    v_result,
    '{removed}',
    to_jsonb(greatest(coalesce((v_result->>'removed')::integer, 0) - v_pending, 0)),
    true
  );
  v_result := jsonb_set(v_result, '{verification_pending}', to_jsonb(v_pending), true);

  update public.hw_crawl_state
  set last_result = v_result
  where category_id = p_category_id and tournament_id = p_tournament_id;
  return v_result;
end
$function$;

revoke all on function public.apply_hollywood_tournament_crawl_classified(
  uuid, integer, integer, text, timestamptz, jsonb, numeric, integer
) from public, anon, authenticated;
grant execute on function public.apply_hollywood_tournament_crawl_classified(
  uuid, integer, integer, text, timestamptz, jsonb, numeric, integer
) to service_role;

create function public.claim_hollywood_status_verifications(p_limit integer default 5)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_today date := (clock_timestamp() at time zone 'UTC')::date;
  v_event record;
  v_candidates jsonb := '[]'::jsonb;
  v_event_ids bigint[] := array[]::bigint[];
  v_dates date[] := array[]::date[];
  v_date date;
  v_used integer;
begin
  if p_limit is null or p_limit < 1 or p_limit > 5 then
    raise exception 'Hollywood verification batch limit must be between 1 and 5';
  end if;
  perform pg_advisory_xact_lock(hashtext('scoreline.hollywood.status-verification')::bigint);

  for v_event in
    select event.event_id, event.home_team, event.away_team,
      event.tournament, event.country, event.start_time
    from public.hw_event as event
    where event.lifecycle_state = 'pending_removal'
      and event.verification_status = 'pending'
      and event.verification_attempts < 3
      and event.verification_next_attempt_at <= v_now
      and event.start_time > v_now
      and event.removed_at is not null
      and event.home_team is not null
      and event.away_team is not null
    order by event.removed_at, event.event_id
    limit p_limit
    for update skip locked
  loop
    v_candidates := v_candidates || jsonb_build_array(jsonb_build_object(
      'episode_id', v_event.event_id::text,
      'provider_event_id', v_event.event_id::text,
      'home_team', v_event.home_team,
      'away_team', v_event.away_team,
      'competition', concat_ws(', ', v_event.tournament, v_event.country),
      'kickoff_utc', v_event.start_time
    ));
    v_event_ids := array_append(v_event_ids, v_event.event_id);
    for v_date in
      select (v_event.start_time at time zone 'UTC')::date + day_offset
      from generate_series(-1, 1) as day_offset
    loop
      if not (v_date = any(v_dates)) then v_dates := array_append(v_dates, v_date); end if;
    end loop;
  end loop;

  select coalesce(usage.request_count, 0) into v_used
  from public.bw_status_verification_usage as usage
  where usage.usage_date = v_today;
  v_used := coalesce(v_used, 0);

  if cardinality(v_event_ids) = 0 then
    return jsonb_build_object(
      'candidates', '[]'::jsonb, 'allowed_dates', '[]'::jsonb,
      'daily_budget_remaining', greatest(80 - v_used, 0)
    );
  end if;
  if v_used + cardinality(v_dates) > 80 then
    return jsonb_build_object(
      'candidates', '[]'::jsonb, 'allowed_dates', '[]'::jsonb,
      'daily_budget_remaining', greatest(80 - v_used, 0),
      'reason', 'shared_daily_budget_exhausted'
    );
  end if;

  insert into public.bw_status_verification_usage (usage_date, request_count, updated_at)
  values (v_today, cardinality(v_dates), v_now)
  on conflict (usage_date) do update
  set request_count = public.bw_status_verification_usage.request_count + excluded.request_count,
      updated_at = excluded.updated_at;

  update public.hw_event
  set verification_attempts = verification_attempts + 1,
      verification_last_attempt_at = v_now,
      verification_next_attempt_at = v_now + interval '1 hour'
  where event_id = any(v_event_ids);

  return jsonb_build_object(
    'candidates', v_candidates,
    'allowed_dates', to_jsonb(v_dates),
    'daily_budget_remaining', 80 - v_used - cardinality(v_dates)
  );
end
$function$;

revoke all on function public.claim_hollywood_status_verifications(integer)
  from public, anon, authenticated;
grant execute on function public.claim_hollywood_status_verifications(integer) to service_role;

create function public.resolve_hollywood_status_verifications(p_results jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_result jsonb;
  v_event_id bigint;
  v_decision text;
  v_state text;
  v_kind text;
  v_processed integer := 0;
  v_verified integer := 0;
  v_rejected integer := 0;
  v_unverified integer := 0;
begin
  if jsonb_typeof(p_results) is distinct from 'array' or jsonb_array_length(p_results) > 5 then
    raise exception 'Hollywood verification results must be an array with at most five items';
  end if;

  for v_result in select value from jsonb_array_elements(p_results)
  loop
    v_event_id := nullif(v_result->>'episode_id', '')::bigint;
    v_decision := v_result->>'decision';
    if v_event_id is null or v_decision not in (
      'verified', 'cancelled', 'postponed', 'rescheduled', 'suspended',
      'abandoned', 'started', 'finished', 'unverified'
    ) then
      raise exception 'Invalid Hollywood status verification result';
    end if;

    perform 1 from public.hw_event
    where event_id = v_event_id
      and lifecycle_state = 'pending_removal'
      and verification_status = 'pending'
    for update;
    if not found then continue; end if;

    insert into public.hw_status_verification_attempt (
      event_id, decision, reason, source_status, source_fixture_id, source_kickoff
    ) values (
      v_event_id, v_decision, nullif(v_result->>'reason', ''),
      nullif(v_result->>'source_status', ''),
      nullif(v_result->>'source_fixture_id', ''),
      nullif(v_result->>'source_kickoff_utc', '')::timestamptz
    );

    if v_decision = 'verified' then
      update public.hw_event
      set verification_status = 'verified',
          lifecycle_state = 'removed_pre_kickoff',
          verification_reason = null,
          verification_source_status = nullif(v_result->>'source_status', ''),
          verification_source_fixture_id = nullif(v_result->>'source_fixture_id', ''),
          verification_source_kickoff = nullif(v_result->>'source_kickoff_utc', '')::timestamptz
      where event_id = v_event_id;
      insert into public.hw_change (observed_at, event_id, kind, before_odds)
      select now(), event_id, 'removed',
        case when odds_home is not null and odds_draw is not null and odds_away is not null
          then jsonb_build_object('home', odds_home, 'draw', odds_draw, 'away', odds_away) end
      from public.hw_event where event_id = v_event_id;
      v_verified := v_verified + 1;
    elsif v_decision = 'unverified' then
      update public.hw_event
      set verification_reason = nullif(v_result->>'reason', ''),
          verification_source_status = nullif(v_result->>'source_status', ''),
          verification_source_fixture_id = nullif(v_result->>'source_fixture_id', ''),
          verification_source_kickoff = nullif(v_result->>'source_kickoff_utc', '')::timestamptz
      where event_id = v_event_id;
      v_unverified := v_unverified + 1;
    else
      v_state := case v_decision
        when 'cancelled' then 'cancelled'
        when 'postponed' then 'postponed'
        when 'rescheduled' then 'rescheduled'
        when 'suspended' then 'suspended'
        when 'abandoned' then 'abandoned'
        when 'started' then 'started'
        when 'finished' then 'expired'
      end;
      v_kind := case when v_decision = 'finished' then 'expired' else v_decision end;
      update public.hw_event
      set lifecycle_state = v_state,
          verification_status = 'rejected',
          verification_reason = nullif(v_result->>'reason', ''),
          verification_source_status = nullif(v_result->>'source_status', ''),
          verification_source_fixture_id = nullif(v_result->>'source_fixture_id', ''),
          verification_source_kickoff = nullif(v_result->>'source_kickoff_utc', '')::timestamptz,
          removed_at = null,
          missing_count = 0
      where event_id = v_event_id;
      insert into public.hw_change (observed_at, event_id, kind)
      values (now(), v_event_id, v_kind);
      v_rejected := v_rejected + 1;
    end if;
    v_processed := v_processed + 1;
  end loop;
  return jsonb_build_object(
    'processed', v_processed, 'verified', v_verified,
    'rejected', v_rejected, 'unverified', v_unverified
  );
end
$function$;

revoke all on function public.resolve_hollywood_status_verifications(jsonb)
  from public, anon, authenticated;
grant execute on function public.resolve_hollywood_status_verifications(jsonb) to service_role;

-- Extend Betway's independent verifier with the official SUSP/INT and ABD
-- meanings instead of folding them into started/finished.
alter table public.bw_event
  drop constraint bw_event_lifecycle_state_check,
  add constraint bw_event_lifecycle_state_check check (lifecycle_state in (
    'active', 'suspended', 'pending_removal', 'removed_pre_kickoff',
    'reopened', 'rescheduled', 'started', 'expired', 'cancelled',
    'postponed', 'abandoned'
  ));
alter table public.bw_removal_episode
  drop constraint bw_removal_episode_state_check,
  add constraint bw_removal_episode_state_check check (state in (
    'pending', 'confirmed', 'reopened', 'started', 'expired', 'rescheduled',
    'cancelled', 'postponed', 'suspended', 'abandoned'
  ));
alter table public.bw_change
  drop constraint bw_change_change_type_check,
  add constraint bw_change_change_type_check check (change_type in (
    'first_seen', 'odds_changed', 'fixture_suspended', 'fixture_reopened',
    'market_suspended', 'market_reopened', 'market_unavailable',
    'pending_removal', 'removed_pre_kickoff', 'reopened', 'rescheduled',
    'expired', 'cancelled', 'postponed', 'suspended', 'abandoned'
  ));
alter table public.bw_status_verification_attempt
  drop constraint bw_status_verification_attempt_decision_check,
  add constraint bw_status_verification_attempt_decision_check check (decision in (
    'verified', 'cancelled', 'postponed', 'rescheduled', 'suspended',
    'abandoned', 'started', 'finished', 'unverified'
  ));

create or replace function public.resolve_betway_status_verifications(p_results jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_result jsonb;
  v_episode_id uuid;
  v_event_id text;
  v_decision text;
  v_state text;
  v_change_type text;
  v_processed integer := 0;
  v_verified integer := 0;
  v_rejected integer := 0;
  v_unverified integer := 0;
begin
  if jsonb_typeof(p_results) is distinct from 'array' or jsonb_array_length(p_results) > 5 then
    raise exception 'Betway verification results must be an array with at most five items';
  end if;
  for v_result in select value from jsonb_array_elements(p_results)
  loop
    v_episode_id := nullif(v_result->>'episode_id', '')::uuid;
    v_decision := v_result->>'decision';
    if v_episode_id is null or v_decision not in (
      'verified', 'cancelled', 'postponed', 'rescheduled', 'suspended',
      'abandoned', 'started', 'finished', 'unverified'
    ) then raise exception 'Invalid Betway status verification result'; end if;

    select episode.provider_event_id into v_event_id
    from public.bw_removal_episode as episode
    where episode.episode_id = v_episode_id
      and episode.state = 'confirmed'
      and episode.verification_status = 'unverified'
    for update;
    if not found then continue; end if;

    insert into public.bw_status_verification_attempt (
      episode_id, decision, reason, source_status, source_fixture_id, source_kickoff
    ) values (
      v_episode_id, v_decision, nullif(v_result->>'reason', ''),
      nullif(v_result->>'source_status', ''),
      nullif(v_result->>'source_fixture_id', ''),
      nullif(v_result->>'source_kickoff_utc', '')::timestamptz
    );

    if v_decision = 'verified' then
      update public.bw_removal_episode
      set verification_status = 'verified', verification_reason = null,
          verification_source_status = nullif(v_result->>'source_status', ''),
          verification_source_fixture_id = nullif(v_result->>'source_fixture_id', ''),
          verification_source_kickoff = nullif(v_result->>'source_kickoff_utc', '')::timestamptz
      where episode_id = v_episode_id;
      v_verified := v_verified + 1;
    elsif v_decision = 'unverified' then
      update public.bw_removal_episode
      set verification_reason = nullif(v_result->>'reason', ''),
          verification_source_status = nullif(v_result->>'source_status', ''),
          verification_source_fixture_id = nullif(v_result->>'source_fixture_id', ''),
          verification_source_kickoff = nullif(v_result->>'source_kickoff_utc', '')::timestamptz
      where episode_id = v_episode_id;
      v_unverified := v_unverified + 1;
    else
      v_state := case v_decision
        when 'cancelled' then 'cancelled'
        when 'postponed' then 'postponed'
        when 'rescheduled' then 'rescheduled'
        when 'suspended' then 'suspended'
        when 'abandoned' then 'abandoned'
        when 'started' then 'started'
        when 'finished' then 'expired'
      end;
      v_change_type := case when v_decision = 'finished' then 'expired' else v_decision end;
      update public.bw_removal_episode
      set state = v_state, verification_status = 'rejected',
          verification_reason = nullif(v_result->>'reason', ''),
          verification_source_status = nullif(v_result->>'source_status', ''),
          verification_source_fixture_id = nullif(v_result->>'source_fixture_id', ''),
          verification_source_kickoff = nullif(v_result->>'source_kickoff_utc', '')::timestamptz,
          ended_at = now()
      where episode_id = v_episode_id;
      update public.bw_event
      set lifecycle_state = v_state, removed_at = null, updated_at = now()
      where provider_event_id = v_event_id;
      insert into public.bw_change (
        provider_event_id, run_id, observed_at, change_type, old_values, new_values
      )
      select v_event_id, episode.last_run_id, now(), v_change_type,
        jsonb_build_object('lifecycle_state', 'removed_pre_kickoff'),
        jsonb_build_object(
          'lifecycle_state', v_state, 'verification_status', 'rejected',
          'source_status', nullif(v_result->>'source_status', ''),
          'source_fixture_id', nullif(v_result->>'source_fixture_id', ''),
          'source_kickoff_utc', nullif(v_result->>'source_kickoff_utc', '')
        )
      from public.bw_removal_episode as episode where episode.episode_id = v_episode_id;
      v_rejected := v_rejected + 1;
    end if;
    v_processed := v_processed + 1;
  end loop;
  return jsonb_build_object(
    'processed', v_processed, 'verified', v_verified,
    'rejected', v_rejected, 'unverified', v_unverified
  );
end
$function$;

revoke all on function public.resolve_betway_status_verifications(jsonb)
  from public, anon, authenticated;
grant execute on function public.resolve_betway_status_verifications(jsonb) to service_role;

-- Schedule the Hollywood verifier separately from the one-minute crawl and
-- offset it from Betway's verifier. Both share the API-Football daily budget.
select cron.unschedule(jobid)
from cron.job
where jobname = 'hollywood-verify-every-fifteen-minutes';

select cron.schedule(
  'hollywood-verify-every-fifteen-minutes',
  '7,22,37,52 * * * *',
  $job$
    select net.http_post(
      url := coalesce((
        select decrypted_secret from vault.decrypted_secrets
        where name = 'hollywood_hunt_project_url' limit 1
      ), 'https://zymspnykcnqczqdnernb.supabase.co') || '/functions/v1/hollywood-verify',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', coalesce((
          select decrypted_secret from vault.decrypted_secrets
          where name = 'hollywood_hunt_cron_secret' limit 1
        ), '')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 140000
    );
  $job$
);

commit;
