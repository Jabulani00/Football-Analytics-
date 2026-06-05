import type { Fixture } from '@/mock/fixturesData';

export type MissingPlayer = {
  name: string;
  reason: string;
  status: 'out' | 'doubt';
};

export type LineupPlayer = {
  name: string;
  number: number;
  position: string;
};

export type MatchOddsMarket = {
  market: string;
  selection: string;
  hollywood: number;
  oddsAlert: number;
};

export type FootyFixtureStats = {
  xg: [number, number];
  xga: [number, number];
  last5Home: { opponent: string; score: string; venue: 'H' | 'A' }[];
  last5Away: { opponent: string; score: string; venue: 'H' | 'A' }[];
  referee: { name: string; yellowAvg: number; redAvg: number; foulsAvg: number };
  cards: { homeYellow: number; homeRed: number; awayYellow: number; awayRed: number };
  corners: { homeFor: number; homeAgainst: number; awayFor: number; awayAgainst: number };
};

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const REFEREES = ['Michael Oliver', 'Anthony Taylor', 'Simon Hooper', 'Craig Pawson', 'Paul Tierney'];

const IMPORTANCE = [
  'Title race — maximum points expected',
  'European qualification on the line',
  'Relegation six-pointer — high draw relevance',
  'Derby — form less reliable, intensity high',
  'Mid-table — rotation risk for cup week',
];

export function getMatchImportance(fixtureId: string): string {
  return IMPORTANCE[hash(fixtureId) % IMPORTANCE.length];
}

export function getMissingPlayers(fixture: Fixture): {
  home: MissingPlayer[];
  away: MissingPlayer[];
} {
  const s = hash(fixture.id);
  const home = s % 3 !== 0 ? [{ name: 'Key Defender', reason: 'Hamstring', status: 'out' as const }] : [];
  const away =
    s % 2 === 0
      ? [{ name: 'Striker', reason: 'Suspended', status: 'out' as const }, { name: 'Midfielder', reason: 'Knock', status: 'doubt' as const }]
      : [];
  return {
    home: home.length ? home : [{ name: '—', reason: 'Full squad available', status: 'doubt' as const }],
    away: away.length ? away : [{ name: '—', reason: 'Full squad available', status: 'doubt' as const }],
  };
}

function lineup(seed: number, teamName: string): LineupPlayer[] {
  const positions = ['GK', 'DF', 'DF', 'DF', 'DF', 'MF', 'MF', 'MF', 'FW', 'FW', 'FW'];
  return positions.map((pos, i) => ({
    name: `${teamName.slice(0, 3).toUpperCase()} Player ${i + 1}`,
    number: i === 0 ? 1 : i + 2,
    position: pos,
  }));
}

export function getLineups(fixture: Fixture): {
  home: LineupPlayer[];
  away: LineupPlayer[];
  confirmed: boolean;
} {
  const s = hash(fixture.id);
  return {
    confirmed: fixture.status !== 'NS' || s % 4 !== 0,
    home: lineup(s, fixture.homeTeam.name),
    away: lineup(s + 1, fixture.awayTeam.name),
  };
}

export function getMatchOddsMarkets(fixture: Fixture): MatchOddsMarket[] {
  const h = parseFloat(fixture.odds.home) || 2;
  const d = parseFloat(fixture.odds.draw) || 3.2;
  const a = parseFloat(fixture.odds.away) || 3.5;
  return [
    { market: '1X2', selection: 'Home', hollywood: h, oddsAlert: +(h - 0.05).toFixed(2) },
    { market: '1X2', selection: 'Draw', hollywood: d, oddsAlert: +(d + 0.02).toFixed(2) },
    { market: '1X2', selection: 'Away', hollywood: a, oddsAlert: +(a - 0.03).toFixed(2) },
    { market: 'Total Goals', selection: 'Over 2.5', hollywood: 1.75, oddsAlert: 1.72 },
    { market: 'BTTS', selection: 'Yes', hollywood: 1.65, oddsAlert: 1.62 },
    { market: 'Asian Handicap', selection: `${fixture.homeTeam.shortName} -0.5`, hollywood: 1.9, oddsAlert: 1.88 },
  ];
}

export function getDrawAnalysis(fixture: Fixture): {
  likelihood: number;
  relevance: string;
  homeDrawPct: number;
  awayDrawPct: number;
  h2hDraws: number;
} {
  const s = hash(fixture.id);
  const likelihood = 18 + (s % 22);
  return {
    likelihood,
    relevance:
      likelihood > 30
        ? 'Draw is a strong consideration — both teams profile for tight games'
        : 'Draw less likely on stats — prefer goal-side markets',
    homeDrawPct: 22 + (s % 15),
    awayDrawPct: 20 + (s % 12),
    h2hDraws: s % 3,
  };
}

export function getFootyStats(fixture: Fixture): FootyFixtureStats {
  const s = hash(fixture.id);
  const xgH = +(1.2 + (s % 15) / 10).toFixed(2);
  const xgA = +(1.0 + (s % 12) / 10).toFixed(2);
  const opp = ['Team A', 'Team B', 'Team C', 'Team D', 'Team E'];
  return {
    xg: [xgH, xgA],
    xga: [+(xgA * 0.9).toFixed(2), +(xgH * 0.9).toFixed(2)],
    last5Home: opp.map((o, i) => ({
      opponent: o,
      score: `${2 + (s + i) % 2}-${1 + (s + i) % 2}`,
      venue: (i % 2 === 0 ? 'H' : 'A') as 'H' | 'A',
    })),
    last5Away: opp.map((o, i) => ({
      opponent: o,
      score: `${1 + (s + i) % 2}-${1 + (s + i) % 2}`,
      venue: (i % 2 === 1 ? 'H' : 'A') as 'H' | 'A',
    })),
    referee: {
      name: REFEREES[s % REFEREES.length],
      yellowAvg: 3.8 + (s % 10) / 10,
      redAvg: 0.15 + (s % 5) / 20,
      foulsAvg: 22 + (s % 8),
    },
    cards: {
      homeYellow: 2.1 + (s % 5) / 10,
      homeRed: 0.1,
      awayYellow: 2.4 + (s % 4) / 10,
      awayRed: 0.15,
    },
    corners: {
      homeFor: 5.8 + (s % 3),
      homeAgainst: 4.2,
      awayFor: 4.9,
      awayAgainst: 5.1,
    },
  };
}
