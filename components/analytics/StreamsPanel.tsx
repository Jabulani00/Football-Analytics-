import { StyleSheet, Text, View } from 'react-native';

import ComplianceBadge from '@/components/analytics/ComplianceBadge';
import SectionLabel from '@/components/shared/SectionLabel';
import { STREAM_SIGNALS } from '@/mock/analyticsData';
import { fonts, layout, spacing, theme } from '@/styles/theme';

export default function StreamsPanel() {
  return (
    <View style={styles.container}>
      <Text style={styles.intro}>
        Phase 3 — Streams identify fixtures meeting statistical thresholds. Groupings derive
        from stream patterns for strategy build-up, risk exposure, and Odds Alert support.
      </Text>

      <View style={styles.flow}>
        {['Calling out', 'Comparing', 'Picking options', 'Strategy build-up', 'Verification'].map(
          (step, i) => (
            <View key={step} style={styles.flowItem}>
              {i > 0 ? <Text style={styles.flowArrow}>→</Text> : null}
              <View style={styles.flowStep}>
                <Text style={styles.flowText}>{step}</Text>
              </View>
            </View>
          ),
        )}
      </View>

      <SectionLabel style={styles.section}>Active Streams</SectionLabel>

      <View style={styles.list}>
        {STREAM_SIGNALS.map((stream) => (
          <View key={stream.id} style={styles.card}>
            <View style={styles.cardTop}>
              <Text style={styles.streamName}>{stream.name}</Text>
              <ComplianceBadge level={stream.level} value={stream.compliance} />
            </View>
            <Text style={styles.fixture}>{stream.fixture}</Text>
            <Text style={styles.kickoff}>Kickoff {stream.kickoff}</Text>
            <View style={styles.stats}>
              {stream.stats.map((s) => (
                <Text key={s} style={styles.statLine}>
                  {s}
                </Text>
              ))}
            </View>
          </View>
        ))}
      </View>

      <SectionLabel style={styles.section}>Support Stats Framework</SectionLabel>
      <View style={styles.supportGrid}>
        <SupportCard split="Overall" desc="Full-season baseline metrics" />
        <SupportCard split="Home" desc="Home-only split for fixture context" />
        <SupportCard split="Away" desc="Away-only split for travel form" />
      </View>
    </View>
  );
}

function SupportCard({ split, desc }: { split: string; desc: string }) {
  return (
    <View style={styles.supportCard}>
      <Text style={styles.supportSplit}>{split}</Text>
      <Text style={styles.supportDesc}>{desc}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
  },
  intro: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: theme.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 640,
    marginBottom: spacing.lg,
  },
  flow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xl,
    maxWidth: 900,
  },
  flowItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  flowArrow: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: theme.textFaint,
    marginHorizontal: spacing.xs,
  },
  flowStep: {
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: layout.borderRadius,
  },
  flowText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    color: theme.textPrimary,
  },
  section: {
    alignSelf: 'stretch',
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  list: {
    width: '100%',
    maxWidth: 720,
    gap: spacing.md,
  },
  card: {
    backgroundColor: theme.surface,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    padding: spacing.md,
    width: '100%',
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  streamName: {
    fontFamily: fonts.display,
    fontSize: 16,
    color: theme.textPrimary,
    flex: 1,
  },
  fixture: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: theme.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  kickoff: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textMuted,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  stats: {
    borderTopWidth: layout.borderWidth,
    borderTopColor: theme.border,
    paddingTop: spacing.sm,
    gap: 4,
  },
  statLine: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.accentGreen,
    textAlign: 'center',
  },
  supportGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.md,
    width: '100%',
    marginTop: spacing.md,
  },
  supportCard: {
    flex: 1,
    minWidth: 180,
    maxWidth: 240,
    backgroundColor: theme.surface,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    padding: spacing.md,
    alignItems: 'center',
  },
  supportSplit: {
    fontFamily: fonts.display,
    fontSize: 18,
    color: theme.accentGreen,
    marginBottom: spacing.xs,
  },
  supportDesc: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
});
