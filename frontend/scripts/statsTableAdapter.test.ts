/**
 * Display mapping for the additional-stats families.
 * Run: npx tsx scripts/statsTableAdapter.test.ts
 */
import { buildStatsTables } from '../services/statsBuilder';
import type { TeamStatRow } from '../types/data';
import {
  columnsForFamily,
  liveRowsToDisplay,
  metaToLiveTableName,
  sampleRowsForFamily,
  sortByPrimary,
} from '../utils/statsTableAdapter';

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  ✓ ${name}`);
    passed += 1;
  } else {
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
    failed += 1;
  }
}

const ppgCols = columnsForFamily('ppg').map((col) => col.key);
const seriesCols = columnsForFamily('series').map((col) => col.key);
const ftCols = columnsForFamily('ft_only').map((col) => col.key);

check('ppg leads with points per game', ppgCols[0] === 'ppg');
check('series leads with the win streak', seriesCols[0] === 'win_streak');
check('ft-only leads with won both halves', ftCols[0] === 'won_both_halves');
check('ordinary stays on win percentage', columnsForFamily('ordinary')[0]?.key === 'w_pct');
check('ft-only does not repeat the ordinary win column', !ftCols.includes('w_pct'));

const samplePpg = sampleRowsForFamily('ppg');
const sampleSeries = sampleRowsForFamily('series');
const sampleFt = sampleRowsForFamily('ft_only');

check('sample ppg is a raw figure', samplePpg[0]?.metrics[0]?.raw === true && samplePpg[0]?.metrics[0]?.label === 'PPG');
check('sample series has no percent columns', sampleSeries.every((row) => row.metrics.every((metric) => metric.raw)));
check(
  'sample ft-only uses the pattern labels',
  sampleFt[0]?.metrics.map((metric) => metric.label).join(',') === 'Won BH,Win-Nil,Scr BH,Cnc BH,Led HT,CS%',
);
check(
  'sample series rows are not copies of each other',
  new Set(sampleSeries.map((row) => row.metrics.map((metric) => metric.value).join(','))).size === 3,
);
check(
  'period salt changes the sample',
  sampleRowsForFamily('ppg', 0)[0]?.metrics[0]?.value !== sampleRowsForFamily('ppg', 3)[0]?.metrics[0]?.value,
);
check('sample families do not share a first column', new Set([
  samplePpg[0]?.metrics[0]?.key,
  sampleSeries[0]?.metrics[0]?.key,
  sampleFt[0]?.metrics[0]?.key,
]).size === 3);

const ranked = sortByPrimary(samplePpg);
check(
  'primary metric sorts high to low',
  (ranked[0]?.metrics[0]?.value ?? 0) >= (ranked[1]?.metrics[0]?.value ?? 0) &&
    (ranked[1]?.metrics[0]?.value ?? 0) >= (ranked[2]?.metrics[0]?.value ?? 0),
);

const live = liveRowsToDisplay(
  [
    {
      team_name: 'Visit',
      ppg: 1.666,
      ppg_signal: '',
      w_pct: 40,
      w_pct_signal: 'red',
      win_streak: 4,
      won_both_halves: Number.NaN,
    } as TeamStatRow,
  ],
  'ppg',
);
check('ppg rounds to two decimals', live[0]?.metrics[0]?.value === 1.67);
check('ppg under 1.80 is yellow', live[0]?.metrics[0]?.compliance === 'yellow');
check('a stored percent signal is kept', live[0]?.metrics.find((metric) => metric.key === 'w_pct')?.compliance === 'red');

const patterns = liveRowsToDisplay(
  [{ team_name: 'Visit', won_both_halves: Number.NaN, win_to_nil: 50, cs_pct: 80 } as TeamStatRow],
  'ft_only',
);
check('missing pattern stays blank', patterns[0]?.metrics[0]?.value == null);
check('present pattern is kept', patterns[0]?.metrics[1]?.value === 50);

const streaks = liveRowsToDisplay(
  [{ team_name: 'Visit', win_streak: 4, loss_streak: 0 } as TeamStatRow],
  'series',
);
check('a streak of 4 is green', streaks[0]?.metrics[0]?.compliance === 'green');
check('a streak of 0 is red', streaks[0]?.metrics.find((metric) => metric.key === 'loss_streak')?.compliance === 'red');

check(
  'ppg first-half home maps to the builder table',
  metaToLiveTableName({ id: 'x', name: 'x', group: 'base', family: 'ppg', split: 'home', period: 'firsthalf', statCount: 1 }) === 'ppg_ht_home',
);
check(
  'series second-half away maps to the builder table',
  metaToLiveTableName({ id: 'x', name: 'x', group: 'base', family: 'series', split: 'away', period: 'secondhalf', statCount: 1 }) === 'series_2h_away',
);
check(
  'full-time-only overall maps to the full-time table',
  metaToLiveTableName({ id: 'x', name: 'x', group: 'base', family: 'ft_only', split: 'overall', period: 'fulltime', statCount: 1 }) === 'ft_only_ft_overall',
);
check(
  'last 10 keeps the window prefix',
  metaToLiveTableName({ id: 'x', name: 'x', group: 'lastN', family: 'ordinary', recency: 'last10', split: 'away', period: 'firsthalf', statCount: 1 }) === 'last10_ht_away',
);
check(
  'scope salt changes the sample without changing the family',
  sampleRowsForFamily('series', 0)[0]?.metrics[0]?.value !== sampleRowsForFamily('series', 1)[0]?.metrics[0]?.value,
);

const built = buildStatsTables({
  season: '2025/2026',
  fixtures: [
    { id: 1, unix: 300, status: 'FT', competition_id: 100, season: '2025/2026', home_name: 'A', away_name: 'B', home_goals: 2, away_goals: 1, ht_score: '1-0' },
    { id: 2, unix: 200, status: 'FT', competition_id: 100, season: '2025/2026', home_name: 'B', away_name: 'A', home_goals: 0, away_goals: 0, ht_score: '0-0' },
    { id: 3, unix: 100, status: 'FT', competition_id: 100, season: '2025/2026', home_name: 'A', away_name: 'C', home_goals: 3, away_goals: 3, ht_score: '2-1' },
  ] as never,
});
const shown = liveRowsToDisplay(built.tables['ft_only_ft_overall'] ?? [], 'ft_only');
const teamA = shown.find((row) => row.team === 'A');
check('live full-time-only scored both halves is 66.7', teamA?.metrics.find((metric) => metric.key === 'scored_both_halves')?.value === 66.7);
check('live full-time-only led at half-time is 66.7', teamA?.metrics.find((metric) => metric.key === 'led_ht')?.value === 66.7);
const ordered = sortByPrimary([
  { team: 'Thin', played: 1, metrics: [{ key: 'w_pct', label: 'Win %', value: 100, compliance: 'green' }] },
  { team: 'Solid', played: 8, metrics: [{ key: 'w_pct', label: 'Win %', value: 50, compliance: 'yellow' }] },
  { team: 'Blank', played: 10, metrics: [{ key: 'w_pct', label: 'Win %', value: null, compliance: 'red' }] },
]);
check('a one-game 100% does not lead', ordered[0]?.team === 'Solid');
check('a thinner sample stays after the leaders', ordered[1]?.team === 'Thin');
check('a blank cell sorts last', ordered[2]?.team === 'Blank');
const ppgShown = liveRowsToDisplay(built.tables['ppg_ft_overall'] ?? [], 'ppg');
check('live points per game for A is 1.67 and raw', ppgShown.find((row) => row.team === 'A')?.metrics[0]?.value === 1.67 && ppgShown.find((row) => row.team === 'A')?.metrics[0]?.raw === true);

console.log(`\n${passed}/${passed + failed} checks passed`);
process.exit(failed === 0 ? 0 : 1);
