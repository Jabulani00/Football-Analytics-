/**
 * Form + child beater PPG labels, red child beater, Umnqumi wehlathi.
 * Run: npx tsx scripts/formChildBeater.test.ts
 */
import type { SeasonMatch } from '../utils/bhozomaEngine';
import {
  formChildBand,
  formChildTable,
  isRedChildBeater,
  umshayiWezingane,
  type FormChildSide,
} from '../utils/formChildBeater';
import type { StandingLike } from '../utils/motivationEngine';

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function side(
  label: string,
  teamId: number,
  colour: FormChildSide['colour'],
  points: number,
  mp: number,
): FormChildSide {
  return {
    label,
    teamId,
    colour,
    rank: teamId,
    table: {
      mp,
      won: 0,
      drawn: 0,
      lost: 0,
      points,
      ppg: mp > 0 ? points / mp : null,
    },
  };
}

const TABLE: StandingLike[] = [
  { rank: 1, teamId: 1, name: 'Alpha', points: 40, played: 20, zone: 'top' },
  { rank: 2, teamId: 2, name: 'Bravo', points: 35, played: 20, zone: 'top' },
  { rank: 3, teamId: 3, name: 'Charlie', points: 30, played: 20, zone: 'mid' },
  { rank: 4, teamId: 4, name: 'Delta', points: 16, played: 10, zone: 'bottom' },
  { rank: 5, teamId: 5, name: 'Echo', points: 22, played: 20, zone: 'bottom' },
  { rank: 6, teamId: 6, name: 'Foxtrot', points: 15, played: 20, zone: 'bottom' },
];

console.log('\ncolour bands');
{
  check('green 0.7 bad', formChildBand(0.7, 'green') === 'bad');
  check('green 0.8 good', formChildBand(0.8, 'green') === 'good');
  check('green 1.2 good', formChildBand(1.2, 'green') === 'good');
  check('green 1.3 great', formChildBand(1.3, 'green') === 'great');
  check('green 3 great', formChildBand(3, 'green') === 'great');

  check('yellow 0.9 bad', formChildBand(0.9, 'yellow') === 'bad');
  check('yellow 1.0 mild', formChildBand(1.0, 'yellow') === 'mild');
  check('yellow 1.4 mild', formChildBand(1.4, 'yellow') === 'mild');
  check('yellow 1.5 good', formChildBand(1.5, 'yellow') === 'good');
  check('yellow 1.7 good', formChildBand(1.7, 'yellow') === 'good');
  check('yellow 1.8 great', formChildBand(1.8, 'yellow') === 'great');

  check('red 1.0 bad', formChildBand(1.0, 'red') === 'bad');
  check('red 1.1 mild', formChildBand(1.1, 'red') === 'mild');
  check('red 1.4 mild', formChildBand(1.4, 'red') === 'mild');
  check('red 1.5 good', formChildBand(1.5, 'red') === 'good');
  check('red 1.7 good', formChildBand(1.7, 'red') === 'good');
  check('red 1.8 great', formChildBand(1.8, 'red') === 'great');
}

console.log('\nchild beater');
{
  check('red 1.5 is child beater', isRedChildBeater(1.5, 'red'));
  check('red 1.7 is child beater', isRedChildBeater(1.7, 'red'));
  check('red 1.6 is child beater', isRedChildBeater(1.6, 'red'));
  check('red 1.49 is not', !isRedChildBeater(1.49, 'red'));
  check('red 1.8 is not', !isRedChildBeater(1.8, 'red'));
  check('yellow 1.6 is not', !isRedChildBeater(1.6, 'yellow'));
  check('green 1.6 is not', !isRedChildBeater(1.6, 'green'));
  check('red 1.6 is Umshayi wezingane', umshayiWezingane(1.6, 'red') === 'Umshayi wezingane');
  check('red 1.2 is not a child beater', umshayiWezingane(1.2, 'red') === 'Not a child beater');
  check('red 2.0 is not a child beater', umshayiWezingane(2.0, 'red') === 'Not a child beater');
  check('yellow is not judged', umshayiWezingane(1.6, 'yellow') == null);
}

