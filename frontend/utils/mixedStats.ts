import type { CountedGame } from '@/utils/countedGames';

type HalfGame = CountedGame & { ftFor: number; ftAgainst: number; htFor: number; htAgainst: number };

export type HalfGoalShares = {
  scFirst: number | null;
  scSecond: number | null;
  concFirst: number | null;
  concSecond: number | null;
  avgFirst: number | null;
  avgSecond: number | null;
  matches: number;
};

export type HalfGoalRates = {
  teamAverage: number | null;
  teamConsistency: number | null;
  leagueAverage: number | null;
  leagueConsistency: number | null;
  matches: number;
};

function usableHalfGames(games: CountedGame[]): HalfGame[] {
  return games.filter((game): game is HalfGame =>
    Number.isFinite(game.ftFor) && Number.isFinite(game.ftAgainst) &&
    Number.isFinite(game.htFor) && Number.isFinite(game.htAgainst) &&
    game.ftFor! >= game.htFor! && game.ftAgainst! >= game.htAgainst!,
  );
}

/**
 * Half shares are goal contributions over the same valid-match sample. Each
 * first/second pair is complementary, so it adds to exactly 100% after rounding.
 */
export function halfGoalShares(games: CountedGame[]): HalfGoalShares {
  const valid = usableHalfGames(games);
  const sum = (pick: (game: HalfGame) => number) => valid.reduce((total, game) => total + pick(game), 0);
  const pairedShare = (first: number, second: number): [number | null, number | null] => {
    const total = first + second;
    if (total === 0) return [null, null];
    const firstPct = Math.round((first / total) * 1000) / 10;
    return [firstPct, Math.round((100 - firstPct) * 10) / 10];
  };
  const scored = pairedShare(sum((g) => g.htFor), sum((g) => g.ftFor - g.htFor));
  const conceded = pairedShare(sum((g) => g.htAgainst), sum((g) => g.ftAgainst - g.htAgainst));
  const average = pairedShare(
    sum((g) => g.htFor + g.htAgainst),
    sum((g) => (g.ftFor - g.htFor) + (g.ftAgainst - g.htAgainst)),
  );
  return {
    scFirst: scored[0], scSecond: scored[1],
    concFirst: conceded[0], concSecond: conceded[1],
    avgFirst: average[0], avgSecond: average[1], matches: valid.length,
  };
}

/** Team second-half goals per match and match-level scoring consistency. */
export function secondHalfTeamRates(games: CountedGame[]): Pick<HalfGoalRates, 'teamAverage' | 'teamConsistency' | 'matches'> {
  const valid = usableHalfGames(games);
  if (!valid.length) return { teamAverage: null, teamConsistency: null, matches: 0 };
  const goals = valid.map((game) => game.ftFor - game.htFor);
  return {
    teamAverage: Math.round((goals.reduce((a, b) => a + b, 0) / valid.length) * 10) / 10,
    teamConsistency: Math.round((goals.filter((value) => value > 0).length / valid.length) * 1000) / 10,
    matches: valid.length,
  };
}

/** League second-half totals: one copy per fixture even when both teams appear. */
export function secondHalfLeagueRates(teamGames: CountedGame[]): Pick<HalfGoalRates, 'leagueAverage' | 'leagueConsistency' | 'matches'> {
  const byFixture = new Map<number, HalfGame>();
  for (const game of usableHalfGames(teamGames)) byFixture.set(game.id, game);
  const games = [...byFixture.values()];
  if (!games.length) return { leagueAverage: null, leagueConsistency: null, matches: 0 };
  const totals = games.map((game) => game.ftFor - game.htFor + game.ftAgainst - game.htAgainst);
  return {
    leagueAverage: Math.round((totals.reduce((a, b) => a + b, 0) / games.length) * 10) / 10,
    leagueConsistency: Math.round((totals.filter((value) => value > 0).length / games.length) * 1000) / 10,
    matches: games.length,
  };
}
