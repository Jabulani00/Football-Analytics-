/**
 * Strategy Builder — Stats Grading grade + column model (doc Page 1).
 *
 * Proves the grading dimension emits the Ordinary / + Series / Ordinary + RFS /
 * Series + RFS columns from the live stat tables (grade) + the season fixtures
 * (series & RFS), and that the "Series has no DA" rule excludes DA grades from the
 * Series columns. Pure — no network, synthetic stats + fixtures.
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

function row(name: string, id: number, sc: number, sample: number): TeamStatRow {
  return { team_name: name, team_id: id, league_id: '1', season: '2024', sc_pct: sc, sample_size: sample } as TeamStatRow;
}

let fid = 0;
/** One finished league match, this team at home, scoring `gf`–`ga`. */
function fx(teamId: number, teamName: string, gf: number, ga: number, unix: number): RawFixture {
  fid += 1;
  return {
    id: fid, unix, status: 'FT',
    home_id: teamId, away_id: 900 + teamId, home_name: teamName, away_name: 'Opp',
    home_goals: gf, away_goals: ga, ht_score: null,
  } as unknown as RawFixture;
}

// Alpha — strong A scorer on a live scoring run (scored every game).
// Bravo — strong A scorer that blanked the last game after 9 straight (RFS).
// Charlie — a B grade (Home↑, Overall mid · DA) on a live scoring run.
const stats: TeamStatsExport = {
  meta: { tables: 3, statsPerTable: 1 },
  tables: {
    ordinary_ft_overall: [row('Alpha', 1, 90, 10), row('Bravo', 2, 88, 10), row('Charlie', 3, 55, 10)],
    ordinary_ft_home: [row('Alpha', 1, 85, 6), row('Bravo', 2, 82, 6), row('Charlie', 3, 85, 6)],
    league_avg_ft_overall: [row('League', 0, 50, 10)],
  },
};

const fixtures: RawFixture[] = [
  // Alpha: scored in all of the last 10 → a live scoring series.
  ...Array.from({ length: 10 }, (_, i) => fx(1, 'Alpha', 2, 0, 1000 - i)),
  // Bravo: scored 9 straight, then blanked the newest game (highest unix).
  fx(2, 'Bravo', 0, 1, 5000),
  ...Array.from({ length: 9 }, (_, i) => fx(2, 'Bravo', 2, 0, 1000 - i)),
  // Charlie: scored in all of the last 10 → a live scoring series.
  ...Array.from({ length: 10 }, (_, i) => fx(3, 'Charlie', 2, 0, 1000 - i)),
];

const bundle: LeagueBundle = { competition: 'Test League', stats, fixtures };
const evals = grading.evaluate(bundle, { period: 'overall', methodId: 'sc_pct', options: { show: 'all' } });
const by = (team: string) => evals.find((e) => e.team === team);

console.log('\nGrading columns — Series shows (strong A, live run)');
{
  const a = by('Alpha');
  check('Alpha is graded', a != null && a.grade != null, a?.grade ?? 'none');
  check('Alpha is group (I) 1·A', a?.grade?.startsWith('I · 1·A') === true, a?.grade ?? '');
  check('Alpha qualifies in the + Series column', (a?.qualifications ?? []).some((q) => q.column === 'series'));
  check('+ Series headlines the row (strongest column)', a?.gradeColumn === 'series', a?.gradeColumn);
  check('the grade text shows the column', a?.grade?.includes('+ Series') === true, a?.grade ?? '');
}

console.log('\nGrading columns — RFS shows (strong A, usual just failed)');
{
  const b = by('Bravo');
  check('Bravo is graded', b != null && b.grade != null, b?.grade ?? 'none');
  check('Bravo qualifies in the Ordinary + RFS column', (b?.qualifications ?? []).some((q) => q.column === 'ordinary_rfs'));
  check('Bravo also qualifies in Series + RFS (run broke last game)', (b?.qualifications ?? []).some((q) => q.column === 'series_rfs'));
  check('a clean Ordinary still headlines over the RFS columns', b?.gradeColumn === 'ordinary', b?.gradeColumn);
}

console.log('\nGrading columns — "Series has no DA" excludes DA grades');
{
  const c = by('Charlie');
  check('Charlie is graded B (DA)', c?.grade?.includes('1·B') === true && c?.grade?.includes('DA') === true, c?.grade ?? '');
  check('a DA grade never gets the + Series column', !(c?.qualifications ?? []).some((q) => q.column === 'series'));
  check('a DA grade never gets the Series + RFS column', !(c?.qualifications ?? []).some((q) => q.column === 'series_rfs'));
  check('a DA grade is Ordinary only here', (c?.qualifications ?? []).every((q) => q.column === 'ordinary'));
}

console.log('\nGrading columns — degrade to Ordinary when fixtures are absent');
{
  const noFx = grading.evaluate({ competition: 'Test League', stats }, { period: 'overall', methodId: 'sc_pct', options: { show: 'all' } });
  const a = noFx.find((e) => e.team === 'Alpha');
  check('Alpha still grades without fixtures', a != null && a.grade != null);
  check('no fixtures → Ordinary only (no Series / RFS)', (a?.qualifications ?? []).every((q) => q.column === 'ordinary'), a?.gradeColumn);
}

console.log('\nGrading columns — qualifications are ranked strongest first');
{
  const b = by('Bravo');
  const ranks = (b?.qualifications ?? []).map((q) => q.overallRank);
  check('overall ranks are non-decreasing', ranks.every((r, i) => i === 0 || ranks[i - 1] <= r), ranks.join(','));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
