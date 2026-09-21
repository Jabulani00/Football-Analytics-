import type { H2HMatch } from '@/services/oddAlerts';
import { theme } from '@/styles/theme';

export type H2HSplit = 'overall' | 'home' | 'away';
export type H2HOutcome = 'W' | 'D' | 'L';

/** How many past meetings to show in the H2H list / summary. */
export const H2H_MEETINGS_LIMIT = 5;

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
