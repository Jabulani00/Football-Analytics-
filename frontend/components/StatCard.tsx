import { StyleSheet, Text, View } from 'react-native';

import ComplianceBadge from '@/components/analytics/ComplianceBadge';
import type { ComplianceLevel } from '@/types/analytics';
import { fonts, layout, spacing, theme } from '@/styles/theme';

type StatCardProps = {
  label: string;
  value: number;
  signal: ComplianceLevel | string;
  unit?: 'percent' | 'goals' | 'decimal';
  compact?: boolean;
};

function toLevel(signal: ComplianceLevel | string): ComplianceLevel {
  if (signal === 'green' || signal === 'yellow' || signal === 'red') return signal;
  return 'yellow';
}

export default function StatCard({ label, value, signal, unit = 'percent', compact }: StatCardProps) {
  const display =
    unit === 'percent' ? `${Math.round(value)}%` : unit === 'goals' ? value.toFixed(2) : value.toFixed(1);

  return (
    <View style={[styles.card, compact && styles.compact]}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{display}</Text>
      <ComplianceBadge level={toLevel(signal)} value={unit === 'percent' ? Math.round(value) : undefined} compact />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.surface,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    padding: spacing.md,
    alignItems: 'center',
    minWidth: 100,
    flex: 1,
  },
  compact: {
    padding: spacing.sm,
    minWidth: 80,
  },
  label: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: theme.textMuted,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  value: {
    fontFamily: fonts.display,
    fontSize: 20,
    color: theme.textPrimary,
    marginBottom: spacing.xs,
  },
});
