import type { ComplianceLevel } from '@/types/analytics';

export type TableContextId = string;

export type StatDisplayUnit = 'percent' | 'goals' | 'decimal';

export type StatReading = {
  key: string;
  label: string;
  home: number;
  away: number;
  homeLevel: ComplianceLevel;
  awayLevel: ComplianceLevel;
  unit?: StatDisplayUnit;
};

export type PpgReading = {
  scope: string;
  ppg: number;
  greenPpg: number;
  yellowPpg: number;
  redPpg: number;
};

export type OddsFusionEntry = {
  market: string;
  selection: string;
  ourCompliance: number;
  bookOdds: number;
  impliedProb: number;
  edge: number;
  level: ComplianceLevel;
};

export type FixtureStatsBundle = {
  fixtureId: string;
  homeTeam: string;
  awayTeam: string;
  kickoff: string;
  date: string;
  tableLabel: string;
  ordinary: StatReading[];
  ppg: PpgReading[];
  fulltimeOnly: StatReading[];
  firstHalf: StatReading[];
  secondHalf: StatReading[];
  series: StatReading[];
  leagueAverages: StatReading[];
  rfsOrdinary: { label: string; team: string; failedStat: string }[];
  rfsSeries: { label: string; team: string; streakBroken: string }[];
  oddsFusion: OddsFusionEntry[];
  supportOverall: StatReading[];
  supportHome: StatReading[];
  supportAway: StatReading[];
  topPick: { market: string; selection: string; compliance: number; level: ComplianceLevel };
  motives: string[];
};
