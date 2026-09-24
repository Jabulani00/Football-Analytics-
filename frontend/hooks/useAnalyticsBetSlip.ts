import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

import type { BetSlipLeg } from '@/types/analytics';

const STORAGE_KEY = 'scoreline.analytics-bet-slip.v1';

function readSaved(): BetSlipLeg[] {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? (parsed as BetSlipLeg[]) : [];
  } catch {
    return [];
  }
}

/** Shared slip state used by Hollywood, Odds Fusion, Strategies and Bet Slip. */
export function useAnalyticsBetSlip() {
  const [legs, setLegs] = useState<BetSlipLeg[]>(readSaved);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(legs));
    } catch {
      // Private browsing / storage quotas must not break the slip itself.
    }
  }, [legs]);

  const addLeg = useCallback((leg: BetSlipLeg) => {
    setLegs((current) => [
      // Keep one selection per fixture to avoid correlated same-event legs.
      ...current.filter((item) => item.fixture !== leg.fixture),
      leg,
    ]);
  }, []);

  const addLegs = useCallback((next: BetSlipLeg[]) => {
    setLegs((current) => {
      const byFixture = new Map(current.map((leg) => [leg.fixture, leg]));
      for (const leg of next) byFixture.set(leg.fixture, leg);
      return [...byFixture.values()];
    });
  }, []);

  const removeLeg = useCallback((id: string) => {
    setLegs((current) => current.filter((leg) => leg.id !== id));
  }, []);

  const clear = useCallback(() => setLegs([]), []);

  return { legs, addLeg, addLegs, removeLeg, clear };
}
