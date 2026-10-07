/**
 * Last-5 Sections 3–4 helpers.
 * Run: npx tsx scripts/last5Sections.test.ts
 */
import {
  colourPairId,
  last5PointsDiff,
  matchesGoalDiffTab,
  twoGoalBandSides,
  twoGoalGrade,
} from '../utils/last5Sections';
import { bandFromTablePoints, trueOption, OPTION_LABEL } from '../utils/last5Analysis';
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
  ];
  const two = twoGoalBandSides({
    t1Id: 1,
    t2Id: 2,
    t1Label: 'T1',
    t2Label: 'T2',
    matches,
    standings,
    mode: 't1_home',
    goalDiff: 2,
  });
  check('2-goal tab keeps only 2-goal home wins', two.left?.games.length === 2);
  check('2-goal games are labelled', two.left?.games.every((g) => g.grade != null) === true);

  const one = twoGoalBandSides({
    t1Id: 1,
    t2Id: 2,
    t1Label: 'T1',
    t2Label: 'T2',
    matches,
    standings,
    mode: 't1_home',
    goalDiff: 1,
  });
  check('1-goal tab keeps only 1-goal games', one.left?.games.length === 2);
  check('1-goal games are labelled from the 1-goal sheet', one.left?.games.every((g) => g.grade != null) === true);
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
