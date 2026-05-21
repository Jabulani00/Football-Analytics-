import { Platform, Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { fonts, layout, spacing, theme } from '@/styles/theme';

type SubTabBarProps<T extends string> = {
  tabs: { id: T; label: string }[];
  active: T;
  onChange: (id: T) => void;
};

export default function SubTabBar<T extends string>({ tabs, active, onChange }: SubTabBarProps<T>) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={Platform.OS === 'web'} contentContainerStyle={styles.scroll}>
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <Pressable
            key={tab.id}
            onPress={() => onChange(tab.id)}
            style={[styles.chip, isActive && styles.chipActive]}>
            <Text style={[styles.text, isActive && styles.textActive]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    marginBottom: spacing.md,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: layout.borderRadius,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    backgroundColor: theme.surface,
  },
  chipActive: {
    borderColor: theme.accentGreen,
    backgroundColor: 'rgba(5, 150, 105, 0.08)',
  },
  text: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textMuted,
  },
  textActive: {
    color: theme.accentGreen,
    fontFamily: fonts.bodySemiBold,
  },
});
