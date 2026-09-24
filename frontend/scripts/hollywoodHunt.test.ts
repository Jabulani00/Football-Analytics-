/**
 * Unit tests for Section 10 — squad-aware matching + the hunt engine.
 * Run: npx tsx scripts/hollywoodHunt.test.ts
 */
import {
  availableBetTypes,
  BET_TYPE,
  BET_TYPE_LABEL,
  bttsDecimal,
  CORE_BET_TYPE_IDS,
  correctScoreDecimal,
  marketGroups,
  marketOdds,
  totalsDecimal,
  type HbEvent,
} from '../services/hollywoodTypes';
import { buildAllMarketRows, buildFusionRows, buildMarketRows } from '../services/hollywoodFusion';
import {
  matchFixtureToEvent,
  normalizeCountry,
  sameSquad,
  squadTag,
  stripSquadTokens,
  teamSimilarity,
} from '../services/hollywoodMatch';
import {
  changeRowsFromDiff,
  coverageReport,
  crawlIntervalSeconds,
  diffSnapshots,
  eventRowsFromSnapshot,
  isCrawlDue,
  pairFixturesToEvents,
  removedEventIds,
  snapshotFromEvents,
  type HuntSnapshot,
  type ListedEvent,
} from '../services/hollywoodHunt';
import { leagueCoverage, statsCoverage } from '../utils/statsCoverage';
import type { TeamResult } from '../utils/teamResults';
import {
  canStartTournament,
  completeEventsArray,
  remainingBudgetMs,
  rotatingWindow,
} from '../../supabase/functions/_shared/hollywoodHuntRunner';

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/** Decimal odds → the fractional net odds Hollywood actually returns. */
function frac(decimalOdds: number): number {
  return decimalOdds - 1;
}

function event(
  id: number,
  name: string,
  startTime: string,
  odds: [number, number, number] | null,
  extra: Partial<HbEvent> = {},
): HbEvent {
  const markets =
    odds == null
      ? []
      : [1, 2, 3].map((n) => ({
          id: id * 10 + n,
          eventId: id,
          eventBetTypeMapId: id,
          eventDetailId: id * 100 + n,
          status: 'active',
          number: n,
          name: `sel${n}`,
          odds: frac(odds[n - 1]),
          ratio: '',
        }));

  return {
    id,
    name,
    startTime,
    categoryId: 1,
    category: 'England',
    tournament: 'Premier League',
    isOutright: false,
    betTypes: markets.length
      ? [{ id: 15, name: 'Full Time', status: 'active', eventBetTypeMapID: id, markets }]
      : [],
    ...extra,
  };
}

/** Build an event carrying several bet types, odds given as DECIMAL. */
function multi(
  id: number,
  markets: { betTypeId: number; name: string; sels: [number, string, number][] }[],
): HbEvent {
  return {
    id,
    name: 'ANDORRA vs MALTA',
    startTime: '2026-09-24T16:00:00+00:00',
    categoryId: 1,
    category: 'International',
    tournament: '',
    isOutright: false,
    betTypes: markets.map((m) => ({
      id: m.betTypeId,
      name: m.name,
      status: 'Active',
      eventBetTypeMapID: id * 10 + m.betTypeId,
      markets: m.sels.map(([number, name, dec]) => ({
        id: number,
        eventId: id,
        eventBetTypeMapId: id,
        eventDetailId: number,
        status: 'Active',
        number,
        name,
        odds: frac(dec),
        ratio: '',
      })),
    })),
  };
}

console.log('\nSection 10 — squad tiers');
{
  check('senior is senior', squadTag('Real Madrid').tier === 'senior');
  check('II is reserve level 2', squadTag('Real Madrid II').level === 2);
  check('B is reserve level 2', squadTag('Barcelona B').level === 2);
  check('III is level 3', squadTag('Ajax III').level === 3);
  check('U21 is youth with age cap', squadTag('Bayern Munich U21').ageCap === 21);
  check('Junior is youth, no age cap', squadTag('Ajax Junior').tier === 'youth');
  check('under 19 spelled out', squadTag('Ajax Under 19').ageCap === 19);
  check('women detected', squadTag('Arsenal Women').women === true);

  // The regression this gate exists for.
  check('reserve never matches senior', teamSimilarity('Real Madrid II', 'Real Madrid') === 0);
  check('B side never matches senior', teamSimilarity('Barcelona B', 'Barcelona') === 0);
  check('youth never matches senior', teamSimilarity('Ajax Junior', 'Ajax') === 0);
  check('U19 never matches U21', teamSimilarity('Bayern U19', 'Bayern U21') === 0);
  check('women never match men', teamSimilarity('Arsenal Women', 'Arsenal') === 0);

  // ...without breaking the legitimate matches it must keep.
  check('abbreviation still matches', teamSimilarity('Man City', 'Manchester City') >= 0.5);
  check('Utd synonym still matches', teamSimilarity('Chippa Utd', 'Chippa United') === 1);
  check('II and B read as one club', teamSimilarity('Real Madrid II', 'Real Madrid B') === 1);
  check('same age group matches', teamSimilarity('Bayern U19', 'Bayern Munich U19') >= 0.5);
  check('squad tokens stripped', stripSquadTokens('Real Madrid II') === 'real madrid');
  check('bare name never stripped empty', stripSquadTokens('B') === 'b');
  check(
    'sameSquad is reflexive',
    sameSquad(squadTag('Arsenal Women U21'), squadTag('Arsenal Women U21')),
  );
}

