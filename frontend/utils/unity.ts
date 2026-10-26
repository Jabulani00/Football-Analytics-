/**
 * DA Unity Finder — the authoritative "DA FOUND IN 4 PLACES" definition.
 *
 * DA is read from a difference in three bands:
 *   0–15  = none DA · 16–24 = borderline (in-between) · 25–100 = DA.
 * Unity for a stat in a league is the share of that league's teams that are DA
 * on it: (# DA teams) ÷ (total teams). Across the "super league" of all leagues,
 * every stat has its own Unity, and leagues are ranked against each other (LL).
 *
 * This only measures and aggregates — the per-team differences come from the
 * existing Dominance and Opposite-Stats engines, nothing is recomputed here.
 *
 * Pure: no network, no React.
 */
import type { TeamStatRow, TeamStatsExport } from '@/types/data';
import { DOMINANCE_STATS, HALF_STATS, measureFor } from '@/utils/dominance';
import { OPPOSITE_PAIRS } from '@/utils/oppositeStats';
import type { TeamGradeRow } from '@/utils/statsGrading';

/** 0–15 = none · 16–24 = borderline · 25–100 = DA. */
export const NONE_MAX = 15;
export const DA_MIN = 25;

export type DaBand = 'da' | 'borderline' | 'none' | 'na';

export function daBand(measure: number | null): DaBand {
  if (measure == null) return 'na';
  const m = Math.abs(measure);
  if (m >= DA_MIN) return 'da';
  if (m <= NONE_MAX) return 'none';
  return 'borderline';
}

/** The four places DA is found; Colors has no data source in the app yet. */
export type UnitySection = 'homeaway' | 'halves' | 'opposites';

export function sectionStats(section: UnitySection): { key: string; label: string }[] {
  if (section === 'homeaway') return DOMINANCE_STATS.map((d) => ({ key: d.key, label: d.label }));
  if (section === 'halves') return HALF_STATS.map((d) => ({ key: d.key, label: d.label }));
  return OPPOSITE_PAIRS.map((p, i) => ({ key: String(i), label: `${p.aLabel} vs ${p.bLabel}` }));
}

function numAt(row: TeamStatRow | undefined, key: string): number | null {
  if (!row) return null;
  const cell = row[key];
  return typeof cell === 'number' && Number.isFinite(cell) ? cell : null;
}
function teamKey(name: string): string {
  return name.trim().toLowerCase();
}
function valueAt(stats: TeamStatsExport, family: string, period: string, scope: string, team: string, key: string): number | null {
  const rows = stats.tables[`${family}_${period}_${scope}`] ?? [];
  return numAt(rows.find((r) => teamKey(String(r.team_name)) === teamKey(team)), key);
}

/**
 * The per-team difference measures for a (section, stat) in one competition —
 * the same measures the Dominance / Opposites tables show, one per team.
 */
/**
 * The per-team reading for a (section, stat), keeping team identity.
 * `measure` is the existing classification magnitude (relative % for raw stats);
 * `peak`/`smaller` are the two side values so the spec's Unity = Peak − Smaller
 * and DA-to-Unity multiple can be computed.
 */
export type TeamMeasure = {
  team: string;
  teamId: number | null;
  measure: number | null;
  peak: number | null;
  smaller: number | null;
};

function peakSmaller(a: number | null, b: number | null): { peak: number | null; smaller: number | null } {
  if (a == null || b == null) return { peak: null, smaller: null };
  return { peak: Math.max(a, b), smaller: Math.min(a, b) };
}

export function teamMeasuresForSection(stats: TeamStatsExport, section: UnitySection, statKey: string): TeamMeasure[] {
  const teamRows = stats.tables['ordinary_ft_overall'] ?? [];
  const idOf = (r: TeamStatRow): number | null => {
    const x = r['team_id'];
    return typeof x === 'number' && Number.isFinite(x) ? x : null;
  };

  if (section === 'opposites') {
    const def = OPPOSITE_PAIRS[Number(statKey)];
    if (!def) return [];
    return teamRows.map((r) => {
      const a = numAt(r, def.aKey);
      const b = numAt(r, def.bKey);
      return { team: String(r.team_name), teamId: idOf(r), measure: a != null && b != null ? Math.abs(a - b) : null, ...peakSmaller(a, b) };
    });
  }

  const defs = section === 'homeaway' ? DOMINANCE_STATS : HALF_STATS;
  const def = defs.find((d) => d.key === statKey);
  if (!def) return [];
  return teamRows.map((r) => {
    const team = String(r.team_name);
    const a =
      section === 'homeaway'
        ? valueAt(stats, def.family, 'ft', 'home', team, def.key)
        : valueAt(stats, def.family, 'ht', 'overall', team, def.key);
    const b =
      section === 'homeaway'
        ? valueAt(stats, def.family, 'ft', 'away', team, def.key)
        : valueAt(stats, def.family, '2h', 'overall', team, def.key);
    return { team, teamId: idOf(r), measure: measureFor(a, b, def.pctBased), ...peakSmaller(a, b) };
  });
}

export function measuresForSection(stats: TeamStatsExport, section: UnitySection, statKey: string): (number | null)[] {
  return teamMeasuresForSection(stats, section, statKey).map((t) => t.measure);
}

export type LeagueUnity = {
  competition: string;
  /** Teams with a usable measure. */
  total: number;
  da: number;
  borderline: number;
  none: number;
  /** DA ÷ total — the league's Unity on this stat (null when no data). */
  unity: number | null;
};

