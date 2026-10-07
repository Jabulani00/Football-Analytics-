/**
 * SL-STATS rankings. Calls the existing calculators and returns rows for this
 * page only. Does not change how those stats are rendered elsewhere.
 */

import { buildStatsTables } from '@/services/statsBuilder';
import type { RawFixture } from '@/services/oddAlerts';
import {
  MIN_LEAGUE_PROGRESS,
  MIN_RATE_MATCHES,
  perGame,
  rankUpcomingValues,
  type DisciplineFeed,
  type FootyFixture,
} from '@/services/footyMarketStats';
import { predictFromStats, type VenueStats } from '@/services/predictionEngine';
import { buildRecommendation } from '@/utils/fixtureRecommendation';
import { MIN_SERIES, runLength, SERIES_DEFS } from '@/utils/fixtureSeries';
import type { TeamResult } from '@/utils/teamResults';

export const SL_LIMIT = 40;

export const ORDINARY_PICKS: { key: string; label: string }[] = [
  { key: 'sc_pct', label: 'Scoring percentage' },
  { key: 'conc_pct', label: 'Conceding percentage' },
  { key: 'cs_pct', label: 'Clean sheet' },
  { key: 'fts_pct', label: 'Failed to score' },
  { key: 'w_pct', label: 'Win' },
  { key: 'd_pct', label: 'Draw' },
  { key: 'l_pct', label: 'Loss' },
  { key: 'btts_yes', label: 'Both teams to score — yes' },
  { key: 'btts_no', label: 'Both teams to score — no' },
  { key: 'over05', label: 'Over 0.5 goals' },
  { key: 'over15', label: 'Over 1.5 goals' },
  { key: 'over25', label: 'Over 2.5 goals' },
  { key: 'over35', label: 'Over 3.5 goals' },
  { key: 'over45', label: 'Over 4.5 goals' },
  { key: 'under05', label: 'Under 0.5 goals' },
  { key: 'under15', label: 'Under 1.5 goals' },
  { key: 'under25', label: 'Under 2.5 goals' },
  { key: 'under35', label: 'Under 3.5 goals' },
  { key: 'under45', label: 'Under 4.5 goals' },
  { key: 'scoring_05', label: 'Scoring 0.5 or more' },
  { key: 'conceding_05', label: 'Conceding 0.5 or more' },
  { key: 'scoring_15', label: 'Scoring 1.5 or more' },
  { key: 'conceding_15', label: 'Conceding 1.5 or more' },
  { key: 'scoring_25', label: 'Scoring 2.5 or more' },
  { key: 'conceding_25', label: 'Conceding 2.5 or more' },
];

export type SeriesPick = { key: string; label: string };

export function seriesPicks(): SeriesPick[] {
  const full: Record<string, string> = {
    w: 'Win',
    d: 'Draw',
    l: 'Loss',
    btts_yes: 'Both teams to score — yes',
    btts_no: 'Both teams to score — no',
    cs: 'Clean sheet',
    fts: 'Failed to score',
    over05: 'Over 0.5 goals',
    over15: 'Over 1.5 goals',
    over25: 'Over 2.5 goals',
    over35: 'Over 3.5 goals',
    over45: 'Over 4.5 goals',
    under05: 'Under 0.5 goals',
    under15: 'Under 1.5 goals',
    under35: 'Under 3.5 goals',
    under45: 'Under 4.5 goals',
    scoring_05: 'Scoring 0.5 or more',
    conceding_05: 'Conceding 0.5 or more',
    scoring_15: 'Scoring 1.5 or more',
    conceding_15: 'Conceding 1.5 or more',
    scoring_25: 'Scoring 2.5 or more',
    conceding_25: 'Conceding 2.5 or more',
    without_scoring_15: 'Games without scoring 1.5 or more',
    without_conceding_15: 'Games without conceding 1.5 or more',
    without_scoring_25: 'Games without scoring 2.5 or more',
    without_conceding_25: 'Games without conceding 2.5 or more',
    without_w: 'Games without a win',
    without_d: 'Games without a draw',
    without_l: 'Games without a loss',
  };
  return SERIES_DEFS.map((def) => ({ key: def.key, label: full[def.key] ?? def.label }));
}

export type CornerLeagueRow = {
  id: string;
  league: string;
  country: string;
  played: number;
  perGame: number;
  overPct: number;
};

export type CornerMatchRow = {
  id: number;
  unix: number;
  match: string;
  league: string;
  home: number;
  away: number;
  avg: number;
};

export type SeriesTeamRow = {
  id: string;
  team: string;
  league: string;
  country: string;
  run: number;
  sample: number;
};

export type SeriesMatchRow = {
  id: number;
  unix: number;
  match: string;
  league: string;
  team: string;
  run: number;
  opponent: string;
  opponentRun: number;
  opponentLive: boolean;
};

export type RateRow = {
  id: string;
  name: string;
  league: string;
  country: string;
  played: number;
  pct: number;
};

export type RateMatchRow = {
  id: number;
  unix: number;
  match: string;
  league: string;
  homePct: number | null;
  awayPct: number | null;
  avg: number | null;
};

