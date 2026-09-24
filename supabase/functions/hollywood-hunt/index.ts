/**
 * Hollywoodbets watch runner.
 *
 * A one-minute Cron invokes this worker. It rotates through bounded country and
 * tournament windows, stops before the hosted request deadline, and sends each
 * complete tournament snapshot to one transactional Postgres RPC. The database
 * owns comparison, removal confirmation and history writes, so retries and
 * overlapping invocations cannot split state from its audit trail.
 */
import {
  canStartTournament,
  completeEventsArray,
  remainingBudgetMs,
  rotatingWindow,
} from '../_shared/hollywoodHuntRunner.ts';

const HB_BASE = 'https://sport-events-api.hollywoodbets.net';
const HB_ORIGIN = 'https://www.hollywoodbets.net';
const SOCCER = 1;
const FULL_TIME = 15;
const DEFAULT_RUN_BUDGET_MS = 45_000;
const MIN_REQUEST_BUDGET_MS = 5_000;

type HbMarket = { number: number; odds: number; status?: string };
type HbBetType = { id: number; status?: string; markets?: HbMarket[] };
type HbEvent = {
  id: number;
  sourceId?: string;
  name: string;
  startTime: string;
  categoryId: number;
  category: string;
  tournament: string;
  isOutright?: boolean;
  betTypes?: HbBetType[];
};
type Category = { id: number; name: string };
type Tournament = { id: number; name: string };
type Odds = { home: number; draw: number; away: number };
type CrawlEvent = {
  event_id: number;
  source_id: string | null;
  name: string;
  start_time: string;
  country: string | null;
  home_team: string | null;
  away_team: string | null;
  odds_home: number | null;
  odds_draw: number | null;
  odds_away: number | null;
  market_open: boolean;
};
type ApplyResult = {
  events: number;
  added: number;
  removed: number;
  changes: number;
  pending_removals: number;
  removal_confirmation: number;
};

const CLOSED = new Set(['suspended', 'closed', 'inactive', 'deactivated', 'settled']);

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function boundedInt(value: string | undefined, fallback: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, positiveInt(value, fallback)));
}

function finiteNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function splitTeams(name: string): { home: string | null; away: string | null } {
  const parts = name.split(/\s+vs?\.?\s+/i);
  return parts.length === 2
    ? { home: parts[0].trim(), away: parts[1].trim() }
    : { home: null, away: null };
}

function decimal1x2(event: HbEvent): Odds | null {
  const betType = event.betTypes?.find((item) => item.id === FULL_TIME);
  if (!betType || CLOSED.has((betType.status ?? '').toLowerCase())) return null;
  const market = (number: number) =>
    betType.markets?.find(
      (item) => item.number === number && !CLOSED.has((item.status ?? '').toLowerCase()),
    );
  const home = market(1);
  const draw = market(2);
  const away = market(3);
  if (!home || !draw || !away) return null;
  return { home: home.odds + 1, draw: draw.odds + 1, away: away.odds + 1 };
}

async function hollywood<T>(path: string, timeoutMs: number): Promise<T> {
  const response = await fetch(`${HB_BASE}/${path}`, {
    headers: { Accept: 'application/json', Origin: HB_ORIGIN, Referer: `${HB_ORIGIN}/` },
    signal: AbortSignal.timeout(Math.max(1_000, Math.min(12_000, timeoutMs))),
  });
  if (!response.ok) throw new Error(`Hollywood ${path}: HTTP ${response.status}`);
  return (await response.json()) as T;
}

