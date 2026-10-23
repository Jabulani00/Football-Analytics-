/**
 * Stats Grading — Method 2.
 *
 * Same grading concept as Method 1, but laid out as the grading document's
 * Method-2 grid: the ROWS are the fixed combined grades (Roman numeral + source
 * list + strong/weak letter — e.g. "I · 1.A", "III · 2.A"), and the COLUMNS are
 * the stat families the app already builds (Ordinary, + Series, Ordinary + RFS,
 * Series + RFS). Each team is graded on the chosen statistic across all three
 * source lists and dropped into the matching grade rows; the family signals say
 * how that team reads in each column. Grade / source / strong-weak are the row
 * identity here, not filters.
 *
 * Pure: it only composes engines that already exist. No network, no React.
 */
import type { TeamStatsExport } from '@/types/data';
import type { CountedGame } from '@/utils/countedGames';
import { liveRowsToDisplay } from '@/utils/statsTableAdapter';
import { buildMixedRfs } from '@/utils/mixedRfs';
import { SERIES_DEFS, runLength } from '@/utils/fixtureSeries';
import type { TeamResult } from '@/utils/teamResults';
import {
  gradeAllTeamsForStat,
  normaliseTeam,
  STRONG_COMBINED,
  WEAK_COMBINED,
  type RomanRule,
  type SourceListId,
} from '@/utils/statsGrading';

/** A current consecutive-match run worth naming (3+ matches, per the series rule). */
export type SeriesSignal = { label: string; run: number };
export const SERIES_MIN_RUN = 3;
/** The series column reads the last 10 & 8 games window (source list 2). */
export const SERIES_WINDOW = 10;

/**
 * Strongest current run across the series catalogue, measured over the team's
 * last `SERIES_WINDOW` games (the "last 10 & 8" window), not the whole season.
 */
function strongestSeriesLast10(games: CountedGame[]): SeriesSignal | null {
  const recent = [...games]
    .sort((a, b) => b.unix - a.unix)
    .slice(0, SERIES_WINDOW)
    .flatMap((g): TeamResult[] =>
      g.ftFor == null || g.ftAgainst == null ? [] : [{ gf: g.ftFor, ga: g.ftAgainst } as TeamResult],
    );
  if (recent.length < SERIES_MIN_RUN) return null;
  let best: SeriesSignal | null = null;
  for (const def of SERIES_DEFS) {
    const pred = def.invert ? (r: TeamResult) => !def.hit(r) : def.hit;
    const run = runLength(recent, pred);
    if (run >= SERIES_MIN_RUN && (!best || run > best.run)) {
      best = { label: `${def.label}${def.invert ? ' without' : ''}`, run };
    }
  }
  return best;
}

/** Per-team family signals, independent of the grade's source window. */
export type FamilySignals = {
  series: SeriesSignal | null;
  ordinaryRfs: string[];
  seriesRfs: SeriesSignal | null;
};

/** A team placed in a grade row, with its family-column signals and stat values. */
export type GridTeam = {
  team: string;
  teamId: number | null;
  competition: string;
  sourceList: SourceListId;
  homeValue: number;
  overallValue: number;
  leagueValue: number | null;
} & FamilySignals;

export type GradeBucket = RomanRule & {
  /** e.g. "I · 1.A". */
  label: string;
  teams: GridTeam[];
};

export type Method2Grid = { strong: GradeBucket[]; weak: GradeBucket[] };

const SOURCES: SourceListId[] = [1, 2, 3];

/** Read each team's Series / Ordinary-RFS / Series-RFS signals from the export. */
export function computeFamilySignals(stats: TeamStatsExport): Map<string, FamilySignals> {
  // RFS reads the newest game; series reads the last 10 & 8 window — both from
  // the full-season ordinary/series rows (their attached games).
  const ordinaryDisplay = liveRowsToDisplay(stats.tables['ordinary_ft_overall'] ?? [], 'ordinary');
  const seriesDisplay = liveRowsToDisplay(stats.tables['series_ft_overall'] ?? [], 'series');
  const rfs = buildMixedRfs(ordinaryDisplay, seriesDisplay, 'fulltime');
  const rfsByTeam = new Map(rfs.map((r) => [normaliseTeam(r.team), r]));

  const out = new Map<string, FamilySignals>();
  for (const oRow of ordinaryDisplay) {
    out.set(normaliseTeam(oRow.team), {
      series: strongestSeriesLast10(oRow.games ?? []),
      ordinaryRfs: [],
      seriesRfs: null,
    });
  }
  for (const [key, teamRfs] of rfsByTeam) {
    const base = out.get(key) ?? { series: null, ordinaryRfs: [], seriesRfs: null };
    base.ordinaryRfs = teamRfs.ordinary.map((o) => [o.label, ...o.alsoLabels].join(' + '));
    const brokenTop = teamRfs.series.slice().sort((a, b) => b.run - a.run)[0];
    base.seriesRfs = brokenTop ? { label: `${brokenTop.label}${brokenTop.without ? ' without' : ''}`, run: brokenTop.run } : null;
    out.set(key, base);
  }
  return out;
}

function emptyBuckets(rules: RomanRule[]): GradeBucket[] {
  return rules.map((rule) => ({ ...rule, label: `${rule.roman} · ${rule.sourceList}.${rule.letter}`, teams: [] }));
}

/**
 * Build the full Method-2 grid: fixed combined-grade rows (strong + weak), each
 * holding the teams that reach that grade on `statKey` using that row's source
 * list, with their family signals attached.
 */
export function buildMethod2Grid(
  stats: TeamStatsExport,
  statKey: string,
  competition: string,
): Method2Grid {
  const signals = computeFamilySignals(stats);
  const strong = emptyBuckets(STRONG_COMBINED);
  const weak = emptyBuckets(WEAK_COMBINED);

  for (const source of SOURCES) {
    const graded = gradeAllTeamsForStat(stats, source, statKey, competition);
    for (const g of graded) {
      if (g.grade == null || g.direction == null) continue;
      const buckets = g.direction === 'strong' ? strong : weak;
      const bucket = buckets.find((b) => b.sourceList === source && b.letter === g.grade);
      if (!bucket) continue;
      const fam = signals.get(normaliseTeam(g.team)) ?? { series: null, ordinaryRfs: [], seriesRfs: null };
      bucket.teams.push({
        team: g.team,
        teamId: g.teamId,
        competition,
        sourceList: source,
        homeValue: g.homeValue as number,
        overallValue: g.overallValue as number,
        leagueValue: g.leagueValue,
        ...fam,
      });
    }
  }

  const byValue = (a: GridTeam, b: GridTeam) => b.overallValue - a.overallValue || a.team.localeCompare(b.team);
  for (const b of [...strong, ...weak]) b.teams.sort(byValue);
  return { strong, weak };
}

/** Merge grids from several leagues into one (for "all leagues combined"). */
export function mergeGrids(grids: Method2Grid[]): Method2Grid {
  if (grids.length === 1) return grids[0];
  const base = buildEmptyGrid();
  for (const grid of grids) {
    grid.strong.forEach((b, i) => base.strong[i].teams.push(...b.teams));
    grid.weak.forEach((b, i) => base.weak[i].teams.push(...b.teams));
  }
  const byValue = (a: GridTeam, b: GridTeam) => b.overallValue - a.overallValue || a.team.localeCompare(b.team);
  for (const b of [...base.strong, ...base.weak]) b.teams.sort(byValue);
  return base;
}

function buildEmptyGrid(): Method2Grid {
  return { strong: emptyBuckets(STRONG_COMBINED), weak: emptyBuckets(WEAK_COMBINED) };
}