const OPEN_QUERY = { country: null, competitionId: null, kind: 'domestic' as const, scope: 'overall' as const };

export function rankCornerLeagues(feed: DisciplineFeed, line: string): CornerLeagueRow[] {
  return (feed.leagues ?? [])
    .filter((league) => league.cornerMatches >= 3)
    .map((league) => ({
      id: String(league.competitionId),
      league: league.league,
      country: league.country,
      played: league.cornerMatches,
      perGame: perGame(league.matchCorners, league.cornerMatches) ?? 0,
      overPct: league.cornerOver[line] ?? 0,
    }))
    .sort((a, b) => b.perGame - a.perGame || a.league.localeCompare(b.league))
    .slice(0, SL_LIMIT);
}

export function rankCornerMatches(feed: DisciplineFeed, upcoming: FootyFixture[]): CornerMatchRow[] {
  const valueFor = (competitionId: number, name: string) => {
    const team = feed.teams.find(
      (item) => item.name === name && (item.competitionId == null || item.competitionId === competitionId),
    );
    if (!team || team.played < 1 || team.matchCorners == null) return null;
    return perGame(team.matchCorners, team.played);
  };
  return rankUpcomingValues(upcoming, OPEN_QUERY, valueFor, 'avg')
    .slice(0, SL_LIMIT)
    .map((row) => ({
      id: row.id,
      unix: row.unix,
      match: `${row.home} vs ${row.away}`,
      league: row.league,
      home: row.homePct,
      away: row.awayPct,
      avg: row.pct,
    }));
}

type TeamBucket = {
  team: string;
  league: string;
  country: string;
  competitionId: number;
  isCup: boolean;
  results: TeamResult[];
};

function resultFor(fx: FootyFixture, team: string): TeamResult {
  const isHome = fx.homeName === team;
  const gf = (isHome ? fx.homeGoals : fx.awayGoals) ?? 0;
  const ga = (isHome ? fx.awayGoals : fx.homeGoals) ?? 0;
  return {
    fixtureId: fx.id,
    unix: fx.unix,
    teamId: 0,
    opponentId: null,
    opponentName: isHome ? fx.awayName : fx.homeName,
    isHome,
    gf,
    ga,
    outcome: gf > ga ? 'W' : gf < ga ? 'L' : 'D',
    opponentRank: null,
    teamRank: null,
    opponentAbove: null,
    goalDiff: gf - ga,
    competitionId: fx.competitionId,
  };
}

function teamBuckets(fixtures: FootyFixture[], includeCups = false): Map<string, TeamBucket> {
  const map = new Map<string, TeamBucket>();
  const finished = fixtures
    .filter((fx) => fx.finished && fx.homeGoals != null && fx.awayGoals != null && !fx.isFriendly && (includeCups || !fx.isCup))
    .sort((a, b) => b.unix - a.unix);
  for (const fx of finished) {
    for (const team of [fx.homeName, fx.awayName]) {
      const key = `${fx.competitionId}::${team}`;
      let bucket = map.get(key);
      if (!bucket) {
        bucket = {
          team,
          league: fx.competitionName,
          country: fx.country,
          competitionId: fx.competitionId,
          isCup: fx.isCup,
          results: [],
        };
        map.set(key, bucket);
      }
      bucket.results.push(resultFor(fx, team));
    }
  }
  return map;
}

function seriesPred(key: string): ((r: TeamResult) => boolean) | null {
  const def = SERIES_DEFS.find((item) => item.key === key);
  if (!def) return null;
  return def.invert ? (r) => !def.hit(r) : def.hit;
}

export function rankSeriesTeams(
  fixtures: FootyFixture[],
  seriesKey: string,
  scope: 'overall' | 'home' | 'away' = 'overall',
): SeriesTeamRow[] {
  const pred = seriesPred(seriesKey);
  if (!pred) return [];
  const rows: SeriesTeamRow[] = [];
  for (const bucket of teamBuckets(fixtures).values()) {
    const results = scope === 'overall' ? bucket.results : bucket.results.filter((r) => (scope === 'home' ? r.isHome : !r.isHome));
    const run = runLength(results, pred);
    if (run < MIN_SERIES) continue;
    rows.push({
      id: `${bucket.competitionId}::${bucket.team}`,
      team: bucket.team,
      league: bucket.league,
      country: bucket.country,
      run,
      sample: results.length,
    });
  }
  return rows.sort((a, b) => b.run - a.run || a.team.localeCompare(b.team)).slice(0, SL_LIMIT);
}

