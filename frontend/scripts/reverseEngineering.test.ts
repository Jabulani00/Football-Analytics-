/**
 * Section 7 reverse engineering.
 * Run: npx tsx scripts/reverseEngineering.test.ts
 */
import type { SeasonMatch } from '../utils/bhozomaEngine';
import {
  callHit,
  describePrediction,
  pickFromSamples,
  reverseEngineer,
  reverseMissNotes,
} from '../utils/reverseEngineering';

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

function match(unix: number, homeId: number, awayId: number, hg: number, ag: number): SeasonMatch {
  return { unix, homeId, awayId, homeGoals: hg, awayGoals: ag };
}

function names(...pairs: [number, string][]): Map<number, string> {
  return new Map(pairs);
}

console.log('\npick');
{
  check('more points picks the team', pickFromSamples(10, 5, 4, 5) === 'team');
  check('fewer points picks the opponent', pickFromSamples(4, 5, 10, 5) === 'opponent');
  check('equal points is a draw', pickFromSamples(7, 5, 7, 5) === 'draw');
  check('unequal samples use points per game', pickFromSamples(15, 9, 12, 5) === 'opponent');
  check('no games is no call', pickFromSamples(0, 0, 9, 3) === null);
  check('a win hit is the team winning', callHit('team', 'W') === true);
  check('an opponent hit is a loss', callHit('opponent', 'L') === true);
  check('a draw call misses a win', callHit('draw', 'W') === false);
}

console.log('\nprediction story');
{
  const ahead = describePrediction({
    read: { teamPts: 5, oppPts: 3, teamMp: 5, oppMp: 5, pick: 'team' },
    team: 'Arsenal',
    opponent: 'Chelsea',
    gf: 0,
    ga: 2,
    actual: 'L',
  });
  check('a wrong winner names the pick', ahead.called === 'Arsenal to win');
  check('the lean is the points gap', ahead.lean === 'Arsenal ahead by 2 pts');
  check('a 2-goal defeat is a 2-goal miss', ahead.verdict === 'Missed by 2 goals.');

  const drawCall = describePrediction({
    read: { teamPts: 7, oppPts: 7, teamMp: 5, oppMp: 5, pick: 'draw' },
    team: 'Arsenal',
    opponent: 'Chelsea',
    gf: 1,
    ga: 0,
    actual: 'W',
  });
  check('level points call a draw', drawCall.called === 'A draw' && drawCall.lean === 'Level on points per match');
  check('a draw call that won is missed by the goal margin', drawCall.verdict === 'Missed by 1 goal.');

  const levelResult = describePrediction({
    read: { teamPts: 9, oppPts: 4, teamMp: 5, oppMp: 5, pick: 'team' },
    team: 'Arsenal',
    opponent: 'Chelsea',
    gf: 1,
    ga: 1,
    actual: 'D',
  });
  check('a winner call that drew says it finished a draw', levelResult.verdict === 'Missed. It finished a draw.');

  const right = describePrediction({
    read: { teamPts: 3, oppPts: 10, teamMp: 5, oppMp: 5, pick: 'opponent' },
    team: 'Arsenal',
    opponent: 'Chelsea',
    gf: 0,
    ga: 1,
    actual: 'L',
  });
  check('the opponent call is named', right.called === 'Chelsea to win' && right.verdict === 'Result matched');
}

console.log('\nwalk forward');
{
  // Team 1: five wins, then a 6th and a 7th. Opponent 8 is stronger on both windows.
  const matches: SeasonMatch[] = [
    match(1, 1, 3, 2, 0),
    match(2, 4, 1, 0, 1),
    match(3, 1, 5, 1, 0),
    match(4, 6, 1, 0, 0),
    match(5, 1, 7, 3, 1),
    match(10, 8, 9, 1, 0),
    match(11, 8, 10, 2, 0),
    match(12, 11, 8, 0, 1),
    match(13, 8, 12, 3, 0),
    match(14, 13, 8, 0, 2),
    match(20, 8, 1, 0, 1),
    match(30, 1, 8, 0, 2),
  ];
  const report = reverseEngineer({
    t1Id: 1,
    t2Id: null,
    t1Label: 'One',
    t2Label: 'Two',
    matches,
    names: names([1, 'One'], [8, 'Eight']),
  });
  const rows = report.t1?.rows ?? [];
  check('first check is the 6th match', rows[0]?.gameNumber === 6 && rows[0]?.priorCount === 5);
  check('seventh match looks at 6 earlier games', rows[1]?.gameNumber === 7 && rows[1]?.priorCount === 6);
  check('last 5 window stays at 5 games', rows[1]?.last5.teamMp === 5 && rows[1]?.prior.teamMp === 6);
  check('6th match opponent is Eight', rows[0]?.opponentName === 'Eight' && rows[0]?.isHome === false);
  check('stronger opponent is the last 5 pick', rows[0]?.last5.pick === 'opponent');
  check('team 1 win makes that pick a miss', rows[0]?.last5Hit === false && rows[0]?.actual === 'W');
  check('no second side', report.t2 == null);
}

