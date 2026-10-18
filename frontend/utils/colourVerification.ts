/**
 * Colour verification — rank green, yellow and red by our own stat against
 * each colour, then test the opponent's colour with Up or Down.
 *
 * Position 1 is our highest figure. Ties share a position and the next one skips.
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

const PERIODS = [
  { id: 'ft', label: 'Full time' },
  { id: 'ht', label: '1st half' },
  { id: '2h', label: '2nd half' },
] as const;

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

export type ColourDirection = 'up' | 'down';

export type ColourStat = {
  id: string;
  key: string;
  table: string;
  group: string;
  period: string;
  /** Searchable dropdown label. */
  label: string;
  /** Stat name without the group prefix. */
  name: string;
  raw: boolean;
};

function isRaw(key: string): boolean {
  return PPG_KEYS.has(key) || AVERAGE_KEYS.has(key) || (SERIES_STATS as readonly string[]).includes(key);
}

function pushStat(out: ColourStat[], group: string, period: string, table: string, key: string, name: string) {
  out.push({
    id: `${table}::${key}`,
    key,
    table,
    group,
    period,
    name,
    label: `${group} · ${period} · ${name}`,
    raw: isRaw(key),
  });
}

/** Every rankable stat the tables already compute, on the season overall colour table. */
export const COLOUR_STAT_CATALOGUE: ColourStat[] = (() => {
  const out: ColourStat[] = [];
  const seriesKeys = new Set(SERIES_DEFS.map((def) => def.key));
  for (const period of PERIODS) {
    for (const col of DISPLAY_STATS) {
      if (NOT_RANKED.has(col.key)) continue;
      pushStat(out, 'Ordinary', period.label, `ordinary_${period.id}_overall`, col.key, col.label);
    }
    for (const key of PPG_STATS) {
      if (key.startsWith('ppg_vs_')) continue;
      pushStat(out, 'PPG', period.label, `ppg_${period.id}_overall`, key, PPG_NAMES[key] ?? key);
    }
    for (const def of SERIES_DEFS) {
      pushStat(
        out,
        'Series',
        period.label,
        `series_${period.id}_overall`,
        def.key,
        `${def.label}${def.invert ? ' without' : ''}`,
      );
    }
    for (const key of SERIES_STATS) {
      if (seriesKeys.has(key)) continue;
      pushStat(out, 'Series', period.label, `series_${period.id}_overall`, key, LEGACY_SERIES_NAMES[key] ?? key);
    }
  }
  for (const key of FT_ONLY_STATS) {
    pushStat(out, 'Full time', 'Full time', 'ft_only_ft_overall', key, FT_NAMES[key] ?? key);
  }
  for (const period of PERIODS) {
    if (period.id === 'ft') continue;
    for (const key of HALF_ONLY_STATS) {
      pushStat(out, 'Half', period.label, `ft_only_${period.id}_overall`, key, HALF_NAMES[key] ?? key);
    }
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
): number {
  if (standings.length === 0) return 0;
  const bandByTeam = new Map(standings.map((row) => [row.teamId, bandOf(row.rank, standings.length)]));
  let count = 0;
  for (const match of matches) {
    const opponentId = match.homeId === teamId ? match.awayId : match.awayId === teamId ? match.homeId : null;
    if (opponentId != null && bandByTeam.get(opponentId) === colour) count += 1;
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
  /** Highest figure is position 1. Missing figures are not ranked. */
  position: number | null;
};

function periodOf(table: string): 'ft' | 'ht' | '2h' {
  if (table.includes('_ht_')) return 'ht';
  if (table.includes('_2h_')) return '2h';
  return 'ft';
}

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

/**
 * Green, yellow and red, each carrying our stat against that colour.
 * Order stays green, yellow, red. Position 1 is the highest figure.
 */
export function ratesAgainstColours(
  teamId: number,
  stat: { key: string; table: string },
  standings: { teamId: number; rank: number }[],
  matches: ColourFixture[],
): ColourRateRow[] {
  const grouped: Record<Band, StatSliceMatch[]> = { green: [], yellow: [], red: [] };
  if (standings.length > 0) {
    const bandByTeam = new Map(standings.map((row) => [row.teamId, bandOf(row.rank, standings.length)]));
    for (const match of matches) {
      const slice = sliceFor(match, teamId);
      if (!slice) continue;
      const colour = bandByTeam.get(slice.opponentId);
      if (!colour) continue;
      grouped[colour].push(slice);
    }
  }
  const period = periodOf(stat.table);
  const rows: ColourRateRow[] = BANDS.map((colour) => {
    const played = grouped[colour].length;
    return {
      colour,
      played,
      value: played > 0 ? statOnMatches(grouped[colour], stat.key, period) : null,
      position: null,
    };
  });
  const ranked = rows
    .filter((row): row is ColourRateRow & { value: number } => row.value != null)
    .sort((a, b) => b.value - a.value || a.colour.localeCompare(b.colour));
  let position = 0;
  ranked.forEach((row, index) => {
    if (index === 0 || row.value !== ranked[index - 1].value) position = index + 1;
    row.position = position;
  });
  return rows;
}

/**
 * Up passes at position 1 or 2.
 * Down passes at position 2 or 3. Position 1 and every later position fail.
 */
export function passesColourPosition(position: number, direction: ColourDirection): boolean {
  if (direction === 'up') return position === 1 || position === 2;
  return position === 2 || position === 3;
}
