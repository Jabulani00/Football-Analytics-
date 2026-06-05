import {
  getFixtureById,
  getLeagueIdFromMatchId,
  leagueCompetitions,
  mockFixtures,
} from '@/mock/fixturesData';
import type { Fixture } from '@/mock/fixturesData';
import type { H2HResult } from '@/mock/matchData';

/** Curated H2H for marquee fixtures (overrides generator). */
export const h2hByMatchId: Record<string, H2HResult[]> = {
  spl_001: [
    { date: '2024-09-01', home: 'Rangers', away: 'Celtic', score: '1-2', competition: 'Scottish Premiership' },
    { date: '2024-04-07', home: 'Celtic', away: 'Rangers', score: '3-3', competition: 'Scottish Premiership' },
    { date: '2024-02-11', home: 'Celtic', away: 'Rangers', score: '1-0', competition: 'League Cup Final' },
    { date: '2023-12-30', home: 'Rangers', away: 'Celtic', score: '1-2', competition: 'Scottish Premiership' },
    { date: '2023-09-03', home: 'Celtic', away: 'Rangers', score: '2-1', competition: 'Scottish Premiership' },
  ],
  epl_001: [
    { date: '2024-11-10', home: 'Chelsea', away: 'Arsenal', score: '1-1', competition: 'Premier League' },
    { date: '2024-04-23', home: 'Arsenal', away: 'Chelsea', score: '3-1', competition: 'Premier League' },
    { date: '2023-10-21', home: 'Chelsea', away: 'Arsenal', score: '2-2', competition: 'Premier League' },
    { date: '2023-05-02', home: 'Arsenal', away: 'Chelsea', score: '3-1', competition: 'Premier League' },
    { date: '2022-11-06', home: 'Chelsea', away: 'Arsenal', score: '0-1', competition: 'Premier League' },
  ],
  epl_002: [
    { date: '2024-12-01', home: 'Manchester City', away: 'Liverpool', score: '1-1', competition: 'Premier League' },
    { date: '2024-03-10', home: 'Liverpool', away: 'Manchester City', score: '1-1', competition: 'Premier League' },
    { date: '2023-11-25', home: 'Manchester City', away: 'Liverpool', score: '1-1', competition: 'Premier League' },
    { date: '2023-04-01', home: 'Liverpool', away: 'Manchester City', score: '4-3', competition: 'Premier League' },
    { date: '2022-10-16', home: 'Liverpool', away: 'Manchester City', score: '1-0', competition: 'Premier League' },
  ],
  laliga_001: [
    { date: '2024-10-26', home: 'Barcelona', away: 'Real Madrid', score: '4-0', competition: 'La Liga' },
    { date: '2024-04-21', home: 'Real Madrid', away: 'Barcelona', score: '3-2', competition: 'La Liga' },
    { date: '2024-01-14', home: 'Barcelona', away: 'Real Madrid', score: '2-4', competition: 'Supercopa' },
    { date: '2023-10-28', home: 'Barcelona', away: 'Real Madrid', score: '1-2', competition: 'La Liga' },
    { date: '2023-03-19', home: 'Real Madrid', away: 'Barcelona', score: '2-1', competition: 'La Liga' },
  ],
  bundesliga_001: [
    { date: '2024-11-30', home: 'Borussia Dortmund', away: 'Bayern Munich', score: '1-3', competition: 'Bundesliga' },
    { date: '2024-03-09', home: 'Bayern Munich', away: 'Borussia Dortmund', score: '0-2', competition: 'Bundesliga' },
    { date: '2023-11-04', home: 'Borussia Dortmund', away: 'Bayern Munich', score: '0-4', competition: 'Bundesliga' },
    { date: '2023-04-01', home: 'Bayern Munich', away: 'Borussia Dortmund', score: '4-2', competition: 'Bundesliga' },
    { date: '2022-10-08', home: 'Borussia Dortmund', away: 'Bayern Munich', score: '2-2', competition: 'Bundesliga' },
  ],
  seriea_001: [
    { date: '2024-09-22', home: 'AC Milan', away: 'Inter Milan', score: '1-2', competition: 'Serie A' },
    { date: '2024-04-22', home: 'Inter Milan', away: 'AC Milan', score: '2-1', competition: 'Serie A' },
    { date: '2023-09-03', home: 'Inter Milan', away: 'AC Milan', score: '5-1', competition: 'Serie A' },
    { date: '2023-05-16', home: 'AC Milan', away: 'Inter Milan', score: '0-2', competition: 'Champions League' },
    { date: '2023-02-05', home: 'Inter Milan', away: 'AC Milan', score: '1-0', competition: 'Serie A' },
  ],
  ligue1_001: [
    { date: '2024-10-27', home: 'Marseille', away: 'Paris Saint-Germain', score: '0-3', competition: 'Ligue 1' },
    { date: '2024-03-31', home: 'Paris Saint-Germain', away: 'Marseille', score: '2-0', competition: 'Ligue 1' },
    { date: '2023-09-24', home: 'Marseille', away: 'Paris Saint-Germain', score: '0-0', competition: 'Ligue 1' },
    { date: '2023-02-26', home: 'Paris Saint-Germain', away: 'Marseille', score: '3-0', competition: 'Ligue 1' },
    { date: '2022-10-16', home: 'Marseille', away: 'Paris Saint-Germain', score: '0-1', competition: 'Ligue 1' },
  ],
  eredivisie_001: [
    { date: '2024-11-02', home: 'Ajax', away: 'PSV', score: '2-3', competition: 'Eredivisie' },
    { date: '2024-02-25', home: 'PSV', away: 'Ajax', score: '1-1', competition: 'Eredivisie' },
    { date: '2023-10-29', home: 'Ajax', away: 'PSV', score: '5-0', competition: 'Eredivisie' },
    { date: '2023-04-23', home: 'PSV', away: 'Ajax', score: '3-1', competition: 'Eredivisie' },
    { date: '2022-11-06', home: 'Ajax', away: 'PSV', score: '1-2', competition: 'Eredivisie' },
  ],
  ucl_001: [
    { date: '2024-04-17', home: 'Manchester City', away: 'Real Madrid', score: '1-1', competition: 'Champions League' },
    { date: '2024-04-09', home: 'Real Madrid', away: 'Manchester City', score: '3-3', competition: 'Champions League' },
    { date: '2023-05-17', home: 'Manchester City', away: 'Real Madrid', score: '4-0', competition: 'Champions League' },
    { date: '2023-05-09', home: 'Real Madrid', away: 'Manchester City', score: '1-1', competition: 'Champions League' },
    { date: '2022-05-04', home: 'Real Madrid', away: 'Manchester City', score: '3-1', competition: 'Champions League' },
  ],
};

