/**
 * Score fixtures from a league copy that is already in memory.
 */

import type { SeasonMatch } from '@/utils/bhozomaEngine';
import type { StandingLike } from '@/utils/motivationEngine';
import type { ImbangiScheduleMatch } from '@/utils/imbangiEngine';
import { ACTIVITY_BOARD_KEY, activitySample, ensureFixtureCalculation } from '@/utils/powerDynamicCalculationCalls';
import { callAspectById, scoreCallFixture, type CallTableRow } from '@/utils/powerDynamicCallSearch';
import { t1IsHomeSide } from '@/utils/powerDynamicsEngine';

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
  /** Table side with the higher standing. */
  t1Name?: string;
  t2Name?: string;
  homeIsT1?: boolean;
};

export type CallSideNotes = {
  t1: string[];
  t2: string[];
  shared: string[];
};

function tidy(text: string): string {
  return text.replace(/\s+/g, ' ').replace(/[.\s]+$/, '').trim();
}

function remember(list: string[], text: string) {
  const clean = tidy(text);
  if (clean && !list.includes(clean)) list.push(clean);
}

function groupByTeam(reason: string, t1Name?: string, t2Name?: string): CallSideNotes {
  const notes: CallSideNotes = { t1: [], t2: [], shared: [] };
  const teams = [
    t1Name ? { id: 't1' as const, name: t1Name } : null,
    t2Name ? { id: 't2' as const, name: t2Name } : null,
  ].filter((team): team is { id: 't1' | 't2'; name: string } => team != null && team.name.length > 0);
  if (teams.length === 0) return notes;
  let current: 't1' | 't2' | null = null;
  let sawTeam = false;
  for (const part of reason.split(' · ').map(tidy).filter(Boolean)) {
    const team = teams.find((item) => tidy(item.name) === part);
    if (team) {
      current = team.id;
      sawTeam = true;
      continue;
    }
    if (/^target position$/i.test(part) || part === 'No target position') continue;
    if (current) remember(notes[current], part);
    else remember(notes.shared, part);
  }
  return sawTeam ? notes : { t1: [], t2: [], shared: [] };
}

/** Pulls each side out of a joined call reason so the two teams can be read apart. */
export function splitCallReason(
  reason: string,
  homeIsT1 = true,
  names?: { t1?: string; t2?: string },
): CallSideNotes {
  const notes: CallSideNotes = { t1: [], t2: [], shared: [] };
  let topic = '';
  const give = (side: 't1' | 't2', text: string) => {
    remember(notes[side], topic ? `${topic} · ${tidy(text)}` : text);
  };
  const take = (part: string) => {
    const colour = part.match(/^Home\s+(\S+)\s+v\s+away\s+(\S+)/i);
    if (colour) {
      const kept = topic;
      topic = 'Colour';
      give(homeIsT1 ? 't1' : 't2', colour[1]);
      give(homeIsT1 ? 't2' : 't1', colour[2]);
      topic = kept;
      return;
    }
    const versus = part.match(/^T1\s+(.+?)\s+vs\s+T2\s+(.+)$/i);
    if (versus) {
      give('t1', versus[1]);
      give('t2', versus[2]);
      return;
    }
    if (/^T1\b/i.test(part) && !/\bT2\b/i.test(part)) {
      give('t1', part.replace(/^T1\s*/i, ''));
      return;
    }
    if (/^T2\b/i.test(part) && !/\bT1\b/i.test(part)) {
      give('t2', part.replace(/^T2\s*/i, ''));
      return;
    }
    if (!/[.!]|T1|T2|separation|space|between/i.test(part) && part.length <= 48) {
      topic = tidy(part);
      return;
    }
    remember(notes.shared, part);
  };
  for (const chunk of reason.split(' · ')) {
    for (const sentence of chunk.split(/\.\s+/)) take(sentence);
  }
  if (notes.t1.length === 0 && notes.t2.length === 0) {
    const grouped = groupByTeam(reason, names?.t1, names?.t2);
    if (grouped.t1.length > 0 || grouped.t2.length > 0) return grouped;
  }
  return notes;
}

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
  standings?: StandingLike[];
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

const MIN_OVERALL = 8;
const MIN_VENUE = 4;