console.log('\nSection 10 — the match key (p77/p78)');
{
  const KO = Math.floor(new Date('2026-09-10T14:00:00Z').getTime() / 1000);
  const arsenal = event(1, 'Arsenal vs Chelsea', '2026-09-10T14:00:00Z', [2.0, 3.5, 4.0]);

  const base = { homeName: 'Arsenal', awayName: 'Chelsea', kickoffUnix: KO };

  check('matches with no country given', matchFixtureToEvent(base, [arsenal]) != null);
  check(
    'country agreeing still matches',
    matchFixtureToEvent({ ...base, country: 'England' }, [arsenal]) != null,
  );
  check(
    'country mismatch rejects despite perfect names',
    matchFixtureToEvent({ ...base, country: 'Spain' }, [arsenal]) == null,
  );
  check(
    'country alias folds (USA / United States)',
    normalizeCountry('USA') === normalizeCountry('United States'),
  );
  check('Korea Republic folds to South Korea', normalizeCountry('Korea Republic') === 'south korea');
  check(
    'event without a country is not rejected',
    matchFixtureToEvent({ ...base, country: 'England' }, [
      { name: 'Arsenal vs Chelsea', startTime: '2026-09-10T14:00:00Z' },
    ]) != null,
  );

  // League scores but must never reject.
  const wrongLeague = matchFixtureToEvent({ ...base, league: 'Serie A' }, [arsenal]);
  const rightLeague = matchFixtureToEvent({ ...base, league: 'Premier League' }, [arsenal]);
  check('league mismatch does not reject', wrongLeague != null);
  check(
    'league match scores higher than league mismatch',
    (rightLeague?.score ?? 0) > (wrongLeague?.score ?? 1),
    `${rightLeague?.score} vs ${wrongLeague?.score}`,
  );

  // Orientation: home must be home.
  check(
    'side-swapped listing does not match',
    matchFixtureToEvent(base, [
      event(2, 'Chelsea vs Arsenal', '2026-09-10T14:00:00Z', [2.0, 3.5, 4.0]),
    ]) == null,
  );

  // Kick-off still gates.
  check(
    'kickoff outside tolerance rejects',
    matchFixtureToEvent({ ...base, kickoffUnix: KO + 6 * 3600 }, [arsenal]) == null,
  );

  // Score stays a genuine confidence.
  const scores = [
    matchFixtureToEvent(base, [arsenal])?.score,
    matchFixtureToEvent({ ...base, country: 'England', league: 'Premier League' }, [arsenal])?.score,
    matchFixtureToEvent({ homeName: 'Arsenal', awayName: 'Chelsea' }, [arsenal])?.score,
  ];
  check(
    'every score is within 0..1',
    scores.every((s) => s != null && s >= 0 && s <= 1),
    scores.join(', '),
  );
  check(
    'a perfect match on every field scores 1',
    Math.abs((scores[1] ?? 0) - 1) < 1e-9,
    `${scores[1]}`,
  );
}

console.log('\nSection 10 — snapshots');
{
  const events = [
    event(1, 'Arsenal vs Chelsea', '2026-09-10T14:00:00Z', [2.0, 3.5, 4.0]),
    event(2, 'Arsenal II vs Chelsea II', '2026-09-10T14:00:00Z', [2.5, 3.2, 3.0]),
    event(3, 'Outright Winner', '2026-09-10T14:00:00Z', null, { isOutright: true }),
    event(4, 'Leeds vs Everton', '2026-09-10T16:00:00Z', null),
  ];
  const snap = snapshotFromEvents(events, 1_000);

  check('outrights excluded', snap.events.every((e) => e.eventId !== 3));
  check('three fixtures listed', snap.events.length === 3);
  check('decimal odds recovered', snap.events[0].odds?.home === 2);
  check('market open when priced', snap.events[0].marketOpen === true);
  check('no market → closed', snap.events.find((e) => e.eventId === 4)?.marketOpen === false);
  check('kickoff parsed to unix', snap.events[0].startUnix > 0);
}

