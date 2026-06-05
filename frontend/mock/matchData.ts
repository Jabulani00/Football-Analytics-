import type { Fixture } from './fixturesData';
import { getLeagueIdFromMatchId, leagueCompetitions } from './fixturesData';
import { getEventsForMatch } from './eventsData';

export type MatchEvent = {
  type: 'goal' | 'yellowCard' | 'redCard' | 'substitution';
  player: string;
  minute: number;
  assist?: string;
};

export type Team = {
  id: string;
  name: string;
  shortName: string;
  crest: string;
  score: number;
  events: MatchEvent[];
};

export type MatchStatus = 'LIVE' | 'FT' | 'NS' | 'HT';

export type Match = {
  id: string;
  competition: string;
  season: string;
  matchday: string;
  status: MatchStatus;
  minute: number;
  venue: string;
  date: string;
  kickoff: string;
  homeTeam: Team;
  awayTeam: Team;
  stats: {
    possession: [number, number];
    shots: [number, number];
    shotsOnTarget: [number, number];
    corners: [number, number];
    fouls: [number, number];
    yellowCards: [number, number];
    redCards: [number, number];
    offsides: [number, number];
    xG: [number, number];
  };
};

export type H2HResult = {
  date: string;
  home: string;
  away: string;
  score: string;
  competition: string;
};

export type StandingRow = {
  pos: number;
  team: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
  form: ('W' | 'D' | 'L')[];
};

export const mockMatch: Match = {
  id: 'spl_001',
  competition: 'Scottish Premiership',
  season: '2024/25',
  matchday: 'Matchday 28',
  status: 'FT',
  minute: 90,
  venue: 'Celtic Park, Glasgow',
  date: '2026-05-21',
  kickoff: '15:00',
  homeTeam: {
    id: 'celtic',
    name: 'Celtic',
    shortName: 'CEL',
    crest: '🍀',
    score: 3,
    events: [
      { type: 'goal', player: 'Kyogo Furuhashi', minute: 14, assist: 'Daizen Maeda' },
      { type: 'goal', player: "Matt O'Riley", minute: 52, assist: 'Paulo Bernardo' },
      { type: 'yellowCard', player: 'Cameron Carter-Vickers', minute: 67 },
      { type: 'goal', player: 'Kyogo Furuhashi', minute: 78, assist: 'James Forrest' },
    ],
  },
  awayTeam: {
    id: 'rangers',
    name: 'Rangers',
    shortName: 'RAN',
    crest: '🦁',
    score: 1,
    events: [
      { type: 'goal', player: 'Cyriel Dessers', minute: 38, assist: 'James Tavernier' },
      { type: 'yellowCard', player: 'John Souttar', minute: 55 },
      { type: 'redCard', player: 'Nicolas Raskin', minute: 81 },
    ],
  },
  stats: {
    possession: [58, 42],
    shots: [14, 8],
    shotsOnTarget: [7, 3],
    corners: [6, 4],
    fouls: [9, 13],
    yellowCards: [1, 1],
    redCards: [0, 1],
    offsides: [2, 3],
    xG: [2.31, 0.87],
  },
};

export const mockH2H: H2HResult[] = [
  { date: '2024-09-01', home: 'Rangers', away: 'Celtic', score: '1-2', competition: 'Scottish Premiership' },
  { date: '2024-04-07', home: 'Celtic', away: 'Rangers', score: '3-3', competition: 'Scottish Premiership' },
  { date: '2024-02-11', home: 'Celtic', away: 'Rangers', score: '1-0', competition: 'League Cup Final' },
  { date: '2023-12-30', home: 'Rangers', away: 'Celtic', score: '1-2', competition: 'Scottish Premiership' },
  { date: '2023-09-03', home: 'Celtic', away: 'Rangers', score: '2-1', competition: 'Scottish Premiership' },
];

export const mockStandings: StandingRow[] = [
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
];

