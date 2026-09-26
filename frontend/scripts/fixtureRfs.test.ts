/**
 * Unit tests for the RFS streams (spec §4.8, Tables 3 & 4).
 */
import {
  buildFixtureRfs,
  levelForRate,
  MIN_RFS_SAMPLE,
  RFS_ORDINARY_DEFS,
  USUAL_MIN_RATE,
  type RfsOrdinaryRow,
  type RfsSeriesRow,
} from '../utils/fixtureRfs';
import { MIN_SERIES } from '../utils/fixtureSeries';
import type { TeamResult } from '../utils/teamResults';

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

function ordinaryFor(results: TeamResult[], key: string, minRate?: number): RfsOrdinaryRow | undefined {
  const { ordinary } = buildFixtureRfs({ homeResults: results, awayResults: [], minRate });
  return ordinary.find((r) => r.key === key);
}

function seriesFor(results: TeamResult[], key: string, minLength?: number): RfsSeriesRow | undefined {
  const { series } = buildFixtureRfs({ homeResults: results, awayResults: [], minLength });
  return series.find((r) => r.key === key);
}

/** n games the team won 2-0, used as filler behind the newest result. */
function wins(n: number): TeamResult[] {
  return Array.from({ length: n }, () => result(2, 0));
}

console.log('\nRFS — catalogue');
{
  check('25 ordinary stats carry an RFS', RFS_ORDINARY_DEFS.length === 25, `got ${RFS_ORDINARY_DEFS.length}`);
  check('keys are unique', new Set(RFS_ORDINARY_DEFS.map((d) => d.key)).size === 25);
  check('every stat has usual + failed wording', RFS_ORDINARY_DEFS.every((d) => d.usual && d.failed && d.label));
  check('no timing-dependent stats', RFS_ORDINARY_DEFS.every((d) => !/scored_first|handicap|goals_/.test(d.key)));
  check('usual floor is the green band', USUAL_MIN_RATE === 65);
  check('levelForRate mirrors statSignal', levelForRate(65) === 'green' && levelForRate(45) === 'yellow' && levelForRate(44) === 'red');
}

console.log('\nRFS Table 3 — failed to do the usual');
{
  // Blanked in the newest game after scoring in the previous nine.
  const results = [result(0, 2, false, 'Newcastle'), ...wins(9)];
  const row = ordinaryFor(results, 'sc_pct');
  check('a 90% scorer that blanked is flagged', row != null);
  check('season rate counts every scoped game', row?.rate === 90 && row.hits === 9 && row.sample === 10, `rate=${row?.rate}`);
  check('the usual is graded green', row?.level === 'green');
  check('the last game is reported', row?.last.score === '0-2' && row.last.opponentName === 'Newcastle');
  check('the last game is drawn as the failure', row?.last.state === 'failed');
  check('away venue is carried through', row?.last.isHome === false);
  check('wording composes the call-out', `Usually ${row?.usual} (${row?.rate}%) — ${row?.failed}` === 'Usually scores (90%) — drew a blank');

  const games = row?.games ?? [];
  check('recent games are capped at six', games.length === 6, `got ${games.length}`);
  check('chronological — the failure is last', games[games.length - 1]?.state === 'failed');
  check('earlier games that held are green', games.slice(0, -1).every((g) => g.state === 'hit'));

  // The last game conceded, which is what Conc% expects — no failure there.
  check('a stat the last game delivered is not flagged', ordinaryFor(results, 'conc_pct') == null);
}

console.log('\nRFS Table 3 — gating');
{
  // Newest game did the usual, so there is nothing recent to fail.
  check('no signal when the last game delivered', ordinaryFor([...wins(1), ...wins(9)], 'sc_pct') == null);

  // 6 of 10 scored (60%) is below the green band — not a usual.
  const soso = [result(0, 1), ...wins(6), result(0, 0), result(0, 1), result(0, 2)];
  check('60% is not usual enough', ordinaryFor(soso, 'sc_pct') == null);
  check('lowering the floor lets it through', ordinaryFor(soso, 'sc_pct', 50)?.rate === 60);

  const thin = [result(0, 1), ...wins(3)];
  check(`fewer than ${MIN_RFS_SAMPLE} games gives no rows`, buildFixtureRfs({ homeResults: thin, awayResults: [] }).ordinary.length === 0);
}

console.log('\nRFS Table 3 — aliases and ordering');
{
  const results = [result(0, 2), ...wins(9)];
  const { ordinary } = buildFixtureRfs({ homeResults: results, awayResults: [] });
  const sc = ordinary.find((r) => r.key === 'sc_pct');
  check('SC% absorbs the identical Scoring 0.5+ stat', sc?.alsoLabels.includes('Scoring 0.5 or more') === true, JSON.stringify(sc?.alsoLabels));
  check('the alias is not a row of its own', ordinary.every((r) => r.key !== 'scoring_05'));
  check(
    'strongest usual first',
    ordinary.every((r, i) => i === 0 || ordinary[i - 1].rate >= r.rate),
    ordinary.map((r) => `${r.key}:${r.rate}`).join(' '),
  );
}

