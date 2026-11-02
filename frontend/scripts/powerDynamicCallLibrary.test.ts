/**
 * Power-dynamics results are scored from a saved league copy.
 * Run: npx tsx scripts/powerDynamicCallLibrary.test.ts
 */
import { parseSavedPowerDynamicLibrary } from '../utils/powerDynamicLibraryDisk';
import { POWER_DYNAMIC_CALLS } from '../utils/powerDynamicCalls';
import { callAspectsFor } from '../utils/powerDynamicCallSearch';
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
  const both = scorePowerDynamicPacks([saved], ['colour-green', 'colour-red'], day);
  check('best green fit is first', first[0]?.fixtureId === 11 && first[0].percent === 100);
  check('the result names its in-option', first[0]?.aspectLabel === 'Green table');
  check('another day is empty without fetching', scorePowerDynamicPacks([saved], ['colour-green'], '2026-10-29').length === 0);
  check('a fixture must hold every selected in-option', both.length === 1 && both[0].fixtureId === 11 && both[0].aspectLabel === 'Green table · Red table');
  check('a fixture that misses one in-option is left out', !both.some((hit) => hit.fixtureId === 12));
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

console.log('\nevery option has in-options');
{
  const takeOver = callAspectsFor('importance_3pts', 'pull_take_over');
  check('importance of 3 lists all 7 take-over kinds', takeOver.filter((item) => item.mark === 'tick').length === 7);
  const push = callAspectsFor('importance_3pts', 'push_dethrone');
  check('importance of 3 lists all 7 dethrone push kinds', push.filter((item) => item.mark === 'tick').length === 7);
  check('importance of 3 lists the escape scores', callAspectsFor('importance_3pts', 'escape').some((item) => item.id.startsWith('escape-10')));
  const separators = callAspectsFor('importance_3pts', 'separator').filter((item) => item.mark === 'tick').map((item) => item.label);
  check('importance of 3 lists the three separators', separators.join(' · ') === 'Clear separation · Mediocre separation · Poor separation');
  const changes = callAspectsFor('last5', 'label_change').filter((item) => item.mark === 'tick').map((item) => item.label);
  check('each positive change code is its own in-option', changes.includes('Positive · A1 · 5 positives, 0 negatives') && changes.includes('Positive · D3 · 2 positives, 1 negative'));
  check('each negative change code is separate', changes.includes('Negative · A1 · 5 negatives, 0 positives') && changes.includes('Negative · B2 · 4 negatives, 1 positive'));
  check('no change and cancel are their own in-options', changes.includes('No change · G1 · No positive or negative changes') && changes.includes('Cancel · F1 · 2 positives and 2 negatives cancel') && changes.includes('Cancel · F2 · 1 positive and 1 negative cancel'));
  const homeAway = callAspectsFor('home_away_strong', 'read').map((item) => item.label);
  check('home/away strong drops the never-beaten calls', !homeAway.some((label) => label.includes('never been beaten')));
  check('h2h lists never beaten at home', callAspectsFor('h2h', 'home').some((item) => item.label === 'has never been beaten at home'));
  check('h2h lists never beaten away', callAspectsFor('h2h', 'away').some((item) => item.label === 'has never been beaten away'));
  const zidane = callAspectsFor('baseline', 'zidane_law').map((item) => item.label);
  check('zidane lists both never-beaten calls', zidane.includes('has never been beaten at home') && zidane.includes('has never been beaten away') && zidane.includes('T1 has never beaten T2'));
  const homeFirst = callAspectsFor('form_child_beater', 'home_1h');
  const awaySecond = callAspectsFor('form_child_beater', 'away_2h');
  const overallHalf = callAspectsFor('form_child_beater', 'overall_1h');
  check('home, away, and overall halves are callable', homeFirst.some((item) => item.label === 'Great') && awaySecond.some((item) => item.label === 'Umshayi wezingane') && overallHalf.some((item) => item.label === 'Good'));
  const childOrder = callAspectsFor('form_child_beater', 'overall_ft').filter((item) => item.mark !== 'wrong').map((item) => item.label);
  const umshayiAt = childOrder.indexOf('Umshayi wezingane');
  check('bhozoma follows umshayi wezingane', umshayiAt >= 0 && childOrder[umshayiAt + 1] === 'Bhozoma');
  const missing = POWER_DYNAMIC_CALLS.flatMap((sector) =>
    sector.functions.filter((option) => callAspectsFor(sector.id, option.id).length === 0).map((option) => `${sector.name} · ${option.label}`),
  );
  check('every sector option has in-options', missing.length === 0, missing.join(', '));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
