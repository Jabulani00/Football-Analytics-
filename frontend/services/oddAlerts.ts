import { Platform } from 'react-native';

/**
 * Client for the OddAlerts Football Data API (https://data.oddalerts.com/api).
 *
 * Transport differs by platform because the upstream API sends no CORS headers:
 *   - Web:    requests go through the bundled Vercel proxy at `/api/oddalerts`,
 *             which injects the token server-side. No token is exposed to the browser.
 *   - Native: requests hit the API directly with the token as a query param.
 *
 * Override any of these with EXPO_PUBLIC_* env vars if you self-host.
 */

const DIRECT_BASE_URL =
  process.env.EXPO_PUBLIC_ODDALERTS_BASE_URL ?? 'https://data.oddalerts.com/api';

const PROXY_URL = process.env.EXPO_PUBLIC_ODDALERTS_PROXY ?? '/oddalerts';

// Token for native (direct) calls only. On web the token never reaches the
// client — the proxy injects the server-side ODDALERTS_TOKEN instead.
// Set EXPO_PUBLIC_ODDALERTS_TOKEN in frontend/.env (see .env.example).
const TOKEN = process.env.EXPO_PUBLIC_ODDALERTS_TOKEN ?? '';

const USE_PROXY = Platform.OS === 'web';

export type ApiStatus =
  | 'NS'
  | 'LIVE'
  | 'HT'
  | 'FT'
  | '1H'
  | '2H'
  | 'ET'
  | 'BT'
  | 'P'
  | 'PEN'
  | 'AET'
  | 'PST'
  | 'CANC'
  | 'ABD'
  | 'SUSP'
  | 'INT'
  | 'TBD'
  | string;

/** Raw fixture as returned by /fixtures/* endpoints. */
export type RawFixture = {
  id: number;
  home_name: string;
  away_name: string;
  home_id: number | null;
  away_id: number | null;
  competition_id: number;
  competition_country: string;
  competition_name: string;
  competition_type: string;
  competition_predictability: string | null;
  season: string;
  season_id?: number | null;
  status: ApiStatus;
  home_goals: number | null;
  away_goals: number | null;
  ht_score: string | null;
  elapsed: number | null;
  elapsed_seconds: number | null;
  time_added: number | null;
  home_position: number | null;
  away_position: number | null;
  home_played?: number | null;
  away_played?: number | null;
  venue?: string | null;
  home_formation?: string | null;
  away_formation?: string | null;
  referee_id?: number | null;
  unix: number;
  has_odds: boolean;
  is_friendly: boolean;
  is_cup: boolean;
  date: string;
  ko_human: string;
};

/** Probability model output (percentages). */
export type Probability = Record<string, number>;

/** Match-level stats (possession, shots, corners, cards, xg…); values may be null. */
export type MatchStats = Record<string, number | null>;

/** Pre-match odds grouped by market, e.g. odds.ft_result.home. */
export type OddsByMarket = Record<string, Record<string, number>>;

export type H2HMatch = {
  id: number;
  home_name: string;
  away_name: string;
  home_goals: number | null;
  away_goals: number | null;
  ht_score: string | null;
  total_goals: number;
  btts: boolean;
  over_05?: boolean;
  over_15?: boolean;
  over_25?: boolean;
  over_35?: boolean;
  home_win?: boolean;
  away_win?: boolean;
  draw?: boolean;
  team1_win?: boolean;
  team2_win?: boolean;
  date: string;
  league: string;
  stats?: {
    possession?: { home: number; away: number };
    cards?: { home: number; away: number };
    corners?: { home: number; away: number };
  };
};

export type RefereeInfo = {
  id?: number;
  name?: string;
  [key: string]: unknown;
};

/** Extra fields on fixture detail beyond the base fixture row. */
export type RawFixtureDetail = RawFixture & {
  season_progress?: number | null;
  winning_team?: number | null;
  probability?: Probability;
  stats?: MatchStats;
  odds?: OddsByMarket;
  h2h?: H2HMatch[];
  referee?: RefereeInfo | null;
};

type ApiEnvelope<T> = {
  info: Record<string, unknown>;
  data: T[];
};

function buildUrl(path: string, params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  }

  if (USE_PROXY) {
    search.set('path', path);
    return `${PROXY_URL}?${search.toString()}`;
  }

  search.set('api_token', TOKEN);
  return `${DIRECT_BASE_URL}/${path}?${search.toString()}`;
}

async function getJson<T>(
  path: string,
  params: Record<string, string | number | undefined> = {},
  signal?: AbortSignal,
): Promise<ApiEnvelope<T>> {
  const res = await fetch(buildUrl(path, params), {
    headers: { Accept: 'application/json' },
    signal,
  });
  if (!res.ok) {
    throw new Error(`OddAlerts API ${res.status}: ${path}`);
  }
  return (await res.json()) as ApiEnvelope<T>;
}

/** Live + in-play + recently finished fixtures (single page, ~30 games). */
export function fetchLiveFixtures(signal?: AbortSignal): Promise<ApiEnvelope<RawFixture>> {
  return getJson<RawFixture>('fixtures/live', {}, signal);
}

/** Upcoming (not-started) fixtures. `days` limits the look-ahead window. */
export function fetchUpcomingFixtures(
  opts: { days?: number; page?: number; competitions?: string } = {},
  signal?: AbortSignal,
): Promise<ApiEnvelope<RawFixture>> {
  return getJson<RawFixture>(
    'fixtures/upcoming',
    { days: opts.days, page: opts.page, competitions: opts.competitions },
    signal,
  );
}

/**
 * Fixtures (including finished results) in a unix-time window. This is the
 * Flashscore "Results" source. Optionally scope to one or more competitions.
 */