const featuredEplArsenalChelsea: Match = {
  id: 'epl_001',
  competition: 'Premier League',
  season: '2024/25',
  matchday: 'Matchday 30',
  status: 'FT',
  minute: 90,
  venue: 'Emirates Stadium, London',
  date: '2026-05-21',
  kickoff: '12:30',
  homeTeam: {
    id: 'arsenal',
    name: 'Arsenal',
    shortName: 'ARS',
    crest: '🔴',
    score: 2,
    events: [
      { type: 'goal', player: 'Bukayo Saka', minute: 33, assist: 'Martin Ødegaard' },
      { type: 'yellowCard', player: 'Declan Rice', minute: 41 },
      { type: 'goal', player: 'Kai Havertz', minute: 78 },
    ],
  },
  awayTeam: {
    id: 'chelsea',
    name: 'Chelsea',
    shortName: 'CHE',
    crest: '🔵',
    score: 1,
    events: [
      { type: 'goal', player: 'Cole Palmer', minute: 56, assist: 'Raheem Sterling' },
      { type: 'yellowCard', player: 'Moises Caicedo', minute: 62 },
    ],
  },
  stats: {
    possession: [54, 46],
    shots: [15, 11],
    shotsOnTarget: [7, 4],
    corners: [8, 5],
    fouls: [11, 14],
    yellowCards: [1, 2],
    redCards: [0, 0],
    offsides: [3, 2],
    xG: [1.92, 1.24],
  },
};

const featuredEplLiverpoolCity: Match = {
  id: 'epl_002',
  competition: 'Premier League',
  season: '2024/25',
  matchday: 'Matchday 30',
  status: 'LIVE',
  minute: 72,
  venue: 'Anfield, Liverpool',
  date: '2026-05-21',
  kickoff: '15:00',
  homeTeam: {
    id: 'liverpool',
    name: 'Liverpool',
    shortName: 'LIV',
    crest: '🔴',
    score: 2,
    events: [
      { type: 'goal', player: 'Mohamed Salah', minute: 12, assist: 'Darwin Núñez' },
      { type: 'goal', player: 'Luis Díaz', minute: 61 },
      { type: 'yellowCard', player: 'Virgil van Dijk', minute: 68 },
    ],
  },
  awayTeam: {
    id: 'city',
    name: 'Manchester City',
    shortName: 'MCI',
    crest: '🔵',
    score: 2,
    events: [
      { type: 'goal', player: 'Erling Haaland', minute: 28, assist: 'Kevin De Bruyne' },
      { type: 'goal', player: 'Phil Foden', minute: 55 },
    ],
  },
  stats: {
    possession: [47, 53],
    shots: [12, 14],
    shotsOnTarget: [6, 7],
    corners: [5, 6],
    fouls: [10, 8],
    yellowCards: [1, 0],
    redCards: [0, 0],
    offsides: [2, 1],
    xG: [1.78, 2.05],
  },
};

const featuredLaligaClasico: Match = {
  id: 'laliga_001',
  competition: 'La Liga',
  season: '2024/25',
  matchday: 'Matchday 28',
  status: 'FT',
  minute: 90,
  venue: 'Santiago Bernabéu, Madrid',
  date: '2026-05-21',
  kickoff: '13:00',
  homeTeam: {
    id: 'realmadrid',
    name: 'Real Madrid',
    shortName: 'RMA',
    crest: '👑',
    score: 2,
    events: [
      { type: 'goal', player: 'Vinícius Jr', minute: 19 },
      { type: 'goal', player: 'Jude Bellingham', minute: 71, assist: 'Rodrygo' },
    ],
  },
  awayTeam: {
    id: 'barcelona',
    name: 'Barcelona',
    shortName: 'BAR',
    crest: '🔵🔴',
    score: 2,
    events: [
      { type: 'goal', player: 'Robert Lewandowski', minute: 34, assist: 'Pedri' },
      { type: 'goal', player: 'Raphinha', minute: 88 },
      { type: 'yellowCard', player: 'Gavi', minute: 52 },
    ],
  },
  stats: {
    possession: [49, 51],
    shots: [13, 14],
    shotsOnTarget: [6, 6],
    corners: [7, 6],
    fouls: [12, 11],
    yellowCards: [2, 3],
    redCards: [0, 0],
    offsides: [1, 3],
    xG: [1.65, 1.71],
  },
};

