-- Production hardening for the Section 10 Hollywood hunt.
--
-- The original crawler performed four independent PostgREST writes after a
-- separate state read. A retry or an overlapping Cron invocation could
-- therefore duplicate history or leave current state and history out of sync.
-- This migration moves the state transition into one database transaction.

alter table public.hw_event
  add column if not exists missing_count smallint not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'hw_event_missing_count_nonnegative'
      and conrelid = 'public.hw_event'::regclass
  ) then
    alter table public.hw_event
      add constraint hw_event_missing_count_nonnegative
      check (missing_count >= 0);
  end if;
end
$$;

alter table public.hw_change
  add column if not exists crawl_key uuid;

create unique index if not exists hw_change_crawl_dedupe_idx
  on public.hw_change (crawl_key, event_id, kind)
  where crawl_key is not null;

alter table public.hw_crawl_state
  add column if not exists last_attempted timestamptz,
  add column if not exists last_succeeded timestamptz,
  add column if not exists status text not null default 'never',
  add column if not exists last_error text,
  add column if not exists last_event_count integer,
  add column if not exists consecutive_empty integer not null default 0,
  add column if not exists last_crawl_key uuid,
  add column if not exists last_result jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'hw_crawl_state_status_valid'
      and conrelid = 'public.hw_crawl_state'::regclass
  ) then
    alter table public.hw_crawl_state
      add constraint hw_crawl_state_status_valid
      check (status in ('never', 'success', 'partial', 'failed'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'hw_crawl_state_event_count_nonnegative'
      and conrelid = 'public.hw_crawl_state'::regclass
  ) then
    alter table public.hw_crawl_state
      add constraint hw_crawl_state_event_count_nonnegative
      check (last_event_count is null or last_event_count >= 0);
  end if;
end
$$;

-- A one-row, expiring lease prevents two one-minute Cron invocations from
-- crawling Hollywood at the same time. A crashed worker cannot hold it beyond
-- the short expiry.
create table if not exists public.hw_runner_lease (
  singleton boolean primary key default true check (singleton),
  holder uuid,
  lease_until timestamptz not null default '-infinity'::timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.hw_runner_lease enable row level security;

revoke all on table public.hw_runner_lease from public, anon, authenticated;

create or replace function public.claim_hollywood_hunt(
  p_holder uuid,
  p_now timestamptz,
  p_ttl_seconds integer
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_rows integer;
begin
  if p_holder is null then
    raise exception 'A lease holder is required';
  end if;
  if p_ttl_seconds < 10 or p_ttl_seconds > 120 then
    raise exception 'Lease TTL must be between 10 and 120 seconds';
  end if;

  insert into public.hw_runner_lease (singleton, holder, lease_until, updated_at)
  values (true, p_holder, p_now + make_interval(secs => p_ttl_seconds), p_now)
  on conflict (singleton) do update
    set holder = excluded.holder,
        lease_until = excluded.lease_until,
        updated_at = excluded.updated_at
    where public.hw_runner_lease.lease_until <= p_now
       or public.hw_runner_lease.holder = p_holder;

  get diagnostics v_rows = row_count;
  return v_rows = 1;
end
$function$;

create or replace function public.release_hollywood_hunt(
  p_holder uuid,
  p_now timestamptz
)
returns void
language sql
security invoker
set search_path = ''
as $function$
  update public.hw_runner_lease
  set holder = null,
      lease_until = p_now,
      updated_at = p_now
  where singleton = true
    and holder = p_holder;
$function$;

create or replace function public.record_hollywood_crawl_failure(
  p_category_id integer,
  p_tournament_id integer,
  p_tournament text,
  p_attempted_at timestamptz,
  p_error text
)
returns void
language sql
security invoker
set search_path = ''
as $function$
  insert into public.hw_crawl_state (
    category_id,
    tournament_id,
    tournament,
    last_attempted,
    status,
    last_error
  )
  values (
    p_category_id,
    p_tournament_id,
    nullif(p_tournament, ''),
    p_attempted_at,
    'failed',
    left(coalesce(p_error, 'Unknown crawl failure'), 1000)
  )
  on conflict (category_id, tournament_id) do update
    set tournament = excluded.tournament,
        last_attempted = excluded.last_attempted,
        status = excluded.status,
        last_error = excluded.last_error;
$function$;

-- Apply one complete tournament response. The RPC owns the comparison and all
-- writes, so its transaction sees one authoritative prior state. A transaction
-- advisory lock serialises the same tournament even if the global lease ever
-- expires during a slow run.
create or replace function public.apply_hollywood_tournament_crawl(
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
  v_payload jsonb;
  v_before public.hw_event%rowtype;
  v_missing public.hw_event%rowtype;
  v_seen_ids bigint[] := array[]::bigint[];
  v_event_id bigint;
  v_source_id text;
  v_name text;
  v_start_time timestamptz;
  v_country text;
  v_home_team text;
  v_away_team text;
  v_market_open boolean;
  v_odds_home numeric;
  v_odds_draw numeric;
  v_odds_away numeric;
  v_before_odds jsonb;
  v_after_odds jsonb;
  v_before_total numeric;
  v_after_total numeric;
  v_before_fair numeric;
  v_after_fair numeric;
  v_shift numeric;
  v_favourite text;
  v_prior_active integer;
  v_current_count integer;
  v_missing_total integer;
  v_required_missing integer;
  v_new_missing integer;
  v_consecutive_empty integer;
  v_added integer := 0;
  v_removed integer := 0;
  v_changed integer := 0;
  v_pending integer := 0;
  v_next_kickoff timestamptz;
  v_previous_result jsonb;
  v_result jsonb;
begin
  if p_crawl_key is null then
    raise exception 'A crawl key is required';
  end if;
  if p_category_id <= 0 or p_tournament_id <= 0 then
    raise exception 'Category and tournament ids must be positive';
  end if;
  if p_observed_at is null then
    raise exception 'An observation timestamp is required';
  end if;
  if jsonb_typeof(p_events) <> 'array' then
    raise exception 'Events must be a JSON array';
  end if;
  if jsonb_array_length(p_events) > 5000 then
    raise exception 'A tournament crawl cannot contain more than 5000 events';
  end if;
  if p_drift_pp < 0 or p_drift_pp > 100 then
    raise exception 'Drift threshold must be between 0 and 100';
  end if;
  if p_confirm_removal_after < 2 or p_confirm_removal_after > 10 then
    raise exception 'Removal confirmation must be between 2 and 10 crawls';
  end if;

  perform pg_advisory_xact_lock(p_category_id, p_tournament_id);

  -- A transient client/network error may retry the exact RPC after the first
  -- transaction committed. Return the committed result without incrementing
  -- missing counters or duplicating state transitions.
  select state.last_result
  into v_previous_result
  from public.hw_crawl_state as state
  where state.category_id = p_category_id
    and state.tournament_id = p_tournament_id
    and state.last_crawl_key = p_crawl_key;
  if found then
    return coalesce(v_previous_result, '{}'::jsonb);
  end if;

  select count(*)
  into v_prior_active
  from public.hw_event
  where country_id = p_category_id
    and tournament_id = p_tournament_id
    and removed_at is null;

  v_current_count := jsonb_array_length(p_events);

  for v_payload in
    select value
    from jsonb_array_elements(p_events)
  loop
    v_event_id := nullif(v_payload ->> 'event_id', '')::bigint;
    v_source_id := nullif(v_payload ->> 'source_id', '');
    v_name := nullif(v_payload ->> 'name', '');
    v_start_time := nullif(v_payload ->> 'start_time', '')::timestamptz;
    v_country := nullif(v_payload ->> 'country', '');
    v_home_team := nullif(v_payload ->> 'home_team', '');
    v_away_team := nullif(v_payload ->> 'away_team', '');
    v_market_open := coalesce((v_payload ->> 'market_open')::boolean, false);
    v_odds_home := nullif(v_payload ->> 'odds_home', '')::numeric;
    v_odds_draw := nullif(v_payload ->> 'odds_draw', '')::numeric;
    v_odds_away := nullif(v_payload ->> 'odds_away', '')::numeric;

    if v_event_id is null or v_name is null or v_start_time is null then
      raise exception 'Every event needs event_id, name and start_time';
    end if;
    if v_event_id = any(v_seen_ids) then
      raise exception 'Duplicate event id % in crawl payload', v_event_id;
    end if;
    if (v_odds_home is not null and v_odds_home < 1)
       or (v_odds_draw is not null and v_odds_draw < 1)
       or (v_odds_away is not null and v_odds_away < 1) then
      raise exception 'Decimal odds must be at least 1 for event %', v_event_id;
    end if;

    v_seen_ids := array_append(v_seen_ids, v_event_id);
    v_after_odds := case
      when v_odds_home is not null and v_odds_draw is not null and v_odds_away is not null
        then jsonb_build_object('home', v_odds_home, 'draw', v_odds_draw, 'away', v_odds_away)
      else null
    end;

    select event.*
    into v_before
    from public.hw_event as event
    where event.event_id = v_event_id
    for update;

    if not found then
      insert into public.hw_event (
        event_id,
        source_id,
        name,
        start_time,
        country_id,
        country,
        tournament_id,
        tournament,
        home_team,
        away_team,
        odds_home,
        odds_draw,
        odds_away,
        market_open,
        first_seen,
        last_seen,
        removed_at,
        missing_count
      )
      values (
        v_event_id,
        v_source_id,
        v_name,
        v_start_time,
        p_category_id,
        v_country,
        p_tournament_id,
        nullif(p_tournament, ''),
        v_home_team,
        v_away_team,
        v_odds_home,
        v_odds_draw,
        v_odds_away,
        v_market_open,
        p_observed_at,
        p_observed_at,
        null,
        0
      );

      insert into public.hw_change (crawl_key, observed_at, event_id, kind, after_odds)
      values (p_crawl_key, p_observed_at, v_event_id, 'added', v_after_odds)
      on conflict do nothing;
      v_added := v_added + 1;
      v_changed := v_changed + 1;
    else
      v_before_odds := case
        when v_before.odds_home is not null
         and v_before.odds_draw is not null
         and v_before.odds_away is not null
          then jsonb_build_object(
            'home', v_before.odds_home,
            'draw', v_before.odds_draw,
            'away', v_before.odds_away
          )
        else null
      end;

      if v_before.removed_at is not null then
        insert into public.hw_change (crawl_key, observed_at, event_id, kind, after_odds)
        values (p_crawl_key, p_observed_at, v_event_id, 'reopened', v_after_odds)
        on conflict do nothing;
        v_changed := v_changed + 1;
      elsif v_before.market_open and not v_market_open then
        insert into public.hw_change (crawl_key, observed_at, event_id, kind, before_odds, after_odds)
        values (p_crawl_key, p_observed_at, v_event_id, 'suspended', v_before_odds, v_after_odds)
        on conflict do nothing;
        v_changed := v_changed + 1;
      elsif not v_before.market_open and v_market_open then
        insert into public.hw_change (crawl_key, observed_at, event_id, kind, before_odds, after_odds)
        values (p_crawl_key, p_observed_at, v_event_id, 'reopened', v_before_odds, v_after_odds)
        on conflict do nothing;
        v_changed := v_changed + 1;
      end if;

      if v_before_odds is not null and v_after_odds is not null then
        if v_before.odds_home <= v_before.odds_draw
           and v_before.odds_home <= v_before.odds_away then
          v_favourite := 'home';
        elsif v_before.odds_draw <= v_before.odds_away then
          v_favourite := 'draw';
        else
          v_favourite := 'away';
        end if;

        v_before_total := (1 / v_before.odds_home) + (1 / v_before.odds_draw) + (1 / v_before.odds_away);
        v_after_total := (1 / v_odds_home) + (1 / v_odds_draw) + (1 / v_odds_away);
        v_before_fair := case v_favourite
          when 'home' then (1 / v_before.odds_home) / v_before_total
          when 'draw' then (1 / v_before.odds_draw) / v_before_total
          else (1 / v_before.odds_away) / v_before_total
        end;
        v_after_fair := case v_favourite
          when 'home' then (1 / v_odds_home) / v_after_total
          when 'draw' then (1 / v_odds_draw) / v_after_total
          else (1 / v_odds_away) / v_after_total
        end;
        v_shift := (v_after_fair - v_before_fair) * 100;

        if abs(v_shift) >= p_drift_pp then
          insert into public.hw_change (
            crawl_key,
            observed_at,
            event_id,
            kind,
            favourite,
            shift_pp,
            before_odds,
            after_odds
          )
          values (
            p_crawl_key,
            p_observed_at,
            v_event_id,
            case when v_shift > 0 then 'shortened' else 'drifted' end,
            v_favourite,
            round(v_shift, 2),
            v_before_odds,
            v_after_odds
          )
          on conflict do nothing;
          v_changed := v_changed + 1;
        end if;
      end if;

      update public.hw_event
      set source_id = v_source_id,
          name = v_name,
          start_time = v_start_time,
          country_id = p_category_id,
          country = v_country,
          tournament_id = p_tournament_id,
          tournament = nullif(p_tournament, ''),
          home_team = v_home_team,
          away_team = v_away_team,
          odds_home = v_odds_home,
          odds_draw = v_odds_draw,
          odds_away = v_odds_away,
          market_open = v_market_open,
          last_seen = p_observed_at,
          removed_at = null,
          missing_count = 0
      where event_id = v_event_id;
    end if;
  end loop;

  select count(*)
  into v_missing_total
  from public.hw_event
  where country_id = p_category_id
    and tournament_id = p_tournament_id
    and removed_at is null
    and not (event_id = any(v_seen_ids));

  -- Ordinary disappearances need two complete crawls. An empty response or a
  -- drop of half the league needs three, protecting against successful-but-
  -- incomplete upstream payloads while still allowing genuine removals.
  v_required_missing := case
    when v_prior_active > 0
     and (v_current_count = 0 or v_missing_total::numeric / v_prior_active >= 0.5)
      then greatest(3, p_confirm_removal_after)
    else p_confirm_removal_after
  end;

  for v_missing in
    select event.*
    from public.hw_event as event
    where event.country_id = p_category_id
      and event.tournament_id = p_tournament_id
      and event.removed_at is null
      and not (event.event_id = any(v_seen_ids))
    order by event.event_id
    for update
  loop
    v_new_missing := least(v_missing.missing_count + 1, 32767);
    if v_new_missing >= v_required_missing then
      update public.hw_event
      set missing_count = v_new_missing,
          removed_at = p_observed_at
      where event_id = v_missing.event_id;

      insert into public.hw_change (crawl_key, observed_at, event_id, kind, before_odds)
      values (
        p_crawl_key,
        p_observed_at,
        v_missing.event_id,
        'removed',
        case
          when v_missing.odds_home is not null
           and v_missing.odds_draw is not null
           and v_missing.odds_away is not null
            then jsonb_build_object(
              'home', v_missing.odds_home,
              'draw', v_missing.odds_draw,
              'away', v_missing.odds_away
            )
          else null
        end
      )
      on conflict do nothing;
      v_removed := v_removed + 1;
      v_changed := v_changed + 1;
    else
      update public.hw_event
      set missing_count = v_new_missing
      where event_id = v_missing.event_id;
      v_pending := v_pending + 1;
    end if;
  end loop;

  select min(start_time)
  into v_next_kickoff
  from public.hw_event
  where country_id = p_category_id
    and tournament_id = p_tournament_id
    and removed_at is null;

  select coalesce(consecutive_empty, 0)
  into v_consecutive_empty
  from public.hw_crawl_state
  where category_id = p_category_id
    and tournament_id = p_tournament_id;

  insert into public.hw_crawl_state (
    category_id,
    tournament_id,
    tournament,
    next_kickoff,
    last_crawled,
    last_attempted,
    last_succeeded,
    status,
    last_error,
    last_event_count,
    consecutive_empty,
    last_crawl_key,
    last_result
  )
  values (
    p_category_id,
    p_tournament_id,
    nullif(p_tournament, ''),
    v_next_kickoff,
    p_observed_at,
    p_observed_at,
    p_observed_at,
    case when v_pending > 0 then 'partial' else 'success' end,
    case
      when v_pending > 0
        then format('%s missing event(s) await confirmation', v_pending)
      else null
    end,
    v_current_count,
    case when v_current_count = 0 then coalesce(v_consecutive_empty, 0) + 1 else 0 end,
    p_crawl_key,
    null
  )
  on conflict (category_id, tournament_id) do update
    set tournament = excluded.tournament,
        next_kickoff = excluded.next_kickoff,
        last_crawled = excluded.last_crawled,
        last_attempted = excluded.last_attempted,
        last_succeeded = excluded.last_succeeded,
        status = excluded.status,
        last_error = excluded.last_error,
        last_event_count = excluded.last_event_count,
        consecutive_empty = excluded.consecutive_empty,
        last_crawl_key = excluded.last_crawl_key,
        last_result = excluded.last_result;

  v_result := jsonb_build_object(
    'events', v_current_count,
    'added', v_added,
    'removed', v_removed,
    'changes', v_changed,
    'pending_removals', v_pending,
    'removal_confirmation', v_required_missing
  );
  update public.hw_crawl_state
  set last_result = v_result
  where category_id = p_category_id
    and tournament_id = p_tournament_id;
  return v_result;
end
$function$;

-- Re-establish service-role privileges from a known minimum. The crawler never
-- deletes current state or history; all mutations are bounded to the tables and
-- RPCs below.
revoke all on table public.hw_event from service_role;
revoke all on table public.hw_change from service_role;
revoke all on table public.hw_crawl_state from service_role;
revoke all on table public.hw_runner_lease from service_role;
revoke all on sequence public.hw_change_id_seq from service_role;

grant usage on schema public to service_role;
grant select, insert, update on table public.hw_event to service_role;
grant select, insert on table public.hw_change to service_role;
grant select, insert, update on table public.hw_crawl_state to service_role;
grant select, insert, update on table public.hw_runner_lease to service_role;
grant usage, select on sequence public.hw_change_id_seq to service_role;

revoke execute on function public.claim_hollywood_hunt(uuid, timestamptz, integer)
  from public, anon, authenticated;
revoke execute on function public.release_hollywood_hunt(uuid, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.record_hollywood_crawl_failure(integer, integer, text, timestamptz, text)
  from public, anon, authenticated;
revoke execute on function public.apply_hollywood_tournament_crawl(uuid, integer, integer, text, timestamptz, jsonb, numeric, integer)
  from public, anon, authenticated;

grant execute on function public.claim_hollywood_hunt(uuid, timestamptz, integer)
  to service_role;
grant execute on function public.release_hollywood_hunt(uuid, timestamptz)
  to service_role;
grant execute on function public.record_hollywood_crawl_failure(integer, integer, text, timestamptz, text)
  to service_role;
grant execute on function public.apply_hollywood_tournament_crawl(uuid, integer, integer, text, timestamptz, jsonb, numeric, integer)
  to service_role;
