import { analyzeTeamGames, countTeamHomeAwayGames, dominanceIndex } from '../utils/gapAnalytics';
import type { RawFixture } from '../services/oddAlerts';

function fixture(id: number, home: string, away: string, status: string, homeId: number, awayId: number): RawFixture {
  return {
    id,
    home_name: home,
    away_name: away,
    home_id: homeId,
    away_id: awayId,
    competition_id: 1,
    competition_country: 'Test',
    competition_name: 'Test League',
    competition_type: 'League',
    competition_predictability: null,
    season: '2026',
    status,
    home_goals: status === 'FT' ? 1 : null,
    away_goals: status === 'FT' ? 0 : null,
    ht_score: null,
    elapsed: null,
    elapsed_seconds: null,
    time_added: null,
    home_position: null,
    away_position: null,
    unix: id,
    has_odds: false,
    is_friendly: false,
    is_cup: false,
    date: '2026-01-01',
    ko_human: '',
  } as RawFixture;
}

const fixtures = [
  fixture(1, 'Alpha', 'Beta', 'FT', 10, 20),
  fixture(2, 'Beta', 'Alpha', 'FT', 20, 10),
  fixture(3, 'Alpha', 'Beta', 'FT', 10, 20),
  fixture(4, 'Alpha', 'Beta', 'NS', 10, 20),
  fixture(1, 'Alpha', 'Beta', 'FT', 10, 20), // Duplicate fixture IDs are ignored.
  fixture(2, 'Beta', 'Alpha', 'FT', 20, 10),
];
const counts = countTeamHomeAwayGames(fixtures);
const alpha = counts.find((row) => row.team === 'Alpha');
const beta = counts.find((row) => row.team === 'Beta');
if (counts.length !== 2 || alpha?.home !== 2 || alpha.away !== 1 || beta?.home !== 1 || beta.away !== 2) {
  throw new Error(`Only unique completed fixtures should count by team and side: ${JSON.stringify(counts)}`);
}
const alphaGap = Math.abs((alpha?.home ?? 0) - (alpha?.away ?? 0));
if (alphaGap !== 1) throw new Error(`Alpha's Home/Away Gap should be one game: ${alphaGap}`);
console.log('✓ Gap Analytics counts unique completed matches and calculates the team gap.');

const scoredAtHome = analyzeTeamGames(fixtures, 'fulltime', 'win').find((row) => row.team === 'Alpha');
if (scoredAtHome?.home.games !== 2 || scoredAtHome.home.hits !== 2 || scoredAtHome.home.percent !== 100 || scoredAtHome.overall.games !== 3) {
  throw new Error(`Selected-stat home/overall counts and rate should be accurate: ${JSON.stringify(scoredAtHome)}`);
}
const halves = [
  { ...fixture(11, 'Alpha', 'Beta', 'FT', 10, 20), home_goals: 2, away_goals: 1, ht_score: '1-1' },
  { ...fixture(12, 'Alpha', 'Beta', 'FT', 10, 20), home_goals: 1, away_goals: 0, ht_score: null },
];
const firstHalf = analyzeTeamGames(halves, 'firsthalf', 'draw').find((row) => row.team === 'Alpha');
const secondHalf = analyzeTeamGames(halves, 'secondhalf', 'win').find((row) => row.team === 'Alpha');
if (firstHalf?.home.games !== 1 || firstHalf.home.hits !== 1 || secondHalf?.home.games !== 1 || secondHalf.home.hits !== 1) {
  throw new Error(`Half stats should count only matches with valid HT scores: ${JSON.stringify({ firstHalf, secondHalf })}`);
}
console.log('✓ Gap Analytics calculates selected-stat counts, percentages and valid half samples.');

const allWinsHome = { games: 4, hits: 4, percent: 100 };
const noAwayWins = { games: 4, hits: 0, percent: 0 };
const fewGames = { games: 3, hits: 3, percent: 100 };
const noLosses = { games: 4, hits: 0, percent: 0 };
const insufficientHome = { games: 3, hits: 3, percent: 100 };
const awayFive = { games: 5, hits: 5, percent: 100 };
if (dominanceIndex('win', allWinsHome, allWinsHome) !== 100 || dominanceIndex('win', allWinsHome, noAwayWins) !== 50 || dominanceIndex('win', allWinsHome, noAwayWins, 'home') !== 100 || dominanceIndex('win', allWinsHome, noAwayWins, 'away') !== 0 || dominanceIndex('loss', noLosses, noLosses) !== 100 || dominanceIndex('win', fewGames, allWinsHome) !== null || dominanceIndex('win', insufficientHome, awayFive) !== null) {
  throw new Error('Dominance Index should equally weight home/away rates, invert losses and require at least 8 total and 4 per venue.');
}
console.log('✓ Dominance Index weights both venues equally, rewards fewer losses and enforces the game minimums.');
