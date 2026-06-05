import { Pressable, StyleSheet, Text, View } from 'react-native';

import { fonts, layout, spacing, theme } from '@/styles/theme';

export type LeagueTabId = 'fixtures' | 'intelligence';

const TABS: { id: LeagueTabId; label: string }[] = [
  { id: 'fixtures', label: 'Fixtures' },
  { id: 'intelligence', label: 'Intelligence' },
];

type LeagueTabBarProps = {
  activeTab: LeagueTabId;
  onTabChange: (tab: LeagueTabId) => void;
  signalCount?: number;
};

export default function LeagueTabBar({ activeTab, onTabChange, signalCount }: LeagueTabBarProps) {
  return (
    <View style={styles.container}>
      {TABS.map((tab) => {
        const isActive = activeTab === tab.id;
        const showBadge = tab.id === 'intelligence' && signalCount && signalCount > 0;
        return (
          <Pressable
            key={tab.id}
            onPress={() => onTabChange(tab.id)}
            style={[styles.tab, isActive && styles.tabActive]}>
            <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>{tab.label}</Text>
            {showBadge ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{signalCount}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: theme.surfaceMuted,
    borderRadius: layout.borderRadius,
    padding: spacing.xs,
    marginBottom: spacing.lg,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    borderRadius: layout.borderRadius - 2,
    gap: spacing.xs,
  },
  tabActive: {
    backgroundColor: theme.surface,
    shadowColor: theme.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 2,
  },
  tabLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    color: theme.textMuted,
  },
  tabLabelActive: {
    color: theme.accentGreen,
    fontFamily: fonts.bodySemiBold,
  },
  badge: {
    backgroundColor: theme.accentGreen,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    color: '#FFFFFF',
  },
});
