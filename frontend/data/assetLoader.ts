/**
 * @deprecated Import from teamStatsLoader, similarMatchesLoader, or scalerLoader instead.
 * Kept for backwards compatibility.
 */
export { getTeamStatsTable } from '@/data/teamStatsLoader';
export { getFixtureEvidence } from '@/data/similarMatchesLoader';
export { getBttsScaler } from '@/data/scalerLoader';

export function loadAssets() {
  return {
    teamStats: null,
    fixtures: null,
    similarMatches: null,
    bttsScaler: null,
  };
}
