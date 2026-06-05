import { getFixtureById, getFixturesForLeague } from '@/mock/fixturesData';
import { buildFixtureStats } from '@/mock/statsEngine';
import type { ComplianceLevel } from '@/types/analytics';
import { complianceFromPercent } from '@/utils/compliance';

export type LeagueIntelSummary = {
  signalsToday: number;
  strategiesActive: number;
  avgCompliance: number;
  topPick: string;
  topMarket: string;
  topCompliance: number;
};

export type LeagueStatRow = {
  label: string;
  overall: number;
  home: number;
  away: number;
};

export type LeagueStream = {
  id: string;
  name: string;
  fixture: string;
  kickoff: string;
  compliance: number;
  level: ComplianceLevel;
};

export type LeagueStrategy = {
  id: string;
  name: string;
  fixture: string;
  kickoff: string;
  compliance: number;
  level: ComplianceLevel;
  market: string;
};

export type FixtureIntel = {
  signal: string;
  pick: string;
  compliance: number;
  level: ComplianceLevel;
  motives: string[];
};

const LEAGUE_INTEL: Record<
  string,
  {
    summary: LeagueIntelSummary;
    stats: LeagueStatRow[];
    streams: LeagueStream[];
    strategies: LeagueStrategy[];
  }
> = {
  spl: {
    summary: {
      signalsToday: 4,
      strategiesActive: 2,
      avgCompliance: 61,
      topPick: 'Celtic vs Rangers',
      topMarket: 'Over 2.5',
      topCompliance: 74,
    },
    stats: [
      { label: 'BTTS Yes', overall: 58, home: 62, away: 54 },
      { label: 'Over 2.5', overall: 52, home: 61, away: 43 },
      { label: 'Scored First', overall: 55, home: 58, away: 51 },
    ],
    streams: [
      { id: 'spl-s1', name: 'Old Firm Goals', fixture: 'Celtic vs Rangers', kickoff: '15:00', compliance: 74, level: 'green' },
      { id: 'spl-s2', name: 'Home Win Stream', fixture: 'Hibernian vs Kilmarnock', kickoff: '15:00', compliance: 58, level: 'yellow' },
    ],
    strategies: [
      { id: 'spl-st1', name: 'High-Scoring Derby', fixture: 'Celtic vs Rangers', kickoff: '15:00', compliance: 74, level: 'green', market: 'Over 2.5' },
      { id: 'spl-st2', name: 'Home Control', fixture: 'St Mirren vs Motherwell', kickoff: '17:30', compliance: 52, level: 'yellow', market: 'Double Chance 1X' },
    ],
  },
  epl: {
    summary: {
      signalsToday: 8,
      strategiesActive: 4,
      avgCompliance: 68,
      topPick: 'Arsenal vs Chelsea',
      topMarket: 'BTTS Yes',
      topCompliance: 78,
    },
    stats: [
      { label: 'BTTS Yes', overall: 64, home: 68, away: 60 },
      { label: 'Over 2.5', overall: 61, home: 65, away: 57 },
      { label: 'Over 1.5 HT', overall: 48, home: 52, away: 44 },
    ],
    streams: [
      { id: 'epl-s1', name: 'Big Six BTTS', fixture: 'Arsenal vs Chelsea', kickoff: '12:30', compliance: 78, level: 'green' },
      { id: 'epl-s2', name: 'Title Race Goals', fixture: 'Liverpool vs Man City', kickoff: '15:00', compliance: 71, level: 'green' },
      { id: 'epl-s3', name: 'Underdog Resist', fixture: 'Everton vs Nottm Forest', kickoff: '20:00', compliance: 44, level: 'yellow' },
    ],
    strategies: [
      { id: 'epl-st1', name: 'London Derby BTTS', fixture: 'Arsenal vs Chelsea', kickoff: '12:30', compliance: 78, level: 'green', market: 'BTTS Yes' },
      { id: 'epl-st2', name: 'Top Clash Over 2.5', fixture: 'Liverpool vs Man City', kickoff: '15:00', compliance: 71, level: 'green', market: 'Over 2.5' },
      { id: 'epl-st3', name: 'Home Edge', fixture: 'Newcastle vs Aston Villa', kickoff: '15:00', compliance: 63, level: 'yellow', market: 'Home Win' },
    ],
  },
  laliga: {
    summary: {
      signalsToday: 3,
      strategiesActive: 2,
      avgCompliance: 65,
      topPick: 'Real Madrid vs Barcelona',
      topMarket: 'BTTS Yes',
      topCompliance: 76,
    },
    stats: [
      { label: 'BTTS Yes', overall: 59, home: 63, away: 55 },
      { label: 'Over 2.5', overall: 57, home: 60, away: 54 },
      { label: 'Late Goals FT', overall: 51, home: 54, away: 48 },
    ],
    streams: [
      { id: 'laliga-s1', name: 'El Clásico Goals', fixture: 'Real Madrid vs Barcelona', kickoff: '13:00', compliance: 76, level: 'green' },
      { id: 'laliga-s2', name: 'Madrid Clean Sheet', fixture: 'Atlético vs Sevilla', kickoff: '15:15', compliance: 55, level: 'yellow' },
    ],
    strategies: [
      { id: 'laliga-st1', name: 'Clásico BTTS', fixture: 'Real Madrid vs Barcelona', kickoff: '13:00', compliance: 76, level: 'green', market: 'BTTS Yes' },
      { id: 'laliga-st2', name: 'Basque Derby Under', fixture: 'Athletic vs Betis', kickoff: '20:00', compliance: 49, level: 'yellow', market: 'Under 3.5' },
    ],
  },
  bundesliga: {
    summary: {
      signalsToday: 6,
      strategiesActive: 3,
      avgCompliance: 70,
      topPick: 'Bayern vs Dortmund',
      topMarket: 'Over 2.5',
      topCompliance: 82,
    },
    stats: [
      { label: 'Over 2.5', overall: 72, home: 76, away: 68 },
      { label: 'BTTS Yes', overall: 66, home: 70, away: 62 },
      { label: 'Early Goals 1H', overall: 54, home: 58, away: 50 },
    ],
    streams: [
      { id: 'bund-s1', name: 'Der Klassiker Over', fixture: 'Bayern vs Dortmund', kickoff: '14:30', compliance: 82, level: 'green' },
      { id: 'bund-s2', name: 'Leipzig-Leverkusen BTTS', fixture: 'RB Leipzig vs Leverkusen', kickoff: '14:30', compliance: 67, level: 'green' },
    ],
    strategies: [
      { id: 'bund-st1', name: 'Klassiker Over 2.5', fixture: 'Bayern vs Dortmund', kickoff: '14:30', compliance: 82, level: 'green', market: 'Over 2.5' },
      { id: 'bund-st2', name: 'Frankfurt Home Win', fixture: 'Frankfurt vs Stuttgart', kickoff: '14:30', compliance: 61, level: 'yellow', market: 'Home Win' },
    ],
  },
  seriea: {
    summary: {
      signalsToday: 5,
      strategiesActive: 3,
      avgCompliance: 64,
      topPick: 'Inter vs AC Milan',
      topMarket: 'Over 1.5',
      topCompliance: 75,
    },
    stats: [
      { label: 'Under 2.5', overall: 48, home: 45, away: 51 },
      { label: 'BTTS Yes', overall: 52, home: 55, away: 49 },
      { label: 'Win to Nil', overall: 38, home: 42, away: 34 },
    ],
    streams: [
      { id: 'seriea-s1', name: 'Derby della Madonnina', fixture: 'Inter vs AC Milan', kickoff: '14:00', compliance: 75, level: 'green' },
      { id: 'seriea-s2', name: 'Juve Control', fixture: 'Juventus vs Napoli', kickoff: '17:00', compliance: 58, level: 'yellow' },
    ],
    strategies: [
      { id: 'seriea-st1', name: 'Milan Derby Over 1.5', fixture: 'Inter vs AC Milan', kickoff: '14:00', compliance: 75, level: 'green', market: 'Over 1.5' },
      { id: 'seriea-st2', name: 'Roma-Lazio BTTS', fixture: 'Roma vs Lazio', kickoff: '17:00', compliance: 54, level: 'yellow', market: 'BTTS Yes' },
    ],
  },
  ligue1: {
    summary: {
      signalsToday: 4,
      strategiesActive: 2,
      avgCompliance: 62,
      topPick: 'PSG vs Marseille',
      topMarket: 'Home Win',
      topCompliance: 79,
    },
    stats: [
      { label: 'Home Win', overall: 55, home: 62, away: 48 },
      { label: 'Over 2.5', overall: 54, home: 58, away: 50 },
      { label: 'BTTS Yes', overall: 51, home: 53, away: 49 },
    ],
    streams: [
      { id: 'ligue1-s1', name: 'Le Classique', fixture: 'PSG vs Marseille', kickoff: '16:00', compliance: 79, level: 'green' },
      { id: 'ligue1-s2', name: 'Monaco-Lyon Goals', fixture: 'Monaco vs Lyon', kickoff: '18:00', compliance: 56, level: 'yellow' },
    ],
    strategies: [
      { id: 'ligue1-st1', name: 'PSG Dominance', fixture: 'PSG vs Marseille', kickoff: '16:00', compliance: 79, level: 'green', market: 'Home Win' },
      { id: 'ligue1-st2', name: 'Riviera BTTS', fixture: 'Monaco vs Lyon', kickoff: '18:00', compliance: 56, level: 'yellow', market: 'BTTS Yes' },
    ],
  },
  eredivisie: {
    summary: {
      signalsToday: 3,
      strategiesActive: 2,
      avgCompliance: 66,
      topPick: 'PSV vs Ajax',
      topMarket: 'Over 2.5',
      topCompliance: 73,
    },
    stats: [
      { label: 'Over 2.5', overall: 68, home: 72, away: 64 },
      { label: 'BTTS Yes', overall: 61, home: 65, away: 57 },
      { label: 'Over 1.5 HT', overall: 50, home: 53, away: 47 },
    ],
    streams: [
      { id: 'ere-s1', name: 'De Topper', fixture: 'PSV vs Ajax', kickoff: '16:45', compliance: 73, level: 'green' },
      { id: 'ere-s2', name: 'Feyenoord Firepower', fixture: 'Feyenoord vs AZ', kickoff: '19:00', compliance: 68, level: 'green' },
    ],
    strategies: [
      { id: 'ere-st1', name: 'Topper Over 2.5', fixture: 'PSV vs Ajax', kickoff: '16:45', compliance: 73, level: 'green', market: 'Over 2.5' },
      { id: 'ere-st2', name: 'Feyenoord Win', fixture: 'Feyenoord vs AZ', kickoff: '19:00', compliance: 68, level: 'green', market: 'Home Win' },
    ],
  },
  ucl: {
    summary: {
      signalsToday: 4,
      strategiesActive: 2,
      avgCompliance: 71,
      topPick: 'Real Madrid vs Man City',
      topMarket: 'Over 1.5',
      topCompliance: 77,
    },
    stats: [
      { label: 'Over 1.5', overall: 72, home: 74, away: 70 },
      { label: 'BTTS Yes', overall: 58, home: 60, away: 56 },
      { label: 'Late Goals FT', overall: 55, home: 57, away: 53 },
    ],
    streams: [
      { id: 'ucl-s1', name: 'Knockout Goals', fixture: 'Real Madrid vs Man City', kickoff: '20:00', compliance: 77, level: 'green' },
      { id: 'ucl-s2', name: 'Bayern-Arsenal Drama', fixture: 'Bayern vs Arsenal', kickoff: '20:00', compliance: 69, level: 'green' },
    ],
    strategies: [
      { id: 'ucl-st1', name: 'Knockout Over 1.5', fixture: 'Real Madrid vs Man City', kickoff: '20:00', compliance: 77, level: 'green', market: 'Over 1.5' },
      { id: 'ucl-st2', name: 'Quarter-Final BTTS', fixture: 'Barcelona vs Inter', kickoff: '20:00', compliance: 65, level: 'yellow', market: 'BTTS Yes' },
    ],
  },
};