console.log('\nSection 10 — diffing');
{
  const t1 = snapshotFromEvents(
    [
      event(1, 'Arsenal vs Chelsea', '2026-09-10T14:00:00Z', [2.0, 3.5, 4.0]),
      event(2, 'Leeds vs Everton', '2026-09-10T16:00:00Z', [2.5, 3.2, 3.0]),
      event(3, 'Brentford vs Fulham', '2026-09-10T18:00:00Z', [2.0, 3.4, 4.2]),
    ],
    1_000,
  );
  const t2 = snapshotFromEvents(
    [
      // Arsenal shortened hard: 2.00 → 1.50.
      event(1, 'Arsenal vs Chelsea', '2026-09-10T14:00:00Z', [1.5, 4.0, 6.0]),
      // Leeds market pulled but fixture still listed.
      event(2, 'Leeds vs Everton', '2026-09-10T16:00:00Z', null),
      // Brentford gone entirely; a new fixture appears.
      event(4, 'Wolves vs Burnley', '2026-09-10T20:00:00Z', [2.1, 3.3, 3.6]),
    ],
    2_000,
  );

  const diff = diffSnapshots(t1, t2);

  check('removed fixture caught', diff.removed.some((e) => e.eventId === 3));
  check('added fixture caught', diff.added.some((e) => e.eventId === 4));
  check('suspension caught', diff.suspended.some((e) => e.eventId === 2));
  check('still-listed counted', diff.stillListed === 2);
  check('window carried through', diff.fromUnix === 1_000 && diff.toUnix === 2_000);

  const move = diff.moves.find((m) => m.eventId === 1);
  check('favourite identified', move?.favourite === 'home');
  check('shortening detected', move?.direction === 'shortened', move?.direction);
  check('shift is positive pp', (move?.favouriteShiftPp ?? 0) > 0);
  check(
    'cooled bundles removed + suspended + shortened',
    [1, 2, 3].every((id) => diff.cooledEventIds.includes(id)),
    diff.cooledEventIds.join(','),
  );
  check('added is not cooled', !diff.cooledEventIds.includes(4));

  // A drift the other way, and a move too small to count.
  const steady = snapshotFromEvents(
    [event(1, 'Arsenal vs Chelsea', '2026-09-10T14:00:00Z', [2.02, 3.48, 4.0])],
    2_000,
  );
  const smallDiff = diffSnapshots(
    snapshotFromEvents(
      [event(1, 'Arsenal vs Chelsea', '2026-09-10T14:00:00Z', [2.0, 3.5, 4.0])],
      1_000,
    ),
    steady,
  );
  check('tiny move is steady', smallDiff.moves[0]?.direction === 'steady');
  check('steady is not cooled', smallDiff.cooledEventIds.length === 0);

  const drifted = diffSnapshots(
    snapshotFromEvents(
      [event(1, 'Arsenal vs Chelsea', '2026-09-10T14:00:00Z', [1.5, 4.0, 6.0])],
      1_000,
    ),
    snapshotFromEvents(
      [event(1, 'Arsenal vs Chelsea', '2026-09-10T14:00:00Z', [2.0, 3.5, 4.0])],
      2_000,
    ),
  );
  check('drift detected', drifted.moves[0]?.direction === 'drifted');
}

console.log('\nSection 10 — coverage');
{
  const snap = snapshotFromEvents(
    [
      event(1, 'Arsenal vs Chelsea', '2026-09-10T14:00:00Z', [2.0, 3.5, 4.0]),
      event(2, 'Real Madrid II vs Barcelona B', '2026-09-10T16:00:00Z', [2.5, 3.2, 3.0]),
    ],
    1_000,
  );
  const kickoff = Math.floor(new Date('2026-09-10T14:00:00Z').getTime() / 1000);

  const report = coverageReport(
    [
      { homeName: 'Arsenal', awayName: 'Chelsea', kickoffUnix: kickoff },
      { homeName: 'Leeds United', awayName: 'Everton', kickoffUnix: kickoff },
    ],
    snap,
  );

  check('our fixture matched', report.matched.length === 1);
  check('gap reported', report.missingFromBook[0]?.homeName === 'Leeds United');
  check('book extra reported', report.extraAtBook.some((e) => e.eventId === 2));
  check('coverage pct', Math.round(report.coveragePct) === 50, `${report.coveragePct}`);

  // The senior fixture must not be "covered" by the reserve listing.
  const reserveOnly = coverageReport(
    [{ homeName: 'Real Madrid', awayName: 'Barcelona', kickoffUnix: kickoff }],
    snapshotFromEvents(
      [event(2, 'Real Madrid II vs Barcelona B', '2026-09-10T14:00:00Z', [2.5, 3.2, 3.0])],
      1_000,
    ),
  );
  check('reserve listing does not cover senior fixture', reserveOnly.matched.length === 0);
  check('and is reported as a gap', reserveOnly.missingFromBook.length === 1);

  // One event cannot cover two of our fixtures.
  const dupes = coverageReport(
    [
      { homeName: 'Arsenal', awayName: 'Chelsea', kickoffUnix: kickoff },
      { homeName: 'Arsenal', awayName: 'Chelsea', kickoffUnix: kickoff },
    ],
    snapshotFromEvents(
      [event(1, 'Arsenal vs Chelsea', '2026-09-10T14:00:00Z', [2.0, 3.5, 4.0])],
      1_000,
    ),
  );
  check('an event is claimed once', dupes.matched.length === 1 && dupes.missingFromBook.length === 1);
}