console.log('\nRFS Table 3 — both sides and scope');
{
  const home = [result(0, 2, false), ...wins(9)];
  const away = [result(1, 1), result(2, 0, false), result(3, 1, false), result(1, 0, false), result(2, 1, false), result(4, 0, false)];
  const { ordinary, homeSample, awaySample } = buildFixtureRfs({ homeResults: home, awayResults: away });
  check('rows are tagged with their side', ordinary.some((r) => r.side === 'home') && ordinary.some((r) => r.side === 'away'));
  check('samples are reported per side', homeSample === 10 && awaySample === 6);

  // Away-scope drops the home games, so the away split has too few games.
  const awayScoped = buildFixtureRfs({ homeResults: home, awayResults: away, scope: 'away' });
  check('away scope samples away games only', awayScoped.homeSample === 1 && awayScoped.awaySample === 5);
  check('away scope drops the thin home side', awayScoped.ordinary.every((r) => r.side === 'away'));
}

console.log('\nRFS Table 4 — failed to continue the usual');
{
  // Newest-first: the draw that ended a 4-game winning run.
  const results = [
    result(1, 1, false, 'Everton'),
    result(2, 0, true, 'Alpha'),
    result(1, 0, false, 'Bravo'),
    result(3, 1, true, 'Delta'),
    result(2, 1, true, 'Echo'),
    result(0, 1, false, 'Foxtrot'),
  ];
  const row = seriesFor(results, 'w');
  check('a broken 4-game W run is flagged', row != null);
  check('the run length excludes the last game', row?.run === 4, `got ${row?.run}`);
  check('run length grades like a series', row?.level === 'yellow');
  check('the breaking result is reported', row?.last.score === '1-1' && row.last.opponentName === 'Everton');
  check('not flagged as run-from-start', row?.runFromStart === false);
  check('it is not a "without" run', row?.without === false);

  const games = row?.games ?? [];
  check('run games plus the breaker are shown', games.length === 5, `got ${games.length}`);
  check('oldest run game first', games[0]?.opponentName === 'Echo');
  check('the breaker is last', games[games.length - 1]?.opponentName === 'Everton');
  check('exactly one failure marker', games.filter((g) => g.state === 'failed').length === 1);
  check('the run games are all green', games.slice(0, -1).every((g) => g.state === 'hit'));
}

console.log('\nRFS Table 4 — gating');
{
  // Run is still alive — the newest game continued it.
  const alive = [result(2, 0), result(1, 0), result(3, 1), result(2, 1)];
  check('a live run is not an RFS', seriesFor(alive, 'w') == null);

  // Only two wins sat behind the draw.
  const short = [result(1, 1), result(2, 0), result(1, 0), result(0, 1), result(0, 2)];
  check(`a ${MIN_SERIES - 1}-game run is below the threshold`, seriesFor(short, 'w') == null);
  check('lowering minLength lets it through', seriesFor(short, 'w', 2)?.run === 2);

  const tooShort = [result(1, 1), result(2, 0), result(1, 0)];
  check('no room for a run means no rows', buildFixtureRfs({ homeResults: tooShort, awayResults: [] }).series.length === 0);
}

console.log('\nRFS Table 4 — "without" runs');
{
  // Three winless games, then the win that ended the drought.
  const results = [
    result(2, 0, true, 'Alpha'),
    result(0, 1, false, 'Bravo'),
    result(1, 1, true, 'Delta'),
    result(0, 2, false, 'Echo'),
  ];
  const row = seriesFor(results, 'without_w');
  check('a broken winless run is flagged', row != null);
  check('the drought length is reported', row?.run === 3, `got ${row?.run}`);
  check('flagged as a "without" run', row?.without === true);
  check('the drought covered every earlier game', row?.runFromStart === true);
  check('the win is the breaker', row?.last.score === '2-0' && row.last.state === 'failed');
  check('the W series itself is not flagged', seriesFor(results, 'w') == null);
}

console.log('\nRFS Table 4 — both sides, scope and ordering');
{
  const home = [result(1, 1), result(2, 0), result(1, 0), result(3, 1), result(2, 1), result(4, 0)];
  const away = [result(3, 2, false), result(0, 0, false), result(1, 1, false), result(0, 1, false), result(1, 0, false)];
  const { series } = buildFixtureRfs({ homeResults: home, awayResults: away });
  check('both sides can report a break', series.some((r) => r.side === 'home') && series.some((r) => r.side === 'away'));
  check(
    'longest broken run first',
    series.every((r, i) => i === 0 || series[i - 1].run >= r.run),
    series.map((r) => `${r.key}:${r.run}`).join(' '),
  );
  check('rows carry their series group', series.every((r) => typeof r.group === 'string'));

  const scoped = buildFixtureRfs({ homeResults: home, awayResults: away, scope: 'home' });
  check('home scope keeps home games only', scoped.homeSample === 6 && scoped.awaySample === 0);
  check('home scope reports the home side only', scoped.series.every((r) => r.side === 'home'));
}

console.log('\nRFS — empty input');
{
  const empty = buildFixtureRfs({ homeResults: [], awayResults: [] });
  check('no rows from no results', empty.ordinary.length === 0 && empty.series.length === 0);
  check('samples are zero', empty.homeSample === 0 && empty.awaySample === 0);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
