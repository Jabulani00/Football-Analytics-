import { StyleSheet, Text, View } from 'react-native';

import type { ComplianceLevel } from '@/types/analytics';
import { complianceColor, complianceLabel } from '@/utils/compliance';
import { fonts, layout, spacing } from '@/styles/theme';

type ComplianceBadgeProps = {
  level: ComplianceLevel;
  value?: number;
  compact?: boolean;
};

export default function ComplianceBadge({ level, value, compact }: ComplianceBadgeProps) {
  const color = complianceColor(level);

  return (
    <View style={[styles.badge, { borderColor: color }, compact && styles.compact]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.text, { color }]}>
        {value !== undefined ? `${value}%` : complianceLabel(level)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: layout.borderWidth,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: layout.borderRadius,
    alignSelf: 'center',
  },
  compact: {
    paddingHorizontal: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  text: {
    fontFamily: fonts.bodyMedium,
    fontSize: 10,
    letterSpacing: 0.3,
  },
});