function buildDynamicLeagueIntel(leagueId: string) {
  const fixtures = getFixturesForLeague(leagueId).filter((f) => f.status === 'NS' || f.status === 'LIVE');
  const streams = fixtures.slice(0, 4).map((f, i) => {
    const stats = buildFixtureStats(f, 'ft-overall');
    const compliance = stats.topPick.compliance;
    return {
      id: `${leagueId}-dyn-s${i}`,
      name: `${stats.topPick.market} Stream`,
      fixture: `${f.homeTeam.name} vs ${f.awayTeam.name}`,
      kickoff: f.kickoff,
      compliance,
      level: complianceFromPercent(compliance),
    };
  });
  const strategies = fixtures.slice(0, 3).map((f, i) => {
    const stats = buildFixtureStats(f, 'ft-overall');
    const compliance = stats.topPick.compliance;
    return {
      id: `${leagueId}-dyn-st${i}`,
      name: stats.topPick.selection,
      fixture: `${f.homeTeam.name} vs ${f.awayTeam.name}`,
      kickoff: f.kickoff,
      compliance,
      level: complianceFromPercent(compliance),
      market: stats.topPick.market,
    };
  });
  const top = fixtures[0];
  const topStats = top ? buildFixtureStats(top, 'ft-overall') : null;
  const avg =
    streams.length > 0
      ? Math.round(streams.reduce((a, s) => a + s.compliance, 0) / streams.length)
      : 60;

  return {
    summary: {
      signalsToday: fixtures.length,
      strategiesActive: strategies.length,
      avgCompliance: avg,
      topPick: top ? `${top.homeTeam.name} vs ${top.awayTeam.name}` : '—',
      topMarket: topStats?.topPick.market ?? 'Over 2.5',
      topCompliance: topStats?.topPick.compliance ?? 60,
    },
    stats: [
      { label: 'BTTS Yes', overall: 55 + (avg % 12), home: 58 + (avg % 8), away: 52 + (avg % 10) },
      { label: 'Over 2.5', overall: 52 + (avg % 14), home: 56 + (avg % 9), away: 48 + (avg % 11) },
      { label: 'Scored First', overall: 50 + (avg % 10), home: 54 + (avg % 7), away: 46 + (avg % 9) },
    ],
    streams,
    strategies,
  };
}

