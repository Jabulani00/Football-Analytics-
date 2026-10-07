/**
 * Footy Stats rankings from finished scores and half-time scores.
 * Pure: no network, no React. Corner / card / offside figures are read only
 * from fields a season payload actually contains.
 */

export const TOP_LIMIT = 200;
export const MIN_LEAGUE_PROGRESS = 25;
export const MIN_RATE_MATCHES = 5;
export const MIN_CLEAN_SHEET_MATCHES = 7;
export const MIN_CARD_MATCHES = 5;
export const MIN_CORNER_MATCHES = 7;
export const MIN_OFFSIDE_MATCHES = 5;
/** Finished matches sampled when one league is selected. */
export const MATCH_SAMPLE_CAP = 48;
/** Recent finished matches sampled in each league on the all-leagues view. */
export const MATCHES_PER_LEAGUE = 10;
/** Cap on match-stat requests when several leagues are on screen. */
export const MULTI_SAMPLE_CAP = 300;
/** Teams and leagues need this many sampled matches before a row shows. */
export const MATCH_SAMPLE_MIN = 3;
export const CORNER_OVER_LINES = ['8.5', '9.5', '10.5', '11.5', '12.5'] as const;
export const OFFSIDE_OVER_LINES = ['1.5', '2.5', '3.5'] as const;
export const UPCOMING_LIMIT = 80;
export const ALL_LEAGUE_CAP = 30;

export type Scope = 'overall' | 'home' | 'away';
export type CompetitionKind = 'domestic' | 'cup' | 'all';
export type GoalLine = 0.5 | 1.5 | 2.5 | 3.5 | 4.5;
export type GoalSide = 'over' | 'under';
export type BttsSplit = 'win' | 'draw' | 'loss';
export type HalfSide = 'first' | 'second';
export type LeagueSort = 'pct' | 'goals' | 'avg' | 'progress';
export type BothHalvesMode = 'team' | 'btts';
export type CleanSheetDirection = 'most' | 'least';

export const GOAL_LINES: GoalLine[] = [0.5, 1.5, 2.5, 3.5, 4.5];

export type FootyFixture = {
  id: number;
  unix: number;
  finished: boolean;
  competitionId: number;
  competitionName: string;
  country: string;
  isCup: boolean;
  isFriendly: boolean;
  /** Season progress, 0–100. Null when the feed has no figure. */
  progress: number | null;
  homeName: string;
  awayName: string;
  homeGoals: number | null;
  awayGoals: number | null;
  htHome: number | null;
  htAway: number | null;
};

export type FootyQuery = {
  country: string | null;
  competitionId: number | null;
  kind: CompetitionKind;
  scope: Scope;
};

export type TeamRank = {
  team: string;
  league: string;
  country: string;
  played: number;
  hits: number;
  pct: number;
};

export type LeagueRank = {
  league: string;
  country: string;
  competitionId: number;
  played: number;
  progress: number | null;
  hits: number;
  pct: number;
  goals: number;
  avgGoals: number;
};

export type UpcomingRank = {
  id: number;
  unix: number;
  home: string;
  away: string;
  league: string;
  country: string;
  pct: number;
  homePct: number;
  awayPct: number;
};

export type WdwRow = {
  team: string;
  league: string;
  country: string;
  played: number;
  winPct: number;
  drawPct: number;
  lossPct: number;
  homeWinPct: number | null;
  awayWinPct: number | null;
};

export type HalfGoalRow = {
  team: string;
  league: string;
  country: string;
  played: number;
  avg: number;
  over05: number;
  over15: number;
};

export type ScorelineRank = {
  score: string;
  count: number;
  pct: number;
  goals: number;
};

export type RateSummary = {
  pct: number;
  matches: number;
};

type Game = {
  id: number;
  unix: number;
  venue: 'home' | 'away';
  match: string;
  score: string;
  gf: number;
  ga: number;
  htGf: number | null;
  htGa: number | null;
};

type TeamBucket = {
  team: string;
  league: string;
  country: string;
  competitionId: number;
  progress: number | null;
  games: Game[];
};

export type FootyIndex = {
  teams: TeamBucket[];
  finished: FootyFixture[];
  matches: number;
  leagues: number;
};

type Rate = { hits: number; played: number };

const round1 = (n: number) => Math.round(n * 10) / 10;

export function asPercentProgress(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  if (value > 0 && value <= 1) return round1(value * 100);
  return value;
}

function ratePct(hits: number, played: number): number {
  if (played <= 0) return 0;
  return round1((100 * hits) / played);
}

export function listedGamesForTeam(
  index: FootyIndex,
  team: string,
  league: string,
  scope: Scope,
): { id: number; unix: number; match: string; score: string; detail: string; htKnown: boolean }[] {
  const bucket = index.teams.find((item) => item.team === team && item.league === league);
  if (!bucket) return [];
  return scoped(bucket, scope).map((game) => ({
    id: game.id,
    unix: game.unix,
    match: game.match,
    score: game.score,
    detail: game.venue === 'home' ? 'Home' : 'Away',
    htKnown: game.htGf != null && game.htGa != null,
  }));
}

