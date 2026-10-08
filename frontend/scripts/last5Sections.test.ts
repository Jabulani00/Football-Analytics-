/**
 * Last-5 Sections 3–4 helpers.
 * Run: npx tsx scripts/last5Sections.test.ts
 */
import {
  colourPairId,
  last5PointsDiff,
  matchesGoalDiffTab,
  matchesOutcomeTab,
  twoGoalBandSides,
  twoGoalGrade,
} from '../utils/last5Sections';
import { bandFromTablePoints, buildInitialState, trueOption, OPTION_LABEL } from '../utils/last5Analysis';
import { resultsFromSeasonMatches } from '../utils/last6Form';
import type { SeasonMatch } from '../utils/bhozomaEngine';
import type { StandingLike } from '../utils/motivationEngine';

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

console.log('\nnaming bands');
{
  check('9 pts is Good', bandFromTablePoints(9) === 'good');
  check('8 pts is Medium', bandFromTablePoints(8) === 'medium');
  check('5 pts is Medium', bandFromTablePoints(5) === 'medium');
  check('4 pts is Bad', bandFromTablePoints(4) === 'bad');
  check('Inhlambuluko naming', OPTION_LABEL[trueOption('good', true)] === 'Good + Inhlambuluko');
}

console.log('\n1-goal colour labels');
{
  check('1GD G vs G win is good', twoGoalGrade('green', 'green', 'W', 1, 1) === 'good');
  check('1GD G vs Y win is mediocre', twoGoalGrade('green', 'yellow', 'W', 1, 1) === 'mediocre');
  check('1GD G vs R win is bad', twoGoalGrade('green', 'red', 'W', 1, 1) === 'bad');
  check('1GD Y vs G win is good', twoGoalGrade('yellow', 'green', 'W', 1, 1) === 'good');
  check('1GD R vs G win is great', twoGoalGrade('red', 'green', 'W', 1, 1) === 'great');
  check('1GD G vs G loss is bad', twoGoalGrade('green', 'green', 'L', -1, 1) === 'bad');
  check('1GD Y vs G loss is mediocre', twoGoalGrade('yellow', 'green', 'L', -1, 1) === 'mediocre');
  check(
    '1GD R vs G loss is well fought battle',
    twoGoalGrade('red', 'green', 'L', -1, 1) === 'mediocre_positive',
  );
  check(
    '1GD R vs Y loss is well fought battle',
    twoGoalGrade('red', 'yellow', 'L', -1, 1) === 'mediocre_positive',
  );
  check('All tab still labels a 1-goal win', twoGoalGrade('yellow', 'yellow', 'W', 1, 'all') === 'good');
}

console.log('\n2-goal colour labels');
{
  check('G vs G win is good', twoGoalGrade('green', 'green', 'W', 2) === 'good');
  check('Y vs G win is great', twoGoalGrade('yellow', 'green', 'W', 2) === 'great');
  check('G vs R win is mediocre', twoGoalGrade('green', 'red', 'W', 2) === 'mediocre');
  check('R vs G win is great', twoGoalGrade('red', 'green', 'W', 2) === 'great');
  check('G vs G loss is bad', twoGoalGrade('green', 'green', 'L', -2) === 'bad');
  check('Y vs G loss is mediocre', twoGoalGrade('yellow', 'green', 'L', -2) === 'mediocre');
  check('R vs Y loss is mediocre', twoGoalGrade('red', 'yellow', 'L', -2) === 'mediocre');
  check('3-goal win is not labelled on the 2-goal sheet', twoGoalGrade('green', 'red', 'W', 3) == null);
  check('3-goal tab does not use the 2-goal sheet yet', twoGoalGrade('green', 'red', 'W', 3, 3) == null);
  check('pair Y vs R is 6', colourPairId('yellow', 'red') === 6);
  check('6+ matches 7 goal games', matchesGoalDiffTab(7, 6) === true);
  check('6+ does not match 5', matchesGoalDiffTab(5, 6) === false);
  check('exact 1 matches', matchesGoalDiffTab(-1, 1) === true);
  check('all matches every margin', matchesGoalDiffTab(0, 'all') && matchesGoalDiffTab(9, 'all'));
}

