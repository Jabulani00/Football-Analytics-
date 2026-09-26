/**
 * Unit tests for the Series stats engine (spec §4.6).
 */
import {
  buildFixtureSeries,
  levelForRun,
  MIN_SERIES,
  runLength,
  SERIES_DEFS,
  type SeriesGroup,
  type SeriesRow,
  type TeamSeries,
} from '../utils/fixtureSeries';
import { excludeFixture, type TeamResult } from '../utils/teamResults';

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  ✓ ${name}`);
    passed += 1;
  } else {
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
    failed += 1;
  }
}

let seq = 0;

/** Callers pass results newest-first, matching `teamResultsFromFixtures`. */
function result(gf: number, ga: number, isHome = true, opponentName = 'Opp'): TeamResult {
  seq += 1;
  return {
    fixtureId: seq,
    unix: 1_000_000 - seq,
    teamId: 1,
    opponentId: 2,
    opponentName,
    isHome,
    gf,
    ga,
    outcome: gf > ga ? 'W' : gf < ga ? 'L' : 'D',
    opponentRank: null,
    teamRank: null,
    opponentAbove: null,
    goalDiff: gf - ga,
  };
}

function rowFor(groups: SeriesGroup[], key: string): SeriesRow | undefined {
  return groups.flatMap((g) => g.rows).find((r) => r.key === key);
}

function homeSeries(
  results: TeamResult[],
  key: string,
  minLength?: number,
): TeamSeries | undefined {
  const { groups } = buildFixtureSeries({ homeResults: results, awayResults: [], minLength });
  return rowFor(groups, key)?.home;
}

console.log('\nSeries stats — catalogue');
{
  check('29 series defined', SERIES_DEFS.length === 29, `got ${SERIES_DEFS.length}`);
  check('keys are unique', new Set(SERIES_DEFS.map((d) => d.key)).size === 29);
  check('7 "without" sub-series', SERIES_DEFS.filter((d) => d.invert).length === 7);
  check('MIN_SERIES is 3', MIN_SERIES === 3);
}

console.log('\nSeries stats — run length & thresholds');
{
  const over15x4 = [result(2, 1), result(3, 0), result(1, 1), result(2, 2), result(0, 0)];
  const s = homeSeries(over15x4, 'over15');
  check('4-game Over 1.5 run reports 4', s?.run === 4, `got ${s?.run}`);
  check('the run is active', s?.active === true);

  // Newest two are over 1.5, the third breaks it — below the threshold.
  const over15x2 = [result(2, 1), result(1, 1), result(0, 0), result(3, 1), result(2, 2)];
  const { groups } = buildFixtureSeries({ homeResults: over15x2, awayResults: [] });
  check('2-game run is filtered out', rowFor(groups, 'over15') == null);

  // Older matching games must not leak into the current run.
  check('run breaks at the first miss', runLength(over15x2, (r) => r.gf + r.ga > 1.5) === 2);

  check('levelForRun(3) is yellow', levelForRun(3) === 'yellow');
  check('levelForRun(4) is yellow', levelForRun(4) === 'yellow');
  check('levelForRun(5) is green', levelForRun(5) === 'green');
  check('levelForRun(2) is red', levelForRun(2) === 'red');

  const loose = homeSeries(over15x2, 'over15', 2);
  check('minLength override lets a 2-run through', loose?.run === 2 && loose.active);
}

console.log('\nSeries stats — game markers');
{
  // Newest-first: 3 wins, then the draw that ended the previous run, then two older.
  const results = [
    result(2, 0, true, 'Alpha'),
    result(1, 0, false, 'Bravo'),
    result(3, 1, true, 'Delta'),
    result(1, 1, false, 'Echo'), // broke the win run
    result(4, 0, true, 'Foxtrot'),
    result(0, 2, false, 'Golf'),
    result(2, 2, true, 'Hotel'),
  ];
  const s = homeSeries(results, 'w');
  check('run of 3 wins', s?.run === 3, `got ${s?.run}`);

  const games = s?.games ?? [];
  check('run + break + 2 context games shown', games.length === 6, `got ${games.length}`);
  check(
    'chronological — newest is last',
    games[games.length - 1]?.opponentName === 'Alpha',
    `last=${games[games.length - 1]?.opponentName}`,
  );
  check('oldest shown is the older context game', games[0]?.opponentName === 'Golf');
  check(
    'exactly one break marker',
    games.filter((g) => g.state === 'broke').length === 1,
  );
  check(
    'the break is the draw vs Echo',
    games.find((g) => g.state === 'broke')?.opponentName === 'Echo',
  );
  check('three games flagged as in the run', games.filter((g) => g.state === 'run').length === 3);
  check(
    'the break sits immediately left of the run',
    games.findIndex((g) => g.state === 'broke') ===
      games.findIndex((g) => g.state === 'run') - 1,
  );
  check('scores read team-first', games[games.length - 1]?.score === '2-0');
  check('home/away is carried through', games[games.length - 1]?.isHome === true);
  check('older games are muted as "before"', games.filter((g) => g.state === 'before').length === 2);
  check('not flagged as run-from-start', s?.runFromStart === false);
}

console.log('\nSeries stats — unbroken from the first game');
{
  const allOver = [result(2, 1), result(3, 0), result(2, 2), result(1, 2)];
  const s = homeSeries(allOver, 'over15');
  check('run covers every game', s?.run === 4);
  check('runFromStart is set', s?.runFromStart === true);
  check('no break marker exists', (s?.games ?? []).every((g) => g.state === 'run'));
  check('sample matches input', s?.sample === 4);
}

console.log('\nSeries stats — "without" sub-series');
{
  const unbeaten = [result(2, 0), result(1, 1), result(3, 1), result(0, 0)];
  check('without_l counts 4 unbeaten', homeSeries(unbeaten, 'without_l')?.run === 4);
  check('l series is filtered out', rowFor(buildFixtureSeries({ homeResults: unbeaten, awayResults: [] }).groups, 'l') == null);

  // 3 games without scoring 2+, then a 3-goal game.
  const dryish = [result(1, 0), result(0, 1), result(1, 1), result(3, 0)];
  const dry = homeSeries(dryish, 'without_scoring_15');
  check('without_scoring_15 counts 3', dry?.run === 3, `got ${dry?.run}`);
  check(
    'the 3-0 win is the break marker',
    dry?.games.find((g) => g.state === 'broke')?.score === '3-0',
  );

  const winless = [result(0, 1), result(1, 1), result(0, 2)];
  check('without_w counts 3 winless', homeSeries(winless, 'without_w')?.run === 3);
}

console.log('\nSeries stats — mutual exclusivity');
{
  const cases: TeamResult[][] = [
    [result(2, 0), result(1, 0), result(3, 1), result(2, 1)], // all wins
    [result(0, 1), result(1, 1), result(0, 2), result(1, 2)], // no wins
    [result(1, 1), result(2, 0), result(0, 3), result(1, 1)], // mixed
  ];
  const pairs: [string, string][] = [
    ['w', 'without_w'],
    ['d', 'without_d'],
    ['l', 'without_l'],
    ['scoring_15', 'without_scoring_15'],
    ['conceding_25', 'without_conceding_25'],
  ];
  let clash = false;
  for (const results of cases) {
    const { groups } = buildFixtureSeries({ homeResults: results, awayResults: [], minLength: 1 });
    for (const [main, without] of pairs) {
      if ((rowFor(groups, main)?.home.run ?? 0) >= 1 && (rowFor(groups, without)?.home.run ?? 0) >= 1) {
        clash = true;
      }
    }
  }
  check('a series and its "without" are never both active', !clash);
}

console.log('\nSeries stats — scope & shaping');
{
  const mixed = [
    result(2, 0, true),
    result(0, 1, false),
    result(3, 1, true),
    result(1, 0, true),
    result(0, 2, false),
  ];
  const home = buildFixtureSeries({ homeResults: mixed, awayResults: [], scope: 'home' });
  check('home scope samples home games only', home.homeSample === 3, `n=${home.homeSample}`);
  check('home scope wins run is 3', rowFor(home.groups, 'w')?.home.run === 3);

  const away = buildFixtureSeries({ homeResults: mixed, awayResults: [], scope: 'away' });
  check('away scope samples away games only', away.homeSample === 2 && away.awaySample === 0);
  check('away scope 2-game losing run is below threshold', rowFor(away.groups, 'l') == null);

  const wins = [result(2, 0), result(1, 0), result(3, 1)];
  const oneSided = buildFixtureSeries({ homeResults: wins, awayResults: [result(0, 1)] });
  const wRow = rowFor(oneSided.groups, 'w');
  check('the side with the run is active', wRow?.home.active === true);
  check('the other side is inactive but still reported', wRow?.away.active === false && wRow.away.run === 0);
  check('groups keep spec order', oneSided.groups[0].id === 'outcome');
  check('rows carry their group id', wRow?.group === 'outcome');
}

console.log('\nSeries stats — the viewed fixture is excluded');
{
  // A finished match sits inside its own season window, so `/fixtures/between`
  // returns it. Newest first: the match being viewed, then 2 wins, then a loss.
  const viewed = result(2, 0, true, 'Viewed');
  const feed = [viewed, result(1, 0), result(3, 1), result(0, 2)];

  const leaked = homeSeries(feed, 'w');
  check('without the fix the run counts the viewed match', leaked?.run === 3, `got ${leaked?.run}`);

  const clean = excludeFixture(feed, viewed.fixtureId);
  check('the viewed fixture is dropped from the feed', clean.length === feed.length - 1);
  check(
    'no remaining result carries the viewed fixture id',
    clean.every((r) => r.fixtureId !== viewed.fixtureId),
  );

  // 3 wins collapses to 2, which is below MIN_SERIES — the row disappears.
  const after = buildFixtureSeries({ homeResults: clean, awayResults: [] });
  check('the leaked series is gone once excluded', rowFor(after.groups, 'w') == null);
  check('the true run going in is 2', runLength(clean, (r) => r.gf > r.ga) === 2);

  // Order and content are otherwise untouched.
  check('the newest remaining game is the one before the viewed match', clean[0]?.gf === 1);
  check('a null id is a no-op', excludeFixture(feed, null).length === feed.length);
  check('an unknown id is a no-op', excludeFixture(feed, 999_999).length === feed.length);
}

console.log('\nSeries stats — empty input');
{
  const empty = buildFixtureSeries({ homeResults: [], awayResults: [] });
  check('no groups from no results', empty.groups.length === 0);
  check('samples are zero', empty.homeSample === 0 && empty.awaySample === 0);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