const MONTHS_AGO = [2, 5, 8, 14, 22];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function formatPastDate(monthsAgo: number): string {
  const d = new Date('2026-05-21T12:00:00');
  d.setMonth(d.getMonth() - monthsAgo);
  return d.toISOString().slice(0, 10);
}

function generateScore(seed: number, homeFavoured: boolean): string {
  const h = hash(String(seed));
  const homeGoals = 1 + (h % 3) + (homeFavoured ? 1 : 0);
  const awayGoals = 0 + ((h >> 3) % 3) + (homeFavoured ? 0 : 1);
  const adjustedHome = Math.min(4, Math.max(0, homeGoals + ((h >> 5) % 2) - 1));
  const adjustedAway = Math.min(4, Math.max(0, awayGoals + ((h >> 7) % 2) - 1));
  if (adjustedHome === adjustedAway && h % 3 === 0) {
    return `${adjustedHome}-${adjustedAway + 1}`;
  }
  return `${adjustedHome}-${adjustedAway}`;
}

/** Last 5 meetings — generated per fixture when not in curated map. */
export function generateH2HForFixture(fixture: Fixture): H2HResult[] {
  const leagueId = getLeagueIdFromMatchId(fixture.id);
  const competition = leagueCompetitions[leagueId]?.name ?? 'League';
  const home = fixture.homeTeam.name;
  const away = fixture.awayTeam.name;
  const base = hash(fixture.id + home + away);

  return MONTHS_AGO.map((monthsAgo, i) => {
    const homeFirst = (base + i) % 2 === 0;
    const homeFavoured = homeFirst ? (base + i) % 3 !== 0 : (base + i) % 3 === 0;
    const score = generateScore(base + i * 17, homeFavoured);
    const cup = i === 2 && base % 4 === 0;
    return {
      date: formatPastDate(monthsAgo + (i % 2)),
      home: homeFirst ? home : away,
      away: homeFirst ? away : home,
      score,
      competition: cup ? 'Domestic Cup' : competition,
    };
  });
}

export type H2HSplit = 'overall' | 'home' | 'away';

export function filterH2HBySplit(
  results: H2HResult[],
  split: H2HSplit,
  fixtureHomeTeam: string,
  fixtureAwayTeam: string,
): H2HResult[] {
  if (split === 'overall') return results;
  if (split === 'home') {
    return results.filter((r) => r.home === fixtureHomeTeam);
  }
  return results.filter((r) => r.home === fixtureAwayTeam);
}

export function getH2HForMatch(matchId: string): H2HResult[] {
  if (h2hByMatchId[matchId]?.length) {
    return h2hByMatchId[matchId];
  }
  const fixture = getFixtureById(matchId);
  if (fixture) {
    return generateH2HForFixture(fixture);
  }
  return [];
}

export function hasH2HData(matchId: string): boolean {
  if (matchId in h2hByMatchId) return true;
  return getFixtureById(matchId) !== undefined;
}

/** Pre-warm cache optional: ensure all fixtures have H2H (for tests). */
export function getAllFixtureIds(): string[] {
  return Object.values(mockFixtures).flatMap((list) => list.map((f) => f.id));
}
