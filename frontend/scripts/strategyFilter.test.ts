import {
  matchFixture,
  newCondition,
  filterStat,
  PRESETS,
  type Condition,
} from '../utils/strategyFilter';
import type { TeamStatRow, TeamStatsExport } from '../types/data';

function row(team: string, fields: Record<string, number>): TeamStatRow {
  return { team_name: team, league_id: 'L1', season: '2024/2025', ...fields } as unknown as TeamStatRow;
}

// Home "Alpha" leaks and scores; Away "Beta" scores away. Gamma is thin (few games).
const stats: TeamStatsExport = {
  meta: { tables: 1, statsPerTable: 1 },
  tables: {
    ordinary_ft_overall: [
      row('Alpha', { sample_size: 12, btts_yes: 70 }),
      row('Beta', { sample_size: 11, btts_yes: 65 }),
      row('Gamma', { sample_size: 3, btts_yes: 90 }),
    ],
    // Default condition reads the last-10 window.
    last10_ft_overall: [
      row('Alpha', { conceding_05: 90 }),
      row('Beta', { conceding_05: 85 }),
      row('Gamma', { conceding_05: 95 }),
    ],
    ordinary_ft_home: [row('Alpha', { sample_size: 6 })],
    ppg_ft_home: [row('Alpha', { ppg: 1.8 })],
    ordinary_ft_away: [row('Beta', { sc_pct: 85, sample_size: 5 })],
  },
};

// ---- a single 'both' condition on last-10 conceding ----
const cond: Condition = { ...newCondition() };
const m1 = matchFixture(stats, 'Alpha', 'Beta', [cond], 10);
if (!m1.matched) throw new Error('Alpha vs Beta should match conceding 0.5+ ≥ 80 (both).');
if (m1.reasons.length !== 2 || m1.reasons[0].side !== 'H' || m1.reasons[0].value !== 90) {
  throw new Error(`Reasons should record both teams' values: ${JSON.stringify(m1.reasons)}`);
}

// ---- min-games gate: Gamma (3 games) fails the 10-game floor ----
if (matchFixture(stats, 'Alpha', 'Gamma', [cond], 10).matched) throw new Error('Thin-sample team must fail the min-games gate.');

// ---- a failing threshold ----
const strict: Condition = { ...cond, value: 88 }; // Beta is 85 < 88 → fail
if (matchFixture(stats, 'Alpha', 'Beta', [strict], 10).matched) throw new Error('Beta 85 < 88 should fail the condition.');

// ---- side + scope: home PPG (home table) and away SC% (away table) ----
const homePpg: Condition = { id: 'x', side: 'home', statKey: 'ppg', window: 'all', period: 'ft', scope: 'home', cmp: 'gte', value: 1.2 };
const awaySc: Condition = { id: 'y', side: 'away', statKey: 'sc_pct', window: 'all', period: 'ft', scope: 'away', cmp: 'gte', value: 80 };
const m2 = matchFixture(stats, 'Alpha', 'Beta', [homePpg, awaySc], 10);
if (!m2.matched) throw new Error('Home PPG 1.8 ≥ 1.2 and Away SC% 85 ≥ 80 should match.');

// ---- Leaky Leaky preset evaluates (all its conditions resolve) ----
const leaky = PRESETS.find((p) => p.id === 'leaky')!;
const m3 = matchFixture(stats, 'Alpha', 'Beta', leaky.conditions, leaky.minGames);
if (!m3.matched) throw new Error(`Leaky Leaky should match the crafted fixture: ${JSON.stringify(m3)}`);

// ---- empty conditions never match; stat lookup has a fallback ----
if (matchFixture(stats, 'Alpha', 'Beta', [], 10).matched) throw new Error('No conditions → no match.');
if (filterStat('conceding_05').kind !== 'pct' || filterStat('ppg').kind !== 'avg') throw new Error('Stat kinds wrong.');

console.log('✓ Strategy Filter: conditions, sides/scopes, min-games gate, thresholds, Leaky Leaky preset.');