export function leagueUnity(competition: string, measures: (number | null)[]): LeagueUnity {
  const valid = measures.filter((m): m is number => m != null);
  const da = valid.filter((m) => daBand(m) === 'da').length;
  const borderline = valid.filter((m) => daBand(m) === 'borderline').length;
  const none = valid.filter((m) => daBand(m) === 'none').length;
  return { competition, total: valid.length, da, borderline, none, unity: valid.length ? da / valid.length : null };
}

/** Convenience: Unity for one competition's (section, stat). */
export function leagueUnityFor(stats: TeamStatsExport, competition: string, section: UnitySection, statKey: string): LeagueUnity {
  return leagueUnity(competition, measuresForSection(stats, section, statKey));
}

export type SuperLeagueUnity = {
  /** Per-league Unity, ranked most-unified first. */
  leagues: LeagueUnity[];
  totalTeams: number;
  totalDa: number;
  /** DA ÷ total across every league — the super-league's Unity for this stat. */
  overallUnity: number | null;
};

/** Combine per-league Unity into the super-league ranking for a stat. */
export function superLeagueUnity(perLeague: LeagueUnity[]): SuperLeagueUnity {
  const leagues = perLeague
    .filter((l) => l.total > 0)
    .sort((a, b) => (b.unity ?? -1) - (a.unity ?? -1) || b.total - a.total || a.competition.localeCompare(b.competition));
  const totalTeams = leagues.reduce((s, l) => s + l.total, 0);
  const totalDa = leagues.reduce((s, l) => s + l.da, 0);
  return { leagues, totalTeams, totalDa, overallUnity: totalTeams ? totalDa / totalTeams : null };
}

/* ---- Grading Unity (Stats Grading / Method 2) ----
 * In the grading methods a team's "DA" is the Double-Agent grade (B or E), not a
 * ≥25 difference. Unity there is the same share idea: the fraction of the graded
 * teams that carry a DA grade. Only graded teams count (an ungraded team has no
 * reading on this stat), matching how the difference sections only count teams
 * that have a usable measure.
 */
export type GradingUnity = {
  /** Teams that received a grade for this stat. */
  graded: number;
  /** Teams graded as Double Agents (B / E). */
  da: number;
  /** DA ÷ graded — Unity on this stat for the grading method (null when none). */
  unity: number | null;
};

export function gradingUnity(rows: TeamGradeRow[]): GradingUnity {
  const graded = rows.filter((r) => r.grade != null);
  const da = graded.filter((r) => r.da).length;
  return { graded: graded.length, da, unity: graded.length ? da / graded.length : null };
}

/* ---- League tiers & the Super League table ----
 * Leagues (ranked best-first by Unity) are split into three deterministic thirds:
 * Top = green, Middle = yellow, Bottom = white. The Super League gathers every
 * team across leagues, ranked by its gap (Peak − Smaller = the measure).
 */
export type LeagueTier = 'top' | 'middle' | 'bottom';

/** Split already-ranked leagues into three approximately equal, deterministic tiers. */
export function assignLeagueTiers(ranked: { competition: string }[]): Map<string, LeagueTier> {
  const n = ranked.length;
  const m = new Map<string, LeagueTier>();
  ranked.forEach((l, i) => {
    const group = n === 0 ? 0 : Math.floor((i * 3) / n); // 0 = top third, 1 = middle, 2 = bottom
    m.set(l.competition, group <= 0 ? 'top' : group === 1 ? 'middle' : 'bottom');
  });
  return m;
}

export type SuperTeamRow = {
  team: string;
  teamId: number | null;
  competition: string;
  tier: LeagueTier | null;
  /** Peak statistic (the dominant side) — used as the numeric DA. */
  peak: number;
  /** Smaller statistic (the other side). */
  smaller: number;
  /** Spec's DA = peak statistic. */
  da: number;
  /** Spec's Unity = Peak − Smaller (the gap). */
  unity: number;
  /** DA ÷ Unity; null when Unity is 0 (no division by zero). */
  multiple: number | null;
  /** DA band from the existing classification magnitude (consistency with the app). */
  band: DaBand;
  /** 1-based rank across all leagues (by Unity, the gap). */
  overallRank: number;
  /** 1-based rank within its own league (by Unity). */
  leagueRank: number;
};

/**
 * Build the Super League table: every team across leagues. Unity = Peak − Smaller,
 * DA = peak, multiple = DA ÷ Unity (guarded). Ranked by Unity (the dominance gap);
 * a team with no usable sides is dropped. Teams stay tied to their league + tier.
 */
export function buildSuperLeague(
  perLeague: { competition: string; teams: TeamMeasure[] }[],
  tiers: Map<string, LeagueTier>,
): SuperTeamRow[] {
  type Valid = TeamMeasure & { peak: number; smaller: number };
  const rows: Omit<SuperTeamRow, 'overallRank'>[] = [];
  for (const lg of perLeague) {
    const valid = lg.teams
      .filter((t): t is Valid => t.peak != null && t.smaller != null)
      .sort((a, b) => b.peak - b.smaller - (a.peak - a.smaller) || a.team.localeCompare(b.team));
    valid.forEach((t, i) => {
      const unity = t.peak - t.smaller;
      rows.push({
        team: t.team,
        teamId: t.teamId,
        competition: lg.competition,
        tier: tiers.get(lg.competition) ?? null,
        peak: t.peak,
        smaller: t.smaller,
        da: t.peak,
        unity,
        multiple: unity === 0 ? null : t.peak / unity,
        band: daBand(t.measure ?? unity),
        leagueRank: i + 1,
      });
    });
  }
  const sorted = rows.sort((a, b) => b.unity - a.unity || a.competition.localeCompare(b.competition) || a.team.localeCompare(b.team));
  return sorted.map((r, i) => ({ ...r, overallRank: i + 1 }));
}
