import { Platform, Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { fonts, layout, spacing, theme } from '@/styles/theme';

export type MatchTabId =
  | 'summary'
  | 'h2h'
  | 'lineups'
  | 'odds'
  | 'draw'
  | 'footy'
  | 'stats'
  | 'table';

const TABS: { id: MatchTabId; label: string }[] = [
  { id: 'summary', label: 'Summary' },
  { id: 'h2h', label: 'H2H' },
  { id: 'lineups', label: 'Lineups' },
  { id: 'odds', label: 'Odds' },
  { id: 'draw', label: 'Draw' },
  { id: 'footy', label: 'Footy Stats' },
  { id: 'stats', label: 'Our Stats' },
  { id: 'table', label: 'Table' },
];

type MatchTabBarProps = {
  activeTab: MatchTabId;
  onTabChange: (tab: MatchTabId) => void;
  isUpcoming?: boolean;
};

export default function MatchTabBar({ activeTab, onTabChange, isUpcoming }: MatchTabBarProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={Platform.OS === 'web'}
      style={styles.bar}
      contentContainerStyle={styles.scroll}>
      {TABS.map((tab) => {
        const isActive = activeTab === tab.id;
        const highlight = tab.id === 'stats' && isUpcoming;
        return (
          <Pressable
            key={tab.id}
            onPress={() => onTabChange(tab.id)}
            style={[styles.tab, isActive && styles.tabActive, highlight && !isActive && styles.tabHighlight]}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}>
            <Text style={[styles.label, isActive && styles.labelActive]}>
              {tab.label}
              {tab.id === 'stats' && isUpcoming ? ' ●' : ''}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: theme.surface,
    borderBottomWidth: layout.borderWidth,
    borderBottomColor: theme.border,
    width: '100%',
  },
  scroll: {
    paddingHorizontal: spacing.page,
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  tab: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: layout.borderRadius,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: theme.accentGreen,
    backgroundColor: 'rgba(5, 150, 105, 0.06)',
  },
  tabHighlight: {
    backgroundColor: 'rgba(5, 150, 105, 0.04)',
  },
  label: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: theme.textMuted,
  },
  labelActive: {
    color: theme.accentGreen,
    fontFamily: fonts.bodySemiBold,
  },
});
