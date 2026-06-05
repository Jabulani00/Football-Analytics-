import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import ComplianceBadge from '@/components/analytics/ComplianceBadge';
import SectionLabel from '@/components/shared/SectionLabel';
import PpgTable from '@/components/stats/PpgTable';
import StatsComparisonTable from '@/components/stats/StatsComparisonTable';
import TableContextPicker from '@/components/stats/TableContextPicker';
import { PROJECT_META } from '@/constants/statsCatalogue';
import { getFixtureById } from '@/mock/fixturesData';
import { buildFixtureStats } from '@/mock/statsEngine';
import { cardElevation } from '@/styles/elevation';
import { fonts, layout, spacing, theme } from '@/styles/theme';

type FixtureStatsDashboardProps = {
  fixtureId: string;
};

export default function FixtureStatsDashboard({ fixtureId }: FixtureStatsDashboardProps) {
  const fixture = getFixtureById(fixtureId);
  const [tableId, setTableId] = useState('ft-overall');

  const stats = useMemo(() => {
    if (!fixture) return null;
    return buildFixtureStats(fixture, tableId);
  }, [fixture, tableId]);

  if (!fixture || !stats) {
    return <Text style={styles.error}>Fixture stats unavailable.</Text>;
  }

  return (
    <View style={styles.root}>
      <View style={styles.engineBanner}>
        <Text style={styles.engineTitle}>SCORELINE STATS ENGINE</Text>
        <Text style={styles.engineSub}>
          Our own {PROJECT_META.ordinaryCount} ordinary metrics · {PROJECT_META.metricsPerTable}+ per table ·{' '}
          {PROJECT_META.totalTables} tables ({PROJECT_META.baseTables} base + {PROJECT_META.lastNTables} last-N)
        </Text>
      </View>

      <TableContextPicker selected={tableId} onSelect={setTableId} />

      <View style={styles.pickCard}>
        <SectionLabel>Our pick for this fixture</SectionLabel>
        <Text style={styles.pickMarket}>
          {stats.topPick.selection} · {stats.topPick.market}
        </Text>
        <ComplianceBadge level={stats.topPick.level} value={stats.topPick.compliance} />
        <Text style={styles.tableCtx}>Viewing: {stats.tableLabel}</Text>
      </View>

      <CategoryBlock
        title={`Ordinary team stats (${PROJECT_META.ordinaryCount})`}
        subtitle="All 45 base tables · SC%, goals, results, timing"
        home={stats.homeTeam}
        away={stats.awayTeam}
        rows={stats.ordinary}
      />

      <View style={styles.category}>
        <Text style={styles.catTitle}>PPG — Points per game (45 stats)</Text>
        <Text style={styles.catSub}>PPG · Green · Yellow · Red across FT / 1H / 2H splits</Text>
        <PpgTable rows={stats.ppg} />
      </View>

      <CategoryBlock
        title="Full-time only stats"
        subtitle="BTTS both halves, HT/FT combos, win to nil, rescued points"
        home={stats.homeTeam}
        away={stats.awayTeam}
        rows={stats.fulltimeOnly}
        compact
      />

      <View style={styles.halfRow}>
        <View style={styles.halfCol}>
          <CategoryBlock
            title="1st half only"
            subtitle="0-0 at 1H · HT unders/overs"
            home={stats.homeTeam}
            away={stats.awayTeam}
            rows={stats.firstHalf}
            compact
          />
        </View>
        <View style={styles.halfCol}>
          <CategoryBlock
            title="2nd half only"
            subtitle="0-0 at 2H · 2H unders/overs"
            home={stats.homeTeam}
            away={stats.awayTeam}
            rows={stats.secondHalf}
            compact
          />
        </View>
      </View>

      <CategoryBlock
        title="Series stats (Table 2)"
        subtitle="Consecutive patterns · 29 with opponent · 7 without opponent"
        home={stats.homeTeam}
        away={stats.awayTeam}
        rows={stats.series}
        compact
      />

      <CategoryBlock
        title="League averages"
        subtitle="League-wide benchmarks (excl. SC% / Conc%)"
        home="League"
        away="Avg"
        rows={stats.leagueAverages}
        compact
      />

      <View style={styles.rfsBlock}>
        <SectionLabel>Recency failure signal (RFS)</SectionLabel>
        <Text style={styles.rfsSub}>Table 3 — Ordinary + RFS · Table 4 — Series + RFS</Text>
        {stats.rfsOrdinary.map((r) => (
          <Text key={`${r.team}-${r.failedStat}`} style={styles.rfsLine}>
            {r.team}: {r.failedStat}
          </Text>
        ))}
        {stats.rfsSeries.map((r) => (
          <Text key={`${r.team}-${r.streakBroken}`} style={styles.rfsLine}>
            {r.team}: {r.streakBroken}
          </Text>
        ))}
      </View>

      <SectionLabel style={styles.section}>Stats for support — fixture based</SectionLabel>
      <View style={styles.supportTabs}>
        <SupportTable title="Overall" home={stats.homeTeam} away={stats.awayTeam} rows={stats.supportOverall} />
        <SupportTable title="Home split" home={stats.homeTeam} away={stats.awayTeam} rows={stats.supportHome} />
        <SupportTable title="Away split" home={stats.homeTeam} away={stats.awayTeam} rows={stats.supportAway} />
      </View>

      <View style={styles.oddsBlock}>
        <SectionLabel>Odds fusion — our stats vs bookmaker</SectionLabel>
        <View style={styles.oddsTable}>
          <View style={styles.oddsHeader}>
            <Text style={styles.oddsH}>Market</Text>
            <Text style={styles.oddsH}>Selection</Text>
            <Text style={styles.oddsH}>Our %</Text>
            <Text style={styles.oddsH}>Odds</Text>
            <Text style={styles.oddsH}>Edge</Text>
          </View>
          {stats.oddsFusion.map((o) => (
            <View key={`${o.market}-${o.selection}`} style={styles.oddsRow}>
              <Text style={styles.oddsCell}>{o.market}</Text>
              <Text style={[styles.oddsCell, styles.oddsSel]}>{o.selection}</Text>
              <ComplianceBadge level={o.level} value={o.ourCompliance} compact />
              <Text style={styles.oddsCell}>{o.bookOdds.toFixed(2)}</Text>
              <Text style={[styles.oddsCell, o.edge >= 0 ? styles.edgePos : styles.edgeNeg]}>
                {o.edge >= 0 ? '+' : ''}
                {o.edge}%
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.motives}>
        <SectionLabel>Motives for support</SectionLabel>
        {stats.motives.map((m) => (
          <Text key={m} style={styles.motive}>
            · {m}
          </Text>
        ))}
      </View>
    </View>
  );
}

function CategoryBlock({
  title,
  subtitle,
  home,
  away,
  rows,
  compact,
}: {
  title: string;
  subtitle: string;
  home: string;
  away: string;
  rows: import('@/types/stats').StatReading[];
  compact?: boolean;
}) {
  return (
    <View style={styles.category}>
      <Text style={styles.catTitle}>{title}</Text>
      <Text style={styles.catSub}>{subtitle}</Text>
      <StatsComparisonTable homeLabel={home} awayLabel={away} rows={rows} compact={compact} />
    </View>
  );
}

function SupportTable({
  title,
  home,
  away,
  rows,
}: {
  title: string;
  home: string;
  away: string;
  rows: import('@/types/stats').StatReading[];
}) {
  return (
    <View style={styles.supportCard}>
      <Text style={styles.supportTitle}>{title}</Text>
      <StatsComparisonTable homeLabel={home} awayLabel={away} rows={rows} compact />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.lg,
  },
  error: {
    fontFamily: fonts.body,
    color: theme.textMuted,
    padding: spacing.lg,
  },
  engineBanner: {
    backgroundColor: theme.accentGreen,
    borderRadius: layout.borderRadius,
    padding: spacing.md,
    width: '100%',
  },
  engineTitle: {
    fontFamily: fonts.display,
    fontSize: 18,
    color: '#FFFFFF',
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  engineSub: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 20,
  },
  pickCard: {
    backgroundColor: theme.surface,
    borderWidth: layout.borderWidth,
    borderColor: theme.accentBlue,
    borderRadius: layout.borderRadius,
    padding: spacing.md,
    alignItems: 'center',
    width: '100%',
    ...cardElevation(2),
  },
  pickMarket: {
    fontFamily: fonts.display,
    fontSize: 22,
    color: theme.textPrimary,
    marginVertical: spacing.sm,
  },
  tableCtx: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textMuted,
    marginTop: spacing.sm,
  },
  category: {
    width: '100%',
    marginBottom: spacing.md,
  },
  catTitle: {
    fontFamily: fonts.display,
    fontSize: 16,
    color: theme.textPrimary,
    marginBottom: spacing.xs,
  },
  catSub: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textMuted,
    marginBottom: spacing.sm,
  },
  halfRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    width: '100%',
  },
  halfCol: {
    flex: 1,
    minWidth: 280,
  },
  rfsBlock: {
    backgroundColor: theme.surfaceMuted,
    borderRadius: layout.borderRadius,
    padding: spacing.md,
    width: '100%',
  },
  rfsSub: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textMuted,
    marginBottom: spacing.sm,
  },
  rfsLine: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: theme.accentOrange,
    marginBottom: 4,
  },
  section: {
    marginTop: spacing.md,
  },
  supportTabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    width: '100%',
  },
  supportCard: {
    flex: 1,
    minWidth: 260,
    backgroundColor: theme.surface,
    borderRadius: layout.borderRadius,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    padding: spacing.md,
  },
  supportTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: theme.accentGreen,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  oddsBlock: {
    width: '100%',
  },
  oddsTable: {
    backgroundColor: theme.surface,
    borderRadius: layout.borderRadius,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    overflow: 'hidden',
  },
  oddsHeader: {
    flexDirection: 'row',
    backgroundColor: theme.surfaceMuted,
    padding: spacing.sm,
    borderBottomWidth: layout.borderWidth,
    borderBottomColor: theme.border,
  },
  oddsH: {
    flex: 1,
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    color: theme.textMuted,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  oddsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
    borderBottomWidth: layout.borderWidth,
    borderBottomColor: theme.border,
  },
  oddsCell: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 11,
    color: theme.textMuted,
    textAlign: 'center',
  },
  oddsSel: {
    fontFamily: fonts.bodyMedium,
    color: theme.textPrimary,
  },
  edgePos: { color: theme.accentGreen, fontFamily: fonts.bodySemiBold },
  edgeNeg: { color: theme.loss, fontFamily: fonts.bodySemiBold },
  motives: {
    backgroundColor: theme.surface,
    borderRadius: layout.borderRadius,
    padding: spacing.md,
    width: '100%',
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
  },
  motive: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: theme.textPrimary,
    lineHeight: 22,
    marginTop: spacing.xs,
  },
});
