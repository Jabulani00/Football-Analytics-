import { generateStandingsFromFixtures } from '@/mock/generators';
import type { StandingRow } from './matchData';

export const standingsByLeague: Record<string, StandingRow[]> = {
  spl: [
    { pos: 1, team: 'Celtic', played: 28, won: 21, drawn: 4, lost: 3, gf: 68, ga: 22, gd: 46, points: 67, form: ['W', 'W', 'D', 'W', 'W'] },
    { pos: 2, team: 'Rangers', played: 28, won: 17, drawn: 5, lost: 6, gf: 54, ga: 31, gd: 23, points: 56, form: ['L', 'W', 'W', 'L', 'W'] },
    { pos: 3, team: 'Hearts', played: 28, won: 14, drawn: 6, lost: 8, gf: 43, ga: 34, gd: 9, points: 48, form: ['W', 'D', 'L', 'W', 'D'] },
    { pos: 4, team: 'Aberdeen', played: 28, won: 13, drawn: 5, lost: 10, gf: 39, ga: 38, gd: 1, points: 44, form: ['D', 'W', 'W', 'L', 'W'] },
    { pos: 5, team: 'Hibernian', played: 28, won: 11, drawn: 7, lost: 10, gf: 40, ga: 41, gd: -1, points: 40, form: ['L', 'D', 'W', 'W', 'L'] },
    { pos: 6, team: 'Kilmarnock', played: 28, won: 10, drawn: 8, lost: 10, gf: 35, ga: 38, gd: -3, points: 38, form: ['W', 'L', 'D', 'D', 'W'] },
    { pos: 7, team: 'St Mirren', played: 28, won: 9, drawn: 6, lost: 13, gf: 30, ga: 42, gd: -12, points: 33, form: ['L', 'L', 'W', 'D', 'L'] },
    { pos: 8, team: 'Dundee', played: 28, won: 8, drawn: 7, lost: 13, gf: 32, ga: 45, gd: -13, points: 31, form: ['D', 'W', 'L', 'L', 'D'] },
    { pos: 9, team: 'Motherwell', played: 28, won: 7, drawn: 6, lost: 15, gf: 29, ga: 48, gd: -19, points: 27, form: ['L', 'D', 'L', 'W', 'L'] },
    { pos: 10, team: 'St Johnstone', played: 28, won: 6, drawn: 8, lost: 14, gf: 27, ga: 49, gd: -22, points: 26, form: ['D', 'L', 'D', 'L', 'W'] },
    { pos: 11, team: 'Ross County', played: 28, won: 5, drawn: 5, lost: 18, gf: 26, ga: 58, gd: -32, points: 20, form: ['L', 'L', 'W', 'L', 'L'] },
    { pos: 12, team: 'Livingston', played: 28, won: 4, drawn: 6, lost: 18, gf: 24, ga: 61, gd: -37, points: 18, form: ['L', 'L', 'D', 'L', 'L'] },
  ],
  epl: [
    { pos: 1, team: 'Liverpool', played: 30, won: 22, drawn: 6, lost: 2, gf: 72, ga: 28, gd: 44, points: 72, form: ['W', 'W', 'D', 'W', 'W'] },
    { pos: 2, team: 'Arsenal', played: 30, won: 20, drawn: 7, lost: 3, gf: 65, ga: 26, gd: 39, points: 67, form: ['W', 'D', 'W', 'W', 'L'] },
    { pos: 3, team: 'Manchester City', played: 30, won: 19, drawn: 5, lost: 6, gf: 61, ga: 32, gd: 29, points: 62, form: ['D', 'W', 'L', 'W', 'D'] },
    { pos: 4, team: 'Aston Villa', played: 30, won: 17, drawn: 6, lost: 7, gf: 54, ga: 38, gd: 16, points: 57, form: ['L', 'W', 'W', 'D', 'W'] },
    { pos: 5, team: 'Tottenham', played: 30, won: 15, drawn: 5, lost: 10, gf: 58, ga: 48, gd: 10, points: 50, form: ['L', 'L', 'W', 'D', 'L'] },
    { pos: 6, team: 'Manchester United', played: 30, won: 14, drawn: 6, lost: 10, gf: 45, ga: 42, gd: 3, points: 48, form: ['W', 'D', 'L', 'W', 'W'] },
    { pos: 7, team: 'Newcastle', played: 30, won: 13, drawn: 7, lost: 10, gf: 48, ga: 44, gd: 4, points: 46, form: ['W', 'L', 'D', 'W', 'L'] },
    { pos: 8, team: 'Chelsea', played: 30, won: 12, drawn: 8, lost: 10, gf: 50, ga: 46, gd: 4, points: 44, form: ['L', 'D', 'W', 'L', 'D'] },
    { pos: 9, team: 'Brighton', played: 30, won: 11, drawn: 9, lost: 10, gf: 42, ga: 41, gd: 1, points: 42, form: ['D', 'W', 'L', 'D', 'W'] },
    { pos: 10, team: 'West Ham', played: 30, won: 10, drawn: 8, lost: 12, gf: 40, ga: 48, gd: -8, points: 38, form: ['W', 'L', 'D', 'L', 'W'] },
  ],
  laliga: [
    { pos: 1, team: 'Real Madrid', played: 28, won: 21, drawn: 4, lost: 3, gf: 58, ga: 22, gd: 36, points: 67, form: ['W', 'W', 'W', 'D', 'W'] },
    { pos: 2, team: 'Barcelona', played: 28, won: 19, drawn: 5, lost: 4, gf: 62, ga: 28, gd: 34, points: 62, form: ['D', 'W', 'W', 'L', 'W'] },
    { pos: 3, team: 'Atlético Madrid', played: 28, won: 16, drawn: 6, lost: 6, gf: 44, ga: 30, gd: 14, points: 54, form: ['W', 'D', 'W', 'W', 'L'] },
    { pos: 4, team: 'Athletic Club', played: 28, won: 14, drawn: 7, lost: 7, gf: 40, ga: 32, gd: 8, points: 49, form: ['W', 'L', 'D', 'W', 'D'] },
    { pos: 5, team: 'Real Sociedad', played: 28, won: 12, drawn: 8, lost: 8, gf: 36, ga: 34, gd: 2, points: 44, form: ['D', 'W', 'L', 'D', 'W'] },
    { pos: 6, team: 'Villarreal', played: 28, won: 11, drawn: 7, lost: 10, gf: 38, ga: 40, gd: -2, points: 40, form: ['L', 'W', 'D', 'L', 'W'] },
    { pos: 7, team: 'Real Betis', played: 28, won: 10, drawn: 9, lost: 9, gf: 35, ga: 38, gd: -3, points: 39, form: ['D', 'L', 'W', 'D', 'L'] },
    { pos: 8, team: 'Sevilla', played: 28, won: 9, drawn: 6, lost: 13, gf: 30, ga: 42, gd: -12, points: 33, form: ['L', 'L', 'W', 'L', 'D'] },
  ],
  bundesliga: [
    { pos: 1, team: 'Bayer Leverkusen', played: 26, won: 18, drawn: 6, lost: 2, gf: 58, ga: 24, gd: 34, points: 60, form: ['W', 'D', 'W', 'W', 'D'] },
    { pos: 2, team: 'Bayern Munich', played: 26, won: 17, drawn: 4, lost: 5, gf: 62, ga: 30, gd: 32, points: 55, form: ['W', 'W', 'L', 'W', 'W'] },
    { pos: 3, team: 'VfB Stuttgart', played: 26, won: 15, drawn: 4, lost: 7, gf: 48, ga: 32, gd: 16, points: 49, form: ['L', 'W', 'W', 'D', 'W'] },
    { pos: 4, team: 'RB Leipzig', played: 26, won: 14, drawn: 5, lost: 7, gf: 50, ga: 36, gd: 14, points: 47, form: ['D', 'W', 'L', 'W', 'D'] },
    { pos: 5, team: 'Borussia Dortmund', played: 26, won: 13, drawn: 6, lost: 7, gf: 46, ga: 38, gd: 8, points: 45, form: ['L', 'D', 'W', 'L', 'W'] },
    { pos: 6, team: 'Eintracht Frankfurt', played: 26, won: 11, drawn: 7, lost: 8, gf: 40, ga: 38, gd: 2, points: 40, form: ['W', 'D', 'L', 'D', 'W'] },
    { pos: 7, team: 'Freiburg', played: 26, won: 10, drawn: 5, lost: 11, gf: 34, ga: 42, gd: -8, points: 35, form: ['W', 'L', 'L', 'W', 'D'] },
    { pos: 8, team: 'Hoffenheim', played: 26, won: 9, drawn: 6, lost: 11, gf: 38, ga: 48, gd: -10, points: 33, form: ['L', 'D', 'W', 'L', 'L'] },
  ],
  seriea: [
    { pos: 1, team: 'Inter Milan', played: 28, won: 22, drawn: 3, lost: 3, gf: 64, ga: 18, gd: 46, points: 69, form: ['W', 'W', 'W', 'W', 'D'] },
    { pos: 2, team: 'Juventus', played: 28, won: 17, drawn: 7, lost: 4, gf: 42, ga: 24, gd: 18, points: 58, form: ['W', 'D', 'W', 'L', 'W'] },
    { pos: 3, team: 'AC Milan', played: 28, won: 16, drawn: 5, lost: 7, gf: 48, ga: 32, gd: 16, points: 53, form: ['L', 'W', 'W', 'D', 'L'] },
    { pos: 4, team: 'Napoli', played: 28, won: 14, drawn: 6, lost: 8, gf: 44, ga: 36, gd: 8, points: 48, form: ['L', 'D', 'W', 'W', 'L'] },
    { pos: 5, team: 'Atalanta', played: 28, won: 13, drawn: 6, lost: 9, gf: 46, ga: 38, gd: 8, points: 45, form: ['W', 'L', 'D', 'W', 'W'] },
    { pos: 6, team: 'Roma', played: 28, won: 12, drawn: 7, lost: 9, gf: 40, ga: 36, gd: 4, points: 43, form: ['D', 'W', 'L', 'D', 'W'] },
    { pos: 7, team: 'Lazio', played: 28, won: 11, drawn: 6, lost: 11, gf: 36, ga: 40, gd: -4, points: 39, form: ['D', 'L', 'W', 'L', 'D'] },
    { pos: 8, team: 'Fiorentina', played: 28, won: 10, drawn: 7, lost: 11, gf: 34, ga: 42, gd: -8, points: 37, form: ['L', 'D', 'L', 'W', 'D'] },
  ],
  ligue1: [
    { pos: 1, team: 'Paris Saint-Germain', played: 26, won: 18, drawn: 5, lost: 3, gf: 58, ga: 22, gd: 36, points: 59, form: ['W', 'W', 'D', 'W', 'W'] },
    { pos: 2, team: 'Monaco', played: 26, won: 14, drawn: 6, lost: 6, gf: 44, ga: 32, gd: 12, points: 48, form: ['D', 'W', 'W', 'L', 'D'] },
    { pos: 3, team: 'Brest', played: 26, won: 13, drawn: 7, lost: 6, gf: 38, ga: 28, gd: 10, points: 46, form: ['W', 'D', 'W', 'D', 'W'] },
    { pos: 4, team: 'Lille', played: 26, won: 12, drawn: 7, lost: 7, gf: 36, ga: 30, gd: 6, points: 43, form: ['L', 'W', 'D', 'W', 'L'] },
    { pos: 5, team: 'Nice', played: 26, won: 11, drawn: 8, lost: 7, gf: 32, ga: 28, gd: 4, points: 41, form: ['D', 'L', 'W', 'D', 'W'] },
    { pos: 6, team: 'Lyon', played: 26, won: 10, drawn: 6, lost: 10, gf: 34, ga: 36, gd: -2, points: 36, form: ['D', 'L', 'W', 'L', 'D'] },
    { pos: 7, team: 'Lens', played: 26, won: 9, drawn: 7, lost: 10, gf: 30, ga: 34, gd: -4, points: 34, form: ['L', 'D', 'L', 'W', 'L'] },
    { pos: 8, team: 'Marseille', played: 26, won: 8, drawn: 7, lost: 11, gf: 32, ga: 40, gd: -8, points: 31, form: ['L', 'L', 'D', 'W', 'L'] },
  ],
  eredivisie: [
    { pos: 1, team: 'PSV', played: 26, won: 20, drawn: 3, lost: 3, gf: 62, ga: 20, gd: 42, points: 63, form: ['W', 'W', 'W', 'L', 'W'] },
    { pos: 2, team: 'Feyenoord', played: 26, won: 17, drawn: 5, lost: 4, gf: 52, ga: 28, gd: 24, points: 56, form: ['W', 'D', 'W', 'W', 'D'] },
    { pos: 3, team: 'Ajax', played: 26, won: 14, drawn: 6, lost: 6, gf: 48, ga: 32, gd: 16, points: 48, form: ['L', 'W', 'D', 'W', 'L'] },
    { pos: 4, team: 'AZ Alkmaar', played: 26, won: 12, drawn: 7, lost: 7, gf: 40, ga: 34, gd: 6, points: 43, form: ['D', 'W', 'L', 'W', 'D'] },
    { pos: 5, team: 'Twente', played: 26, won: 11, drawn: 6, lost: 9, gf: 36, ga: 36, gd: 0, points: 39, form: ['W', 'L', 'D', 'L', 'W'] },
    { pos: 6, team: 'Utrecht', played: 26, won: 10, drawn: 7, lost: 9, gf: 34, ga: 38, gd: -4, points: 37, form: ['D', 'L', 'W', 'D', 'L'] },
  ],
  ucl: generateStandingsFromFixtures('ucl'),
};

export function getStandingsForLeague(leagueId: string): StandingRow[] {
  const rows = standingsByLeague[leagueId];
  if (rows && rows.length > 0) return rows;
  return generateStandingsFromFixtures(leagueId);
}
