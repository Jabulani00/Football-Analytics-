import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import type { CompetitionGroup, Competition, FixtureKind, Gender } from '@/services/oddAlerts';

export type StatusFilter = 'all' | 'live' | 'ft' | 'ns';

/** Which view the main panel shows on the Clubs side. */
export type PanelMode = 'scores' | 'standings';

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

  // --- Country -> league/cup -> season standings browser (Clubs side) ---
  panelMode: PanelMode;
  setPanelMode: (m: PanelMode) => void;
  /** Country accordion currently expanded in the sidebar. */
  expandedCountryId: number | null;
  setExpandedCountryId: (id: number | null) => void;
  /** Competition selected for the standings panel. */
  selectedCompetition: Competition | null;
  setSelectedCompetition: (c: Competition | null) => void;
  /** Season chosen for the standings panel (defaults to the current season). */
  selectedSeasonId: number | null;
  setSelectedSeasonId: (id: number | null) => void;
  /** Opens a competition's standings (current season) and switches the panel. */
  openStandings: (competition: Competition) => void;
};

const ScoresFilterContext = createContext<ScoresFilterContextValue | null>(null);

export function ScoresFilterProvider({ children }: { children: ReactNode }) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ft');
  const [gender, setGender] = useState<Gender>('men');
  const [kind, setKind] = useState<FixtureKind>('club');
  const [competitionId, setCompetitionId] = useState<number | null>(null);
  const [competitions, setCompetitions] = useState<CompetitionGroup[]>([]);
  const [panelMode, setPanelMode] = useState<PanelMode>('scores');
  const [expandedCountryId, setExpandedCountryId] = useState<number | null>(null);
  const [selectedCompetition, setSelectedCompetition] = useState<Competition | null>(null);
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(null);

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
      panelMode,
      setPanelMode,
      expandedCountryId,
      setExpandedCountryId,
      selectedCompetition,
      setSelectedCompetition,
      selectedSeasonId,
      setSelectedSeasonId,
      openStandings: (competition: Competition) => {
        setSelectedCompetition(competition);
        setSelectedSeasonId(competition.currentSeason ?? competition.seasons[0]?.seasonId ?? null);
        setPanelMode('standings');
      },
    }),
    [
      statusFilter,
      gender,
      kind,
      competitionId,
      competitions,
      panelMode,
      expandedCountryId,
      selectedCompetition,
      selectedSeasonId,
    ],
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
