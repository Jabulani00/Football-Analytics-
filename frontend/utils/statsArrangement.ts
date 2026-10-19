/**
 * Stats Arrangement grading — the "call-out" engine.
 *
 * Pure, no network, no React. It takes the live stat tables that
 * services/statsBuilder.ts already produces (ordinary_ft_overall / _home / _away
 * and league_avg_ft_overall) and grades every team A–F exactly as the strategy
 * notes describe, then counts how strong each team reads across the stat
 * catalogue so teams and fixtures can be ranked.
 *
 * Nothing here recomputes a stat — it only reads values already built elsewhere
 * and classifies them.
 */
import type { TeamStatRow, TeamStatsExport } from '@/types/data';

/** A–F, read Home direction against Overall direction (see GRADE_RULES). */
export type ArrangementGrade = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

/** Strong grades call the team out; weak grades are the mirror image. */
export const STRONG_GRADES: readonly ArrangementGrade[] = ['A', 'B', 'C'];
export const WEAK_GRADES: readonly ArrangementGrade[] = ['D', 'E', 'F'];
/** B and E are the Double Agents: strong/weak on Home but middling Overall. */
export const DA_GRADES: readonly ArrangementGrade[] = ['B', 'E'];

/** Method 1 percentage bands from the notes: 60–100 ↑ · 40–59 (m) · 0–39 ↓. */
export const BAND_UP = 60;
export const BAND_MID = 40;

/** Teams under this many games are listed but flagged as a thin sample. */
export const MIN_SAMPLE = 5;

export type Direction = 'up' | 'mid' | 'down';

export function directionOf(value: number): Direction {
  if (value >= BAND_UP) return 'up';
  if (value >= BAND_MID) return 'mid';
  return 'down';
}

/**
 * The six canonical grades. A combination the notes do not name (e.g. Home ↑ but
 * Overall ↓) returns null and is simply not counted — the arrangement only
 * speaks where the strategy speaks.
 */
export function gradeFor(
  homeValue: number | null,
  overallValue: number | null,
  leagueValue: number | null,
): { grade: ArrangementGrade; da: boolean } | null {
  if (homeValue == null || overallValue == null) return null;
  const h = directionOf(homeValue);
  const o = directionOf(overallValue);
  if (h === 'up' && o === 'up') return { grade: 'A', da: false };
  if (h === 'up' && o === 'mid') return { grade: 'B', da: true };
  if (h === 'mid' && o === 'mid') {
    // C vs D splits on whether the stat sits above the league average.
    const aboveLeague = leagueValue == null ? overallValue >= BAND_MID : overallValue >= leagueValue;
    return aboveLeague ? { grade: 'C', da: false } : { grade: 'D', da: false };
  }
  if (h === 'down' && o === 'mid') return { grade: 'E', da: true };
  if (h === 'down' && o === 'down') return { grade: 'F', da: false };
  return null;
}

/**
 * Percentage stats graded across the catalogue. Raw averages (sc/m, conc/m,
 * avg goals) are excluded because the % bands do not apply to them. Each stat is
 * read on its own direction — a high value is "strong in that stat", not "good".
 */
