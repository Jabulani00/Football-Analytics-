/**
 * Calculation calls.
 * Run: npx tsx scripts/powerDynamicCalculationCalls.test.ts
 */
import { scoreActivityCall, scoreCalculationRead } from '../utils/powerDynamicCalculationCalls';
import { callAspectById, scoreCallFixture, type CallTableRow } from '../utils/powerDynamicCallSearch';
import { scorePowerDynamicPacks, type PowerDynamicLeaguePack } from '../utils/powerDynamicLibraryScore';
import type { PowerDynamicsCalculation } from '../utils/powerDynamicsCalculations';

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean): void {
  if (cond) {
    passed += 1;
    console.log(`  ok ${name}`);
  } else {
    failed += 1;
    console.error(`  FAIL ${name}`);
  }
}

const emptyBands = { high: [], mid: [], low: [] };
const calc = {
  t1Yellow: false,
  t2Yellow: false,
  sectors: [{ id: 'baseline', label: 'Baseline', group: 'core', coreFor: [], t1: 8, t2: 2, detail: '', parts: [] }],
  ticks: [{ id: 'lost_6', label: 'Lost 6 in a row', t1: true, t2: false, detail: 'T1 lost 6' }],
  calc1: {
    t1: [{ id: 'baseline', label: 'Baseline', value: 8 }],
    t2: [],
    leader: 't1',
  },
  calc2: { core: { t1: 7, t2: 1 }, y: { t1: 0.5, t2: 1 }, t1: 8, t2: 2 },
  calc3: {
    t1: { count: 1, bands: { high: [{ id: 'baseline', label: 'Baseline', t1: 8, t2: 2, margin: 6 }], mid: [], low: [] } },
    t2: { count: 0, bands: emptyBands },
  },
} as PowerDynamicsCalculation;

check('calculation 1 calls the side with more sectors of 6+', scoreCalculationRead('calc1-t1', calc)?.percent === 100 && scoreCalculationRead('calc1-t2', calc)?.percent === 0);
check('calculation 2 calls the higher total', scoreCalculationRead('calc2-t1', calc)?.percent === 100 && scoreCalculationRead('calc2-level', calc)?.percent === 0);
check('calculation 3 calls a win by 6 or more', scoreCalculationRead('calc3-t1-high', calc)?.percent === 100 && scoreCalculationRead('calc3-t2-high', calc)?.percent === 0);
check('calculation calls use a tick and a wrong', callAspectById('calc1-t1::tick')?.mark === 'tick' && callAspectById('calc1-t1::wrong')?.mark === 'wrong');
check('a wrong is the opposite of the tick', scoreCalculationRead('calc1-t2::wrong', calc)?.percent === 100 && scoreCalculationRead('calc1-t1::tick', calc)?.percent === 100);
check('core and Y sectors are callable', callAspectById('sector-baseline-t1::tick')?.functionId === 'core' && callAspectById('sector-bhozoma-t2::wrong')?.functionId === 'y');
check('a core sector call follows the two numbers', scoreCalculationRead('sector-baseline-t1::tick', calc)?.percent === 100 && scoreCalculationRead('sector-baseline-t2::tick', calc)?.percent === 0);
check('a tick call follows the side it is on', scoreCalculationRead('tick-lost_6-t1::tick', calc)?.percent === 100 && scoreCalculationRead('tick-lost_6-t2::wrong', calc)?.percent === 100);
{
  const samples = [
    { key: 'a', core: { t1: 9, t2: 1 }, y: { t1: 1.5, t2: 0 }, mix: { t1: 10.5, t2: 1 } },
    { key: 'b', core: { t1: 1, t2: 4 }, y: { t1: 0, t2: 0.5 }, mix: { t1: 1, t2: 4.5 } },
  ];
  const busy = {
    ...calc,
    calc2: { core: { t1: 9, t2: 1 }, y: { t1: 1.5, t2: 0 }, t1: 10.5, t2: 1 },
    calc3: { t1: { count: 3, bands: emptyBands }, t2: { count: 1, bands: emptyBands } },
  };
  check(
    'fixture activity calls high, bigger, and a big core difference',
    scoreActivityCall('activity-core-t1-high', busy, samples)?.percent === 100 &&
      scoreActivityCall('activity-core-t2-low', busy, samples)?.percent === 100 &&
      scoreActivityCall('activity-core-t1-bigger', busy, samples)?.percent === 100 &&
      scoreActivityCall('activity-y-t2-smaller', busy, samples)?.percent === 100 &&
      scoreActivityCall('activity-core-big', busy, samples)?.percent === 100 &&
      scoreActivityCall('activity-y-small', busy, samples)?.percent === 100 &&
      scoreActivityCall('activity-y-big', busy, samples)?.percent === 0 &&
      scoreActivityCall('activity-mix-big', busy, samples)?.percent === 100,
  );
}
check(
  'each calculation can call the highest and lowest core, Y, and combined totals',
  scoreCalculationRead('calc1-core-t1-high', calc)?.percent === 100 &&
    scoreCalculationRead('calc2-y-t1-low', calc)?.percent === 100 &&
    scoreCalculationRead('calc3-combined-t2-low', calc)?.percent === 100 &&
    scoreCalculationRead('calc3-combined-t1-low', calc)?.percent === 0,
);
check(
  'the calculations call lists the last 5 overview',
  scoreCalculationRead('calc-overview-t1-positive', {
    ...calc,
    last5: {
      t1Place: 1,
      t2Place: 10,
      t1Pole: 'positive',
      t2Pole: 'negative',
      t1Magnitude: 5,
      t2Magnitude: -1,
      support: 't1',
      winner: 't1',
      letter: 'A',
      points: 3,
      detail: 'T1 support',
    },
  })?.percent === 100 &&
    scoreCalculationRead('calc-overview-t2-support', { ...calc, last5: { t1Place: 1, t2Place: 10, t1Pole: 'positive', t2Pole: 'negative', t1Magnitude: 5, t2Magnitude: -1, support: 't1', winner: 't1', letter: 'A', points: 3, detail: 'T1 support' } })?.percent === 0 &&
    scoreCalculationRead('calc-overview-t1-wins', { ...calc, last5: { t1Place: 1, t2Place: 10, t1Pole: 'positive', t2Pole: 'negative', t1Magnitude: 5, t2Magnitude: -1, support: 't1', winner: 't1', letter: 'A', points: 3, detail: 'T1 support' } })?.percent === 100 &&
    callAspectById('calc-overview-t2-positive::tick')?.functionId === 'overview' &&
    callAspectById('activity-core-t1-high::tick')?.functionId === 'activity',
);
check(
  'a sector can be called as highest or lowest',
  scoreCalculationRead('sector-baseline-t1', calc)?.percent === 100 &&
    scoreCalculationRead('sector-h2h-t1-low', calc)?.percent === 0 &&
    scoreCalculationRead('sector-baseline-t2-low', calc)?.percent === 100 &&
    callAspectById('sector-h2h-t1-low::tick')?.functionId === 'core',
);

