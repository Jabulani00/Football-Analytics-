import type {
  AnalyticsTab,
  BetSlipLeg,
  DataSource,
  OddsFusionRow,
  ProjectPhase,
  RecencyWindow,
  SplitType,
  StatsTableMeta,
  StreamSignal,
  StrategyMatch,
  TeamStatsRow,
  TimePeriod,
} from '@/types/analytics';
import { complianceFromPercent } from '@/utils/compliance';

export const ANALYTICS_TABS: { id: AnalyticsTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'tables', label: 'Stats Tables' },
  { id: 'predictions', label: 'Predictions' },
  { id: 'streams', label: 'Streams' },
  { id: 'strategies', label: 'Strategies' },
  { id: 'odds', label: 'Odds Fusion' },
  { id: 'betslip', label: 'Bet Slip' },
];

export const PROJECT_SUMMARY = {
  tableCount: 72,
  baseTables: 45,
  lastNTables: 27,
  metricsPerTable: 100,
  dataSources: ['Flashscore', 'Footy Stats', 'Odds Alert API', 'Sofascore', 'Hollywoodbets'],
};

export const DATA_SOURCES: DataSource[] = [
  {
    id: 'flashscore',
    name: 'Flashscore',
    category: 'stats',
    status: 'active',
    dataCollected: ['Results FT/HT/2H', 'Fixtures', 'H2H', 'Standings', 'Line-ups', 'Odds'],
  },
  {
    id: 'footystats',
    name: 'Footy Stats',
    category: 'stats',
    status: 'active',
    dataCollected: ['Referee', 'Cards', 'Corners', 'xG/xGA', 'Fixtures', 'Standings'],
  },
  {
    id: 'sofascore',
    name: 'Sofascore',
    category: 'stats',
    status: 'syncing',
    dataCollected: ['Complementary match data'],
  },
  {
    id: 'oddsalert',
    name: 'Odds Alert API',
    category: 'odds',
    status: 'active',
    dataCollected: ['Live odds alerts', 'Odds comparison'],
  },
  {
    id: 'hollywood',
    name: 'Hollywoodbets',
    category: 'odds',
    status: 'planned',
    dataCollected: ['Odds', 'Bet-slip generation'],
  },
];

export const PROJECT_PHASES: ProjectPhase[] = [
  {
    number: 1,
    name: 'Data Collection & Scraping',
    status: 'in_progress',
    deliverables: [
      'Flashscore script',
      'Footy Stats script',
      'Sofascore script',
      'Hollywoodbets script',
      'Odds Alert API',
    ],
  },
  {
    number: 2,
    name: 'Database & Stats Engine',
    status: 'in_progress',
    deliverables: ['72 tables (45 base + 27 last-N)', '100+ stats per table', 'Colour-coded outputs'],
  },
  {
    number: 3,
    name: 'Streams & Groupings',
    status: 'planned',
    deliverables: [
      'Streams formation',
      'Groupings formation',
      'Stats call-out framework',
      'Fixture support stats',
    ],
  },
  {
    number: 4,
    name: 'Strategy Engine',
    status: 'planned',
    deliverables: [
      'Strategy creation',
      'Fixture call-out by date/time',
      '% compliance',
      'Odds fusion',
      'Motives for support',
    ],
  },
  {
    number: 5,
    name: 'Dashboard & Bet Slip',
    status: 'planned',
    deliverables: [
      'Bet slip generator',
      'Interactive tracking dashboard',
      'Fixture coordination & sorting',
    ],
  },
];

const ORDINARY_STAT_LABELS = [
  'SC%',
  'Conc%',
  'SC/m',
  'Conc/m',
  'BTTS Yes',
  'BTTS No',
  'CS',
  'AVG',
  'FTS',
  'W',
  'D',
  'L',
  'Over 1.5',
  'Over 2.5',
  'Over 3.5',
  'Under 2.5',
  'Under 3.5',
  'Scored First',
  'Handicap',
  'Early Goals 1H',
];

function mockMetric(key: string, label: string, seed: number) {
  const value = 15 + ((seed * 17) % 70);
  return { key, label, value, compliance: complianceFromPercent(value) };
}

// All 36 stat-table variants: window (season/last-10/8/6) × period (FT/1H/2H) ×
// split (overall/home/away). Ids/periods/splits map to the live builder's table
// names via utils/statsTableAdapter.metaToLiveTableName.
const TABLE_PERIODS: { p: TimePeriod; label: string }[] = [
  { p: 'fulltime', label: 'FT' },
  { p: 'firsthalf', label: '1H' },
  { p: 'secondhalf', label: '2H' },
];
const TABLE_SPLITS: SplitType[] = ['overall', 'home', 'away'];
const TABLE_WINDOWS: { r?: RecencyWindow; label: string; group: StatsTableMeta['group'] }[] = [
  { r: undefined, label: 'Season', group: 'base' },
  { r: 'last10', label: 'Last 10', group: 'lastN' },
  { r: 'last8', label: 'Last 8', group: 'lastN' },
  { r: 'last6', label: 'Last 6', group: 'lastN' },
];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const STATS_TABLES: StatsTableMeta[] = TABLE_WINDOWS.flatMap((w) =>
  TABLE_PERIODS.flatMap((pr) =>
    TABLE_SPLITS.map<StatsTableMeta>((split) => ({
      id: `${w.r ?? 'season'}-${pr.label.toLowerCase()}-${split}`,
      name: `${w.label} · ${pr.label} ${cap(split)}`,
      group: w.group,
      recency: w.r,
      split,
      period: pr.p,
      statCount: 34,
    })),
  ),
);

