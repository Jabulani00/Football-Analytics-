export type ComplianceLevel = 'green' | 'yellow' | 'red';

export type TimePeriod = 'fulltime' | 'firsthalf' | 'secondhalf';
export type SplitType = 'overall' | 'home' | 'away';
export type RecencyWindow = 'all' | 'last10' | 'last8' | 'last6';

export type DataSource = {
  id: string;
  name: string;
  category: 'stats' | 'odds';
  dataCollected: string[];
  status: 'active' | 'planned' | 'syncing';
};

export type ProjectPhase = {
  number: 1 | 2 | 3 | 4 | 5;
  name: string;
  deliverables: string[];
  status: 'complete' | 'in_progress' | 'planned';
};

export type StatMetric = {
  key: string;
  label: string;
  value: number;
  compliance: ComplianceLevel;
};

export type StatsTableMeta = {
  id: string;
  name: string;
  group: 'base' | 'lastN';
  recency?: RecencyWindow;
  split: SplitType;
  period: TimePeriod;
  statCount: number;
};

export type TeamStatsRow = {
  team: string;
  metrics: StatMetric[];
};

export type StreamSignal = {
  id: string;
  name: string;
  fixture: string;
  kickoff: string;
  compliance: number;
  level: ComplianceLevel;
  stats: string[];
};

export type StrategyMatch = {
  id: string;
  strategy: string;
  fixture: string;
  date: string;
  kickoff: string;
  compliance: number;
  level: ComplianceLevel;
  motives: string[];
  odds?: { market: string; selection: string; price: number }[];
};

export type BetSlipLeg = {
  id: string;
  fixture: string;
  market: string;
  selection: string;
  odds: number;
  stake?: number;
};

export type OddsFusionRow = {
  id: string;
  fixture: string;
  statSignal: string;
  statCompliance: number;
  bookmaker: string;
  market: string;
  odds: number;
  edge: number;
};

export type AnalyticsTab =
  | 'overview'
  | 'tables'
  | 'predictions'
  | 'streams'
  | 'strategies'
  | 'odds'
  | 'betslip';
