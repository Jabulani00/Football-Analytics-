/**
 * Power dynamics calculations + contested-league spread.
 * Run: npx tsx scripts/powerDynamicsCalculations.test.ts
 */
import { evaluatePowerDynamics, type IndlelaPath, type PpgSwing, type StreakSide } from '../utils/powerDynamicsEngine';
import {
  buildPowerDynamicsCalculations,
  summariseSectorScores,
  type CalculationSector,
} from '../utils/powerDynamicsCalculations';
import { evaluateProblemCauser } from '../utils/problemCauser';
import { contestedLeagueBoard, CONTESTED_TOP_SPREAD } from '../utils/separatorTools';
import type { StandingLike } from '../utils/motivationEngine';

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  ok  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function row(
  id: string,
  label: string,
  group: CalculationSector['group'],
  t1: number | null,
  t2: number | null,
  coreFor: CalculationSector['coreFor'] = [],
): CalculationSector {
  return { id, label, group, coreFor, t1, t2, detail: '', parts: [] };
}

console.log('\ncalculation summary');
{
  const calc = summariseSectorScores({
    t1Yellow: true,
    t2Yellow: false,
    ticks: [],
    sectors: [
      row('baseline', 'Baseline', 'core', 8, 0),
      row('last5', 'Last 5', 'core', 5, 9),
      row('indlela', 'Indlela', 'y', 2, 0, ['t1']),
    ],
  });
  check('T1 hit is baseline only', calc.calc1.t1.map((hit) => hit.id).join() === 'baseline');
  check('T2 hit is last 5 only', calc.calc1.t2.map((hit) => hit.id).join() === 'last5');
  check('equal hit counts are level', calc.calc1.leader === 'level');
  check('apple totals add every numbered sector', calc.calc2.t1 === 15 && calc.calc2.t2 === 9);
  check('T2 wins only the sector it leads', calc.calc3.count === 1 && calc.calc3.sectors[0]?.id === 'last5');
  check('missing values count as zero in the total', summariseSectorScores({
    t1Yellow: false,
    t2Yellow: false,
    ticks: [],
    sectors: [row('form', 'Form', 'core', null, 6)],
  }).calc2.t1 === 0);
}

console.log('\ncontested league spread');
{
  const tight = [40, 39, 38, 37, 36, 20].map((points, index) => ({
    rank: index + 1,
    teamId: index + 1,
    name: `S${index + 1}`,
    points,
    played: 20,
    zone: 'top' as const,
  }));
  const board = contestedLeagueBoard(tight);
  check(`spread of ${CONTESTED_TOP_SPREAD} is contested`, board.active && board.spread === 4);
  check('leader is 0 behind', board.rows[0]?.behindLeader === 0);
  check('5th is 4 behind', board.rows[4]?.behindLeader === 4);

  const open = tight.map((row, index) => (index === 4 ? { ...row, points: 35 } : row));
  const wide = contestedLeagueBoard(open);
  check('spread of 5 is not contested', wide.active === false && wide.spread === 5);
}

function swing(drop: boolean): PpgSwing {
  return {
    recentPpg: drop ? 1 : 2,
    priorPpg: drop ? 2 : 1,
    recentPts: drop ? 5 : 10,
    priorPts: drop ? 10 : 5,
    recentMp: 5,
    priorMp: 5,
    recentLines: [],
    drop,
    rise: !drop,
    detail: drop ? 'sudden drop' : 'sudden pick up',
  };
}

function streak(current: number, neverTwice: boolean): StreakSide {
  return { current, sequence: '', neverTwice, last10: '', runs: [], results: [] };
}

function path(fourthStronger: boolean | null): IndlelaPath {
  return {
    stops: [],
    sequence: '',
    secondStronger: null,
    fourthStronger,
    easy: null,
    call: '',
  };
}

