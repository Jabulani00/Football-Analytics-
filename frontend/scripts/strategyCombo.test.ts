/**
 * Combo — one strategy mixing a graded rule (grading1) and a numeric rule
 * (statfilter ≥ threshold). Proves evaluateStrategy intersects conditions of
 * different dimensions, so a Single-style numeric call and a Peg-style graded
 * call combine in one AND strategy.
 */
import { evaluateStrategy, type Condition, type LeagueBundle } from '../utils/strategyBuilder';
import type { TeamStatRow, TeamStatsExport } from '../types/data';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { console.log(`  ✓ ${name}`); passed += 1; }
  else { console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); failed += 1; }
}

function row(name: string, id: number, sc: number, btts: number): TeamStatRow {
  return { team_name: name, team_id: id, league_id: '1', season: '2024', sc_pct: sc, btts_yes: btts, sample_size: 10 } as TeamStatRow;
}

// Alpha & Bravo grade strongly on sc_pct; Charlie is mid. BTTS: Alpha 70, Bravo 30, Charlie 80.
const stats: TeamStatsExport = {
  meta: { tables: 3, statsPerTable: 2 },
  tables: {
    ordinary_ft_overall: [row('Alpha', 1, 90, 70), row('Bravo', 2, 88, 30), row('Charlie', 3, 85, 80)],
    ordinary_ft_home: [row('Alpha', 1, 85, 68), row('Bravo', 2, 82, 28), row('Charlie', 3, 86, 82)],
    league_avg_ft_overall: [row('League', 0, 50, 50)],
  },
};
const bundle: LeagueBundle = { competition: 'Test League', stats };

const graded: Condition = { id: 'g1', dimensionId: 'grading1', period: 'overall', methodId: 'sc_pct', options: { show: 'all' }, side: 'either' };
const numeric: Condition = { id: 's1', dimensionId: 'statfilter', period: 'overall', methodId: 'btts_yes', options: { family: 'ordinary', window: 'season', mode: 'limit', level: 'all', cmp: 'gte', value: '50' }, side: 'either' };

console.log('\nCombo · graded AND numeric');
{
  const results = evaluateStrategy([bundle], [graded, numeric], 'and');
  const teams = results.map((r) => r.team).sort();
  check('both dimensions evaluate in one strategy', results.length > 0, String(results.length));
  check('each result carries both conditions (graded + numeric)', results.every((r) => r.conditions.length === 2), JSON.stringify(results.map((r) => r.conditions.length)));
  check('a team graded but under 50% BTTS (Bravo) is excluded', !teams.includes('Bravo'), teams.join(','));
  check('a team that satisfies both (Alpha) qualifies', teams.includes('Alpha'), teams.join(','));
}

console.log('\nCombo · OR widens the set');
{
  const andSet = evaluateStrategy([bundle], [graded, numeric], 'and').map((r) => r.team);
  const orSet = evaluateStrategy([bundle], [graded, numeric], 'or').map((r) => r.team);
  check('OR returns at least as many teams as AND', orSet.length >= andSet.length, `or ${orSet.length} vs and ${andSet.length}`);
  check('Bravo (graded only) is included under OR', orSet.includes('Bravo'), orSet.join(','));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) throw new Error(`${failed} combo checks failed`);