export function fetchFixturesBetween(
  opts: { fromUnix: number; toUnix: number; competitions?: string; page?: number },
  signal?: AbortSignal,
): Promise<ApiEnvelope<RawFixture>> {
  return getJson<RawFixture>(
    'fixtures/between',
    { from: opts.fromUnix, to: opts.toUnix, competitions: opts.competitions, page: opts.page },
    signal,
  );
}

/** Fetches every page of `/fixtures/between` up to `maxPages` (rate-limit guard). */
export async function fetchAllFixturesBetween(
  opts: { fromUnix: number; toUnix: number; competitions?: string; maxPages?: number },
  signal?: AbortSignal,
): Promise<RawFixture[]> {
  const maxPages = opts.maxPages ?? 3;
  const all: RawFixture[] = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const env = await fetchFixturesBetween({ ...opts, page }, signal);
    all.push(...env.data);
    if (!env.info?.next_page_url) break;
  }
  return all;
}

// ----- Normalisation ------------------------------------------------------

export type ScoreStatus = 'NS' | 'LIVE' | 'HT' | 'FT' | 'OTHER';

const IN_PLAY = new Set(['LIVE', '1H', '2H', 'ET', 'BT', 'P', 'INT']);
const FINISHED = new Set(['FT', 'AET', 'PEN', 'FT_PEN', 'AWD', 'AWARDED', 'WO', 'AWAITING_UPDATES']);
const SCHEDULED = new Set(['NS', 'TBD']);

export function normaliseStatus(raw: ApiStatus): ScoreStatus {
  if (raw === 'HT') return 'HT';
  if (IN_PLAY.has(raw)) return 'LIVE';
  if (FINISHED.has(raw)) return 'FT';
  if (SCHEDULED.has(raw)) return 'NS';
  return 'OTHER';
}

export function isFinished(status: ScoreStatus): boolean {
  return status === 'FT';
}

export type Gender = 'men' | 'women';
export type FixtureKind = 'club' | 'country';

export type Fixture = {
  id: number;
  status: ScoreStatus;
  rawStatus: ApiStatus;
  minute: number | null;
  addedTime: number | null;
  kickoffUnix: number;
  kickoff: string;
  gender: Gender;
  kind: FixtureKind;
  home: { id: number | null; name: string; goals: number | null; position: number | null };
  away: { id: number | null; name: string; goals: number | null; position: number | null };
  competition: {
    id: number;
    name: string;
    country: string;
    type: string;
    isCup: boolean;
    isFriendly: boolean;
  };
};

