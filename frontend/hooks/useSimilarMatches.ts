import { useMemo } from 'react';

import { getFixtureEvidence } from '@/data/similarMatchesLoader';
import type { FixtureEvidence } from '@/types/data';

/** Vector similarity evidence for a fixture (pre-exported from ChromaDB pipeline). */
export function useSimilarMatches(fixtureId: string): FixtureEvidence | null {
  return useMemo(() => getFixtureEvidence(fixtureId), [fixtureId]);
}