const featuredBundesligaKlassiker: Match = {
  id: 'bundesliga_001',
  competition: 'Bundesliga',
  season: '2024/25',
  matchday: 'Matchday 26',
  status: 'FT',
  minute: 90,
  venue: 'Allianz Arena, Munich',
  date: '2026-05-21',
  kickoff: '14:30',
  homeTeam: {
    id: 'bayern',
    name: 'Bayern Munich',
    shortName: 'BAY',
    crest: '🔴',
    score: 4,
    events: [
      { type: 'goal', player: 'Harry Kane', minute: 11 },
      { type: 'goal', player: 'Leroy Sané', minute: 38, assist: 'Jamal Musiala' },
      { type: 'goal', player: 'Harry Kane', minute: 62 },
      { type: 'goal', player: 'Thomas Müller', minute: 84 },
    ],
  },
  awayTeam: {
    id: 'bvb',
    name: 'Borussia Dortmund',
    shortName: 'BVB',
    crest: '🟡',
    score: 2,
    events: [
      { type: 'goal', player: 'Niclas Füllkrug', minute: 44 },
      { type: 'goal', player: 'Karim Adeyemi', minute: 57, assist: 'Jadon Sancho' },
      { type: 'yellowCard', player: 'Emre Can', minute: 70 },
    ],
  },
  stats: {
    possession: [61, 39],
    shots: [18, 9],
    shotsOnTarget: [10, 4],
    corners: [9, 3],
    fouls: [8, 13],
    yellowCards: [1, 2],
    redCards: [0, 0],
    offsides: [2, 4],
    xG: [3.12, 1.05],
  },
};

const featuredSerieADerby: Match = {
  id: 'seriea_001',
  competition: 'Serie A',
  season: '2024/25',
  matchday: 'Matchday 28',
  status: 'FT',
  minute: 90,
  venue: 'San Siro, Milan',
  date: '2026-05-21',
  kickoff: '14:00',
  homeTeam: {
    id: 'inter',
    name: 'Inter Milan',
    shortName: 'INT',
    crest: '🔵⚫',
    score: 3,
    events: [
      { type: 'goal', player: 'Lautaro Martínez', minute: 22, assist: 'Nicolò Barella' },
      { type: 'goal', player: 'Marcus Thuram', minute: 49 },
      { type: 'goal', player: 'Lautaro Martínez', minute: 81 },
    ],
  },
  awayTeam: {
    id: 'milan',
    name: 'AC Milan',
    shortName: 'MIL',
    crest: '🔴⚫',
    score: 1,
    events: [
      { type: 'goal', player: 'Rafael Leão', minute: 64, assist: 'Theo Hernández' },
      { type: 'yellowCard', player: 'Tijjani Reijnders', minute: 73 },
    ],
  },
  stats: {
    possession: [56, 44],
    shots: [16, 10],
    shotsOnTarget: [8, 3],
    corners: [7, 4],
    fouls: [10, 12],
    yellowCards: [2, 3],
    redCards: [0, 0],
    offsides: [3, 1],
    xG: [2.48, 0.95],
  },
};

const featuredLigue1Classique: Match = {
  id: 'ligue1_001',
  competition: 'Ligue 1',
  season: '2024/25',
  matchday: 'Matchday 26',
  status: 'FT',
  minute: 90,
  venue: 'Parc des Princes, Paris',
  date: '2026-05-21',
  kickoff: '16:00',
  homeTeam: {
    id: 'psg',
    name: 'Paris Saint-Germain',
    shortName: 'PSG',
    crest: '🔵',
    score: 3,
    events: [
      { type: 'goal', player: 'Kylian Mbappé', minute: 24 },
      { type: 'goal', player: 'Ousmane Dembélé', minute: 51, assist: 'Vitinha' },
      { type: 'goal', player: 'Gonçalo Ramos', minute: 77 },
    ],
  },
  awayTeam: {
    id: 'marseille',
    name: 'Marseille',
    shortName: 'OM',
    crest: '⚪🔵',
    score: 0,
    events: [
      { type: 'yellowCard', player: 'Derek Cornelius', minute: 58 },
      { type: 'yellowCard', player: 'Pierre-Emile Højbjerg', minute: 82 },
    ],
  },
  stats: {
    possession: [62, 38],
    shots: [17, 6],
    shotsOnTarget: [9, 1],
    corners: [10, 2],
    fouls: [7, 15],
    yellowCards: [0, 2],
    redCards: [0, 0],
    offsides: [4, 2],
    xG: [2.65, 0.42],
  },
};

