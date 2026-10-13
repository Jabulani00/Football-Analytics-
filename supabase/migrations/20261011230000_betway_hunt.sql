begin;

create table if not exists public.bw_crawl_run (
  run_id uuid primary key default gen_random_uuid(),
  captured_at timestamptz not null,
  completed_at timestamptz not null default now(),
  status text not null check (status in ('complete', 'failed')),
  pages_captured integer not null default 0 check (pages_captured >= 0),
  source_event_count integer not null default 0 check (source_event_count >= 0),
  excluded_event_count integer not null default 0 check (excluded_event_count >= 0),
  fixture_count integer not null default 0 check (fixture_count >= 0),
  failure_message text
);

create index if not exists bw_crawl_run_captured_at_idx
  on public.bw_crawl_run (captured_at desc);

create table if not exists public.bw_event (
  provider_event_id text primary key,
  home_team text not null,
  away_team text not null,
  competition text,
  start_time timestamptz not null,
  fixture_status text not null check (fixture_status in ('active', 'suspended')),
  lifecycle_state text not null check (
    lifecycle_state in (
      'active',
      'suspended',
      'pending_removal',
      'removed_pre_kickoff',
      'reopened',
      'rescheduled',
      'started',
      'expired'
    )
  ),
  odds_home numeric(10, 4) check (odds_home is null or odds_home >= 1),
  odds_draw numeric(10, 4) check (odds_draw is null or odds_draw >= 1),
  odds_away numeric(10, 4) check (odds_away is null or odds_away >= 1),
  market_open boolean not null,
  market_suspended boolean not null,
  missing_count integer not null default 0 check (missing_count >= 0),
  missing_since timestamptz,
  last_missing_at timestamptz,
  last_seen_at timestamptz not null,
  removed_at timestamptz,
  current_run_id uuid references public.bw_crawl_run (run_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bw_event_current_idx
  on public.bw_event (start_time asc)
  where lifecycle_state in ('active', 'suspended', 'pending_removal');
create index if not exists bw_event_removed_idx
  on public.bw_event (removed_at desc)
  where lifecycle_state = 'removed_pre_kickoff';

create table if not exists public.bw_removal_episode (
  episode_id uuid primary key default gen_random_uuid(),
  provider_event_id text not null references public.bw_event (provider_event_id),
  episode_number integer not null check (episode_number > 0),
  state text not null check (
    state in ('pending', 'confirmed', 'reopened', 'started', 'expired', 'rescheduled')
  ),
  verification_status text not null default 'unverified' check (
    verification_status in ('unverified', 'verified', 'rejected')
  ),
  missing_crawls integer not null default 1 check (missing_crawls > 0),
  missing_since timestamptz not null,
  last_missing_at timestamptz not null,
  confirmed_at timestamptz,
  ended_at timestamptz,
  odds_home numeric(10, 4),
  odds_draw numeric(10, 4),
  odds_away numeric(10, 4),
  last_run_id uuid not null references public.bw_crawl_run (run_id),
  created_at timestamptz not null default now(),
  unique (provider_event_id, episode_number)
);

create unique index if not exists bw_removal_episode_open_idx
  on public.bw_removal_episode (provider_event_id)
  where state in ('pending', 'confirmed');
create index if not exists bw_removal_episode_confirmed_idx
  on public.bw_removal_episode (confirmed_at desc)
  where state = 'confirmed';

create table if not exists public.bw_odds_history (
  history_id bigint generated always as identity primary key,
  provider_event_id text not null references public.bw_event (provider_event_id),
  run_id uuid not null references public.bw_crawl_run (run_id),
  observed_at timestamptz not null,
  odds_home numeric(10, 4),
  odds_draw numeric(10, 4),
  odds_away numeric(10, 4),
  market_open boolean not null,
  market_suspended boolean not null
);

create index if not exists bw_odds_history_event_time_idx
  on public.bw_odds_history (provider_event_id, observed_at desc);

create table if not exists public.bw_change (
  change_id bigint generated always as identity primary key,
  provider_event_id text not null references public.bw_event (provider_event_id),
  run_id uuid not null references public.bw_crawl_run (run_id),
  observed_at timestamptz not null,
  change_type text not null check (
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
      'expired'
    )
  ),
  old_values jsonb,
  new_values jsonb
);

create index if not exists bw_change_observed_at_idx
  on public.bw_change (observed_at desc);
create index if not exists bw_change_event_observed_idx
  on public.bw_change (provider_event_id, observed_at desc);

alter table public.bw_crawl_run enable row level security;
alter table public.bw_event enable row level security;
alter table public.bw_removal_episode enable row level security;
alter table public.bw_odds_history enable row level security;
alter table public.bw_change enable row level security;

revoke all on public.bw_crawl_run from anon, authenticated;
revoke all on public.bw_event from anon, authenticated;
revoke all on public.bw_removal_episode from anon, authenticated;
revoke all on public.bw_odds_history from anon, authenticated;
revoke all on public.bw_change from anon, authenticated;
grant all on public.bw_crawl_run to service_role;
grant all on public.bw_event to service_role;
grant all on public.bw_removal_episode to service_role;
grant all on public.bw_odds_history to service_role;
grant all on public.bw_change to service_role;
grant usage, select on sequence
  public.bw_odds_history_history_id_seq,
  public.bw_change_change_id_seq
to service_role;

create or replace function public.record_betway_crawl_failure(p_error text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run_id uuid;
begin
  insert into public.bw_crawl_run (
    captured_at,
    status,
    failure_message
  )
  values (
    now(),
    'failed',
    left(coalesce(nullif(trim(p_error), ''), 'Unknown Betway capture failure'), 1000)
  )
  returning run_id into v_run_id;

  return v_run_id;
end;
$$;

revoke all on function public.record_betway_crawl_failure(text)
  from public, anon, authenticated;
grant execute on function public.record_betway_crawl_failure(text) to service_role;

create or replace function public.apply_betway_snapshot(p_snapshot jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_captured_at timestamptz;
  v_fixtures jsonb;
  v_run_id uuid;
  v_fixture jsonb;
  v_event_id text;
  v_home_team text;
  v_away_team text;
  v_competition text;
  v_start_time timestamptz;
  v_fixture_status text;
  v_odds_home numeric(10, 4);
  v_odds_draw numeric(10, 4);
  v_odds_away numeric(10, 4);
  v_market_open boolean;
  v_market_suspended boolean;
  v_existing public.bw_event%rowtype;
  v_had_existing boolean;
  v_reappeared boolean;
  v_same_id_rescheduled boolean;
  v_odds_changed boolean;
  v_incoming_count integer;
  v_previous_count integer;
  v_required_confirmations integer;
  v_next_missing_count integer;
  v_missing_since timestamptz;
  v_is_rescheduled boolean;
  v_is_confirmed boolean;
  v_episode_id uuid;
  v_episode_number integer;
  v_changed_count integer := 0;
  v_removed_count integer := 0;
  v_pending_count integer := 0;
begin
  if jsonb_typeof(p_snapshot) is distinct from 'object'
     or p_snapshot->>'complete' is distinct from 'true'
     or jsonb_typeof(p_snapshot->'complete') is distinct from 'boolean'
     or jsonb_typeof(p_snapshot->'fixtures') is distinct from 'array' then
    raise exception 'Refusing to apply an incomplete Betway snapshot';
  end if;

  if coalesce(p_snapshot->>'captured_at', '') = '' then
    raise exception 'Betway snapshot has no capture timestamp';
  end if;
  v_captured_at := (p_snapshot->>'captured_at')::timestamptz;
  v_fixtures := p_snapshot->'fixtures';
  v_incoming_count := jsonb_array_length(v_fixtures);

  if coalesce((p_snapshot->>'pages_captured')::integer, 0) < 1
     or coalesce((p_snapshot->>'source_event_count')::integer, 0) < v_incoming_count then
    raise exception 'Betway snapshot completeness metadata is invalid';
  end if;
  if v_incoming_count = 0
     and coalesce((p_snapshot->>'source_event_count')::integer, 0) <> 0 then
    raise exception 'Betway snapshot excluded every source event';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_fixtures) as item(value)
    where coalesce(item.value->>'provider_event_id', '') = ''
       or coalesce(item.value->>'home_name', '') = ''
       or coalesce(item.value->>'away_name', '') = ''
       or coalesce(item.value->>'kickoff_utc', '') = ''
       or coalesce(item.value->>'fixture_status', '') not in ('active', 'suspended')
       or coalesce(item.value->>'market_open', '') not in ('true', 'false')
       or coalesce(item.value->>'market_suspended', '') not in ('true', 'false')
       or (
         item.value->>'market_open' = 'true'
         and item.value->>'market_suspended' = 'true'
       )
  ) then
    raise exception 'Betway snapshot contains an invalid fixture';
  end if;

  if v_incoming_count <> (
    select count(distinct item.value->>'provider_event_id')
    from jsonb_array_elements(v_fixtures) as item(value)
  ) then
    raise exception 'Betway snapshot contains repeated event IDs';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_fixtures) as item(value)
    where (item.value->>'kickoff_utc')::timestamptz <= v_captured_at
  ) then
    raise exception 'Betway pre-match snapshot contains a started fixture';
  end if;

  perform pg_advisory_xact_lock(hashtext('scoreline.betway.snapshot')::bigint);

  if exists (
    select 1
    from public.bw_crawl_run
    where status = 'complete'
      and captured_at >= v_captured_at
  ) then
    raise exception 'Out-of-order Betway snapshot rejected';
  end if;

  select count(*)::integer
  into v_previous_count
  from public.bw_event
  where lifecycle_state in (
      'active', 'pending_removal', 'reopened', 'rescheduled'
    )
    and fixture_status = 'active'
    and start_time > v_captured_at;

  v_required_confirmations := case
    when v_incoming_count = 0
      or (v_previous_count >= 5 and v_incoming_count * 2 < v_previous_count) then 3
    else 2
  end;

  insert into public.bw_crawl_run (
    captured_at,
    status,
    pages_captured,
    source_event_count,
    excluded_event_count,
    fixture_count
  )
  values (
    v_captured_at,
    'complete',
    (p_snapshot->>'pages_captured')::integer,
    (p_snapshot->>'source_event_count')::integer,
    coalesce((p_snapshot->>'excluded_event_count')::integer, 0),
    v_incoming_count
  )
  returning run_id into v_run_id;

  for v_fixture in
    select item.value
    from jsonb_array_elements(v_fixtures) as item(value)
  loop
    v_event_id := v_fixture->>'provider_event_id';
    v_home_team := trim(v_fixture->>'home_name');
    v_away_team := trim(v_fixture->>'away_name');
    v_competition := nullif(trim(v_fixture->>'competition'), '');
    v_start_time := (v_fixture->>'kickoff_utc')::timestamptz;
    v_fixture_status := v_fixture->>'fixture_status';
    v_odds_home := nullif(v_fixture->>'odds_home', '')::numeric;
    v_odds_draw := nullif(v_fixture->>'odds_draw', '')::numeric;
    v_odds_away := nullif(v_fixture->>'odds_away', '')::numeric;
    v_market_open := (v_fixture->>'market_open')::boolean;
    v_market_suspended := (v_fixture->>'market_suspended')::boolean;

    select *
    into v_existing
    from public.bw_event
    where provider_event_id = v_event_id
    for update;
    v_had_existing := found;
    v_reappeared := v_had_existing
      and (
        v_existing.removed_at is not null
        or v_existing.lifecycle_state in ('pending_removal', 'removed_pre_kickoff')
      );
    v_same_id_rescheduled := v_had_existing
      and v_existing.start_time is distinct from v_start_time;
    v_odds_changed := v_had_existing and (
      coalesce(v_existing.odds_home, -1) is distinct from coalesce(v_odds_home, v_existing.odds_home, -1)
      or coalesce(v_existing.odds_draw, -1) is distinct from coalesce(v_odds_draw, v_existing.odds_draw, -1)
      or coalesce(v_existing.odds_away, -1) is distinct from coalesce(v_odds_away, v_existing.odds_away, -1)
    );

    if v_reappeared then
      update public.bw_removal_episode
      set state = case when v_same_id_rescheduled then 'rescheduled' else 'reopened' end,
          ended_at = v_captured_at,
          last_run_id = v_run_id
      where provider_event_id = v_event_id
        and state in ('pending', 'confirmed');
    elsif v_same_id_rescheduled then
      update public.bw_removal_episode
      set state = 'rescheduled',
          ended_at = v_captured_at,
          last_run_id = v_run_id
      where provider_event_id = v_event_id
        and state in ('pending', 'confirmed');
    end if;

    insert into public.bw_event (
      provider_event_id,
      home_team,
      away_team,
      competition,
      start_time,
      fixture_status,
      lifecycle_state,
      odds_home,
      odds_draw,
      odds_away,
      market_open,
      market_suspended,
      missing_count,
      missing_since,
      last_missing_at,
      last_seen_at,
      removed_at,
      current_run_id,
      updated_at
    )
    values (
      v_event_id,
      v_home_team,
      v_away_team,
      v_competition,
      v_start_time,
      v_fixture_status,
      case
        when v_same_id_rescheduled then 'rescheduled'
        when v_reappeared then 'reopened'
        else v_fixture_status
      end,
      v_odds_home,
      v_odds_draw,
      v_odds_away,
      v_market_open,
      v_market_suspended,
      0,
      null,
      null,
      v_captured_at,
      null,
      v_run_id,
      now()
    )
    on conflict (provider_event_id) do update
    set home_team = excluded.home_team,
        away_team = excluded.away_team,
        competition = excluded.competition,
        start_time = excluded.start_time,
        fixture_status = excluded.fixture_status,
        lifecycle_state = excluded.lifecycle_state,
        odds_home = coalesce(excluded.odds_home, public.bw_event.odds_home),
        odds_draw = coalesce(excluded.odds_draw, public.bw_event.odds_draw),
        odds_away = coalesce(excluded.odds_away, public.bw_event.odds_away),
        market_open = excluded.market_open,
        market_suspended = excluded.market_suspended,
        missing_count = 0,
        missing_since = null,
        last_missing_at = null,
        last_seen_at = excluded.last_seen_at,
        removed_at = null,
        current_run_id = excluded.current_run_id,
        updated_at = now();

    if not v_had_existing then
      insert into public.bw_change (
        provider_event_id, run_id, observed_at, change_type, new_values
      )
      values (
        v_event_id, v_run_id, v_captured_at, 'first_seen',
        jsonb_build_object(
          'home_team', v_home_team,
          'away_team', v_away_team,
          'start_time', v_start_time,
          'fixture_status', v_fixture_status
        )
      );
    elsif v_same_id_rescheduled then
      insert into public.bw_change (
        provider_event_id, run_id, observed_at, change_type, old_values, new_values
      )
      values (
        v_event_id, v_run_id, v_captured_at, 'rescheduled',
        jsonb_build_object('start_time', v_existing.start_time),
        jsonb_build_object('start_time', v_start_time)
      );
    elsif v_reappeared then
      insert into public.bw_change (
        provider_event_id, run_id, observed_at, change_type, old_values, new_values
      )
      values (
        v_event_id, v_run_id, v_captured_at, 'reopened',
        jsonb_build_object('lifecycle_state', v_existing.lifecycle_state),
        jsonb_build_object('lifecycle_state', v_fixture_status)
      );
    end if;

    if v_had_existing and v_existing.fixture_status <> v_fixture_status then
      insert into public.bw_change (
        provider_event_id, run_id, observed_at, change_type, old_values, new_values
      )
      values (
        v_event_id, v_run_id, v_captured_at,
        case when v_fixture_status = 'suspended' then 'fixture_suspended' else 'fixture_reopened' end,
        jsonb_build_object('fixture_status', v_existing.fixture_status),
        jsonb_build_object('fixture_status', v_fixture_status)
      );
    end if;

    if v_had_existing and (
      v_existing.market_suspended is distinct from v_market_suspended
      or v_existing.market_open is distinct from v_market_open
    ) then
      insert into public.bw_change (
        provider_event_id, run_id, observed_at, change_type, old_values, new_values
      )
      values (
        v_event_id, v_run_id, v_captured_at,
        case
          when v_market_suspended then 'market_suspended'
          when v_market_open then 'market_reopened'
          else 'market_unavailable'
        end,
        jsonb_build_object(
          'market_open', v_existing.market_open,
          'market_suspended', v_existing.market_suspended
        ),
        jsonb_build_object(
          'market_open', v_market_open,
          'market_suspended', v_market_suspended
        )
      );
    end if;

    if v_odds_changed or (
      not v_had_existing
      and (v_odds_home is not null or v_odds_draw is not null or v_odds_away is not null)
    ) then
      if v_odds_changed then
        v_changed_count := v_changed_count + 1;
      end if;
      insert into public.bw_odds_history (
        provider_event_id, run_id, observed_at, odds_home, odds_draw, odds_away,
        market_open, market_suspended
      )
      select
        v_event_id,
        v_run_id,
        v_captured_at,
        odds_home,
        odds_draw,
        odds_away,
        market_open,
        market_suspended
      from public.bw_event
      where provider_event_id = v_event_id;

      if v_had_existing then
        insert into public.bw_change (
          provider_event_id, run_id, observed_at, change_type, old_values, new_values
        )
        values (
          v_event_id, v_run_id, v_captured_at, 'odds_changed',
          jsonb_build_object(
            'home', v_existing.odds_home,
            'draw', v_existing.odds_draw,
            'away', v_existing.odds_away
          ),
          jsonb_build_object(
            'home', coalesce(v_odds_home, v_existing.odds_home),
            'draw', coalesce(v_odds_draw, v_existing.odds_draw),
            'away', coalesce(v_odds_away, v_existing.odds_away)
          )
        );
      end if;
    end if;
  end loop;

  for v_existing in
    select event.*
    from public.bw_event as event
    where event.lifecycle_state in (
        'active', 'suspended', 'pending_removal', 'removed_pre_kickoff',
        'reopened', 'rescheduled'
      )
      and event.start_time <= v_captured_at
    for update
  loop
    if v_existing.lifecycle_state <> 'expired' then
      update public.bw_event
      set lifecycle_state = 'expired',
          missing_count = 0,
          missing_since = null,
          last_missing_at = null,
          updated_at = now()
      where provider_event_id = v_existing.provider_event_id;

      update public.bw_removal_episode
      set state = 'expired',
          ended_at = v_captured_at,
          last_run_id = v_run_id
      where provider_event_id = v_existing.provider_event_id
        and state in ('pending', 'confirmed');

      insert into public.bw_change (
        provider_event_id, run_id, observed_at, change_type, old_values, new_values
      )
      values (
        v_existing.provider_event_id, v_run_id, v_captured_at, 'expired',
        jsonb_build_object('lifecycle_state', v_existing.lifecycle_state),
        jsonb_build_object('lifecycle_state', 'expired')
      );
    end if;
  end loop;

  for v_existing in
    select event.*
    from public.bw_event as event
    where event.lifecycle_state in (
        'active', 'pending_removal', 'reopened', 'rescheduled'
      )
      and event.fixture_status = 'active'
      and event.start_time > v_captured_at
      and not exists (
        select 1
        from jsonb_array_elements(v_fixtures) as item(value)
        where item.value->>'provider_event_id' = event.provider_event_id
      )
    order by event.start_time
    for update
  loop
    select exists (
      select 1
      from jsonb_array_elements(v_fixtures) as item(value)
      where item.value->>'provider_event_id' <> v_existing.provider_event_id
        and lower(trim(item.value->>'home_name')) = lower(trim(v_existing.home_team))
        and lower(trim(item.value->>'away_name')) = lower(trim(v_existing.away_team))
        and coalesce(item.value->>'competition', '') = coalesce(v_existing.competition, '')
        and abs(extract(epoch from (
          (item.value->>'kickoff_utc')::timestamptz - v_existing.start_time
        ))) <= 14 * 24 * 60 * 60
    )
    into v_is_rescheduled;

    if v_is_rescheduled then
      update public.bw_event
      set lifecycle_state = 'rescheduled',
          missing_count = 0,
          missing_since = null,
          last_missing_at = null,
          updated_at = now()
      where provider_event_id = v_existing.provider_event_id;

      update public.bw_removal_episode
      set state = 'rescheduled',
          ended_at = v_captured_at,
          last_run_id = v_run_id
      where provider_event_id = v_existing.provider_event_id
        and state in ('pending', 'confirmed');

      insert into public.bw_change (
        provider_event_id, run_id, observed_at, change_type, old_values
      )
      values (
        v_existing.provider_event_id, v_run_id, v_captured_at, 'rescheduled',
        jsonb_build_object('start_time', v_existing.start_time)
      );
      continue;
    end if;

    v_next_missing_count := v_existing.missing_count + 1;
    v_missing_since := coalesce(v_existing.missing_since, v_captured_at);
    v_is_confirmed := v_next_missing_count >= v_required_confirmations;

    update public.bw_event
    set lifecycle_state = case
          when v_is_confirmed then 'removed_pre_kickoff'
          else 'pending_removal'
        end,
        missing_count = v_next_missing_count,
        missing_since = v_missing_since,
        last_missing_at = v_captured_at,
        removed_at = case when v_is_confirmed then v_captured_at else null end,
        updated_at = now()
    where provider_event_id = v_existing.provider_event_id;

    select episode_id
    into v_episode_id
    from public.bw_removal_episode
    where provider_event_id = v_existing.provider_event_id
      and state in ('pending', 'confirmed')
    order by episode_number desc
    limit 1
    for update;

    if v_episode_id is null then
      select coalesce(max(episode_number), 0) + 1
      into v_episode_number
      from public.bw_removal_episode
      where provider_event_id = v_existing.provider_event_id;

      insert into public.bw_removal_episode (
        provider_event_id,
        episode_number,
        state,
        missing_crawls,
        missing_since,
        last_missing_at,
        confirmed_at,
        odds_home,
        odds_draw,
        odds_away,
        last_run_id
      )
      values (
        v_existing.provider_event_id,
        v_episode_number,
        case when v_is_confirmed then 'confirmed' else 'pending' end,
        v_next_missing_count,
        v_missing_since,
        v_captured_at,
        case when v_is_confirmed then v_captured_at else null end,
        v_existing.odds_home,
        v_existing.odds_draw,
        v_existing.odds_away,
        v_run_id
      );
    else
      update public.bw_removal_episode
      set state = case
            when state = 'confirmed' then state
            when v_is_confirmed then 'confirmed'
            else 'pending'
          end,
          missing_crawls = v_next_missing_count,
          last_missing_at = v_captured_at,
          confirmed_at = case
            when v_is_confirmed then coalesce(confirmed_at, v_captured_at)
            else confirmed_at
          end,
          last_run_id = v_run_id
      where episode_id = v_episode_id;
    end if;

    if v_next_missing_count = 1 then
      insert into public.bw_change (
        provider_event_id, run_id, observed_at, change_type, old_values, new_values
      )
      values (
        v_existing.provider_event_id, v_run_id, v_captured_at, 'pending_removal',
        jsonb_build_object('last_seen_at', v_existing.last_seen_at),
        jsonb_build_object('missing_count', v_next_missing_count)
      );
    end if;

    if v_is_confirmed and v_existing.lifecycle_state <> 'removed_pre_kickoff' then
      v_removed_count := v_removed_count + 1;
      insert into public.bw_change (
        provider_event_id, run_id, observed_at, change_type, old_values, new_values
      )
      values (
        v_existing.provider_event_id, v_run_id, v_captured_at, 'removed_pre_kickoff',
        jsonb_build_object(
          'missing_count', v_existing.missing_count,
          'odds_home', v_existing.odds_home,
          'odds_draw', v_existing.odds_draw,
          'odds_away', v_existing.odds_away
        ),
        jsonb_build_object(
          'missing_count', v_next_missing_count,
          'confirmed_at', v_captured_at,
          'verification_status', 'unverified'
        )
      );
    elsif not v_is_confirmed then
      v_pending_count := v_pending_count + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'status', 'complete',
    'run_id', v_run_id,
    'pages_captured', (p_snapshot->>'pages_captured')::integer,
    'source_event_count', (p_snapshot->>'source_event_count')::integer,
    'fixture_count', v_incoming_count,
    'excluded_event_count', coalesce((p_snapshot->>'excluded_event_count')::integer, 0),
    'odds_changes', v_changed_count,
    'pending_removals', v_pending_count,
    'confirmed_absences_unverified', v_removed_count,
    'large_drop_confirmation_threshold', v_required_confirmations
  );
end;
$$;

revoke all on function public.apply_betway_snapshot(jsonb)
  from public, anon, authenticated;
grant execute on function public.apply_betway_snapshot(jsonb) to service_role;

commit;
