import type { CountedGame } from '../utils/countedGames';
import { halfGoalShares, secondHalfLeagueRates, secondHalfTeamRates } from '../utils/mixedStats';

const games: CountedGame[] = [
  { id: 1, unix: 2, match: 'A vs B', score: '3-1', detail: '', htKnown: true, ftFor: 3, ftAgainst: 1, htFor: 1, htAgainst: 0 },
  { id: 2, unix: 1, match: 'A vs C', score: '2-2', detail: '', htKnown: true, ftFor: 2, ftAgainst: 2, htFor: 1, htAgainst: 1 },
  { id: 3, unix: 0, match: 'A vs D', score: '1-0', detail: '', htKnown: false, ftFor: 1, ftAgainst: 0, htFor: null, htAgainst: null },
];
let failed = 0;
function check(name: string, actual: number | null, expected: number | null) {
  if (actual === expected) console.log(`✓ ${name}`);
  else { failed += 1; console.error(`✗ ${name}: got ${actual}, expected ${expected}`); }
}

const shares = halfGoalShares(games);
check('first-half scored share uses goals, not match frequency', shares.scFirst, 40);
check('second-half scored share complements to 100%', shares.scSecond, 60);
check('first-half conceded share uses conceded-goal total', shares.concFirst, 33.3);
check('second-half conceded share complements to 100%', shares.concSecond, 66.7);
check('first-half total-goal share uses one common sample', shares.avgFirst, 37.5);
check('second-half total-goal share complements to 100%', shares.avgSecond, 62.5);
check('invalid half score is excluded from every split', shares.matches, 2);

const team = secondHalfTeamRates(games);
check('second-half team goals per valid match', team.teamAverage, 1.5);
check('second-half team scoring consistency', team.teamConsistency, 100);
check('second-half team sample excludes missing half score', team.matches, 2);

const league = secondHalfLeagueRates([...games, { ...games[0], ftFor: 1, ftAgainst: 3, htFor: 0, htAgainst: 1 }]);
check('league second-half goals deduplicate fixtures and average match totals', league.leagueAverage, 2.5);
check('league second-half consistency counts scored fixtures', league.leagueConsistency, 100);
check('league second-half sample deduplicates fixtures', league.matches, 2);
check('zero-goal denominator returns blank shares', halfGoalShares([{ ...games[0], ftFor: 0, ftAgainst: 0, htFor: 0, htAgainst: 0 }]).scFirst, null);

if (failed) throw new Error(`${failed} mixed-stat checks failed`);
console.log('\n14 mixed-stat checks passed');
