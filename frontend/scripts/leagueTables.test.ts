/**
 * Unit tests for the real league-table maths — utils/leagueTables, the colour
 * band tables in utils/standingsAnalytics, and the one traffic-light rule in
 * utils/compliance.
 *
 * Run: npx tsx scripts/leagueTables.test.ts
 *
 * The bug these guard: the band tables used to be simulated with a seeded RNG,
 * so a team could show more games (or points) against a band than it had
 * actually played, and the arithmetic in a row did not add up.
 *
 * No jest — a tiny inline assert harness, so it runs anywhere tsx does.
 */
import {
  complianceFromPercent,
  complianceFromPpg,
  COMPLIANCE_THRESHOLDS,
  PPG_THRESHOLDS,
} from '../utils/compliance';
import {
  aggregate,
  bandOf,
  bandRange,
  buildMatchFeed,
  type FeedStanding,
  type SeasonResult,
} from '../utils/leagueTables';
import { buildInsights, buildStandingsView } from '../utils/standingsAnalytics';
import { PPG_STATS_PREVIEW } from '../mock/analyticsData';
import { getFixturesForLeague } from '../mock/fixturesData';
import { buildFixtureStats } from '../mock/statsEngine';
import type { StandingRow } from '../mock/matchData';

let failures = 0;
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
function eq<T>(name: string, actual: T, expected: T): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  check(name, a === e, `expected ${e}, got ${a}`);
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Six teams, ranked 1..6 → 2 green, 2 yellow, 2 red. */
const standing = (teamId: number, rank: number): FeedStanding => ({
  teamId,
  name: `T${teamId}`,
  rank,
});
const SIX: FeedStanding[] = [1, 2, 3, 4, 5, 6].map((i) => standing(i, i));

let clock = 1_000;
/** A finished result. `ht` omitted → the provider carried no half-time score. */
const res = (
  homeId: number,
  awayId: number,
  homeGoals: number,
  awayGoals: number,
  ht?: [number, number],
  extra: Partial<SeasonResult> = {},
): SeasonResult => ({
  competitionId: 100,
  seasonId: 7,
  homeId,
  awayId,
  homeGoals,
  awayGoals,
  homeGoalsHt: ht ? ht[0] : null,
  awayGoalsHt: ht ? ht[1] : null,
  unix: (clock += 10),
  ...extra,
});

const feedOf = (results: SeasonResult[], standings = SIX) =>
  buildMatchFeed({ competitionId: 100, seasonId: 7, standings, results });

// ---------------------------------------------------------------------------
console.log('Test A — the band rule is thirds, top third green, bottom third red');
// ---------------------------------------------------------------------------
{
  // 20 teams → 7 green, 6 yellow, 7 red (the middle band takes the shortfall).
  const bands20 = Array.from({ length: 20 }, (_, i) => bandOf(i + 1, 20));
  eq('20 teams: 7 green', bands20.filter((b) => b === 'green').length, 7);
  eq('20 teams: 6 yellow', bands20.filter((b) => b === 'yellow').length, 6);
  eq('20 teams: 7 red', bands20.filter((b) => b === 'red').length, 7);
  eq('pos 7 is the last green', bandOf(7, 20), 'green');
  eq('pos 8 is the first yellow', bandOf(8, 20), 'yellow');
  eq('pos 13 is the last yellow', bandOf(13, 20), 'yellow');
  eq('pos 14 is the first red', bandOf(14, 20), 'red');

  eq('green covers pos 1–7', bandRange('green', 20), { from: 1, to: 7 });
  eq('yellow covers pos 8–13', bandRange('yellow', 20), { from: 8, to: 13 });
  eq('red covers pos 14–20', bandRange('red', 20), { from: 14, to: 20 });

  // Small and degenerate tables must not throw or produce an empty band set.
  eq('a one-team table is all green', bandOf(1, 1), 'green');
  eq('a two-team table has no yellow', [bandOf(1, 2), bandOf(2, 2)], ['green', 'red']);
  eq('every band is covered at 3 teams', [bandOf(1, 3), bandOf(2, 3), bandOf(3, 3)], [
    'green',
    'yellow',
    'red',
  ]);
}