export function seriesMatches(
  fixtures: FootyFixture[],
  upcoming: FootyFixture[],
  seriesKey: string,
  scope: 'overall' | 'home' | 'away' = 'overall',
): SeriesMatchRow[] {
  const pred = seriesPred(seriesKey);
  if (!pred) return [];
  const buckets = teamBuckets(fixtures);
  const teams = rankSeriesTeams(fixtures, seriesKey, scope);
  const rows: SeriesMatchRow[] = [];
  for (const team of teams) {
    const next = upcoming
      .filter((fx) => {
        if (fx.finished || fx.isFriendly) return false;
        if (fx.competitionId !== Number(team.id.split('::')[0])) return false;
        const atHome = fx.homeName === team.team;
        const atAway = fx.awayName === team.team;
        if (scope === 'home') return atHome;
        if (scope === 'away') return atAway;
        return atHome || atAway;
      })
      .sort((a, b) => a.unix - b.unix)[0];
    if (!next) continue;
    const opponent = next.homeName === team.team ? next.awayName : next.homeName;
    const other = buckets.get(`${next.competitionId}::${opponent}`);
    const opponentResults =
      !other || scope === 'overall'
        ? other?.results ?? []
        : other.results.filter((r) => (scope === 'home' ? !r.isHome : r.isHome));
    const opponentRun = other ? runLength(opponentResults, pred) : 0;
    rows.push({
      id: next.id,
      unix: next.unix,
      match: `${next.homeName} vs ${next.awayName}`,
      league: next.competitionName,
      team: team.team,
      run: team.run,
      opponent,
      opponentRun,
      opponentLive: opponentRun >= MIN_SERIES,
    });
  }
  return rows.sort((a, b) => b.run - a.run || a.unix - b.unix).slice(0, SL_LIMIT);
}

function asRaw(fx: FootyFixture): RawFixture {
  return {
    id: fx.id,
    home_name: fx.homeName,
    away_name: fx.awayName,
    home_id: null,
    away_id: null,
    competition_id: fx.competitionId,
    competition_country: fx.country,
    competition_name: fx.competitionName,
    competition_type: '',
    competition_predictability: null,
    season: '',
    status: fx.regulation === false ? 'AET' : 'FT',
    home_goals: fx.homeGoals,
    away_goals: fx.awayGoals,
    ht_score: fx.htHome != null && fx.htAway != null ? `${fx.htHome}-${fx.htAway}` : null,
    elapsed: null,
    elapsed_seconds: null,
    time_added: null,
    home_position: null,
    away_position: null,
    unix: fx.unix,
    is_cup: fx.isCup,
    is_friendly: fx.isFriendly,
  } as RawFixture;
}

type LeagueTables = {
  competitionId: number;
  league: string;
  country: string;
  teams: { name: string; played: number; pct: number }[];
  leaguePct: number | null;
  leagueSample: number;
};

function readStat(row: { [key: string]: string | number }, key: string): number | null {
  const value = row[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

let tableCache: { fixtures: FootyFixture[]; statKey: string; scope: string; tables: LeagueTables[] } | null = null;

function tablesByLeague(
  fixtures: FootyFixture[],
  statKey: string,
  scope: 'overall' | 'home' | 'away' = 'overall',
): LeagueTables[] {
  if (tableCache && tableCache.fixtures === fixtures && tableCache.statKey === statKey && tableCache.scope === scope) {
    return tableCache.tables;
  }
  const groups = new Map<number, FootyFixture[]>();
  for (const fx of fixtures) {
    if (!fx.finished || fx.homeGoals == null || fx.awayGoals == null || fx.isFriendly || fx.isCup) continue;
    const list = groups.get(fx.competitionId) ?? [];
    list.push(fx);
    groups.set(fx.competitionId, list);
  }
  const out: LeagueTables[] = [];
  for (const [competitionId, rows] of groups) {
    const built = buildStatsTables({
      fixtures: rows.map(asRaw),
      leagueKey: () => rows[0].competitionName,
    });
    const ordinary = built.tables[`ordinary_ft_${scope}`] ?? [];
    const teams = ordinary
      .map((row) => {
        const played = readStat(row, 'sample_size') ?? 0;
        const pct = readStat(row, statKey);
        return { name: row.team_name, played, pct: pct ?? 0, ok: pct != null && played >= MIN_RATE_MATCHES };
      })
      .filter((row) => row.ok);
    const leagueRow = built.tables[`league_avg_ft_${scope}`]?.[0];
    out.push({
      competitionId,
      league: rows[0].competitionName,
      country: rows[0].country,
      teams: teams.map(({ name, played, pct }) => ({ name, played, pct })),
      leaguePct: leagueRow ? readStat(leagueRow, statKey) : null,
      leagueSample: leagueRow ? readStat(leagueRow, 'sample_size') ?? 0 : 0,
    });
  }
  tableCache = { fixtures, statKey, scope, tables: out };
  return out;
}

export function rankOrdinaryTeams(
  fixtures: FootyFixture[],
  statKey: string,
  scope: 'overall' | 'home' | 'away' = 'overall',
): RateRow[] {
  const rows: RateRow[] = [];
  for (const league of tablesByLeague(fixtures, statKey, scope)) {
    for (const team of league.teams) {
      rows.push({
        id: `${league.competitionId}::${team.name}`,
        name: team.name,
        league: league.league,
        country: league.country,
        played: team.played,
        pct: team.pct,
      });
    }
  }
  return rows.sort((a, b) => b.pct - a.pct || b.played - a.played || a.name.localeCompare(b.name)).slice(0, SL_LIMIT);
}

export function ordinaryMatches(
  fixtures: FootyFixture[],
  upcoming: FootyFixture[],
  statKey: string,
  scope: 'overall' | 'home' | 'away' = 'overall',
): RateMatchRow[] {
  const leagues = tablesByLeague(fixtures, statKey, scope);
  const rate = new Map<string, number>();
  for (const league of leagues) {
    for (const team of league.teams) rate.set(`${league.competitionId}::${team.name}`, team.pct);
  }
  const rows: RateMatchRow[] = [];
  for (const fx of upcoming) {
    if (fx.finished || fx.isFriendly || fx.isCup) continue;
    if (fx.progress == null || fx.progress < MIN_LEAGUE_PROGRESS) continue;
    const home = rate.get(`${fx.competitionId}::${fx.homeName}`) ?? null;
    const away = rate.get(`${fx.competitionId}::${fx.awayName}`) ?? null;
    if (home == null && away == null) continue;
    const avg = home != null && away != null ? Math.round(((home + away) / 2) * 10) / 10 : null;
    rows.push({
      id: fx.id,
      unix: fx.unix,
      match: `${fx.homeName} vs ${fx.awayName}`,
      league: fx.competitionName,
      homePct: home,
      awayPct: away,
      avg,
    });
  }
  return rows
    .sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1) || a.unix - b.unix)
    .slice(0, SL_LIMIT);
}

