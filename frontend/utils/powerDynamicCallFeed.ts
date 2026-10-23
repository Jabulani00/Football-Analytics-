import { normaliseStatus, type RawFixture } from '@/services/oddAlerts';
import type { SeasonMatch } from '@/utils/bhozomaEngine';
import type { ImbangiScheduleMatch } from '@/utils/imbangiEngine';

function parseHt(ht: string | null | undefined): { home: number; away: number } | null {
  if (!ht) return null;
  const matched = ht.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (!matched) return null;
  return { home: Number(matched[1]), away: Number(matched[2]) };
}

/** Finished matches plus the season schedule, for one season inside a fixtures/between payload. */
export function seasonFeedFromFixtures(
  fixtures: RawFixture[],
  seasonId: number,
): { matches: SeasonMatch[]; schedule: ImbangiScheduleMatch[] } {
  const matches: SeasonMatch[] = [];
  const schedule: ImbangiScheduleMatch[] = [];
  for (const fixture of fixtures) {
    if (fixture.home_id == null || fixture.away_id == null) continue;
    if (fixture.season_id != null && fixture.season_id !== seasonId) continue;
    const finished = normaliseStatus(fixture.status) === 'FT';
    schedule.push({
      homeId: fixture.home_id,
      awayId: fixture.away_id,
      unix: fixture.unix,
      finished,
      homeGoals: fixture.home_goals,
      awayGoals: fixture.away_goals,
    });
    if (!finished || fixture.home_goals == null || fixture.away_goals == null) continue;
    const ht = parseHt(fixture.ht_score);
    const usable = ht != null && ht.home <= fixture.home_goals && ht.away <= fixture.away_goals;
    matches.push({
      homeId: fixture.home_id,
      awayId: fixture.away_id,
      homeGoals: fixture.home_goals,
      awayGoals: fixture.away_goals,
      homeGoalsHt: usable ? ht.home : null,
      awayGoalsHt: usable ? ht.away : null,
      unix: fixture.unix,
    });
  }
  return { matches, schedule };
}