function scoped(team: TeamBucket, scope: Scope): Game[] {
  if (scope === 'overall') return team.games;
  return team.games.filter((g) => g.venue === scope);
}

function halfOf(g: Game, half: HalfSide): { gf: number; ga: number } | null {
  if (g.htGf == null || g.htGa == null) return null;
  if (half === 'first') return { gf: g.htGf, ga: g.htGa };
  const gf = g.gf - g.htGf;
  const ga = g.ga - g.htGa;
  if (gf < 0 || ga < 0) return null;
  return { gf, ga };
}

export function filterFixtures(
  fixtures: FootyFixture[],
  query: Pick<FootyQuery, 'country' | 'competitionId' | 'kind'>,
): FootyFixture[] {
  return fixtures.filter((fx) => {
    if (fx.isFriendly) return false;
    if (query.kind === 'domestic' && fx.isCup) return false;
    if (query.kind === 'cup' && !fx.isCup) return false;
    if (query.country && fx.country !== query.country) return false;
    if (query.competitionId != null && fx.competitionId !== query.competitionId) return false;
    return true;
  });
}

export function buildFootyIndex(
  fixtures: FootyFixture[],
  query: Pick<FootyQuery, 'country' | 'competitionId' | 'kind'>,
): FootyIndex {
  const finished = filterFixtures(fixtures, query).filter(
    (fx) => fx.finished && fx.homeGoals != null && fx.awayGoals != null,
  );
  const map = new Map<string, TeamBucket>();
  const ensure = (competitionId: number, name: string, fx: FootyFixture) => {
    const key = `${competitionId}::${name}`;
    let bucket = map.get(key);
    if (!bucket) {
      bucket = {
        team: name,
        league: fx.competitionName,
        country: fx.country,
        competitionId,
        progress: fx.progress,
        games: [],
      };
      map.set(key, bucket);
    } else if (bucket.progress == null && fx.progress != null) {
      bucket.progress = fx.progress;
    }
    return bucket;
  };

  for (const fx of finished) {
    const home = ensure(fx.competitionId, fx.homeName, fx);
    const away = ensure(fx.competitionId, fx.awayName, fx);
    const score = `${fx.homeGoals}-${fx.awayGoals}`;
    const match = `${fx.homeName} ${score} ${fx.awayName}`;
    home.games.push({
      id: fx.id,
      unix: fx.unix,
      venue: 'home',
      match,
      score,
      gf: fx.homeGoals as number,
      ga: fx.awayGoals as number,
      htGf: fx.htHome,
      htGa: fx.htAway,
    });
    away.games.push({
      id: fx.id,
      unix: fx.unix,
      venue: 'away',
      match,
      score,
      gf: fx.awayGoals as number,
      ga: fx.homeGoals as number,
      htGf: fx.htAway,
      htGa: fx.htHome,
    });
  }

  return {
    teams: [...map.values()],
    finished,
    matches: finished.length,
    leagues: new Set(finished.map((fx) => fx.competitionId)).size,
  };
}

function pushRank(
  rows: TeamRank[],
  team: TeamBucket,
  hits: number,
  played: number,
): void {
  rows.push({
    team: team.team,
    league: team.league,
    country: team.country,
    played,
    hits,
    pct: ratePct(hits, played),
  });
}

function byPctThenHits(a: TeamRank, b: TeamRank): number {
  if (b.pct !== a.pct) return b.pct - a.pct;
  if (b.hits !== a.hits) return b.hits - a.hits;
  return a.team.localeCompare(b.team);
}

function takeTop(rows: TeamRank[], limit = TOP_LIMIT): TeamRank[] {
  return rows.sort(byPctThenHits).slice(0, limit);
}

function seasonOpen(progress: number | null, dropComplete: boolean): boolean {
  if (!dropComplete) return true;
  return progress == null || progress < 100;
}

function leagueUnderway(progress: number | null, dropComplete: boolean): boolean {
  if (progress == null || progress < MIN_LEAGUE_PROGRESS) return false;
  if (dropComplete && progress >= 100) return false;
  return true;
}

export function rankBttsTeams(index: FootyIndex, scope: Scope): TeamRank[] {
  const rows: TeamRank[] = [];
  for (const team of index.teams) {
    const games = scoped(team, scope);
    if (games.length < MIN_RATE_MATCHES) continue;
    const hits = games.filter((g) => g.gf > 0 && g.ga > 0).length;
    pushRank(rows, team, hits, games.length);
  }
  return rows.sort((a, b) => b.hits - a.hits || b.pct - a.pct || a.team.localeCompare(b.team)).slice(0, TOP_LIMIT);
}

export function rankBttsSplit(index: FootyIndex, scope: Scope, split: BttsSplit): TeamRank[] {
  const rows: TeamRank[] = [];
  for (const team of index.teams) {
    const games = scoped(team, scope);
    if (games.length < MIN_RATE_MATCHES) continue;
    const hits = games.filter((g) => {
      if (!(g.gf > 0 && g.ga > 0)) return false;
      if (split === 'win') return g.gf > g.ga;
      if (split === 'draw') return g.gf === g.ga;
      return g.gf < g.ga;
    }).length;
    pushRank(rows, team, hits, games.length);
  }
  return takeTop(rows);
}