export function getLeagueIntel(leagueId: string) {
  return LEAGUE_INTEL[leagueId] ?? buildDynamicLeagueIntel(leagueId);
}

export function getLeagueIntelSummary(leagueId: string): LeagueIntelSummary {
  return getLeagueIntel(leagueId).summary;
}

const DEFAULT_FIXTURE_INTEL: FixtureIntel = {
  signal: 'Over 2.5',
  pick: 'Over 2.5',
  compliance: 55,
  level: 'yellow',
  motives: ['Stats unavailable for this fixture'],
};

export function getFixtureIntel(fixtureId: string): FixtureIntel {
  const fixture = getFixtureById(fixtureId);
  if (!fixture) {
    return DEFAULT_FIXTURE_INTEL;
  }

  try {
    const stats = buildFixtureStats(fixture, 'ft-overall');
    const pick = stats.topPick?.selection ?? 'Over 2.5';
    const compliance = stats.topPick?.compliance ?? 55;
    const level = stats.topPick?.level ?? complianceFromPercent(compliance);
    const motives = Array.isArray(stats.motives) ? stats.motives.slice(0, 4) : [];

    return {
      signal: pick,
      pick,
      compliance,
      level,
      motives: motives.length > 0 ? motives : [`${pick} — ${compliance}% compliance (ft-overall)`],
    };
  } catch {
    return DEFAULT_FIXTURE_INTEL;
  }
}
