/**
 * Section 10 — Hollywoodbets watch / hunt system.
 *
 * The crawler's job is to answer three questions the analysis notes keep coming
 * back to:
 *   1. What is Hollywood listing right now?          → `snapshotFromEvents`
 *   2. What changed since we last looked?            → `diffSnapshots`
 *   3. What do we cover that they don't, and vice versa? → `coverageReport`
 *
 * Everything here is pure — feed it `HbEvent[]` from `services/hollywoodbets`
 * and a previously stored snapshot. No network, no React, no storage client, so
 * the same logic runs in the scheduled crawler and in the app.
 *
 * ON "COOLING". The notes ask for "teams they do not want us to play". A book
 * signals that three ways, in descending order of how unambiguous it is:
 * pulling the fixture, suspending the market, or shortening the favourite
 * (defending against sharp money or team news). Drifting the favourite is the
 * opposite — an invitation to back it. All four are reported separately and
 * `cooledEventIds` bundles the first three; thresholds are caller-tunable
 * because the right number is a judgement call, not a fact.
 */
import { decimal1x2, type HbEvent } from '@/services/hollywoodTypes';
import { devig1x2 } from '@/services/oddsMath';
import {
  matchFixtureToEvent,
  type FixtureKey,
  type MatchableEvent,
} from '@/services/hollywoodMatch';

export type Odds1x2 = { home: number; draw: number; away: number };
export type Outcome = 'home' | 'draw' | 'away';

/**
 * One fixture as Hollywood listed it at a moment in time. Deliberately flat and
 * small — a snapshot is written every crawl, so it has to be cheap to store.
 * `name` keeps Hollywood's own "Home vs Away" string so listings stay matchable
 * without re-fetching.
 */
export type ListedEvent = {
  eventId: number;
  /** Hollywood's upstream id ('sr:match:…'), when the feed carries one. */
  sourceId: string | null;
  name: string;
  startTime: string;
  startUnix: number;
  countryId: number;
  country: string;
  tournamentId: number | null;
  tournament: string;
  homeTeam: string | null;
  awayTeam: string | null;
  /** Decimal 1X2 at capture time, or null when the market wasn't offered. */
  odds: Odds1x2 | null;
  marketOpen: boolean;
};

export type HuntSnapshot = {
  takenAt: number;
  events: ListedEvent[];
};

/**
 * Bet-type statuses that mean "not currently takeable". Hollywood's exact
 * vocabulary was not observable from the captured traffic, so the presence of
 * prices stays the primary signal and this list is a secondary guard.
 */
const CLOSED_STATUSES = new Set(['suspended', 'closed', 'inactive', 'deactivated', 'settled']);

function isMarketOpen(event: HbEvent, odds: Odds1x2 | null): boolean {
  if (!odds) return false;
  const ft = event.betTypes.find((b) => b.markets.some((m) => m.number === 1));
  const status = ft?.status?.toLowerCase?.() ?? '';
  return !CLOSED_STATUSES.has(status);
}

/** Flatten a crawl of `HbEvent`s into a storable snapshot. */
export function snapshotFromEvents(
  events: HbEvent[],
  takenAt: number,
  scope: { tournamentId?: number } = {},
): HuntSnapshot {
  const listed: ListedEvent[] = [];

  for (const event of events) {
    if (event.isOutright) continue; // outrights are not fixtures
    const odds = decimal1x2(event);
    const startUnix = Math.floor(new Date(event.startTime).getTime() / 1000);
    const teams = event.name.split(/\s+vs?\.?\s+/i);
    listed.push({
      eventId: event.id,
      sourceId: event.sourceId ?? null,
      name: event.name,
      startTime: event.startTime,
      startUnix: Number.isFinite(startUnix) ? startUnix : 0,
      countryId: event.categoryId,
      country: event.category,
      tournamentId: scope.tournamentId ?? null,
      tournament: event.tournament,
      homeTeam: teams.length === 2 ? teams[0].trim() : null,
      awayTeam: teams.length === 2 ? teams[1].trim() : null,
      odds,
      marketOpen: isMarketOpen(event, odds),
    });
  }

  return { takenAt, events: listed };
}

// ---- Diffing ----------------------------------------------------------------

