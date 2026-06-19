import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import type { CompetitionGroup, FixtureKind, Gender } from '@/services/oddAlerts';

export type StatusFilter = 'all' | 'live' | 'ft' | 'ns';

type ScoresFilterContextValue = {
  statusFilter: StatusFilter;
  setStatusFilter: (f: StatusFilter) => void;
  gender: Gender;
  setGender: (g: Gender) => void;
  kind: FixtureKind;
  setKind: (k: FixtureKind) => void;
  /** Competition the user drilled into from the sidebar, or null for all. */
  competitionId: number | null;
  setCompetitionId: (id: number | null) => void;
  /** Competition groups currently loaded in the feed (powers the sidebar). */
  competitions: CompetitionGroup[];
  setCompetitions: (groups: CompetitionGroup[]) => void;
};

const ScoresFilterContext = createContext<ScoresFilterContextValue | null>(null);

export function ScoresFilterProvider({ children }: { children: ReactNode }) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ft');
  const [gender, setGender] = useState<Gender>('men');
  const [kind, setKind] = useState<FixtureKind>('club');
  const [competitionId, setCompetitionId] = useState<number | null>(null);
  const [competitions, setCompetitions] = useState<CompetitionGroup[]>([]);

  const value = useMemo(
    () => ({
      statusFilter,
      setStatusFilter,
      gender,
      setGender,
      kind,
      setKind,
      competitionId,
      setCompetitionId,
      competitions,
      setCompetitions,
    }),
    [statusFilter, gender, kind, competitionId, competitions],
  );

  return <ScoresFilterContext.Provider value={value}>{children}</ScoresFilterContext.Provider>;
}

export function useScoresFilter() {
  const ctx = useContext(ScoresFilterContext);
  if (!ctx) {
    throw new Error('useScoresFilter must be used within ScoresFilterProvider');
  }
  return ctx;
}

export function useScoresFilterOptional() {
  return useContext(ScoresFilterContext);
}
