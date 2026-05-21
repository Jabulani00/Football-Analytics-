import { StyleSheet, Text, View } from 'react-native';

import StatValueCell from '@/components/stats/StatValueCell';
import type { StatReading } from '@/types/stats';
import { fonts, layout, spacing, theme } from '@/styles/theme';

type StatsComparisonTableProps = {
  homeLabel: string;
  awayLabel: string;
  rows: StatReading[];
  compact?: boolean;
};

export default function StatsComparisonTable({
  homeLabel,
  awayLabel,
  rows,
  compact,
}: StatsComparisonTableProps) {
  return (
    <View style={styles.table}>
      <View style={styles.header}>
        <Text style={[styles.headCell, styles.teamCol]} numberOfLines={1}>
          {homeLabel}
        </Text>
        <Text style={[styles.headCell, styles.statCol]}>STAT</Text>
        <Text style={[styles.headCell, styles.teamCol]} numberOfLines={1}>
          {awayLabel}
        </Text>
      </View>
      {rows.map((row) => (
        <View key={row.key} style={[styles.row, compact && styles.rowCompact]}>
          <View style={styles.teamCol}>
              <StatValueCell value={row.home} level={row.homeLevel} unit={row.unit} />
          </View>
          <Text style={[styles.statCol, styles.statLabel]} numberOfLines={2}>
            {row.label}
          </Text>
          <View style={styles.teamCol}>
              <StatValueCell value={row.away} level={row.awayLevel} unit={row.unit} />
          </View>
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
    alignItems: 'center',
    backgroundColor: theme.surfaceMuted,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: layout.borderWidth,
    borderBottomColor: theme.border,
  },
  headCell: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    color: theme.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: layout.borderWidth,
    borderBottomColor: theme.border,
  },
  rowCompact: {
    paddingVertical: 6,
  },
  teamCol: {
    flex: 1,
    alignItems: 'center',
  },
  statCol: {
    flex: 1.2,
    textAlign: 'center',
    paddingHorizontal: spacing.xs,
  },
  statLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    color: theme.textPrimary,
    lineHeight: 14,
  },
});
