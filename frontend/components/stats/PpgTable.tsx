import { StyleSheet, Text, View } from 'react-native';

import type { PpgReading } from '@/types/stats';
import { complianceColor, complianceFromPpg, PPG_RULE_TEXT } from '@/utils/compliance';
import { fonts, layout, spacing, theme } from '@/styles/theme';

type PpgTableProps = {
  rows: PpgReading[];
};

/** Points per game, coloured on the PPG scale rather than by the column it sits in. */
function PpgCell({ value }: { value: number }) {
  return (
    <Text style={[styles.cell, styles.ppg, { color: complianceColor(complianceFromPpg(value)) }]}>
      {value.toFixed(2)}
    </Text>
  );
}

export default function PpgTable({ rows }: PpgTableProps) {
  return (
    <View>
      <View style={styles.table}>
        <View style={styles.header}>
          <Text style={[styles.cell, styles.scopeCol]}>Scope</Text>
          <Text style={styles.cell}>PPG</Text>
          <Text style={[styles.cell, styles.green]}>vs Green</Text>
          <Text style={[styles.cell, styles.yellow]}>vs Yellow</Text>
          <Text style={[styles.cell, styles.red]}>vs Red</Text>
        </View>
        {rows.map((row) => (
          <View key={row.scope} style={styles.row}>
            <Text style={[styles.cell, styles.scopeCol, styles.scopeText]}>{row.scope}</Text>
            <PpgCell value={row.ppg} />
            <PpgCell value={row.greenPpg} />
            <PpgCell value={row.yellowPpg} />
            <PpgCell value={row.redPpg} />
          </View>
        ))}
      </View>
      <Text style={styles.note}>
        Green / Yellow / Red name the opponent&apos;s third of the table, not the strength of
        the number. Each cell is points ÷ games against that third, so the PPG column is
        the average of the three — it is not their total. Number colour reads the PPG
        scale: {PPG_RULE_TEXT}.
      </Text>
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
  },
  green: { color: theme.accentGreen },
  yellow: { color: theme.yellow },
  red: { color: theme.loss },
  note: {
    fontFamily: fonts.body,
    fontSize: 10,
    lineHeight: 14,
    color: theme.textMuted,
    marginTop: spacing.xs,
  },
});