function createStore(url: string, key: string) {
  const base = `${url.replace(/\/+$/, '')}/rest/v1`;
  const headers = {
    apikey: key,
    ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}),
    'Content-Type': 'application/json',
  };

  async function rpc<T>(name: string, body: Record<string, unknown>, retries = 0): Promise<T> {
    const encoded = JSON.stringify(body);
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const response = await fetch(`${base}/rpc/${name}`, {
          method: 'POST',
          headers,
          body: encoded,
          signal: AbortSignal.timeout(15_000),
        });
        if (response.ok) {
          const text = await response.text();
          return (text ? JSON.parse(text) : undefined) as T;
        }
        const error = `Supabase RPC ${name}: HTTP ${response.status} ${await response.text()}`;
        if (attempt >= retries || response.status < 500) throw new Error(error);
      } catch (error) {
        if (attempt >= retries) throw error;
      }
    }
    throw new Error(`Supabase RPC ${name} did not complete`);
  }

  return {
    claim: (holder: string, at: string) =>
      rpc<boolean>('claim_hollywood_hunt', {
        p_holder: holder,
        p_now: at,
        p_ttl_seconds: 90,
      }),
    release: (holder: string, at: string) =>
      rpc<void>('release_hollywood_hunt', { p_holder: holder, p_now: at }),
    recordFailure: (
      categoryId: number,
      tournament: Tournament,
      attemptedAt: string,
      error: string,
    ) =>
      rpc<void>('record_hollywood_crawl_failure', {
        p_category_id: categoryId,
        p_tournament_id: tournament.id,
        p_tournament: tournament.name,
        p_attempted_at: attemptedAt,
        p_error: error.slice(0, 1000),
      }),
    apply: (args: {
      crawlKey: string;
      categoryId: number;
      tournament: Tournament;
      observedAt: string;
      events: CrawlEvent[];
      driftPp: number;
      confirmRemovalAfter: number;
    }) =>
      rpc<ApplyResult>('apply_hollywood_tournament_crawl', {
        p_crawl_key: args.crawlKey,
        p_category_id: args.categoryId,
        p_tournament_id: args.tournament.id,
        p_tournament: args.tournament.name,
        p_observed_at: args.observedAt,
        p_events: args.events,
        p_drift_pp: args.driftPp,
        p_confirm_removal_after: args.confirmRemovalAfter,
      }, 1),
  };
}

