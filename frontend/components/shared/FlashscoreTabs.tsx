import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { fonts, layout, spacing, theme } from '@/styles/theme';

type FlashscoreTabsProps<T extends string> = {
  tabs: { id: T; label: string }[];
  active: T;
  onChange: (id: T) => void;
  highlighted?: boolean;
};

export default function FlashscoreTabs<T extends string>({
  tabs,
  active,
  onChange,
  highlighted = true,
}: FlashscoreTabsProps<T>) {
  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={Platform.OS === 'web'}
        contentContainerStyle={styles.scroll}>
        {tabs.map((tab) => {
          const isActive = highlighted && tab.id === active;
          return (
            <Pressable
              key={tab.id}
              onPress={() => onChange(tab.id)}
              style={[styles.tab, isActive && styles.tabActive]}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}>
              <Text style={[styles.label, isActive && styles.labelActive]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderBottomWidth: layout.borderWidth,
    borderBottomColor: theme.border,
    backgroundColor: theme.surface,
    width: '100%',
    marginBottom: spacing.sm,
  },
  scroll: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  tab: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginBottom: -1,
  },
  tabActive: {
    borderBottomColor: theme.live,
  },
  label: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: theme.textMuted,
  },
  labelActive: {
    color: theme.textPrimary,
    fontFamily: fonts.bodySemiBold,
  },
});