const featuredEredivisieDeKlassieker: Match = {
  id: 'eredivisie_001',
  competition: 'Eredivisie',
  season: '2024/25',
  matchday: 'Matchday 26',
  status: 'FT',
  minute: 90,
  venue: 'Philips Stadion, Eindhoven',
  date: '2026-05-21',
  kickoff: '16:45',
  homeTeam: {
    id: 'psv',
    name: 'PSV',
    shortName: 'PSV',
    crest: '🔴⚪',
    score: 2,
    events: [
      { type: 'goal', player: 'Luuk de Jong', minute: 31 },
      { type: 'goal', player: 'Johan Bakayoko', minute: 69, assist: 'Joey Veerman' },
    ],
  },
  awayTeam: {
    id: 'ajax',
    name: 'Ajax',
    shortName: 'AJA',
    crest: '⚪🔴',
    score: 1,
    events: [
      { type: 'goal', player: 'Brian Brobbey', minute: 54, assist: 'Steven Berghuis' },
      { type: 'yellowCard', player: 'Kenneth Taylor', minute: 76 },
    ],
  },
  stats: {
    possession: [52, 48],
    shots: [14, 12],
    shotsOnTarget: [6, 5],
    corners: [6, 7],
    fouls: [11, 10],
    yellowCards: [1, 2],
    redCards: [0, 0],
    offsides: [2, 3],
    xG: [1.88, 1.35],
  },
};

const featuredUclKnockout: Match = {
  id: 'ucl_001',
  competition: 'UEFA Champions League',
  season: '2024/25',
  matchday: 'Quarter-final · 1st leg',
  status: 'FT',
  minute: 90,
  venue: 'Santiago Bernabéu, Madrid',
  date: '2026-05-21',
  kickoff: '20:00',
  homeTeam: {
    id: 'realmadrid',
    name: 'Real Madrid',
    shortName: 'RMA',
    crest: '👑',
    score: 1,
    events: [
      { type: 'goal', player: 'Rodrygo', minute: 63, assist: 'Vinícius Jr' },
      { type: 'yellowCard', player: 'Antonio Rüdiger', minute: 71 },
    ],
  },
  awayTeam: {
    id: 'city',
    name: 'Manchester City',
    shortName: 'MCI',
    crest: '🔵',
    score: 0,
    events: [
      { type: 'yellowCard', player: 'Rúben Dias', minute: 48 },
      { type: 'yellowCard', player: 'Rodri', minute: 85 },
    ],
  },
  stats: {
    possession: [44, 56],
    shots: [10, 13],
    shotsOnTarget: [4, 3],
    corners: [4, 8],
    fouls: [13, 9],
    yellowCards: [2, 2],
    redCards: [0, 0],
    offsides: [1, 2],
    xG: [1.21, 1.44],
  },
};

const matchDetails: Record<string, Match> = {
  spl_001: mockMatch,
  epl_001: featuredEplArsenalChelsea,
  epl_002: featuredEplLiverpoolCity,
  laliga_001: featuredLaligaClasico,
  bundesliga_001: featuredBundesligaKlassiker,
  seriea_001: featuredSerieADerby,
  ligue1_001: featuredLigue1Classique,
  eredivisie_001: featuredEredivisieDeKlassieker,
  ucl_001: featuredUclKnockout,
};

export const featuredMatchIds = new Set(Object.keys(matchDetails));

const teamCrests: Record<string, string> = {
  Celtic: '🍀',
  Rangers: '🦁',
  Arsenal: '🔴',
  Chelsea: '🔵',
  Liverpool: '🔴',
  'Manchester City': '🔵',
  'Real Madrid': '👑',
  Barcelona: '🔵🔴',
  'Bayern Munich': '🔴',
  'Borussia Dortmund': '🟡',
  'Paris Saint-Germain': '🔵',
  Marseille: '⚪🔵',
  'Inter Milan': '🔵⚫',
  'AC Milan': '🔴⚫',
  PSV: '🔴⚪',
  Ajax: '⚪🔴',
};

