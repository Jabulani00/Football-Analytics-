import { Platform, Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { fonts, layout, spacing, theme } from '@/styles/theme';

type SubTabBarProps<T extends string> = {
  tabs: { id: T; label: string }[];
  active: T;
  onChange: (id: T) => void;
  /** Tab ids that belong to the current item — shown bold green. */
  highlighted?: T | T[] | null;
};

function isHighlighted<T extends string>(id: T, highlighted?: T | T[] | null): boolean {
  if (highlighted == null) return false;
  return Array.isArray(highlighted) ? highlighted.includes(id) : highlighted === id;
}

export default function SubTabBar<T extends string>({
  tabs,
  active,
  onChange,
  highlighted,
}: SubTabBarProps<T>) {
  const usingHighlight = highlighted != null && (!Array.isArray(highlighted) || highlighted.length > 0);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={Platform.OS === 'web'} contentContainerStyle={styles.scroll}>
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        const marked = isHighlighted(tab.id, highlighted);
        return (
          <Pressable
            key={tab.id}
            onPress={() => onChange(tab.id)}
            style={[
              styles.chip,
              isActive && !marked && (usingHighlight ? styles.chipLooking : styles.chipActive),
              marked && styles.chipHighlight,
            ]}>
            <Text
              style={[
                styles.text,
                isActive && !marked && (usingHighlight ? styles.textLooking : styles.textActive),
                marked && styles.textHighlight,
              ]}>
              {tab.label}
            </Text>
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
  chipLooking: {
    borderColor: theme.borderStrong,
    backgroundColor: theme.surfaceMuted,
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
  textLooking: {
    color: theme.textPrimary,
    fontFamily: fonts.bodySemiBold,
  },
  chipHighlight: {
    borderColor: theme.accentGreen,
    backgroundColor: 'rgba(5, 150, 105, 0.14)',
  },
  textHighlight: {
    color: theme.accentGreen,
    fontFamily: fonts.bodySemiBold,
    fontWeight: '700',
  },
});