/** Default move size, in percentage points of de-vigged probability. */
export const DRIFT_PP = 3;

export type OddsMove = {
  eventId: number;
  name: string;
  before: Odds1x2;
  after: Odds1x2;
  /** Signed change in de-vigged probability, in percentage points. */
  shiftPp: { home: number; draw: number; away: number };
  /** The outcome that was favourite in the earlier snapshot. */
  favourite: Outcome;
  favouriteShiftPp: number;
  /** shortened = book defending the favourite; drifted = inviting money on it. */
  direction: 'shortened' | 'drifted' | 'steady';
};

export type HuntDiff = {
  fromUnix: number;
  toUnix: number;
  added: ListedEvent[];
  removed: ListedEvent[];
  /** Still listed, but the 1X2 market went from takeable to not. */
  suspended: ListedEvent[];
  reopened: ListedEvent[];
  moves: OddsMove[];
  stillListed: number;
  /** removed + suspended + shortened — the "they don't want this" set. */
  cooledEventIds: number[];
};

function favouriteOf(p: Odds1x2): Outcome {
  // Shortest price is the favourite.
  if (p.home <= p.draw && p.home <= p.away) return 'home';
  return p.draw <= p.away ? 'draw' : 'away';
}

/**
 * Compare two snapshots. `prev` is the earlier one; events are paired on
 * Hollywood's own event id, which is stable across crawls.
 */
export function diffSnapshots(
  prev: HuntSnapshot,
  next: HuntSnapshot,
  driftPp: number = DRIFT_PP,
): HuntDiff {
  const prevById = new Map(prev.events.map((e) => [e.eventId, e]));
  const nextById = new Map(next.events.map((e) => [e.eventId, e]));

  const added: ListedEvent[] = [];
  const removed: ListedEvent[] = [];
  const suspended: ListedEvent[] = [];
  const reopened: ListedEvent[] = [];
  const moves: OddsMove[] = [];
  let stillListed = 0;

  for (const [id, before] of prevById) {
    const after = nextById.get(id);
    if (!after) {
      removed.push(before);
      continue;
    }
    stillListed += 1;

    if (before.marketOpen && !after.marketOpen) suspended.push(after);
    if (!before.marketOpen && after.marketOpen) reopened.push(after);

    const move = compareOdds(before, after, driftPp);
    if (move) moves.push(move);
  }

  for (const [id, event] of nextById) {
    if (!prevById.has(id)) added.push(event);
  }

  const cooled = new Set<number>();
  removed.forEach((e) => cooled.add(e.eventId));
  suspended.forEach((e) => cooled.add(e.eventId));
  moves.filter((m) => m.direction === 'shortened').forEach((m) => cooled.add(m.eventId));

  return {
    fromUnix: prev.takenAt,
    toUnix: next.takenAt,
    added,
    removed,
    suspended,
    reopened,
    moves,
    stillListed,
    cooledEventIds: [...cooled],
  };
}

/**
 * Price movement between two captures of the same event, measured on de-vigged
 * probabilities so a change in the book's margin doesn't read as an opinion
 * change. Returns null when either side has no priced 1X2 market.
 */
export function compareOdds(
  before: ListedEvent,
  after: ListedEvent,
  driftPp: number = DRIFT_PP,
): OddsMove | null {
  if (!before.odds || !after.odds) return null;

  const fairBefore = devig1x2(before.odds.home, before.odds.draw, before.odds.away);
  const fairAfter = devig1x2(after.odds.home, after.odds.draw, after.odds.away);
  if (!fairBefore || !fairAfter) return null;

  const shiftPp = {
    home: (fairAfter.home - fairBefore.home) * 100,
    draw: (fairAfter.draw - fairBefore.draw) * 100,
    away: (fairAfter.away - fairBefore.away) * 100,
  };

  const favourite = favouriteOf(before.odds);
  const favouriteShiftPp = shiftPp[favourite];

  let direction: OddsMove['direction'] = 'steady';
  if (favouriteShiftPp >= driftPp) direction = 'shortened';
  else if (favouriteShiftPp <= -driftPp) direction = 'drifted';

  return {
    eventId: after.eventId,
    name: after.name,
    before: before.odds,
    after: after.odds,
    shiftPp,
    favourite,
    favouriteShiftPp,
    direction,
  };
}

