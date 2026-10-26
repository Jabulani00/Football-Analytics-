import {
  daBand,
  leagueUnity,
  leagueUnityFor,
  superLeagueUnity,
  measuresForSection,
  teamMeasuresForSection,
  assignLeagueTiers,
  buildSuperLeague,
  sectionStats,
  gradingUnity,
  NONE_MAX,
  DA_MIN,
  type TeamMeasure,
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

// ---- team measures keep identity + peak/smaller; measuresForSection still returns the numbers ----
const tm = teamMeasuresForSection(stats, 'homeaway', 'sc_pct');
if (tm[0].team !== 'Alpha' || tm[0].measure !== 40) throw new Error(`Team measures should keep names: ${JSON.stringify(tm)}`);
if (tm[0].peak !== 90 || tm[0].smaller !== 50) throw new Error(`Peak/smaller are the two side values (90/50): ${JSON.stringify(tm[0])}`);
if (measuresForSection(stats, 'homeaway', 'sc_pct').join(',') !== '40,5') throw new Error('measuresForSection still returns the plain numbers.');

// ---- league tiers: three deterministic thirds (top/middle/bottom) ----
const ranked = [{ competition: 'A' }, { competition: 'B' }, { competition: 'C' }, { competition: 'D' }, { competition: 'E' }, { competition: 'F' }];
const tiers = assignLeagueTiers(ranked);
if (tiers.get('A') !== 'top' || tiers.get('B') !== 'top') throw new Error('First third → top.');
if (tiers.get('C') !== 'middle' || tiers.get('D') !== 'middle') throw new Error('Middle third → middle.');
if (tiers.get('E') !== 'bottom' || tiers.get('F') !== 'bottom') throw new Error('Last third → bottom.');

// ---- super league: teams across leagues, Unity = Peak − Smaller, DA = peak, multiple = DA ÷ Unity ----
const perLeague: { competition: string; teams: TeamMeasure[] }[] = [
  { competition: 'A', teams: [
    { team: 'A1', teamId: 1, measure: 40, peak: 70, smaller: 30 },
    { team: 'A2', teamId: 2, measure: 10, peak: 55, smaller: 45 },
  ] },
  { competition: 'C', teams: [
    { team: 'C1', teamId: 3, measure: 55, peak: 80, smaller: 25 },
    { team: 'C2', teamId: 4, measure: null, peak: null, smaller: null },
  ] },
];
const sup = buildSuperLeague(perLeague, tiers);
if (sup.length !== 3) throw new Error('Teams with no sides are dropped.');
if (sup[0].team !== 'C1' || sup[0].overallRank !== 1 || sup[0].unity !== 55) throw new Error('Biggest Unity (gap) ranks first overall.');
if (sup[0].da !== 80) throw new Error('DA is the peak statistic (80).');
if (Math.abs((sup[0].multiple ?? 0) - 80 / 55) > 1e-9) throw new Error(`Multiple = DA ÷ Unity = 80/55: ${sup[0].multiple}`);
if (sup[0].tier !== 'middle') throw new Error('C1 carries its league tier (C = middle).');
if (sup[0].leagueRank !== 1) throw new Error('C1 is rank 1 in its own league.');
const a2 = sup.find((r) => r.team === 'A2')!;
if (a2.leagueRank !== 2 || a2.unity !== 10 || a2.band !== 'none') throw new Error(`A2 is 2nd in league A, Unity 10 = none: ${JSON.stringify(a2)}`);
// Division-by-zero guard: equal sides → Unity 0 → multiple null.
const zero = buildSuperLeague([{ competition: 'A', teams: [{ team: 'Z', teamId: 9, measure: 0, peak: 50, smaller: 50 }] }], tiers);
if (zero[0].unity !== 0 || zero[0].multiple !== null) throw new Error('Unity 0 → multiple null (no divide by zero).');

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