console.log('\nmissed pattern');
{
  // Team 1 opens with four losses, then five wins. Last 5 is hot. The full record is not.
  // Opponent 2 is steady and better on the full record, worse on the last 5.
  const earlyLosses: SeasonMatch[] = [
    match(1, 1, 3, 0, 1),
    match(2, 4, 1, 1, 0),
    match(3, 1, 5, 0, 1),
    match(4, 6, 1, 1, 0),
  ];
  const hotWins: SeasonMatch[] = [
    match(5, 1, 7, 1, 0),
    match(6, 8, 1, 0, 1),
    match(7, 1, 9, 2, 0),
    match(8, 10, 1, 0, 1),
    match(9, 1, 11, 1, 0),
  ];
  const opponentSteady: SeasonMatch[] = [];
  for (let i = 0; i < 12; i++) {
    const unix = 100 + i;
    opponentSteady.push(i % 2 === 0 ? match(unix, 2, 20 + i, 1, 0) : match(unix, 20 + i, 2, 0, 1));
  }
  // Last 5 of team 2 before unix 200: five wins = 15. Team 1 last 5 = 15. That would be a draw.
  // Need team 1 last 5 above team 2 last 5, and team 2 full record above team 1 full record.
  // Team 1 full: 4 losses + 5 wins = 15 pts / 9. Team 2: 12 wins = 36 / 12.
  // Last 5 team 2 must be under 15. Replace team 2's last five before the target with weaker results.
  const weakTail: SeasonMatch[] = [
    match(190, 2, 50, 1, 1),
    match(191, 51, 2, 1, 1),
    match(192, 2, 52, 0, 1),
    match(193, 53, 2, 1, 1),
    match(194, 2, 54, 1, 1),
  ];
  const target = match(200, 2, 1, 2, 0);
  const matches = [...earlyLosses, ...hotWins, ...opponentSteady.filter((m) => m.unix < 190), ...weakTail, target];
  const report = reverseEngineer({
    t1Id: 1,
    t2Id: 2,
    t1Label: 'One',
    t2Label: 'Two',
    matches,
    names: names([1, 'One'], [2, 'Two']),
  });
  const row = report.t1?.rows.find((r) => r.gameNumber === 10);
  check('tenth game is the target', row?.opponentName === 'Two' && row?.actual === 'L');
  check('last 5 still likes the hot side', row?.last5.pick === 'team' && row?.last5Hit === false);
  check('full record likes the longer sample', row?.prior.pick === 'opponent' && row?.priorHit === true);
  check('headline counts that miss once', report.missedByLast5 === 1);

  const notes = reverseMissNotes(report.t1?.rows ?? []);
  check(
    'notes name the full-record miss',
    notes.some((note) => note.includes('full record had the result')),
  );

  const shared = report.t2?.rows.find((r) => r.gf === 2 && r.ga === 0 && r.opponentName === 'One');
  check('the same fixture is on the other side', shared != null && shared.last5Hit === false && shared.priorHit === true);
  check('checked fixtures are not doubled', report.checked === (report.t1?.rows.length ?? 0) + (report.t2?.rows.length ?? 0) - 1);
}

console.log('\nrates');
{
  const matches: SeasonMatch[] = [];
  // Both sides win their first five against fillers, then team 1 beats team 2.
  for (let i = 0; i < 5; i++) {
    matches.push(match(i + 1, 1, 10 + i, 1, 0));
    matches.push(match(i + 1, 2, 30 + i, 1, 0));
  }
  matches.push(match(20, 1, 2, 1, 0));
  const report = reverseEngineer({
    t1Id: 1,
    t2Id: 2,
    t1Label: 'One',
    t2Label: 'Two',
    matches,
    names: names([1, 'One'], [2, 'Two']),
  });
  check('equal last 5 points call a draw', report.t1?.rows[0]?.last5.pick === 'draw');
  check('a draw call that was a win is an accuracy miss', report.last5.hits === 0 && report.last5.scored === 1);
  check('a draw call is left out of success', report.last5.winnerCalls === 0 && report.last5.success == null);
  check('accuracy is zero', report.last5.accuracy === 0);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
