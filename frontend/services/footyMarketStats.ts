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
  venue: 'home' | 'away';
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
    home.games.push({
      venue: 'home',
      gf: fx.homeGoals as number,
      ga: fx.awayGoals as number,
      htGf: fx.htHome,
      htGa: fx.htAway,
    });
    away.games.push({
      venue: 'away',
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
};

export type DisciplineFeed = {
  teams: DisciplineTeam[];
  hasCorners: boolean;
  hasCornerHalves: boolean;
  hasCornerOvers: boolean;
  hasCards: boolean;
  hasOffsides: boolean;
  hasOffsideOvers: boolean;
};

const EMPTY_FEED: DisciplineFeed = {
  teams: [],
  hasCorners: false,
  hasCornerHalves: false,
  hasCornerOvers: false,
  hasCards: false,
  hasOffsides: false,
  hasOffsideOvers: false,
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
    hasCorners: teams.some((t) => t.cornersFor != null || t.cornersAgainst != null || t.matchCorners != null),
    hasCornerHalves: teams.some((t) => t.corners1h != null && t.corners2h != null),
    hasCornerOvers: teams.some((t) => Object.keys(t.cornerOver).length > 0),
    hasCards: teams.some((t) => t.yellows != null || t.reds != null),
    hasOffsides: teams.some((t) => t.offsides != null),
    hasOffsideOvers: teams.some((t) => Object.keys(t.offsideOver).length > 0),
  };
}
