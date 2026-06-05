import FlashscoreTabs from '@/components/shared/FlashscoreTabs';

export type LeaguePrimaryTabId = 'results' | 'standings' | 'topScorers' | 'form';
export type LeagueSecondaryTabId = 'overUnder' | 'htft' | 'odds';
export type LeagueTabId = LeaguePrimaryTabId | LeagueSecondaryTabId;

export const LEAGUE_PRIMARY_TABS: { id: LeaguePrimaryTabId; label: string }[] = [
  { id: 'results', label: 'Results' },
  { id: 'standings', label: 'Standings' },
  { id: 'topScorers', label: 'Top Scorers' },
  { id: 'form', label: 'Form' },
];

export const LEAGUE_SECONDARY_TABS: { id: LeagueSecondaryTabId; label: string }[] = [
  { id: 'overUnder', label: 'Over/Under' },
  { id: 'htft', label: 'HT/FT' },
  { id: 'odds', label: 'Odds' },
];

type LeagueMainTabBarProps = {
  activeTab: LeagueTabId;
  onPrimaryChange: (tab: LeaguePrimaryTabId) => void;
  onSecondaryChange: (tab: LeagueSecondaryTabId) => void;
};

export function isPrimaryLeagueTab(tab: LeagueTabId): tab is LeaguePrimaryTabId {
  return LEAGUE_PRIMARY_TABS.some((t) => t.id === tab);
}

export default function LeagueMainTabBar({
  activeTab,
  onPrimaryChange,
  onSecondaryChange,
}: LeagueMainTabBarProps) {
  const primaryActive = isPrimaryLeagueTab(activeTab) ? activeTab : 'results';
  const secondaryActive = isPrimaryLeagueTab(activeTab) ? 'overUnder' : activeTab;

  return (
    <>
      <FlashscoreTabs
        tabs={LEAGUE_PRIMARY_TABS}
        active={primaryActive}
        onChange={onPrimaryChange}
        highlighted={isPrimaryLeagueTab(activeTab)}
      />
      <FlashscoreTabs
        tabs={LEAGUE_SECONDARY_TABS}
        active={secondaryActive as LeagueSecondaryTabId}
        onChange={onSecondaryChange}
        highlighted={!isPrimaryLeagueTab(activeTab)}
      />
    </>
  );
}
