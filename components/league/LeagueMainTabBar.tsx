import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Platform } from 'react-native';

import { fonts, layout, spacing, theme } from '@/styles/theme';

export type LeagueMainTabId =
  | 'results'
  | 'standings'
  | 'topScorers'
  | 'form'
  | 'overUnder'
  | 'htft'
  | 'odds'
  | 'intelligence';

const TABS: { id: LeagueMainTabId; label: string }[] = [
  { id: 'results', label: 'Results' },
  { id: 'standings', label: 'Standings' },
  { id: 'topScorers', label: 'Top Scorers' },
  { id: 'form', label: 'Form' },
  { id: 'overUnder', label: 'Over/Under' },
  { id: 'htft', label: 'HT/FT' },
  { id: 'odds', label: 'Odds' },
  { id: 'intelligence', label: 'Intelligence' },
];

type LeagueMainTabBarProps = {
  active: LeagueMainTabId;
  onChange: (tab: LeagueMainTabId) => void;
};

export default function LeagueMainTabBar({ active, onChange }: LeagueMainTabBarProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={Platform.OS === 'web'}
      contentContainerStyle={styles.scroll}>
      {TABS.map((tab) => {
        const isActive = tab.id === active;
        return (
          <Pressable
            key={tab.id}
            onPress={() => onChange(tab.id)}
            style={[styles.tab, isActive && styles.tabActive]}>
            <Text style={[styles.label, isActive && styles.labelActive]}>{tab.label}</Text>
            {tab.id === 'intelligence' ? (
              <View style={styles.dot} />
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    marginBottom: spacing.lg,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: layout.borderRadius,
    backgroundColor: theme.surfaceMuted,
    borderWidth: layout.borderWidth,
    borderColor: 'transparent',
  },
  tabActive: {
    backgroundColor: theme.surface,
    borderColor: theme.accentGreen,
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
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.accentGreen,
  },
});
