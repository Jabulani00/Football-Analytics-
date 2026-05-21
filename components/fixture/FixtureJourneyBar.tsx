import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { MatchTabId } from '@/components/match/MatchTabBar';
import { fonts, layout, spacing, theme } from '@/styles/theme';

export type JourneyStep = 'stats' | 'fusion' | 'slip';

const STEPS: { id: JourneyStep; label: string; tab: MatchTabId }[] = [
  { id: 'stats', label: 'Our Stats', tab: 'stats' },
  { id: 'fusion', label: 'Odds Fusion', tab: 'stats' },
  { id: 'slip', label: 'Bet Slip', tab: 'stats' },
];

type FixtureJourneyBarProps = {
  active: JourneyStep;
  onStep: (step: JourneyStep, tab: MatchTabId) => void;
};

export default function FixtureJourneyBar({ active, onStep }: FixtureJourneyBarProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>BETTING JOURNEY</Text>
      <View style={styles.row}>
        {STEPS.map((step, i) => (
          <View key={step.id} style={styles.stepWrap}>
            <Pressable
              onPress={() => onStep(step.id, step.tab)}
              style={[styles.chip, active === step.id && styles.chipActive]}>
              <Text style={[styles.chipText, active === step.id && styles.chipTextActive]}>
                {i + 1}. {step.label}
              </Text>
            </Pressable>
            {i < STEPS.length - 1 ? <Text style={styles.arrow}>→</Text> : null}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    backgroundColor: theme.surfaceMuted,
    borderRadius: layout.borderRadius,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
  },
  label: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    color: theme.textMuted,
    letterSpacing: 1.2,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  stepWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
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
  chipText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: theme.textMuted,
  },
  chipTextActive: {
    color: theme.accentGreen,
    fontFamily: fonts.bodySemiBold,
  },
  arrow: {
    fontFamily: fonts.body,
    color: theme.textFaint,
    fontSize: 14,
  },
});
