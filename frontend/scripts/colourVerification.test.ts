/**
 * Colour verification ranks our figure against each colour.
 * Run: npx tsx scripts/colourVerification.test.ts
 */
import {
  COLOUR_STAT_CATALOGUE,
  colourDaLean,
  colourDifferenceDecimals,
  colourPairBetween,
  colourPairDifferences,
  colourStatById,
  countMatchesAgainstColour,
  passesColourPosition,
  rateOnFullTable,
  ratesAgainstColours,
} from '../utils/colourVerification';

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

const standings = [1, 2, 3, 4, 5, 6].map((rank) => ({ teamId: rank, rank }));
const matches = [
  { homeId: 1, awayId: 6, homeGoals: 2, awayGoals: 0, unix: 4 },
  { homeId: 5, awayId: 1, homeGoals: 1, awayGoals: 0, unix: 3 },
  { homeId: 1, awayId: 3, homeGoals: 3, awayGoals: 1, unix: 2 },
  { homeId: 2, awayId: 1, homeGoals: 1, awayGoals: 1, unix: 1 },
  { homeId: 4, awayId: 6, homeGoals: 0, awayGoals: 1, unix: 5 },
];

check('two red opponents count, yellow and green do not', countMatchesAgainstColour(1, 'red', standings, matches) === 2);
check('one green opponent', countMatchesAgainstColour(1, 'green', standings, matches) === 1);
check('a side with no games against that colour is zero', countMatchesAgainstColour(3, 'red', standings, matches) === 0);

const stat = colourStatById('ordinary::w_pct');
const rates = stat ? ratesAgainstColours(1, stat, standings, matches) : [];
const byColour = Object.fromEntries(rates.map((row) => [row.colour, row]));
check('win rate is 50 against red, 100 against yellow, 0 against green', byColour.red?.value === 50 && byColour.yellow?.value === 100 && byColour.green?.value === 0);
check('strong numbers the highest percentage as position 1', byColour.yellow?.position === 1 && byColour.red?.position === 2 && byColour.green?.position === 3);
check('each colour keeps its own match count', byColour.red?.played === 2 && byColour.yellow?.played === 1 && byColour.green?.played === 1);

const weakRates = stat ? ratesAgainstColours(1, stat, standings, matches, 'weak') : [];
const weakByColour = Object.fromEntries(weakRates.map((row) => [row.colour, row]));
check('weak numbers the smallest percentage as position 1 and the highest last', weakByColour.green?.position === 1 && weakByColour.red?.position === 2 && weakByColour.yellow?.position === 3);

const tied = ratesAgainstColours(1, { key: 'd_pct' }, [
  { teamId: 1, rank: 1 },
  { teamId: 2, rank: 2 },
  { teamId: 3, rank: 3 },
], [
  { homeId: 1, awayId: 2, homeGoals: 1, awayGoals: 1, unix: 2 },
  { homeId: 1, awayId: 3, homeGoals: 0, awayGoals: 0, unix: 1 },
]);
const green = tied.find((row) => row.colour === 'green');
const yellow = tied.find((row) => row.colour === 'yellow');
const red = tied.find((row) => row.colour === 'red');
check('equal percentages share position 1', yellow?.position === 1 && red?.position === 1);
check('a colour with no matches is not ranked', green?.value == null && green?.position == null);

check('strong passes only at 1 and 2', passesColourPosition(1, 'strong') && passesColourPosition(2, 'strong') && !passesColourPosition(3, 'strong'));
check('weak passes only at 2 and 3', !passesColourPosition(1, 'weak') && passesColourPosition(2, 'weak') && passesColourPosition(3, 'weak'));

const ids = COLOUR_STAT_CATALOGUE.map((item) => item.id);
check('catalogue ids are unique', new Set(ids).size === ids.length);
check('ordinary over 2.5 is listed once, without a period', colourStatById('ordinary::over25')?.label === 'Ordinary · Over 2.5');
check('ppg, series, full-time patterns and half stats are listed', ['ppg::ppg', 'series::w', 'ft_only::won_both_halves', 'half::half_nil'].every((id) => colourStatById(id) != null));
check('full-time patterns stay on full time and half stats stay on the halves', colourStatById('ft_only::won_both_halves')?.periods.join(',') === 'ft' && colourStatById('half::half_nil')?.periods.join(',') === 'ht,2h');
check('stats the feed cannot measure are left out', colourStatById('ordinary::handicap') == null);

const homeRates = stat ? ratesAgainstColours(1, stat, standings, matches, 'strong', 'home') : [];
const homeByColour = Object.fromEntries(homeRates.map((row) => [row.colour, row]));
check('home keeps only home matches', homeByColour.red?.played === 1 && homeByColour.yellow?.played === 1 && homeByColour.green?.played === 0 && homeByColour.red?.value === 100);
check('home sample against red is one match', countMatchesAgainstColour(1, 'red', standings, matches, 'home') === 1);

