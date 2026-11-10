/**
 * Single call · by the numbers — proves a Single stat call drives the numeric
 * Stat filter (percentages / PPG) with a ≥/≤ threshold, surfacing teams with
 * their actual value (not a grade). This is what separates a Single from a Peg.
 */
import { getDimension, type LeagueBundle } from '../utils/strategyBuilder';
import type { TeamStatRow, TeamStatsExport } from '../types/data';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { console.log(`  ✓ ${name}`); passed += 1; }
  else { console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); failed += 1; }
}

const sf = getDimension('statfilter')!;
function row(name: string, id: number, fields: Record<string, number>): TeamStatRow {
  return { team_name: name, team_id: id, league_id: '1', season: '2024', sample_size: 12, ...fields } as TeamStatRow;
}

const stats: TeamStatsExport = {
  meta: { tables: 2, statsPerTable: 1 },
  tables: {
    // Home BTTS: Alpha 70%, Bravo 15%.
    ordinary_ft_home: [row('Alpha', 1, { btts_yes: 70 }), row('Bravo', 2, { btts_yes: 15 })],
    // PPG (0–3): Alpha 2.4, Bravo 0.9.
    ppg_ft_overall: [row('Alpha', 1, { ppg: 2.4 }), row('Bravo', 2, { ppg: 0.9 })],
  },
};
const bundle: LeagueBundle = { competition: 'Test League', stats };

console.log('\nSingle · percentage threshold (Home BTTS ≥ 20%)');
{
  const evals = sf.evaluate(bundle, { period: 'home', methodId: 'btts_yes', options: { family: 'ordinary', window: 'season', mode: 'limit', cmp: 'gte', value: '20' } });
  const alpha = evals.find((e) => e.team === 'Alpha');
  check('Alpha (70%) clears the 20% threshold', alpha != null && alpha.qualifies, String(evals.length));
  check('its reading shows the number, not a grade', alpha?.valueText === '70%', alpha?.valueText);
  check('Bravo (15%) is filtered out below 20%', !evals.some((e) => e.team === 'Bravo'));
}

console.log('\nSingle · PPG threshold (PPG ≥ 2.0, 0–3 scale)');
{
  const evals = sf.evaluate(bundle, { period: 'overall', methodId: 'ppg', options: { family: 'ppg', window: 'season', mode: 'limit', cmp: 'gte', value: '2.0' } });
  const alpha = evals.find((e) => e.team === 'Alpha');
  check('Alpha (2.4 PPG) qualifies', alpha != null && alpha.qualifies, String(evals.length));
  check('its value carries the average number', alpha?.value === 2.4, String(alpha?.value));
  check('Bravo (0.9 PPG) is below the threshold', !evals.some((e) => e.team === 'Bravo'));
}

console.log('\nSingle · ≤ threshold also works');
{
  const evals = sf.evaluate(bundle, { period: 'home', methodId: 'btts_yes', options: { family: 'ordinary', window: 'season', mode: 'limit', cmp: 'lte', value: '20' } });
  check('≤ 20% surfaces the low team (Bravo), not Alpha', evals.some((e) => e.team === 'Bravo') && !evals.some((e) => e.team === 'Alpha'));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) throw new Error(`${failed} single-call checks failed`);
