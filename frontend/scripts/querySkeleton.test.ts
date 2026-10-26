import {
  buildStatCall,
  sortByDifference,
  tallyTiers,
  callStats,
  bestLinePrice,
  valueOddsIndex,
  lookupOdds,
} from '../utils/querySkeleton';
import type { TeamStatRow, TeamStatsExport } from '../types/data';
import type { RawValueBet, RawValueOddsLine } from '../services/oddAlerts';

function row(team: string, fields: Record<string, number>): TeamStatRow {
  return { team_name: team, league_id: 'L1', season: '2024/2025', ...fields } as unknown as TeamStatRow;
}

// Alpha: Home/Away SC% 90 vs 40 → diff 50 (DA/top). Beta: 60 vs 52 → diff 8 (none/bottom).
const stats: TeamStatsExport = {
  meta: { tables: 1, statsPerTable: 1 },
  tables: {
    ordinary_ft_overall: [row('Alpha', { sc_pct: 70 }), row('Beta', { sc_pct: 55 })],
    ordinary_ft_home: [row('Alpha', { sc_pct: 90, sample_size: 10 }), row('Beta', { sc_pct: 60, sample_size: 6 })],
    ordinary_ft_away: [row('Alpha', { sc_pct: 40, sample_size: 8 }), row('Beta', { sc_pct: 52, sample_size: 9 })],
  },
};

const rows = buildStatCall(stats, 'Test League', 'sc_pct', 'homeaway');
const alpha = rows.find((r) => r.team === 'Alpha')!;
if (alpha.aValue !== 90 || alpha.bValue !== 40 || alpha.difference !== 50 || alpha.measure !== 50) {
  throw new Error(`Alpha Home/Away SC% should be 90/40, diff 50: ${JSON.stringify(alpha)}`);
}
if (alpha.band !== 'da' || alpha.tier !== 'top') throw new Error('50-point difference is DA / top tier.');
if (alpha.overall !== 70) throw new Error('Overall value should be read from ordinary_ft_overall.');
if (alpha.sample !== 8) throw new Error(`Sample is the smaller side (min 10, 8 = 8): ${alpha.sample}`);

const beta = rows.find((r) => r.team === 'Beta')!;
if (beta.measure !== 8 || beta.band !== 'none' || beta.tier !== 'bottom') {
  throw new Error(`Beta 60/52 diff 8 should be none / bottom tier: ${JSON.stringify(beta)}`);
}

// ---- sort: biggest difference first ----
const sorted = sortByDifference(rows);
if (sorted[0].team !== 'Alpha') throw new Error('Biggest difference must lead.');

// ---- tiers tally ----
const t = tallyTiers(rows);
if (t.top !== 1 || t.bottom !== 1 || t.middle !== 0) throw new Error(`Tier tally wrong: ${JSON.stringify(t)}`);

// ---- call stats: halves excludes PPG ----
if (callStats('halves').some((s) => s.key === 'ppg')) throw new Error('PPG has no halves split.');
if (!callStats('homeaway').some((s) => s.key === 'ppg')) throw new Error('Home/Away keeps PPG.');

// ---- odds: best line price + index + lookup ----
if (bestLinePrice([{ latest: 1.8 }, { odds: 2.1 }]) !== 2.1) throw new Error('Best price is the highest line.');
// The feed sends prices as strings — they must coerce before comparing.
const stringLines = [{ latest: '2.19', opening: '1.89' }, { latest: '2.02' }] as unknown as RawValueOddsLine[];
if (bestLinePrice(stringLines) !== 2.19) throw new Error('String prices coerce to numbers.');
if (bestLinePrice([]) !== null) throw new Error('No lines → null price.');

const bets: RawValueBet[] = [
  { id: 101, market: 'ft_result', selection: 'Home', home_name: 'Alpha', away_name: 'Zeta', odds: [{ latest: 1.75 }, { odds: 1.8 }] },
  { id: 202, market: 'over_under', selection: 'Over 2.5', home_name: 'Beta', away_name: 'Yan', odds: [{ latest: 1.95 }] },
];
const idx = valueOddsIndex(bets);
const byId = lookupOdds(idx, 101, 'Alpha', 'Zeta');
if (!byId || byId.price !== 1.8 || byId.selection !== 'Home') throw new Error(`Odds by id wrong: ${JSON.stringify(byId)}`);
const byName = lookupOdds(idx, null, 'Beta', 'Yan');
if (!byName || byName.market !== 'over_under') throw new Error('Odds should fall back to the name-pair key.');
if (lookupOdds(idx, 999, 'No', 'Match') !== null) throw new Error('Unknown fixture → no odds.');

console.log('✓ Query Skeleton: stat call, difference tiers, sort, tally, value-odds index.');