console.log('\noverall W/D/L colour labels');
{
  const ov = { mode: 'overall' as const };
  check('overall W G vs G is good', twoGoalGrade('green', 'green', 'W', 1, 'all', ov) === 'good');
  check('overall W G vs Y is mediocre', twoGoalGrade('green', 'yellow', 'W', 2, 'all', ov) === 'mediocre');
  check('overall W Y vs G is great', twoGoalGrade('yellow', 'green', 'W', 3, 'all', ov) === 'great');
  check('overall W R vs Y is great', twoGoalGrade('red', 'yellow', 'W', 1, 'all', ov) === 'great');
  check('overall D Y vs G is good', twoGoalGrade('yellow', 'green', 'D', 0, 'all', ov) === 'good');
  check('overall D R vs G is great', twoGoalGrade('red', 'green', 'D', 0, 'all', ov) === 'great');
  check(
    'overall D G vs G above is good',
    twoGoalGrade('green', 'green', 'D', 0, 'all', { ...ov, teamRank: 2, oppRank: 8 }) === 'good',
  );
  check(
    'overall D G vs G below is bad',
    twoGoalGrade('green', 'green', 'D', 0, 'all', { ...ov, teamRank: 8, oppRank: 2 }) === 'bad',
  );
  check('overall L Y vs G is mediocre', twoGoalGrade('yellow', 'green', 'L', -2, 'all', ov) === 'mediocre');
  check('overall L G vs G is bad', twoGoalGrade('green', 'green', 'L', -1, 'all', ov) === 'bad');
  check(
    'home/away draw still uses draw sheet',
    twoGoalGrade('yellow', 'yellow', 'D', 0, 'all', { mode: 't1_home' }) === 'mediocre',
  );
}

console.log('\nhome loss always bad');
{
  check(
    'home loss overrides 1GD well-fought label',
    twoGoalGrade('red', 'green', 'L', -1, 1, { isHome: true }) === 'bad',
  );
  check(
    'home loss overrides overall mediocre loss',
    twoGoalGrade('yellow', 'green', 'L', -2, 'all', { mode: 'overall', isHome: true }) === 'bad',
  );
  check(
    'away loss still uses sheet label',
    twoGoalGrade('red', 'green', 'L', -1, 1, { isHome: false }) === 'mediocre_positive',
  );
  check(
    'home loss is bad even without colours',
    twoGoalGrade(null, null, 'L', -1, 'all', { isHome: true }) === 'bad',
  );
}

