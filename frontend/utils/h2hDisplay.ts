import type { H2HMatch } from '@/services/oddAlerts';
import { theme } from '@/styles/theme';

export type H2HSplit = 'overall' | 'home' | 'away';
export type H2HOutcome = 'W' | 'D' | 'L';

/** How many past meetings to show in the H2H list / summary. */
export const H2H_MEETINGS_LIMIT = 5;

function meetingKey(match: H2HMatch): string {
  return `${(match.date || '').slice(0, 10)}|${match.home_goals}|${match.away_goals}`;
}

function dayFromUnix(unix: number): string {
  if (!unix) return '';
  return new Date(unix * 1000).toISOString().slice(0, 10);
}

/** The fixture payload sometimes nests H2H, or leaves the field empty. */
export function h2hListFrom(value: unknown): H2HMatch[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is H2HMatch => {
      if (!item || typeof item !== 'object') return false;
      const row = item as H2HMatch;
      return typeof row.home_name === 'string' && typeof row.away_name === 'string';
    });
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of ['data', 'matches', 'fixtures', 'h2h']) {
      const nested = h2hListFrom(record[key]);
      if (nested.length > 0) return nested;
    }
  }
  return [];
}

/**
 * Finished season games between these two sides.
 * The call already scored these, so the opened result can show them when the
 * fixture H2H field comes back empty.
 */
export function h2hFromSeasonMatches(
  matches: {
    homeId: number;
    awayId: number;
    homeGoals: number;
    awayGoals: number;
    unix: number;
    homeGoalsHt?: number | null;
    awayGoalsHt?: number | null;
  }[],
  homeId: number,
  awayId: number,
  names: { home: string; away: string },
  league: string,
  kickoffUnix = 0,
): H2HMatch[] {
  const nameOf = (id: number) => (id === homeId ? names.home : names.away);
  return matches
    .filter((match) => {
      const pair =
        (match.homeId === homeId && match.awayId === awayId) ||
        (match.homeId === awayId && match.awayId === homeId);
      if (!pair) return false;
      if (kickoffUnix > 0 && match.unix >= kickoffUnix) return false;
      return match.homeGoals != null && match.awayGoals != null;
    })
    .map((match) => {
      const homeGoals = match.homeGoals;
      const awayGoals = match.awayGoals;
      const ht =
        match.homeGoalsHt != null && match.awayGoalsHt != null
          ? `${match.homeGoalsHt}-${match.awayGoalsHt}`
          : null;
      return {
        id: match.unix,
        home_name: nameOf(match.homeId),
        away_name: nameOf(match.awayId),
        home_goals: homeGoals,
        away_goals: awayGoals,
        ht_score: ht,
        total_goals: homeGoals + awayGoals,
        btts: homeGoals > 0 && awayGoals > 0,
        date: dayFromUnix(match.unix),
        league,
      };
    });
}

/** Keep the fixture H2H, then add season meetings that are not already listed. */
export function mergeH2hMeetings(primary: H2HMatch[], extra: H2HMatch[]): H2HMatch[] {
  const seen = new Set(primary.map(meetingKey));
  const added = extra.filter((match) => {
    const key = meetingKey(match);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return [...primary, ...added];
}

/** Newest-first, capped to the display window. */
export function recentH2hMeetings(
  matches: H2HMatch[],
  limit: number = H2H_MEETINGS_LIMIT,
): H2HMatch[] {
  return [...matches]
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, limit);
}

function norm(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function teamsMatch(a: string, b: string): boolean {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length >= 4 && nb.length >= 4 && (na.includes(nb) || nb.includes(na))) return true;
  return false;
}

export function teamInH2hMatch(m: H2HMatch, teamName: string): boolean {
  return teamsMatch(m.home_name, teamName) || teamsMatch(m.away_name, teamName);
}

/** Do not treat missing scores as 0–0. */
function readGoals(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** W/D/L from a named team's point of view in that meeting. */
export function h2hOutcomeForTeam(m: H2HMatch, teamName: string): H2HOutcome {
  const wasHome = teamsMatch(m.home_name, teamName);
  const wasAway = teamsMatch(m.away_name, teamName);
  if (!wasHome && !wasAway) return 'D';

  const hg = readGoals(m.home_goals);
  const ag = readGoals(m.away_goals);
  if (hg != null && ag != null) {
    if (hg === ag) return 'D';
    const teamGoals = wasHome ? hg : ag;
    const oppGoals = wasHome ? ag : hg;
    return teamGoals > oppGoals ? 'W' : 'L';
  }

  // Win flags beat a stale/empty draw flag (null scores often serialize as draw).
  const homeWon = m.home_win === true;
  const awayWon = m.away_win === true;
  if (homeWon !== awayWon) {
    if (homeWon) return wasHome ? 'W' : 'L';
    return wasHome ? 'L' : 'W';
  }
  if (m.draw === true) return 'D';
  return 'D';
}

/** W/D/L for the **current fixture home team** (team1 in OddAlerts h2h). */
export function h2hOutcomeForHomeTeam(m: H2HMatch, fixtureHomeName?: string): H2HOutcome {
  if (fixtureHomeName) return h2hOutcomeForTeam(m, fixtureHomeName);

  if (m.team1_win) return 'W';
  if (m.team2_win) return 'L';
  if (m.draw) return 'D';

  const hg = m.home_goals ?? 0;
  const ag = m.away_goals ?? 0;
  if (hg === ag) return 'D';
  return hg > ag ? 'W' : 'L';
}

export function outcomeColor(outcome: H2HOutcome): string {
  if (outcome === 'W') return theme.win;
  if (outcome === 'L') return theme.loss;
  return theme.yellow;
}

export function outcomeBg(outcome: H2HOutcome): string {
  if (outcome === 'W') return 'rgba(5, 150, 105, 0.14)';
  if (outcome === 'L') return 'rgba(220, 38, 38, 0.12)';
  return 'rgba(202, 138, 4, 0.14)';
}

/**
 * Overall = all meetings.
 * Home = current fixture home team when they were at home.
 * Away = current fixture away team when they were away.
 */
export function filterH2hBySplit(
  matches: H2HMatch[],
  split: H2HSplit,
  fixtureHome: string,
  fixtureAway: string,
): H2HMatch[] {
  if (split === 'overall') return matches;
  if (split === 'home') {
    return matches.filter((m) => teamsMatch(m.home_name, fixtureHome));
  }
  return matches.filter((m) => teamsMatch(m.away_name, fixtureAway));
}

/** Whose W/D/L lens to use for a given H2H tab. */
export function h2hFocusTeam(
  split: H2HSplit,
  fixtureHome: string,
  fixtureAway: string,
): string {
  return split === 'away' ? fixtureAway : fixtureHome;
}

export function h2hSummary(
  matches: H2HMatch[],
  focusTeamName?: string,
): { wins: number; draws: number; losses: number } {
  let wins = 0;
  let draws = 0;
  let losses = 0;
  for (const m of matches) {
    const o = focusTeamName
      ? h2hOutcomeForTeam(m, focusTeamName)
      : h2hOutcomeForHomeTeam(m);
    if (o === 'W') wins += 1;
    else if (o === 'D') draws += 1;
    else losses += 1;
  }
  return { wins, draws, losses };
}

export function formatH2hScore(m: H2HMatch): string {
  return `${m.home_goals ?? 0} - ${m.away_goals ?? 0}`;
}