console.log('\ntable rows');
{
  const rows = formChildTable({
    t1: side('T1 (Delta)', 4, 'red', 16, 10),
    t2: side('T2 (Charlie)', 3, 'yellow', 18, 20),
    standings: TABLE,
    matches: [
      { homeId: 3, awayId: 5, homeGoals: 2, awayGoals: 0, unix: 1 },
      { homeId: 3, awayId: 6, homeGoals: 1, awayGoals: 0, unix: 2 },
      { homeId: 5, awayId: 3, homeGoals: 0, awayGoals: 1, unix: 3 },
    ],
    competitionId: 999999,
    group: 'table',
    venue: 'overall',
  });
  const red = rows[0];
  const yellow = rows[1];
  check('red table PPG 1.6', red.ppg === 1.6, `ppg=${red.ppg}`);
  check('red table label Good', red.bandLabel === 'Good');
  check('red table is Umshayi wezingane', red.umshayi === 'Umshayi wezingane');
  check('yellow table is not judged for child beater', yellow.umshayi == null);
  check('yellow 0.9 is Bad', yellow.band === 'bad', `band=${yellow.band}`);
  check(
    'yellow vs below is Umnqumi wehlathi',
    yellow.bhozoma === 'Umnqumi wehlathi',
    `bhozoma=${yellow.bhozoma}`,
  );
  check('red is not umnqumi', red.bhozoma == null);
}

console.log('\nfull time home and 1st half');
{
  const matches: SeasonMatch[] = [
    { homeId: 4, awayId: 5, homeGoals: 2, awayGoals: 0, homeGoalsHt: 1, awayGoalsHt: 0, unix: 10 },
    { homeId: 4, awayId: 6, homeGoals: 1, awayGoals: 1, homeGoalsHt: 0, awayGoalsHt: 0, unix: 11 },
    { homeId: 1, awayId: 4, homeGoals: 3, awayGoals: 0, homeGoalsHt: 2, awayGoalsHt: 0, unix: 12 },
    { homeId: 4, awayId: 3, homeGoals: 0, awayGoals: 1, homeGoalsHt: 0, awayGoalsHt: 1, unix: 99 },
  ];
  const home = formChildTable({
    t1: side('T1 (Delta)', 4, 'red', 10, 10),
    t2: side('T2 (Alpha)', 1, 'green', 40, 20),
    standings: TABLE,
    matches,
    competitionId: 999999,
    group: 'ft',
    venue: 'home',
    exclude: { unix: 99, homeId: 4, awayId: 3 },
  });
  check('home MP ignores this fixture and away games', home[0].mp === 2, `mp=${home[0].mp}`);
  check('home points 4', home[0].points === 4, `pts=${home[0].points}`);
  check(
    'home PPG 2.0 is Great and not a child beater',
    home[0].band === 'great' && home[0].umshayi === 'Not a child beater',
  );

  const first = formChildTable({
    t1: side('T1 (Delta)', 4, 'red', 10, 10),
    t2: side('T2 (Alpha)', 1, 'green', 40, 20),
    standings: TABLE,
    matches,
    competitionId: 999999,
    group: '1h',
    venue: 'overall',
    exclude: { unix: 99, homeId: 4, awayId: 3 },
  });
  check('1st half MP is 3', first[0].mp === 3, `mp=${first[0].mp}`);
  check('1st half points 4', first[0].points === 4, `pts=${first[0].points}`);

  const second = formChildTable({
    t1: side('T1 (Delta)', 4, 'red', 10, 10),
    t2: side('T2 (Alpha)', 1, 'green', 40, 20),
    standings: TABLE,
    matches: [
      ...matches,
      { homeId: 4, awayId: 2, homeGoals: 3, awayGoals: 1, homeGoalsHt: 0, awayGoalsHt: 1, unix: 13 },
    ],
    competitionId: 999999,
    group: '2h',
    venue: 'overall',
    exclude: { unix: 99, homeId: 4, awayId: 3 },
  });
  check('2nd half MP is 4', second[0].mp === 4, `mp=${second[0].mp}`);
  check('2nd half counts goals after half time', second[0].points === 7, `pts=${second[0].points}`);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
