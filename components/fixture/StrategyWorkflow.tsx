import { StyleSheet, Text, View } from 'react-native';

import SectionLabel from '@/components/shared/SectionLabel';
import { fonts, layout, spacing, theme } from '@/styles/theme';

const PHASES = [
  { step: 1, title: 'Calling Out', desc: 'Surface active stats ranked by compliance' },
  { step: 2, title: 'Comparing', desc: 'Compare across Overall / Home / Away' },
  { step: 3, title: 'Picking Options', desc: 'Shortlist viable markets' },
  { step: 4, title: 'Strategy Build-Up', desc: 'Combine stats into pre-built strategies' },
  { step: 5, title: 'Fixture Verification', desc: 'Confirm kickoff date & time qualify' },
  { step: 6, title: 'Risk Exposure', desc: 'Measure selection risk profile' },
  { step: 7, title: 'Risk Elimination', desc: 'Drop below-threshold picks' },
];

type StrategyWorkflowProps = {
  activeStep?: number;
};

export default function StrategyWorkflow({ activeStep = 4 }: StrategyWorkflowProps) {
  return (
    <View style={styles.wrap}>
      <SectionLabel>STRATEGY WORKFLOW (PHASES 1–7)</SectionLabel>
      <Text style={styles.sub}>
        Stats callout → compare → pick → build → verify → risk → eliminate — then odds fusion
      </Text>
      {PHASES.map((p) => {
        const done = p.step < activeStep;
        const current = p.step === activeStep;
        return (
          <View
            key={p.step}
            style={[styles.phase, current && styles.phaseCurrent, done && styles.phaseDone]}>
            <View style={[styles.badge, current && styles.badgeCurrent, done && styles.badgeDone]}>
              <Text style={styles.badgeText}>{done ? '✓' : p.step}</Text>
            </View>
            <View style={styles.body}>
              <Text style={[styles.title, current && styles.titleCurrent]}>{p.title}</Text>
              <Text style={styles.desc}>{p.desc}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    backgroundColor: theme.surface,
    borderRadius: layout.borderRadius,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  sub: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textMuted,
    marginBottom: spacing.md,
    marginTop: spacing.xs,
  },
  phase: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    opacity: 0.65,
  },
  phaseDone: { opacity: 0.85 },
  phaseCurrent: {
    opacity: 1,
    backgroundColor: theme.surfaceMuted,
    marginHorizontal: -spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: 8,
  },
  badge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeCurrent: { backgroundColor: theme.accentGreen },
  badgeDone: { backgroundColor: theme.accentGreen },
  badgeText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: '#fff',
  },
  body: { flex: 1 },
  title: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: theme.textPrimary,
  },
  titleCurrent: { color: theme.accentGreen },
  desc: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: theme.textMuted,
    marginTop: 2,
  },
});
