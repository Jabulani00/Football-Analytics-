/**
 * Stats Grading engine — the authoritative "Stats grading" document, nothing else.
 *
 * It reads the live stat tables that services/statsBuilder.ts already produces
 * for one competition and grades each team A–F for a chosen statistic, within a
 * chosen source list (the game window). It does not scan leagues, rank across
 * competitions, or invent any filter the document does not define. The only
 * filters are the ones in the document: the source list, the strong/weak
 * direction, the letter / Roman grade, and the percentage bands.
 *
 * Pure: no network, no React.
 */
import type { TeamStatRow, TeamStatsExport } from '@/types/data';

/* ---- percentage bands (document: 60-100 ↑ · 40-59 MID · 0-39 ↓) ---- */
export const BAND_UP = 60;
export const BAND_MID = 40;
/** Teams under this many games are shown but flagged as a thin sample. */
export const MIN_SAMPLE = 5;

export type Direction = 'up' | 'mid' | 'down';

export function directionOf(value: number): Direction {
  if (value >= BAND_UP) return 'up';
  if (value >= BAND_MID) return 'mid';
  return 'down';
}

/* ---- letter grades A–F ---- */
export type Grade = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
export const STRONG_GRADES: readonly Grade[] = ['A', 'B', 'C'];
export const WEAK_GRADES: readonly Grade[] = ['D', 'E', 'F'];
/** B and E are the Double Agents (document marks them "DA"). */
export const DA_GRADES: readonly Grade[] = ['B', 'E'];

export function isStrong(grade: Grade): boolean {
  return STRONG_GRADES.includes(grade);
}

/**
 * The six canonical grades, straight from the document (Home direction read
 * against Overall direction):
 *   Strong  A = H↑ & overall↑
 *           B = H↑ & overall MID            (DA)
 *           C = H MID & overall MID, above the league average
 *   Weak    D = H MID & overall MID, below the league average
 *           E = H↓ & overall↑              (DA)
 *           F = H↓ & overall↓
 * A combination the document does not name returns null (not graded).
 */
export function gradeFor(
  homeValue: number | null,
  overallValue: number | null,
  leagueValue: number | null,
): { grade: Grade; da: boolean } | null {
  if (homeValue == null || overallValue == null) return null;
  const h = directionOf(homeValue);
  const o = directionOf(overallValue);
  if (h === 'up' && o === 'up') return { grade: 'A', da: false };
  if (h === 'up' && o === 'mid') return { grade: 'B', da: true };
  if (h === 'mid' && o === 'mid') {
    const aboveLeague = leagueValue == null ? overallValue >= BAND_MID : overallValue >= leagueValue;
    return aboveLeague ? { grade: 'C', da: false } : { grade: 'D', da: false };
  }
  if (h === 'down' && o === 'up') return { grade: 'E', da: true };
  if (h === 'down' && o === 'down') return { grade: 'F', da: false };
  return null;
}

/* ---- source lists (the game windows) ----
 * The document's source list is the ONLY scope: which games feed the stat.
 * Paired windows ("last 10 & 8", "last 6 & 5") are combined by averaging the
 * available windows' percentage before grading, so both windows feed the grade.
 */
export type SourceListId = 1 | 2 | 3;

export type SourceList = {
  id: SourceListId;
  label: string;
  note: string;
  /** statsBuilder table prefixes to read for this source. */
  windows: string[];
};

export const SOURCE_LISTS: SourceList[] = [
  { id: 1, label: 'All games', note: 'Full season sample', windows: ['ordinary'] },
  { id: 2, label: 'Last 10 & 8', note: 'Average of the last-10 and last-8 windows', windows: ['last10', 'last8'] },
  { id: 3, label: 'Last 6 & 5', note: 'Average of the last-6 and last-5 windows', windows: ['last6', 'last5'] },
];

export function sourceListById(id: SourceListId): SourceList {
  return SOURCE_LISTS.find((s) => s.id === id) ?? SOURCE_LISTS[0];
}

/* ---- Roman combined list (source list × letter → Roman grade) ---- */
export type RomanGrade = 'I' | 'II' | 'III' | 'IV' | 'V' | 'VI' | 'VII';