console.log('\nlive sector values');
{
  const table: StandingLike[] = [
    { rank: 1, teamId: 1, name: 'Alpha', points: 20, played: 10, zone: 'top' },
    { rank: 2, teamId: 2, name: 'Bravo', points: 18, played: 10, zone: 'mid' },
    { rank: 3, teamId: 3, name: 'Charlie', points: 17, played: 10, zone: 'mid' },
    { rank: 4, teamId: 4, name: 'Delta', points: 16, played: 10, zone: 'mid' },
    { rank: 5, teamId: 5, name: 'Echo', points: 16, played: 10, zone: 'mid' },
    { rank: 6, teamId: 6, name: 'Foxtrot', points: 10, played: 10, zone: 'mid' },
  ];
  const pd = evaluatePowerDynamics({
    table,
    homeId: 1,
    awayId: 6,
    homeName: 'Alpha',
    awayName: 'Foxtrot',
    homeResults: [],
    awayResults: [],
  });
  const calc = buildPowerDynamicsCalculations({
    pd,
    standings: table,
    matches: [],
    schedule: [],
    seasonProgress: 40,
    competitionId: 1,
    h2hMatches: [],
    homeName: 'Alpha',
    awayName: 'Foxtrot',
    competitionName: 'Test',
    initial: { home: null, away: null, overallHome: null, overallAway: null },
    indlela: { t1: path(true), t2: path(false) },
    problem: evaluateProblemCauser({ matches: [], t1Name: 'Alpha', t2Name: 'Foxtrot' }),
    swing: { t1: swing(true), t2: swing(false) },
    loss: { t1: streak(6, false), t2: streak(0, true) },
    win: { t1: streak(0, true), t2: streak(6, false) },
  });
  const value = (id: string, side: 't1' | 't2') => calc.sectors.find((sector) => sector.id === id)?.[side];
  const tick = (id: string) => calc.ticks.find((row) => row.id === id);

  check('1st place is imbangi', value('imbangi', 't1') === 6);
  check('6th place is not imbangi', value('imbangi', 't2') === 0);
  check('next game intense is 2', value('indlela', 't1') === 2);
  check('next game quiet is 0', value('indlela', 't2') === 0);
  check('sudden drop is awarded to the opponent', value('sudden_drop', 't1') === 0 && value('sudden_drop', 't2') === 2);
  check('sudden pick up is 2 for the other side', value('sudden_pickup', 't2') === 2 && value('sudden_pickup', 't1') === 0);
  check('problem causer uses the level score', value('problem_causer', 't1') === 3);
  check('yellow side keeps Y applications in core', calc.t2Yellow && calc.sectors.find((s) => s.id === 'indlela')?.coreFor.includes('t2') === true);
  check('green side does not move Y applications', calc.t1Yellow === false);
  check('lost 6 ticks T1', tick('lost_6')?.t1 === true && tick('lost_6')?.t2 === false);
  check('won 6 ticks T2', tick('won_6')?.t2 === true);
  check('never lost twice ticks T2', tick('never_lost_twice')?.t2 === true);
  check('contested pack includes 1st only of these two', tick('contested_league')?.t1 === true && tick('contested_league')?.t2 === false);
  check('home/away strong copies the baseline', value('home_away_strong', 't1') === value('baseline', 't1'));
  check('totals include the numbered sectors', calc.calc2.t1 > calc.calc2.t2);
}

console.log('\nimbangi is 1st or 2nd only');
{
  const table: StandingLike[] = [
    { rank: 1, teamId: 1, name: 'Alpha', points: 40, played: 10, zone: 'top' },
    { rank: 2, teamId: 2, name: 'Bravo', points: 20, played: 10, zone: 'top' },
    { rank: 3, teamId: 3, name: 'Charlie', points: 19, played: 10, zone: 'mid' },
    { rank: 4, teamId: 4, name: 'Delta', points: 18, played: 10, zone: 'mid' },
  ];
  const pd = evaluatePowerDynamics({
    table,
    homeId: 3,
    awayId: 2,
    homeName: 'Charlie',
    awayName: 'Bravo',
    homeResults: [],
    awayResults: [],
  });
  const calc = buildPowerDynamicsCalculations({
    pd,
    standings: table,
    matches: [],
    schedule: [],
    h2hMatches: [],
    homeName: 'Charlie',
    awayName: 'Bravo',
    initial: { home: null, away: null, overallHome: null, overallAway: null },
    indlela: { t1: path(null), t2: path(null) },
    problem: evaluateProblemCauser({ matches: [], t1Name: pd.t1.name, t2Name: pd.t2.name }),
    swing: { t1: swing(true), t2: swing(true) },
    loss: { t1: streak(0, false), t2: streak(0, false) },
    win: { t1: streak(0, false), t2: streak(0, false) },
  });
  const imbangi = calc.sectors.find((sector) => sector.id === 'imbangi');
  const drop = calc.sectors.find((sector) => sector.id === 'sudden_drop');
  check('2nd place is imbangi even with a wide gap', pd.t1.rank === 2 && imbangi?.t1 === 6);
  check('3rd place is not imbangi even when the neighbour is close', pd.t2.rank === 3 && imbangi?.t2 === 0);
  check('both sudden drops award 2 to each opponent', drop?.t1 === 2 && drop?.t2 === 2);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