export function rankHalfBtts(index: FootyIndex, scope: Scope, half: HalfSide): TeamRank[] {
  const rows: TeamRank[] = [];
  for (const team of index.teams) {
    const timed = scoped(team, scope)
      .map((g) => halfOf(g, half))
      .filter((g): g is { gf: number; ga: number } => g != null);
    if (timed.length < MIN_RATE_MATCHES) continue;
    const hits = timed.filter((g) => g.gf > 0 && g.ga > 0).length;
    pushRank(rows, team, hits, timed.length);
  }
  return takeTop(rows);
}

function lineHit(total: number, line: GoalLine, side: GoalSide): boolean {
  return side === 'over' ? total > line : total < line;
}

export function rankGoalLineTeams(
  index: FootyIndex,
  scope: Scope,
  line: GoalLine,
  side: GoalSide,
): TeamRank[] {
  const rows: TeamRank[] = [];
  for (const team of index.teams) {
    if (!seasonOpen(team.progress, true)) continue;
    const games = scoped(team, scope);
    if (games.length < MIN_RATE_MATCHES) continue;
    const hits = games.filter((g) => lineHit(g.gf + g.ga, line, side)).length;
    pushRank(rows, team, hits, games.length);
  }
  return takeTop(rows);
}

export function goalLineSummary(index: FootyIndex, line: GoalLine, side: GoalSide): RateSummary {
  const open = index.finished.filter((fx) => seasonOpen(fx.progress, true));
  if (open.length === 0) return { pct: 0, matches: 0 };
  const hits = open.filter((fx) =>
    lineHit((fx.homeGoals as number) + (fx.awayGoals as number), line, side),
  ).length;
  return { pct: ratePct(hits, open.length), matches: open.length };
}

export function bttsSummary(index: FootyIndex): RateSummary {
  if (index.matches === 0) return { pct: 0, matches: 0 };
  const hits = index.finished.filter((fx) => (fx.homeGoals as number) > 0 && (fx.awayGoals as number) > 0).length;
  return { pct: ratePct(hits, index.matches), matches: index.matches };
}

type LeagueMetric =
  | { kind: 'btts' }
  | { kind: 'half'; half: HalfSide }
  | { kind: 'line'; line: GoalLine; side: GoalSide };

function fixtureMetric(fx: FootyFixture, metric: LeagueMetric): boolean | null {
  if (fx.homeGoals == null || fx.awayGoals == null) return null;
  if (metric.kind === 'btts') return fx.homeGoals > 0 && fx.awayGoals > 0;
  if (metric.kind === 'line') return lineHit(fx.homeGoals + fx.awayGoals, metric.line, metric.side);
  if (fx.htHome == null || fx.htAway == null) return null;
  if (metric.half === 'first') return fx.htHome > 0 && fx.htAway > 0;
  const h2 = fx.homeGoals - fx.htHome;
  const a2 = fx.awayGoals - fx.htAway;
  if (h2 < 0 || a2 < 0) return null;
  return h2 > 0 && a2 > 0;
}

export function rankLeagues(
  index: FootyIndex,
  metric: LeagueMetric,
  sort: LeagueSort,
  dropComplete = false,
): LeagueRank[] {
  const groups = new Map<number, LeagueRank & { known: number }>();
  for (const fx of index.finished) {
    if (!leagueUnderway(fx.progress, dropComplete)) continue;
    const hit = fixtureMetric(fx, metric);
    let row = groups.get(fx.competitionId);
    if (!row) {
      row = {
        league: fx.competitionName,
        country: fx.country,
        competitionId: fx.competitionId,
        played: 0,
        progress: fx.progress,
        hits: 0,
        pct: 0,
        goals: 0,
        avgGoals: 0,
        known: 0,
      };
      groups.set(fx.competitionId, row);
    }
    row.goals += (fx.homeGoals as number) + (fx.awayGoals as number);
    row.played += 1;
    if (hit == null) continue;
    row.known += 1;
    if (hit) row.hits += 1;
  }

  const rows = [...groups.values()].map((row) => ({
    league: row.league,
    country: row.country,
    competitionId: row.competitionId,
    played: metric.kind === 'half' ? row.known : row.played,
    progress: row.progress,
    hits: row.hits,
    pct: ratePct(row.hits, metric.kind === 'half' ? row.known : row.played),
    goals: row.goals,
    avgGoals: row.played > 0 ? round1(row.goals / row.played) : 0,
  }));

  rows.sort((a, b) => {
    if (sort === 'goals' && b.goals !== a.goals) return b.goals - a.goals;
    if (sort === 'avg' && b.avgGoals !== a.avgGoals) return b.avgGoals - a.avgGoals;
    if (sort === 'progress' && (b.progress ?? -1) !== (a.progress ?? -1)) {
      return (b.progress ?? -1) - (a.progress ?? -1);
    }
    if (b.pct !== a.pct) return b.pct - a.pct;
    return a.league.localeCompare(b.league);
  });
  return rows.filter((row) => row.played > 0).slice(0, TOP_LIMIT);
}