export function rankLeagueAverages(
  fixtures: FootyFixture[],
  statKey: string,
  scope: 'overall' | 'home' | 'away' = 'overall',
): RateRow[] {
  return tablesByLeague(fixtures, statKey, scope)
    .filter((league) => league.leaguePct != null)
    .map((league) => ({
      id: String(league.competitionId),
      name: league.league,
      league: league.league,
      country: league.country,
      played: league.leagueSample,
      pct: league.leaguePct as number,
    }))
    .sort((a, b) => b.pct - a.pct || a.name.localeCompare(b.name))
    .slice(0, SL_LIMIT);
}

export const TOP_BOARD = 200;

export const BOARD_FLOORS = [5, 7, 10, 15] as const;

export type BoardEntity = 'teams' | 'leagues' | 'competitions';

export type BoardMeasure = 'series' | 'ordinary';

export type BoardRow = {
  id: string;
  name: string;
  context: string;
  country: string;
  typeLabel: string;
  figure: string;
  detail: string;
  extra: string;
};

type TeamMeasure = {
  bucket: TeamBucket;
  played: number;
  run: number;
  pct: number;
};

/**
 * Top 200 for one stat. Teams are one row per side in a competition.
 * Leagues are domestic competitions, ranked by the longest current series
 * or by the average rate of teams that cleared the minimum games.
 * Competitions are the same table with cups included.
 */
export function rankTopBoard(
  fixtures: FootyFixture[],
  options: {
    entity: BoardEntity;
    measure: BoardMeasure;
    statKey: string;
    seriesKey: string;
    scope: 'overall' | 'home' | 'away';
    minimum: number;
    limit?: number;
  },
): BoardRow[] {
  const limit = options.limit ?? TOP_BOARD;
  const includeCups = options.entity !== 'leagues';
  const measured: TeamMeasure[] = [];
  const series = options.measure === 'series' ? seriesPred(options.seriesKey || 'w') : null;
  const hit = options.measure === 'ordinary' ? ordinaryHit(options.statKey) : null;
  if (options.measure === 'series' && !series) return [];
  if (options.measure === 'ordinary' && !hit) return [];

  for (const bucket of teamBuckets(fixtures, includeCups).values()) {
    const results = inScope(bucket.results, options.scope);
    if (options.measure === 'series' && series) {
      const run = runLength(results, series);
      const floor = options.minimum > 0 ? options.minimum : 1;
      if (results.length === 0 || run < floor) continue;
      measured.push({ bucket, played: results.length, run, pct: 0 });
      continue;
    }
    if (!hit || results.length < Math.max(options.minimum, 1)) continue;
    const hits = results.filter(hit).length;
    measured.push({
      bucket,
      played: results.length,
      run: 0,
      pct: Math.round((hits / results.length) * 1000) / 10,
    });
  }

  if (options.entity === 'teams') {
    const sorted =
      options.measure === 'series'
        ? [...measured].sort((a, b) => b.run - a.run || b.played - a.played || a.bucket.team.localeCompare(b.bucket.team))
        : [...measured].sort((a, b) => b.pct - a.pct || b.played - a.played || a.bucket.team.localeCompare(b.bucket.team));
    return sorted.slice(0, limit).map((row) => ({
      id: `${row.bucket.competitionId}::${row.bucket.team}`,
      name: row.bucket.team,
      context: row.bucket.league,
      country: row.bucket.country,
      typeLabel: row.bucket.isCup ? 'Cup' : 'League',
      figure: options.measure === 'series' ? `${row.run} games` : `${row.pct.toFixed(1)}%`,
      detail: String(row.played),
      extra: '',
    }));
  }

  const groups = new Map<number, TeamMeasure[]>();
  for (const row of measured) {
    const list = groups.get(row.bucket.competitionId) ?? [];
    list.push(row);
    groups.set(row.bucket.competitionId, list);
  }
  const grouped = [...groups.values()].map((list) => {
    const ordered =
      options.measure === 'series'
        ? [...list].sort((a, b) => b.run - a.run || a.bucket.team.localeCompare(b.bucket.team))
        : [...list].sort((a, b) => b.pct - a.pct || a.bucket.team.localeCompare(b.bucket.team));
    const best = ordered[0];
    const average = Math.round((list.reduce((sum, row) => sum + row.pct, 0) / list.length) * 10) / 10;
    return { best, count: list.length, average };
  });
  const sortedGroups =
    options.measure === 'series'
      ? grouped.sort((a, b) => b.best.run - a.best.run || b.count - a.count || a.best.bucket.league.localeCompare(b.best.bucket.league))
      : grouped.sort((a, b) => b.average - a.average || b.count - a.count || a.best.bucket.league.localeCompare(b.best.bucket.league));

  return sortedGroups.slice(0, limit).map((row) => ({
    id: String(row.best.bucket.competitionId),
    name: row.best.bucket.league,
    context: row.best.bucket.country,
    country: row.best.bucket.country,
    typeLabel: row.best.bucket.isCup ? 'Cup' : 'League',
    figure: options.measure === 'series' ? `${row.best.run} games` : `${row.average.toFixed(1)}%`,
    detail: row.best.bucket.team,
    extra: options.measure === 'series' ? String(row.count) : `${row.best.pct.toFixed(1)}% · ${row.count} ${row.count === 1 ? 'team' : 'teams'}`,
  }));
}

