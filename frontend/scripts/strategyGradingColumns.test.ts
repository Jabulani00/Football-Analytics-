/**
 * Strategy Builder — Stats Grading grade + column model (doc Page 1).
 *
 * Proves the grading dimension emits the Ordinary / + Series / Ordinary + RFS /
 * Series + RFS columns from the live stat tables (grade) + the season fixtures
 * (series & RFS), and that the "Series has no DA" rule excludes DA grades from the
 * Series columns. Pure — no network, synthetic stats + fixtures.
 */
import { evaluateStrategy, getDimension, type Condition, type LeagueBundle } from '../utils/strategyBuilder';
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

console.log('\nGoal-timing windows — first 15′ / last 20′ band on the overall %');
{
  const t = (sc15: number, after70: number, cov: number) => ({
    firstGoalFor: null, firstGoalAgainst: null,
    scoredIn15: { count: 0, pct: sc15 }, concededIn15: { count: 0, pct: 20 },
    scoredAfter70: { count: 0, pct: after70 }, concededAfter70: { count: 0, pct: 20 },
    coveragePct: cov,
  });
  const timing = [
    { team: 'EarlyBird', teamId: 10, timing: t(70, 20, 90) }, // scores early (UP), late rarely (DOWN)
    { team: 'LateShow', teamId: 11, timing: t(10, 65, 90) },  // scores early rarely (DOWN), late often (UP)
    { team: 'NoData', teamId: 12, timing: t(0, 0, 0) },        // no timing coverage
  ];
  const tb: LeagueBundle = { competition: 'LT', timing };

  check('Scored/Conceded states are offered', grading.methods('first15').some((m) => m.value === 'tm_sc') && grading.methods('first15').some((m) => m.value === 'tm_cs'));

  // The TIME is the Period (first15), the state is just Scored (tm_sc).
  const sc15 = grading.evaluate(tb, { period: 'first15', methodId: 'tm_sc', options: { show: 'all' } });
  check('first-15 window bands every covered team', sc15.length === 2, `got ${sc15.length}`);
  check('the no-coverage team is dropped', !sc15.some((e) => e.team === 'NoData'));
  const early = sc15.find((e) => e.team === 'EarlyBird');
  check('EarlyBird scores early → UP / green', early?.color === 'green' && early?.grade?.includes('Scored 0–15′ · UP') === true, early?.grade ?? '');
  check('LateShow scores early → DOWN / red', sc15.find((e) => e.team === 'LateShow')?.color === 'red');

  check('show=strong keeps only the UP band', grading.evaluate(tb, { period: 'first15', methodId: 'tm_sc', options: { show: 'strong' } }).every((e) => e.color === 'green'));

  const late = grading.evaluate(tb, { period: 'last20', methodId: 'tm_sc', options: { show: 'strong' } });
  check('last-20 window surfaces the late scorer', late.length === 1 && late[0].team === 'LateShow', late.map((e) => e.team).join(','));
  check('last-20 grade reads 70′+', late[0]?.grade?.includes('Scored 70′+ · UP') === true, late[0]?.grade ?? '');

  check('a window state outside a window Period yields nothing', grading.evaluate(tb, { period: 'overall', methodId: 'tm_sc', options: { show: 'all' } }).length === 0);
  check('no timing data on the bundle → no timing evals', grading.evaluate({ competition: 'LT' }, { period: 'first15', methodId: 'tm_sc', options: { show: 'all' } }).length === 0);
}