console.log('\nSection 10 — stats coverage (p3 item 15)');
{
  /** n results for a team, alternating home/away starting with `startHome`. */
  function results(teamId: number, n: number, startHome = true): TeamResult[] {
    return Array.from({ length: n }, (_, i) => ({
      fixtureId: teamId * 100 + i,
      unix: 1_000 - i,
      teamId,
      opponentId: 99,
      opponentName: 'Opp',
      isHome: startHome ? i % 2 === 0 : i % 2 === 1,
      gf: 1,
      ga: 0,
      outcome: 'W' as const,
      opponentRank: null,
      teamRank: null,
      opponentAbove: null,
      goalDiff: 1,
    }));
  }

  const rich = statsCoverage({
    homeId: 1,
    awayId: 2,
    homeName: 'Alpha',
    awayName: 'Bravo',
    homeResults: results(1, 10),
    awayResults: results(2, 10, false),
    h2hCount: 5,
    inTable: true,
  });
  check('rich fixture is full', rich.level === 'full', rich.level);
  check('rich fixture is callable', rich.callable === true);
  check('rich fixture has no gaps', rich.gaps.length === 0, rich.gaps.join(' | '));

  const thin = statsCoverage({
    homeId: 1,
    awayId: 2,
    homeName: 'Alpha',
    awayName: 'Bravo',
    homeResults: results(1, 2),
    awayResults: results(2, 10, false),
    h2hCount: 5,
    inTable: true,
  });
  check('MP of 2 is not usable', thin.home.usable === false);
  check('thin fixture is not callable', thin.callable === false);
  check('thin fixture level is thin', thin.level === 'thin', thin.level);
  check('thin fixture names the short side', thin.gaps.some((g) => g.includes('Alpha')));

  const none = statsCoverage({
    homeId: 1,
    awayId: 2,
    homeName: 'Alpha',
    awayName: 'Bravo',
    homeResults: [],
    awayResults: results(2, 10, false),
    h2hCount: 0,
    inTable: false,
  });
  check('no history reads none', none.level === 'none', none.level);
  check('no h2h is reported', none.gaps.includes('No past meetings'));
  check('off-table is reported', none.gaps.some((g) => g.includes('league table')));

  const partial = statsCoverage({
    homeId: 1,
    awayId: 2,
    homeName: 'Alpha',
    awayName: 'Bravo',
    homeResults: results(1, 10),
    awayResults: results(2, 10, false),
    h2hCount: 1,
    inTable: true,
  });
  check('usable overall but thin h2h is partial', partial.level === 'partial', partial.level);
  check('partial is still callable', partial.callable === true);

  const league = leagueCoverage([rich, thin, none, partial]);
  check('league rolls up fixture count', league.fixtures === 4);
  check('league counts each level', league.full === 1 && league.thin === 1 && league.none === 1);
  check('league callable share', Math.round(league.callablePct) === 50, `${league.callablePct}`);
  check('empty league does not divide by zero', leagueCoverage([]).callablePct === 0);
}

