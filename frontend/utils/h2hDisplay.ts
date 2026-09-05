import type { H2HMatch } from '@/services/oddAlerts';
import { theme } from '@/styles/theme';

export type H2HSplit = 'overall' | 'home' | 'away';
export type H2HOutcome = 'W' | 'D' | 'L';

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

/** W/D/L from a named team's point of view in that meeting. */
export function h2hOutcomeForTeam(m: H2HMatch, teamName: string): H2HOutcome {
  const hg = m.home_goals ?? 0;
  const ag = m.away_goals ?? 0;
  const wasHome = teamsMatch(m.home_name, teamName);
  const wasAway = teamsMatch(m.away_name, teamName);

  if (wasHome || wasAway) {
    if (hg === ag) return 'D';
    const teamGoals = wasHome ? hg : ag;
    const oppGoals = wasHome ? ag : hg;
    if (teamGoals > oppGoals) return 'W';
    if (teamGoals < oppGoals) return 'L';
    return 'D';
  }

  // OddAlerts team1/team2 flags when names don't match cleanly.
  if (m.team1_win) return 'W';
  if (m.team2_win) return 'L';
  if (m.draw) return 'D';
  if (hg === ag) return 'D';
  return hg > ag ? 'W' : 'L';
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
