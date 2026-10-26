/**
 * Colour verification — rank green, yellow and red by our own stat against
 * each colour, then test the opponent's colour with Strong or Weak.
 *
 * Strong numbers position 1 as our highest figure.
 * Weak numbers position 1 as our smallest figure, then up to the highest.
 * Ties share a position and the next one skips.
 * Strong passes at position 1 or 2. Weak passes at position 2 or 3.
 * The check is allowed only after we have played 3 matches against the
 * opponent's current colour.
 */
import { FT_ONLY_STATS, HALF_ONLY_STATS, PPG_STATS, SERIES_STATS, statOnMatches, type StatSliceMatch } from '@/services/statsBuilder';
import { SERIES_DEFS } from '@/utils/fixtureSeries';
import { bandOf, BANDS, type Band } from '@/utils/leagueTables';
import { DISPLAY_STATS } from '@/utils/statsTableAdapter';

export const MIN_COLOUR_OPPONENT_MATCHES = 3;

/** Event-level stats the fixture feed cannot fill. They never receive a rank. */
const NOT_RANKED = new Set([
  'handicap',
  'early_goals_1h',
  'early_goals_2h',
  'early_goals_conceded',
  'late_goals',
]);

const AVERAGE_KEYS = new Set(['sc_avg', 'conc_avg', 'avg_goals', 'half_avg', 'rescued_points', 'blown_points']);
const PPG_KEYS = new Set<string>(PPG_STATS);

const PPG_NAMES: Record<string, string> = {
  ppg: 'PPG',
  avg_pts: 'Average points',
  ppg_vs_green: 'PPG vs green',
  ppg_vs_yellow: 'PPG vs yellow',
  ppg_vs_red: 'PPG vs red',
};

const FT_NAMES: Record<string, string> = {
  btts_both_halves: 'BTTS both halves',
  scored_both_halves: 'Scored both halves',
  btts_over25: 'BTTS and over 2.5',
  conceded_both_halves: 'Conceded both halves',
  won_both_halves: 'Won both halves',
  win_to_nil: 'Win to nil',
  lost_to_nil: 'Lost to nil',
  rescued_points: 'Rescued points',
  blown_points: 'Blown points',
  htft_ww: 'HT/FT WW',
  htft_wd: 'HT/FT WD',
  htft_wl: 'HT/FT WL',
  htft_dw: 'HT/FT DW',
  htft_dd: 'HT/FT DD',
  htft_dl: 'HT/FT DL',
  htft_lw: 'HT/FT LW',
  htft_ld: 'HT/FT LD',
  htft_ll: 'HT/FT LL',
  led_ht: 'Led at half-time',
};

const HALF_NAMES: Record<string, string> = {
  half_nil: '0–0',
  half_under05: 'Under 0.5',
  half_over15: 'Over 1.5',
  half_avg: 'Average goals',
};

const LEGACY_SERIES_NAMES: Record<string, string> = {
  win_streak: 'Win streak',
  unbeaten_streak: 'Unbeaten streak',
  loss_streak: 'Loss streak',
  btts_streak: 'BTTS streak',
  over25_streak: 'Over 2.5 streak',
  cs_streak: 'Clean sheet streak',
  fts_streak: 'Failed to score streak',
  scoring_streak: 'Scoring streak',
};

export type ColourDirection = 'strong' | 'weak';
export type ColourVenue = 'overall' | 'home' | 'away';
export type ColourPeriodId = 'ft' | 'ht' | '2h';

export const COLOUR_VENUES: { id: ColourVenue; label: string }[] = [
  { id: 'overall', label: 'Overall' },
  { id: 'home', label: 'Home' },
  { id: 'away', label: 'Away' },
];

export const COLOUR_PERIODS: { id: ColourPeriodId; label: string }[] = [
  { id: 'ft', label: 'Full time' },
  { id: 'ht', label: '1st half' },
  { id: '2h', label: '2nd half' },
];

const ALL_PERIODS: ColourPeriodId[] = ['ft', 'ht', '2h'];

export function colourVenueLabel(venue: ColourVenue): string {
  return COLOUR_VENUES.find((item) => item.id === venue)?.label ?? venue;
}

