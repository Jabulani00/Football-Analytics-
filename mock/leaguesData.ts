import { getLeagueIntelSummary } from '@/mock/leagueAnalyticsData';

export type League = {
  id: string;
  name: string;
  country: string;
  flag: string;
  regionCode: string;
  liveCount: number;
  matchCount: number;
  signalsToday: number;
  topPick: string;
  topCompliance: number;
};

const BASE_LEAGUES = [
  {
    id: 'spl',
    name: 'Scottish Premiership',
    country: 'Scotland',
    flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
    regionCode: 'SC',
    liveCount: 1,
    matchCount: 6,
  },
  {
    id: 'epl',
    name: 'Premier League',
    country: 'England',
    flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    regionCode: 'EN',
    liveCount: 3,
    matchCount: 10,
  },
  {
    id: 'laliga',
    name: 'La Liga',
    country: 'Spain',
    flag: '🇪🇸',
    regionCode: 'ES',
    liveCount: 0,
    matchCount: 5,
  },
  {
    id: 'bundesliga',
    name: 'Bundesliga',
    country: 'Germany',
    flag: '🇩🇪',
    regionCode: 'DE',
    liveCount: 2,
    matchCount: 9,
  },
  {
    id: 'seriea',
    name: 'Serie A',
    country: 'Italy',
    flag: '🇮🇹',
    regionCode: 'IT',
    liveCount: 0,
    matchCount: 8,
  },
  {
    id: 'ligue1',
    name: 'Ligue 1',
    country: 'France',
    flag: '🇫🇷',
    regionCode: 'FR',
    liveCount: 1,
    matchCount: 7,
  },
  {
    id: 'eredivisie',
    name: 'Eredivisie',
    country: 'Netherlands',
    flag: '🇳🇱',
    regionCode: 'NL',
    liveCount: 0,
    matchCount: 5,
  },
  {
    id: 'ucl',
    name: 'UEFA Champions League',
    country: 'Europe',
    flag: '🇪🇺',
    regionCode: 'EU',
    liveCount: 0,
    matchCount: 4,
  },
] as const;

export const mockLeagues: League[] = BASE_LEAGUES.map((base) => {
  const intel = getLeagueIntelSummary(base.id);
  return {
    ...base,
    signalsToday: intel.signalsToday,
    topPick: intel.topPick,
    topCompliance: intel.topCompliance,
  };
});

export function getLeagueById(id: string): League | undefined {
  return mockLeagues.find((l) => l.id === id);
}