// ---------------------------------------------------------------------------
console.log('Test B — scoping: other competitions, seasons and unknown teams drop out');
// ---------------------------------------------------------------------------
{
  const feed = feedOf([
    res(1, 2, 1, 0),
    res(1, 2, 9, 0, undefined, { competitionId: 999 }), // another competition
    res(1, 2, 9, 0, undefined, { seasonId: 8 }), // another season
    res(1, 99, 9, 0), // opponent absent from the table
  ]);
  eq('T1 counted one match', feed.byTeam.get(1)!.length, 1);
  eq('T2 counted one match', feed.byTeam.get(2)!.length, 1);
  check('the unknown opponent has no feed entry', !feed.byTeam.has(99));
  eq('every table team gets an entry', feed.byTeam.size, 6);
}

// ---------------------------------------------------------------------------
console.log('Test C — a record is a tally: W+D+L = P and Pts = 3W+D, always');
// ---------------------------------------------------------------------------
{
  const feed = feedOf([
    res(1, 3, 2, 0), // T1 beats T3
    res(4, 1, 1, 1), // T1 draws T4
    res(1, 5, 0, 2), // T1 loses to T5
    res(6, 1, 3, 3), // T1 draws T6
  ]);
  const rec = aggregate(feed.byTeam.get(1)!);
  eq('played = 4', rec.played, 4);
  eq('W/D/L = 1/2/1', [rec.won, rec.drawn, rec.lost], [1, 2, 1]);
  check('W+D+L = P', rec.won + rec.drawn + rec.lost === rec.played);
  eq('points = 3·1 + 2 = 5', rec.points, 5);
  check('Pts = 3W+D', rec.points === 3 * rec.won + rec.drawn);
  eq('GF/GA = 6/6', [rec.goalsFor, rec.goalsAgainst], [6, 6]);
  check('GD = GF − GA', rec.goalDiff === rec.goalsFor - rec.goalsAgainst);
  eq('PPG = 5/4', rec.ppg, 1.25);
  eq('form is newest first', rec.form, ['D', 'L', 'D', 'W']);
}

// ---------------------------------------------------------------------------
console.log('Test D — home / away splits count only those matches');
// ---------------------------------------------------------------------------
{
  const feed = feedOf([
    res(1, 3, 2, 0), // T1 at home, win
    res(1, 4, 0, 1), // T1 at home, loss
    res(5, 1, 0, 3), // T1 away, win
  ]);
  const all = aggregate(feed.byTeam.get(1)!);
  const home = aggregate(feed.byTeam.get(1)!, { split: 'home' });
  const away = aggregate(feed.byTeam.get(1)!, { split: 'away' });
  eq('overall played 3', all.played, 3);
  eq('home played 2, 3 pts', [home.played, home.points], [2, 3]);
  eq('away played 1, 3 pts', [away.played, away.points], [1, 3]);
  check('home + away = overall', home.played + away.played === all.played);
  check('home + away points = overall points', home.points + away.points === all.points);
}

// ---------------------------------------------------------------------------
console.log('Test E — periods: 1st half from ht_score, 2nd half = FT − HT');
// ---------------------------------------------------------------------------
{
  // T1 3-1 T3, 0-1 at the break → 1st half L, 2nd half 3-0 W.
  const feed = feedOf([res(1, 3, 3, 1, [0, 1])]);
  const ft = aggregate(feed.byTeam.get(1)!, { period: 'ft' });
  const h1 = aggregate(feed.byTeam.get(1)!, { period: '1h' });
  const h2 = aggregate(feed.byTeam.get(1)!, { period: '2h' });

  eq('full-time: 3-1 win', [ft.goalsFor, ft.goalsAgainst, ft.points], [3, 1, 3]);
  eq('1st half: 0-1 loss', [h1.goalsFor, h1.goalsAgainst, h1.points], [0, 1, 0]);
  eq('2nd half: 3-0 win', [h2.goalsFor, h2.goalsAgainst, h2.points], [3, 0, 3]);
  check('halves sum to full-time', h1.goalsFor + h2.goalsFor === ft.goalsFor);
  check('halves concede full-time', h1.goalsAgainst + h2.goalsAgainst === ft.goalsAgainst);
}

