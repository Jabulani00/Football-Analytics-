/**
 * Problem causer marks and levels, from head-to-head meetings.
 * Run: npx tsx scripts/problemCauser.test.ts
 */
import { evaluateProblemCauser, problemLevel } from '../utils/problemCauser';
import type { H2HMatch } from '../services/oddAlerts';

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

function meet(
  id: number,
  home: string,
  away: string,
  hg: number,
  ag: number,
  date: string,
): H2HMatch {
  return {
    id,
    home_name: home,
    away_name: away,
    home_goals: hg,
    away_goals: ag,
    ht_score: null,
    total_goals: hg + ag,
    btts: hg > 0 && ag > 0,
    date,
    league: 'League',
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

console.log('\nhead-to-head marks');
{
  const matches = [
    meet(6, 'Alpha', 'Beta', 5, 0, '2020-01-01'),
    meet(5, 'Beta', 'Alpha', 0, 1, '2026-01-01'),
    meet(4, 'Alpha', 'Beta', 4, 0, '2026-02-01'),
    meet(3, 'Alpha', 'Beta', 0, 3, '2026-03-01'),
    meet(2, 'Beta', 'Alpha', 1, 1, '2026-04-01'),
    meet(1, 'Alpha', 'Beta', 2, 1, '2026-05-01'),
    meet(99, 'Alpha', 'Other', 3, 0, '2026-06-01'),
    meet(7, 'Alpha', 'Beta', 1, 0, '2026-07-01'),
  ];
  const read = evaluateProblemCauser({
    matches,
    t1Name: 'Alpha',
    t2Name: 'Beta',
    excludeFixtureId: 7,
  });
  check('only the last 5 meetings count', read.meetings === 5 && read.t1.played === 5 && read.t2.played === 5);
  check('a game against someone else is ignored', read.t1.goalDiff.every((m) => m.opponent === 'Beta'));
  check('the current fixture is left out', read.t1.wins === 3);
  check('win gap above 1 is a red 0', read.winRatio.t1Wins === 3 && read.winRatio.t2Wins === 1 && read.winRatio.bit === 0);

  check('newest meeting is 2-1 from T1', read.t1.goalDiff[0].score === '2–1' && read.t1.goalDiff[0].bit === 1 && read.t1.goalDiff[0].btts);
  check('same meeting is 1-2 from T2', read.t2.goalDiff[0].score === '1–2' && read.t2.goalDiff[0].bit === 1);
  check('0-3 is not a close game', read.t1.goalDiff[2].score === '0–3' && read.t1.goalDiff[2].bit === 0);
  check('the draw is 1 for both sides', read.t1.draws[1].bit === 1 && read.t2.draws[1].bit === 1);
  check('2-1 is a one-goal win only for the winner', read.t1.oneGoalWins[0].bit === 1 && read.t2.oneGoalWins[0].bit === 0);

  const ones =
    read.winRatio.bit +
    read.t1.goalDiff.reduce((s, m) => s + m.bit, 0) +
    read.t1.draws.reduce((s, m) => s + m.bit, 0) +
    read.t1.oneGoalWins.reduce((s, m) => s + m.bit, 0);
  check('total is 1s minus the meetings', read.t1.ones === ones && read.t1.total === ones - 5);

  const close = evaluateProblemCauser({
    matches: [meet(1, 'Alpha', 'Beta', 1, 0, '2026-02-01'), meet(2, 'Beta', 'Alpha', 1, 1, '2026-01-01')],
    t1Name: 'Alpha',
    t2Name: 'Beta',
  });
  check('win gap of 1 is a green 1', close.winRatio.difference === 1 && close.winRatio.bit === 1);
  check('fewer than 5 meetings are kept', close.meetings === 2);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