function teamRate(team: TeamBucket, scope: Scope, pick: (games: Game[]) => Rate | null): number | null {
  const rated = pick(scoped(team, scope));
  if (!rated || rated.played < MIN_RATE_MATCHES) return null;
  return ratePct(rated.hits, rated.played);
}

function lookupTeam(index: FootyIndex, competitionId: number, name: string): TeamBucket | undefined {
  return index.teams.find((t) => t.competitionId === competitionId && t.team === name);
}

function rankUpcoming(
  index: FootyIndex,
  upcoming: FootyFixture[],
  query: FootyQuery,
  pick: (games: Game[]) => Rate | null,
  dropComplete: boolean,
): UpcomingRank[] {
  const rows: UpcomingRank[] = [];
  for (const fx of filterFixtures(upcoming, query)) {
    if (fx.finished) continue;
    if (!leagueUnderway(fx.progress, dropComplete)) continue;
    const home = lookupTeam(index, fx.competitionId, fx.homeName);
    const away = lookupTeam(index, fx.competitionId, fx.awayName);
    if (!home || !away) continue;
    const homePct = teamRate(home, query.scope, pick);
    const awayPct = teamRate(away, query.scope, pick);
    if (homePct == null || awayPct == null) continue;
    rows.push({
      id: fx.id,
      unix: fx.unix,
      home: fx.homeName,
      away: fx.awayName,
      league: fx.competitionName,
      country: fx.country,
      homePct,
      awayPct,
      pct: round1((homePct + awayPct) / 2),
    });
  }
  return rows.sort((a, b) => b.pct - a.pct || a.unix - b.unix).slice(0, UPCOMING_LIMIT);
}

function bttsRate(games: Game[]): Rate {
  return { hits: games.filter((g) => g.gf > 0 && g.ga > 0).length, played: games.length };
}

function lineRate(line: GoalLine, side: GoalSide) {
  return (games: Game[]): Rate => ({
    hits: games.filter((g) => lineHit(g.gf + g.ga, line, side)).length,
    played: games.length,
  });
}

export function upcomingBtts(index: FootyIndex, upcoming: FootyFixture[], query: FootyQuery): UpcomingRank[] {
  return rankUpcoming(index, upcoming, query, bttsRate, false);
}

export function upcomingGoalLine(
  index: FootyIndex,
  upcoming: FootyFixture[],
  query: FootyQuery,
  line: GoalLine,
  side: GoalSide,
): UpcomingRank[] {
  return rankUpcoming(index, upcoming, query, lineRate(line, side), true);
}

export function rankWdw(index: FootyIndex, scope: Scope): WdwRow[] {
  const rows: WdwRow[] = [];
  for (const team of index.teams) {
    const games = scoped(team, scope);
    if (games.length < MIN_RATE_MATCHES) continue;
    const home = team.games.filter((g) => g.venue === 'home');
    const away = team.games.filter((g) => g.venue === 'away');
    const wins = games.filter((g) => g.gf > g.ga).length;
    const draws = games.filter((g) => g.gf === g.ga).length;
    const losses = games.filter((g) => g.gf < g.ga).length;
    const homeWins = home.filter((g) => g.gf > g.ga).length;
    const awayWins = away.filter((g) => g.gf > g.ga).length;
    rows.push({
      team: team.team,
      league: team.league,
      country: team.country,
      played: games.length,
      winPct: ratePct(wins, games.length),
      drawPct: ratePct(draws, games.length),
      lossPct: ratePct(losses, games.length),
      homeWinPct: home.length > 0 ? ratePct(homeWins, home.length) : null,
      awayWinPct: away.length > 0 ? ratePct(awayWins, away.length) : null,
    });
  }
  return rows
    .sort((a, b) => b.winPct - a.winPct || a.team.localeCompare(b.team))
    .slice(0, TOP_LIMIT);
}

export function rankHalfGoals(index: FootyIndex, scope: Scope, half: HalfSide): HalfGoalRow[] {
  const rows: HalfGoalRow[] = [];
  for (const team of index.teams) {
    const timed = scoped(team, scope)
      .map((g) => halfOf(g, half))
      .filter((g): g is { gf: number; ga: number } => g != null);
    if (timed.length < MIN_RATE_MATCHES) continue;
    const goals = timed.reduce((sum, g) => sum + g.gf, 0);
    const over05 = timed.filter((g) => g.gf >= 1).length;
    const over15 = timed.filter((g) => g.gf >= 2).length;
    rows.push({
      team: team.team,
      league: team.league,
      country: team.country,
      played: timed.length,
      avg: round1(goals / timed.length),
      over05: ratePct(over05, timed.length),
      over15: ratePct(over15, timed.length),
    });
  }
  return rows.sort((a, b) => b.avg - a.avg || b.over05 - a.over05 || a.team.localeCompare(b.team)).slice(0, TOP_LIMIT);
}

