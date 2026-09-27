import { StyleSheet, Text, View } from 'react-native';

import type { ComplianceLevel } from '@/types/analytics';
import type { StatDisplayUnit } from '@/types/stats';
import { complianceColor } from '@/utils/compliance';
import { fonts, theme } from '@/styles/theme';

type StatValueCellProps = {
  value: number;
  level: ComplianceLevel;
  unit?: StatDisplayUnit;
};

function formatValue(value: number, unit: StatDisplayUnit = 'percent'): string {
  if (!Number.isFinite(value)) return '—';
  if (unit === 'goals' || unit === 'decimal') return value.toFixed(2);
  return `${Math.round(value)}%`;
}

export default function StatValueCell({ value, level, unit = 'percent' }: StatValueCellProps) {
  // Nothing measured: read it as absent, not as a yellow "moderate" signal.
  const measured = Number.isFinite(value);
  const color = measured ? complianceColor(level) : theme.textMuted;

  return (
    <View style={[styles.cell, { borderColor: measured ? color : theme.border }]}>
      {measured ? <View style={[styles.dot, { backgroundColor: color }]} /> : null}
      <Text style={[styles.value, { color }]}>{formatValue(value, unit)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  cell: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 6,
    borderWidth: 1,
    minWidth: 56,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  value: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
  },
});
