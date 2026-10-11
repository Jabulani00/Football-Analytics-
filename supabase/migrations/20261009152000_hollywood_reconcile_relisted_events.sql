-- Reconcile a previously removed fixture when Hollywood republishes it under
-- a new event id. Prefer its stable source id; otherwise reconcile exact team
-- identity within one competition, or its Early Betting/main counterpart.

create or replace function public.hw_hunt_team_key(p_name text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $function$
  with normalized as (
    select regexp_replace(lower(coalesce(p_name, '')), '[^[:alnum:]]', '', 'g') as value
  ),
  without_suffix as (
    select regexp_replace(value, 'fc$', '', 'g') as value
    from normalized
  )
  select case value
    when 'nwu' then 'northwestuniversity'
    else value
  end
  from without_suffix;
$function$;

revoke execute on function public.hw_hunt_team_key(text)
  from public, anon, authenticated;
grant execute on function public.hw_hunt_team_key(text) to service_role;

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

  if tg_op = 'UPDATE'
    and new.lifecycle_state = 'reopened'
    and new.removed_at is not null then
    new.lifecycle_state := 'reopened';
  elsif new.removed_at is not null then
    new.lifecycle_state := case
      when new.start_time <= new.removed_at then 'expired'
      else 'removed_pre_kickoff'
    end;
  elsif tg_op = 'UPDATE' and new.start_time is distinct from old.start_time then
    insert into public.hw_change (
      observed_at,
      event_id,
      kind,
      before_odds,
      after_odds
    )
    values (
      new.last_seen,
      new.event_id,
      'rescheduled',
      case
        when old.odds_home is not null and old.odds_draw is not null and old.odds_away is not null
          then jsonb_build_object('home', old.odds_home, 'draw', old.odds_draw, 'away', old.odds_away)
        else null
      end,
      case
        when new.odds_home is not null and new.odds_draw is not null and new.odds_away is not null
          then jsonb_build_object('home', new.odds_home, 'draw', new.odds_draw, 'away', new.odds_away)
        else null
      end
    );
    new.lifecycle_state := case
      when new.start_time > new.last_seen then 'rescheduled'
      else 'started'
    end;
  elsif new.start_time <= new.last_seen then
    new.lifecycle_state := 'started';
  elsif coalesce(new.missing_count, 0) > 0 then
    new.lifecycle_state := 'pending_removal';
  elsif tg_op = 'UPDATE'
    and not new.market_open
    and (old.market_open or old.lifecycle_state = 'suspended') then
    new.lifecycle_state := 'suspended';
  else
    new.lifecycle_state := 'active';
  end if;
  return new;
end
$function$;

create or replace function public.apply_hollywood_tournament_crawl_classified(
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
  v_event jsonb;
  v_event_id bigint;
  v_source_id text;
  v_start_time timestamptz;
  v_expired integer;
begin
  if jsonb_typeof(p_events) <> 'array' then
    raise exception 'Events must be a JSON array';
  end if;

  perform pg_advisory_xact_lock(p_category_id, p_tournament_id);

  for v_event in select value from jsonb_array_elements(p_events)
  loop
    v_event_id := nullif(v_event ->> 'event_id', '')::bigint;
    v_source_id := nullif(v_event ->> 'source_id', '');
    v_start_time := nullif(v_event ->> 'start_time', '')::timestamptz;

    if v_event_id is null or v_start_time is null or v_start_time <= p_observed_at then
      continue;
    end if;

    with relisted as (
      update public.hw_event as prior
      set lifecycle_state = 'reopened'
      where prior.event_id <> v_event_id
        and prior.country_id = p_category_id
        and (
          prior.tournament_id = p_tournament_id
          or (
            lower(trim(regexp_replace(coalesce(prior.tournament, ''), '\s*\(early betting\)\s*$', '', 'i')))
              = lower(trim(regexp_replace(coalesce(p_tournament, ''), '\s*\(early betting\)\s*$', '', 'i')))
            and (
              (coalesce(prior.tournament, '') ~* '\(early betting\)\s*$')
              <> (coalesce(p_tournament, '') ~* '\(early betting\)\s*$')
            )
          )
        )
        and prior.lifecycle_state = 'removed_pre_kickoff'
        and prior.start_time > p_observed_at
        and (
          (
            v_source_id is not null
            and prior.source_id = v_source_id
          )
          or (
            prior.home_team is not null
            and prior.away_team is not null
            and nullif(v_event ->> 'home_team', '') is not null
            and nullif(v_event ->> 'away_team', '') is not null
            and public.hw_hunt_team_key(prior.home_team)
              = public.hw_hunt_team_key(v_event ->> 'home_team')
            and public.hw_hunt_team_key(prior.away_team)
              = public.hw_hunt_team_key(v_event ->> 'away_team')
            and (
              (
                prior.tournament_id = p_tournament_id
                and abs(extract(epoch from (prior.start_time - v_start_time))) <= 10800
              )
              or (
                prior.tournament_id <> p_tournament_id
                and lower(trim(regexp_replace(coalesce(prior.tournament, ''), '\s*\(early betting\)\s*$', '', 'i')))
                  = lower(trim(regexp_replace(coalesce(p_tournament, ''), '\s*\(early betting\)\s*$', '', 'i')))
                and (
                  (coalesce(prior.tournament, '') ~* '\(early betting\)\s*$')
                  <> (coalesce(p_tournament, '') ~* '\(early betting\)\s*$')
                )
                and abs(extract(epoch from (prior.start_time - v_start_time))) <= 129600
              )
            )
          )
        )
      returning prior.event_id, prior.odds_home, prior.odds_draw, prior.odds_away
    )
    insert into public.hw_change (
      crawl_key,
      observed_at,
      event_id,
      kind,
      before_odds,
      after_odds
    )
    select
      p_crawl_key,
      p_observed_at,
      relisted.event_id,
      'reopened',
      case
        when relisted.odds_home is not null
          and relisted.odds_draw is not null
          and relisted.odds_away is not null
          then jsonb_build_object(
            'home', relisted.odds_home,
            'draw', relisted.odds_draw,
            'away', relisted.odds_away
          )
        else null
      end,
      case
        when nullif(v_event ->> 'odds_home', '') is not null
          and nullif(v_event ->> 'odds_draw', '') is not null
          and nullif(v_event ->> 'odds_away', '') is not null
          then jsonb_build_object(
            'home', (v_event ->> 'odds_home')::numeric,
            'draw', (v_event ->> 'odds_draw')::numeric,
            'away', (v_event ->> 'odds_away')::numeric
          )
        else null
      end
    from relisted
    on conflict do nothing;
  end loop;

  v_result := public.apply_hollywood_tournament_crawl(
    p_crawl_key,
    p_category_id,
    p_tournament_id,
    p_tournament,
    p_observed_at,
    p_events,
    p_drift_pp,
    p_confirm_removal_after
  );

  if v_result ? 'expired' then
    return v_result;
  end if;

  select count(*)::integer
  into v_expired
  from public.hw_change
  where crawl_key = p_crawl_key
    and kind = 'expired';

  v_result := jsonb_set(
    v_result,
    '{removed}',
    to_jsonb(greatest(coalesce((v_result ->> 'removed')::integer, 0) - v_expired, 0)),
    true
  );
  v_result := jsonb_set(v_result, '{expired}', to_jsonb(v_expired), true);

  update public.hw_crawl_state
  set last_result = v_result
  where category_id = p_category_id
    and tournament_id = p_tournament_id
    and last_crawl_key = p_crawl_key;

  return v_result;
end
$function$;
