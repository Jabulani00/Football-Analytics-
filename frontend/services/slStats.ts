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

function teamBuckets(fixtures: FootyFixture[]): Map<string, TeamBucket> {
  const map = new Map<string, TeamBucket>();
  const finished = fixtures
    .filter((fx) => fx.finished && fx.homeGoals != null && fx.awayGoals != null && !fx.isFriendly && !fx.isCup)
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
    status: 'FT',
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

function betFromLeague(fx: FootyFixture, league: FootyFixture[]): BestBet | null {
  if (league.length === 0) return null;
  const homeGames = league.filter((game) => game.homeName === fx.homeName);
  const awayGames = league.filter((game) => game.awayName === fx.awayName);
  const homeAvg = league.reduce((sum, game) => sum + (game.homeGoals ?? 0), 0) / league.length;
  const awayAvg = league.reduce((sum, game) => sum + (game.awayGoals ?? 0), 0) / league.length;
  const prediction = predictFromStats(sideStats(homeGames, true), sideStats(awayGames, false), {
    homeAvg,
    awayAvg,
    measured: true,
  });
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
