import { StyleSheet, Text, View } from 'react-native';

import ComplianceBadge from '@/components/analytics/ComplianceBadge';
import SectionLabel from '@/components/shared/SectionLabel';
import { getFixtureIntel } from '@/mock/leagueAnalyticsData';
import { fonts, layout, spacing, theme } from '@/styles/theme';

type FixtureIntelligenceProps = {
  fixtureId: string;
};

export default function FixtureIntelligence({ fixtureId }: FixtureIntelligenceProps) {
  const intel = getFixtureIntel(fixtureId);

  return (
    <View style={styles.container}>
      <View style={styles.pickCard}>
        <SectionLabel>Recommended pick</SectionLabel>
        <Text style={styles.pick}>{intel.pick}</Text>
        <View style={styles.pickMeta}>
          <Text style={styles.signal}>{intel.signal}</Text>
          <ComplianceBadge level={intel.level} value={intel.compliance} />
        </View>
      </View>

      <SectionLabel style={styles.section}>Motives for support</SectionLabel>
      {intel.motives.map((m) => (
        <View key={m} style={styles.motiveRow}>
          <Text style={styles.motiveBullet}>✓</Text>
          <Text style={styles.motiveText}>{m}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.surface,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    padding: spacing.lg,
    shadowColor: theme.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
  },
  pickCard: {
    alignItems: 'center',
    marginBottom: spacing.lg,
    paddingBottom: spacing.lg,
    borderBottomWidth: layout.borderWidth,
    borderBottomColor: theme.border,
  },
  pick: {
    fontFamily: fonts.display,
    fontSize: 24,
    color: theme.accentBlue,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  pickMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  signal: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: theme.textMuted,
  },
  section: {
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  motiveRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  motiveBullet: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: theme.accentGreen,
  },
  motiveText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: theme.textPrimary,
    flex: 1,
    lineHeight: 20,
  },
});