// ---- Coverage ---------------------------------------------------------------

export type CoverageMatch = { fixture: FixtureKey; eventId: number; score: number };

export type CoverageReport = {
  matched: CoverageMatch[];
  /** We list it, Hollywood does not — the gap to fill from another provider. */
  missingFromBook: FixtureKey[];
  /** Hollywood lists it, we do not — candidates to add to our own coverage. */
  extraAtBook: ListedEvent[];
  /** Share of our fixtures Hollywood also lists, 0–100. */
  coveragePct: number;
};

/**
 * Compare our fixture list against a Hollywood snapshot. Matching reuses
 * `matchFixtureToEvent`, so the squad-tier rules apply here too: a reserve side
 * never counts as covering its senior fixture.
 */
export type FixtureEventPair<F, E> = { fixture: F; event: E; score: number };

/**
 * Pair our fixtures with book events, one event to at most one fixture.
 *
 * Best-scoring pairs are assigned first rather than taking fixtures in list
 * order, so a strong match is never lost to a weaker one that happened to be
 * earlier in the array. Everything else — the country gate, kick-off tolerance
 * and the squad-tier rules — comes from `matchFixtureToEvent`, so pairing here
 * and coverage below cannot drift apart.
 */
export function pairFixturesToEvents<F extends FixtureKey, E extends MatchableEvent>(
  fixtures: F[],
  events: E[],
): FixtureEventPair<F, E>[] {
  const candidates: FixtureEventPair<F, E>[] = [];
  for (const fixture of fixtures) {
    const hit = matchFixtureToEvent(fixture, events);
    if (hit) candidates.push({ fixture, event: hit.event, score: hit.score });
  }

  candidates.sort((a, b) => b.score - a.score);

  const takenFixtures = new Set<F>();
  const takenEvents = new Set<E>();
  const pairs: FixtureEventPair<F, E>[] = [];
  for (const c of candidates) {
    if (takenFixtures.has(c.fixture) || takenEvents.has(c.event)) continue;
    takenFixtures.add(c.fixture);
    takenEvents.add(c.event);
    pairs.push(c);
  }
  return pairs;
}

export function coverageReport(ours: FixtureKey[], snapshot: HuntSnapshot): CoverageReport {
  // `ListedEvent` satisfies MatchableEvent (name + startTime + country/tournament).
  const pairs = pairFixturesToEvents(ours, snapshot.events);

  const matched: CoverageMatch[] = pairs.map((p) => ({
    fixture: p.fixture,
    eventId: p.event.eventId,
    score: p.score,
  }));

  const pairedFixtures = new Set(pairs.map((p) => p.fixture));
  const claimed = new Set(pairs.map((p) => p.event.eventId));

  const missingFromBook = ours.filter((f) => !pairedFixtures.has(f));
  const extraAtBook = snapshot.events.filter((e) => !claimed.has(e.eventId));
  const coveragePct = ours.length > 0 ? (matched.length / ours.length) * 100 : 0;

  return { matched, missingFromBook, extraAtBook, coveragePct };
}

// ---- Persistence shapes -----------------------------------------------------

/** A row of `hw_event` — current listing state. Column names match the table. */
export type HwEventRow = {
  event_id: number;
  source_id: string | null;
  name: string;
  start_time: string;
  country_id: number | null;
  country: string | null;
  tournament_id: number | null;
  tournament: string | null;
  home_team: string | null;
  away_team: string | null;
  odds_home: number | null;
  odds_draw: number | null;
  odds_away: number | null;
  market_open: boolean;
  last_seen: string;
  removed_at: string | null;
  /** Consecutive complete crawls that did not contain this event. */
  missing_count?: number;
};

/** Rebuild the pure matching shape from rows read through PostgREST. */
export function snapshotFromEventRows(rows: HwEventRow[], takenAt = Date.now() / 1000): HuntSnapshot {
  return {
    takenAt: Math.floor(takenAt),
    events: rows.map((row) => {
      const odds =
        row.odds_home != null && row.odds_draw != null && row.odds_away != null
          ? { home: row.odds_home, draw: row.odds_draw, away: row.odds_away }
          : null;
      return {
        eventId: row.event_id,
        sourceId: row.source_id,
        name: row.name,
        startTime: row.start_time,
        startUnix: Math.floor(new Date(row.start_time).getTime() / 1000),
        countryId: row.country_id ?? 0,
        country: row.country ?? '',
        tournamentId: row.tournament_id,
        tournament: row.tournament ?? '',
        homeTeam: row.home_team,
        awayTeam: row.away_team,
        odds,
        marketOpen: row.market_open,
      };
    }),
  };
}