function kickoffLabel(unix: number): string {
  return new Date(unix * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function venuePlayed(matches: PowerDynamicLeaguePack['matches']): Map<number, { home: number; away: number }> {
  const counts = new Map<number, { home: number; away: number }>();
  const add = (id: number, venue: 'home' | 'away') => {
    const row = counts.get(id) ?? { home: 0, away: 0 };
    row[venue] += 1;
    counts.set(id, row);
  };
  for (const match of matches) {
    add(match.homeId, 'home');
    add(match.awayId, 'away');
  }
  return counts;
}

/**
 * Both sides need 8 games on the table.
 * Home and away need 4 each, but only once the stored season list covers
 * that table total. A short list is a missing feed, not a team that has
 * played no home or away games.
 */
function playedEnough(row: CallTableRow, counts: Map<number, { home: number; away: number }>): boolean {
  if (row.played < MIN_OVERALL) return false;
  const venue = counts.get(row.teamId) ?? { home: 0, away: 0 };
  const seen = venue.home + venue.away;
  if (seen < row.played) return true;
  return Math.min(venue.home, venue.away) >= MIN_VENUE;
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
  if (aspectIds.length === 0) return hits;
  for (const pack of packs) {
    const counts = venuePlayed(pack.matches);
    const ready = (home: CallTableRow, away: CallTableRow) => playedEnough(home, counts) && playedEnough(away, counts);
    if (aspectIds.some((id) => id.replace(/::(tick|wrong)$/, '').startsWith('activity-'))) {
      const samples = [];
      for (const fixture of pack.fixtures) {
        if (fixture.dateKey !== dateKey) continue;
        const home = pack.byTeam.get(fixture.homeId);
        const away = pack.byTeam.get(fixture.awayId);
        if (!home || !away || !ready(home, away)) continue;
        const calc = ensureFixtureCalculation(home, away, pack.table, {
          matches: pack.matches,
          schedule: pack.schedule,
          cache: pack.cache,
          standings: pack.standings,
          competitionId: pack.competitionId,
          fixture: { homeId: fixture.homeId, awayId: fixture.awayId, unix: fixture.unix },
        });
        if (!calc) continue;
        samples.push(activitySample(`${fixture.homeId}:${fixture.awayId}:${fixture.unix}`, calc));
      }
      pack.cache.set(ACTIVITY_BOARD_KEY, samples);
    }
    for (const fixture of pack.fixtures) {
      if (fixture.dateKey !== dateKey) continue;
      const home = pack.byTeam.get(fixture.homeId);
      const away = pack.byTeam.get(fixture.awayId);
      if (!home || !away || !ready(home, away)) continue;
      const matched: { id: string; percent: number; reason: string; label: string }[] = [];
      for (const id of aspectIds) {
        const score = scoreCallFixture(id, home, away, pack.table, {
          matches: pack.matches,
          schedule: pack.schedule,
          cache: pack.cache,
          standings: pack.standings,
          competitionId: pack.competitionId,
          fixture: { homeId: fixture.homeId, awayId: fixture.awayId, unix: fixture.unix },
        });
        if (!score || score.percent <= 0) break;
        matched.push({ id, percent: score.percent, reason: score.reason, label: aspectCaption(id) });
      }
      if (matched.length !== aspectIds.length) continue;
      const homeIsT1 = t1IsHomeSide(home, away);
      hits.push({
        fixtureId: fixture.id,
        name: `${fixture.homeName} vs ${fixture.awayName}`,
        league: pack.name,
        country: pack.country,
        when: kickoffLabel(fixture.unix),
        percent: Math.min(...matched.map((item) => item.percent)),
        reason: matched.map((item) => item.reason).join(' · '),
        aspectId: matched[0].id,
        aspectLabel: matched.map((item) => item.label).join(' · '),
        t1Name: homeIsT1 ? fixture.homeName : fixture.awayName,
        t2Name: homeIsT1 ? fixture.awayName : fixture.homeName,
        homeIsT1,
      });
    }
  }
  hits.sort(
    (a, b) => b.percent - a.percent || a.name.localeCompare(b.name) || a.aspectLabel.localeCompare(b.aspectLabel),
  );
  return hits;
}
