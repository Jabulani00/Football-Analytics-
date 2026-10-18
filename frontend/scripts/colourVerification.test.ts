/**
 * Colour verification ranks our figure against each colour.
 * Run: npx tsx scripts/colourVerification.test.ts
 */
import {
  COLOUR_STAT_CATALOGUE,
  colourStatById,
  countMatchesAgainstColour,
  passesColourPosition,
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

const stat = colourStatById('ordinary_ft_overall::w_pct');
const rates = stat ? ratesAgainstColours(1, stat, standings, matches) : [];
const byColour = Object.fromEntries(rates.map((row) => [row.colour, row]));
check('win rate is 50 against red, 100 against yellow, 0 against green', byColour.red?.value === 50 && byColour.yellow?.value === 100 && byColour.green?.value === 0);
check('highest percentage is position 1 and the lowest is position 3', byColour.yellow?.position === 1 && byColour.red?.position === 2 && byColour.green?.position === 3);
check('each colour keeps its own match count', byColour.red?.played === 2 && byColour.yellow?.played === 1 && byColour.green?.played === 1);

const tied = ratesAgainstColours(1, { key: 'd_pct', table: 'ordinary_ft_overall' }, [
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

check('up passes only at 1 and 2', passesColourPosition(1, 'up') && passesColourPosition(2, 'up') && !passesColourPosition(3, 'up'));
check('down passes only at 2 and 3', !passesColourPosition(1, 'down') && passesColourPosition(2, 'down') && passesColourPosition(3, 'down'));

const ids = COLOUR_STAT_CATALOGUE.map((item) => item.id);
check('catalogue ids are unique', new Set(ids).size === ids.length);
check('ordinary full-time over 2.5 is listed', colourStatById('ordinary_ft_overall::over25')?.label === 'Ordinary · Full time · Over 2.5');
check('ppg, series, full-time patterns and half stats are listed', ['ppg_ft_overall::ppg', 'series_ft_overall::w', 'ft_only_ft_overall::won_both_halves', 'ft_only_ht_overall::half_nil'].every((id) => colourStatById(id) != null));
check('stats the feed cannot measure are left out', colourStatById('ordinary_ft_overall::handicap') == null);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
