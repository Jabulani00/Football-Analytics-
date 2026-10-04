/**
 * Problem causer marks and levels.
 * Run: npx tsx scripts/problemCauser.test.ts
 */
import { evaluateProblemCauser, problemLevel } from '../utils/problemCauser';
import type { TeamResult } from '../utils/teamResults';

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

function game(
  outcome: 'W' | 'D' | 'L',
  gf: number,
  ga: number,
  opponent: string,
  unix: number,
): TeamResult {
  return {
    fixtureId: unix,
    unix,
    teamId: 1,
    opponentId: unix,
    opponentName: opponent,
    isHome: true,
    gf,
    ga,
    outcome,
    opponentRank: null,
    teamRank: null,
    opponentAbove: null,
    goalDiff: gf - ga,
  };
}

console.log('\nlevels');
{
  check('2 is Entry 3', problemLevel(2).name === 'Entry' && problemLevel(2).score === 3);
  check('below 2 is Entry', problemLevel(-1).score === 3);
  check('3 is Moderate 5', problemLevel(3).name === 'Moderate' && problemLevel(3).score === 5);
  check('5 is Moderate', problemLevel(5).score === 5);
  check('6 is Major 7', problemLevel(6).name === 'Major' && problemLevel(6).score === 7);
  check('7 is Major', problemLevel(7).score === 7);
  check('8 is Extreme 10', problemLevel(8).name === 'Extreme' && problemLevel(8).score === 10);
  check('20 is Extreme', problemLevel(20).score === 10);
}

console.log('\nmarks');
{
  const t1 = [
    game('W', 2, 1, 'A', 50),
    game('D', 1, 1, 'B', 40),
    game('L', 0, 3, 'C', 30),
    game('W', 4, 0, 'D', 20),
    game('W', 1, 0, 'E', 10),
    game('W', 5, 0, 'Old', 1),
  ];
  const t2 = [
    game('W', 1, 0, 'F', 50),
    game('L', 0, 1, 'G', 40),
    game('D', 0, 0, 'H', 30),
  ];
  const read = evaluateProblemCauser(t1, t2);
  check('only the last 5 count', read.t1.played === 5);
  check('short sample stays under 5', read.t2.played === 3);
  check('win gap above 1 is a red 0', read.winRatio.difference === 2 && read.winRatio.bit === 0);
  check('sixth game is dropped from the win count', read.winRatio.t1Wins === 3);

  check('2-1 is a close game', read.t1.goalDiff[0].bit === 1 && read.t1.goalDiff[0].btts === true);
  check('0-3 is not close', read.t1.goalDiff[2].bit === 0);
  check('4-0 is not close', read.t1.goalDiff[3].bit === 0);
  check('draw is 1', read.t1.draws[1].bit === 1);
  check('win is not a draw', read.t1.draws[0].bit === 0);
  check('2-1 is a one-goal win', read.t1.oneGoalWins[0].bit === 1);
  check('4-0 is not a one-goal win', read.t1.oneGoalWins[3].bit === 0);
  check('1-0 loss is not a one-goal win', read.t2.oneGoalWins[1].bit === 0);

  const t1Ones =
    read.winRatio.bit +
    read.t1.goalDiff.reduce((s, m) => s + m.bit, 0) +
    read.t1.draws.reduce((s, m) => s + m.bit, 0) +
    read.t1.oneGoalWins.reduce((s, m) => s + m.bit, 0);
  check('total is 1s minus games played', read.t1.ones === t1Ones && read.t1.total === t1Ones - 5);

  const close = evaluateProblemCauser(
    [game('W', 1, 0, 'A', 2), game('L', 0, 1, 'B', 1)],
    [game('D', 1, 1, 'C', 1)],
  );
  check('win gap of 1 is a green 1', close.winRatio.difference === 1 && close.winRatio.bit === 1);

  const wide = evaluateProblemCauser(
    [game('W', 1, 0, 'A', 3), game('W', 1, 0, 'B', 2), game('W', 1, 0, 'C', 1)],
    [game('L', 0, 1, 'D', 1)],
  );
  check('win gap above 1 is a red 0', wide.winRatio.difference === 3 && wide.winRatio.bit === 0);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
