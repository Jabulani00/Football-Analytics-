/**
 * Strategy Builder — Mixed Stats · Last left-over stats (1–23) as individual Rule stats.
 *
 * Proves the `mx:` branch rebuilds its source tables from the league export (the
 * Ordinary FT table's attached season games + half-time scores, the FT-only
 * patterns and the PPG table) and emits one TeamEval per team with the right
 * banding — and that a team whose half-time data is unavailable is skipped, not
 * crashed. Pure — no network, synthetic export with attached games.
 */
import { getDimension, type LeagueBundle } from '../utils/strategyBuilder';
import { transcribedTeamRows, type TranscribedSources } from '../utils/mixedTranscribed';
import { setRowGames, type CountedGame } from '../utils/countedGames';
import type { TeamStatRow, TeamStatsExport } from '../types/data';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { console.log(`  ✓ ${name}`); passed += 1; }
  else { console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); failed += 1; }
}

function g(id: number, ftFor: number, ftAgainst: number, htFor: number | null, htAgainst: number | null): CountedGame {
  return { id, unix: id, match: '', score: '', detail: '', htKnown: htFor != null, ftFor, ftAgainst, htFor, htAgainst };
}
function orow(name: string, id: number, fields: Record<string, number>, games: CountedGame[]): TeamStatRow {
  const r = { team_name: name, team_id: id, league_id: '1', season: '2024', sample_size: games.length, ...fields } as TeamStatRow;
  setRowGames(r, games);
  return r;
}

// Mix — two valid half-time games (each half contributes equally → 50% shares),
// strong PPG (2.1), and scores in both halves 70% of the time.
const mixGames = [g(1, 2, 0, 1, 0), g(2, 2, 2, 1, 1)];
// Flat — games with no half-time score, so every half share is unavailable.
const flatGames = [g(3, 1, 0, null, null), g(4, 0, 0, null, null)];

const stats: TeamStatsExport = {
  meta: { tables: 1, statsPerTable: 1 },
  tables: {
    ordinary_ft_overall: [orow('Mix', 1, { conc_pct: 40, avg_goals: 3 }, mixGames), orow('Flat', 2, { conc_pct: 20, avg_goals: 1 }, flatGames)],
    ordinary_ht_overall: [orow('Mix', 1, { avg_goals: 1.5, sc_avg: 1, conc_avg: 0.5 }, mixGames)],
    ordinary_2h_overall: [orow('Mix', 1, { avg_goals: 1.5, sc_avg: 1, conc_avg: 0.5 }, mixGames)],
    ppg_ft_overall: [orow('Mix', 1, { ppg: 2.1 }, mixGames)],
    ft_only_ft_overall: [orow('Mix', 1, { scored_both_halves: 70, conceded_both_halves: 30 }, mixGames)],
  },
};

const grading = getDimension('grading1')!;
const bundle: LeagueBundle = { competition: 'Test League', stats };
const evalMx = (key: string) => grading.evaluate(bundle, { period: 'overall', methodId: `mx:${key}`, options: { show: 'all' } });

console.log('\nMixed stats — pulled from the export and banded');
{
  const share = evalMx('sc_1h_share');
  const mix = share.find((e) => e.team === 'Mix');
  check('Mix is surfaced for the 1H scored-share stat', mix != null, String(share.length));
  check('its value is the 50% half share', mix?.value === 50, String(mix?.value));
  check('a mid share bands yellow · MID', mix?.color === 'yellow' && mix?.grade === 'SC* 1H% · MID', `${mix?.color} / ${mix?.grade}`);
  check('its team id is carried from the export', mix?.teamId === 1, String(mix?.teamId));
  check('Flat (no half-time data) is skipped, not crashed', share.find((e) => e.team === 'Flat') == null);
}
{
  const form = evalMx('best_form');
  const mix = form.find((e) => e.team === 'Mix');
  check('Mix is surfaced for best-form (PPG)', mix != null);
  check('a raw PPG carries its value with no band colour', mix?.value === 2.1 && mix?.color === 'none' && mix?.valueText === '2.1', `${mix?.value} / ${mix?.color} / ${mix?.valueText}`);
  check('its grade names the stat + raw value', mix?.grade === 'Best form · high PPG · 2.1', mix?.grade ?? '');
}
{
  const both = evalMx('scored_both_halves');
  const mix = both.find((e) => e.team === 'Mix');
  check('Mix is surfaced for scores-in-both-halves', mix != null);
  check('a 70% stat bands green · UP', mix?.color === 'green' && mix?.grade === 'Scores in both halves · UP', `${mix?.color} / ${mix?.grade}`);
  check('its value text is a percentage', mix?.valueText === '70.0%', mix?.valueText ?? '');
}
{
  // The engine is shared with the panel: the transcription util produces the same
  // 23 metrics directly from the same source tables.
  const sources: TranscribedSources = {
    ordinaryByPeriod: {
      fulltime: [{ team: 'Mix', games: mixGames, metrics: [{ key: 'conc_pct', label: 'Conc%', value: 40, compliance: null }] }],
      firsthalf: [], secondhalf: [],
    },
    ftOnly: [], ppgFt: [],
  };
  const rows = transcribedTeamRows(sources);
  const leastCs = rows[0]?.metrics.find((m) => m.key === 'least_clean_sheet');
  check('shared engine computes least-clean-sheet from conc_pct', leastCs?.value === 40, String(leastCs?.value));
}
{
  // Unknown key yields nothing (no fabricated reading).
  check('an unknown mixed key returns no teams', evalMx('not_a_stat').length === 0);
  // The method catalogue offers all 23 as individual 🧮 stats.
  const methods = grading.methods('overall');
  const mixed = methods.filter((m) => m.value.startsWith('mx:'));
  check('all 23 mixed stats are callable individually', mixed.length === 23, String(mixed.length));
  check('each mixed method is tagged 🧮', mixed.every((m) => m.label.startsWith('🧮')));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) throw new Error(`${failed} mixed-stat strategy checks failed`);
