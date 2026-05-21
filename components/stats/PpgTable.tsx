import { StyleSheet, Text, View } from 'react-native';

import type { PpgReading } from '@/types/stats';
import { fonts, layout, spacing, theme } from '@/styles/theme';

type PpgTableProps = {
  rows: PpgReading[];
};

export default function PpgTable({ rows }: PpgTableProps) {
  return (
    <View style={styles.table}>
      <View style={styles.header}>
        <Text style={[styles.cell, styles.scopeCol]}>Scope</Text>
        <Text style={styles.cell}>PPG</Text>
        <Text style={[styles.cell, styles.green]}>Green</Text>
        <Text style={[styles.cell, styles.yellow]}>Yellow</Text>
        <Text style={[styles.cell, styles.red]}>Red</Text>
      </View>
      {rows.map((row) => (
        <View key={row.scope} style={styles.row}>
          <Text style={[styles.cell, styles.scopeCol, styles.scopeText]}>{row.scope}</Text>
          <Text style={[styles.cell, styles.ppg]}>{row.ppg.toFixed(2)}</Text>
          <Text style={[styles.cell, styles.green]}>{row.greenPpg.toFixed(2)}</Text>
          <Text style={[styles.cell, styles.yellow]}>{row.yellowPpg.toFixed(2)}</Text>
          <Text style={[styles.cell, styles.red]}>{row.redPpg.toFixed(2)}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  table: {
    width: '100%',
    backgroundColor: theme.surface,
    borderRadius: layout.borderRadius,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    backgroundColor: theme.surfaceMuted,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: layout.borderWidth,
    borderBottomColor: theme.border,
  },
  row: {
    flexDirection: 'row',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: layout.borderWidth,
    borderBottomColor: theme.border,
  },
  cell: {
    flex: 1,
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    color: theme.textMuted,
    textAlign: 'center',
  },
  scopeCol: {
    flex: 1.4,
    textAlign: 'left',
  },
  scopeText: {
    fontFamily: fonts.bodyMedium,
    color: theme.textPrimary,
    fontSize: 12,
  },
  ppg: {
    fontFamily: fonts.display,
    fontSize: 14,
    color: theme.textPrimary,
  },
  green: { color: theme.accentGreen },
  yellow: { color: theme.yellow },
  red: { color: theme.loss },
});