const full = stat ? rateOnFullTable(1, stat, matches) : null;
check('full table is the win rate before colours', full?.played === 4 && full?.value === 50);
const fullHome = stat ? rateOnFullTable(1, stat, matches, 'home') : null;
check('full table home is both home wins', fullHome?.played === 2 && fullHome?.value === 100);

const gaps = colourPairDifferences([
  { colour: 'red', value: 50 },
  { colour: 'yellow', value: 100 },
  { colour: 'green', value: 0 },
]);
const gapOf = Object.fromEntries(gaps.map((row) => [row.key, row]));
check('red and green differ by 50', gapOf['red-green']?.difference === 50);
check('yellow and green differ by 100', gapOf['yellow-green']?.difference === 100);
check('red and yellow differ by 50', gapOf['red-yellow']?.difference === 50);
check('the largest gap is the double agent', gapOf['yellow-green']?.isDA === true && gapOf['red-green']?.isDA === false && gapOf['red-yellow']?.isDA === false);
check('yellow is the higher figure on the double agent gap', gapOf['yellow-green']?.higher === 'yellow');

const yellowGreen = colourPairBetween(gaps, 'green', 'yellow');
const redGreen = colourPairBetween(gaps, 'red', 'green');
check('different colours resolve to their pair', yellowGreen?.key === 'yellow-green' && yellowGreen.isDA);
check('an opponent on the higher DA figure is up', colourDaLean(yellowGreen, 'yellow') === 'up');
check('an opponent on the lower DA figure is down', colourDaLean(yellowGreen, 'green') === 'down');
check('a colour outside the pair has no up or down', colourDaLean(yellowGreen, 'red') == null);
check('a smaller pair still marks the higher figure up', colourDaLean(redGreen, 'red') === 'up' && colourDaLean(redGreen, 'green') === 'down');

const underFifty = colourPairDifferences([
  { colour: 'red', value: 40 },
  { colour: 'yellow', value: 35 },
  { colour: 'green', value: 15 },
]);
const underYellowGreen = underFifty.find((row) => row.key === 'yellow-green') ?? null;
const underRedGreen = underFifty.find((row) => row.key === 'red-green') ?? null;
check('a figure under 50 is up when it is higher than the other colour', underYellowGreen?.higher === 'yellow' && colourDaLean(underYellowGreen, 'yellow') === 'up');
check('the lower figure is down when both colours are under 50', colourDaLean(underYellowGreen, 'green') === 'down' && colourDaLean(underRedGreen, 'red') === 'up' && colourDaLean(underRedGreen, 'green') === 'down');
check('a smaller colour pair is not the double agent', redGreen?.key === 'red-green' && redGreen.isDA === false);
check('the same colour has no pair to test', colourPairBetween(gaps, 'red', 'red') == null);
check('a missing colour has no pair to test', colourPairBetween(gaps, 'red', null) == null);

const tiedGaps = colourPairDifferences([
  { colour: 'red', value: 40 },
  { colour: 'yellow', value: 40 },
  { colour: 'green', value: 0 },
]);
check('equal largest gaps are all double agents', tiedGaps.filter((row) => row.isDA).map((row) => row.key).sort().join(',') === 'red-green,yellow-green');
const level = colourPairDifferences([
  { colour: 'red', value: 50 },
  { colour: 'yellow', value: 50 },
  { colour: 'green', value: 50 },
]);
const levelPair = level.find((row) => row.key === 'red-green') ?? null;
check('equal figures on a DA pair have no up or down', levelPair?.isDA === true && levelPair.higher == null && colourDaLean(levelPair, 'red') == null);

const partial = colourPairDifferences([
  { colour: 'red', value: 80 },
  { colour: 'yellow', value: 20 },
  { colour: 'green', value: null },
]);
const partialOf = Object.fromEntries(partial.map((row) => [row.key, row]));
check('a pair with a missing figure is left out of the largest gap', partialOf['red-green']?.difference == null && partialOf['yellow-green']?.difference == null && partialOf['red-yellow']?.isDA === true);

const ppg = colourStatById('ppg::ppg');
check('ppg gaps keep two decimals and percentage gaps keep one', ppg != null && colourDifferenceDecimals(ppg) === 2 && stat != null && colourDifferenceDecimals(stat) === 1);
const rounded = colourPairDifferences([
  { colour: 'red', value: 10.04 },
  { colour: 'yellow', value: 0 },
  { colour: 'green', value: 0.06 },
], 1);
const roundedOf = Object.fromEntries(rounded.map((row) => [row.key, row]));
check('gaps round to the shown decimals before the largest is chosen', roundedOf['red-green']?.difference === 10 && roundedOf['red-yellow']?.difference === 10 && roundedOf['red-green']?.isDA === true && roundedOf['red-yellow']?.isDA === true && roundedOf['yellow-green']?.isDA === false);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