const venues: Record<string, string> = {
  spl: 'Scotland',
  epl: 'England',
  laliga: 'Spain',
  bundesliga: 'Germany',
  seriea: 'Italy',
  ligue1: 'France',
  eredivisie: 'Netherlands',
  ucl: 'Europe',
};

function hashName(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function crestFor(teamName: string): string {
  if (teamCrests[teamName]) return teamCrests[teamName];
  const fallbacks = ['⚽', '🔵', '🔴', '🟢', '🟡', '⚪', '🟣', '🏴'];
  return fallbacks[hashName(teamName) % fallbacks.length];
}

function countCards(events: MatchEvent[], type: 'yellowCard' | 'redCard'): number {
  return events.filter((e) => e.type === type).length;
}

function buildStatsFromFixture(
  fixture: Fixture,
  events: { home: MatchEvent[]; away: MatchEvent[] },
): Match['stats'] {
  const h = fixture.homeTeam.score ?? 0;
  const a = fixture.awayTeam.score ?? 0;
  const total = Math.max(h + a, 1);
  const homeShare = Math.min(68, Math.max(32, Math.round(42 + ((h - a) / total) * 18)));
  return {
    possession: [homeShare, 100 - homeShare],
    shots: [h * 4 + 6, a * 4 + 6],
    shotsOnTarget: [h * 2 + 2, a * 2 + 2],
    corners: [h + 3, a + 3],
    fouls: [8 + a, 8 + h],
    yellowCards: [countCards(events.home, 'yellowCard'), countCards(events.away, 'yellowCard')],
    redCards: [countCards(events.home, 'redCard'), countCards(events.away, 'redCard')],
    offsides: [2, 2],
    xG: [+(h * 0.85 + 0.35).toFixed(2), +(a * 0.85 + 0.35).toFixed(2)],
  };
}

function liveMinuteCap(fixture?: Fixture): number | null {
  if (!fixture || fixture.status !== 'LIVE') return null;
  return fixture.minute;
}

export function hasFeaturedMatchData(matchId: string): boolean {
  return featuredMatchIds.has(matchId);
}

export function getMatchDetail(matchId: string, fixture?: Fixture): Match | null {
  const minuteCap = liveMinuteCap(fixture);
  const events = getEventsForMatch(matchId, minuteCap);

  if (matchDetails[matchId]) {
    const match = matchDetails[matchId];
    return {
      ...match,
      minute: fixture?.status === 'LIVE' ? (fixture.minute ?? match.minute) : match.minute,
      status: fixture?.status === 'LIVE' ? 'LIVE' : match.status,
      homeTeam: { ...match.homeTeam, events: events.home ?? [] },
      awayTeam: { ...match.awayTeam, events: events.away ?? [] },
    };
  }

  if (!fixture) return null;

  const leagueId = getLeagueIdFromMatchId(matchId);
  const meta = leagueCompetitions[leagueId] ?? leagueCompetitions.spl;
  const started = fixture.status !== 'NS';

  return {
    id: fixture.id,
    competition: meta.name,
    season: meta.season,
    matchday: 'Matchday',
    status: fixture.status === 'HT' ? 'HT' : fixture.status,
    minute: fixture.minute ?? 0,
    venue: venues[leagueId] ?? '—',
    date: fixture.date,
    kickoff: fixture.kickoff,
    homeTeam: {
      id: fixture.homeTeam.shortName.toLowerCase(),
      name: fixture.homeTeam.name,
      shortName: fixture.homeTeam.shortName,
      crest: crestFor(fixture.homeTeam.name),
      score: started ? (fixture.homeTeam.score ?? 0) : 0,
      events: started ? events.home : [],
    },
    awayTeam: {
      id: fixture.awayTeam.shortName.toLowerCase(),
      name: fixture.awayTeam.name,
      shortName: fixture.awayTeam.shortName,
      crest: crestFor(fixture.awayTeam.name),
      score: started ? (fixture.awayTeam.score ?? 0) : 0,
      events: started ? events.away : [],
    },
    stats: started ? buildStatsFromFixture(fixture, events) : {
      possession: [50, 50],
      shots: [0, 0],
      shotsOnTarget: [0, 0],
      corners: [0, 0],
      fouls: [0, 0],
      yellowCards: [0, 0],
      redCards: [0, 0],
      offsides: [0, 0],
      xG: [0, 0],
    },
  };
}
