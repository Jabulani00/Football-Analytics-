/**
 * Single call · ranked by the numbers. rankSingleStat returns every team's value
 * for one numeric stat, highest first — no grade, no threshold. singleStatFamilies
 * offers only percentage / average stats (no Series run counts).
 */
import { rankSingleStat, singleStatFamilies, type LeagueBundle } from '../utils/strategyBuilder';
import type { TeamStatRow, TeamStatsExport } from '../types/data';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { console.log(`  ✓ ${name}`); passed += 1; }
  else { console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); failed += 1; }
}

function row(name: string, id: number, fields: Record<string, number>): TeamStatRow {
  return { team_name: name, team_id: id, league_id: '1', season: '2024', sample_size: 12, ...fields } as TeamStatRow;
}
const stats: TeamStatsExport = {
  meta: { tables: 2, statsPerTable: 1 },
  tables: {
    ordinary_ft_overall: [row('Alpha', 1, { btts_yes: 70 }), row('Bravo', 2, { btts_yes: 40 }), row('Charlie', 3, { btts_yes: 90 })],
    ppg_ft_overall: [row('Alpha', 1, { ppg: 2.4 }), row('Bravo', 2, { ppg: 0.9 }), row('Charlie', 3, { ppg: 1.6 })],
  },
};
const bundles: LeagueBundle[] = [{ competition: 'Test League', stats }];

console.log('\nPercentage stat, ranked high → low');
{
  const rows = rankSingleStat(bundles, { family: 'ordinary', methodId: 'btts_yes', period: 'overall', window: 'season' });
  check('all three teams are ranked', rows.length === 3, String(rows.length));
  check('highest is at the top (Charlie 90%)', rows[0].team === 'Charlie' && rows[0].value === 90, JSON.stringify(rows[0]));
  check('lowest is at the bottom (Bravo 40%)', rows[2].team === 'Bravo' && rows[2].value === 40);
  check('value is shown as a percentage, not a grade', rows[0].valueText === '90%' && rows[0].kind === 'pct', rows[0].valueText);
}

console.log('\nAverage stat (PPG), ranked high → low');
{
  const rows = rankSingleStat(bundles, { family: 'ppg', methodId: 'ppg', period: 'overall', window: 'season' });
  check('order is Alpha 2.4, Charlie 1.6, Bravo 0.9', rows.map((r) => r.team).join(',') === 'Alpha,Charlie,Bravo', rows.map((r) => `${r.team}:${r.value}`).join(' '));
  check('average is shown with two decimals', rows[0].valueText === '2.40' && rows[0].kind === 'avg', rows[0].valueText);
}

console.log('\nCatalogue — numbers only');
{
  const fams = singleStatFamilies();
  check('Series run family is excluded', !fams.some((f) => f.value === 'series'));
  check('Ordinary, PPG, FT-only are offered', ['ordinary', 'ppg', 'ftonly'].every((v) => fams.some((f) => f.value === v)));
  const ord = fams.find((f) => f.value === 'ordinary');
  check('Ordinary exposes its percentage & average stats', (ord?.items.length ?? 0) > 0 && ord!.items.some((i) => i.value === 'btts_yes') && ord!.items.some((i) => i.value === 'sc_avg'));
  check('an unknown stat ranks nothing', rankSingleStat(bundles, { family: 'ordinary', methodId: 'not_a_stat', period: 'overall', window: 'season' }).length === 0);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) throw new Error(`${failed} single-rank checks failed`);
