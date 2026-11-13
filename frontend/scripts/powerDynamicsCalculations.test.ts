/**
 * Power dynamics calculations + contested-league spread.
 * Run: npx tsx scripts/powerDynamicsCalculations.test.ts
 */
import { problemSeparationLabel, sectorSeparationLabel } from '../utils/importanceOf3Engine';
import { evaluatePowerDynamics, gapSideScores, type IndlelaPath, type PpgSwing, type StreakSide } from '../utils/powerDynamicsEngine';
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
      row('indlela', 'Indlela', 'y', 0.5, 0, ['t1']),
    ],
  });
  check('a clear core win is stored as 3', calc.sectors.find((sector) => sector.id === 'baseline')?.t1 === 3 && calc.sectors.find((sector) => sector.id === 'baseline')?.t2 === 0);
  check('a mediocre core win is stored as 1', calc.sectors.find((sector) => sector.id === 'last5')?.t2 === 1 && calc.sectors.find((sector) => sector.id === 'last5')?.t1 === 0);
  check('separation values stay under 6', calc.calc1.t1.length === 0 && calc.calc1.t2.length === 0 && calc.calc1.leader === 'level');
  check('totals add the separation of sectors won', calc.calc2.core.t1 === 3 && calc.calc2.y.t1 === 0.5 && calc.calc2.t1 === 3.5 && calc.calc2.t2 === 1);
  check(
    'T2 wins the mediocre sector for 1',
    calc.calc3.t2.count === 1 && calc.calc3.t2.bands.mid[0]?.id === 'last5' && calc.calc3.t2.bands.mid[0]?.margin === 1,
  );
  check(
    'T1 wins a clear sector and a Y application',
    calc.calc3.t1.count === 2 &&
      calc.calc3.t1.bands.high.map((hit) => hit.id).join() === 'baseline' &&
      calc.calc3.t1.bands.low.map((hit) => hit.id).join() === 'indlela',
  );
  check('missing values count as zero in the total', summariseSectorScores({
    t1Yellow: false,
    t2Yellow: false,
    ticks: [],
    sectors: [row('form', 'Form', 'core', null, 6)],
  }).calc2.t1 === 0 && summariseSectorScores({
    t1Yellow: false,
    t2Yellow: false,
    ticks: [],
    sectors: [row('form', 'Form', 'core', null, 6)],
  }).calc2.core.t2 === 3);
}

