import { useMemo } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import ComplianceBadge from '@/components/analytics/ComplianceBadge';
import type { Fixture } from '@/mock/fixturesData';
import { buildFixtureStats, getFixturePreviewStats } from '@/mock/statsEngine';
import type { StatReading } from '@/types/stats';
import { fonts, layout, spacing, theme } from '@/styles/theme';

type UpcomingFixtureCardProps = {
  fixture: Fixture;
  onPress: () => void;
};

function formatStatValue(row: StatReading, side: 'home' | 'away'): string {
  const v = side === 'home' ? row.home : row.away;
  if (row.unit === 'goals') return v.toFixed(2);
  return `${Math.round(v)}%`;
}

export default function UpcomingFixtureCard({ fixture, onPress }: UpcomingFixtureCardProps) {
  const stats = useMemo(() => buildFixtureStats(fixture, 'ft-overall'), [fixture]);
  const preview = useMemo(() => getFixturePreviewStats(fixture, 8), [fixture]);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed, hovered }) => [
        styles.card,
        (pressed || (Platform.OS === 'web' && hovered)) && styles.cardHover,
      ]}>
      <View style={styles.top}>
        <Text style={styles.kickoff}>{fixture.kickoff}</Text>
        <ComplianceBadge level={stats.topPick.level} value={stats.topPick.compliance} />
      </View>

      <Text style={styles.matchup}>
        {fixture.homeTeam.name} vs {fixture.awayTeam.name}
      </Text>

      <View style={styles.pickRow}>
        <Text style={styles.pickLabel}>OUR PICK</Text>
        <Text style={styles.pickValue}>
          {stats.topPick.selection} · {stats.topPick.market}
        </Text>
      </View>

      <View style={styles.previewGrid}>
        {preview.map((r) => (
          <View key={r.key} style={styles.previewCell}>
            <Text style={styles.previewStat}>{r.label}</Text>
            <View style={styles.previewVals}>
              <Text style={styles.homeVal}>H {formatStatValue(r, 'home')}</Text>
              <Text style={styles.awayVal}>A {formatStatValue(r, 'away')}</Text>
            </View>
          </View>
        ))}
      </View>

      <Text style={styles.cta}>View all 34+ stats · switch table context →</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.surface,
    borderRadius: layout.borderRadius,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
    width: '100%',
    shadowColor: theme.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : {}),
  },
  cardHover: {
    borderColor: theme.accentGreen,
  },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  kickoff: {
    fontFamily: fonts.display,
    fontSize: 20,
    color: theme.textPrimary,
  },
  matchup: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 16,
    color: theme.textPrimary,
    marginBottom: spacing.md,
  },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: layout.borderWidth,
    borderBottomColor: theme.border,
  },
  pickLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    color: theme.accentBlue,
    letterSpacing: 0.8,
  },
  pickValue: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: theme.accentGreen,
    flex: 1,
  },
  previewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  previewCell: {
    width: '48%',
    minWidth: 140,
    backgroundColor: theme.surfaceMuted,
    borderRadius: 8,
    padding: spacing.sm,
  },
  previewStat: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: theme.textMuted,
    marginBottom: 4,
  },
  previewVals: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  homeVal: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    color: theme.accentGreen,
  },
  awayVal: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    color: theme.accentBlue,
  },
  cta: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: theme.accentGreen,
    textAlign: 'right',
  },
});
