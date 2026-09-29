import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { fonts, layout, spacing, theme } from '@/styles/theme';

export type FootyColumn = { key: string; label: string; flex?: number };

type Props = {
  columns: FootyColumn[];
  rows: { id: string; cells: Record<string, string> }[];
  empty: string;
};

export default function FootyTable({ columns, rows, empty }: Props) {
  if (rows.length === 0) {
    return <Text style={styles.empty}>{empty}</Text>;
  }
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={Platform.OS === 'web'}>
      <View style={styles.table}>
        <View style={[styles.row, styles.head]}>
          {columns.map((col) => (
            <Text key={col.key} style={[styles.cell, styles.headText, { flex: col.flex ?? 1 }]}>
              {col.label}
            </Text>
          ))}
        </View>
        {rows.map((row, index) => (
          <View key={row.id} style={[styles.row, index % 2 === 1 && styles.alt]}>
            {columns.map((col) => (
              <Text key={col.key} style={[styles.cell, { flex: col.flex ?? 1 }]} numberOfLines={1}>
                {row.cells[col.key] ?? ''}
              </Text>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  table: {
    minWidth: 640,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    overflow: 'hidden',
    backgroundColor: theme.surface,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: layout.borderWidth,
    borderBottomColor: theme.border,
  },
  head: {
    backgroundColor: theme.surfaceMuted,
  },
  alt: {
    backgroundColor: '#F8FAFC',
  },
  cell: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: theme.textPrimary,
    paddingRight: spacing.sm,
    minWidth: 72,
  },
  headText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    color: theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  empty: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: theme.textMuted,
    paddingVertical: spacing.sm,
  },
});
