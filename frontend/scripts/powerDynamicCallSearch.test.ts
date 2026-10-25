/**
 * League-wide call scoring.
 * Run: npx tsx scripts/powerDynamicCallSearch.test.ts
 */
import { POWER_DYNAMIC_CALLS } from '../utils/powerDynamicCalls';
import { nearestPointsGap, callAspectsFor, scoreCallAspect, scoreCallFixture, type CallTableRow } from '../utils/powerDynamicCallSearch';
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
  'six wins in a row is a ticked won-6 match',
  scoreCallAspect('won-6-current::tick', table[0], table, { matches: wins })?.percent === 100,
);
check(
  'the wrong mark is the opposite of six wins',
  scoreCallAspect('won-6-current::wrong', table[3], table, { matches: wins })?.percent === 100,
);
check(
  'the side on the other end of those games has six losses',
  scoreCallAspect('lost-6-current::tick', table[1], table, { matches: wins })?.percent === 100,
);

const unbeaten: SeasonMatch[] = [1, 2].map((unix) => ({
  homeId: 2,
  awayId: 1,
  homeGoals: 1,
  awayGoals: 0,
  unix,
}));
check(
  'tick calls T1 has never beaten T2 when that is true',
  scoreCallFixture('h2h-never-t1::tick', table[0], table[1], table, { matches: unbeaten })?.percent === 100,
);
check(
  'wrong calls the same in-option when T1 has beaten T2',
  scoreCallFixture('h2h-never-t1::wrong', table[0], table[1], table, { matches: wins })?.percent === 100,
);
check(
  'a stronger neighbour is a compliant match',
  scoreCallAspect('compliant-stronger', table[0], table)?.percent === 100,
);
check(
  'five wins in the last five is Good',
  scoreCallAspect('naming-l5-good::tick', table[0], table, { matches: wins })?.percent === 100,
);
check(
  'Good vs Bad is the last-5 form matchup',
  scoreCallFixture('ukulumbana-1::tick', table[0], table[1], table, { matches: wins })?.percent === 100,
);
check(
  'five straight wins for T1 is a polar edge',
  scoreCallFixture('h2h-polar::tick', table[0], table[1], table, {
    matches: wins.slice(0, 5),
    fixture: { homeId: 1, awayId: 2, unix: 9 },
  })?.percent === 100,
);
check(
  'Negative change is the last-5 label name',
  callAspectsFor('last5', 'label_change').some((item) => item.label === 'Negative change' && item.mark === 'tick'),
);
check(
  'form matchup lists every Ukulumbana pairing',
  callAspectsFor('last5', 'form_matchup').filter((item) => item.id.startsWith('ukulumbana-') && item.mark === 'tick').length === 21,
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