console.log('\ngoal-diff tabs filter last 5');
{
  const standings: StandingLike[] = [
    { teamId: 1, name: 'Alpha', rank: 1, points: 20, played: 10, zone: 'top' },
    { teamId: 2, name: 'Beta', rank: 10, points: 10, played: 10, zone: 'mid' },
    { teamId: 3, name: 'Gamma', rank: 18, points: 5, played: 10, zone: 'bottom' },
  ];
  const matches: SeasonMatch[] = [
    { homeId: 1, awayId: 2, homeGoals: 2, awayGoals: 1, unix: 50 },
    { homeId: 1, awayId: 3, homeGoals: 3, awayGoals: 1, unix: 40 },
    { homeId: 1, awayId: 2, homeGoals: 4, awayGoals: 1, unix: 30 },
    { homeId: 1, awayId: 3, homeGoals: 1, awayGoals: 0, unix: 20 },
    { homeId: 1, awayId: 2, homeGoals: 2, awayGoals: 0, unix: 10 },
    // Away games for T1 — overall sample mixes these in.
    { homeId: 2, awayId: 1, homeGoals: 0, awayGoals: 1, unix: 45 },
    { homeId: 3, awayId: 1, homeGoals: 2, awayGoals: 2, unix: 5 },
  ];
  const t1Results = resultsFromSeasonMatches(1, matches, standings);
  const t2Results = resultsFromSeasonMatches(2, matches, standings);
  const base = {
    t1Id: 1,
    t2Id: 2,
    t1Label: 'T1',
    t2Label: 'T2',
    t1Results,
    t2Results,
    standings,
  };

  const two = twoGoalBandSides({ ...base, mode: 't1_home', goalDiff: 2 });
  check('2-goal tab keeps only 2-goal home wins', two.left?.games.length === 2);
  check('2-goal games are labelled', two.left?.games.every((g) => g.grade != null) === true);

  const one = twoGoalBandSides({ ...base, mode: 't1_home', goalDiff: 1 });
  check('1-goal tab keeps only 1-goal games', one.left?.games.length === 2);
  check('1-goal games are labelled from the 1-goal sheet', one.left?.games.every((g) => g.grade != null) === true);

  const overall = twoGoalBandSides({ ...base, mode: 'overall', goalDiff: 'all' });
  check('overall tab lists last-5 any venue', overall.left?.games.length === 5);
  check(
    'overall games use the W/D/L sheet',
    overall.left?.games.every((g) => g.grade != null) === true,
  );
  check('overall venue is overall', overall.left?.venue === 'overall');

  const wins = twoGoalBandSides({ ...base, mode: 'overall', goalDiff: 'all', outcome: 'W' });
  check('win tab keeps only wins', wins.left?.games.every((g) => g.outcome === 'W') === true);
  check('win tab has games', (wins.left?.games.length ?? 0) > 0);
  check('outcome all matches W', matchesOutcomeTab('W', 'all'));
  check('outcome W matches W', matchesOutcomeTab('W', 'W'));
  check('outcome W rejects D', matchesOutcomeTab('D', 'W') === false);

  // Section 1 Home/Away sample must match Section 4 T1-as-home when T1 is the home side.
  const initial = buildInitialState({
    homeId: 1,
    awayId: 2,
    homeResults: t1Results,
    awayResults: t2Results,
  });
  const t1Home = twoGoalBandSides({ ...base, mode: 't1_home', goalDiff: 'all' });
  const s1Scores = (initial.home?.matches ?? []).map((m) => `${m.result.gf}-${m.result.ga}`);
  const s4Scores = (t1Home.left?.games ?? []).map((g) => `${g.gf}-${g.ga}`);
  check('Section 4 T1-home matches Section 1 home last-5', s1Scores.join('|') === s4Scores.join('|'));
  const s1Away = (initial.away?.matches ?? []).map((m) => `${m.result.gf}-${m.result.ga}`);
  const s4Away = (t1Home.right?.games ?? []).map((g) => `${g.gf}-${g.ga}`);
  check('Section 4 T2-away matches Section 1 away last-5', s1Away.join('|') === s4Away.join('|'));

  // Force a home loss into T1's feed and confirm the Home column grades it Bad.
  const homeLossFeed = [
    {
      fixtureId: 9001,
      unix: 99,
      teamId: 1,
      opponentId: 2,
      opponentName: 'Beta',
      isHome: true,
      gf: 0,
      ga: 1,
      outcome: 'L' as const,
      opponentRank: 10,
      teamRank: 1,
      opponentAbove: false,
      goalDiff: -1,
    },
    ...t1Results,
  ];
  const homeLossSide = twoGoalBandSides({
    ...base,
    t1Results: homeLossFeed,
    mode: 't1_home',
    goalDiff: 'all',
    outcome: 'L',
  });
  check(
    'T1-home column marks home loss as Bad',
    homeLossSide.left?.games[0]?.grade === 'bad' && homeLossSide.left?.games[0]?.gradeLabel === 'Bad',
  );
}

console.log('\nT1 − T2 last 5');
{
  const standings: StandingLike[] = [
    { teamId: 1, name: 'Alpha', rank: 1, points: 20, played: 10, zone: 'top' },
    { teamId: 2, name: 'Beta', rank: 2, points: 10, played: 10, zone: 'mid' },
  ];
  const matches: SeasonMatch[] = [
    { homeId: 1, awayId: 2, homeGoals: 2, awayGoals: 0, unix: 50 },
    { homeId: 2, awayId: 1, homeGoals: 0, awayGoals: 1, unix: 40 },
    { homeId: 1, awayId: 2, homeGoals: 1, awayGoals: 1, unix: 30 },
    { homeId: 1, awayId: 2, homeGoals: 3, awayGoals: 0, unix: 20 },
    { homeId: 2, awayId: 1, homeGoals: 1, awayGoals: 0, unix: 10 },
  ];
  const read = last5PointsDiff({
    standings,
    matches,
    t1Id: 1,
    t2Id: 2,
    t1Label: 'T1 (Alpha)',
    t2Label: 'T2 (Beta)',
    venue: 'overall',
    period: 'ft',
  });
  check('T1 has more last-5 points', (read.t1Points ?? 0) > (read.t2Points ?? 0));
  check('diff is positive for T1', (read.diff ?? 0) > 0);
  check('call names T1 stronger', read.call.includes('T1 (Alpha) stronger'));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
