/** Stat definitions from Football_Analytics_Project_Spec.md */

export const ORDINARY_STATS = [
  { key: 'sc_pct', label: 'SC%', group: 'core' },
  { key: 'conc_pct', label: 'Conc%', group: 'core' },
  { key: 'sc_avg', label: 'SC/m (AVG)', group: 'core' },
  { key: 'conc_avg', label: 'Conc/m (AVG)', group: 'core' },
  { key: 'btts_yes', label: 'BTTS - Yes', group: 'goals' },
  { key: 'btts_no', label: 'BTTS - No', group: 'goals' },
  { key: 'cs', label: 'CS', group: 'results' },
  { key: 'avg', label: 'AVG', group: 'core' },
  { key: 'fts', label: 'FTS', group: 'results' },
  { key: 'w', label: 'W', group: 'results' },
  { key: 'd', label: 'D', group: 'results' },
  { key: 'l', label: 'L', group: 'results' },
  { key: 'over_15', label: 'Over 1.5', group: 'totals' },
  { key: 'over_25', label: 'Over 2.5', group: 'totals' },
  { key: 'over_35', label: 'Over 3.5', group: 'totals' },
  { key: 'over_45', label: 'Over 4.5', group: 'totals' },
  { key: 'under_15', label: 'Under 1.5', group: 'totals' },
  { key: 'under_25', label: 'Under 2.5', group: 'totals' },
  { key: 'under_35', label: 'Under 3.5', group: 'totals' },
  { key: 'under_45', label: 'Under 4.5', group: 'totals' },
  { key: 'over_05', label: 'Over 0.5', group: 'totals' },
  { key: 'under_05', label: 'Under 0.5', group: 'totals' },
  { key: 'score_05', label: 'Scoring 0.5+', group: 'scoring' },
  { key: 'conc_05', label: 'Conceding 0.5+', group: 'scoring' },
  { key: 'score_15', label: 'Scoring 1.5+', group: 'scoring' },
  { key: 'conc_15', label: 'Conceding 1.5+', group: 'scoring' },
  { key: 'score_25', label: 'Scoring 2.5+', group: 'scoring' },
  { key: 'conc_25', label: 'Conceding 2.5+', group: 'scoring' },
  { key: 'scored_first', label: 'Scored First', group: 'patterns' },
  { key: 'handicap', label: 'Handicap', group: 'patterns' },
  { key: 'early_1h', label: 'Early Goals 1H (20m)', group: 'timing' },
  { key: 'early_2h_sc', label: 'Early Goals Scored 2H (60m)', group: 'timing' },
  { key: 'early_conc', label: 'Early Goals Conceded', group: 'timing' },
  { key: 'late_goals', label: 'Late Goals', group: 'timing' },
] as const;

export const PPG_SCOPES = [
  'FT Overall',
  'FT Home',
  'FT Away',
  '1H Overall',
  '1H Home',
  '1H Away',
  '2H Overall',
  '2H Home',
  '2H Away',
] as const;

export const FULLTIME_ONLY_STATS = [
  'BTTS Both Halves',
  'Teams Score Both Halves',
  'BTTS & Over 2.5',
  'Conceded Both Halves',
  'Won Both Halves',
  'Win to Nil',
  'Lost to Nil',
  'Rescued Points',
  'Blown Points',
  'HT/FT Win/Win',
  'HT/FT Win/Draw',
  'HT/FT Win/Lose',
  'HT/FT Draw/Win',
  'HT/FT Draw/Draw',
  'HT/FT Lose/Win',
  'HT/FT Lose/Draw',
] as const;

export const FIRST_HALF_STATS = ['0-0 at 1H', 'HT Under 0.5 (AVG)', 'HT Over 1.5 (AVG)'] as const;

export const SECOND_HALF_STATS = ['0-0 at 2H', '2H Under 0.5 (AVG)', '2H Over 1.5 (AVG)'] as const;

export const SERIES_STATS = [
  'BTTS - Yes',
  'BTTS - No',
  'CS',
  'FTS',
  'W',
  'D',
  'L',
  'Over 0.5',
  'Over 1.5',
  'Over 2.5',
  'Over 3.5',
  'Under 1.5',
  'Under 3.5',
  'Scoring 1.5+',
  'Conceding 2.5+',
] as const;

export const LEAGUE_AVG_STATS = [
  'BTTS - Yes',
  'BTTS - No',
  'Over 2.5',
  'Over 3.5',
  'Under 2.5',
  'Under 3.5',
] as const;

export const HTFT_COMBOS = [
  'Win/Win',
  'Win/Draw',
  'Win/Lose',
  'Draw/Win',
  'Draw/Draw',
  'Draw/Lose',
  'Lose/Win',
  'Lose/Draw',
  'Lose/Lose',
] as const;

export const TABLE_CONTEXTS = [
  { id: 'ft-overall', label: 'FT · Overall', group: 'base' as const, period: 'fulltime' as const, split: 'overall' as const },
  { id: 'ft-home', label: 'FT · Home', group: 'base' as const, period: 'fulltime' as const, split: 'home' as const },
  { id: 'ft-away', label: 'FT · Away', group: 'base' as const, period: 'fulltime' as const, split: 'away' as const },
  { id: '1h-overall', label: '1H · Overall', group: 'base' as const, period: 'firsthalf' as const, split: 'overall' as const },
  { id: '1h-home', label: '1H · Home', group: 'base' as const, period: 'firsthalf' as const, split: 'home' as const },
  { id: '2h-overall', label: '2H · Overall', group: 'base' as const, period: 'secondhalf' as const, split: 'overall' as const },
  { id: '2h-away', label: '2H · Away', group: 'base' as const, period: 'secondhalf' as const, split: 'away' as const },
  { id: 'l10-ft-overall', label: 'Last 10 · FT', group: 'lastN' as const, period: 'fulltime' as const, split: 'overall' as const, recency: 'last10' as const },
  { id: 'l10-ft-home', label: 'Last 10 · Home', group: 'lastN' as const, period: 'fulltime' as const, split: 'home' as const, recency: 'last10' as const },
  { id: 'l8-ft-away', label: 'Last 8 · Away', group: 'lastN' as const, period: 'fulltime' as const, split: 'away' as const, recency: 'last8' as const },
  { id: 'l8-1h-overall', label: 'Last 8 · 1H', group: 'lastN' as const, period: 'firsthalf' as const, split: 'overall' as const, recency: 'last8' as const },
  { id: 'l6-ft-home', label: 'Last 6 · Home', group: 'lastN' as const, period: 'fulltime' as const, split: 'home' as const, recency: 'last6' as const },
  { id: 'l6-2h-overall', label: 'Last 6 · 2H', group: 'lastN' as const, period: 'secondhalf' as const, split: 'overall' as const, recency: 'last6' as const },
  { id: 'l6-1h-away', label: 'Last 6 · 1H Away', group: 'lastN' as const, period: 'firsthalf' as const, split: 'away' as const, recency: 'last6' as const },
] as const;

export const PROJECT_META = {
  totalTables: 72,
  baseTables: 45,
  lastNTables: 27,
  metricsPerTable: 100,
  ordinaryCount: 34,
};