export type BestBet = {
  market: string;
  selection: string;
  probability: number;
};

function sideStats(games: FootyFixture[], home: boolean): VenueStats {
  if (games.length === 0) return { scAvg: 0, concAvg: 0, sample: 0 };
  let scored = 0;
  let conceded = 0;
  for (const game of games) {
    const gf = home ? game.homeGoals ?? 0 : game.awayGoals ?? 0;
    const ga = home ? game.awayGoals ?? 0 : game.homeGoals ?? 0;
    scored += gf;
    conceded += ga;
  }
  return { scAvg: scored / games.length, concAvg: conceded / games.length, sample: games.length };
}

function fixtureModel(fx: FootyFixture, league: FootyFixture[]) {
  if (league.length === 0) return null;
  const homeGames = league.filter((game) => game.homeName === fx.homeName);
  const awayGames = league.filter((game) => game.awayName === fx.awayName);
  const homeAvg = league.reduce((sum, game) => sum + (game.homeGoals ?? 0), 0) / league.length;
  const awayAvg = league.reduce((sum, game) => sum + (game.awayGoals ?? 0), 0) / league.length;
  return predictFromStats(sideStats(homeGames, true), sideStats(awayGames, false), {
    homeAvg,
    awayAvg,
    measured: true,
  });
}

function betFromLeague(fx: FootyFixture, league: FootyFixture[]): BestBet | null {
  const prediction = fixtureModel(fx, league);
  if (!prediction) return null;
  const rec = buildRecommendation({ prediction, homeName: fx.homeName, awayName: fx.awayName });
  if (!rec.best) return null;
  return { market: rec.best.market, selection: rec.best.selection, probability: rec.best.probability };
}

/** Same best-bet pick the fixture row shows: market, selection, and model percentage. */
export function bestBetForFixture(fx: FootyFixture, finished: FootyFixture[]): BestBet | null {
  return betFromLeague(
    fx,
    finished.filter(
      (game) => game.finished && game.competitionId === fx.competitionId && game.homeGoals != null && game.awayGoals != null,
    ),
  );
}

/** One pass over finished matches, then a bet only for the fixtures asked for. */
export function bestBetsForFixtures(fixtures: FootyFixture[], finished: FootyFixture[]): Map<number, BestBet | null> {
  const byComp = new Map<number, FootyFixture[]>();
  for (const game of finished) {
    if (!game.finished || game.homeGoals == null || game.awayGoals == null) continue;
    const list = byComp.get(game.competitionId);
    if (list) list.push(game);
    else byComp.set(game.competitionId, [game]);
  }
  const map = new Map<number, BestBet | null>();
  for (const fx of fixtures) map.set(fx.id, betFromLeague(fx, byComp.get(fx.competitionId) ?? []));
  return map;
}

export type EvidenceLine = {
  label: string;
  detail: string;
  pct: number | null;
};

export type PreviousEvidence = {
  team: string;
  text: string;
  hit: boolean;
};

export type CombinedMatch = {
  id: number;
  unix: number;
  match: string;
  league: string;
  combined: number | null;
  evidence: EvidenceLine[];
  previous: PreviousEvidence[];
};

