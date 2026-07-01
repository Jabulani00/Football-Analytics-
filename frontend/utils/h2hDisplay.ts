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

/** W/D/L for the **current fixture home team** (team1 in OddAlerts h2h). */
export function h2hOutcomeForHomeTeam(m: H2HMatch, fixtureHomeName?: string): H2HOutcome {
  if (m.team1_win) return 'W';
  if (m.team2_win) return 'L';
  if (m.draw) return 'D';

  const hg = m.home_goals ?? 0;
  const ag = m.away_goals ?? 0;
  if (hg === ag) return 'D';

  if (fixtureHomeName) {
    const homeWasTeam1 = teamsMatch(m.home_name, fixtureHomeName);
    const team1Goals = homeWasTeam1 ? hg : ag;
    const team2Goals = homeWasTeam1 ? ag : hg;
    if (team1Goals > team2Goals) return 'W';
    if (team1Goals < team2Goals) return 'L';
    return 'D';
  }

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
  return matches.filter((m) => teamsMatch(m.home_name, fixtureAway));
}

export function h2hSummary(matches: H2HMatch[], fixtureHomeName?: string): { wins: number; draws: number; losses: number } {
  let wins = 0;
  let draws = 0;
  let losses = 0;
  for (const m of matches) {
    const o = h2hOutcomeForHomeTeam(m, fixtureHomeName);
    if (o === 'W') wins += 1;
    else if (o === 'D') draws += 1;
    else losses += 1;
  }
  return { wins, draws, losses };
}

export function formatH2hScore(m: H2HMatch): string {
  return `${m.home_goals ?? 0} - ${m.away_goals ?? 0}`;
}
