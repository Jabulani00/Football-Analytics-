import {
  daBand,
  leagueUnity,
  leagueUnityFor,
  superLeagueUnity,
  measuresForSection,
  teamMeasuresForSection,
  assignLeagueTiers,
  buildSuperLeague,
  buildUniversalUnity,
  sectionStats,
  gradingUnity,
  NONE_MAX,
  DA_MIN,
  type TeamMeasure,
} from '../utils/unity';
import type { TeamStatRow, TeamStatsExport } from '../types/data';
import type { TeamGradeRow } from '../utils/statsGrading';
import { homeAwayValuesForStat } from '../utils/dominance';

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

// Gap Analytics reads only paired home/away figures and uses their absolute difference.
const gapRows = homeAwayValuesForStat(stats, 'sc_pct');
if (gapRows.length !== 2 || gapRows[0].team !== 'Alpha' || gapRows[0].home !== 90 || gapRows[0].away !== 50) {
  throw new Error(`Home/Away values should come from the selected side tables: ${JSON.stringify(gapRows)}`);
}
const alphaGap = Math.abs((gapRows[0].home ?? 0) - (gapRows[0].away ?? 0));
if (alphaGap !== 40) throw new Error(`Alpha's Home/Away Gap should be 40: ${alphaGap}`);

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

// ---- universal Unity: A Unity = (H−L)/N, rank allocation, normalized strength, tiers ----
const um = (team: string, peak: number): TeamMeasure => ({ team, teamId: null, measure: peak, peak, smaller: 0 });
const uni = buildUniversalUnity([
  { competition: 'A', teams: [um('A1', 90), um('A2', 60), um('A3', 30)] }, // H90 L30 range60 aUnity20
  { competition: 'B', teams: [um('B1', 80), um('B2', 20)] },               // H80 L20 range60 aUnity30
  { competition: 'C', teams: [um('C1', 50)] },                             // range0 aUnity0
  { competition: 'D', teams: [] },                                         // skipped
]);
const ula = uni.leagues.find((l) => l.competition === 'A')!;
if (ula.n !== 3 || ula.range !== 60 || ula.aUnity !== 20) throw new Error(`A: N3 range60 aUnity20: ${JSON.stringify(ula)}`);
const ulb = uni.leagues.find((l) => l.competition === 'B')!;
if (ulb.aUnity !== 30) throw new Error('B aUnity = 60/2 = 30.');
const ulc = uni.leagues.find((l) => l.competition === 'C')!;
if (ulc.range !== 0 || ulc.aUnity !== 0) throw new Error('Single-team league → range 0, aUnity 0 (no divide issue).');
if (uni.leagues.length !== 3) throw new Error('Empty league D is dropped.');
// A & B tie on avgStrength 0.5; A leads on more teams. Tiers over 3 leagues = one each.
if (uni.leagues[0].competition !== 'A' || uni.leagues[0].tier !== 'top') throw new Error('A tops (tie broken by team count) and is top tier.');
if (ulc.tier !== 'bottom') throw new Error('C is bottom tier.');

const ua1 = uni.teams.find((t) => t.team === 'A1')!;
if (ua1.value !== 90 || ua1.leagueValueRank !== 1 || ua1.indivUnity !== 40 || ua1.strength !== 1) {
  throw new Error(`A1: value90 rank1 indiv (3-1)*20=40 strength1: ${JSON.stringify(ua1)}`);
}
const ua3 = uni.teams.find((t) => t.team === 'A3')!;
if (ua3.indivUnity !== 0 || ua3.strength !== 0) throw new Error('Lowest team → indivUnity 0, strength 0.');
const ua2 = uni.teams.find((t) => t.team === 'A2')!;
if (ua2.strength !== 0.5) throw new Error('A2 (60) strength = (60-30)/60 = 0.5.');
if (uni.teams[0].strength !== 1) throw new Error('Strongest team leads the cross-league ranking.');

console.log('✓ Unity: bands, fraction, section measures, grading share, universal A-Unity/strength/tiers.');