function ordinaryHit(statKey: string): ((r: TeamResult) => boolean) | null {
  const over = (line: number) => (r: TeamResult) => r.gf + r.ga > line;
  const under = (line: number) => (r: TeamResult) => r.gf + r.ga < line;
  const scoring = (min: number) => (r: TeamResult) => r.gf >= min;
  const conceding = (min: number) => (r: TeamResult) => r.ga >= min;
  const map: Record<string, (r: TeamResult) => boolean> = {
    sc_pct: (r) => r.gf > 0,
    conc_pct: (r) => r.ga > 0,
    cs_pct: (r) => r.ga === 0,
    fts_pct: (r) => r.gf === 0,
    w_pct: (r) => r.gf > r.ga,
    d_pct: (r) => r.gf === r.ga,
    l_pct: (r) => r.gf < r.ga,
    btts_yes: (r) => r.gf > 0 && r.ga > 0,
    btts_no: (r) => r.gf === 0 || r.ga === 0,
    over05: over(0.5),
    over15: over(1.5),
    over25: over(2.5),
    over35: over(3.5),
    over45: over(4.5),
    under05: under(0.5),
    under15: under(1.5),
    under25: under(2.5),
    under35: under(3.5),
    under45: under(4.5),
    scoring_05: scoring(1),
    conceding_05: conceding(1),
    scoring_15: scoring(2),
    conceding_15: conceding(2),
    scoring_25: scoring(3),
    conceding_25: conceding(3),
  };
  return map[statKey] ?? null;
}

function inScope(results: TeamResult[], scope: 'overall' | 'home' | 'away'): TeamResult[] {
  if (scope === 'home') return results.filter((row) => row.isHome);
  if (scope === 'away') return results.filter((row) => !row.isHome);
  return results;
}

/**
 * One query across ordinary stats, the league average, and an optional series.
 * The combined figure is the average of those calculations. Previous matches are
 * the evidence each side's rate was counted from.
 */
export function combineMatchQuery(
  finished: FootyFixture[],
  upcoming: FootyFixture[],
  options: {
    scope: 'overall' | 'home' | 'away';
    statKey: string;
    statLabel: string;
    seriesKey: string;
    seriesLabel: string;
  },
): CombinedMatch[] {
  const tables = tablesByLeague(finished, options.statKey, options.scope);
  const byTeam = new Map<string, { pct: number; played: number }>();
  const byLeague = new Map<number, { pct: number; name: string }>();
  for (const league of tables) {
    if (league.leaguePct != null) byLeague.set(league.competitionId, { pct: league.leaguePct, name: league.league });
    for (const team of league.teams) byTeam.set(`${league.competitionId}::${team.name}`, { pct: team.pct, played: team.played });
  }
  const buckets = teamBuckets(finished);
  const hit = ordinaryHit(options.statKey);
  const series = options.seriesKey ? seriesPred(options.seriesKey) : null;
  const rows: CombinedMatch[] = [];

  for (const fx of upcoming) {
    if (fx.finished || fx.isFriendly) continue;
    if (fx.progress != null && fx.progress < MIN_LEAGUE_PROGRESS) continue;
    const evidence: EvidenceLine[] = [];
    const previous: PreviousEvidence[] = [];

    const addSide = (name: string, side: 'Home' | 'Away') => {
      const team = byTeam.get(`${fx.competitionId}::${name}`);
      if (team) {
        evidence.push({
          label: `${side} ${options.statLabel}`,
          detail: `${team.pct.toFixed(1)}% from ${team.played} previous matches`,
          pct: team.pct,
        });
      }
      const results = inScope(buckets.get(`${fx.competitionId}::${name}`)?.results ?? [], options.scope);
      if (series && results.length > 0) {
        const run = runLength(results, series);
        const hits = results.filter(series).length;
        const pct = Math.round((hits / results.length) * 1000) / 10;
        evidence.push({
          label: `${side} ${options.seriesLabel} series`,
          detail:
            run >= MIN_SERIES
              ? `Current run ${run}. ${hits} of ${results.length} previous matches`
              : `No live series. ${hits} of ${results.length} previous matches`,
          pct,
        });
      }
      if (hit) {
        for (const game of results.slice(0, 4)) {
          previous.push({
            team: name,
            text: `${name} ${game.gf}-${game.ga} ${game.opponentName}`,
            hit: hit(game),
          });
        }
      }
    };

    addSide(fx.homeName, 'Home');
    addSide(fx.awayName, 'Away');
    const league = byLeague.get(fx.competitionId);
    if (league) {
      evidence.push({
        label: `League average ${options.statLabel}`,
        detail: `${league.pct.toFixed(1)}% across teams in ${league.name}`,
        pct: league.pct,
      });
    }
    const pcts = evidence.map((line) => line.pct).filter((n): n is number => n != null);
    const combined = pcts.length === 0 ? null : Math.round((pcts.reduce((sum, n) => sum + n, 0) / pcts.length) * 10) / 10;
    rows.push({
      id: fx.id,
      unix: fx.unix,
      match: `${fx.homeName} vs ${fx.awayName}`,
      league: fx.competitionName,
      combined,
      evidence,
      previous,
    });
  }

  return rows.sort((a, b) => (b.combined ?? -1) - (a.combined ?? -1) || a.unix - b.unix).slice(0, 48);
}

const QUICK_SAMPLE = 10;
const LEAKY_CONCEDED_HITS = 8;
const LEAKY_BTTS_MARK = 70;
const SECOND_HALF_NIL_MAX = 22;
const SECOND_HALF_HOME_CONCEDED = 60;
const SECOND_HALF_AWAY_SCORED = 70;
const SECOND_HALF_AWAY_WINDOW = 5;
const SECOND_HALF_HEAVY_MARK = 7;
const SECOND_HALF_LEAGUE_GOALS = 2.5;