function crawlRow(event: HbEvent, category: Category): CrawlEvent {
  const odds = decimal1x2(event);
  const teams = splitTeams(event.name);
  return {
    event_id: event.id,
    source_id: event.sourceId ?? null,
    name: event.name,
    start_time: event.startTime,
    country: event.category || category.name || null,
    home_team: teams.home,
    away_team: teams.away,
    odds_home: odds?.home ?? null,
    odds_draw: odds?.draw ?? null,
    odds_away: odds?.away ?? null,
    market_open: odds != null,
  };
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'POST required' }, 405);

  const expectedSecret = Deno.env.get('HUNT_CRON_SECRET');
  if (!expectedSecret) return json({ error: 'HUNT_CRON_SECRET is not configured' }, 500);
  if (request.headers.get('x-cron-secret') !== expectedSecret) return json({ error: 'Unauthorized' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  let serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!serviceKey) {
    try {
      const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>;
      serviceKey = keys.default;
    } catch {
      // The missing-key response below is safer than logging malformed secrets.
    }
  }
  if (!supabaseUrl || !serviceKey) return json({ error: 'Supabase service environment is missing' }, 500);

  const store = createStore(supabaseUrl, serviceKey);
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const holder = crypto.randomUUID();
  const runBudgetMs = boundedInt(
    Deno.env.get('HUNT_RUN_BUDGET_MS'),
    DEFAULT_RUN_BUDGET_MS,
    10_000,
    50_000,
  );
  const driftPp = Math.min(100, Math.max(0, finiteNumber(Deno.env.get('HUNT_DRIFT_PP'), 3)));
  const countriesPerRun = boundedInt(Deno.env.get('HUNT_COUNTRIES_PER_RUN'), 1, 1, 20);
  const maxTournaments = boundedInt(Deno.env.get('HUNT_MAX_TOURNAMENTS_PER_RUN'), 20, 1, 100);
  const confirmRemovalAfter = boundedInt(Deno.env.get('HUNT_CONFIRM_REMOVAL_AFTER'), 2, 2, 10);

  let requested: { categoryId?: number; tournamentId?: number } = {};
  try {
    requested = (await request.json()) as typeof requested;
  } catch {
    // Empty body is the normal Cron invocation.
  }

  let claimed = false;
  try {
    claimed = await store.claim(holder, startedAt);
    if (!claimed) {
      return json({ ok: true, skipped: true, reason: 'another Hollywood hunt run holds the lease' }, 202);
    }

    const categoriesEnvelope = await hollywood<{ categories?: Category[] }>(
      `api/events/eps/sports/${SOCCER}/categories`,
      remainingBudgetMs(startedAtMs, Date.now(), runBudgetMs),
    );
    if (!Array.isArray(categoriesEnvelope.categories)) {
      throw new Error('Hollywood categories response is incomplete');
    }

    const categories = categoriesEnvelope.categories.filter(
      (item) => requested.categoryId == null || item.id === requested.categoryId,
    );
    if (categories.length === 0) {
      return json({ ok: true, countries: 0, leagues: 0, events: 0, changes: 0 });
    }

    const minute = Math.floor(startedAtMs / 60_000);
    const selectedCategories = requested.categoryId == null
      ? rotatingWindow(categories, countriesPerRun, minute)
      : categories;
    const summary = {
      countries: selectedCategories.length,
      leagues: 0,
      events: 0,
      changes: 0,
      added: 0,
      removed: 0,
      pendingRemovals: 0,
      skipped: 0,
      deferred: 0,
    };

    for (const category of selectedCategories) {
      if (!canStartTournament(startedAtMs, Date.now(), runBudgetMs, MIN_REQUEST_BUDGET_MS)) {
        summary.deferred += 1;
        break;
      }

      let tournamentEnvelope: { tournaments?: Tournament[] };
      try {
        tournamentEnvelope = await hollywood<{ tournaments?: Tournament[] }>(
          `api/events/eps/sports/${SOCCER}/categories/${category.id}/tournaments`,
          remainingBudgetMs(startedAtMs, Date.now(), runBudgetMs),
        );
      } catch {
        summary.skipped += 1;
        continue;
      }
      if (!Array.isArray(tournamentEnvelope.tournaments)) {
        summary.skipped += 1;
        continue;
      }

      const eligible = tournamentEnvelope.tournaments.filter(
        (item) => requested.tournamentId == null || item.id === requested.tournamentId,
      );
      const tournaments = requested.tournamentId == null
        ? rotatingWindow(eligible, maxTournaments, minute * maxTournaments)
        : eligible;

      for (let index = 0; index < tournaments.length; index += 1) {
        const tournament = tournaments[index];
        if (!canStartTournament(startedAtMs, Date.now(), runBudgetMs, MIN_REQUEST_BUDGET_MS)) {
          summary.deferred += tournaments.length - index;
          break;
        }

        const attemptedAt = new Date().toISOString();
        try {
          const eventEnvelope = await hollywood<unknown>(
            `api/events/eps/sports/${SOCCER}/categories/${category.id}/tournaments/${tournament.id}/events?withBetTypeId=${FULL_TIME}&lang=en`,
            remainingBudgetMs(startedAtMs, Date.now(), runBudgetMs),
          );
          const rawEvents = completeEventsArray<HbEvent>(eventEnvelope);
          if (!rawEvents) throw new Error('Hollywood events response is incomplete');

          const events = rawEvents
            .filter((event) => !event.isOutright)
            .map((event) => crawlRow(event, category));
          const applied = await store.apply({
            crawlKey: crypto.randomUUID(),
            categoryId: category.id,
            tournament,
            observedAt: attemptedAt,
            events,
            driftPp,
            confirmRemovalAfter,
          });

          summary.leagues += 1;
          summary.events += applied.events;
          summary.changes += applied.changes;
          summary.added += applied.added;
          summary.removed += applied.removed;
          summary.pendingRemovals += applied.pending_removals;
        } catch (error) {
          summary.skipped += 1;
          const message = error instanceof Error ? error.message : String(error);
          try {
            await store.recordFailure(category.id, tournament, attemptedAt, message);
          } catch {
            // The expiring lease and next run provide recovery; never hide the
            // original upstream/apply failure behind bookkeeping failure.
          }
        }
      }
    }

    return json({
      ok: true,
      at: new Date().toISOString(),
      runMs: Date.now() - startedAtMs,
      ...summary,
    });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 502);
  } finally {
    if (claimed) {
      try {
        await store.release(holder, new Date().toISOString());
      } catch {
        // Lease expiry is the crash-recovery path.
      }
    }
  }
});