export type HwChangeKind =
  | 'added'
  | 'removed'
  | 'suspended'
  | 'reopened'
  | 'shortened'
  | 'drifted';

/** A row of `hw_change` — the append-only log behind the hourly comparison. */
export type HwChangeRow = {
  observed_at: string;
  event_id: number;
  kind: HwChangeKind;
  favourite: Outcome | null;
  shift_pp: number | null;
  before_odds: Odds1x2 | null;
  after_odds: Odds1x2 | null;
};

const iso = (unix: number) => new Date(unix * 1000).toISOString();

/**
 * Current-state rows for everything a crawl saw. Upsert these on `event_id`.
 *
 * `removed_at` is explicitly null so a fixture that disappears and comes back
 * has its tombstone cleared by the same upsert that records the sighting.
 */
export function eventRowsFromSnapshot(snapshot: HuntSnapshot): HwEventRow[] {
  const seen = iso(snapshot.takenAt);
  return snapshot.events.map((e) => ({
    event_id: e.eventId,
    source_id: e.sourceId ?? null,
    name: e.name,
    start_time: e.startTime,
    country_id: e.countryId,
    country: e.country,
    tournament_id: e.tournamentId,
    tournament: e.tournament || null,
    home_team: e.homeTeam,
    away_team: e.awayTeam,
    odds_home: e.odds?.home ?? null,
    odds_draw: e.odds?.draw ?? null,
    odds_away: e.odds?.away ?? null,
    market_open: e.marketOpen,
    last_seen: seen,
    removed_at: null,
  }));
}

/**
 * Turn a diff into change-log rows.
 *
 * Only genuine changes become rows — a steady price writes nothing, which is
 * what keeps the log proportional to activity rather than to crawl frequency.
 * Removals are stamped at the moment we noticed, which is the later snapshot.
 */
export function changeRowsFromDiff(diff: HuntDiff): HwChangeRow[] {
  const at = iso(diff.toUnix);
  const rows: HwChangeRow[] = [];

  const simple = (list: ListedEvent[], kind: HwChangeKind) => {
    for (const e of list) {
      rows.push({
        observed_at: at,
        event_id: e.eventId,
        kind,
        favourite: null,
        shift_pp: null,
        before_odds: null,
        after_odds: e.odds,
      });
    }
  };

  simple(diff.added, 'added');
  simple(diff.removed, 'removed');
  simple(diff.suspended, 'suspended');
  simple(diff.reopened, 'reopened');

  for (const m of diff.moves) {
    if (m.direction === 'steady') continue;
    rows.push({
      observed_at: at,
      event_id: m.eventId,
      kind: m.direction,
      favourite: m.favourite,
      shift_pp: Number(m.favouriteShiftPp.toFixed(2)),
      before_odds: m.before,
      after_odds: m.after,
    });
  }

  return rows;
}

/** Event ids a crawl no longer saw — mark these removed. */
export function removedEventIds(diff: HuntDiff): number[] {
  return diff.removed.map((e) => e.eventId);
}

// ---- Crawl scheduling -------------------------------------------------------

/**
 * How often a league is worth re-crawling, given the next kickoff in it.
 *
 * The notes explicitly require the Hollywood script to run every minute. Keep
 * the interval fixed here; load-shedding belongs in the runner's round-robin
 * batching so the requirement is visible and testable instead of silently
 * weakening the cadence for distant fixtures.
 */
export function crawlIntervalSeconds(_secondsToKickoff: number): number {
  return 60;
}

/** Should this league be crawled now, given when it last was? */
export function isCrawlDue(
  nextKickoffUnix: number,
  lastCrawledUnix: number,
  nowUnix: number,
): boolean {
  const interval = crawlIntervalSeconds(nextKickoffUnix - nowUnix);
  return nowUnix - lastCrawledUnix >= interval;
}