type TeamGame = {
  unix: number;
  gf: number;
  ga: number;
  isHome: boolean;
  htGf: number | null;
  htGa: number | null;
};

function ratePct(hits: number, sample: number): number {
  return Math.round((hits / sample) * 1000) / 10;
}

function secondHalfSplit(game: TeamGame): { gf: number; ga: number; first: number; second: number } | null {
  if (game.htGf == null || game.htGa == null) return null;
  const gf = game.gf - game.htGf;
  const ga = game.ga - game.htGa;
  if (gf < 0 || ga < 0) return null;
  return { gf, ga, first: game.htGf + game.htGa, second: gf + ga };
}

/** Newest first. League games in one competition, for one side. */
function teamHistory(fixtures: FootyFixture[]): Map<string, TeamGame[]> {
  const map = new Map<string, TeamGame[]>();
  const finished = fixtures
    .filter((fx) => fx.finished && fx.homeGoals != null && fx.awayGoals != null && !fx.isFriendly && !fx.isCup)
    .sort((a, b) => b.unix - a.unix);
  for (const fx of finished) {
    const sides: { name: string; gf: number; ga: number; isHome: boolean; htGf: number | null; htGa: number | null }[] = [
      { name: fx.homeName, gf: fx.homeGoals ?? 0, ga: fx.awayGoals ?? 0, isHome: true, htGf: fx.htHome, htGa: fx.htAway },
      { name: fx.awayName, gf: fx.awayGoals ?? 0, ga: fx.homeGoals ?? 0, isHome: false, htGf: fx.htAway, htGa: fx.htHome },
    ];
    for (const side of sides) {
      const key = `${fx.competitionId}::${side.name}`;
      const list = map.get(key) ?? [];
      list.push({ unix: fx.unix, gf: side.gf, ga: side.ga, isHome: side.isHome, htGf: side.htGf, htGa: side.htGa });
      map.set(key, list);
    }
  }
  return map;
}

function goalsPerGame(fixtures: FootyFixture[], competitionId: number): number | null {
  const games = fixtures.filter(
    (fx) => fx.finished && fx.competitionId === competitionId && fx.homeGoals != null && fx.awayGoals != null && !fx.isFriendly && !fx.isCup,
  );
  if (games.length === 0) return null;
  const goals = games.reduce((sum, fx) => sum + (fx.homeGoals ?? 0) + (fx.awayGoals ?? 0), 0);
  return goals / games.length;
}

function openFixtures(upcoming: FootyFixture[]): FootyFixture[] {
  return upcoming.filter((fx) => !fx.finished && !fx.isFriendly && !fx.isCup);
}

export type LeakyRow = {
  id: number;
  unix: number;
  match: string;
  league: string;
  btts: number;
  over15: number;
  over25: number;
  homeBttsPct: number;
  awayBttsPct: number;
  homeBttsPass: boolean;
  awayBttsPass: boolean;
  expectedHome: number;
  expectedAway: number;
};

/**
 * Both teams conceded in at least 8 of their last 10. Ranked by the model
 * both-teams-to-score probability. The 70% both-teams-to-score marks are
 * columns, not a reason to drop the fixture.
 */
export function rankLeakyFixtures(finished: FootyFixture[], upcoming: FootyFixture[]): LeakyRow[] {
  const history = teamHistory(finished);
  const byComp = new Map<number, FootyFixture[]>();
  for (const game of finished) {
    if (!game.finished || game.homeGoals == null || game.awayGoals == null) continue;
    const list = byComp.get(game.competitionId) ?? [];
    list.push(game);
    byComp.set(game.competitionId, list);
  }
  const rows: LeakyRow[] = [];
  for (const fx of openFixtures(upcoming)) {
    const home = history.get(`${fx.competitionId}::${fx.homeName}`) ?? [];
    const away = history.get(`${fx.competitionId}::${fx.awayName}`) ?? [];
    if (home.length < QUICK_SAMPLE || away.length < QUICK_SAMPLE) continue;
    const homeLast = home.slice(0, QUICK_SAMPLE);
    const awayLast = away.slice(0, QUICK_SAMPLE);
    const homeConceded = homeLast.filter((game) => game.ga >= 1).length;
    const awayConceded = awayLast.filter((game) => game.ga >= 1).length;
    if (homeConceded < LEAKY_CONCEDED_HITS || awayConceded < LEAKY_CONCEDED_HITS) continue;
    const prediction = fixtureModel(fx, byComp.get(fx.competitionId) ?? []);
    if (!prediction) continue;
    const homeBttsPct = ratePct(homeLast.filter((game) => game.gf > 0 && game.ga > 0).length, QUICK_SAMPLE);
    const awayBttsPct = ratePct(awayLast.filter((game) => game.gf > 0 && game.ga > 0).length, QUICK_SAMPLE);
    rows.push({
      id: fx.id,
      unix: fx.unix,
      match: `${fx.homeName} vs ${fx.awayName}`,
      league: fx.competitionName,
      btts: prediction.btts,
      over15: prediction.over15,
      over25: prediction.over25,
      homeBttsPct,
      awayBttsPct,
      homeBttsPass: homeBttsPct >= LEAKY_BTTS_MARK,
      awayBttsPass: awayBttsPct >= LEAKY_BTTS_MARK,
      expectedHome: prediction.expectedHome,
      expectedAway: prediction.expectedAway,
    });
  }
  return rows.sort((a, b) => b.btts - a.btts || a.unix - b.unix).slice(0, SL_LIMIT);
}

