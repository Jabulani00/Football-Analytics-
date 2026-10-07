import type { TeamStatRow } from '@/types/data';

/** A finished or upcoming game that went into a stat row. */
export type CountedGame = {
  id: number;
  unix: number;
  match: string;
  score: string;
  detail: string;
  htKnown: boolean;
};

const GAMES = Symbol.for('scoreline.countedGames');

export function setRowGames(row: TeamStatRow, games: CountedGame[]): void {
  (row as object as Record<symbol, CountedGame[]>)[GAMES] = games;
}

export function rowGames(row: TeamStatRow | null | undefined): CountedGame[] {
  if (!row) return [];
  return (row as object as Record<symbol, CountedGame[]>)[GAMES] ?? [];
}
