declare module '@/assets/data/team_stats.json' {
  import type { TeamStatsExport } from '@/types/data';
  const value: TeamStatsExport;
  export default value;
}

declare module '@/assets/data/fixtures.json' {
  import type { FixturesExport } from '@/types/data';
  const value: FixturesExport;
  export default value;
}

declare module '@/assets/data/similar_matches.json' {
  import type { SimilarMatchesExport } from '@/types/data';
  const value: SimilarMatchesExport;
  export default value;
}

declare module '@/assets/models/btts/scaler.json' {
  import type { ModelScaler } from '@/types/data';
  const value: ModelScaler;
  export default value;
}
