import { buildMethod2Grid, mergeGrids, SERIES_MIN_RUN } from '../utils/statsGradingMethod2';
import { setRowGames, type CountedGame } from '../utils/countedGames';
import type { TeamStatRow, TeamStatsExport } from '../types/data';

function row(team: string, teamId: number, fields: Record<string, number>): TeamStatRow {
  return { team_name: team, league_id: 'L1', season: '2024/2025', team_id: teamId, sample_size: 10, ...fields } as unknown as TeamStatRow;
}
function win(id: number): CountedGame {
  return { id, unix: 1000 + id, match: `Alpha vs Opp${id}`, score: '2-0', detail: 'League · Home', htKnown: true, ftFor: 2, ftAgainst: 0, htFor: 1, htAgainst: 0, opponentName: `Opp${id}`, isHome: true };
}

// Alpha grades A on over25 in source 1 (all games) → "I · 1.A", and source 2 → "III · 2.A".
// Its last games are five wins, so the last-10 series column reads W ×5.
const alphaOverall = row('Alpha', 1, { over25: 80 });
setRowGames(alphaOverall, [win(1), win(2), win(3), win(4), win(5)]);

const stats: TeamStatsExport = {
  meta: { tables: 1, statsPerTable: 1 },
  tables: {
    ordinary_ft_overall: [alphaOverall, row('Beta', 2, { over25: 50 })],
    ordinary_ft_home: [row('Alpha', 1, { over25: 80 }), row('Beta', 2, { over25: 20 })],
    last10_ft_overall: [row('Alpha', 1, { over25: 80 })],
    last8_ft_overall: [row('Alpha', 1, { over25: 70 })],
    last10_ft_home: [row('Alpha', 1, { over25: 80 })],
    last8_ft_home: [row('Alpha', 1, { over25: 80 })],
    league_avg_ft_overall: [row('League', 0, { over25: 50 })],
  },
};

const grid = buildMethod2Grid(stats, 'over25', 'Test League');

// Rows are fixed: 7 strong + 7 weak combined grades, in order.
if (grid.strong.length !== 7 || grid.weak.length !== 7) throw new Error('Grid must have 7 strong + 7 weak grade rows.');
if (grid.strong[0].label !== 'I · 1.A' || grid.strong[2].label !== 'III · 2.A') {
  throw new Error(`Row labels must combine Roman + source.letter: ${grid.strong.map((b) => b.label).join(', ')}`);
}

const rowI = grid.strong.find((b) => b.roman === 'I')!; // 1.A
const rowIII = grid.strong.find((b) => b.roman === 'III')!; // 2.A
if (!rowI.teams.some((t) => t.team === 'Alpha')) throw new Error('Alpha (A on all games) must land in Grade I (1.A).');
if (!rowIII.teams.some((t) => t.team === 'Alpha')) throw new Error('Alpha (A on last 10 & 8) must land in Grade III (2.A).');

const alphaI = rowI.teams.find((t) => t.team === 'Alpha')!;
if (!alphaI.series || alphaI.series.run !== 5) {
  throw new Error(`Alpha's family series signal should be the 5-run (>= ${SERIES_MIN_RUN}): ${JSON.stringify(alphaI.series)}`);
}

// Beta: Home ↓ / Overall mid on over25 → no named grade, so it appears in no row.
const betaAnywhere = [...grid.strong, ...grid.weak].some((b) => b.teams.some((t) => t.team === 'Beta'));
if (betaAnywhere) throw new Error('Beta has no named grade and must not appear in any row.');

// merge: two copies combine team lists per row.
const merged = mergeGrids([grid, buildMethod2Grid(stats, 'over25', 'Test League 2')]);
if (merged.strong.find((b) => b.roman === 'I')!.teams.length !== 2) throw new Error('mergeGrids must concatenate teams per row.');

console.log('✓ Method 2 grid: fixed grade rows, teams bucketed by source, family signals, merge.');