export type RomanRule = { roman: RomanGrade; sourceList: SourceListId; letter: Grade; da: boolean };

export const STRONG_COMBINED: RomanRule[] = [
  { roman: 'I', sourceList: 1, letter: 'A', da: false },
  { roman: 'II', sourceList: 1, letter: 'B', da: true },
  { roman: 'III', sourceList: 2, letter: 'A', da: false },
  { roman: 'IV', sourceList: 2, letter: 'B', da: true },
  { roman: 'V', sourceList: 1, letter: 'C', da: false },
  { roman: 'VI', sourceList: 2, letter: 'C', da: false },
  { roman: 'VII', sourceList: 3, letter: 'A', da: false },
];

export const WEAK_COMBINED: RomanRule[] = [
  { roman: 'I', sourceList: 1, letter: 'F', da: false },
  { roman: 'II', sourceList: 1, letter: 'E', da: true },
  { roman: 'III', sourceList: 2, letter: 'F', da: false },
  { roman: 'IV', sourceList: 2, letter: 'E', da: true },
  { roman: 'V', sourceList: 1, letter: 'D', da: false },
  { roman: 'VI', sourceList: 2, letter: 'D', da: false },
  { roman: 'VII', sourceList: 3, letter: 'F', da: false },
];

export function resolveRoman(
  direction: 'strong' | 'weak',
  sourceList: SourceListId,
  letter: Grade,
): RomanGrade | null {
  const table = direction === 'strong' ? STRONG_COMBINED : WEAK_COMBINED;
  return table.find((r) => r.sourceList === sourceList && r.letter === letter)?.roman ?? null;
}

/* ---- the stats eligible for grading (percentage stats only) ----
 * Raw averages (sc/m, conc/m, avg goals) are excluded — the % bands do not
 * apply to them. Each stat is graded on its own direction.
 */
export const GRADABLE_STATS: { key: string; label: string }[] = [
  { key: 'sc_pct', label: 'Scored (SC%)' },
  { key: 'conc_pct', label: 'Conceded (Conc%)' },
  { key: 'btts_yes', label: 'BTTS Yes' },
  { key: 'btts_no', label: 'BTTS No' },
  { key: 'cs_pct', label: 'Clean Sheet' },
  { key: 'fts_pct', label: 'Failed To Score' },
  { key: 'w_pct', label: 'Win' },
  { key: 'd_pct', label: 'Draw' },
  { key: 'l_pct', label: 'Loss' },
  { key: 'over15', label: 'Over 1.5' },
  { key: 'over25', label: 'Over 2.5' },
  { key: 'over35', label: 'Over 3.5' },
  { key: 'under15', label: 'Under 1.5' },
  { key: 'under25', label: 'Under 2.5' },
  { key: 'under35', label: 'Under 3.5' },
  { key: 'scoring_05', label: 'Scoring 0.5+' },
  { key: 'conceding_05', label: 'Conceding 0.5+' },
  { key: 'scoring_15', label: 'Scoring 1.5+' },
  { key: 'conceding_15', label: 'Conceding 1.5+' },
  { key: 'scored_first', label: 'Scored First' },
  { key: 'conceded_first', label: 'Conceded First' },
];

export function gradableStatLabel(key: string): string {
  return GRADABLE_STATS.find((s) => s.key === key)?.label ?? key;
}

/* ---- grading a competition's teams for one stat + source list ---- */

export type GradedTeam = {
  team: string;
  teamId: number | null;
  competition: string;
  /** Games behind the longest window of the source — the sample for the grade. */
  sample: number | null;
  statKey: string;
  statLabel: string;
  sourceList: SourceListId;
  grade: Grade;
  letter: Grade;
  da: boolean;
  direction: 'strong' | 'weak';
  roman: RomanGrade | null;
  /** The averaged percentages that were graded. */
  homeValue: number;
  overallValue: number;
  leagueValue: number | null;
};

/**
 * A row for every team, graded or not. `grade` is null when the home/overall
 * combination is not one the document names, or when the window lacks data —
 * such teams are shown plainly, never fabricated into a grade.
 */
