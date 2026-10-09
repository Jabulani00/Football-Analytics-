-- Distinguish a genuine pre-kickoff removal from a listing that simply
-- disappeared after its scheduled start. Keep removed_at as the absence
-- timestamp for both; lifecycle_state determines which signal is actionable.

alter table public.hw_event
  add column if not exists lifecycle_state text not null default 'active';

update public.hw_event
set lifecycle_state = case
  when removed_at is not null and start_time <= removed_at then 'expired'
  when removed_at is not null then 'removed_pre_kickoff'
  when start_time <= last_seen then 'started'
  when coalesce(missing_count, 0) > 0 then 'pending_removal'
  else 'active'
end;

alter table public.hw_event
  drop constraint if exists hw_event_lifecycle_state_valid;
alter table public.hw_event
  add constraint hw_event_lifecycle_state_valid
  check (lifecycle_state in (
    'active',
    'pending_removal',
    'removed_pre_kickoff',
    'suspended',
    'rescheduled',
    'started',
    'expired',
    'reopened'
  ));

create or replace function public.set_hw_event_lifecycle_state()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if tg_op = 'UPDATE' and not new.market_open then
    -- Suspension closes a market, not the fixture. Preserve its last prices.
    new.odds_home := coalesce(new.odds_home, old.odds_home);
    new.odds_draw := coalesce(new.odds_draw, old.odds_draw);
    new.odds_away := coalesce(new.odds_away, old.odds_away);
  end if;

  if tg_op = 'UPDATE' and new.start_time is distinct from old.start_time then
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
  end if;

  if new.removed_at is not null then
    new.lifecycle_state := case
      when new.start_time <= new.removed_at then 'expired'
      else 'removed_pre_kickoff'
    end;
  elsif tg_op = 'UPDATE'
    and new.start_time is distinct from old.start_time
    and new.start_time > new.last_seen then
    new.lifecycle_state := 'rescheduled';
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

drop trigger if exists hw_event_lifecycle_state_trigger on public.hw_event;
create trigger hw_event_lifecycle_state_trigger
before insert or update on public.hw_event
for each row execute function public.set_hw_event_lifecycle_state();

alter table public.hw_change
  drop constraint if exists hw_change_kind_check;
alter table public.hw_change
  add constraint hw_change_kind_valid
  check (kind in (
    'added',
    'removed',
    'expired',
    'suspended',
    'reopened',
    'rescheduled',
    'started',
    'shortened',
    'drifted'
  ));

update public.hw_change as change
set kind = 'expired'
from public.hw_event as event
where event.event_id = change.event_id
  and change.kind = 'removed'
  and event.start_time <= change.observed_at;

create or replace function public.classify_hw_disappearance()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_start_time timestamptz;
begin
  if new.kind = 'removed' then
    select event.start_time
    into v_start_time
    from public.hw_event as event
    where event.event_id = new.event_id;

    if v_start_time is not null and v_start_time <= new.observed_at then
      new.kind := 'expired';
    end if;
  end if;
  return new;
end
$function$;

drop trigger if exists hw_change_classify_disappearance_trigger on public.hw_change;
create trigger hw_change_classify_disappearance_trigger
before insert on public.hw_change
for each row execute function public.classify_hw_disappearance();

-- The original transactional crawler remains responsible for complete-snapshot
-- confirmation. This wrapper reports expiries separately and corrects its
-- historical "removed" count without changing that safety logic.
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
  v_expired integer;
begin
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

  -- The underlying RPC stores the first result under the crawl key. A retry
  -- returns that result, which this wrapper has already classified.
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

revoke execute on function public.apply_hollywood_tournament_crawl_classified(
  uuid, integer, integer, text, timestamptz, jsonb, numeric, integer
) from public, anon, authenticated;
grant execute on function public.apply_hollywood_tournament_crawl_classified(
  uuid, integer, integer, text, timestamptz, jsonb, numeric, integer
) to service_role;

create index if not exists hw_event_pre_kickoff_removed_idx
  on public.hw_event (removed_at desc)
  where lifecycle_state = 'removed_pre_kickoff';
