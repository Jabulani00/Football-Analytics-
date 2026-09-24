-- Authenticated persistence for Stream C strategies, recorded compliance and
-- generated bet slips. PostgREST exposes these as backend endpoints; RLS keeps
-- every row scoped to its owner. The app retains local-device fallback until
-- the lower-priority login story is deployed.

create table if not exists public.analytics_strategy (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  conditions jsonb not null default '{}'::jsonb
    check (jsonb_typeof(conditions) = 'object'),
  minimum_compliance smallint not null default 70
    check (minimum_compliance between 0 and 100),
  minimum_odds numeric(10,3) not null default 1
    check (minimum_odds >= 1),
  minimum_edge_pct numeric(8,3) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists analytics_strategy_user_idx
  on public.analytics_strategy (user_id, updated_at desc);

create table if not exists public.analytics_strategy_evaluation (
  id bigint generated always as identity primary key,
  strategy_id uuid not null
    references public.analytics_strategy (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  candidate_key text not null check (char_length(candidate_key) between 1 and 240),
  fixture text not null,
  kickoff timestamptz,
  status text not null check (status in ('qualified', 'rejected', 'blocked')),
  compliance smallint not null check (compliance between 0 and 100),
  evidence jsonb not null default '{}'::jsonb
    check (jsonb_typeof(evidence) = 'object'),
  evaluated_at timestamptz not null default now(),
  unique (strategy_id, candidate_key)
);

create index if not exists analytics_strategy_evaluation_user_idx
  on public.analytics_strategy_evaluation (user_id, evaluated_at desc);
create index if not exists analytics_strategy_evaluation_strategy_idx
  on public.analytics_strategy_evaluation (strategy_id, status, evaluated_at desc);

create table if not exists public.analytics_bet_slip (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  mode text not null check (mode in ('accumulator', 'singles')),
  stake numeric(12,2) not null default 0 check (stake >= 0),
  legs jsonb not null default '[]'::jsonb
    check (jsonb_typeof(legs) = 'array'),
  status text not null default 'draft'
    check (status in ('draft', 'placed', 'settled', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists analytics_bet_slip_user_idx
  on public.analytics_bet_slip (user_id, updated_at desc);

alter table public.analytics_strategy enable row level security;
alter table public.analytics_strategy_evaluation enable row level security;
alter table public.analytics_bet_slip enable row level security;

drop policy if exists analytics_strategy_owner_all on public.analytics_strategy;
create policy analytics_strategy_owner_all on public.analytics_strategy
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists analytics_strategy_evaluation_owner_all on public.analytics_strategy_evaluation;
create policy analytics_strategy_evaluation_owner_all on public.analytics_strategy_evaluation
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.analytics_strategy as strategy
      where strategy.id = strategy_id
        and strategy.user_id = (select auth.uid())
    )
  );

drop policy if exists analytics_bet_slip_owner_all on public.analytics_bet_slip;
create policy analytics_bet_slip_owner_all on public.analytics_bet_slip
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on table public.analytics_strategy from public, anon, authenticated, service_role;
revoke all on table public.analytics_strategy_evaluation from public, anon, authenticated, service_role;
revoke all on table public.analytics_bet_slip from public, anon, authenticated, service_role;
revoke all on sequence public.analytics_strategy_evaluation_id_seq from public, anon, authenticated, service_role;

grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on table public.analytics_strategy to authenticated, service_role;
grant select, insert, update, delete on table public.analytics_strategy_evaluation to authenticated, service_role;
grant select, insert, update, delete on table public.analytics_bet_slip to authenticated, service_role;
grant usage, select on sequence public.analytics_strategy_evaluation_id_seq to authenticated, service_role;
