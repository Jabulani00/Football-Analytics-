import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PROJECT_META, TABLE_CONTEXTS } from '@/constants/statsCatalogue';
import { fonts, layout, spacing, theme } from '@/styles/theme';

type TableContextPickerProps = {
  selected: string;
  onSelect: (id: string) => void;
};

export default function TableContextPicker({ selected, onSelect }: TableContextPickerProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={Platform.OS === 'web'}
      contentContainerStyle={styles.scroll}>
      <View style={styles.metaPill}>
        <Text style={styles.metaText}>{PROJECT_META.totalTables} tables</Text>
      </View>
      {TABLE_CONTEXTS.map((ctx) => {
        const active = ctx.id === selected;
        return (
          <Pressable
            key={ctx.id}
            onPress={() => onSelect(ctx.id)}
            style={[styles.chip, active && styles.chipActive, ctx.group === 'lastN' && styles.chipLastN]}>
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{ctx.label}</Text>
            {ctx.group === 'lastN' ? <Text style={styles.chipSub}>Last-N</Text> : null}
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
    alignItems: 'center',
  },
  metaPill: {
    backgroundColor: theme.accentPurple,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: layout.borderRadius,
    marginRight: spacing.xs,
  },
  metaText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: layout.borderRadius,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    alignItems: 'center',
  },
  chipActive: {
    borderColor: theme.accentGreen,
    backgroundColor: 'rgba(5, 150, 105, 0.08)',
  },
  chipLastN: {
    borderStyle: 'dashed',
  },
  chipText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: theme.textMuted,
  },
  chipTextActive: {
    color: theme.accentGreen,
    fontFamily: fonts.bodySemiBold,
  },
  chipSub: {
    fontFamily: fonts.body,
    fontSize: 9,
    color: theme.textFaint,
    marginTop: 2,
  },
});
