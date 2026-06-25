import type { MatchStats, OddsByMarket, Probability, RawFixtureDetail } from '@/services/oddAlerts';

/** Parse "2-1" / "2 - 1" half-time score. */
export function parseScorePair(score: string | null | undefined): { home: number; away: number } | null {
  if (!score) return null;
  const m = score.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (!m) return null;
  return { home: Number(m[1]), away: Number(m[2]) };
}

/** Full-time, half-time and second-half goals when derivable from API fields. */
export function scoreBreakdown(detail: RawFixtureDetail): {
  ft: { home: number; away: number } | null;
  ht: { home: number; away: number } | null;
  secondHalf: { home: number; away: number } | null;
} {
  const ft =
    detail.home_goals != null && detail.away_goals != null
      ? { home: detail.home_goals, away: detail.away_goals }
      : null;
  const ht = parseScorePair(detail.ht_score);
  let secondHalf: { home: number; away: number } | null = null;
  if (ft && ht) {
    secondHalf = {
      home: Math.max(0, ft.home - ht.home),
      away: Math.max(0, ft.away - ht.away),
    };
  }
  return { ft, ht, secondHalf };
}

export type StatRowDef = {
  label: string;
  home: string;
  away: string;
  pct?: boolean;
  category: string;
};

/** Every home_/away_ stat pair returned by `include=stats` on fixture detail. */
export const MATCH_STAT_ROWS: StatRowDef[] = [
  { label: 'Ball possession', home: 'home_possession', away: 'away_possession', pct: true, category: 'General' },
  { label: 'Pressure index', home: 'home_pressure', away: 'away_pressure', category: 'General' },
  { label: 'Pressure (avg)', home: 'home_pressure_avg', away: 'away_pressure_avg', category: 'General' },
  { label: 'Shots', home: 'home_shots', away: 'away_shots', category: 'Attacking' },
  { label: 'Shots on target', home: 'home_shots_on', away: 'away_shots_on', category: 'Attacking' },
  { label: 'Attacks', home: 'home_attacks', away: 'away_attacks', category: 'Attacking' },
  { label: 'Dangerous attacks', home: 'home_dang_attacks', away: 'away_dang_attacks', category: 'Attacking' },
  { label: 'Expected goals (xG)', home: 'home_xg', away: 'away_xg', category: 'Expected goals' },
  { label: 'xG on target (xGoT)', home: 'home_xgot', away: 'away_xgot', category: 'Expected goals' },
  { label: 'Corners', home: 'home_corners', away: 'away_corners', category: 'Set pieces' },
  { label: 'Offsides', home: 'home_offsides', away: 'away_offsides', category: 'Set pieces' },
  { label: 'Throw-ins', home: 'home_throw_ins', away: 'away_throw_ins', category: 'Set pieces' },
  { label: 'Goal kicks', home: 'home_goal_kicks', away: 'away_goal_kicks', category: 'Set pieces' },
  { label: 'Fouls', home: 'home_fouls', away: 'away_fouls', category: 'Discipline' },
  { label: 'Tackles', home: 'home_tackles', away: 'away_tackles', category: 'Discipline' },
  { label: 'Yellow cards', home: 'home_yellow_cards', away: 'away_yellow_cards', category: 'Discipline' },
  { label: 'Red cards', home: 'home_red_cards', away: 'away_red_cards', category: 'Discipline' },
];

export function statsByCategory(stats: MatchStats | undefined): Map<string, StatRowDef[]> {
  const map = new Map<string, StatRowDef[]>();
  if (!stats) return map;
  for (const row of MATCH_STAT_ROWS) {
    if (stats[row.home] == null && stats[row.away] == null) continue;
    const list = map.get(row.category) ?? [];
    list.push(row);
    map.set(row.category, list);
  }
  return map;
}

export type ProbGroup = { title: string; items: { key: string; label: string }[] };