export function rankBothHalves(index: FootyIndex, scope: Scope, mode: BothHalvesMode): TeamRank[] {
  const rows: TeamRank[] = [];
  for (const team of index.teams) {
    const timed = scoped(team, scope).filter((g) => halfOf(g, 'first') && halfOf(g, 'second'));
    if (timed.length < MIN_RATE_MATCHES) continue;
    const hits = timed.filter((g) => {
      const first = halfOf(g, 'first');
      const second = halfOf(g, 'second');
      if (!first || !second) return false;
      if (mode === 'team') return first.gf > 0 && second.gf > 0;
      return first.gf > 0 && first.ga > 0 && second.gf > 0 && second.ga > 0;
    }).length;
    pushRank(rows, team, hits, timed.length);
  }
  return takeTop(rows);
}

export function rankCleanSheets(index: FootyIndex, scope: Scope, direction: CleanSheetDirection): TeamRank[] {
  const rows: TeamRank[] = [];
  for (const team of index.teams) {
    const games = scoped(team, scope);
    if (games.length < MIN_CLEAN_SHEET_MATCHES) continue;
    const hits = games.filter((g) => g.ga === 0).length;
    pushRank(rows, team, hits, games.length);
  }
  rows.sort((a, b) => {
    const count = direction === 'most' ? b.hits - a.hits : a.hits - b.hits;
    if (count !== 0) return count;
    const pct = direction === 'most' ? b.pct - a.pct : a.pct - b.pct;
    if (pct !== 0) return pct;
    return a.team.localeCompare(b.team);
  });
  return rows.slice(0, TOP_LIMIT);
}

export function rankScorelines(index: FootyIndex): ScorelineRank[] {
  const counts = new Map<string, { count: number; goals: number }>();
  for (const fx of index.finished) {
    const score = `${fx.homeGoals}-${fx.awayGoals}`;
    const goals = (fx.homeGoals as number) + (fx.awayGoals as number);
    const row = counts.get(score);
    if (row) row.count += 1;
    else counts.set(score, { count: 1, goals });
  }
  const total = index.matches;
  return [...counts.entries()]
    .map(([score, row]) => ({
      score,
      count: row.count,
      pct: ratePct(row.count, total),
      goals: row.goals,
    }))
    .sort((a, b) => b.count - a.count || a.goals - b.goals || a.score.localeCompare(b.score));
}

export function rankUpcomingValues(
  upcoming: FootyFixture[],
  query: FootyQuery,
  valueFor: (competitionId: number, team: string) => number | null,
  combine: 'avg' | 'sum',
): UpcomingRank[] {
  const rows: UpcomingRank[] = [];
  for (const fx of filterFixtures(upcoming, query)) {
    if (fx.finished) continue;
    if (!leagueUnderway(fx.progress, false)) continue;
    const homePct = valueFor(fx.competitionId, fx.homeName);
    const awayPct = valueFor(fx.competitionId, fx.awayName);
    if (homePct == null || awayPct == null) continue;
    rows.push({
      id: fx.id,
      unix: fx.unix,
      home: fx.homeName,
      away: fx.awayName,
      league: fx.competitionName,
      country: fx.country,
      homePct,
      awayPct,
      pct: round1(combine === 'sum' ? homePct + awayPct : (homePct + awayPct) / 2),
    });
  }
  return rows.sort((a, b) => b.pct - a.pct || a.unix - b.unix).slice(0, UPCOMING_LIMIT);
}

// ---- Season discipline (corners, cards, offsides) ---------------------------

export type DisciplineTeam = {
  name: string;
  league: string;
  country: string;
  competitionId: number | null;
  played: number;
  cornersFor: number | null;
  cornersAgainst: number | null;
  matchCorners: number | null;
  corners1h: number | null;
  corners2h: number | null;
  yellows: number | null;
  reds: number | null;
  offsides: number | null;
  cornerOver: Record<string, number>;
  offsideOver: Record<string, number>;
  /** Matches behind the card totals, when that sample differs from `played`. */
  cardPlayed?: number;
  /** Matches behind the offside totals, when that sample differs from `played`. */
  offsidePlayed?: number;
};

export type DisciplineLeague = {
  competitionId: number;
  league: string;
  country: string;
  cornerMatches: number;
  matchCorners: number;
  cornerOver: Record<string, number>;
  cardMatches: number;
  yellows: number;
  reds: number;
  offsideMatches: number;
  offsides: number;
  offsideOver: Record<string, number>;
};

export type DisciplineFeed = {
  teams: DisciplineTeam[];
  leagues: DisciplineLeague[];
  hasCorners: boolean;
  hasCornerHalves: boolean;
  hasCornerOvers: boolean;
  hasCards: boolean;
  hasOffsides: boolean;
  hasOffsideOvers: boolean;
  /** Set when totals were counted from match `include=stats`, not the season row. */
  sampledMatches: number | null;
};

const EMPTY_FEED: DisciplineFeed = {
  teams: [],
  leagues: [],
  hasCorners: false,
  hasCornerHalves: false,
  hasCornerOvers: false,
  hasCards: false,
  hasOffsides: false,
  hasOffsideOvers: false,
  sampledMatches: null,
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  return null;
}

