begin;

alter table public.bw_event
  drop constraint bw_event_lifecycle_state_check,
  add constraint bw_event_lifecycle_state_check check (
    lifecycle_state in (
      'active',
      'suspended',
      'pending_removal',
      'removed_pre_kickoff',
      'reopened',
      'rescheduled',
      'started',
      'expired',
      'cancelled',
      'postponed'
    )
  );

alter table public.bw_removal_episode
  drop constraint bw_removal_episode_state_check,
  add constraint bw_removal_episode_state_check check (
    state in (
      'pending',
      'confirmed',
      'reopened',
      'started',
      'expired',
      'rescheduled',
      'cancelled',
      'postponed'
    )
  );

alter table public.bw_change
  drop constraint bw_change_change_type_check,
  add constraint bw_change_change_type_check check (
    change_type in (
      'first_seen',
      'odds_changed',
      'fixture_suspended',
      'fixture_reopened',
      'market_suspended',
      'market_reopened',
      'market_unavailable',
      'pending_removal',
      'removed_pre_kickoff',
      'reopened',
      'rescheduled',
      'expired',
      'cancelled',
      'postponed'
    )
  );

alter table public.bw_removal_episode
  add column verification_attempts smallint not null default 0
    check (verification_attempts >= 0),
  add column verification_next_attempt_at timestamptz not null default now(),
  add column verification_last_attempt_at timestamptz,
  add column verification_reason text,
  add column verification_source_status text,
  add column verification_source_fixture_id text,
  add column verification_source_kickoff timestamptz;

create table public.bw_status_verification_usage (
  usage_date date primary key,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now()
);

create table public.bw_status_verification_attempt (
  attempt_id bigint generated always as identity primary key,
  episode_id uuid not null references public.bw_removal_episode (episode_id),
  attempted_at timestamptz not null default now(),
  decision text not null check (
    decision in (
      'verified',
      'cancelled',
      'postponed',
      'rescheduled',
      'started',
      'finished',
      'unverified'
    )
  ),
  reason text,
  source_status text,
  source_fixture_id text,
  source_kickoff timestamptz
);

create index bw_status_verification_attempt_episode_idx
  on public.bw_status_verification_attempt (episode_id, attempted_at desc);

alter table public.bw_status_verification_usage enable row level security;
alter table public.bw_status_verification_attempt enable row level security;
revoke all on public.bw_status_verification_usage from anon, authenticated;
revoke all on public.bw_status_verification_attempt from anon, authenticated;
grant all on public.bw_status_verification_usage to service_role;
grant all on public.bw_status_verification_attempt to service_role;
grant usage, select on sequence
  public.bw_status_verification_attempt_attempt_id_seq
to service_role;

create or replace function public.claim_betway_status_verifications(p_limit integer default 5)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_today date := (clock_timestamp() at time zone 'UTC')::date;
  v_episode record;
  v_candidates jsonb := '[]'::jsonb;
  v_episode_ids uuid[] := array[]::uuid[];
  v_dates date[] := array[]::date[];
  v_date date;
  v_used integer;
begin
  if p_limit is null or p_limit < 1 or p_limit > 5 then
    raise exception 'Betway verification batch limit must be between 1 and 5';
  end if;

  perform pg_advisory_xact_lock(hashtext('scoreline.betway.status-verification')::bigint);

  for v_episode in
    select
      episode.episode_id,
      episode.provider_event_id,
      event.home_team,
      event.away_team,
      event.competition,
      event.start_time
    from public.bw_removal_episode as episode
    join public.bw_event as event using (provider_event_id)
    where episode.state = 'confirmed'
      and episode.verification_status = 'unverified'
      and episode.verification_attempts < 3
      and episode.verification_next_attempt_at <= v_now
      and event.start_time > v_now
    order by episode.confirmed_at, episode.episode_id
    limit p_limit
    for update of episode skip locked
  loop
    v_candidates := v_candidates || jsonb_build_array(jsonb_build_object(
      'episode_id', v_episode.episode_id,
      'provider_event_id', v_episode.provider_event_id,
      'home_team', v_episode.home_team,
      'away_team', v_episode.away_team,
      'competition', v_episode.competition,
      'kickoff_utc', v_episode.start_time
    ));
    v_episode_ids := array_append(v_episode_ids, v_episode.episode_id);

    for v_date in
      select (v_episode.start_time at time zone 'UTC')::date + day_offset
      from generate_series(-1, 1) as day_offset
    loop
      if not (v_date = any(v_dates)) then
        v_dates := array_append(v_dates, v_date);
      end if;
    end loop;
  end loop;

  if cardinality(v_episode_ids) = 0 then
    return jsonb_build_object(
      'candidates', '[]'::jsonb,
      'allowed_dates', '[]'::jsonb,
      'daily_budget_remaining', greatest(
        80 - coalesce((
          select usage.request_count
          from public.bw_status_verification_usage as usage
          where usage.usage_date = v_today
        ), 0),
        0
      )
    );
  end if;

  select coalesce(usage.request_count, 0)
  into v_used
  from public.bw_status_verification_usage as usage
  where usage.usage_date = v_today;
  v_used := coalesce(v_used, 0);

  if v_used + cardinality(v_dates) > 80 then
    return jsonb_build_object(
      'candidates', '[]'::jsonb,
      'allowed_dates', '[]'::jsonb,
      'daily_budget_remaining', greatest(80 - v_used, 0),
      'reason', 'daily_budget_exhausted'
    );
  end if;

  insert into public.bw_status_verification_usage (usage_date, request_count, updated_at)
  values (v_today, cardinality(v_dates), v_now)
  on conflict (usage_date) do update
  set request_count = public.bw_status_verification_usage.request_count + excluded.request_count,
      updated_at = excluded.updated_at;

  update public.bw_removal_episode
  set verification_attempts = verification_attempts + 1,
      verification_last_attempt_at = v_now,
      verification_next_attempt_at = v_now + interval '1 hour'
  where episode_id = any(v_episode_ids);

  return jsonb_build_object(
    'candidates', v_candidates,
    'allowed_dates', to_jsonb(v_dates),
    'daily_budget_remaining', 80 - v_used - cardinality(v_dates)
  );