console.log('\nBetting-market stats — handicaps & scoring-half (from results)');
{
  const fxH = (teamId: number, name: string, gf: number, ga: number, htGf: number, htGa: number, unix: number): RawFixture => {
    fid += 1;
    return { id: fid, unix, status: 'FT', home_id: teamId, away_id: 900 + teamId, home_name: name, away_name: 'Opp', home_goals: gf, away_goals: ga, ht_score: `${htGf}-${htGa}` } as unknown as RawFixture;
  };
  const mStats: TeamStatsExport = {
    meta: { tables: 1, statsPerTable: 1 },
    tables: {
      ordinary_ft_overall: [
        { team_name: 'Crusher', team_id: 20, league_id: '1', season: '2024', sc_pct: 0, sample_size: 6 } as TeamStatRow,
        { team_name: 'Flat', team_id: 21, league_id: '1', season: '2024', sc_pct: 0, sample_size: 6 } as TeamStatRow,
      ],
    },
  };
  const mFx: RawFixture[] = [
    ...Array.from({ length: 6 }, (_, i) => fxH(20, 'Crusher', 3, 0, 2, 0, 1000 - i)), // win by 3; 1H(2) > 2H(1); CS 1H
    ...Array.from({ length: 6 }, (_, i) => fxH(21, 'Flat', 1, 1, 0, 0, 2000 - i)),    // unbeaten; 2H(2) > 1H(0); CS 1H
  ];
  const mb: LeagueBundle = { competition: 'LM', stats: mStats, fixtures: mFx };

  check('market stats are offered in the Rule', grading.methods('overall').some((m) => m.value === 'mk_win2'));

  const win2 = grading.evaluate(mb, { period: 'overall', methodId: 'mk_win2', options: { show: 'all' } });
  const crush = win2.find((e) => e.team === 'Crusher');
  check('Crusher wins by 2+ → UP / green', crush?.color === 'green' && crush?.grade?.includes('Win −1.5 · UP') === true, crush?.grade ?? '');
  check('Flat never wins by 2+ → DOWN / red', win2.find((e) => e.team === 'Flat')?.color === 'red');

  const hh = grading.evaluate(mb, { period: 'overall', methodId: 'mk_2h_higher', options: { show: 'all' } });
  check('Flat has the higher-scoring 2nd half → UP', hh.find((e) => e.team === 'Flat')?.color === 'green');
  check('Crusher does not → DOWN', hh.find((e) => e.team === 'Crusher')?.color === 'red');

  check('both keep a 1st-half clean sheet (strong)', grading.evaluate(mb, { period: 'overall', methodId: 'mk_cs_1h', options: { show: 'strong' } }).length === 2);

  const noHt: LeagueBundle = { competition: 'LM', stats: mStats, fixtures: Array.from({ length: 6 }, (_, i) => fx(20, 'Crusher', 3, 0, 1000 - i)) };
  check('a half-market with no HT data yields nothing', grading.evaluate(noHt, { period: 'overall', methodId: 'mk_2h_higher', options: { show: 'all' } }).length === 0);
}

console.log('\nMulti-rule combine — a second Rule recalculates (OR / AND)');
{
  // A second stat column so two Rules can grade differently.
  const r2 = (name: string, id: number, sc: number, over25: number, scH: number, over25H: number): { o: TeamStatRow; h: TeamStatRow } => ({
    o: { team_name: name, team_id: id, league_id: '1', season: '2024', sc_pct: sc, over25, sample_size: 10 } as TeamStatRow,
    h: { team_name: name, team_id: id, league_id: '1', season: '2024', sc_pct: scH, over25: over25H, sample_size: 6 } as TeamStatRow,
  });
  // Alpha: strong on sc_pct (A), weak on over25 (F). Bravo: strong on both (A / A).
  const alpha = r2('Alpha', 1, 90, 20, 85, 20);
  const bravo = r2('Bravo', 2, 88, 80, 82, 85);
  const stats2: TeamStatsExport = {
    meta: { tables: 3, statsPerTable: 2 },
    tables: {
      ordinary_ft_overall: [alpha.o, bravo.o],
      ordinary_ft_home: [alpha.h, bravo.h],
      league_avg_ft_overall: [{ team_name: 'League', team_id: 0, league_id: '1', season: '2024', sc_pct: 50, over25: 50, sample_size: 10 } as TeamStatRow],
    },
  };
  const b2: LeagueBundle = { competition: 'L2', stats: stats2 };
  const c1: Condition = { id: 'c1', dimensionId: 'grading1', period: 'overall', methodId: 'sc_pct', options: { show: 'strong' }, side: 'either' };
  const c2: Condition = { id: 'c2', dimensionId: 'grading1', period: 'overall', methodId: 'over25', options: { show: 'strong' }, side: 'either' };

  const one = evaluateStrategy([b2], [c1], 'and');
  check('one Rule surfaces both strong-scorers', one.length === 2, `got ${one.length}`);

  const orBoth = evaluateStrategy([b2], [c1, c2], 'or');
  check('OR of two Rules keeps the union (2 teams)', orBoth.length === 2, `got ${orBoth.length}`);
  const orAlpha = orBoth.find((r) => r.team === 'Alpha');
  const orBravo = orBoth.find((r) => r.team === 'Bravo');
  check('OR · Alpha passes only Rule 1', orAlpha?.conditions.length === 1, `got ${orAlpha?.conditions.length}`);
  check('OR · Bravo passes both Rules', orBravo?.conditions.length === 2, `got ${orBravo?.conditions.length}`);

  const andBoth = evaluateStrategy([b2], [c1, c2], 'and');
  check('AND of two Rules keeps the intersection (Bravo only)', andBoth.length === 1 && andBoth[0].team === 'Bravo', `got ${andBoth.map((r) => r.team).join(',')}`);
  check('AND · the one team shows both Rules', andBoth[0]?.conditions.length === 2, `got ${andBoth[0]?.conditions.length}`);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
