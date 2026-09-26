import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import SubTabBar from '@/components/shared/SubTabBar';
import SeriesStreakStrip from '@/components/stats/SeriesStreakStrip';
import { useFixtureSeries } from '@/hooks/useFixtureSeries';
import {
  buildFixtureSeries,
  MIN_SERIES,
  type SeriesRow,
  type SeriesScope,
} from '@/utils/fixtureSeries';
import { fonts, layout, spacing, theme } from '@/styles/theme';

type Props = {
  homeId: number | null | undefined;
  awayId: number | null | undefined;
  homeName: string;
  awayName: string;
  competitionId: number | null | undefined;
  seasonId: number | null | undefined;
  seasonName: string | null | undefined;
  isCup?: boolean;
  /** This fixture's own id — excluded so runs describe form going into it. */
  fixtureId?: number | null;
  /** Row headers — default to team names. */
  homeLabel?: string;
  awayLabel?: string;
  /** Drop the heading when the host already labels the section (feed rows). */
  compact?: boolean;
};

const SCOPES: { id: SeriesScope; label: string }[] = [
  { id: 'overall', label: 'Overall' },
  { id: 'home', label: 'Home' },
  { id: 'away', label: 'Away' },
];

function StatCard({
  row,
  homeName,
  awayName,
}: {
  row: SeriesRow;
  homeName: string;
  awayName: string;
}) {
  const lead =
    row.home.active && row.away.active
      ? null
      : row.home.active
        ? homeName
        : row.away.active
          ? awayName
          : null;

  return (
    <View style={styles.statCard}>
      <View style={styles.statHead}>
        <Text style={styles.statLabel}>{row.label}</Text>
        {lead ? <Text style={styles.statLead}>{lead} only</Text> : null}
      </View>
      <SeriesStreakStrip teamName={homeName} series={row.home} />
      <SeriesStreakStrip teamName={awayName} series={row.away} />
    </View>
  );
}

/**
 * Spec §4.6 — the 29 Series stats for T1 vs T2, live-calculated from this
 * season's league results. Each stat shows the run game by game so you can see
 * how long it has held and which result ended the previous one.
 *
 * Runs describe form going INTO the fixture, so this fixture's own result is
 * excluded — otherwise a finished match would count itself in its own run.
 */
export default function FixtureSeriesPanel({
  homeId,
  awayId,
  homeName,
  awayName,
  competitionId,
  seasonId,
  seasonName,
  isCup,
  fixtureId,
  homeLabel,
  awayLabel,
  compact,
}: Props) {
  const [scope, setScope] = useState<SeriesScope>('overall');

  const { loading, error, homeResults, awayResults } = useFixtureSeries({
    homeId,
    awayId,
    competitionId,
    seasonId,
    seasonName,
    isCup,
    excludeFixtureId: fixtureId,
  });

  const { groups, homeSample, awaySample } = buildFixtureSeries({
    homeResults,
    awayResults,
    scope,
  });

  if (competitionId == null) {
    return null;
  }

  const home = homeLabel ?? homeName;
  const away = awayLabel ?? awayName;
  const seriesCount = groups.reduce((n, g) => n + g.rows.length, 0);

  return (
    <View style={styles.wrap}>
      {compact ? null : <Text style={styles.title}>Series</Text>}
      <Text style={styles.sub}>
        Form going into this fixture · {MIN_SERIES}+ games in a row · this competition, this season
      </Text>
      <SubTabBar tabs={SCOPES} active={scope} onChange={setScope} />

      {loading && seriesCount === 0 ? (
        <View style={styles.loading}>
          <ActivityIndicator color={theme.accentGreen} />
          <Text style={styles.muted}>Loading season results…</Text>
        </View>
      ) : seriesCount === 0 ? (
        <View style={styles.card}>
          <Text style={styles.muted}>
            No active series ({MIN_SERIES}+ games) for either side in this competition.
            {error ? ` ${error}` : ''}
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.swatch, styles.swatchRun]} />
              <Text style={styles.legendText}>in the run</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.swatch, styles.swatchBroke]} />
              <Text style={styles.legendText}>broke it</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.swatch, styles.swatchBefore]} />
              <Text style={styles.legendText}>earlier</Text>
            </View>
            <Text style={styles.legendText}>oldest ← → newest · score is team-first</Text>
          </View>

          {groups.map((group) => (
            <View key={group.id} style={styles.group}>
              <Text style={styles.groupTitle}>{group.label}</Text>
              {group.id === 'without' ? (
                <Text style={styles.groupSub}>
                  Games gone without reaching the stat — the run counts the misses
                </Text>
              ) : null}
              {group.rows.map((row) => (
                <StatCard key={row.key} row={row} homeName={home} awayName={away} />
              ))}
            </View>
          ))}

          <Text style={styles.foot}>
            {`${seriesCount} active series · from finished league matches · ${home} n=${homeSample} · ${away} n=${awaySample}`}
            {error ? ` · ${error}` : ''}
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
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  swatch: { width: 10, height: 10, borderRadius: 2, borderWidth: 1 },
  swatchRun: { borderColor: theme.accentGreen, backgroundColor: 'rgba(5, 150, 105, 0.18)' },
  swatchBroke: { borderColor: theme.loss, backgroundColor: 'rgba(220, 38, 38, 0.16)' },
  swatchBefore: { borderColor: theme.textFaint, backgroundColor: theme.surfaceMuted },
  legendText: { fontFamily: fonts.body, fontSize: 9, color: theme.textFaint },
  group: { marginBottom: spacing.sm },
  groupTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    color: theme.textPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  groupSub: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: theme.textFaint,
    marginBottom: spacing.xs,
  },
  statCard: {
    backgroundColor: theme.surface,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    padding: spacing.sm,
    marginBottom: spacing.xs,
  },
  statHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  statLabel: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: theme.textPrimary },
  statLead: { fontFamily: fonts.body, fontSize: 9, color: theme.textFaint },
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