end;
$$;

revoke all on function public.claim_betway_status_verifications(integer)
  from public, anon, authenticated;
grant execute on function public.claim_betway_status_verifications(integer) to service_role;

create or replace function public.resolve_betway_status_verifications(p_results jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
  if jsonb_typeof(p_results) is distinct from 'array'
     or jsonb_array_length(p_results) > 5 then
    raise exception 'Betway verification results must be an array with at most five items';
  end if;

  for v_result in select value from jsonb_array_elements(p_results)
  loop
    v_episode_id := nullif(v_result->>'episode_id', '')::uuid;
    v_decision := v_result->>'decision';
    if v_episode_id is null or v_decision not in (
      'verified', 'cancelled', 'postponed', 'rescheduled',
      'started', 'finished', 'unverified'
    ) then
      raise exception 'Invalid Betway status verification result';
    end if;

    select episode.provider_event_id
    into v_event_id
    from public.bw_removal_episode as episode
    where episode.episode_id = v_episode_id
      and episode.state = 'confirmed'
      and episode.verification_status = 'unverified'
    for update;

    if not found then
      continue;
    end if;

    insert into public.bw_status_verification_attempt (
      episode_id,
      decision,
      reason,
      source_status,
      source_fixture_id,
      source_kickoff
    )
    values (
      v_episode_id,
      v_decision,
      nullif(v_result->>'reason', ''),
      nullif(v_result->>'source_status', ''),
      nullif(v_result->>'source_fixture_id', ''),
      nullif(v_result->>'source_kickoff_utc', '')::timestamptz
    );

    if v_decision = 'verified' then
      update public.bw_removal_episode
      set verification_status = 'verified',
          verification_reason = null,
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
        when 'started' then 'started'
        when 'finished' then 'expired'
      end;
      v_change_type := case
        when v_decision = 'finished' then 'expired'
        else v_decision
      end;

      update public.bw_removal_episode
      set state = v_state,
          verification_status = 'rejected',
          verification_reason = nullif(v_result->>'reason', ''),
          verification_source_status = nullif(v_result->>'source_status', ''),
          verification_source_fixture_id = nullif(v_result->>'source_fixture_id', ''),
          verification_source_kickoff = nullif(v_result->>'source_kickoff_utc', '')::timestamptz,
          ended_at = now()
      where episode_id = v_episode_id;

      update public.bw_event
      set lifecycle_state = v_state,
          removed_at = null,
          updated_at = now()
      where provider_event_id = v_event_id;

      insert into public.bw_change (
        provider_event_id, run_id, observed_at, change_type, old_values, new_values
      )
      select
        v_event_id,
        episode.last_run_id,
        now(),
        v_change_type,
        jsonb_build_object('lifecycle_state', 'removed_pre_kickoff'),
        jsonb_build_object(
          'lifecycle_state', v_state,
          'verification_status', 'rejected',
          'source_status', nullif(v_result->>'source_status', ''),
          'source_fixture_id', nullif(v_result->>'source_fixture_id', ''),
          'source_kickoff_utc', nullif(v_result->>'source_kickoff_utc', '')
        )
      from public.bw_removal_episode as episode
      where episode.episode_id = v_episode_id;
      v_rejected := v_rejected + 1;
    end if;
    v_processed := v_processed + 1;
  end loop;

  return jsonb_build_object(
    'processed', v_processed,
    'verified', v_verified,
    'rejected', v_rejected,
    'unverified', v_unverified
  );
end;
$$;

revoke all on function public.resolve_betway_status_verifications(jsonb)
  from public, anon, authenticated;
grant execute on function public.resolve_betway_status_verifications(jsonb) to service_role;

commit;
