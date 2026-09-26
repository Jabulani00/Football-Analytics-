import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import SubTabBar from '@/components/shared/SubTabBar';
import RfsFailureCard from '@/components/stats/RfsFailureCard';
import { useFixtureSeries } from '@/hooks/useFixtureSeries';
import { MIN_SERIES } from '@/utils/fixtureSeries';
import {
  buildFixtureRfs,
  USUAL_MIN_RATE,
  type RfsOrdinaryRow,
  type RfsScope,
  type RfsSeriesRow,
} from '@/utils/fixtureRfs';
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
  /** Card headers — default to team names. */
  homeLabel?: string;
  awayLabel?: string;
  /** Gate the fetch — hosts that render off-screen only load when opened. */
  enabled?: boolean;
};

const SCOPES: { id: RfsScope; label: string }[] = [
  { id: 'overall', label: 'Overall' },
  { id: 'home', label: 'Home' },
  { id: 'away', label: 'Away' },
];

function Section({
  title,
  subtitle,
  rows,
  homeName,
  awayName,
  emptyText,
}: {
  title: string;
  subtitle: string;
  rows: (RfsOrdinaryRow | RfsSeriesRow)[];
  homeName: string;
  awayName: string;
  emptyText: string;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionSub}>{subtitle}</Text>
      {rows.length === 0 ? (
        <Text style={styles.sectionEmpty}>{emptyText}</Text>
      ) : (
        rows.map((row) => (
          <RfsFailureCard
            key={`${row.side}-${row.key}`}
            row={row}
            teamName={row.side === 'home' ? homeName : awayName}
          />
        ))
      )}
    </View>
  );
}

/**
 * Spec §4.8 — the two RFS streams for T1 vs T2, live-calculated from this
 * season's league results. Table 3 flags a usual behaviour the last game did not
 * deliver; Table 4 flags a run that was alive going into the last game and died
 * in it.
 */
export default function FixtureRfsPanel({
  homeId,
  awayId,
  homeName,
  awayName,
  competitionId,
  seasonId,
  seasonName,
  isCup,
  homeLabel,
  awayLabel,
  enabled,
}: Props) {
  const [scope, setScope] = useState<RfsScope>('overall');

  const { loading, error, homeResults, awayResults } = useFixtureSeries({
    homeId,
    awayId,
    competitionId,
    seasonId,
    seasonName,
    isCup,
    enabled,
  });

  const { ordinary, series, homeSample, awaySample } = buildFixtureRfs({
    homeResults,
    awayResults,
    scope,
  });

  if (competitionId == null) {
    return null;
  }

  const home = homeLabel ?? homeName;
  const away = awayLabel ?? awayName;
  const signals = ordinary.length + series.length;

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Ordinary + RFS · Series + RFS</Text>
      <Text style={styles.sub}>
        Recency failure signal — the last game was the opposite of usual
        {scope === 'overall' ? '' : ' (last game in this split)'}
      </Text>
      <SubTabBar tabs={SCOPES} active={scope} onChange={setScope} />

      {loading && signals === 0 ? (
        <View style={styles.loading}>
          <ActivityIndicator color={theme.accentGreen} />
          <Text style={styles.muted}>Loading season results…</Text>
        </View>
      ) : (
        <>
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.swatch, styles.swatchHit]} />
              <Text style={styles.legendText}>did the usual</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.swatch, styles.swatchFailed]} />
              <Text style={styles.legendText}>last game failed it</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.swatch, styles.swatchMiss]} />
              <Text style={styles.legendText}>earlier miss</Text>
            </View>
            <Text style={styles.legendText}>oldest ← → newest · score is team-first</Text>
          </View>

          <Section
            title="Failed to do the usual"
            subtitle={`Season rate ${USUAL_MIN_RATE}%+ for the stat, but the last game did not deliver it`}
            rows={ordinary}
            homeName={home}
            awayName={away}
            emptyText="Both sides did their usual last time out."
          />

          <Section
            title="Failed to continue the usual"
            subtitle={`A run of ${MIN_SERIES}+ was alive going into the last game and died in it`}
            rows={series}
            homeName={home}
            awayName={away}
            emptyText="No series was broken by either side's last game."
          />

          <Text style={styles.foot}>
            {`${signals} ${signals === 1 ? 'signal' : 'signals'} · from finished league matches · ${home} n=${homeSample} · ${away} n=${awaySample}`}
            {error ? ` · ${error}` : ''}
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
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
  swatchHit: { borderColor: theme.accentGreen, backgroundColor: 'rgba(5, 150, 105, 0.18)' },
  swatchFailed: { borderColor: theme.loss, backgroundColor: 'rgba(220, 38, 38, 0.16)' },
  swatchMiss: { borderColor: theme.textFaint, backgroundColor: theme.surfaceMuted },
  legendText: { fontFamily: fonts.body, fontSize: 9, color: theme.textFaint },
  section: { marginBottom: spacing.sm },
  sectionTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    color: theme.textPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionSub: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: theme.textFaint,
    marginBottom: spacing.xs,
  },
  sectionEmpty: {
    backgroundColor: theme.surface,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    padding: spacing.sm,
    fontFamily: fonts.body,
    fontSize: 11,
    color: theme.textMuted,
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