const table: CallTableRow[] = [
  { rank: 1, teamId: 1, name: 'Top', played: 10, points: 30, homePoints: 24, awayPoints: 6, zone: 'top' },
  { rank: 2, teamId: 2, name: 'Next', played: 10, points: 20, homePoints: 10, awayPoints: 10, zone: 'top' },
  { rank: 3, teamId: 3, name: 'Low', played: 10, points: 4, homePoints: 1, awayPoints: 3, zone: 'bottom' },
];
const pack: PowerDynamicLeaguePack = {
  seasonId: 1,
  competitionId: 1,
  competitionType: 'League',
  seasonName: '2026',
  name: 'League',
  country: 'ZA',
  table,
  byTeam: new Map(table.map((row) => [row.teamId, row])),
  matches: [],
  schedule: [],
  cache: new Map(),
  fixtures: [{ id: 11, homeId: 1, awayId: 3, homeName: 'Top', awayName: 'Low', unix: 1700000000, dateKey: '2026-10-28' }],
};
const context = {
  matches: pack.matches,
  schedule: pack.schedule,
  cache: pack.cache,
  fixture: { homeId: 1, awayId: 3, unix: 1700000000 },
};
const sector = scoreCallFixture('sector-baseline-t1::tick', table[0], table[2], table, context);
const tick = scoreCallFixture('tick-lost_6-t1::wrong', table[0], table[2], table, context);
check('a sector call is scored for the fixture', sector != null && sector.percent > 0);
check('a tick call is scored for the fixture', tick != null && tick.percent > 0);
const overview = scoreCallFixture('calc-overview-both-support::tick', table[0], table[2], table, context);
const notPositive = scoreCallFixture('calc-overview-t1-positive::tick', table[0], table[2], table, context);
check('a last 5 overview call is scored from the calculation', overview?.percent === 100 && notPositive?.percent === 0);
const hits = scorePowerDynamicPacks([pack], ['calc2-t1::tick', 'sector-baseline-t1::tick', 'tick-lost_6-t1::wrong'], '2026-10-28');
check(
  'calculation, sector, and tick calls return the fixture once when all hold',
  hits.length === 1 &&
    hits[0].fixtureId === 11 &&
    hits[0].percent > 0 &&
    ['T1 total is higher · true', 'Baseline · T1 highest · true', 'Lost 6 in a row · T1 · opposite'].every((label) => hits[0].aspectLabel.includes(label)),
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
