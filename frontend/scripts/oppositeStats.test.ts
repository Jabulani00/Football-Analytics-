import {
  allocationFor,
  buildOppositeStats,
  sortOpposite,
  SHORT_MAX,
  DA_MIN,
  TRIGGER_RATE,
} from '../utils/oppositeStats';
import type { TeamStatRow, TeamStatsExport } from '../types/data';

// ---- allocation thresholds: 0–15 short · 16–24 borderline · 25+ long (DA) ----
if (allocationFor(10) !== 'short' || allocationFor(15) !== 'short') throw new Error('≤15% is a short difference (no DA).');
if (allocationFor(16) !== 'borderline' || allocationFor(24) !== 'borderline') throw new Error('16–24% is the borderline band.');
if (allocationFor(25) !== 'long' || allocationFor(40) !== 'long') throw new Error('≥25% is a long difference (DA).');
if (allocationFor(null) !== 'na') throw new Error('Missing difference → na.');
if (SHORT_MAX !== 15 || DA_MIN !== 25 || TRIGGER_RATE !== 1) throw new Error('Thresholds must be 15 / 25 / 1.0.');

function row(team: string, fields: Record<string, number>): TeamStatRow {
  return { team_name: team, league_id: 'L1', season: '2024/2025', ...fields } as unknown as TeamStatRow;
}

const stats: TeamStatsExport = {
  meta: { tables: 1, statsPerTable: 1 },
  tables: {
    ordinary_ft_overall: [
      // Balanced near 50/50 on SC/FTS (no DA), skewed on Conc/CS (DA); trigger holds.
      row('Even FC', { sc_pct: 52, fts_pct: 48, conc_pct: 75, cs_pct: 25, sc_avg: 1.4, conc_avg: 1.2 }),
      // Skewed SC/FTS (DA); trigger fails (concedes < 1 per game).
      row('Sharp FC', { sc_pct: 90, fts_pct: 10, conc_pct: 40, cs_pct: 60, sc_avg: 2.1, conc_avg: 0.6 }),
    ],
  },
};

const rows = buildOppositeStats(stats, 'Test League', 'overall');
const even = rows.find((r) => r.team === 'Even FC')!;
const scFts = even.pairs.find((p) => p.aLabel === 'SC%')!;
if (scFts.aValue !== 52 || scFts.bValue !== 48 || scFts.difference !== 4 || scFts.allocation !== 'short' || scFts.isDA) {
  throw new Error(`Even FC SC%/FTS% should be a short difference (no DA): ${JSON.stringify(scFts)}`);
}
const concCs = even.pairs.find((p) => p.aLabel === 'Conc%')!;
if (concCs.difference !== 50 || concCs.allocation !== 'long' || !concCs.isDA) {
  throw new Error(`Even FC Conc%/CS% should be a long difference (DA): ${JSON.stringify(concCs)}`);
}
if (!even.trigger) throw new Error('Even FC meets the trigger (SC/m 1.4, Conc/m 1.2).');
if (even.minDifference !== 4) throw new Error('minDifference should be the smallest pair difference (4).');

const sharp = rows.find((r) => r.team === 'Sharp FC')!;
if (sharp.trigger) throw new Error('Sharp FC fails the trigger (Conc/m 0.6 < 1).');

// ---- sort: smallest difference first ----
const sorted = sortOpposite(rows);
if (sorted[0].team !== 'Even FC') throw new Error('Most balanced team (smallest diff) must lead.');

console.log('✓ Opposite Stats: allocation, pair build, trigger, min difference, sort.');