export function colourPeriodLabel(period: ColourPeriodId): string {
  return COLOUR_PERIODS.find((item) => item.id === period)?.label ?? period;
}

export type ColourStat = {
  id: string;
  key: string;
  family: 'ordinary' | 'ppg' | 'series' | 'ft_only' | 'half';
  group: string;
  /** Periods this stat can be read on. Full-time patterns stay full time; half stats stay in the halves. */
  periods: ColourPeriodId[];
  /** Searchable dropdown label: group and stat, without venue or period. */
  label: string;
  /** Stat name without the group prefix. */
  name: string;
  raw: boolean;
};

function isRaw(key: string): boolean {
  return PPG_KEYS.has(key) || AVERAGE_KEYS.has(key) || (SERIES_STATS as readonly string[]).includes(key);
}

function pushStat(
  out: ColourStat[],
  family: ColourStat['family'],
  group: string,
  key: string,
  name: string,
  periods: ColourPeriodId[],
) {
  out.push({
    id: `${family}::${key}`,
    key,
    family,
    group,
    periods,
    name,
    label: `${group} · ${name}`,
    raw: isRaw(key),
  });
}

/** Every rankable stat, once. Venue and period are chosen after the stat. */
export const COLOUR_STAT_CATALOGUE: ColourStat[] = (() => {
  const out: ColourStat[] = [];
  const seriesKeys = new Set(SERIES_DEFS.map((def) => def.key));
  for (const col of DISPLAY_STATS) {
    if (NOT_RANKED.has(col.key)) continue;
    pushStat(out, 'ordinary', 'Ordinary', col.key, col.label, ALL_PERIODS);
  }
  for (const key of PPG_STATS) {
    if (key.startsWith('ppg_vs_')) continue;
    pushStat(out, 'ppg', 'PPG', key, PPG_NAMES[key] ?? key, ALL_PERIODS);
  }
  for (const def of SERIES_DEFS) {
    pushStat(out, 'series', 'Series', def.key, `${def.label}${def.invert ? ' without' : ''}`, ALL_PERIODS);
  }
  for (const key of SERIES_STATS) {
    if (seriesKeys.has(key)) continue;
    pushStat(out, 'series', 'Series', key, LEGACY_SERIES_NAMES[key] ?? key, ALL_PERIODS);
  }
  for (const key of FT_ONLY_STATS) {
    pushStat(out, 'ft_only', 'Full time', key, FT_NAMES[key] ?? key, ['ft']);
  }
  for (const key of HALF_ONLY_STATS) {
    pushStat(out, 'half', 'Half', key, HALF_NAMES[key] ?? key, ['ht', '2h']);
  }
  return out;
})();

const CATALOGUE_BY_ID = new Map(COLOUR_STAT_CATALOGUE.map((stat) => [stat.id, stat]));

export function colourStatById(id: string): ColourStat | undefined {
  return CATALOGUE_BY_ID.get(id);
}

