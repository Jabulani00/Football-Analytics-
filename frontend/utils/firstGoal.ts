/** First scorer evidence available from a final score and (when present) HT score. */
export type FirstGoalSide = 'home' | 'away' | 'none' | 'unknown';

function parseScore(value: string | null | undefined): [number, number] | null {
  if (!value) return null;
  const match = /^\s*(\d+)\s*[-–:]\s*(\d+)\s*$/.exec(value);
  if (!match) return null;
  const score: [number, number] = [Number(match[1]), Number(match[2])];
  return score.every(Number.isSafeInteger) ? score : null;
}

/**
 * Return a side only when the available scores determine it uniquely. HT 1-0
 * proves the home side scored first; HT 1-1 does not reveal the ordering.
 */
export function firstGoalSide(
  homeGoals: number | null | undefined,
  awayGoals: number | null | undefined,
  htScore?: string | null,
): FirstGoalSide {
  if (!Number.isSafeInteger(homeGoals) || !Number.isSafeInteger(awayGoals) || homeGoals! < 0 || awayGoals! < 0) return 'unknown';
  const home = homeGoals as number;
  const away = awayGoals as number;
  if (home === 0 && away === 0) return 'none';
  const ht = parseScore(htScore);
  if (ht && ht[0] <= home && ht[1] <= away) {
    if (ht[0] > 0 && ht[1] === 0) return 'home';
    if (ht[1] > 0 && ht[0] === 0) return 'away';
    if (ht[0] === 0 && ht[1] === 0) {
      const secondHome = home - ht[0];
      const secondAway = away - ht[1];
      if (secondHome > 0 && secondAway === 0) return 'home';
      if (secondAway > 0 && secondHome === 0) return 'away';
    }
    return 'unknown';
  }
  if (home > 0 && away === 0) return 'home';
  if (away > 0 && home === 0) return 'away';
  return 'unknown';
}