export type TeamGradeRow = {
  team: string;
  teamId: number | null;
  competition: string;
  sample: number | null;
  statKey: string;
  statLabel: string;
  sourceList: SourceListId;
  grade: Grade | null;
  letter: Grade | null;
  da: boolean;
  direction: 'strong' | 'weak' | null;
  roman: RomanGrade | null;
  homeValue: number | null;
  overallValue: number | null;
  leagueValue: number | null;
};

function numAt(row: TeamStatRow | undefined, key: string): number | null {
  if (!row) return null;
  const cell = row[key];
  return typeof cell === 'number' && Number.isFinite(cell) ? cell : null;
}

function teamKey(row: TeamStatRow): string {
  return String(row.team_name).trim().toLowerCase();
}

/** Mean of the finite values; null when none are present. */
function mean(values: (number | null)[]): number | null {
  const finite = values.filter((v): v is number => v != null);
  if (finite.length === 0) return null;
  return finite.reduce((a, b) => a + b, 0) / finite.length;
}

/**
 * Every team in one competition's live export, with a grade where the document
 * allows one and null where it does not. Nothing is fabricated: a team with an
 * unnamed home/overall combination, or missing window data, keeps grade null.
 */
export function gradeAllTeamsForStat(
  stats: TeamStatsExport,
  sourceList: SourceListId,
  statKey: string,
  competition: string,
): TeamGradeRow[] {
  const source = sourceListById(sourceList);
  const statLabel = gradableStatLabel(statKey);
  const leagueAvg = stats.tables['league_avg_ft_overall']?.[0];
  const leagueValue = numAt(leagueAvg, statKey);

  const overallByWindow = source.windows.map((w) => stats.tables[`${w}_ft_overall`] ?? []);
  const homeByWindow = source.windows.map((w) => new Map((stats.tables[`${w}_ft_home`] ?? []).map((r) => [teamKey(r), r])));
  const overallMaps = overallByWindow.map((rows) => new Map(rows.map((r) => [teamKey(r), r])));

  // Union of teams across the source's windows.
  const order: string[] = [];
  const seen = new Set<string>();
  for (const rows of overallByWindow) {
    for (const r of rows) {
      const k = teamKey(r);
      if (!seen.has(k)) {
        seen.add(k);
        order.push(k);
      }
    }
  }

  const out: TeamGradeRow[] = [];
  for (const key of order) {
    const overallRows = overallMaps.map((m) => m.get(key));
    const homeRows = homeByWindow.map((m) => m.get(key));
    const overallValue = mean(overallRows.map((r) => numAt(r, statKey)));
    const homeValue = mean(homeRows.map((r) => numAt(r, statKey)));
    const graded = gradeFor(homeValue, overallValue, leagueValue);
    const direction = graded ? (isStrong(graded.grade) ? 'strong' : 'weak') : null;

    const primaryOverall = overallRows.find((r) => r != null);
    const sampleRaw = primaryOverall?.['sample_size'];
    const sample = typeof sampleRaw === 'number' && Number.isFinite(sampleRaw) ? sampleRaw : null;
    const teamIdRaw = primaryOverall?.['team_id'];
    const teamId = typeof teamIdRaw === 'number' && Number.isFinite(teamIdRaw) ? teamIdRaw : null;
    const name = String(primaryOverall?.team_name ?? key);

    out.push({
      team: name,
      teamId,
      competition,
      sample,
      statKey,
      statLabel,
      sourceList,
      grade: graded?.grade ?? null,
      letter: graded?.grade ?? null,
      da: graded?.da ?? false,
      direction,
      roman: graded && direction ? resolveRoman(direction, sourceList, graded.grade) : null,
      homeValue,
      overallValue,
      leagueValue,
    });
  }
  return out;
}

/**
 * The graded subset only — teams the document actually classifies. Used where a
 * guaranteed grade and percentages are needed (e.g. tests, ranking).
 */
export function gradeTeamsForStat(
  stats: TeamStatsExport,
  sourceList: SourceListId,
  statKey: string,
  competition: string,
): GradedTeam[] {
  return gradeAllTeamsForStat(stats, sourceList, statKey, competition).filter(
    (r): r is GradedTeam => r.grade != null && r.homeValue != null && r.overallValue != null,
  );
}

