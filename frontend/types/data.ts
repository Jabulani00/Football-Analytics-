import type { ComplianceLevel } from '@/types/analytics';

export type SignalColour = ComplianceLevel;

export type TeamStatRow = {
  team_name: string;
  league_id: string;
  season: string;
  [key: string]: string | number;
};

export type TeamStatsExport = {
  meta: {
    tables: number;
    statsPerTable: number;
    exported_at?: string;
  };
  tables: Record<string, TeamStatRow[]>;
};

export type FixtureExport = {
  id: string;
  leagueId: string;
  date: string;
  kickoff: string;
  status: string;
  homeTeam: { name: string; shortName: string; score: number | null };
  awayTeam: { name: string; shortName: string; score: number | null };
};

export type FixturesExport = {
  meta: { exported_at?: string; count: number };
  fixtures: FixtureExport[];
};

export type SimilarMatchEntry = {
  home: string;
  away: string;
  score: string;
  btts: boolean;
  over25: boolean;
  similarity_score: number;
};

export type FixtureEvidence = {
  fixture: string;
  similar_matches: SimilarMatchEntry[];
  btts_hit_rate: number;
  over25_hit_rate: number;
};

export type SimilarMatchesExport = {
  meta: { exported_at?: string; method: string };
  fixtures: Record<string, FixtureEvidence>;
  default: FixtureEvidence;
};

export type ModelScaler = {
  feature_names: string[];
  mean: number[];
  std: number[];
  weights: number[];
  bias: number;
  market: string;
};