function readCount(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const rec = asRecord(value);
  if (!rec) return null;
  if (typeof rec.total === 'number' && Number.isFinite(rec.total)) return rec.total;
  return null;
}

function readPlayed(row: Record<string, unknown>): number {
  const direct = readCount(row.played);
  if (direct != null && direct > 0) return direct;
  return (readCount(row.won) ?? 0) + (readCount(row.drawn) ?? 0) + (readCount(row.lost) ?? 0);
}

function pickField(row: Record<string, unknown>, keys: string[]): unknown {
  const map = new Map(Object.keys(row).map((key) => [key.toLowerCase(), row[key]]));
  for (const key of keys) {
    if (map.has(key)) return map.get(key);
  }
  return undefined;
}

function readPct(value: unknown, played: number): number | null {
  const rec = asRecord(value);
  if (rec) {
    const raw = rec.total_percentage ?? rec.percentage ?? rec.pct;
    if (typeof raw === 'number' && Number.isFinite(raw)) return round1(raw > 0 && raw <= 1 ? raw * 100 : raw);
    const total = readCount(rec);
    if (total != null && played > 0 && total <= played) return ratePct(total, played);
    return null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value >= 0 && value <= 1) return round1(value * 100);
    if (value <= 100) return round1(value);
  }
  return null;
}

function lineFromKey(key: string): string | null {
  const dotted = key.match(/over[_-]?(\d+)[._](\d+)/);
  if (dotted) return `${dotted[1]}.${dotted[2]}`;
  const compact = key.match(/over[_-]?(\d{2})(?!\d)/);
  if (compact) return `${compact[1][0]}.${compact[1][1]}`;
  return null;
}

function readLinePcts(row: Record<string, unknown>, needle: string, played: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(row)) {
    const lower = key.toLowerCase();
    if (!lower.includes(needle) || !lower.includes('over')) continue;
    const line = lineFromKey(lower);
    if (!line) continue;
    const pct = readPct(value, played);
    if (pct != null) out[line] = pct;
  }
  return out;
}

export function perGame(total: number | null, played: number): number | null {
  if (total == null || played <= 0) return null;
  return round1(total / played);
}

export function extractDiscipline(rows: unknown[]): DisciplineFeed {
  if (!Array.isArray(rows) || rows.length === 0) return EMPTY_FEED;
  const teams: DisciplineTeam[] = [];
  for (const raw of rows) {
    const row = asRecord(raw);
    if (!row) continue;
    const nameValue = row.name ?? row.team_name;
    if (typeof nameValue !== 'string' || !nameValue.trim()) continue;
    const played = readPlayed(row);
    if (played <= 0) continue;
    const cornersFor = readCount(pickField(row, ['corners_for', 'corner_kicks_for', 'corners_won']));
    const cornersAgainst = readCount(pickField(row, ['corners_against', 'corners_conceded']));
    const explicitMatch = readCount(pickField(row, ['corners_total', 'total_corners', 'match_corners']));
    const matchCorners =
      explicitMatch ??
      (cornersFor != null && cornersAgainst != null ? cornersFor + cornersAgainst : null);
    teams.push({
      name: nameValue,
      league: '',
      country: '',
      competitionId: null,
      played,
      cornersFor,
      cornersAgainst,
      matchCorners,
      corners1h: readCount(pickField(row, ['corners_1h_total', 'corners_1h', 'corners_first_half'])),
      corners2h: readCount(pickField(row, ['corners_2h_total', 'corners_2h', 'corners_second_half'])),
      yellows: readCount(pickField(row, ['yellow_cards', 'yellows', 'yellow_cards_for', 'yellow_cards_total'])),
      reds: readCount(pickField(row, ['red_cards', 'reds', 'red_cards_for', 'red_cards_total'])),
      offsides: readCount(pickField(row, ['offsides', 'offsides_for', 'offside', 'team_offsides'])),
      cornerOver: readLinePcts(row, 'corner', played),
      offsideOver: readLinePcts(row, 'offside', played),
    });
  }
  return {
    teams,
    leagues: [],
    hasCorners: teams.some((t) => t.cornersFor != null || t.cornersAgainst != null || t.matchCorners != null),
    hasCornerHalves: teams.some((t) => t.corners1h != null && t.corners2h != null),
    hasCornerOvers: teams.some((t) => Object.keys(t.cornerOver).length > 0),
    hasCards: teams.some((t) => t.yellows != null || t.reds != null),
    hasOffsides: teams.some((t) => t.offsides != null),
    hasOffsideOvers: teams.some((t) => Object.keys(t.offsideOver).length > 0),
    sampledMatches: null,
  };
}

export type BoxScore = {
  homeName: string;
  awayName: string;
  competitionId: number;
  competitionName: string;
  country: string;
  homeCorners: number | null;
  awayCorners: number | null;
  homeYellows: number | null;
  awayYellows: number | null;
  homeReds: number | null;
  awayReds: number | null;
  homeOffsides: number | null;
  awayOffsides: number | null;
};