// ---------------------------------------------------------------------------
console.log('Test F — a match with no half-time score is excluded, never estimated');
// ---------------------------------------------------------------------------
{
  const feed = feedOf([
    res(1, 3, 2, 0, [1, 0]), // recorded
    res(1, 4, 5, 0), // no ht_score
  ]);
  eq('coverage: 1 of 2 matches carry a half-time score', feed.halfTimeCoverage, {
    withHt: 1,
    total: 2,
  });

  const ft = aggregate(feed.byTeam.get(1)!, { period: 'ft' });
  const h1 = aggregate(feed.byTeam.get(1)!, { period: '1h' });
  eq('full-time counts both', ft.played, 2);
  eq('1st half counts only the recorded one', h1.played, 1);
  eq('the excluded match is reported as eligible', h1.eligible, 2);
  eq('no phantom goals from the missing half', [h1.goalsFor, h1.goalsAgainst], [1, 0]);
}

// ---------------------------------------------------------------------------
console.log('Test G — recency windows take the newest matches');
// ---------------------------------------------------------------------------
{
  const feed = feedOf([
    res(1, 3, 0, 1), // oldest — loss
    res(1, 4, 0, 1), // loss
    res(1, 5, 1, 0), // win
    res(1, 6, 1, 0), // newest — win
  ]);
  const last2 = aggregate(feed.byTeam.get(1)!, { window: 2 });
  eq('last 2 played', last2.played, 2);
  eq('last 2 are the two wins', last2.points, 6);
  eq('a window wider than the feed is harmless', aggregate(feed.byTeam.get(1)!, { window: 99 }).played, 4);
}

// ---------------------------------------------------------------------------
console.log('Test H — vs-band records count only that band, and cannot exceed reality');
// ---------------------------------------------------------------------------
{
  // Green = T1,T2 · Yellow = T3,T4 · Red = T5,T6.
  const feed = feedOf([
    res(3, 1, 0, 1), // yellow T3 loses to green T1
    res(2, 3, 2, 2), // yellow T3 draws green T2
    res(3, 4, 3, 0), // yellow T3 beats yellow T4
    res(3, 5, 1, 1), // yellow T3 draws red T5
  ]);
  const t3 = feed.byTeam.get(3)!;

  const vsGreen = aggregate(t3, { vsBand: 'green' });
  eq('T3 vs green: 2 games, 1 pt', [vsGreen.played, vsGreen.points], [2, 1]);
  const vsYellow = aggregate(t3, { vsBand: 'yellow' });
  eq('T3 vs yellow: 1 game, 3 pts', [vsYellow.played, vsYellow.points], [1, 3]);
  const vsRed = aggregate(t3, { vsBand: 'red' });
  eq('T3 vs red: 1 game, 1 pt', [vsRed.played, vsRed.points], [1, 1]);

  const all = aggregate(t3);
  check(
    'the three bands partition the season',
    vsGreen.played + vsYellow.played + vsRed.played === all.played,
    `${vsGreen.played}+${vsYellow.played}+${vsRed.played} vs ${all.played}`,
  );
  check(
    'band points sum to season points',
    vsGreen.points + vsYellow.points + vsRed.points === all.points,
  );
  check('no band exceeds matches played', vsGreen.played <= all.played);

  // A team with nothing against the band is empty, not invented.
  const t6 = aggregate(feed.byTeam.get(6)!, { vsBand: 'green' });
  eq('T6 has played no green team: 0 games, 0 pts', [t6.played, t6.points], [0, 0]);
}

