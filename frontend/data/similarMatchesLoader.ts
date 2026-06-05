import type { FixtureEvidence, SimilarMatchesExport } from '@/types/data';

let cache: SimilarMatchesExport | null = null;

function loadSimilarMatches(): SimilarMatchesExport {
  if (!cache) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cache = require('@/assets/data/similar_matches.json') as SimilarMatchesExport;
  }
  return cache;
}

export function getFixtureEvidence(fixtureId: string): FixtureEvidence | null {
  const data = loadSimilarMatches();
  return data.fixtures[fixtureId] ?? data.default ?? null;
}