function statNum(stats: Record<string, number | null | undefined>, key: string): number | null {
  const value = stats[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Read corners, bookings, and offsides from a fixture `stats` object. */
export function sampleMatchStats(fixtures: FootyFixture[], competitionId: number | null): FootyFixture[] {
  const finished = fixtures.filter((fx) => fx.finished).sort((a, b) => b.unix - a.unix);
  if (competitionId != null) {
    return finished.filter((fx) => fx.competitionId === competitionId).slice(0, MATCH_SAMPLE_CAP);
  }
  const groups = new Map<number, FootyFixture[]>();
  for (const fx of finished) {
    const list = groups.get(fx.competitionId);
    if (!list) groups.set(fx.competitionId, [fx]);
    else if (list.length < MATCHES_PER_LEAGUE) list.push(fx);
  }
  return [...groups.values()].flat().slice(0, MULTI_SAMPLE_CAP);
}

export function readBoxScore(
  homeName: string,
  awayName: string,
  stats: Record<string, number | null | undefined> | null | undefined,
  meta?: { competitionId: number; competitionName: string; country: string },
): BoxScore | null {
  if (!stats || !homeName || !awayName) return null;
  const row: BoxScore = {
    homeName,
    awayName,
    competitionId: meta?.competitionId ?? 0,
    competitionName: meta?.competitionName ?? '',
    country: meta?.country ?? '',
    homeCorners: statNum(stats, 'home_corners'),
    awayCorners: statNum(stats, 'away_corners'),
    homeYellows: statNum(stats, 'home_yellow_cards'),
    awayYellows: statNum(stats, 'away_yellow_cards'),
    homeReds: statNum(stats, 'home_red_cards'),
    awayReds: statNum(stats, 'away_red_cards'),
    homeOffsides: statNum(stats, 'home_offsides'),
    awayOffsides: statNum(stats, 'away_offsides'),
  };
  const hasFigure =
    row.homeCorners != null ||
    row.awayCorners != null ||
    row.homeYellows != null ||
    row.awayYellows != null ||
    row.homeReds != null ||
    row.awayReds != null ||
    row.homeOffsides != null ||
    row.awayOffsides != null;
  return hasFigure ? row : null;
}

type SideAcc = {
  name: string;
  league: string;
  country: string;
  competitionId: number;
  cornerMatches: number;
  cornersFor: number;
  cornersAgainst: number;
  cornerHits: Record<string, number>;
  cardMatches: number;
  yellows: number;
  reds: number;
  offsideMatches: number;
  offsides: number;
  offsideHits: Record<string, number>;
};

function sideAcc(map: Map<string, SideAcc>, name: string, rowMeta: BoxScore): SideAcc {
  const key = `${rowMeta.competitionId}::${name}`;
  let row = map.get(key);
  if (!row) {
    row = {
      name,
      league: rowMeta.competitionName,
      country: rowMeta.country,
      competitionId: rowMeta.competitionId,
      cornerMatches: 0,
      cornersFor: 0,
      cornersAgainst: 0,
      cornerHits: {},
      cardMatches: 0,
      yellows: 0,
      reds: 0,
      offsideMatches: 0,
      offsides: 0,
      offsideHits: {},
    };
    map.set(key, row);
  }
  return row;
}

function addOver(hits: Record<string, number>, lines: readonly string[], total: number) {
  for (const line of lines) {
    if (total > Number(line)) hits[line] = (hits[line] ?? 0) + 1;
  }
}

/**
 * Season totals from finished-match stats — the same home/away pairs the
 * match summary lists under corners, offsides, and yellow/red cards.
 * Over percentages are the share of those matches that cleared the line.
 */
type LeagueAcc = {
  competitionId: number;
  league: string;
  country: string;
  cornerMatches: number;
  matchCorners: number;
  cornerHits: Record<string, number>;
  cardMatches: number;
  yellows: number;
  reds: number;
  offsideMatches: number;
  offsides: number;
  offsideHits: Record<string, number>;
};

function leagueAcc(map: Map<number, LeagueAcc>, row: BoxScore): LeagueAcc {
  let acc = map.get(row.competitionId);
  if (!acc) {
    acc = {
      competitionId: row.competitionId,
      league: row.competitionName,
      country: row.country,
      cornerMatches: 0,
      matchCorners: 0,
      cornerHits: {},
      cardMatches: 0,
      yellows: 0,
      reds: 0,
      offsideMatches: 0,
      offsides: 0,
      offsideHits: {},
    };
    map.set(row.competitionId, acc);
  }
  return acc;
}

export function aggregateBoxScores(rows: BoxScore[]): DisciplineFeed {
  const map = new Map<string, SideAcc>();
  const leagues = new Map<number, LeagueAcc>();
  let sampled = 0;
  for (const row of rows) {
    sampled += 1;
    if (row.homeCorners != null && row.awayCorners != null) {
      const home = sideAcc(map, row.homeName, row);
      const away = sideAcc(map, row.awayName, row);
      const total = row.homeCorners + row.awayCorners;
      home.cornerMatches += 1;
      away.cornerMatches += 1;
      home.cornersFor += row.homeCorners;
      home.cornersAgainst += row.awayCorners;
      away.cornersFor += row.awayCorners;
      away.cornersAgainst += row.homeCorners;
      addOver(home.cornerHits, CORNER_OVER_LINES, total);
      addOver(away.cornerHits, CORNER_OVER_LINES, total);
      if (row.competitionName) {
        const league = leagueAcc(leagues, row);
        league.cornerMatches += 1;
        league.matchCorners += total;
        addOver(league.cornerHits, CORNER_OVER_LINES, total);
      }
    }
    if (row.homeYellows != null || row.awayYellows != null || row.homeReds != null || row.awayReds != null) {
      const home = sideAcc(map, row.homeName, row);
      const away = sideAcc(map, row.awayName, row);
      home.cardMatches += 1;
      away.cardMatches += 1;
      home.yellows += row.homeYellows ?? 0;
      home.reds += row.homeReds ?? 0;
      away.yellows += row.awayYellows ?? 0;
      away.reds += row.awayReds ?? 0;
      if (row.competitionName) {
        const league = leagueAcc(leagues, row);
        league.cardMatches += 1;
        league.yellows += (row.homeYellows ?? 0) + (row.awayYellows ?? 0);
        league.reds += (row.homeReds ?? 0) + (row.awayReds ?? 0);
      }
    }
    if (row.homeOffsides != null && row.awayOffsides != null) {
      const home = sideAcc(map, row.homeName, row);
      const away = sideAcc(map, row.awayName, row);
      const total = row.homeOffsides + row.awayOffsides;
      home.offsideMatches += 1;
      away.offsideMatches += 1;
      home.offsides += row.homeOffsides;
      away.offsides += row.awayOffsides;
      addOver(home.offsideHits, OFFSIDE_OVER_LINES, total);
      addOver(away.offsideHits, OFFSIDE_OVER_LINES, total);
      if (row.competitionName) {
        const league = leagueAcc(leagues, row);
        league.offsideMatches += 1;
        league.offsides += total;
        addOver(league.offsideHits, OFFSIDE_OVER_LINES, total);
      }
    }
  }

  const teams: DisciplineTeam[] = [...map.values()].map((row) => {
    const cornerOver: Record<string, number> = {};
    if (row.cornerMatches > 0) {
      for (const line of CORNER_OVER_LINES) cornerOver[line] = ratePct(row.cornerHits[line] ?? 0, row.cornerMatches);
    }
    const offsideOver: Record<string, number> = {};
    if (row.offsideMatches > 0) {
      for (const line of OFFSIDE_OVER_LINES) {
        offsideOver[line] = ratePct(row.offsideHits[line] ?? 0, row.offsideMatches);
      }
    }
    return {
      name: row.name,
      league: row.league,
      country: row.country,
      competitionId: row.competitionId || null,
      played: row.cornerMatches || row.cardMatches || row.offsideMatches,
      cornersFor: row.cornerMatches > 0 ? row.cornersFor : null,
      cornersAgainst: row.cornerMatches > 0 ? row.cornersAgainst : null,
      matchCorners: row.cornerMatches > 0 ? row.cornersFor + row.cornersAgainst : null,
      corners1h: null,
      corners2h: null,
      yellows: row.cardMatches > 0 ? row.yellows : null,
      reds: row.cardMatches > 0 ? row.reds : null,
      offsides: row.offsideMatches > 0 ? row.offsides : null,
      cornerOver,
      offsideOver,
      cardPlayed: row.cardMatches,
      offsidePlayed: row.offsideMatches,
    };
  });

  const leagueRows: DisciplineLeague[] = [...leagues.values()].map((row) => {
    const cornerOver: Record<string, number> = {};
    if (row.cornerMatches > 0) {
      for (const line of CORNER_OVER_LINES) cornerOver[line] = ratePct(row.cornerHits[line] ?? 0, row.cornerMatches);
    }
    const offsideOver: Record<string, number> = {};
    if (row.offsideMatches > 0) {
      for (const line of OFFSIDE_OVER_LINES) {
        offsideOver[line] = ratePct(row.offsideHits[line] ?? 0, row.offsideMatches);
      }
    }
    return {
      competitionId: row.competitionId,
      league: row.league,
      country: row.country,
      cornerMatches: row.cornerMatches,
      matchCorners: row.matchCorners,
      cornerOver,
      cardMatches: row.cardMatches,
      yellows: row.yellows,
      reds: row.reds,
      offsideMatches: row.offsideMatches,
      offsides: row.offsides,
      offsideOver,
    };
  });

  return {
    teams,
    leagues: leagueRows,
    hasCorners: teams.some((team) => team.cornersFor != null),
    hasCornerHalves: false,
    hasCornerOvers: teams.some((team) => Object.keys(team.cornerOver).length > 0),
    hasCards: teams.some((team) => team.yellows != null || team.reds != null),
    hasOffsides: teams.some((team) => team.offsides != null),
    hasOffsideOvers: teams.some((team) => Object.keys(team.offsideOver).length > 0),
    sampledMatches: sampled,
  };
}
