import {
  daBand,
  leagueUnity,
  leagueUnityFor,
  superLeagueUnity,
  measuresForSection,
  sectionStats,
  gradingUnity,
  NONE_MAX,
  DA_MIN,
} from '../utils/unity';
import type { TeamStatRow, TeamStatsExport } from '../types/data';
import type { TeamGradeRow } from '../utils/statsGrading';

// ---- DA bands: 0–15 none · 16–24 borderline · 25–100 DA ----
if (NONE_MAX !== 15 || DA_MIN !== 25) throw new Error('Bands must be 0-15 / 16-24 / 25-100.');
if (daBand(0) !== 'none' || daBand(15) !== 'none') throw new Error('0–15 is none DA.');
if (daBand(16) !== 'borderline' || daBand(24) !== 'borderline') throw new Error('16–24 is borderline.');
if (daBand(25) !== 'da' || daBand(100) !== 'da') throw new Error('25–100 is DA.');
if (daBand(null) !== 'na') throw new Error('Missing measure → na.');

// ---- league Unity = DA ÷ total ----
const u = leagueUnity('L', [30, 40, 10, 20, null]);
if (u.total !== 4 || u.da !== 2 || u.borderline !== 1 || u.none !== 1 || u.unity !== 0.5) {
  throw new Error(`Unity should be 2 DA of 4 = 0.5: ${JSON.stringify(u)}`);
}

// ---- super league ranks leagues by Unity desc ----
const sl = superLeagueUnity([
  leagueUnity('A', [30, 30, 30]), // unity 1.0
  leagueUnity('B', [30, 10, 10]), // unity 0.33
  leagueUnity('C', []), // dropped — no data
]);
if (sl.leagues.length !== 2 || sl.leagues[0].competition !== 'A') throw new Error('Most-unified league leads; empty leagues drop.');
if (sl.totalTeams !== 6 || sl.totalDa !== 4 || Math.round((sl.overallUnity ?? 0) * 100) !== 67) {
  throw new Error(`Super-league unity should be 4/6 ≈ 0.67: ${JSON.stringify(sl)}`);
}

// ---- measures come from the section's own difference, per team ----
function row(team: string, fields: Record<string, number>): TeamStatRow {
  return { team_name: team, league_id: 'L1', season: '2024/2025', ...fields } as unknown as TeamStatRow;
}
const stats: TeamStatsExport = {
  meta: { tables: 1, statsPerTable: 1 },
  tables: {
    ordinary_ft_overall: [row('Alpha', { sc_pct: 70, fts_pct: 30 }), row('Beta', { sc_pct: 55, fts_pct: 45 })],
    ordinary_ft_home: [row('Alpha', { sc_pct: 90 }), row('Beta', { sc_pct: 60 })],
    ordinary_ft_away: [row('Alpha', { sc_pct: 50 }), row('Beta', { sc_pct: 55 })],
  },
};

// Home/Away SC%: Alpha |90-50|=40 → DA, Beta |60-55|=5 → none. Unity = 1/2 = 0.5.
const haSc = measuresForSection(stats, 'homeaway', 'sc_pct');
if (haSc[0] !== 40 || haSc[1] !== 5) throw new Error(`Home/Away SC% measures wrong: ${JSON.stringify(haSc)}`);
if (leagueUnityFor(stats, 'L', 'homeaway', 'sc_pct').unity !== 0.5) throw new Error('Home/Away SC% unity should be 0.5.');

// Opposites SC%/FTS% (pair 0): Alpha |70-30|=40 → DA, Beta |55-45|=10 → none. Unity 0.5.
const opp = measuresForSection(stats, 'opposites', '0');
if (opp[0] !== 40 || opp[1] !== 10) throw new Error(`Opposite pair measures wrong: ${JSON.stringify(opp)}`);

if (sectionStats('opposites')[0].label !== 'SC% vs FTS%') throw new Error('Opposite section stats should name the pairs.');

// ---- grading Unity: DA-graded (B / E) ÷ graded teams; ungraded excluded ----
const gradeRows = [
  { grade: 'A', da: false },
  { grade: 'B', da: true },
  { grade: 'E', da: true },
  { grade: null, da: false },
] as unknown as TeamGradeRow[];
const gu = gradingUnity(gradeRows);
if (gu.graded !== 3 || gu.da !== 2 || Math.round((gu.unity ?? 0) * 100) !== 67) {
  throw new Error(`Grading Unity should be 2 DA of 3 graded ≈ 0.67: ${JSON.stringify(gu)}`);
}
if (gradingUnity([]).unity !== null) throw new Error('No graded teams → Unity null.');

console.log('✓ Unity: bands, league/super-league fraction, section measures, grading DA share.');