export type SecondHalfRow = {
  id: number;
  unix: number;
  match: string;
  league: string;
  awayGoalsLast5: number;
  homeNilPct: number;
  awayNilPct: number;
  homeConcededPct: number;
  awayScoredPct: number;
  homeHeavy: number;
  awayHeavy: number;
  homeHeavyPass: boolean;
  awayHeavyPass: boolean;
  midweek: boolean;
};

function nilRate(games: TeamGame[]): number | null {
  const splits = games.map(secondHalfSplit).filter((split): split is NonNullable<typeof split> => split != null);
  if (splits.length < QUICK_SAMPLE) return null;
  return ratePct(splits.filter((split) => split.second === 0).length, splits.length);
}

function heavyCount(games: TeamGame[]): number | null {
  const recent = games.map(secondHalfSplit).filter((split): split is NonNullable<typeof split> => split != null).slice(0, QUICK_SAMPLE);
  if (recent.length < QUICK_SAMPLE) return null;
  return recent.filter((split) => split.second > split.first).length;
}

/** Tuesday, Wednesday, or Thursday in the same local clock as the kickoff label. */
export function isMidweekKickoff(unix: number): boolean {
  const day = new Date(unix * 1000).getDay();
  return day === 2 || day === 3 || day === 4;
}

/**
 * Second-half 0–0 at or below 22% for both sides, home side concedes after
 * the break in at least 60% of home games, and the away side scores after
 * the break in at least 70% of their last 5. With no league selected, the
 * competition must average at least 2.5 goals. Heavy-half and midweek are
 * columns, not extra cutoffs.
 */
export function rankSecondHalfFixtures(
  finished: FootyFixture[],
  upcoming: FootyFixture[],
  options?: { competitionId?: number | null },
): SecondHalfRow[] {
  const history = teamHistory(finished);
  const leagueSelected = options?.competitionId != null;
  const rows: SecondHalfRow[] = [];
  for (const fx of openFixtures(upcoming)) {
    if (!leagueSelected) {
      const pace = goalsPerGame(finished, fx.competitionId);
      if (pace == null || pace < SECOND_HALF_LEAGUE_GOALS) continue;
    }
    const home = history.get(`${fx.competitionId}::${fx.homeName}`) ?? [];
    const away = history.get(`${fx.competitionId}::${fx.awayName}`) ?? [];
    if (home.length < QUICK_SAMPLE || away.length < QUICK_SAMPLE) continue;
    const homeNil = nilRate(home);
    const awayNil = nilRate(away);
    if (homeNil == null || awayNil == null || homeNil > SECOND_HALF_NIL_MAX || awayNil > SECOND_HALF_NIL_MAX) continue;
    const homeSplits = home.filter((game) => game.isHome).map(secondHalfSplit).filter((split): split is NonNullable<typeof split> => split != null);
    if (homeSplits.length < QUICK_SAMPLE) continue;
    const homeConcededPct = ratePct(homeSplits.filter((split) => split.ga >= 1).length, homeSplits.length);
    if (homeConcededPct < SECOND_HALF_HOME_CONCEDED) continue;
    const awayRecent = away.map(secondHalfSplit).filter((split): split is NonNullable<typeof split> => split != null).slice(0, SECOND_HALF_AWAY_WINDOW);
    if (awayRecent.length < SECOND_HALF_AWAY_WINDOW) continue;
    const awayScoredPct = ratePct(awayRecent.filter((split) => split.gf >= 1).length, SECOND_HALF_AWAY_WINDOW);
    if (awayScoredPct < SECOND_HALF_AWAY_SCORED) continue;
    const homeHeavy = heavyCount(home);
    const awayHeavy = heavyCount(away);
    if (homeHeavy == null || awayHeavy == null) continue;
    rows.push({
      id: fx.id,
      unix: fx.unix,
      match: `${fx.homeName} vs ${fx.awayName}`,
      league: fx.competitionName,
      awayGoalsLast5: away.slice(0, SECOND_HALF_AWAY_WINDOW).reduce((sum, game) => sum + game.gf, 0),
      homeNilPct: homeNil,
      awayNilPct: awayNil,
      homeConcededPct,
      awayScoredPct,
      homeHeavy,
      awayHeavy,
      homeHeavyPass: homeHeavy >= SECOND_HALF_HEAVY_MARK,
      awayHeavyPass: awayHeavy >= SECOND_HALF_HEAVY_MARK,
      midweek: isMidweekKickoff(fx.unix),
    });
  }
  return rows.sort((a, b) => b.awayGoalsLast5 - a.awayGoalsLast5 || a.unix - b.unix).slice(0, SL_LIMIT);
}
