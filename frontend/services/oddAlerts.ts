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
  date: string;
  league: string;
};

export type RefereeInfo = {
  id?: number;
  name?: string;
  [key: string]: unknown;
};

/** A single fixture with optional included blocks. */
export type RawFixtureDetail = RawFixture & {
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
};

type RawSeasonStat = {
  team_id: number;
  name: string;
  played?: { total?: number };
  won?: { total?: number };
  drawn?: { total?: number };
  lost?: { total?: number };
  points?: { total?: number };
  goals_for?: { total?: number };
  goals_against?: { total?: number };
  goals_difference?: { total?: number };
};

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
  }));

  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return a.name.localeCompare(b.name);
  });

  return rows.map((row, i) => ({ rank: i + 1, ...row }));
}
