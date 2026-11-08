/**
 * Strategy Builder — composite analyses folded into the Rule.
 *
 * Characters / Opposite / Omit are whole analyses, not single columns, so the
 * Rule exposes each as a callable stat (ch: / op: / om:) that DELEGATES to its
 * existing engine. These checks prove the Rule routes to the same engine output
 * (identical teams + native dimensionId), never a re-implementation. Pure.
 */
import { getDimension, type LeagueBundle } from '../utils/strategyBuilder';
import type { TeamStatRow, TeamStatsExport } from '../types/data';
import type { RawFixture } from '../services/oddAlerts';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { console.log(`  ✓ ${name}`); passed += 1; }
  else { console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); failed += 1; }
}

const grading = getDimension('grading1')!;
const characters = getDimension('characters')!;
const opposite = getDimension('opposite')!;
const omit = getDimension('omit')!;

function orow(team: string, fields: Record<string, number>): TeamStatRow {
  return { team_name: team, league_id: 'L1', season: '2024', ...fields } as unknown as TeamStatRow;
}
let fid = 0;
function cfx(homeId: number, awayId: number, hg: number, ag: number, unix: number): RawFixture {
  fid += 1;
  return {
    id: fid, unix, status: 'FT',
    home_id: homeId, away_id: awayId, home_name: `T${homeId}`, away_name: `T${awayId}`,
    home_goals: hg, away_goals: ag, ht_score: null,
  } as unknown as RawFixture;
}

// Opposite / Omit source (reused from oppositeStats.test): Even FC triggers with a
// long (DA) Conc/CS pair; Sharp FC fails the trigger.
const stats: TeamStatsExport = {
  meta: { tables: 1, statsPerTable: 1 },
  tables: {
    ordinary_ft_overall: [
      orow('Even FC', { sc_pct: 52, fts_pct: 48, conc_pct: 75, cs_pct: 25, sc_avg: 1.4, conc_avg: 1.2 }),
      orow('Sharp FC', { sc_pct: 90, fts_pct: 10, conc_pct: 40, cs_pct: 60, sc_avg: 2.1, conc_avg: 0.6 }),
    ],
  },
};

// Characters source: Striker plays 4 home (2–0) + 4 away (1–1) → 8 overall, 4 per
// venue, so it clears the minimum-games gate and resolves to a character.
const fixtures: RawFixture[] = [
  ...Array.from({ length: 4 }, (_, i) => cfx(1, 100 + i, 2, 0, 2000 - i)),
  ...Array.from({ length: 4 }, (_, i) => cfx(200 + i, 1, 1, 1, 1000 - i)),
];

const bundle: LeagueBundle = { competition: 'Test League', stats, fixtures };
const sameTeams = (a: { team: string }[], b: { team: string }[]) =>
  a.length === b.length && a.map((x) => x.team).sort().join('|') === b.map((x) => x.team).sort().join('|');

console.log('\nComposites — the Rule delegates to the existing engines');
{
  const viaRule = grading.evaluate(bundle, { period: 'overall', methodId: 'op:all', options: { show: 'all' } });
  const native = opposite.evaluate(bundle, { period: 'overall', methodId: 'all', options: { allocation: 'all' } });
  check('Opposite · the Rule surfaces the triggered team', viaRule.some((e) => e.team === 'Even FC'), String(viaRule.length));
  check('Opposite · a no-trigger team stays out', !viaRule.some((e) => e.team === 'Sharp FC'));
  check('Opposite · Rule output matches the native engine', sameTeams(viaRule, native));
  check('Opposite · evals keep their native dimension', viaRule[0]?.dimensionId === 'opposite', viaRule[0]?.dimensionId);
}
{
  const viaRule = grading.evaluate(bundle, { period: 'overall', methodId: 'ch:all', options: { show: 'all' } });
  const native = characters.evaluate(bundle, { period: 'overall', methodId: 'all', options: { method: 'method1' } });
  check('Characters · the Rule resolves the qualifying team', viaRule.some((e) => e.team === 'T1'), String(viaRule.length));
  check('Characters · Rule output matches the native engine', sameTeams(viaRule, native));
  check('Characters · evals keep their native dimension', viaRule[0]?.dimensionId === 'characters', viaRule[0]?.dimensionId);
}
{
  const viaRule = grading.evaluate(bundle, { period: 'overall', methodId: 'om:scoring', options: { show: 'all' } });
  const native = omit.evaluate(bundle, { period: 'overall', methodId: 'scoring', options: { direction: 'all' } });
  check('Omit · Rule output matches the native engine', sameTeams(viaRule, native), `${viaRule.length} vs ${native.length}`);
}
{
  // The method catalogue offers every composite as an individual, prefixed entry.
  const methods = grading.methods('overall');
  const ch = methods.filter((m) => m.value.startsWith('ch:'));
  const op = methods.filter((m) => m.value.startsWith('op:'));
  const om = methods.filter((m) => m.value.startsWith('om:'));
  check('every Character is callable (All + each)', ch.length === characters.methods('overall').length && ch.length > 1, String(ch.length));
  check('all Opposite pairs are callable', op.length === opposite.methods('overall').length, String(op.length));
  check('Omit is callable', om.length === omit.methods('overall').length, String(om.length));
  check('composite methods carry their glyphs', ch.every((m) => m.label.startsWith('🎭')) && op.every((m) => m.label.startsWith('🪞')) && om.every((m) => m.label.startsWith('🧪')));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) throw new Error(`${failed} composite strategy checks failed`);
