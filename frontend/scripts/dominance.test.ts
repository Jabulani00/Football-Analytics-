import {
  classify,
  measureFor,
  buildHomeAwayDominance,
  buildHalfDominance,
  dominanceTally,
  teamNamesIn,
  LONG_DIFF,
  EVEN_DIFF,
} from '../utils/dominance';
import type { TeamStatRow, TeamStatsExport } from '../types/data';

// ---- measure: percentage points for % stats, relative % for raw ----
if (measureFor(80, 50, true) !== 30) throw new Error('% stats compare by points.');
if (Math.round(measureFor(2, 1, false)!) !== 67) throw new Error('Raw stats compare relative to the mean (1/1.5 ≈ 67%).');
if (measureFor(50, null, true) !== null) throw new Error('A missing side has no measure.');

// ---- classify: long = dominant side, short = even ----
if (classify(80, 50, 30).side !== 'a' || classify(80, 50, 30).magnitude !== 'long') throw new Error('80 vs 50 → a dominant (long).');
if (classify(50, 80, 30).side !== 'b') throw new Error('50 vs 80 → b dominant.');
if (classify(55, 50, 5).side !== 'even' || classify(55, 50, 5).magnitude !== 'short') throw new Error('≤15 diff → even/short.');
if (classify(70, 52, 18).magnitude !== 'mid') throw new Error('Between EVEN and LONG is mid (borderline).');
if (classify(70, 46, 24).magnitude !== 'mid') throw new Error('24 is still the borderline band.');
if (classify(80, 55, 25).magnitude !== 'long') throw new Error('25 reaches the DA (long) band.');
if (classify(null, 50, null).side !== 'na') throw new Error('Missing data → na.');
if (LONG_DIFF !== 25 || EVEN_DIFF !== 15) throw new Error('Thresholds must be 25 / 15 (DA bands).');

// ---- build from an export: Home-dominant SC%, even PPG ----
function row(team: string, fields: Record<string, number>): TeamStatRow {
  return { team_name: team, league_id: 'L1', season: '2024/2025', ...fields } as unknown as TeamStatRow;
}
const stats: TeamStatsExport = {
  meta: { tables: 1, statsPerTable: 1 },
  tables: {
    ordinary_ft_overall: [row('Alpha', {}), row('Beta', {})],
    ordinary_ft_home: [row('Alpha', { sc_pct: 80, conc_pct: 30, avg_goals: 2.4 })],
    ordinary_ft_away: [row('Alpha', { sc_pct: 50, conc_pct: 32, avg_goals: 1.2 })],
    ppg_ft_home: [row('Alpha', { ppg: 2.0 })],
    ppg_ft_away: [row('Alpha', { ppg: 1.9 })],
    ordinary_ht_overall: [row('Alpha', { sc_pct: 40, conc_pct: 20, avg_goals: 0.7 })],
    ordinary_2h_overall: [row('Alpha', { sc_pct: 70, conc_pct: 25, avg_goals: 1.3 })],
  },
};

const ha = buildHomeAwayDominance(stats, 'Alpha');
const sc = ha.find((r) => r.statKey === 'sc_pct')!;
if (sc.a !== 80 || sc.b !== 50 || sc.difference !== 30 || sc.side !== 'a' || sc.magnitude !== 'long') {
  throw new Error(`SC% should be Home-dominant (long): ${JSON.stringify(sc)}`);
}
const ppg = ha.find((r) => r.statKey === 'ppg')!;
if (ppg.a !== 2.0 || ppg.b !== 1.9 || ppg.side !== 'even') throw new Error(`PPG 2.0 vs 1.9 should be even: ${JSON.stringify(ppg)}`);

const tally = dominanceTally(ha);
if (tally.a < 1) throw new Error('Home should dominate at least one stat.');

// ---- halves: 2nd-half-dominant SC% ----
const half = buildHalfDominance(stats, 'Alpha');
if (half.some((r) => r.statKey === 'ppg')) throw new Error('PPG must be excluded from the half analysis.');
const scH = half.find((r) => r.statKey === 'sc_pct')!;
if (scH.a !== 40 || scH.b !== 70 || scH.side !== 'b' || scH.magnitude !== 'long') {
  throw new Error(`Half SC% 40 vs 70 should be 2nd-half dominant: ${JSON.stringify(scH)}`);
}

if (teamNamesIn(stats).join(',') !== 'Alpha,Beta') throw new Error('Team names should come sorted from the all-games table.');

console.log('✓ Dominance: measure, classify, Home/Away + half builders, tally, team list.');
