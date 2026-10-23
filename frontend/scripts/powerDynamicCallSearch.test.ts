/**
 * League-wide call scoring.
 * Run: npx tsx scripts/powerDynamicCallSearch.test.ts
 */
import { POWER_DYNAMIC_CALLS } from '../utils/powerDynamicCalls';
import { nearestPointsGap, callAspectsFor, scoreCallAspect, type CallTableRow } from '../utils/powerDynamicCallSearch';
import type { SeasonMatch } from '../utils/bhozomaEngine';

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    passed += 1;
    console.log(`  ok ${name}`);
  } else {
    failed += 1;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function row(partial: Partial<CallTableRow> & Pick<CallTableRow, 'rank' | 'teamId' | 'name' | 'points' | 'zone'>): CallTableRow {
  return {
    played: 10,
    homePoints: 15,
    awayPoints: 5,
    ...partial,
  };
}

const table: CallTableRow[] = [
  row({ rank: 1, teamId: 1, name: 'Top', points: 30, zone: 'top', homePoints: 24, awayPoints: 6 }),
  row({ rank: 2, teamId: 2, name: 'Close', points: 28, zone: 'top' }),
  row({ rank: 3, teamId: 3, name: 'Mid', points: 15, zone: 'mid', homePoints: 4, awayPoints: 11 }),
  row({ rank: 4, teamId: 4, name: 'Bottom', points: 4, zone: 'bottom', homePoints: 1, awayPoints: 3 }),
];

check('nearest gap for a level neighbour is 2 points here', nearestPointsGap(table[1], table) === 2);
check('a side level with the next one would score 100', scoreCallAspect('bateteme-1-close', row({ rank: 1, teamId: 9, name: 'Level', points: 10, zone: 'mid' }), [
  row({ rank: 1, teamId: 9, name: 'Level', points: 10, zone: 'mid' }),
  row({ rank: 2, teamId: 8, name: 'Other', points: 10, zone: 'mid' }),
])?.percent === 100);
check('two points away is an 60 percent bateteme fit', scoreCallAspect('bateteme-1-close', table[1], table)?.percent === 60);
check('top of the green third is the strongest green match', scoreCallAspect('colour-green', table[0], table)?.percent === 100);
check('a bottom side is not a green match', scoreCallAspect('colour-green', table[3], table)?.percent === 0);
check('home points share becomes the home-strong percentage', scoreCallAspect('venue-home', table[0], table)?.percent === 80);
check('baseline grade is measured', scoreCallAspect('baseline-letter-A', table[0], table)?.percent != null);

for (const call of POWER_DYNAMIC_CALLS) {
  for (const fn of call.functions) {
    check(`${call.name} / ${fn.label} has an aspect`, callAspectsFor(call.id, fn.id).length > 0);
  }
}

const wins: SeasonMatch[] = [1, 2, 3, 4, 5, 6].map((unix) => ({
  homeId: 1,
  awayId: 2,
  homeGoals: 1,
  awayGoals: 0,
  unix,
}));
check(
  'six wins in a row is a full won-6 match',
  scoreCallAspect('won-6-current', table[0], table, { matches: wins })?.percent === 100,
);
check(
  'the side on the other end of those games has six losses',
  scoreCallAspect('lost-6-current', table[1], table, { matches: wins })?.percent === 100,
);
check(
  'a stronger neighbour is a compliant match',
  scoreCallAspect('compliant-stronger', table[0], table)?.percent === 100,
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
