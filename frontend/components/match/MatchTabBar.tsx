import FlashscoreTabs from '@/components/shared/FlashscoreTabs';

export type MatchTabId = 'summary' | 'h2h' | 'lineups' | 'odds' | 'table' | 'stats';

const TABS: { id: MatchTabId; label: string }[] = [
  { id: 'summary', label: 'Summary' },
  { id: 'h2h', label: 'H2H' },
  { id: 'lineups', label: 'Lineups' },
  { id: 'odds', label: 'Odds' },
  { id: 'table', label: 'Table' },
  { id: 'stats', label: 'Stats' },
];

type MatchTabBarProps = {
  activeTab: MatchTabId;
  onTabChange: (tab: MatchTabId) => void;
};

export default function MatchTabBar({ activeTab, onTabChange }: MatchTabBarProps) {
  return <FlashscoreTabs tabs={TABS} active={activeTab} onChange={onTabChange} />;
}
