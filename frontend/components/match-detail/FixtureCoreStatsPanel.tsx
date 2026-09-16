import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import StatsComparisonTable from '@/components/stats/StatsComparisonTable';
import SubTabBar from '@/components/shared/SubTabBar';
import { useFixtureFormAnalysis } from '@/hooks/useFixtureFormAnalysis';
import type { StandingRow } from '@/services/oddAlerts';
import {
  buildCoreFixtureStats,
  type CoreStatScope,
} from '@/utils/coreFixtureStats';
import type { StandingLike } from '@/utils/motivationEngine';
import { fonts, layout, spacing, theme } from '@/styles/theme';

type Props = {
  standings: StandingRow[];
  homeId: number | null | undefined;
  awayId: number | null | undefined;
  homeName: string;
  awayName: string;
  seasonProgress?: number | null;
  /** Column headers — default to team names (use T1 (Name) in Power dynamics). */
  homeLabel?: string;
  awayLabel?: string;
};

const SCOPES: { id: CoreStatScope; label: string }[] = [
  { id: 'overall', label: 'Overall' },
  { id: 'home', label: 'Home' },
  { id: 'away', label: 'Away' },
];

/**
 * Section 1 — live-calculated T1 vs T2 core stats (7).
 * Additive: sits above existing live match stats; never replaces them.
 */
export default function FixtureCoreStatsPanel({
  standings,
  homeId,
  awayId,
  homeName,
  awayName,
  seasonProgress,
  homeLabel,
  awayLabel,
}: Props) {
  const [scope, setScope] = useState<CoreStatScope>('overall');
  const standingLike: StandingLike[] = standings.map((r) => ({
    teamId: r.teamId,
    name: r.name,
    rank: r.rank,
    points: r.points,
    played: r.played,
    zone: r.zone,
  }));

  const { loading, error, homeResults, awayResults } = useFixtureFormAnalysis({
    homeId,
    awayId,
    standings: standingLike,
    seasonProgress,
    enabled: homeId != null || awayId != null,
  });

  const homeStanding = standings.find((r) => r.teamId === homeId) ?? null;
  const awayStanding = standings.find((r) => r.teamId === awayId) ?? null;

  const { rows, homeSample, awaySample, source } = buildCoreFixtureStats({
    homeStanding,
    awayStanding,
    homeResults,
    awayResults,
    scope,
  });

  if (rows.length === 0 && !loading) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Core comparison</Text>
        <Text style={styles.muted}>
          Season numbers appear once the league table (or recent results) is available for both
          sides.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Core comparison</Text>
      <Text style={styles.sub}>
        Live calculated · PPG, attack, defence, scoring, BTTS, clean sheets
      </Text>
      <SubTabBar tabs={SCOPES} active={scope} onChange={(id) => setScope(id as CoreStatScope)} />

      {loading && rows.length === 0 ? (
        <View style={styles.loading}>
          <ActivityIndicator color={theme.accentGreen} />
          <Text style={styles.muted}>Loading season form…</Text>
        </View>
      ) : (
        <>
          <StatsComparisonTable
            homeLabel={homeLabel ?? homeName}
            awayLabel={awayLabel ?? awayName}
            rows={rows}
          />
          <Text style={styles.foot}>
            {scope === 'overall' && source !== 'results'
              ? 'PPG / averages from the league table'
              : `From finished matches · ${homeLabel ?? homeName} n=${homeSample} · ${awayLabel ?? awayName} n=${awaySample}`}
            {error ? ` · ${error}` : ''}
            {' · '}
            green strong · yellow mid · red weak
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  card: {
    backgroundColor: theme.surface,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  title: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: theme.textPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  sub: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: theme.textMuted,
    marginBottom: spacing.sm,
  },
  loading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  muted: { fontFamily: fonts.body, fontSize: 12, color: theme.textMuted },
  foot: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: theme.textFaint,
    marginTop: spacing.xs,
    lineHeight: 14,
  },
});