// ---------------------------------------------------------------------------
console.log('Test I — the band table on screen: every row real, ranked by PPG');
// ---------------------------------------------------------------------------
{
  const base: StandingRow[] = SIX.map((s) => ({
    pos: s.rank,
    team: s.name,
    played: 2,
    won: 1,
    drawn: 0,
    lost: 1,
    gf: 2,
    ga: 2,
    gd: 0,
    points: 3,
    form: [],
  }));
  const feed = feedOf([
    res(1, 2, 1, 0), // green head-to-head: T1 beats T2
    res(3, 1, 1, 2), // T3 (yellow) loses to green T1
    res(2, 4, 0, 0), // T4 (yellow) draws green T2
    res(5, 1, 1, 3), // T5 (red) loses to green T1
  ]);

  const v = buildStandingsView(base, { kind: 'ppg', split: 'overall', period: 'ft', band: 'green' }, { feed });

  eq('every team gets a row', v.rows.length, 6);
  eq('band members are named', [...(v.bandMembers ?? [])].sort(), ['T1', 'T2']);

  const byTeam = new Map(v.rows.map((r) => [r.team, r]));
  eq('T1 is measured head-to-head vs T2 only: 1 game, 3 pts', [
    byTeam.get('T1')!.played,
    byTeam.get('T1')!.points,
  ], [1, 3]);
  eq('T4 drew its one green game: 1 pt', [byTeam.get('T4')!.played, byTeam.get('T4')!.points], [1, 1]);
  eq('T6 has no green games yet', byTeam.get('T6')!.played, 0);

  check(
    'every row adds up',
    v.rows.every(
      (r) => r.won + r.drawn + r.lost === r.played && r.points === 3 * r.won + r.drawn,
    ),
  );
  check(
    'no row claims more games than the whole season',
    v.rows.every((r) => r.played <= 2),
  );

  eq('T1 leads on 3.00 PPG', v.rows[0].team, 'T1');
  eq('PPG column shows the sum', v.metric!.values.get('T1'), {
    display: '3.00',
    sub: '3 pts / 1 game',
  });
  eq('a team with nothing in scope shows a dash', v.metric!.values.get('T6'), {
    display: '—',
    sub: 'no games in scope',
  });
  check('teams with no games in scope sort last', v.rows[v.rows.length - 1].played === 0);

  check('the caption names the band and its positions', v.caption.includes('pos 1–2'), v.caption);
  check('the note spells out the PPG sum', v.note!.includes('points ÷ games'), v.note);
}

// ---------------------------------------------------------------------------
console.log('Test J — without results, tables say so instead of inventing numbers');
// ---------------------------------------------------------------------------
{
  const base: StandingRow[] = SIX.map((s) => ({
    pos: s.rank, team: s.name, played: 5, won: 2, drawn: 1, lost: 2,
    gf: 7, ga: 7, gd: 0, points: 7, form: [],
  }));

  for (const sel of [
    { kind: 'ppg', split: 'overall', period: 'ft', band: 'plain' },
    { kind: 'ppg', split: 'home', period: '1h', band: 'red' },
    { kind: 'last6ppg', split: 'away', period: 'ft' },
    { kind: 'form', window: 10, split: 'overall', period: 'ft' },
    { kind: 'prob', metric: 'bttsY', period: 'ft' },
  ] as const) {
    const v = buildStandingsView(base, sel);
    check(`${sel.kind} reports needsResults`, v.needsResults === true, JSON.stringify(sel));
    eq(`${sel.kind} shows no rows`, v.rows.length, 0);
  }

  eq('the plain standings still render without results',
    buildStandingsView(base, { kind: 'standard' }).rows.length, 6);
  eq('insights are empty rather than invented', buildInsights(base, { market: 'btts', scope: 'overall' }).length, 0);
}

// ---------------------------------------------------------------------------
console.log('Test K — probability metrics are counted from the same results');
// ---------------------------------------------------------------------------
{
  const base: StandingRow[] = SIX.map((s) => ({
    pos: s.rank, team: s.name, played: 2, won: 0, drawn: 0, lost: 0,
    gf: 0, ga: 0, gd: 0, points: 0, form: [],
  }));
  const feed = feedOf([
    res(1, 2, 1, 1), // both scored
    res(1, 3, 2, 0), // T1 clean sheet
  ]);
  const v = buildStandingsView(base, { kind: 'prob', metric: 'bttsY', period: 'ft' }, { feed });
  eq('T1 BTTS: 1 of 2', v.metric!.values.get('T1'), { display: '50%', sub: '1 of 2' });
  eq('a team with no matches is unranked, not 0%', v.metric!.values.get('T6'), {
    display: '—',
    sub: 'no games in scope',
  });
  check('unplayed teams sort last', v.rows[v.rows.length - 1].played === 0 || v.metric!.values.get(v.rows[v.rows.length - 1].team)!.display === '—');

  const insights = buildInsights(base, { market: 'btts', scope: 'overall' }, feed);
  eq('insights agree with the table', insights.find((r) => r.team === 'T1'), {
    team: 'T1',
    value: 50,
    played: 2,
  });

  // Goal order is not in a final score, and the provider does not measure it.
  const first = buildStandingsView(base, { kind: 'prob', metric: 'scoredFirst', period: 'ft' }, { feed });
  check('"scored first" is reported unavailable, not guessed',
    first.timingSource === 'unavailable' &&
      first.rows.every((r) => first.metric!.values.get(r.team)!.display === '—'),
    String(first.timingSource));
}

