/**
 * Section 6 death-trap patterns.
 * Run: npx tsx scripts/deathTraps.test.ts
 */
import { deathTrapSide, deathTrapTrend } from '../utils/deathTraps';
import type { TeamResult } from '../utils/teamResults';

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean): void {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`);
  }
}

function game(over: Partial<TeamResult> & Pick<TeamResult, 'gf' | 'ga' | 'outcome' | 'unix'>): TeamResult {
  return {
    fixtureId: over.unix,
    teamId: 1,
    opponentId: 2,
    opponentName: 'Opp',
    isHome: over.isHome ?? true,
    opponentRank: null,
    teamRank: null,
    opponentAbove: null,
    goalDiff: over.gf - over.ga,
    ...over,
  };
}

console.log('\ntrend');
{
  check('shrinking is decline', deathTrapTrend([5, 3, 3, 1, 0]) === 'decline');
  check('growing is incline', deathTrapTrend([1, 2, 4]) === 'incline');
  check('mixed is up down', deathTrapTrend([2, 5, 1]) === 'up_down');
  check('two games is no pattern', deathTrapTrend([5, 1]) === 'none');
  check('flat is level', deathTrapTrend([2, 2, 2]) === 'level');
}

console.log('\nloss and win margins');
{
  const results = [
    game({ gf: 0, ga: 5, outcome: 'L', unix: 10 }),
    game({ gf: 0, ga: 3, outcome: 'L', unix: 20 }),
    game({ gf: 0, ga: 3, outcome: 'L', unix: 30 }),
    game({ gf: 0, ga: 1, outcome: 'L', unix: 40 }),
    game({ gf: 1, ga: 1, outcome: 'D', unix: 50 }),
  ];
  const read = deathTrapSide({
    teamId: 1,
    label: 'T1',
    results,
    venue: 'overall',
    period: 'ft',
  });
  check('shrinking losses are a decline', read.losses.trend === 'decline');
  check('shrinking losses mean getting stronger', read.losses.reading === 'Getting stronger');
  check('draws count as a zero margin', read.losses.sequence.join(',') === '5,3,3,1,0');
}

console.log('\nshrinking wins');
{
  const results = [
    game({ gf: 5, ga: 0, outcome: 'W', unix: 10 }),
    game({ gf: 3, ga: 0, outcome: 'W', unix: 20 }),
    game({ gf: 1, ga: 0, outcome: 'W', unix: 30 }),
  ];
  const read = deathTrapSide({
    teamId: 1,
    label: 'T1',
    results,
    venue: 'overall',
    period: 'ft',
  });
  check('shrinking wins are a decline', read.wins.trend === 'decline');
  check('shrinking wins mean getting weaker', read.wins.reading === 'Getting weaker');
}

console.log('\nscoring and conceding');
{
  const results = [
    game({ gf: 0, ga: 3, outcome: 'L', unix: 10 }),
    game({ gf: 1, ga: 2, outcome: 'L', unix: 20 }),
    game({ gf: 2, ga: 1, outcome: 'W', unix: 30 }),
    game({ gf: 2, ga: 0, outcome: 'W', unix: 40 }),
  ];
  const read = deathTrapSide({
    teamId: 1,
    label: 'T1',
    results,
    venue: 'overall',
    period: 'ft',
  });
  check('more goals scored is an incline', read.scoring.trend === 'incline');
  check('fewer goals conceded is a decline', read.conceding.trend === 'decline');
}

console.log('\nhome first half');
{
  const results = [
    game({ gf: 3, ga: 0, outcome: 'W', unix: 10, isHome: true, htGf: 2, htGa: 0 }),
    game({ gf: 2, ga: 0, outcome: 'W', unix: 20, isHome: false, htGf: 2, htGa: 0 }),
    game({ gf: 1, ga: 0, outcome: 'W', unix: 30, isHome: true, htGf: 1, htGa: 0 }),
    game({ gf: 1, ga: 0, outcome: 'W', unix: 40, isHome: true, htGf: 0, htGa: 0 }),
  ];
  const read = deathTrapSide({
    teamId: 1,
    label: 'T1',
    results,
    venue: 'home',
    period: '1h',
  });
  check('home first half uses only home games', read.games === 3);
  check('first-half win margins decline', read.wins.sequence.join(',') === '2,1,0');
  check('first-half wins are a decline', read.wins.trend === 'decline');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