export const PROBABILITY_GROUPS: ProbGroup[] = [
  {
    title: 'Full-time result',
    items: [
      { key: 'home_win', label: 'Home win' },
      { key: 'draw', label: 'Draw' },
      { key: 'away_win', label: 'Away win' },
    ],
  },
  {
    title: 'Half-time result',
    items: [
      { key: 'home_win_ht', label: 'Home leading at HT' },
      { key: 'draw_ht', label: 'Level at HT' },
    ],
  },
  {
    title: 'Both teams to score',
    items: [
      { key: 'btts', label: 'BTTS Yes' },
      { key: 'btts_no', label: 'BTTS No' },
    ],
  },
  {
    title: 'Total goals (full time)',
    items: [
      { key: 'o05', label: 'Over 0.5' },
      { key: 'o15', label: 'Over 1.5' },
      { key: 'o25', label: 'Over 2.5' },
      { key: 'o35', label: 'Over 3.5' },
      { key: 'o45', label: 'Over 4.5' },
      { key: 'u05', label: 'Under 0.5' },
      { key: 'u15', label: 'Under 1.5' },
      { key: 'u25', label: 'Under 2.5' },
      { key: 'u35', label: 'Under 3.5' },
      { key: 'u45', label: 'Under 4.5' },
    ],
  },
  {
    title: 'First-half goals',
    items: [{ key: 'o0_1h_goals', label: 'Over 0.5 goals 1H' }],
  },
  {
    title: 'Team goals',
    items: [
      { key: 'o05_home_goals', label: 'Home over 0.5' },
      { key: 'o15_home_goals', label: 'Home over 1.5' },
      { key: 'o05_away_goals', label: 'Away over 0.5' },
      { key: 'o15_away_goals', label: 'Away over 1.5' },
    ],
  },
  {
    title: 'Score first',
    items: [
      { key: 'home_score_first', label: 'Home scores first' },
      { key: 'draw_score_first', label: 'No goal before end' },
      { key: 'away_score_first', label: 'Away scores first' },
    ],
  },
  {
    title: 'Double chance',
    items: [
      { key: 'double_chance_1x', label: 'Home or Draw' },
      { key: 'double_chance_12', label: 'Home or Away' },
      { key: 'double_chance_x2', label: 'Draw or Away' },
    ],
  },
  {
    title: 'Corners (model)',
    items: [
      { key: 'o4_corners', label: 'Over 4' },
      { key: 'o5_corners', label: 'Over 5' },
      { key: 'o6_corners', label: 'Over 6' },
      { key: 'o7_corners', label: 'Over 7' },
      { key: 'o8_corners', label: 'Over 8' },
      { key: 'o9_corners', label: 'Over 9' },
      { key: 'o10_corners', label: 'Over 10' },
      { key: 'o11_corners', label: 'Over 11' },
    ],
  },
];

const ODDS_MARKET_LABELS: Record<string, string> = {
  ft_result: 'Full-time result',
  ht_result: 'Half-time result',
  double_chance: 'Double chance',
  btts: 'Both teams to score',
  btts_1h: 'BTTS — 1st half',
  btts_2h: 'BTTS — 2nd half',
  btts_o25: 'BTTS & Over 2.5',
  dnb: 'Draw no bet',
  total_goals: 'Total goals',
  total_goals_1h: 'Total goals — 1st half',
  total_goals_2h: 'Total goals — 2nd half',
  goal_line_1h: 'Goal line — 1st half',
  home_goals: 'Home team goals',
  away_goals: 'Away team goals',
  total_corners: 'Total corners',
  asian_corners: 'Asian corners',
  asian_corners_1h: 'Asian corners — 1st half',
  asian_handicap: 'Asian handicap',
  highest_scoring_half: 'Highest-scoring half',
};

export function oddsMarketLabel(key: string): string {
  return ODDS_MARKET_LABELS[key] ?? key.replace(/_/g, ' ');
}

export function formatOutcome(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\bm\b/g, '−')
    .replace(/\bp\b/g, '+')
    .replace(/over /gi, 'Over ')
    .replace(/under /gi, 'Under ')
    .replace(/\bht\b/gi, 'HT')
    .replace(/\bft\b/gi, 'FT');
}

export function probabilityGroups(prob: Probability | undefined): { title: string; rows: { label: string; value: number }[] }[] {
  if (!prob) return [];
  return PROBABILITY_GROUPS.map((g) => ({
    title: g.title,
    rows: g.items
      .map((item) => ({ label: item.label, value: prob[item.key] }))
      .filter((r) => r.value != null && !Number.isNaN(r.value)) as { label: string; value: number }[],
  })).filter((g) => g.rows.length > 0);
}

export function oddsMarkets(odds: OddsByMarket | undefined): { market: string; label: string; outcomes: { key: string; value: number }[] }[] {
  if (!odds) return [];
  return Object.entries(odds)
    .map(([market, outcomes]) => ({
      market,
      label: oddsMarketLabel(market),
      outcomes: Object.entries(outcomes)
        .map(([key, value]) => ({ key, value }))
        .filter((o) => o.value != null),
    }))
    .filter((m) => m.outcomes.length > 0)
    .sort((a, b) => a.label.localeCompare(b.label));
}