console.log('\nSection 10 — persistence rows');
{
  const t1 = snapshotFromEvents(
    [
      event(1, 'Arsenal vs Chelsea', '2026-09-10T14:00:00Z', [2.0, 3.5, 4.0]),
      event(2, 'Leeds vs Everton', '2026-09-10T16:00:00Z', [2.5, 3.2, 3.0]),
      event(3, 'Brentford vs Fulham', '2026-09-10T18:00:00Z', [2.0, 3.4, 4.2]),
    ],
    1_000,
  );
  const t2 = snapshotFromEvents(
    [
      event(1, 'Arsenal vs Chelsea', '2026-09-10T14:00:00Z', [1.5, 4.0, 6.0]), // shortened
      event(2, 'Leeds vs Everton', '2026-09-10T16:00:00Z', null), // suspended
      event(4, 'Wolves vs Burnley', '2026-09-10T20:00:00Z', [2.1, 3.3, 3.6]), // added
    ],
    2_000,
  );

  const rows = eventRowsFromSnapshot(t2);
  check('one event row per listing', rows.length === 3);
  check('columns are snake_case for PostgREST', 'event_id' in rows[0] && 'market_open' in rows[0]);
  check('odds land as decimal', rows.find((r) => r.event_id === 1)?.odds_home === 1.5);
  check('unpriced fixture stores null odds', rows.find((r) => r.event_id === 2)?.odds_home === null);
  check(
    'a sighting always clears the tombstone',
    rows.every((r) => r.removed_at === null),
  );
  check('last_seen stamped from the snapshot', rows[0].last_seen === new Date(2_000 * 1000).toISOString());
  check('empty tournament stored as null, not ""', rows[0].tournament !== '');

  const diff = diffSnapshots(t1, t2);
  const changes = changeRowsFromDiff(diff);
  const kinds = changes.map((c) => c.kind).sort();

  check('every real change is logged', changes.length === 4, `${changes.length}: ${kinds}`);
  check('added logged', kinds.includes('added'));
  check('removed logged', kinds.includes('removed'));
  check('suspended logged', kinds.includes('suspended'));
  check('shortened logged', kinds.includes('shortened'));

  const move = changes.find((c) => c.kind === 'shortened');
  check('move row carries the favourite', move?.favourite === 'home', `${move?.favourite}`);
  check('shift rounded to 2dp for numeric(6,2)', Number.isFinite(move?.shift_pp ?? NaN) && String(move?.shift_pp).split('.')[1]?.length <= 2);
  check('move row keeps both prices', move?.before_odds?.home === 2.0 && move?.after_odds?.home === 1.5);
  check(
    'all rows stamped at the later snapshot',
    changes.every((c) => c.observed_at === new Date(2_000 * 1000).toISOString()),
  );

  check('removed ids extracted for tombstoning', removedEventIds(diff).join() === '3');

  // A quiet crawl must write nothing — the log grows with activity, not polls.
  const quiet = diffSnapshots(t1, snapshotFromEvents(
    [
      event(1, 'Arsenal vs Chelsea', '2026-09-10T14:00:00Z', [2.0, 3.5, 4.0]),
      event(2, 'Leeds vs Everton', '2026-09-10T16:00:00Z', [2.5, 3.2, 3.0]),
      event(3, 'Brentford vs Fulham', '2026-09-10T18:00:00Z', [2.0, 3.4, 4.2]),
    ],
    2_000,
  ));
  check('an unchanged crawl logs nothing', changeRowsFromDiff(quiet).length === 0);
}

console.log('\nSection 10 — crawl cadence');
{
  check('near kickoff → every minute', crawlIntervalSeconds(30 * 60) === 60);
  check('in-play → every minute', crawlIntervalSeconds(-100) === 60);
  check('same day → every minute', crawlIntervalSeconds(10 * 3600) === 60);
  check('far out → every minute', crawlIntervalSeconds(3 * 24 * 3600) === 60);

  const now = 100_000;
  check('due when interval elapsed', isCrawlDue(now + 1800, now - 120, now) === true);
  check('not due inside interval', isCrawlDue(now + 1800, now - 30, now) === false);
  check('distant league is due after an hour', isCrawlDue(now + 5 * 86400, now - 3600, now) === true);
}

console.log('\nSection 10 — pairing fixtures to events');
{
  const KO = Math.floor(new Date('2026-09-10T14:00:00Z').getTime() / 1000);
  const events = [
    event(1, 'Arsenal vs Chelsea', '2026-09-10T14:00:00Z', [2.0, 3.5, 4.0]),
    event(2, 'Leeds vs Everton', '2026-09-10T14:00:00Z', [2.5, 3.2, 3.0]),
  ];

  const pairs = pairFixturesToEvents(
    [
      { homeName: 'Arsenal', awayName: 'Chelsea', kickoffUnix: KO },
      { homeName: 'Leeds United', awayName: 'Everton', kickoffUnix: KO },
    ],
    events,
  );
  check('both fixtures pair', pairs.length === 2);
  check(
    'each event is used once',
    new Set(pairs.map((p) => p.event.id)).size === 2,
  );

  // Two fixtures competing for one event: the better match must win, regardless
  // of which came first in the array.
  const contested = pairFixturesToEvents(
    [
      { homeName: 'Arsenal', awayName: 'Chelsea', kickoffUnix: KO, league: 'Wrong League' },
      { homeName: 'Arsenal', awayName: 'Chelsea', kickoffUnix: KO, league: 'Premier League' },
    ],
    [events[0]],
  );
  check('contested event pairs once', contested.length === 1);
  check(
    'the stronger match wins, not the earlier one',
    contested[0].fixture.league === 'Premier League',
    contested[0].fixture.league,
  );
}

