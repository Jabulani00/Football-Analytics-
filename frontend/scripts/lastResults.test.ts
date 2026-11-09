/**
 * Last-game result filters — per-game predicates + windowed rate.
 */
import { RESULT_FILTERS, resultFilter, recentResultStat, LAST_RESULT_WINDOWS } from '../utils/lastResults';
import type { TeamResult } from '../utils/teamResults';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { console.log(`  ✓ ${name}`); passed += 1; }
  else { console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); failed += 1; }
}

let id = 0;
function g(gf: number, ga: number): TeamResult {
  id += 1;
  return {
    fixtureId: id, unix: 1000 - id, teamId: 1, opponentId: 99, opponentName: 'Opp', isHome: true,
    gf, ga, outcome: gf > ga ? 'W' : gf < ga ? 'L' : 'D',
    opponentRank: null, teamRank: null, opponentAbove: null, goalDiff: gf - ga,
  };
}

const hit = (key: string, r: TeamResult) => resultFilter(key).hit(r);

console.log('\nPer-game predicates');
check('BTTS hits when both scored', hit('btts', g(2, 1)) && !hit('btts', g(1, 0)));
check('BTTS No is the inverse', hit('btts_no', g(1, 0)) && !hit('btts_no', g(1, 1)));
check('Win / Draw / Loss by outcome', hit('win', g(2, 0)) && hit('draw', g(1, 1)) && hit('loss', g(0, 2)));
check('Over 1.5 / 2.5 / 3.5 by total goals', hit('over15', g(1, 1)) && hit('over25', g(2, 1)) && hit('over35', g(2, 2)) && !hit('over35', g(2, 1)));
check('Under 2.5 at two goals, Under 1.5 at one', hit('under25', g(1, 1)) && !hit('under25', g(2, 1)) && hit('under15', g(1, 0)));
check('Scored / Failed to score', hit('scored', g(1, 0)) && hit('fts', g(0, 1)) && !hit('fts', g(1, 0)));
check('Clean sheet / Conceded', hit('cs', g(2, 0)) && !hit('cs', g(2, 1)) && hit('conceded', g(0, 1)));

console.log('\nWindowed rate');
{
  id = 0;
  // newest-first: BTTS, no, BTTS  (2 of 3)
  const results = [g(2, 1), g(0, 0), g(1, 1)];
  const all = recentResultStat(results, 'btts', 10);
  check('BTTS landed in 2 of the last 3', all.hits === 2 && all.games === 3 && all.rate === 67, JSON.stringify(all));
  const two = recentResultStat(results, 'btts', 2);
  check('window slices to the newest N', two.games === 2 && two.hits === 1 && two.rate === 50, JSON.stringify(two));
  check('empty results give a zero rate', recentResultStat([], 'btts', 5).rate === 0);
}

console.log('\nCatalogue');
check('windows are 3/5/8/10/15/20', JSON.stringify(LAST_RESULT_WINDOWS) === JSON.stringify([3, 5, 8, 10, 15, 20]));
check('an unknown key falls back to the first filter', resultFilter('nope').key === RESULT_FILTERS[0].key);
check('14 result types are offered', RESULT_FILTERS.length === 14);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) throw new Error(`${failed} last-results checks failed`);
