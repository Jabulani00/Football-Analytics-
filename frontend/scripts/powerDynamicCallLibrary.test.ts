/**
 * Power-dynamics results are scored from a saved league copy.
 * Run: npx tsx scripts/powerDynamicCallLibrary.test.ts
 */
import { parseSavedPowerDynamicLibrary } from '../utils/powerDynamicLibraryDisk';
import { scorePowerDynamicPacks, type PowerDynamicLeaguePack } from '../utils/powerDynamicLibraryScore';
import type { CallTableRow } from '../utils/powerDynamicCallSearch';

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  ok  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function pack(fixtures: PowerDynamicLeaguePack['fixtures']): PowerDynamicLeaguePack {
  const table: CallTableRow[] = [
    { rank: 1, teamId: 1, name: 'Top', played: 10, points: 30, homePoints: 24, awayPoints: 6, zone: 'top' },
    { rank: 2, teamId: 2, name: 'Next', played: 10, points: 20, homePoints: 10, awayPoints: 10, zone: 'top' },
    { rank: 3, teamId: 3, name: 'Low', played: 10, points: 4, homePoints: 1, awayPoints: 3, zone: 'bottom' },
  ];
  return {
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
    fixtures,
  };
}

const day = '2026-10-28';
const saved = pack([
  { id: 11, homeId: 1, awayId: 3, homeName: 'Top', awayName: 'Low', unix: 1_700_000_000, dateKey: day },
  { id: 12, homeId: 3, awayId: 3, homeName: 'Low', awayName: 'Low', unix: 1_700_000_100, dateKey: day },
]);

console.log('\nsaved league copy');
{
  const first = scorePowerDynamicPacks([saved], ['colour-green'], day);
  const second = scorePowerDynamicPacks([saved], ['colour-green', 'venue-home'], day);
  check('best green fit is first', first[0]?.fixtureId === 11 && first[0].percent === 100);
  check('the result names its in-option', first[0]?.aspectLabel === 'Green table');
  check('another day is empty without fetching', scorePowerDynamicPacks([saved], ['colour-green'], '2026-10-29').length === 0);
  check('a second in-option is scored from the same copy', second.some((hit) => hit.aspectLabel === 'Home strong'));
  check('closest fits stay above weaker ones', second[0].percent >= second[second.length - 1].percent);
}

console.log('\nbrowser copy');
{
  const restored = parseSavedPowerDynamicLibrary({
    version: 1,
    days: [day],
    packs: [
      {
        seasonId: 9,
        competitionId: 4,
        competitionType: 'League',
        seasonName: '2026',
        name: 'League',
        country: 'ZA',
        standings: [{ rank: 1, teamId: 1, name: 'Top', played: 10, points: 30, zone: 'top' }],
        table: saved.table,
        matches: [],
        schedule: [],
        fixtures: saved.fixtures,
      },
    ],
  });
  check('a saved copy opens without the server', restored?.packs.length === 1 && restored.packs[0].byTeam.get(1)?.name === 'Top');
  check('the saved fixture is still on that copy', restored?.packs[0].fixtures[0]?.id === 11);
  check('a broken copy is ignored', parseSavedPowerDynamicLibrary({ version: 1, days: [], packs: [] }) == null);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
