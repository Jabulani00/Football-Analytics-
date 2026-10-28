/**
 * Score fixtures from a league copy that is already in memory.
 */

import type { SeasonMatch } from '@/utils/bhozomaEngine';
import type { ImbangiScheduleMatch } from '@/utils/imbangiEngine';
import { callAspectById, scoreCallFixture, type CallTableRow } from '@/utils/powerDynamicCallSearch';

export type PowerDynamicHit = {
  fixtureId: number;
  name: string;
  league: string;
  country: string;
  when: string;
  percent: number;
  reason: string;
  aspectId: string;
  aspectLabel: string;
};

export type PowerDynamicLeaguePack = {
  seasonId: number;
  competitionId: number;
  competitionType: string;
  seasonName: string;
  name: string;
  country: string;
  table: CallTableRow[];
  byTeam: Map<number, CallTableRow>;
  matches: SeasonMatch[];
  schedule: ImbangiScheduleMatch[];
  cache: Map<string, unknown>;
  fixtures: {
    id: number;
    homeId: number;
    awayId: number;
    homeName: string;
    awayName: string;
    unix: number;
    dateKey: string;
  }[];
};

function kickoffLabel(unix: number): string {
  return new Date(unix * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function aspectCaption(id: string): string {
  const aspect = callAspectById(id);
  if (!aspect) return id;
  if (aspect.mark === 'tick') return `${aspect.label} · true`;
  if (aspect.mark === 'wrong') return `${aspect.label} · opposite`;
  return aspect.label;
}

export function scorePowerDynamicPacks(
  packs: PowerDynamicLeaguePack[],
  aspectIds: string[],
  dateKey: string,
): PowerDynamicHit[] {
  const hits: PowerDynamicHit[] = [];
  for (const pack of packs) {
    for (const fixture of pack.fixtures) {
      if (fixture.dateKey !== dateKey) continue;
      const home = pack.byTeam.get(fixture.homeId);
      const away = pack.byTeam.get(fixture.awayId);
      if (!home || !away) continue;
      for (const id of aspectIds) {
        const score = scoreCallFixture(id, home, away, pack.table, {
          matches: pack.matches,
          schedule: pack.schedule,
          cache: pack.cache,
          fixture: { homeId: fixture.homeId, awayId: fixture.awayId, unix: fixture.unix },
        });
        if (!score) continue;
        hits.push({
          fixtureId: fixture.id,
          name: `${fixture.homeName} vs ${fixture.awayName}`,
          league: pack.name,
          country: pack.country,
          when: kickoffLabel(fixture.unix),
          percent: score.percent,
          reason: score.reason,
          aspectId: id,
          aspectLabel: aspectCaption(id),
        });
      }
    }
  }
  hits.sort(
    (a, b) => b.percent - a.percent || a.name.localeCompare(b.name) || a.aspectLabel.localeCompare(b.aspectLabel),
  );
  return hits;
}