console.log('\nSection 11 — model vs book (p80/p82/p85)');
{
  const CTX = { tournamentId: 1, tournamentName: 'Premier League', countryId: 1 };
  const ev = event(1, 'Arsenal vs Chelsea', '2026-09-10T14:00:00Z', [2.0, 3.5, 4.0]);

  // No model: the row must say so rather than imply a checked-and-found-nothing 0.
  const [blind] = buildFusionRows([ev], CTX);
  check('no model → edgePct is null, not 0', blind.edgePct === null, `${blind.edgePct}`);
  check('no model → hasModel false', blind.hasModel === false);
  check('no model → pick comes from the book', blind.pickSource === 'book');
  check('no model → no agreement verdict', blind.agreement === null);
  check('book pick is the shortest price', blind.bookPick === '1', blind.bookPick);

  // Model agrees with the book.
  const [agree] = buildFusionRows([ev], CTX, () => ({ home: 0.6, draw: 0.25, away: 0.15 }));
  check('model agreeing → umbono munye', agree.agreement === 'umbono_munye', `${agree.agreement}`);
  check('model agreeing → pick from model', agree.pickSource === 'model');
  check('model agreeing → hasModel true', agree.hasModel === true);
  // EV = (0.6 × 2.00 − 1) × 100 = 20%
  check('edge measured against the model', Math.abs((agree.edgePct ?? 0) - 20) < 1e-9, `${agree.edgePct}`);

  // Model disagrees — per p80 this is an underdog opportunity, not an error.
  const [differ] = buildFusionRows([ev], CTX, () => ({ home: 0.2, draw: 0.25, away: 0.55 }));
  check('model differing → imibono ihlukene', differ.agreement === 'imibono_ihlukene', `${differ.agreement}`);
  check('model differing → pick follows the model', differ.pick === '2', differ.pick);
  check('book pick is unchanged by our disagreement', differ.bookPick === '1');
  // EV = (0.55 × 4.00 − 1) × 100 = 120%
  check('edge uses the model price', Math.abs((differ.edgePct ?? 0) - 120) < 1e-9, `${differ.edgePct}`);

  // What the old code did on EVERY row: no model, so it measured the book
  // against its own de-vigged prices. That is not a ~0 edge — it is exactly
  // minus the overround, the bookmaker's built-in margin, reported as if it
  // were our analysis. Pinning the identity here so the trap stays documented.
  const [mirror] = buildFusionRows([ev], CTX, () => {
    const raw = [1 / 2.0, 1 / 3.5, 1 / 4.0];
    const t = raw[0] + raw[1] + raw[2];
    return { home: raw[0] / t, draw: raw[1] / t, away: raw[2] / t };
  });
  const overround = 1 / 2.0 + 1 / 3.5 + 1 / 4.0;
  const marginPct = (1 / overround - 1) * 100; // ≈ -3.45%
  check(
    'mirroring the book returns minus the overround, not zero',
    Math.abs((mirror.edgePct ?? 99) - marginPct) < 1e-9,
    `${mirror.edgePct} vs ${marginPct}`,
  );
  check('and that value is negative for every row', (mirror.edgePct ?? 0) < 0);

  // Unpriced events are skipped entirely.
  check(
    'unpriced event produces no row',
    buildFusionRows([event(9, 'A vs B', '2026-09-10T14:00:00Z', null)], CTX).length === 0,
  );
}

