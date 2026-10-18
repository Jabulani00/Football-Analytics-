import { buildMixedRfs, formatSeriesRfsValue } from '../utils/mixedRfs';
import type { TeamStatsRow } from '../types/analytics';
import type { CountedGame } from '../utils/countedGames';

function game(id: number, unix: number, ftFor: number, ftAgainst: number, htFor: number, htAgainst: number): CountedGame {
  return {
    id,
    unix,
    match: `Team ${id} vs Opponent`,
    score: `${ftFor}-${ftAgainst}`,
    detail: 'League · Home',
    htKnown: true,
    ftFor,
    ftAgainst,
    htFor,
    htAgainst,
    opponentName: 'Opponent',
    isHome: true,
  };
}

function row(team: string, games: CountedGame[]): TeamStatsRow {
  return {
    team,
    played: games.length,
    games,
    metrics: [
      { key: 'over15', label: 'Over 1.5', value: 80, compliance: 'green' },
      { key: 'sc_avg', label: 'SC/m', value: 1.2, compliance: 'green', raw: true },
    ],
  };
}

const sample = [
  game(5, 500, 1, 0, 0, 0), // newest: total goals 1, so Over 1.5 failed
  game(4, 400, 2, 0, 1, 0),
  game(3, 300, 2, 1, 1, 0),
  game(2, 200, 2, 1, 1, 1),
  game(1, 100, 3, 0, 2, 0),
];

const ordinary = row('Team', sample);
const series = row('Team', sample);
const result = buildMixedRfs([ordinary], [series], 'fulltime')[0];
const over15 = result.ordinary.find((entry) => entry.key === 'over15');
if (!over15 || over15.last.score !== '1-0' || over15.rate !== 80 || over15.sample !== 5) {
  throw new Error('RFS must flag a latest Over 1.5 miss when the five-game usual rate is 80%.');
}
const scoring15 = result.ordinary.find((entry) => entry.key === 'scoring_15');
if (!scoring15 || scoring15.last.score !== '1-0' || scoring15.rate !== 80) {
  throw new Error('RFS must flag a team scoring fewer than 2 goals after scoring 2+ in 80% of its five-game sample.');
}

const firstHalf = buildMixedRfs([ordinary], [series], 'firsthalf')[0];
if (firstHalf.ordinary.some((entry) => entry.key === 'over15')) {
  throw new Error('First-half RFS must use the half-time score; the latest match was goalless at half-time.');
}

const secondHalf = buildMixedRfs([ordinary], [series], 'secondhalf')[0];
if (secondHalf.ordinary.some((entry) => entry.key === 'over15')) {
  throw new Error('Second-half RFS must use second-half goals; the latest match had one second-half goal.');
}

const brokenWinRun = row('Team', [
  game(10, 1000, 1, 1, 0, 0),
  game(9, 900, 2, 0, 1, 0),
  game(8, 800, 1, 0, 1, 0),
  game(7, 700, 3, 1, 1, 0),
  game(6, 600, 2, 0, 1, 0),
]);
const brokenWin = buildMixedRfs([brokenWinRun], [brokenWinRun], 'fulltime')[0].series.find((entry) => entry.key === 'w');
const failedStreakCell = formatSeriesRfsValue(0, brokenWin);
if (!brokenWin || brokenWin.run !== 4 || failedStreakCell !== '0 (failed streak: 4)') {
  throw new Error('Series RFS must place the failed streak beside the reset zero in that series cell.');
}

console.log('✓ Mixed RFS uses the newest match, selected period, and existing ordinary thresholds.');