const GRADE_ORDER: Record<Grade, number> = { A: 0, B: 1, C: 2, D: 3, E: 4, F: 5 };

/** Sort graded teams: by grade (A→F), then overall % desc, thin samples last. */
export function sortGraded(rows: GradedTeam[]): GradedTeam[] {
  return [...rows].sort((a, b) => {
    const aLead = (a.sample ?? 0) >= MIN_SAMPLE;
    const bLead = (b.sample ?? 0) >= MIN_SAMPLE;
    if (aLead !== bLead) return aLead ? -1 : 1;
    return (
      GRADE_ORDER[a.grade] - GRADE_ORDER[b.grade] ||
      b.overallValue - a.overallValue ||
      a.team.localeCompare(b.team)
    );
  });
}

/** Sort any rows: graded first (A→F, then overall % desc), ungraded last. */
export function sortRows(rows: TeamGradeRow[]): TeamGradeRow[] {
  return [...rows].sort((a, b) => {
    const ag = a.grade != null;
    const bg = b.grade != null;
    if (ag !== bg) return ag ? -1 : 1;
    if (a.grade != null && b.grade != null) {
      const byGrade = GRADE_ORDER[a.grade] - GRADE_ORDER[b.grade];
      if (byGrade !== 0) return byGrade;
    }
    return (b.overallValue ?? -1) - (a.overallValue ?? -1) || a.team.localeCompare(b.team);
  });
}

/** Count of each letter grade across rows (ungraded excluded). */
export function gradeDistribution(rows: TeamGradeRow[]): Record<Grade, number> {
  const dist: Record<Grade, number> = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 };
  for (const r of rows) if (r.grade) dist[r.grade] += 1;
  return dist;
}

/* ---- upcoming fixtures: a team's next match and its opponent's grade ---- */

export type UpcomingLite = {
  id: number;
  kickoffUnix: number;
  kickoff: string;
  competition: string;
  homeId: number | null;
  homeName: string;
  awayId: number | null;
  awayName: string;
};

export function normaliseTeam(name: string): string {
  return name.trim().toLowerCase();
}

export type NextFixture = {
  fixture: UpcomingLite;
  side: 'home' | 'away';
  opponentName: string;
  opponentId: number | null;
};

/** The earliest upcoming fixture a team appears in, with the side it plays. */
export function nextFixtureFor(
  teamId: number | null,
  teamName: string,
  fixtures: UpcomingLite[],
): NextFixture | null {
  const name = normaliseTeam(teamName);
  let best: NextFixture | null = null;
  for (const fx of fixtures) {
    const isHome = (teamId != null && fx.homeId === teamId) || normaliseTeam(fx.homeName) === name;
    const isAway = (teamId != null && fx.awayId === teamId) || normaliseTeam(fx.awayName) === name;
    if (!isHome && !isAway) continue;
    const side: 'home' | 'away' = isHome ? 'home' : 'away';
    const candidate: NextFixture = {
      fixture: fx,
      side,
      opponentName: isHome ? fx.awayName : fx.homeName,
      opponentId: isHome ? fx.awayId : fx.homeId,
    };
    if (!best || fx.kickoffUnix < best.fixture.kickoffUnix) best = candidate;
  }
  return best;
}

export type RowIndex = { byId: Map<number, TeamGradeRow>; byName: Map<string, TeamGradeRow> };

/** Index graded rows so an opponent can be looked up by id or name. */
export function indexRowsByTeam(rows: TeamGradeRow[]): RowIndex {
  const byId = new Map<number, TeamGradeRow>();
  const byName = new Map<string, TeamGradeRow>();
  for (const r of rows) {
    if (r.teamId != null && !byId.has(r.teamId)) byId.set(r.teamId, r);
    const key = normaliseTeam(r.team);
    if (!byName.has(key)) byName.set(key, r);
  }
  return { byId, byName };
}

export function lookupRow(index: RowIndex, id: number | null, name: string): TeamGradeRow | null {
  if (id != null && index.byId.has(id)) return index.byId.get(id) ?? null;
  return index.byName.get(normaliseTeam(name)) ?? null;
}
