import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { AnalyticsTab } from '@/types/analytics';
import { ANALYTICS_TABS } from '@/mock/analyticsData';
import { fonts, layout, spacing, theme } from '@/styles/theme';

type AnalyticsNavProps = {
  active: AnalyticsTab;
  onChange: (tab: AnalyticsTab) => void;
};

export default function AnalyticsNav({ active, onChange }: AnalyticsNavProps) {
  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={Platform.OS === 'web'}
        contentContainerStyle={styles.scroll}>
        {ANALYTICS_TABS.map((tab) => {
          const isActive = tab.id === active;
          return (
            <Pressable
              key={tab.id}
              onPress={() => onChange(tab.id)}
              style={({ pressed, hovered }) => [
                styles.tab,
                isActive && styles.tabActive,
                (pressed || (Platform.OS === 'web' && hovered)) && styles.tabHover,
              ]}>
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  tab: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    backgroundColor: theme.surface,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : {}),
  },
  tabActive: {
    borderColor: theme.accentGreen,
    backgroundColor: 'rgba(0, 229, 160, 0.08)',
  },
  tabHover: {
    borderColor: theme.textMuted,
  },
  tabText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: theme.textMuted,
    letterSpacing: 0.3,
  },
  tabTextActive: {
    color: theme.accentGreen,
  },
});
