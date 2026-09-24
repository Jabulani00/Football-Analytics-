-- Section 10 — Hollywoodbets hunt store.
--
-- The analysis notes (p76) open the Hollywood script with "Make Hollywood
-- database (Country, league, teams)" and then ask for an hourly comparison:
-- "which data was there an hour ago which is now present — games hollywood
-- does not want us to play". That comparison needs the earlier state kept.
--
-- SHAPE. Storing a full listing snapshot every minute would be enormous and
-- almost entirely duplicate rows, so this keeps two things instead:
--   * hw_event  — current known state, one row per Hollywood event, upserted
--   * hw_change — append-only log of what actually changed, and when
-- The hourly question is then a query over hw_change rather than a diff of two
-- large snapshots, and storage grows with CHANGES rather than with crawls.
--
-- ACCESS. This is public market data, not per-user data. The app reads it with
-- the anon key, so every table gets RLS on with a read-only policy; the crawler
-- writes with the service role, which bypasses RLS entirely. There is
-- deliberately no insert/update policy — nothing holding the anon key can write.

-- ---------------------------------------------------------------------------
-- Current state
-- ---------------------------------------------------------------------------
create table if not exists public.hw_event (
  -- Hollywood's own event id. Natural key, stable across crawls.
  event_id      bigint primary key,

  -- Sportradar id ('sr:match:68932806'). Captured because if our own provider
  -- exposes the same identifier, fixture matching becomes an exact join and the
  -- name-based matcher stops being load-bearing.
  source_id     text,

  name          text        not null,
  start_time    timestamptz not null,
  country_id    integer,
  country       text,
  tournament_id integer,
  tournament    text,
  home_team     text,
  away_team     text,

  -- Decimal odds, converted from Hollywood's fractional feed on write.
  odds_home     numeric(10,3),
  odds_draw     numeric(10,3),
  odds_away     numeric(10,3),

  -- The book marks a market unavailable rather than removing it.
  market_open   boolean     not null default false,

  first_seen    timestamptz not null default now(),
  last_seen     timestamptz not null default now(),
  -- Set when the fixture stops appearing in the listing; cleared if it returns.
  removed_at    timestamptz
);

comment on table public.hw_event is
  'Latest known Hollywoodbets listing state, one row per event.';

-- Kickoff drives the tiered crawl cadence, and the hunt view wants live
-- fixtures first.
create index if not exists hw_event_start_time_idx
  on public.hw_event (start_time);

-- "What is Hollywood no longer listing?" — partial, because removed rows are a
-- small minority of the table and the index should stay that size.
create index if not exists hw_event_removed_idx
  on public.hw_event (removed_at)
  where removed_at is not null;

create index if not exists hw_event_source_id_idx
  on public.hw_event (source_id)
  where source_id is not null;

-- The crawler compares one league at a time. This index keeps that lookup
-- bounded even after the current-state table has accumulated old fixtures.
create index if not exists hw_event_tournament_idx
  on public.hw_event (country_id, tournament_id, start_time);

-- ---------------------------------------------------------------------------
-- Change log
-- ---------------------------------------------------------------------------
create table if not exists public.hw_change (
  id            bigint generated always as identity primary key,
  observed_at   timestamptz not null default now(),

  event_id      bigint      not null
                  references public.hw_event (event_id) on delete cascade,

  -- removed / suspended / shortened are the notes' "they don't want this" set;
  -- added, reopened and drifted are the opposite signals, kept for symmetry so
  -- a later rule change does not need a backfill.
  kind          text        not null
                  check (kind in ('added','removed','suspended','reopened','shortened','drifted')),

  -- Which outcome was favourite when the move happened, and how far its
  -- de-vigged probability moved, in percentage points.
  favourite     text        check (favourite in ('home','draw','away')),
  shift_pp      numeric(6,2),

  before_odds   jsonb,
  after_odds    jsonb
);

comment on table public.hw_change is
  'Append-only log of Hollywoodbets listing changes (the hourly comparison).';

-- The main read: "what changed in the last hour", newest first.
create index if not exists hw_change_observed_at_idx
  on public.hw_change (observed_at desc);

-- Foreign keys are not indexed automatically; this one carries ON DELETE
-- CASCADE and is also the per-fixture history lookup.
create index if not exists hw_change_event_id_idx
  on public.hw_change (event_id, observed_at desc);

-- ---------------------------------------------------------------------------
-- Crawl bookkeeping
-- ---------------------------------------------------------------------------
create table if not exists public.hw_crawl_state (
  category_id   integer     not null,
  tournament_id integer     not null,
  tournament    text,
  -- Earliest upcoming kickoff in this tournament; sets the crawl interval.
  next_kickoff  timestamptz,
  last_crawled  timestamptz,
  primary key (category_id, tournament_id)
);

comment on table public.hw_crawl_state is
  'Per-tournament crawl cadence state, so polling tightens near kickoff.';

create index if not exists hw_crawl_state_due_idx
  on public.hw_crawl_state (last_crawled);

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------
alter table public.hw_event       enable row level security;
alter table public.hw_change      enable row level security;
alter table public.hw_crawl_state enable row level security;

-- Read-only for anyone holding the anon key. Writes are service-role only,
-- which bypasses RLS, so the absence of a write policy is the write control.
drop policy if exists hw_event_read on public.hw_event;
create policy hw_event_read on public.hw_event
  for select to anon, authenticated using (true);

drop policy if exists hw_change_read on public.hw_change;
create policy hw_change_read on public.hw_change
  for select to anon, authenticated using (true);

drop policy if exists hw_crawl_state_read on public.hw_crawl_state;
create policy hw_crawl_state_read on public.hw_crawl_state
  for select to anon, authenticated using (true);

-- RLS controls rows, while GRANT controls whether PostgREST can expose the
-- table at all. Supabase no longer auto-grants new public tables on every
-- project, so make the intended read-only Data API contract explicit.
revoke all on table public.hw_event from anon, authenticated;
revoke all on table public.hw_change from anon, authenticated;
revoke all on table public.hw_crawl_state from anon, authenticated;

grant select on table public.hw_event to anon, authenticated;
grant select on table public.hw_change to anon, authenticated;
grant select on table public.hw_crawl_state to anon, authenticated;

-- The Edge Function writes through PostgREST with the service-role key. RLS is
-- bypassed for that role, but SQL privileges are still required when automatic
-- Data API grants are disabled.
grant select, insert, update on table public.hw_event to service_role;
grant select, insert on table public.hw_change to service_role;
grant select, insert, update on table public.hw_crawl_state to service_role;
grant usage, select on sequence public.hw_change_id_seq to service_role;