console.log('\nwin margin bands');
{
  const calc = summariseSectorScores({
    t1Yellow: false,
    t2Yellow: false,
    ticks: [],
    sectors: [
      row('by6', 'By 6', 'core', 10, 4),
      row('by59', 'By 5.9', 'core', 9, 3.1),
      row('by4', 'By 4', 'core', 4, 0),
      row('by39', 'By 3.9', 'core', 3.9, 0),
      row('tie', 'Tie', 'core', 2, 2),
      row('t2high', 'T2 by 6', 'core', 0, 6),
      row('t2mid', 'T2 by 4.5', 'core', 1, 5.5),
      row('t2low', 'T2 by 1', 'core', 1, 2),
      row('roundsUp', 'Rounds to 6', 'core', 5.96, 0),
      row('staysMid', 'Stays 5.9', 'core', 5.94, 0),
    ],
  });
  const ids = (side: 't1' | 't2', band: 'high' | 'mid' | 'low') =>
    calc.calc3[side].bands[band].map((hit) => hit.id).join();
  check('high against low is a clear win of 3', ids('t1', 'high') === 'by59,roundsUp');
  check('one step apart is a mediocre win of 1', ids('t1', 'mid') === 'by6,by4,staysMid');
  check('the same band is not a win', ids('t1', 'low') === '');
  check('a tie is not a win', !ids('t1', 'high').includes('tie') && !ids('t2', 'high').includes('tie'));
  check('T2 clear and mediocre follow the same cuts', ids('t2', 'high') === 't2high' && ids('t2', 'mid') === 't2mid' && ids('t2', 'low') === '');
  check('poor separations drop out of the count', calc.calc3.t1.count === 5 && calc.calc3.t2.count === 2);
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

  check('1st place wins imbangi as a clear 3', value('imbangi', 't1') === 3);
  check('6th place is not imbangi', value('imbangi', 't2') === 0);
  check('next game intense is 0.5', value('indlela', 't1') === 0.5);
  check('next game quiet is 0', value('indlela', 't2') === 0);
  check('sudden drop is awarded to the opponent', value('sudden_drop', 't1') === 0 && value('sudden_drop', 't2') === 0.5);
  check('sudden pick up is 0.5 for the other side', value('sudden_pickup', 't2') === 0.5 && value('sudden_pickup', 't1') === 0);
  check('a level problem causer is a poor 0', value('problem_causer', 't1') === 0 && value('problem_causer', 't2') === 0);
  check('yellow side keeps Y applications in core', calc.t2Yellow && calc.sectors.find((s) => s.id === 'indlela')?.coreFor.includes('t2') === true);
  check('green side does not move Y applications', calc.t1Yellow === false);
  check('lost 6 ticks T1', tick('lost_6')?.t1 === true && tick('lost_6')?.t2 === false);
  check('won 6 ticks T2', tick('won_6')?.t2 === true);
  check('never lost twice ticks T2', tick('never_lost_twice')?.t2 === true);
  check('contested pack includes 1st only of these two', tick('contested_league')?.t1 === true && tick('contested_league')?.t2 === false);
  check('home/away strong is a core sector with the same award as baseline', calc.sectors.find((s) => s.id === 'home_away_strong')?.group === 'core' && value('home_away_strong', 't1') === value('baseline', 't1') && value('baseline', 't1') === 3);
  check('last 5 is the separation between the two sides', (() => {
    const last5 = calc.sectors.find((s) => s.id === 'last5');
    return last5?.parts.length === 0 && (last5?.detail ?? '').includes('Neutral vs neutral');
  })());
  check('baseline names a separation', (calc.sectors.find((s) => s.id === 'baseline')?.detail ?? '').includes('separation'));
  check('h2h separation uses the gap values', (calc.sectors.find((s) => s.id === 'h2h')?.detail ?? '').includes('separation'));
  check('imbangi sits with the core sectors', calc.sectors.find((s) => s.id === 'imbangi')?.group === 'core');
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
  check('both imbangi sides are a poor 0', pd.t1.rank === 2 && pd.t2.rank === 3 && imbangi?.t1 === 0 && imbangi?.t2 === 0 && imbangi?.group === 'core');
  check('the win into 2nd is named', (imbangi?.detail ?? '').includes('lands them at #2'));
  check('both sudden drops award 0.5 to each opponent', drop?.t1 === 0.5 && drop?.t2 === 0.5);
}

console.log('\nseparation from two scores');
{
  const wide = gapSideScores(1, 6, 6);
  const close = gapSideScores(1, 2, 6);
  check('a wide gap is high against low', wide != null && sectorSeparationLabel(wide.t1, wide.t2)?.startsWith('Clear separation') === true);
  check('neighbours in the same band are poor', close != null && sectorSeparationLabel(close.t1, close.t2)?.startsWith('Poor separation') === true);
  check('medium against low is mediocre', sectorSeparationLabel(5, 0)?.startsWith('Mediocre separation') === true);
  check('an opposite problem causer is clear', problemSeparationLabel(10, true) === 'Clear separation');
  check('a strong problem causer is poor', problemSeparationLabel(10, false) === 'Poor separation');
  check('a moderate problem causer is mediocre', problemSeparationLabel(5, false) === 'Mediocre separation');
  check('an entry problem causer is clear', problemSeparationLabel(3, false) === 'Clear separation');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