export function getTeamStatsForTable(_tableId: string): TeamStatsRow[] {
  return [
    {
      team: 'Manchester City',
      metrics: ORDINARY_STAT_LABELS.slice(0, 12).map((label, i) =>
        mockMetric(`mci-${i}`, label, i + 1),
      ),
    },
    {
      team: 'Arsenal',
      metrics: ORDINARY_STAT_LABELS.slice(0, 12).map((label, i) =>
        mockMetric(`ars-${i}`, label, i + 3),
      ),
    },
    {
      team: 'Liverpool',
      metrics: ORDINARY_STAT_LABELS.slice(0, 12).map((label, i) =>
        mockMetric(`liv-${i}`, label, i + 5),
      ),
    },
  ];
}

export const STREAM_SIGNALS: StreamSignal[] = [
  {
    id: 's1',
    name: 'BTTS + Over 2.5 Stream',
    fixture: 'Arsenal vs Chelsea',
    kickoff: '15:00',
    compliance: 72,
    level: 'green',
    stats: ['BTTS Yes 68%', 'Over 2.5 71%', 'Scoring 1.5+ 65%'],
  },
  {
    id: 's2',
    name: 'Early Goals 1H',
    fixture: 'Man City vs Tottenham',
    kickoff: '17:30',
    compliance: 58,
    level: 'yellow',
    stats: ['Early Goals 1H 55%', 'Over 1.5 HT 52%'],
  },
  {
    id: 's3',
    name: 'Win to Nil — Away',
    fixture: 'Newcastle vs Brighton',
    kickoff: '20:00',
    compliance: 41,
    level: 'yellow',
    stats: ['CS 44%', 'FTS Opp 38%'],
  },
  {
    id: 's4',
    name: 'Under 2.5 Defensive',
    fixture: 'Everton vs Fulham',
    kickoff: '12:30',
    compliance: 28,
    level: 'red',
    stats: ['Under 2.5 31%', 'BTTS No 29%'],
  },
];

export const STRATEGY_MATCHES: StrategyMatch[] = [
  {
    id: 'st1',
    strategy: 'Home Dominance + Over 1.5',
    fixture: 'Arsenal vs Chelsea',
    date: '2026-05-21',
    kickoff: '15:00',
    compliance: 78,
    level: 'green',
    motives: ['Home PPG Green', 'Over 1.5 71% overall', 'Last 5 form WWDWW'],
    odds: [
      { market: 'Match Result', selection: 'Arsenal', price: 1.85 },
      { market: 'Goals', selection: 'Over 1.5', price: 1.22 },
    ],
  },
  {
    id: 'st2',
    strategy: 'BTTS Both Halves',
    fixture: 'Liverpool vs Man Utd',
    date: '2026-05-21',
    kickoff: '17:30',
    compliance: 64,
    level: 'yellow',
    motives: ['BTTS Both Halves 58%', 'Teams score both halves 61%'],
    odds: [{ market: 'BTTS', selection: 'Yes', price: 1.65 }],
  },
  {
    id: 'st3',
    strategy: '2nd Half Goals Surge',
    fixture: 'Tottenham vs West Ham',
    date: '2026-05-21',
    kickoff: '20:00',
    compliance: 55,
    level: 'yellow',
    motives: ['2H Over 1.5 AVG', 'Late Goals FT 70min'],
  },
];

export const ODDS_FUSION_ROWS: OddsFusionRow[] = [
  {
    id: 'o1',
    fixture: 'Arsenal vs Chelsea',
    statSignal: 'Over 2.5 — 71% compliance',
    statCompliance: 71,
    bookmaker: 'Hollywoodbets',
    market: 'Total Goals',
    odds: 1.75,
    edge: 4.2,
  },
  {
    id: 'o2',
    fixture: 'Man City vs Tottenham',
    statSignal: 'BTTS Yes — 68%',
    statCompliance: 68,
    bookmaker: 'Odds Alert',
    market: 'BTTS',
    odds: 1.62,
    edge: 2.8,
  },
  {
    id: 'o3',
    fixture: 'Newcastle vs Brighton',
    statSignal: 'Under 2.5 — 44%',
    statCompliance: 44,
    bookmaker: 'Hollywoodbets',
    market: 'Under 2.5',
    odds: 2.1,
    edge: -1.5,
  },
];

export const DEFAULT_BET_SLIP: BetSlipLeg[] = [
  {
    id: 'b1',
    fixture: 'Arsenal vs Chelsea',
    market: 'Total Goals',
    selection: 'Over 2.5',
    odds: 1.75,
    stake: 50,
  },
  {
    id: 'b2',
    fixture: 'Man City vs Tottenham',
    market: 'BTTS',
    selection: 'Yes',
    odds: 1.62,
    stake: 50,
  },
];

export const PPG_STATS_PREVIEW = [
  { scope: 'FT Overall', ppg: 2.1, green: 1.4, yellow: 0.5, red: 0.2 },
  { scope: 'FT Home', ppg: 2.4, green: 1.6, yellow: 0.6, red: 0.2 },
  { scope: 'FT Away', ppg: 1.8, green: 1.1, yellow: 0.5, red: 0.2 },
  { scope: '1H Overall', ppg: 1.0, green: 0.6, yellow: 0.3, red: 0.1 },
  { scope: '2H Overall', ppg: 1.1, green: 0.7, yellow: 0.3, red: 0.1 },
];