export function formatColourStatValue(stat: ColourStat, value: number): string {
  if (PPG_KEYS.has(stat.key)) return value.toFixed(2);
  if (!stat.raw) return `${(Math.round(value * 10) / 10).toFixed(1)}%`;
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function bandForTeam(
  teamId: number | null,
  standings: { teamId: number; rank: number }[],
): Band | null {
  if (teamId == null || standings.length === 0) return null;
  const row = standings.find((standing) => standing.teamId === teamId);
  if (!row) return null;
  return bandOf(row.rank, standings.length);
}

/** Finished matches this side has played against the opponent's current colour. */
export function countMatchesAgainstColour(
  teamId: number,
  colour: Band,
  standings: { teamId: number; rank: number }[],
  matches: { homeId: number; awayId: number }[],
  venue: ColourVenue = 'overall',
): number {
  if (standings.length === 0) return 0;
  const bandByTeam = new Map(standings.map((row) => [row.teamId, bandOf(row.rank, standings.length)]));
  let count = 0;
  for (const match of matches) {
    const side = match.homeId === teamId ? 'home' : match.awayId === teamId ? 'away' : null;
    if (side == null || (venue !== 'overall' && side !== venue)) continue;
    const opponentId = side === 'home' ? match.awayId : match.homeId;
    if (bandByTeam.get(opponentId) === colour) count += 1;
  }
  return count;
}

export type ColourFixture = {
  homeId: number;
  awayId: number;
  homeGoals: number;
  awayGoals: number;
  unix: number;
  homeGoalsHt?: number | null;
  awayGoalsHt?: number | null;
};

export type ColourRateRow = {
  colour: Band;
  /** Our figure for the chosen stat in matches against this colour. */
  value: number | null;
  played: number;
  /**
   * Strong: highest figure is position 1.
   * Weak: smallest figure is position 1, then up to the highest.
   * Missing figures are not ranked.
   */
  position: number | null;
};

function sliceFor(match: ColourFixture, teamId: number): StatSliceMatch | null {
  const isHome = match.homeId === teamId;
  const isAway = match.awayId === teamId;
  if (!isHome && !isAway) return null;
  const htKnown = match.homeGoalsHt != null && match.awayGoalsHt != null;
  return {
    isHome,
    opponentId: isHome ? match.awayId : match.homeId,
    unix: match.unix,
    gf: isHome ? match.homeGoals : match.awayGoals,
    ga: isHome ? match.awayGoals : match.homeGoals,
    gfHt: htKnown ? (isHome ? match.homeGoalsHt! : match.awayGoalsHt!) : null,
    gaHt: htKnown ? (isHome ? match.awayGoalsHt! : match.homeGoalsHt!) : null,
  };
}

export type FullTableRate = {
  /** The stat on every match in this venue and period, before opponents are split by colour. */
  value: number | null;
  played: number;
};

/**
 * The chosen stat on the full table: every match in the venue and period,
 * before those matches are separated into green, yellow and red.
 */
export function rateOnFullTable(
  teamId: number,
  stat: { key: string },
  matches: ColourFixture[],
  venue: ColourVenue = 'overall',
  period: ColourPeriodId = 'ft',
): FullTableRate {
  const slices: StatSliceMatch[] = [];
  for (const match of matches) {
    const slice = sliceFor(match, teamId);
    if (!slice) continue;
    if (venue === 'home' && !slice.isHome) continue;
    if (venue === 'away' && slice.isHome) continue;
    slices.push(slice);
  }
  return {
    played: slices.length,
    value: slices.length > 0 ? statOnMatches(slices, stat.key, period) : null,
  };
}

/**
 * Green, yellow and red, each carrying our stat against that colour.
 * Order stays green, yellow, red. Ranking follows the chosen filter.
 */
export function ratesAgainstColours(
  teamId: number,
  stat: { key: string },
  standings: { teamId: number; rank: number }[],
  matches: ColourFixture[],
  direction: ColourDirection = 'strong',
  venue: ColourVenue = 'overall',
  period: ColourPeriodId = 'ft',
): ColourRateRow[] {
  const grouped: Record<Band, StatSliceMatch[]> = { green: [], yellow: [], red: [] };
  if (standings.length > 0) {
    const bandByTeam = new Map(standings.map((row) => [row.teamId, bandOf(row.rank, standings.length)]));
    for (const match of matches) {
      const slice = sliceFor(match, teamId);
      if (!slice) continue;
      if (venue === 'home' && !slice.isHome) continue;
      if (venue === 'away' && slice.isHome) continue;
      const colour = bandByTeam.get(slice.opponentId);
      if (!colour) continue;
      grouped[colour].push(slice);
    }
  }
  const rows: ColourRateRow[] = BANDS.map((colour) => {
    const played = grouped[colour].length;
    return {
      colour,
      played,
      value: played > 0 ? statOnMatches(grouped[colour], stat.key, period) : null,
      position: null,
    };
  });
  assignColourPositions(rows, direction);
  return rows;
}

/** Number ranked colours. Strong starts at the highest figure; weak starts at the smallest. */
export function assignColourPositions(rows: ColourRateRow[], direction: ColourDirection): void {
  const ranked = rows
    .filter((row): row is ColourRateRow & { value: number } => row.value != null)
    .sort((a, b) => {
      const byValue = direction === 'weak' ? a.value - b.value : b.value - a.value;
      return byValue || a.colour.localeCompare(b.colour);
    });
  let position = 0;
  ranked.forEach((row, index) => {
    if (index === 0 || row.value !== ranked[index - 1].value) position = index + 1;
    row.position = position;
  });
}

/**
 * Strong passes at position 1 or 2 (the higher figures).
 * Weak passes at position 2 or 3. Position 1, the smallest figure, does not pass.
 */
export function passesColourPosition(position: number, direction: ColourDirection): boolean {
  if (direction === 'strong') return position === 1 || position === 2;
  if (direction === 'weak') return position === 2 || position === 3;
  return false;
}

export type ColourPairKey = 'red-green' | 'yellow-green' | 'red-yellow';

export type ColourDifference = {
  key: ColourPairKey;
  left: Band;
  right: Band;
  /** Absolute gap between the two colour figures. Missing when either figure is missing. */
  difference: number | null;
  /** Colour with the larger figure. Null when a figure is missing or the two figures tie. */
  higher: Band | null;
  /** Largest gap among the pairs that both have a figure. Ties share DA. */
  isDA: boolean;
};

/** Higher figure in a colour pair is up. The lower figure is down. A 50% line is not required. */
export type ColourDaLean = 'up' | 'down';

const COLOUR_PAIRS: { key: ColourPairKey; left: Band; right: Band }[] = [
  { key: 'red-green', left: 'red', right: 'green' },
  { key: 'yellow-green', left: 'yellow', right: 'green' },
  { key: 'red-yellow', left: 'red', right: 'yellow' },
];

/** Decimal places used when the gap is shown and when the largest gap is chosen. */
export function colourDifferenceDecimals(stat: { key: string }): number {
  return PPG_KEYS.has(stat.key) ? 2 : 1;
}

function roundGap(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Gaps between the three colour figures: Red–Green, Yellow–Green, Red–Yellow.
 * The largest gap is DA (Double Agent). Equal largest gaps are all DA.
 */
export function colourPairDifferences(
  rows: { colour: Band; value: number | null }[],
  decimals = 1,
): ColourDifference[] {
  const valueOf = (colour: Band) => rows.find((row) => row.colour === colour)?.value ?? null;
  const built: ColourDifference[] = COLOUR_PAIRS.map((pair) => {
    const left = valueOf(pair.left);
    const right = valueOf(pair.right);
    const leftShown = left == null ? null : roundGap(left, decimals);
    const rightShown = right == null ? null : roundGap(right, decimals);
    const higher = leftShown == null || rightShown == null || leftShown === rightShown
      ? null
      : leftShown > rightShown ? pair.left : pair.right;
    return {
      ...pair,
      difference: leftShown == null || rightShown == null ? null : roundGap(Math.abs(left - right), decimals),
      higher,
      isDA: false,
    };
  });
  let max: number | null = null;
  for (const row of built) {
    if (row.difference == null) continue;
    if (max == null || row.difference > max) max = row.difference;
  }
  if (max != null) {
    for (const row of built) row.isDA = row.difference === max;
  }
  return built;
}

/** The pair that matches two table colours. Same colour, or a missing colour, has no pair. */
export function colourPairBetween(
  differences: ColourDifference[],
  a: Band | null,
  b: Band | null,
): ColourDifference | null {
  if (a == null || b == null || a === b) return null;
  return differences.find((row) =>
    (row.left === a && row.right === b) || (row.left === b && row.right === a),
  ) ?? null;
}

/**
 * Up when this colour is the higher figure in the pair, Down when it is the lower one.
 * The read is only the comparison inside the pair. A figure under 50% is still up when it is higher.
 * Equal figures have no lean.
 */
export function colourDaLean(pair: ColourDifference | null, colour: Band | null): ColourDaLean | null {
  if (pair == null || pair.higher == null || colour == null) return null;
  if (colour !== pair.left && colour !== pair.right) return null;
  return colour === pair.higher ? 'up' : 'down';
}