// The OddAlerts API has no gender / national-team fields, so we infer them.
// Women: competition naming OR OddAlerts' " W" team-name convention.
const WOMEN_RE =
  /(\bwomen'?s?\b|\bwom\b|feminin|f[eé]men|frauen|femminile|\bwsl\b|\bnwsl\b|\bwpsl\b|w-league|\bw league\b|damallsvenskan|\bladies\b|\bgirls\b)/i;
const TEAM_W_SUFFIX = /\sW$/;

// Countries = national-team competitions (everything else is club football).
const COUNTRY_RE =
  /(world cup|nations league|\beuros?\b|copa am[eé]rica|af con|afcon|africa(n)? cup|asian cup|gold cup|concacaf|conmebol|olympic|international friendl|friendlies international|wc qualif|world cup qualif|euro qualif|qualification|uefa nations|confederations|cosafa|\bsaff\b|\baff\b|arab cup|finalissima|continental championship)/i;

export function detectGender(competitionName: string, homeName: string, awayName: string): Gender {
  if (WOMEN_RE.test(competitionName)) return 'women';
  if (TEAM_W_SUFFIX.test(homeName) || TEAM_W_SUFFIX.test(awayName)) return 'women';
  return 'men';
}

export function detectKind(competitionName: string): FixtureKind {
  if (/club/i.test(competitionName)) return 'club';
  return COUNTRY_RE.test(competitionName) ? 'country' : 'club';
}

function formatKickoff(unix: number): string {
  return new Date(unix * 1000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function mapFixture(raw: RawFixture): Fixture {
  return {
    id: raw.id,
    status: normaliseStatus(raw.status),
    rawStatus: raw.status,
    minute: raw.elapsed,
    addedTime: raw.time_added,
    kickoffUnix: raw.unix,
    kickoff: formatKickoff(raw.unix),
    gender: detectGender(raw.competition_name, raw.home_name, raw.away_name),
    kind: detectKind(raw.competition_name),
    home: {
      id: raw.home_id,
      name: raw.home_name,
      goals: raw.home_goals,
      position: raw.home_position,
    },
    away: {
      id: raw.away_id,
      name: raw.away_name,
      goals: raw.away_goals,
      position: raw.away_position,
    },
    competition: {
      id: raw.competition_id,
      name: raw.competition_name,
      country: raw.competition_country,
      type: raw.competition_type,
      isCup: raw.is_cup,
      isFriendly: raw.is_friendly,
    },
  };
}

export type CompetitionGroup = {
  key: string;
  competition: Fixture['competition'];
  fixtures: Fixture[];
};

const STATUS_ORDER: Record<ScoreStatus, number> = {
  LIVE: 0,
  HT: 1,
  NS: 2,
  FT: 3,
  OTHER: 4,
};

/** Group fixtures by competition, ordered like Flashscore (live first). */
export function groupByCompetition(fixtures: Fixture[]): CompetitionGroup[] {
  const map = new Map<string, CompetitionGroup>();

  for (const fixture of fixtures) {
    const key = String(fixture.competition.id);
    let group = map.get(key);
    if (!group) {
      group = { key, competition: fixture.competition, fixtures: [] };
      map.set(key, group);
    }
    group.fixtures.push(fixture);
  }

  const groups = [...map.values()];

  for (const group of groups) {
    group.fixtures.sort((a, b) => {
      const order = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      if (order !== 0) return order;
      return a.kickoffUnix - b.kickoffUnix;
    });
  }

  groups.sort((a, b) => {
    const liveA = a.fixtures.some((f) => f.status === 'LIVE' || f.status === 'HT');
    const liveB = b.fixtures.some((f) => f.status === 'LIVE' || f.status === 'HT');
    if (liveA !== liveB) return liveA ? -1 : 1;
    const country = a.competition.country.localeCompare(b.competition.country);
    if (country !== 0) return country;
    return a.competition.name.localeCompare(b.competition.name);
  });

  return groups;
}

// ----- Match detail -------------------------------------------------------

/** Single fixture with probability, stats, odds, H2H and referee included. */
export async function fetchFixtureDetail(
  id: number | string,
  signal?: AbortSignal,
): Promise<RawFixtureDetail | null> {
  const env = await getJson<RawFixtureDetail>(
    `fixtures/${id}`,
    { include: 'probability,stats,odds,h2h,referee' },
    signal,
  );
  return env.data[0] ?? null;
}

// ----- Goal timing (stats/fixture) ----------------------------------------

const GOAL_PERIOD_ORDER = ['m0_15', 'm15_30', 'm30_45', 'm45_60', 'm60_75', 'm75_90'] as const;

const GOAL_PERIOD_LABEL: Record<(typeof GOAL_PERIOD_ORDER)[number], string> = {
  m0_15: "1–15'",
  m15_30: "16–30'",
  m30_45: "31–45'",
  m45_60: "46–60'",
  m60_75: "61–75'",
  m75_90: "76–90'",
};

/** Sort key for ordering period-only goals (mid-period minute). */
const GOAL_PERIOD_SORT: Record<(typeof GOAL_PERIOD_ORDER)[number], number> = {
  m0_15: 8,
  m15_30: 23,
  m30_45: 38,
  m45_60: 53,
  m60_75: 68,
  m75_90: 83,
};

type RawTimingCell = { total?: number; home?: number; away?: number };
type RawTimingBuckets = Partial<Record<(typeof GOAL_PERIOD_ORDER)[number], RawTimingCell>>;

type HalfVenueCell = { total?: number; home?: number; away?: number };

type RawFixtureStatsRow = {
  team_id?: number;
  fixture_id?: number | null;
  name?: string;
  goal_timing?: RawTimingBuckets;
  goal_timing_for?: RawTimingBuckets;
  goal_timings?: RawTimingBuckets | unknown[];
  first_goal_time?: { total?: number; home?: number; away?: number };
  goals_for_1h?: HalfVenueCell;
  goals_for_2h?: HalfVenueCell;
  cards_1h_for?: HalfVenueCell;
  cards_2h_for?: HalfVenueCell;
};

/** Goal / card markers for the pressure chart from OddAlerts `stats/fixture`. */
export type OddAlertsChartMarker = {
  kind: 'goal' | 'yellow';
  side: 'home' | 'away';
  minute: number;
  sortKey: number;
};

export type GoalTimingBucket = {
  key: (typeof GOAL_PERIOD_ORDER)[number];
  label: string;
  home: number;
  away: number;
};

/** One goal slot when only 15-minute buckets are available (no exact minute). */
export type GoalPeriodEvent = {
  side: 'home' | 'away';
  periodKey: (typeof GOAL_PERIOD_ORDER)[number];
  periodLabel: string;
  sortMinute: number;
};

export type FixtureGoalTiming = {
  buckets: GoalTimingBucket[];
  periodGoals: GoalPeriodEvent[];
  /** Average first-goal minute when the API returns a plausible value (< 120). */
  avgFirstGoalMinute: number | null;
  available: boolean;
  /** True when buckets were estimated from FT/HT score (frozen rows failed validation). */
  approximate?: boolean;
  /** Goals + cards for the pressure monitor chart (OddAlerts `stats/fixture`). */
  chartMarkers: OddAlertsChartMarker[];
};

const FIRST_HALF_PERIODS = ['m0_15', 'm15_30', 'm30_45'] as const;
const SECOND_HALF_PERIODS = ['m45_60', 'm60_75', 'm75_90'] as const;

function venueGoalsFromRow(
  buckets: RawTimingBuckets | undefined,
  side: 'home' | 'away',
): Partial<Record<(typeof GOAL_PERIOD_ORDER)[number], number>> {
  const out: Partial<Record<(typeof GOAL_PERIOD_ORDER)[number], number>> = {};
  if (!buckets) return out;
  for (const key of GOAL_PERIOD_ORDER) {
    const n = buckets[key]?.[side] ?? 0;
    if (n > 0) out[key] = n;
  }
  return out;
}

function sumVenueGoals(
  map: Partial<Record<(typeof GOAL_PERIOD_ORDER)[number], number>>,
): number {
  return Object.values(map).reduce((s, n) => s + (n ?? 0), 0);
}

function mergeBuckets(
  homeMap: Partial<Record<(typeof GOAL_PERIOD_ORDER)[number], number>>,
  awayMap: Partial<Record<(typeof GOAL_PERIOD_ORDER)[number], number>>,
): GoalTimingBucket[] {
  return GOAL_PERIOD_ORDER.map((key) => ({
    key,
    label: GOAL_PERIOD_LABEL[key],
    home: homeMap[key] ?? 0,
    away: awayMap[key] ?? 0,
  })).filter((b) => b.home > 0 || b.away > 0);
}

function parseHtScoreForGoals(ht: string | null | undefined): { home: number; away: number } | null {
  if (!ht) return null;
  const m = ht.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (!m) return null;
  return { home: Number(m[1]), away: Number(m[2]) };
}

/** Spread goals across periods — later periods first within each half. */
function spreadGoalsAcrossPeriods(
  count: number,
  periods: readonly (typeof GOAL_PERIOD_ORDER)[number][],
): Partial<Record<(typeof GOAL_PERIOD_ORDER)[number], number>> {
  const out: Partial<Record<(typeof GOAL_PERIOD_ORDER)[number], number>> = {};
  if (count <= 0) return out;
  const order = [...periods].reverse();
  for (let i = 0; i < count; i++) {
    const key = order[i % order.length];
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

function mergeGoalPeriodMaps(
  ...maps: Partial<Record<(typeof GOAL_PERIOD_ORDER)[number], number>>[]
): Partial<Record<(typeof GOAL_PERIOD_ORDER)[number], number>> {
  const out: Partial<Record<(typeof GOAL_PERIOD_ORDER)[number], number>> = {};
  for (const map of maps) {
    for (const key of GOAL_PERIOD_ORDER) {
      const n = map[key] ?? 0;
      if (n > 0) out[key] = (out[key] ?? 0) + n;
    }
  }
  return out;
}

/**
 * When frozen `stats/fixture` buckets fail score validation (common on big comps),
 * estimate 15-min periods from FT and HT scores so goals still appear on Summary.
 */
function synthesizeGoalTimingFromScore(
  homeGoals: number,
  awayGoals: number,
  htScore: string | null | undefined,
): FixtureGoalTiming {
  const ht = parseHtScoreForGoals(htScore);
  let homeHt = Math.min(ht?.home ?? 0, homeGoals);
  let awayHt = Math.min(ht?.away ?? 0, awayGoals);
  const home2h = homeGoals - homeHt;
  const away2h = awayGoals - awayHt;

  const homeMap = mergeGoalPeriodMaps(
    spreadGoalsAcrossPeriods(homeHt, FIRST_HALF_PERIODS),
    spreadGoalsAcrossPeriods(home2h, SECOND_HALF_PERIODS),
  );
  const awayMap = mergeGoalPeriodMaps(
    spreadGoalsAcrossPeriods(awayHt, FIRST_HALF_PERIODS),
    spreadGoalsAcrossPeriods(away2h, SECOND_HALF_PERIODS),
  );

  const buckets = mergeBuckets(homeMap, awayMap);
  const periodGoals = expandPeriodGoals(homeMap, awayMap);

  return {
    buckets,
    periodGoals,
    avgFirstGoalMinute: null,
    available: buckets.length > 0,
    approximate: true,
    chartMarkers: periodGoalsToChartMarkers(periodGoals),
  };
}

function expandPeriodGoals(
  homeMap: Partial<Record<(typeof GOAL_PERIOD_ORDER)[number], number>>,
  awayMap: Partial<Record<(typeof GOAL_PERIOD_ORDER)[number], number>>,
): GoalPeriodEvent[] {
  const events: GoalPeriodEvent[] = [];
  for (const key of GOAL_PERIOD_ORDER) {
    const sortMinute = GOAL_PERIOD_SORT[key];
    const label = GOAL_PERIOD_LABEL[key];
    for (let i = 0; i < (homeMap[key] ?? 0); i++) {
      events.push({ side: 'home', periodKey: key, periodLabel: label, sortMinute });
    }
    for (let i = 0; i < (awayMap[key] ?? 0); i++) {
      events.push({ side: 'away', periodKey: key, periodLabel: label, sortMinute: sortMinute + 0.5 });
    }
  }
  events.sort((a, b) => a.sortMinute - b.sortMinute || (a.side === 'home' ? -1 : 1));
  return events;
}

function buildFixtureGoalTiming(
  homeMap: Partial<Record<(typeof GOAL_PERIOD_ORDER)[number], number>>,
  awayMap: Partial<Record<(typeof GOAL_PERIOD_ORDER)[number], number>>,
  approximate: boolean,
  avgFirstGoalMinute: number | null = null,
): FixtureGoalTiming {
  const buckets = mergeBuckets(homeMap, awayMap);
  const periodGoals = expandPeriodGoals(homeMap, awayMap);
  return {
    buckets,
    periodGoals,
    avgFirstGoalMinute,
    available: buckets.length > 0,
    approximate,
    chartMarkers: periodGoalsToChartMarkers(periodGoals),
  };
}

/** Frozen half stats — venue `home` / `away` keys match HT when OddAlerts frozen rows are fixture-scoped. */
function parseFixtureGoalTimingFromHalfStats(
  rows: RawFixtureStatsRow[],
  fixtureId: number,
  homeTeamId: number | null,
  awayTeamId: number | null,
  htScore: string | null | undefined,
  homeGoals: number,
  awayGoals: number,
  stats?: MatchStats,
): FixtureGoalTiming | null {
  const frozen = rows.filter((r) => r.fixture_id === fixtureId);
  if (!frozen.length) return null;

  const homeRow = frozen.find((r) => homeTeamId != null && r.team_id === homeTeamId);
  const awayRow = frozen.find((r) => awayTeamId != null && r.team_id === awayTeamId);
  if (!homeRow || !awayRow) return null;

  const ht = parseHtScoreForGoals(htScore);
  if (!ht) return null;

  const homeHt = homeRow.goals_for_1h?.home;
  const awayHt = awayRow.goals_for_1h?.away;
  if (typeof homeHt !== 'number' || typeof awayHt !== 'number') return null;
  if (homeHt !== ht.home || awayHt !== ht.away) return null;

  const home2h = homeGoals - homeHt;
  const away2h = awayGoals - awayHt;
  if (home2h < 0 || away2h < 0) return null;

  const homeMap = mergeGoalPeriodMaps(
    spreadGoalsAcrossPeriods(homeHt, FIRST_HALF_PERIODS),
    spreadGoalsAcrossPeriods(home2h, SECOND_HALF_PERIODS),
  );
  const awayMap = mergeGoalPeriodMaps(
    spreadGoalsAcrossPeriods(awayHt, FIRST_HALF_PERIODS),
    spreadGoalsAcrossPeriods(away2h, SECOND_HALF_PERIODS),
  );

  const timing = buildFixtureGoalTiming(homeMap, awayMap, false);
  timing.chartMarkers = mergeChartMarkers(
    timing.chartMarkers,
    parseOddAlertsCardMarkers(homeRow, awayRow, stats),
  );
  return timing;
}

function spreadHalfCards(
  count: number,
  half: 1 | 2,
  side: 'home' | 'away',
): OddAlertsChartMarker[] {
  if (count <= 0) return [];
  const base = half === 1 ? 18 : 58;
  const step = half === 1 ? 12 : 10;
  const out: OddAlertsChartMarker[] = [];
  for (let i = 0; i < count; i++) {
    const minute = base + i * step;
    out.push({ kind: 'yellow', side, minute, sortKey: minute + (side === 'away' ? 0.01 : 0) });
  }
  return out;
}

function parseOddAlertsCardMarkers(
  homeRow: RawFixtureStatsRow,
  awayRow: RawFixtureStatsRow,
  stats?: MatchStats,
): OddAlertsChartMarker[] {
  const totalCards = stats?.cards;
  if (totalCards === 0) return [];

  const markers: OddAlertsChartMarker[] = [];
  markers.push(
    ...spreadHalfCards(homeRow.cards_1h_for?.home ?? 0, 1, 'home'),
    ...spreadHalfCards(awayRow.cards_1h_for?.away ?? 0, 1, 'away'),
    ...spreadHalfCards(homeRow.cards_2h_for?.home ?? 0, 2, 'home'),
    ...spreadHalfCards(awayRow.cards_2h_for?.away ?? 0, 2, 'away'),
  );

  if (typeof totalCards === 'number' && totalCards > 0 && markers.length > totalCards) {
    return markers.slice(0, totalCards);
  }
  return markers;
}

function periodGoalsToChartMarkers(periodGoals: GoalPeriodEvent[]): OddAlertsChartMarker[] {
  return periodGoals.map((g, i) => ({
    kind: 'goal' as const,
    side: g.side,
    minute: Math.round(g.sortMinute),
    sortKey: g.sortMinute + i * 0.001,
  }));
}

function mergeChartMarkers(...groups: OddAlertsChartMarker[][]): OddAlertsChartMarker[] {
  return groups
    .flat()
    .sort((a, b) => a.sortKey - b.sortKey);
}

function parseFixtureGoalTimingRows(
  rows: RawFixtureStatsRow[],
  fixtureId: number,
  homeTeamId: number | null,
  awayTeamId: number | null,
  homeGoals: number,
  awayGoals: number,
  stats?: MatchStats,
): FixtureGoalTiming | null {
  const frozen = rows.filter((r) => r.fixture_id === fixtureId);
  if (!frozen.length) return null;

  const homeRow = frozen.find((r) => homeTeamId != null && r.team_id === homeTeamId);
  const awayRow = frozen.find((r) => awayTeamId != null && r.team_id === awayTeamId);

  if (!homeRow && !awayRow) return null;

  const homeMap = venueGoalsFromRow(homeRow?.goal_timing_for ?? homeRow?.goal_timing, 'home');
  const awayMap = venueGoalsFromRow(awayRow?.goal_timing_for ?? awayRow?.goal_timing, 'away');

  const homeSum = sumVenueGoals(homeMap);
  const awaySum = sumVenueGoals(awayMap);

  if (homeGoals > 0 && homeSum !== homeGoals) return null;
  if (awayGoals > 0 && awaySum !== awayGoals) return null;
  if (homeGoals === 0 && awayGoals === 0) return null;

  let avgFirstGoalMinute: number | null = null;
  const fg = homeRow?.first_goal_time?.total ?? awayRow?.first_goal_time?.total;
  if (typeof fg === 'number' && fg > 0 && fg < 120) avgFirstGoalMinute = fg;

  const timing = buildFixtureGoalTiming(homeMap, awayMap, false, avgFirstGoalMinute);
  if (homeRow && awayRow) {
    timing.chartMarkers = mergeChartMarkers(
      timing.chartMarkers,
      parseOddAlertsCardMarkers(homeRow, awayRow, stats),
    );
  }
  return timing;
}

/**
 * Goal timing from OddAlerts `stats/fixture` (15-minute buckets).
 * Per-minute scorers are not in this feed — use API-Football when configured.
 */
export async function fetchFixtureGoalTiming(
  detail: Pick<
    RawFixtureDetail,
    'id' | 'home_id' | 'away_id' | 'home_goals' | 'away_goals' | 'ht_score' | 'stats'
  >,
  signal?: AbortSignal,
): Promise<FixtureGoalTiming> {
  const empty: FixtureGoalTiming = {
    buckets: [],
    periodGoals: [],
    avgFirstGoalMinute: null,
    available: false,
    chartMarkers: [],
  };

  const homeGoals = detail.home_goals ?? 0;
  const awayGoals = detail.away_goals ?? 0;
  if (homeGoals + awayGoals === 0) return empty;

  const scoreFallback = () => {
    const timing = synthesizeGoalTimingFromScore(homeGoals, awayGoals, detail.ht_score);
    return { ...timing, chartMarkers: periodGoalsToChartMarkers(timing.periodGoals) };
  };

  try {
    const env = await getJson<RawFixtureStatsRow>(`stats/fixture/${detail.id}`, {
      include_frozen: 'true',
      include: 'goal_timing,goal_timings,card_data',
    }, signal);

    const rows = env.data ?? [];
    const parsed =
      parseFixtureGoalTimingRows(
        rows,
        detail.id,
        detail.home_id,
        detail.away_id,
        homeGoals,
        awayGoals,
        detail.stats,
      ) ??
      parseFixtureGoalTimingFromHalfStats(
        rows,
        detail.id,
        detail.home_id,
        detail.away_id,
        detail.ht_score,
        homeGoals,
        awayGoals,
        detail.stats,
      );
    return parsed ?? scoreFallback();
  } catch {
    return scoreFallback();
  }
}

/** Upcoming fixtures for a single team. */
export async function fetchTeamUpcoming(
  teamId: number | string,
  signal?: AbortSignal,
): Promise<Fixture[]> {
  const env = await getJson<RawFixture>('fixtures/upcoming', { teams: String(teamId) }, signal);
  return env.data.map(mapFixture);
}

// ----- Squads (lineups) ---------------------------------------------------

export type PitchSide = 'left' | 'center' | 'right';

export type SquadPlayer = {
  id: number;
  teamId: number;
  name: string;
  shortName: string;
  position: 'GK' | 'DEF' | 'MID' | 'FWD' | '—';
  /** Granular role, e.g. "Right Back" (null when unknown). */
  detailedPosition: string | null;
  /** Horizontal hint for placing the player on the pitch. */
  side: PitchSide;
  shirt: number | null;
};

type RawPlayer = {
  id: number;
  team_id: number;
  names?: { name?: string; common_name?: string; firstname?: string; lastname?: string } | null;
  position_id?: number | null;
  detailed_position_id?: number | null;
  shirt_number?: number | null;
};

const POSITION_BY_ID: Record<number, SquadPlayer['position']> = {
  1: 'GK',
  2: 'DEF',
  3: 'MID',
  4: 'FWD',
};

const DETAILED_POSITION: Record<number, { label: string; side: PitchSide }> = {
  139: { label: 'Centre Back', side: 'center' },
  140: { label: 'Defensive Midfield', side: 'center' },
  141: { label: 'Attacking Midfield', side: 'center' },
  142: { label: 'Centre Forward', side: 'center' },
  143: { label: 'Left Wing', side: 'left' },
  144: { label: 'Central Midfield', side: 'center' },
  145: { label: 'Right Back', side: 'right' },
  146: { label: 'Left Back', side: 'left' },
  147: { label: 'Right Wing', side: 'right' },
  148: { label: 'Left Midfield', side: 'left' },
  149: { label: 'Right Midfield', side: 'right' },
  154: { label: 'Secondary Striker', side: 'center' },
};

function mapPlayer(raw: RawPlayer): SquadPlayer {
  const names = raw.names ?? {};
  const full = names.name || names.common_name || names.lastname || `#${raw.shirt_number ?? '?'}`;
  const detailed = raw.detailed_position_id ? DETAILED_POSITION[raw.detailed_position_id] : undefined;
  return {
    id: raw.id,
    teamId: raw.team_id,
    name: full,
    shortName: names.lastname || names.common_name || full,
    position: (raw.position_id && POSITION_BY_ID[raw.position_id]) || '—',
    detailedPosition: detailed?.label ?? null,
    side: detailed?.side ?? 'center',
    shirt: raw.shirt_number ?? null,
  };
}

/** Both squads for a fixture (the API exposes club rosters, not the matchday XI). */
export async function fetchSquads(
  fixtureId: number | string,
  signal?: AbortSignal,
): Promise<SquadPlayer[]> {
  const players: RawPlayer[] = [];
  for (let page = 1; page <= 3; page += 1) {
    const env = await getJson<RawPlayer>(
      `players/fixture/${fixtureId}`,
      { per_page: 100, page },
      signal,
    );
    players.push(...env.data);
    if (!env.info?.next_page_url) break;
  }
  return players.map(mapPlayer);
}

// ----- Standings ----------------------------------------------------------

/** Table zone for the green/yellow/red colouring (top/middle/bottom third). */
export type StandingZone = 'top' | 'mid' | 'bottom';

export type StandingRow = {
  rank: number;
  teamId: number;
  name: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
  homePoints: number;
  awayPoints: number;
  zone: StandingZone;
};

type RawSeasonStat = {
  team_id: number;
  name: string;
  played?: { total?: number };
  won?: { total?: number };
  drawn?: { total?: number };
  lost?: { total?: number };
  points?: { total?: number; home?: number; away?: number };
  goals_for?: { total?: number };
  goals_against?: { total?: number };
  goals_difference?: { total?: number };
};

/** Standings comparator: points, then goal difference, then goals for, then name. */
function compareStandings(
  a: { points: number; goalDiff: number; goalsFor: number; name: string },
  b: { points: number; goalDiff: number; goalsFor: number; name: string },
): number {
  if (b.points !== a.points) return b.points - a.points;
  if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff;
  if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
  return a.name.localeCompare(b.name);
}

/** Assigns green/middle/red zones by splitting the table into thirds. */
export function assignZones<T>(rows: T[]): (T & { zone: StandingZone })[] {
  const n = rows.length;
  const topCut = Math.ceil(n / 3);
  const bottomCut = n - Math.ceil(n / 3);
  return rows.map((row, i) => ({
    ...row,
    zone: (i < topCut ? 'top' : i >= bottomCut ? 'bottom' : 'mid') as StandingZone,
  }));
}

/** League table built from a season's team stats, sorted like a standings table. */
export async function fetchSeasonStandings(
  seasonId: number | string,
  signal?: AbortSignal,
): Promise<StandingRow[]> {
  const env = await getJson<RawSeasonStat>(`stats/season/${seasonId}`, {}, signal);
  const rows = env.data.map((s) => ({
    teamId: s.team_id,
    name: s.name,
    played: s.played?.total ?? 0,
    won: s.won?.total ?? 0,
    drawn: s.drawn?.total ?? 0,
    lost: s.lost?.total ?? 0,
    goalsFor: s.goals_for?.total ?? 0,
    goalsAgainst: s.goals_against?.total ?? 0,
    goalDiff: s.goals_difference?.total ?? (s.goals_for?.total ?? 0) - (s.goals_against?.total ?? 0),
    points: s.points?.total ?? 0,
    homePoints: s.points?.home ?? 0,
    awayPoints: s.points?.away ?? 0,
  }));

  rows.sort(compareStandings);

  return assignZones(rows).map((row, i) => ({ rank: i + 1, ...row }));
}

// ----- Standings movement (after a match) ---------------------------------

export type Movement = { position: number | null; delta: number | null };

const POINTS_FOR = { win: 3, draw: 1, loss: 0 } as const;

function rankOf(rows: { teamId: number }[], teamId: number): number | null {
  const i = rows.findIndex((r) => r.teamId === teamId);
  return i === -1 ? null : i + 1;
}

/**
 * Movement for the two teams in a finished/live match: compares the current
 * table with one recomputed as if this match had not been played. A positive
 * delta means the team climbed because of this result.
 */
export function standingsMovement(
  standings: StandingRow[],
  match: { homeId: number | null; awayId: number | null; homeGoals: number | null; awayGoals: number | null },
): { home: Movement; away: Movement } {
  const { homeId, awayId, homeGoals, awayGoals } = match;
  const blank: Movement = { position: null, delta: null };
  if (homeId == null || awayId == null || homeGoals == null || awayGoals == null) {
    return {
      home: { position: homeId != null ? rankOf(standings, homeId) : null, delta: null },
      away: { position: awayId != null ? rankOf(standings, awayId) : null, delta: null },
    };
  }

  const homePts = homeGoals > awayGoals ? POINTS_FOR.win : homeGoals === awayGoals ? POINTS_FOR.draw : POINTS_FOR.loss;
  const awayPts = awayGoals > homeGoals ? POINTS_FOR.win : homeGoals === awayGoals ? POINTS_FOR.draw : POINTS_FOR.loss;

  // Rebuild the table as it stood *before* this match.
  const before = standings
    .map((r) => {
      if (r.teamId === homeId) {
        return { ...r, points: r.points - homePts, goalsFor: r.goalsFor - homeGoals, goalDiff: r.goalDiff - (homeGoals - awayGoals) };
      }
      if (r.teamId === awayId) {
        return { ...r, points: r.points - awayPts, goalsFor: r.goalsFor - awayGoals, goalDiff: r.goalDiff - (awayGoals - homeGoals) };
      }
      return r;
    })
    .sort(compareStandings);

  const curHome = rankOf(standings, homeId);
  const curAway = rankOf(standings, awayId);
  const preHome = rankOf(before, homeId);
  const preAway = rankOf(before, awayId);

  return {
    home: { position: curHome, delta: preHome != null && curHome != null ? preHome - curHome : null },
    away: { position: curAway, delta: preAway != null && curAway != null ? preAway - curAway : null },
  };
}

// ----- Countries & competitions (browse) ----------------------------------

export type Country = { id: number; name: string; code: string | null; slug: string };

export type Season = {
  seasonId: number;
  seasonName: string;
  played: number | null;
  progress: number | null;
  isCurrent: boolean;
};

export type Competition = {
  id: number;
  name: string;
  slug: string;
  country: string;
  countryId: number;
  type: string;
  isCup: boolean;
  currentSeason: number | null;
  seasons: Season[];
};

type RawCompetition = {
  id: number;
  name: string;
  slug: string;
  country: string;
  country_id: number;
  type: string;
  current_season: number | null;
  seasons?: { season_id: number; season_name: string; played: number | null; progress: number | null }[];
};

let countriesCache: Country[] | null = null;
let countryCodeByName: Map<string, string> | null = null;

export async function fetchCountries(signal?: AbortSignal): Promise<Country[]> {
  if (countriesCache) return countriesCache;
  const env = await getJson<Country>('countries', {}, signal);
  countriesCache = env.data;
  countryCodeByName = new Map(
    env.data.filter((c) => c.code).map((c) => [c.name.toLowerCase(), c.code as string]),
  );
  return env.data;
}

/** ISO code for a country name (from the cached `/countries` list), if known. */
export function countryCodeForName(name: string | null | undefined): string | null {
  if (!name) return null;
  return countryCodeByName?.get(name.toLowerCase()) ?? null;
}

let competitionsCache: Competition[] | null = null;
let competitionsPromise: Promise<Competition[]> | null = null;

function mapCompetition(raw: RawCompetition): Competition {
  const seasons: Season[] = (raw.seasons ?? [])
    .map((s) => ({
      seasonId: s.season_id,
      seasonName: s.season_name,
      played: s.played,
      progress: s.progress,
      isCurrent: s.season_id === raw.current_season,
    }))
    .sort((a, b) => b.seasonId - a.seasonId); // newest first
  return {
    id: raw.id,
    name: raw.name,
    slug: raw.slug,
    country: raw.country,
    countryId: raw.country_id,
    type: raw.type,
    isCup: /cup/i.test(raw.type),
    currentSeason: raw.current_season,
    seasons,
  };
}

/**
 * All competitions with their season history. The API ignores `country_id`
 * filtering, so we fetch every page once and cache the result in-module.
 */
export async function fetchAllCompetitions(signal?: AbortSignal): Promise<Competition[]> {
  if (competitionsCache) return competitionsCache;
  if (competitionsPromise) return competitionsPromise;

  competitionsPromise = (async () => {
    // Fetch page 1, learn the page count, then fetch the rest in parallel
    // (sequential paging of ~10 pages was the main "countries load slowly" cause).
    const first = await getJson<RawCompetition>(
      'competitions',
      { include: 'seasons', per_page: 250, page: 1 },
      signal,
    );
    const all: Competition[] = first.data.map(mapCompetition);

    const totalPages = Math.min(Number(first.info?.total_pages ?? 1) || 1, 16);
    if (totalPages > 1) {
      const rest = await Promise.all(
        Array.from({ length: totalPages - 1 }, (_, i) =>
          getJson<RawCompetition>(
            'competitions',
            { include: 'seasons', per_page: 250, page: i + 2 },
            signal,
          ),
        ),
      );
      for (const env of rest) all.push(...env.data.map(mapCompetition));
    }

    competitionsCache = all;
    competitionsPromise = null;
    return all;
  })();

  return competitionsPromise;
}

/** Club competitions only (excludes national-team tournaments), by country. */
export function clubCompetitionsByCountry(
  comps: Competition[],
): Map<number, { country: string; leagues: Competition[]; cups: Competition[] }> {
  const map = new Map<number, { country: string; leagues: Competition[]; cups: Competition[] }>();
  for (const c of comps) {
    if (detectKind(c.name) !== 'club') continue;
    let entry = map.get(c.countryId);
    if (!entry) {
      entry = { country: c.country, leagues: [], cups: [] };
      map.set(c.countryId, entry);
    }
    (c.isCup ? entry.cups : entry.leagues).push(c);
  }
  for (const entry of map.values()) {
    entry.leagues.sort((a, b) => a.name.localeCompare(b.name));
    entry.cups.sort((a, b) => a.name.localeCompare(b.name));
  }
  return map;
}

export function findCompetition(comps: Competition[], id: number): Competition | undefined {
  return comps.find((c) => c.id === id);
}

// ----- Points by opponent tier (computed from season results) -------------

export type TierKey = StandingZone;
export type TierPoints = Record<TierKey, { points: number; played: number }>;

/** Derive a unix [from,to] window from a season name like "2024/2025" or "2024". */
export function seasonWindowUnix(seasonName: string): { fromUnix: number; toUnix: number } {
  const years = seasonName.match(/\d{4}/g)?.map(Number) ?? [];
  if (years.length >= 2) {
    // Split season, e.g. Aug 2024 -> Jul 2025.
    return {
      fromUnix: Math.floor(Date.UTC(years[0], 6, 1) / 1000), // Jul 1 start year
      toUnix: Math.floor(Date.UTC(years[1], 6, 15) / 1000), // Jul 15 end year
    };
  }
  if (years.length === 1) {
    return {
      fromUnix: Math.floor(Date.UTC(years[0], 0, 1) / 1000),
      toUnix: Math.floor(Date.UTC(years[0], 11, 31, 23, 59) / 1000),
    };
  }
  // Fallback: last ~13 months.
  const now = Math.floor(Date.now() / 1000);
  return { fromUnix: now - 400 * 86400, toUnix: now };
}

const tierCache = new Map<number, Map<number, TierPoints>>();

const emptyTier = (): TierPoints => ({
  top: { points: 0, played: 0 },
  mid: { points: 0, played: 0 },
  bottom: { points: 0, played: 0 },
});

/**
 * Points each team earned against top / middle / bottom-zone opponents, computed
 * from the season's finished results. Cached per season id.
 */
export async function computeTierPoints(
  opts: { competitionId: number; season: Season; standings: StandingRow[] },
  signal?: AbortSignal,
): Promise<Map<number, TierPoints>> {
  const cached = tierCache.get(opts.season.seasonId);
  if (cached) return cached;

  const zoneByTeam = new Map<number, StandingZone>();
  for (const r of opts.standings) zoneByTeam.set(r.teamId, r.zone);

  const { fromUnix, toUnix } = seasonWindowUnix(opts.season.seasonName);
  const raw = await fetchAllFixturesBetween(
    { fromUnix, toUnix, competitions: String(opts.competitionId), maxPages: 8 },
    signal,
  );

  const result = new Map<number, TierPoints>();
  const ensure = (id: number) => {
    let t = result.get(id);
    if (!t) {
      t = emptyTier();
      result.set(id, t);
    }
    return t;
  };

  for (const f of raw) {
    if (normaliseStatus(f.status) !== 'FT') continue;
    if (f.season_id != null && f.season_id !== opts.season.seasonId) continue;
    if (f.home_id == null || f.away_id == null || f.home_goals == null || f.away_goals == null) continue;

    const hg = f.home_goals;
    const ag = f.away_goals;
    const hPts = hg > ag ? 3 : hg === ag ? 1 : 0;
    const aPts = ag > hg ? 3 : hg === ag ? 1 : 0;
    const homeZone = zoneByTeam.get(f.home_id);
    const awayZone = zoneByTeam.get(f.away_id);

    if (awayZone) {
      const t = ensure(f.home_id);
      t[awayZone].points += hPts;
      t[awayZone].played += 1;
    }
    if (homeZone) {
      const t = ensure(f.away_id);
      t[homeZone].points += aPts;
      t[homeZone].played += 1;
    }
  }

  tierCache.set(opts.season.seasonId, result);
  return result;
}
