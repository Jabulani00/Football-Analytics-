import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import { getReferenceDateKey } from '@/utils/dates';

export type StatusFilter = 'all' | 'live' | 'ft' | 'ns';

type ScoresFilterContextValue = {
  selectedDate: string;
  setSelectedDate: (d: string) => void;
  statusFilter: StatusFilter;
  setStatusFilter: (f: StatusFilter) => void;
};

const ScoresFilterContext = createContext<ScoresFilterContextValue | null>(null);

export function ScoresFilterProvider({ children }: { children: ReactNode }) {
  const [selectedDate, setSelectedDate] = useState(getReferenceDateKey());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const value = useMemo(
    () => ({ selectedDate, setSelectedDate, statusFilter, setStatusFilter }),
    [selectedDate, statusFilter],
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
