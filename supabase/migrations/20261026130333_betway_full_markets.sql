begin;

create table public.bw_event_market_snapshot (
  provider_event_id text primary key references public.bw_event (provider_event_id) on delete cascade,
  run_id uuid not null references public.bw_crawl_run (run_id),
  observed_at timestamptz not null,
  markets jsonb not null default '[]'::jsonb,
  constraint bw_event_market_snapshot_markets_array_check
    check (jsonb_typeof(markets) = 'array' and jsonb_array_length(markets) <= 250)
);

create index bw_event_market_snapshot_observed_idx
  on public.bw_event_market_snapshot (observed_at desc);

alter table public.bw_event_market_snapshot enable row level security;
revoke all on public.bw_event_market_snapshot from public, anon, authenticated;
grant all on public.bw_event_market_snapshot to service_role;

create policy "Public reads markets for relevant Betway events"
on public.bw_event_market_snapshot for select
to anon, authenticated
using (
  exists (
    select 1
    from public.bw_event as event
    where event.provider_event_id = bw_event_market_snapshot.provider_event_id
      and event.start_time >= now() - interval '1 day'
  )
);

grant select (provider_event_id, observed_at, markets)
on public.bw_event_market_snapshot to anon, authenticated;

create view public.bw_public_event_market
with (security_invoker = true)
as
select provider_event_id, observed_at, markets
from public.bw_event_market_snapshot;

revoke all on public.bw_public_event_market from public;
grant select on public.bw_public_event_market to anon, authenticated;

alter function public.apply_betway_snapshot(jsonb)
  rename to apply_betway_snapshot_core;

revoke all on function public.apply_betway_snapshot_core(jsonb)
  from public, anon, authenticated, service_role;

create function public.apply_betway_snapshot(p_snapshot jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_run_id uuid;
  v_captured_at timestamptz;
  v_fixture jsonb;
  v_markets jsonb;
begin
  v_result := public.apply_betway_snapshot_core(p_snapshot);
  v_run_id := (v_result->>'run_id')::uuid;
  v_captured_at := (p_snapshot->>'captured_at')::timestamptz;

  for v_fixture in
    select item.value
    from jsonb_array_elements(p_snapshot->'fixtures') as item(value)
  loop
    v_markets := coalesce(v_fixture->'markets', '[]'::jsonb);
    if jsonb_typeof(v_markets) is distinct from 'array'
       or jsonb_array_length(v_markets) > 250 then
      raise exception 'Betway fixture contains an invalid market collection';
    end if;

    insert into public.bw_event_market_snapshot (
      provider_event_id, run_id, observed_at, markets
    )
    values (
      v_fixture->>'provider_event_id', v_run_id, v_captured_at, v_markets
    )
    on conflict (provider_event_id) do update
    set run_id = excluded.run_id,
        observed_at = excluded.observed_at,
        markets = excluded.markets;
  end loop;

  return v_result;
end;
$$;

revoke all on function public.apply_betway_snapshot(jsonb)
  from public, anon, authenticated;
grant execute on function public.apply_betway_snapshot(jsonb) to service_role;

commit;
