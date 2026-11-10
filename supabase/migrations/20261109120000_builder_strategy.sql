-- Cloud persistence for the Strategy Builder's saved strategies (the "HOW":
-- conditions + logic + view, plus a user name & description). The app keeps its
-- on-device localStorage copy as an offline fallback and mirrors here.
--
-- NO-AUTH STORE. The Strategy Builder has no login yet, so this table is reached
-- with the public anon key and its RLS allows anon to read & write. That means
-- anyone with the (public) anon key can read/write these rows — acceptable for a
-- single-owner analytics tool, but when a login story lands this should move to
-- the auth-scoped public.analytics_strategy table (owner = auth.uid()).

create table if not exists public.builder_strategy (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  note text check (note is null or char_length(note) <= 2000),
  config jsonb not null default '{}'::jsonb
    check (jsonb_typeof(config) = 'object'),
  -- A client-generated tag (stored in the browser) so a device can find its own
  -- saves; not a security boundary (anon can send any value).
  owner_key text check (owner_key is null or char_length(owner_key) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists builder_strategy_updated_idx
  on public.builder_strategy (updated_at desc);
create index if not exists builder_strategy_owner_idx
  on public.builder_strategy (owner_key, updated_at desc);

-- Keep updated_at fresh on every change.
create or replace function public.builder_strategy_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists builder_strategy_touch on public.builder_strategy;
create trigger builder_strategy_touch
  before update on public.builder_strategy
  for each row execute function public.builder_strategy_touch();

alter table public.builder_strategy enable row level security;

-- No-auth store: the public anon role may read & write (see header note).
drop policy if exists builder_strategy_anon_all on public.builder_strategy;
create policy builder_strategy_anon_all on public.builder_strategy
  for all to anon, authenticated
  using (true)
  with check (true);

grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on table public.builder_strategy
  to anon, authenticated, service_role;