// ---------------------------------------------------------------------------
console.log('Test L — one traffic-light rule, at its exact cut-offs');
// ---------------------------------------------------------------------------
{
  eq('thresholds are 65 / 45', COMPLIANCE_THRESHOLDS, { green: 65, yellow: 45 });
  eq('100% is green', complianceFromPercent(100), 'green');
  eq('65% is green', complianceFromPercent(65), 'green');
  eq('64% is yellow', complianceFromPercent(64), 'yellow');
  eq('45% is yellow', complianceFromPercent(45), 'yellow');
  eq('44% is red', complianceFromPercent(44), 'red');
  eq('0% is red', complianceFromPercent(0), 'red');
}

// ---------------------------------------------------------------------------
console.log('Test M — PPG has its own 0–3 scale, not the percentage one');
// ---------------------------------------------------------------------------
{
  eq('PPG thresholds are 1.80 / 1.20', PPG_THRESHOLDS, { green: 1.8, yellow: 1.2 });
  eq('3.00 PPG is green', complianceFromPpg(3), 'green');
  eq('1.80 PPG is green', complianceFromPpg(1.8), 'green');
  eq('1.79 PPG is yellow', complianceFromPpg(1.79), 'yellow');
  eq('1.20 PPG is yellow', complianceFromPpg(1.2), 'yellow');
  eq('1.19 PPG is red', complianceFromPpg(1.19), 'red');
  eq('0.00 PPG is red', complianceFromPpg(0), 'red');
  // The percentage rule would call every possible PPG red — that mix-up is
  // exactly why the two scales are separate functions.
  eq('the percentage rule is not usable here', complianceFromPercent(3), 'red');
}

// ---------------------------------------------------------------------------
console.log('Test N — a vs-band PPG row is an average of thirds, never a split of one');
// ---------------------------------------------------------------------------
{
  // The old sample data split a single PPG figure across the three bands, so
  // the columns summed to PPG and a good side read ~0.2 PPG vs the bottom
  // third. Each band is its own average, so PPG is their mean.
  for (const row of PPG_STATS_PREVIEW) {
    const mean = (row.green + row.yellow + row.red) / 3;
    check(
      `${row.scope}: PPG is the mean of the three bands`,
      Math.abs(mean - row.ppg) < 0.005,
      `mean ${mean.toFixed(2)} vs ppg ${row.ppg.toFixed(2)}`,
    );
    check(
      `${row.scope}: every band sits on the 0–3 scale`,
      [row.green, row.yellow, row.red].every((v) => v >= 0 && v <= 3),
    );
    check(
      `${row.scope}: points come easier against the bottom third`,
      row.red >= row.yellow && row.yellow >= row.green,
      `green ${row.green}, yellow ${row.yellow}, red ${row.red}`,
    );
  }

  // Same invariants on the generated per-fixture rows behind the PPG table,
  // across every fixture and table context the screen can show.
  let scopes = 0;
  let closes = 0;
  let onScale = 0;
  for (const fixture of getFixturesForLeague('spl')) {
    for (const ctx of ['ft-overall', 'ft-home', 'last6-ft-away']) {
      for (const row of buildFixtureStats(fixture, ctx).ppg) {
        scopes++;
        const mean = (row.greenPpg + row.yellowPpg + row.redPpg) / 3;
        if (Math.abs(mean - row.ppg) < 0.005) closes++;
        if ([row.ppg, row.greenPpg, row.yellowPpg, row.redPpg].every((v) => v >= 0 && v <= 3)) {
          onScale++;
        }
      }
    }
  }
  check('the generated PPG table covers every scope', scopes > 0 && scopes % 9 === 0, `${scopes}`);
  eq('every generated row is the mean of its bands', closes, scopes);
  eq('no generated figure leaves the 0–3 scale', onScale, scopes);
}

// ---------------------------------------------------------------------------
if (failures > 0) {
  console.error(`\n${failures} check(s) FAILED`);
  process.exit(1);
} else {
  console.log('\nAll checks passed ✅');
  process.exit(0);
}
