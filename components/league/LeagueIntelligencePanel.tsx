import { StyleSheet, Text, View } from 'react-native';

import ComplianceBadge from '@/components/analytics/ComplianceBadge';
import SectionLabel from '@/components/shared/SectionLabel';
import { getLeagueIntel } from '@/mock/leagueAnalyticsData';
import type { League } from '@/mock/leaguesData';
import { complianceColor } from '@/utils/compliance';
import { fonts, layout, spacing, theme } from '@/styles/theme';

type LeagueIntelligencePanelProps = {
  league: League;
};

export default function LeagueIntelligencePanel({ league }: LeagueIntelligencePanelProps) {
  const intel = getLeagueIntel(league.id);
  const { summary, stats, streams, strategies } = intel;

  return (
    <View style={styles.container}>
      <View style={styles.summaryRow}>
        <SummaryTile label="Signals" value={String(summary.signalsToday)} />
        <SummaryTile label="Strategies" value={String(summary.strategiesActive)} />
        <SummaryTile label="Avg compliance" value={`${summary.avgCompliance}%`} highlight />
      </View>

      <View style={styles.topPickCard}>
        <SectionLabel>Top pick today</SectionLabel>
        <Text style={styles.topPickFixture}>{summary.topPick}</Text>
        <View style={styles.topPickMeta}>
          <Text style={styles.topPickMarket}>{summary.topMarket}</Text>
          <ComplianceBadge level="green" value={summary.topCompliance} />
        </View>
      </View>

      <SectionLabel style={styles.section}>League stats (Overall / Home / Away)</SectionLabel>
      <View style={styles.statsTable}>
        <View style={styles.statsHeader}>
          <Text style={[styles.statCell, styles.statLabelCol]}>Stat</Text>
          <Text style={styles.statCell}>Overall</Text>
          <Text style={styles.statCell}>Home</Text>
          <Text style={styles.statCell}>Away</Text>
        </View>
        {stats.map((row) => (
          <View key={row.label} style={styles.statsRow}>
            <Text style={[styles.statCell, styles.statLabelCol, styles.statName]}>{row.label}</Text>
            <Text style={[styles.statCell, { color: complianceColor(complianceFrom(row.overall)) }]}>
              {row.overall}%
            </Text>
            <Text style={[styles.statCell, { color: complianceColor(complianceFrom(row.home)) }]}>
              {row.home}%
            </Text>
            <Text style={[styles.statCell, { color: complianceColor(complianceFrom(row.away)) }]}>
              {row.away}%
            </Text>
          </View>
        ))}
      </View>

      <SectionLabel style={styles.section}>Streams</SectionLabel>
      <View style={styles.list}>
        {streams.map((s) => (
          <View key={s.id} style={styles.card}>
            <View style={styles.cardTop}>
              <Text style={styles.cardTitle}>{s.name}</Text>
              <ComplianceBadge level={s.level} value={s.compliance} />
            </View>
            <Text style={styles.cardFixture}>{s.fixture}</Text>
            <Text style={styles.cardKickoff}>{s.kickoff}</Text>
          </View>
        ))}
      </View>

      <SectionLabel style={styles.section}>Strategies</SectionLabel>
      <View style={styles.list}>
        {strategies.map((st) => (
          <View key={st.id} style={styles.card}>
            <View style={styles.cardTop}>
              <Text style={styles.cardTitle}>{st.name}</Text>
              <ComplianceBadge level={st.level} value={st.compliance} />
            </View>
            <Text style={styles.cardFixture}>{st.fixture}</Text>
            <Text style={styles.cardMarket}>{st.market}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function complianceFrom(value: number): 'green' | 'yellow' | 'red' {
  if (value >= 66) return 'green';
  if (value >= 33) return 'yellow';
  return 'red';
}

function SummaryTile({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <View style={styles.tile}>
      <Text style={[styles.tileValue, highlight && styles.tileHighlight]}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
  },
  summaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.md,
    width: '100%',
    marginBottom: spacing.lg,
  },
  tile: {
    flex: 1,
    minWidth: 100,
    backgroundColor: theme.surface,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    padding: spacing.md,
    alignItems: 'center',
    shadowColor: theme.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
  },
  tileValue: {
    fontFamily: fonts.display,
    fontSize: 22,
    color: theme.textPrimary,
    marginBottom: spacing.xs,
  },
  tileHighlight: {
    color: theme.accentGreen,
  },
  tileLabel: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  topPickCard: {
    width: '100%',
    backgroundColor: theme.surface,
    borderWidth: layout.borderWidth,
    borderColor: theme.accentGreen,
    borderRadius: layout.borderRadius,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.xl,
    shadowColor: theme.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 3,
  },
  topPickFixture: {
    fontFamily: fonts.display,
    fontSize: 20,
    color: theme.textPrimary,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  topPickMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  topPickMarket: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: theme.accentBlue,
  },
  section: {
    alignSelf: 'stretch',
    textAlign: 'center',
    marginBottom: spacing.md,
    marginTop: spacing.sm,
  },
  statsTable: {
    width: '100%',
    maxWidth: 560,
    backgroundColor: theme.surface,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    overflow: 'hidden',
    marginBottom: spacing.xl,
  },
  statsHeader: {
    flexDirection: 'row',
    backgroundColor: theme.surfaceMuted,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: layout.borderWidth,
    borderBottomColor: theme.border,
  },
  statsRow: {
    flexDirection: 'row',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: layout.borderWidth,
    borderBottomColor: theme.border,
  },
  statCell: {
    flex: 1,
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    color: theme.textMuted,
    textAlign: 'center',
  },
  statLabelCol: {
    flex: 1.4,
    textAlign: 'left',
  },
  statName: {
    fontFamily: fonts.bodyMedium,
    color: theme.textPrimary,
    fontSize: 12,
  },
  list: {
    width: '100%',
    maxWidth: 640,
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  card: {
    backgroundColor: theme.surface,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    padding: spacing.md,
    alignItems: 'center',
    shadowColor: theme.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 1,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: spacing.xs,
    gap: spacing.sm,
  },
  cardTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: theme.textPrimary,
    flex: 1,
  },
  cardFixture: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: theme.textMuted,
    textAlign: 'center',
  },
  cardKickoff: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textFaint,
    marginTop: 2,
  },
  cardMarket: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: theme.accentBlue,
    marginTop: spacing.xs,
  },
});
