import { StyleSheet, Text, View } from 'react-native';

import ComplianceBadge from '@/components/analytics/ComplianceBadge';
import SectionLabel from '@/components/shared/SectionLabel';
import { STRATEGY_MATCHES } from '@/mock/analyticsData';
import { fonts, layout, spacing, theme } from '@/styles/theme';

export default function StrategiesPanel() {
  return (
    <View style={styles.container}>
      <Text style={styles.intro}>
        Phase 4 — Create strategies and call out fixtures matching criteria by date and time.
        Coordination sorts stats: Overall, Home, Away, kickoff, and forty-table overall stats.
      </Text>

      <View style={styles.sortBar}>
        <Text style={styles.sortLabel}>Sort by:</Text>
        {['Overall', 'Home', 'Away', 'Kickoff', 'Date'].map((s) => (
          <View key={s} style={styles.sortChip}>
            <Text style={styles.sortChipText}>{s}</Text>
          </View>
        ))}
      </View>

      <SectionLabel style={styles.section}>Today&apos;s Strategy Call-outs</SectionLabel>

      <View style={styles.list}>
        {STRATEGY_MATCHES.map((match) => (
          <View key={match.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.strategyName}>{match.strategy}</Text>
              <ComplianceBadge level={match.level} value={match.compliance} />
            </View>

            <Text style={styles.fixture}>{match.fixture}</Text>
            <Text style={styles.datetime}>
              {match.date} · {match.kickoff}
            </Text>

            <View style={styles.motives}>
              <Text style={styles.motivesLabel}>MOTIVES FOR SUPPORT</Text>
              {match.motives.map((m) => (
                <Text key={m} style={styles.motive}>
                  · {m}
                </Text>
              ))}
            </View>

            {match.odds && match.odds.length > 0 ? (
              <View style={styles.oddsRow}>
                {match.odds.map((o) => (
                  <View key={`${o.market}-${o.selection}`} style={styles.oddsChip}>
                    <Text style={styles.oddsMarket}>{o.market}</Text>
                    <Text style={styles.oddsSelection}>
                      {o.selection} @ {o.price.toFixed(2)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ))}
      </View>
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
  sortBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  sortLabel: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textMuted,
  },
  sortChip: {
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: layout.borderRadius,
    backgroundColor: theme.surface,
  },
  sortChipText: {
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
    alignItems: 'center',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: spacing.sm,
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  strategyName: {
    fontFamily: fonts.display,
    fontSize: 16,
    color: theme.accentOrange,
    flex: 1,
  },
  fixture: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
    color: theme.textPrimary,
    marginBottom: spacing.xs,
  },
  datetime: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textMuted,
    marginBottom: spacing.md,
  },
  motives: {
    width: '100%',
    borderTopWidth: layout.borderWidth,
    borderTopColor: theme.border,
    paddingTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  motivesLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    color: theme.textMuted,
    letterSpacing: 1,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  motive: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textPrimary,
    textAlign: 'center',
    lineHeight: 18,
  },
  oddsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  oddsChip: {
    borderWidth: layout.borderWidth,
    borderColor: theme.accentBlue,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: layout.borderRadius,
    alignItems: 'center',
  },
  oddsMarket: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: theme.textMuted,
  },
  oddsSelection: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: theme.accentBlue,
  },
});