export const CATALOGUE_STATS: { key: string; label: string }[] = [
  { key: 'sc_pct', label: 'SC%' },
  { key: 'conc_pct', label: 'Conc%' },
  { key: 'btts_yes', label: 'BTTS Yes' },
  { key: 'btts_no', label: 'BTTS No' },
  { key: 'cs_pct', label: 'CS' },
  { key: 'fts_pct', label: 'FTS' },
  { key: 'w_pct', label: 'W' },
  { key: 'd_pct', label: 'D' },
  { key: 'l_pct', label: 'L' },
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

export type GradedStat = {
  key: string;
  label: string;
  grade: ArrangementGrade;
  da: boolean;
  homeValue: number;
  overallValue: number;
};

export type RankedTeam = {
  team: string;
  teamId: number | null;
  competitionId: number;
  competition: string;
  sample: number | null;
  /** Count of stats graded A/B/C and D/E/F. */
  strong: number;
  weak: number;
  aCount: number;
  daCount: number;
  /** Strong stats only, A-first, for display. */
  strongStats: GradedStat[];
};

function numAt(row: TeamStatRow | undefined, key: string): number | null {
  if (!row) return null;
  const cell = row[key];
  return typeof cell === 'number' && Number.isFinite(cell) ? cell : null;
}

function teamKey(row: TeamStatRow): string {
  return String(row.team_name).trim().toLowerCase();
}

const GRADE_ORDER: Record<ArrangementGrade, number> = { A: 0, B: 1, C: 2, D: 3, E: 4, F: 5 };

/**
 * Grade every team in one competition's live export across CATALOGUE_STATS.
 * Returns one RankedTeam per team that has a gradeable Overall row.
 */
export function gradeCompetition(
  stats: TeamStatsExport,
  competitionId: number,
  competition: string,
): RankedTeam[] {
  const overall = stats.tables['ordinary_ft_overall'] ?? [];
  const home = stats.tables['ordinary_ft_home'] ?? [];
  const leagueAvg = stats.tables['league_avg_ft_overall']?.[0];
  const homeByTeam = new Map(home.map((row) => [teamKey(row), row]));

  const ranked: RankedTeam[] = [];
  for (const overallRow of overall) {
    const homeRow = homeByTeam.get(teamKey(overallRow));
    const strongStats: GradedStat[] = [];
    let strong = 0;
    let weak = 0;
    let aCount = 0;
    let daCount = 0;

    for (const { key, label } of CATALOGUE_STATS) {
      const overallValue = numAt(overallRow, key);
      const homeValue = numAt(homeRow, key);
      const leagueValue = numAt(leagueAvg, key);
      const graded = gradeFor(homeValue, overallValue, leagueValue);
      if (!graded) continue;
      const isStrong = STRONG_GRADES.includes(graded.grade);
      if (isStrong) {
        strong += 1;
        if (graded.grade === 'A') aCount += 1;
        strongStats.push({
          key,
          label,
          grade: graded.grade,
          da: graded.da,
          homeValue: homeValue as number,
          overallValue: overallValue as number,
        });
      } else {
        weak += 1;
      }
      if (graded.da) daCount += 1;
    }

    strongStats.sort((a, b) => GRADE_ORDER[a.grade] - GRADE_ORDER[b.grade] || b.overallValue - a.overallValue);

    const sampleRaw = overallRow['sample_size'];
    const sample = typeof sampleRaw === 'number' && Number.isFinite(sampleRaw) ? sampleRaw : null;
    const teamIdRaw = overallRow['team_id'];
    const teamId = typeof teamIdRaw === 'number' && Number.isFinite(teamIdRaw) ? teamIdRaw : null;

    ranked.push({
      team: String(overallRow.team_name),
      teamId,
      competitionId,
      competition,
      sample,
      strong,
      weak,
      aCount,
      daCount,
      strongStats,
    });
  }
  return ranked;
}

/**
 * Merge per-competition rankings and order them: most strong stats first, then
 * A-grades, then Double Agents, then the fuller sample. Teams under MIN_SAMPLE
 * sink below those that clear it so thin samples never top the call-out.
 */
export function rankTeams(groups: RankedTeam[][]): RankedTeam[] {
  const all = groups.flat();
  return all.sort((a, b) => {
    const aLead = (a.sample ?? 0) >= MIN_SAMPLE;
    const bLead = (b.sample ?? 0) >= MIN_SAMPLE;
    if (aLead !== bLead) return aLead ? -1 : 1;
    return (
      b.strong - a.strong ||
      b.aCount - a.aCount ||
      b.daCount - a.daCount ||
      (b.sample ?? 0) - (a.sample ?? 0) ||
      a.team.localeCompare(b.team)
    );
  });
}

/** Normalised team name for matching a graded team to an upcoming fixture. */
export function normaliseTeam(name: string): string {
  return name.trim().toLowerCase();
}

export type RankedMatch = {
  fixtureId: number;
  kickoffUnix: number;
  kickoff: string;
  competition: string;
  homeName: string;
  awayName: string;
  home: RankedTeam | null;
  away: RankedTeam | null;
  /** Combined strong count of the two sides — drives match ranking. */
  combinedStrong: number;
};

export type UpcomingFixtureLite = {
  id: number;
  kickoffUnix: number;
  kickoff: string;
  competition: string;
  homeId: number | null;
  homeName: string;
  awayId: number | null;
  awayName: string;
};

function indexTeams(teams: RankedTeam[]): { byId: Map<number, RankedTeam>; byName: Map<string, RankedTeam> } {
  const byId = new Map<number, RankedTeam>();
  const byName = new Map<string, RankedTeam>();
  for (const team of teams) {
    if (team.teamId != null && !byId.has(team.teamId)) byId.set(team.teamId, team);
    const key = normaliseTeam(team.team);
    if (!byName.has(key)) byName.set(key, team);
  }
  return { byId, byName };
}

export function lookupTeam(
  index: { byId: Map<number, RankedTeam>; byName: Map<string, RankedTeam> },
  id: number | null,
  name: string,
): RankedTeam | null {
  if (id != null && index.byId.has(id)) return index.byId.get(id) ?? null;
  return index.byName.get(normaliseTeam(name)) ?? null;
}

/**
 * Attach graded teams to their upcoming fixtures. Only fixtures where at least
 * one side is a graded team are returned, sorted by combined strength then
 * kickoff — the "relate team with current fixture" step from the notes.
 */
export function rankMatches(teams: RankedTeam[], fixtures: UpcomingFixtureLite[]): RankedMatch[] {
  const index = indexTeams(teams);
  const matches: RankedMatch[] = [];
  for (const fx of fixtures) {
    const home = lookupTeam(index, fx.homeId, fx.homeName);
    const away = lookupTeam(index, fx.awayId, fx.awayName);
    if (!home && !away) continue;
    matches.push({
      fixtureId: fx.id,
      kickoffUnix: fx.kickoffUnix,
      kickoff: fx.kickoff,
      competition: fx.competition,
      homeName: fx.homeName,
      awayName: fx.awayName,
      home: home ?? null,
      away: away ?? null,
      combinedStrong: (home?.strong ?? 0) + (away?.strong ?? 0),
    });
  }
  return matches.sort((a, b) => b.combinedStrong - a.combinedStrong || a.kickoffUnix - b.kickoffUnix);
}

/** Earliest upcoming fixture for a given graded team, with the side it plays. */
export function nextFixtureForTeam(
  team: RankedTeam,
  fixtures: UpcomingFixtureLite[],
): { fixture: UpcomingFixtureLite; side: 'home' | 'away'; opponent: string } | null {
  const id = team.teamId;
  const name = normaliseTeam(team.team);
  let best: { fixture: UpcomingFixtureLite; side: 'home' | 'away'; opponent: string } | null = null;
  for (const fx of fixtures) {
    const isHome = (id != null && fx.homeId === id) || normaliseTeam(fx.homeName) === name;
    const isAway = (id != null && fx.awayId === id) || normaliseTeam(fx.awayName) === name;
    if (!isHome && !isAway) continue;
    const side: 'home' | 'away' = isHome ? 'home' : 'away';
    const opponent = isHome ? fx.awayName : fx.homeName;
    if (!best || fx.kickoffUnix < best.fixture.kickoffUnix) best = { fixture: fx, side, opponent };
  }
  return best;
}