console.log('\nSection 11 — all markets');
{
  // The bug this catches: TOTALS used to be 27, which returns no events at all.
  check('TOTALS points at Additional Totals (60), not 27', BET_TYPE.TOTALS === 60, `${BET_TYPE.TOTALS}`);
  check('core set covers the notes’ markets', CORE_BET_TYPE_IDS.includes(BET_TYPE.BTTS) && CORE_BET_TYPE_IDS.includes(BET_TYPE.TOTALS));
  check('every core id has a label', CORE_BET_TYPE_IDS.every((id) => BET_TYPE_LABEL[id] != null));

  const ev = multi(1, [
    { betTypeId: BET_TYPE.FULL_TIME, name: 'Full Time', sels: [[1, 'ANDORRA', 3.2], [2, 'DRAW', 2.45], [3, 'MALTA', 2.45]] },
    { betTypeId: BET_TYPE.BTTS, name: 'Both Teams to Score', sels: [[1, 'YES', 2.35], [2, 'NO', 1.55]] },
    {
      betTypeId: BET_TYPE.TOTALS,
      name: 'Additional Totals',
      sels: [[1, 'OVER 1.5', 1.6], [2, 'OVER 2.5', 2.9], [16, 'UNDER 1.5', 1.8], [17, 'UNDER 2.5', 1.35]],
    },
    { betTypeId: BET_TYPE.CORRECT_SCORE, name: 'Correct Score', sels: [[1, '0:0', 5.25], [2, '1:0', 6.4]] },
  ]);

  check('available bet types listed', availableBetTypes(ev).length === 4);
  check(
    'markets convert fractional to decimal',
    marketOdds(ev, BET_TYPE.FULL_TIME)[0].decimal === 3.2,
    `${marketOdds(ev, BET_TYPE.FULL_TIME)[0].decimal}`,
  );
  check('fractional kept alongside decimal', Math.abs(marketOdds(ev, BET_TYPE.FULL_TIME)[0].fractional - 2.2) < 1e-9);
  check('unpriced market returns empty', marketOdds(ev, BET_TYPE.HANDICAP).length === 0);

  const btts = bttsDecimal(ev);
  check('BTTS yes/no read', btts?.yes === 2.35 && btts?.no === 1.55, JSON.stringify(btts));

  const totals = totalsDecimal(ev);
  check('totals keyed by line', Object.keys(totals).sort().join(',') === '1.5,2.5', Object.keys(totals).join(','));
  check('over and under paired per line', totals['2.5']?.over === 2.9 && totals['2.5']?.under === 1.35);
  // The book numbers overs 1-5 and unders 16-20; parsing must come from the
  // name, not that undocumented offset.
  check('under parsed despite number 17', totals['2.5']?.under != null);

  const cs = correctScoreDecimal(ev);
  check('correct scores keyed by scoreline', cs['1:0'] === 6.4, JSON.stringify(cs));
  check('non-score selections excluded', Object.keys(cs).every((k) => /^\d+:\d+$/.test(k)));

  check('BTTS absent → null', bttsDecimal(multi(2, [])) === null);
  check('totals absent → empty map', Object.keys(totalsDecimal(multi(3, []))).length === 0);

  // The per-event feed SPLITS one market across several groups sharing an id and
  // differing only by eventBetTypeMapID — Additional Totals arrives as five
  // groups of two. Reading the first group alone loses 8 of 10 selections.
  const split = multi(4, [
    { betTypeId: BET_TYPE.TOTALS, name: 'Additional Totals', sels: [[1, 'OVER 0.5', 1.14], [16, 'UNDER 0.5', 5.2]] },
    { betTypeId: BET_TYPE.TOTALS, name: 'Additional Totals', sels: [[2, 'OVER 1.5', 1.6], [17, 'UNDER 1.5', 1.8]] },
    { betTypeId: BET_TYPE.TOTALS, name: 'Additional Totals', sels: [[3, 'OVER 2.5', 2.9], [18, 'UNDER 2.5', 1.35]] },
    { betTypeId: BET_TYPE.BTTS, name: 'Both Teams to Score', sels: [[1, 'YES', 2.35], [2, 'NO', 1.55]] },
  ]);

  check(
    'split groups are all gathered',
    marketOdds(split, BET_TYPE.TOTALS).length === 6,
    `${marketOdds(split, BET_TYPE.TOTALS).length}`,
  );
  const splitTotals = totalsDecimal(split);
  check(
    'every split line is read, not just the first',
    Object.keys(splitTotals).sort().join(',') === '0.5,1.5,2.5',
    Object.keys(splitTotals).join(','),
  );
  check('a later split line keeps both sides', splitTotals['2.5']?.over === 2.9 && splitTotals['2.5']?.under === 1.35);
  check('duplicate ids collapse in availableBetTypes', availableBetTypes(split).length === 2, `${availableBetTypes(split)}`);

  const groups = marketGroups(split);
  check('marketGroups merges split groups into one', groups.length === 2, `${groups.length}`);
  const totalsGroup = groups.find((g) => g.betTypeId === BET_TYPE.TOTALS);
  check('merged group carries every selection', totalsGroup?.selections.length === 6);
  check('merged group keeps its label', totalsGroup?.name === 'Additional Totals', totalsGroup?.name);
}

