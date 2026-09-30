/**
 * TanStack Query keys for OddAlerts resources.
 * The same key is the same payload. Projections that map one response two ways
 * add a suffix so standings rows are never returned where raw season stats are expected.
 */

export const oddAlertsKeys = {
  live: () => ['oddalerts', 'fixtures/live'] as const,
  upcoming: (params: { days?: number; page?: number; competitions?: string }) =>
    ['oddalerts', 'fixtures/upcoming', params] as const,
  upcomingAll: (params: { days?: number; competitions?: string; maxPages?: number }) =>
    ['oddalerts', 'fixtures/upcoming', 'all', params] as const,
  between: (params: Record<string, string | number | boolean | null | undefined>) =>
    ['oddalerts', 'fixtures/between', params] as const,
  fixture: (matchId: number | string, include: string) =>
    ['oddalerts', 'fixtures', String(matchId), include] as const,
  match: (matchId: number | string) => ['oddalerts', 'match', String(matchId)] as const,
  seasonStats: (seasonId: number | string) => ['oddalerts', 'stats/season', String(seasonId)] as const,
  seasonStatsRaw: (seasonId: number | string) =>
    ['oddalerts', 'stats/season', String(seasonId), 'raw'] as const,
  fixtureTiming: (matchId: number | string) => ['oddalerts', 'stats/fixture', String(matchId)] as const,
  competitions: () => ['oddalerts', 'competitions'] as const,
  scoresFeed: (params: {
    view: string;
    resultsDays: number;
    upcomingDays: number;
    upcomingScope: string;
    kind: string;
    favorites: string;
  }) => ['oddalerts', 'scores-feed', params] as const,
};
