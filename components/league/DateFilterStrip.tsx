import { Platform, Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { fonts, layout, spacing, theme } from '@/styles/theme';
import { buildDateStrip, formatDatePill, toDateKey } from '@/utils/dates';

type DateFilterStripProps = {
  selectedDate: string;
  onSelect: (dateKey: string) => void;
};

export default function DateFilterStrip({ selectedDate, onSelect }: DateFilterStripProps) {
  const days = buildDateStrip();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.strip}
      style={styles.scroll}>
      {days.map((date) => {
        const key = toDateKey(date);
        const active = key === selectedDate;
        return (
          <Pressable
            key={key}
            onPress={() => onSelect(key)}
            style={({ pressed, hovered }) => [
              styles.pill,
              active && styles.pillActive,
              (pressed || hovered) && styles.pillPressed,
            ]}>
            <Text style={[styles.pillText, active && styles.pillTextActive]}>
              {formatDatePill(date)}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    marginBottom: spacing.lg,
  },
  strip: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    backgroundColor: theme.surface,
    ...(Platform.OS === 'web' ? ({ transition: 'border-color 150ms ease' } as object) : {}),
  },
  pillActive: {
    borderColor: theme.accentGreen,
    backgroundColor: 'rgba(5, 150, 105, 0.08)',
  },
  pillPressed: {
    opacity: 0.9,
  },
  pillText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: theme.textMuted,
  },
  pillTextActive: {
    color: theme.textPrimary,
    fontFamily: fonts.bodySemiBold,
  },
});