console.log('\nSection 11 — per-market fusion');
{
  const ev = multi(9, [
    { betTypeId: BET_TYPE.FULL_TIME, name: 'Full Time', sels: [[1, 'H', 2.0], [2, 'D', 3.5], [3, 'A', 4.0]] },
    { betTypeId: BET_TYPE.BTTS, name: 'Both Teams to Score', sels: [[1, 'YES', 2.0], [2, 'NO', 2.0]] },
    { betTypeId: BET_TYPE.TOTALS, name: 'Additional Totals', sels: [[1, 'OVER 0.5', 1.25], [16, 'UNDER 0.5', 4.5], [3, 'OVER 2.5', 2.0], [18, 'UNDER 2.5', 2.0]] },
    { betTypeId: BET_TYPE.CORRECT_SCORE, name: 'Correct Score', sels: [[1, '0:0', 9.0]] },
  ]);

  const noModel = buildMarketRows(ev, null);
  check(
    'rows span several markets',
    new Set(noModel.map((r) => r.betTypeId)).size === 3,
    `${new Set(noModel.map((r) => r.betTypeId)).size}`,
  );
  check(
    'markets we cannot price are excluded, not shown as 0 edge',
    noModel.every((r) => r.betTypeId !== BET_TYPE.CORRECT_SCORE),
  );
  check('no model → every edge null', noModel.every((r) => r.edgePct === null));

  const model = { home: 0.6, draw: 0.25, away: 0.15, btts: 0.7, over05: 0.92, over15: 0.8, over25: 0.65, over35: 0.3 };
  const withModel = buildMarketRows(ev, model);

  const bttsYes = withModel.find((r) => r.betTypeId === BET_TYPE.BTTS && r.selection === 'YES');
  // EV = (0.70 × 2.00 − 1) × 100 = 40%
  check('BTTS yes edge comes from the model', Math.abs((bttsYes?.edgePct ?? 0) - 40) < 1e-9, `${bttsYes?.edgePct}`);
  const bttsNo = withModel.find((r) => r.betTypeId === BET_TYPE.BTTS && r.selection === 'NO');
  // NO must take the complement: (0.30 × 2.00 − 1) × 100 = −40%
  check('BTTS no takes the complement', Math.abs((bttsNo?.edgePct ?? 0) + 40) < 1e-9, `${bttsNo?.edgePct}`);

  const over = withModel.find((r) => r.selection === 'OVER 2.5');
  // EV = (0.65 × 2.00 − 1) × 100 = 30% — proves the 2.5 line hit over25, not over15.
  check('O/U line matched to the right model key', Math.abs((over?.edgePct ?? 0) - 30) < 1e-9, `${over?.edgePct}`);
  check('totals rows are labelled by line', over?.marketName === 'Total Goals 2.5', over?.marketName);
  const over05 = withModel.find((r) => r.selection === 'OVER 0.5');
  check('O/U 0.5 is included when the provider publishes o05', over05?.modelProb === 0.92, `${over05?.modelProb}`);

  // Even-money both sides de-vigs to exactly 0.5 each.
  check('two-way de-vig applied', Math.abs((bttsYes?.fair ?? 0) - 0.5) < 1e-9, `${bttsYes?.fair}`);
  check(
    'we disagree with an even-money book on BTTS',
    bttsYes?.agreement === 'imibono_ihlukene',
    `${bttsYes?.agreement}`,
  );

  const sorted = buildAllMarketRows([ev], () => model);
  const edges = sorted.filter((r) => r.edgePct != null).map((r) => r.edgePct as number);
  check('best edge sorts first', edges[0] === Math.max(...edges), `${edges[0]}`);
}

console.log('\nSection 10 — hosted runner safety guards');
{
  const tournaments = Array.from({ length: 25 }, (_, index) => index + 1);
  const first = rotatingWindow(tournaments, 20, 0);
  const second = rotatingWindow(tournaments, 20, 20);
  check('runner bounds one tournament window', first.length === 20, `${first.length}`);
  check(
    'rotating tournament windows eventually cover items after the first 20',
    second.includes(25),
    JSON.stringify(second),
  );
  check(
    'rotating tournament windows wrap without duplicates',
    new Set(second).size === second.length && second[0] === 21 && second.at(-1) === 15,
    JSON.stringify(second),
  );

  check('missing events envelope is rejected', completeEventsArray({ data: [] }) === null);
  check('malformed events envelope is rejected', completeEventsArray({ events: {} }) === null);
  check('a complete empty event array remains distinguishable', completeEventsArray({ events: [] })?.length === 0);

  check('remaining run budget is clamped at zero', remainingBudgetMs(1_000, 50_000, 45_000) === 0);
  check('runner starts while request budget remains', canStartTournament(1_000, 40_000, 45_000, 5_000));
  check('runner defers at the request-budget boundary', !canStartTournament(1_000, 41_001, 45_000, 5_000));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
