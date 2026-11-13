/**
 * Child strategies — a saved strategy's qualifying teams (strategyTeamKeys) used
 * to restrict a child built on different stats. Also the kind / child labelling.
 */
import { strategyTeamKeys, describeStrategy, evaluateStrategy, teamKeyOf, type Condition, type LeagueBundle, type SavedStrategyConfig } from '../utils/strategyBuilder';
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
// Alpha: BTTS 70 / Over2.5 70. Bravo: BTTS 30 / Over2.5 80. Charlie: BTTS 80 / Over2.5 20.
const stats: TeamStatsExport = {
  meta: { tables: 1, statsPerTable: 2 },
  tables: {
    ordinary_ft_overall: [row('Alpha', 1, { btts_yes: 70, over25: 70 }), row('Bravo', 2, { btts_yes: 30, over25: 80 }), row('Charlie', 3, { btts_yes: 80, over25: 20 })],
  },
};
const bundles: LeagueBundle[] = [{ competition: 'Test League', stats }];
const sf = (methodId: string, value: number): Condition => ({ id: methodId, dimensionId: 'statfilter', period: 'overall', methodId, options: { family: 'ordinary', window: 'season', mode: 'limit', level: 'all', cmp: 'gte', value: String(value) }, side: 'either' });

console.log('\nParent team keys');
{
  const parent: SavedStrategyConfig = { conditions: [sf('btts_yes', 50)], logic: 'and', resultMode: 'teams', kind: 'single' };
  const keys = strategyTeamKeys(bundles, parent);
  check('parent (BTTS ≥ 50%) surfaces Alpha & Charlie', keys.has(`Test League::${teamKeyOf({ teamId: 1, team: 'Alpha' })}`) && keys.has(`Test League::${teamKeyOf({ teamId: 3, team: 'Charlie' })}`), String(keys.size));
  check('Bravo (BTTS 30%) is not in the parent set', !keys.has(`Test League::${teamKeyOf({ teamId: 2, team: 'Bravo' })}`));
}

console.log('\nChild restricted to the parent');
{
  const parentKeys = strategyTeamKeys(bundles, { conditions: [sf('btts_yes', 50)], logic: 'and', resultMode: 'teams' });
  // Child: Over 2.5 ≥ 50% → Alpha(70) & Bravo(80). Intersect with parent (Alpha, Charlie) → only Alpha.
  const childResults = evaluateStrategy(bundles, [sf('over25', 50)], 'and')
    .filter((r) => parentKeys.has(`${r.competition}::${teamKeyOf({ teamId: r.teamId, team: r.team })}`));
  const teams = childResults.map((r) => r.team);
  check('child (Over 2.5 ≥ 50%) ∩ parent = only Alpha', teams.length === 1 && teams[0] === 'Alpha', teams.join(','));
  check('Bravo meets the child but not the parent, so is excluded', !teams.includes('Bravo'));
  check('Charlie meets the parent but not the child, so is excluded', !teams.includes('Charlie'));
}

console.log('\nLabelling');
{
  check('a single config reads "Single ·"', describeStrategy({ conditions: [sf('btts_yes', 20)], logic: 'and', resultMode: 'teams', kind: 'single' }).startsWith('Single · '));
  check('a child config reads "Child strategy ·"', describeStrategy({ conditions: [sf('over25', 50)], logic: 'and', resultMode: 'teams', kind: 'single', parentId: 'p1' }).startsWith('Child strategy · '));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) throw new Error(`${failed} child-strategy checks failed`);
