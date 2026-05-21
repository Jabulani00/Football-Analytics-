import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import ComplianceBadge from '@/components/analytics/ComplianceBadge';
import SectionLabel from '@/components/shared/SectionLabel';
import {
  DATA_SOURCES,
  PPG_STATS_PREVIEW,
  PROJECT_PHASES,
  PROJECT_SUMMARY,
} from '@/mock/analyticsData';
import { fonts, layout, spacing, theme } from '@/styles/theme';

export default function OverviewPanel() {
  const { width } = useWindowDimensions();
  const phaseColumns = width >= 1024 ? 3 : width >= 640 ? 2 : 1;
  const sourceColumns = width >= 900 ? 2 : 1;

  return (
    <View style={styles.container}>
      <View style={styles.summaryRow}>
        <SummaryCard label="Tables" value={String(PROJECT_SUMMARY.tableCount)} sub="45 base + 27 last-N" />
        <SummaryCard label="Metrics" value={`${PROJECT_SUMMARY.metricsPerTable}+`} sub="per table" />
        <SummaryCard label="Sources" value={String(PROJECT_SUMMARY.dataSources.length)} sub="integrated" />
        <SummaryCard label="Scope" value="FT / 1H / 2H" sub="time periods" />
      </View>

      <SectionLabel style={styles.section}>Project Phases</SectionLabel>
      <View style={[styles.phaseGrid, { gap: spacing.md }]}>
        {PROJECT_PHASES.map((phase) => (
          <View
            key={phase.number}
            style={[
              styles.phaseCard,
              phaseColumns === 3 && styles.phaseCardThird,
              phaseColumns === 2 && styles.phaseCardHalf,
            ]}>
            <View style={styles.phaseHeader}>
              <Text style={styles.phaseNum}>PHASE {phase.number}</Text>
              <Text style={[styles.phaseStatus, statusStyle(phase.status)]}>
                {phase.status.replace('_', ' ').toUpperCase()}
              </Text>
            </View>
            <Text style={styles.phaseName}>{phase.name}</Text>
            {phase.deliverables.map((d) => (
              <Text key={d} style={styles.deliverable}>
                · {d}
              </Text>
            ))}
          </View>
        ))}
      </View>

      <SectionLabel style={styles.section}>Data Sources</SectionLabel>
      <View style={[styles.sourceGrid, sourceColumns === 2 && styles.sourceGridTwo]}>
        {DATA_SOURCES.map((src) => (
          <View key={src.id} style={styles.sourceCard}>
            <View style={styles.sourceHeader}>
              <Text style={styles.sourceName}>{src.name}</Text>
              <Text style={styles.sourceCategory}>{src.category.toUpperCase()}</Text>
            </View>
            <Text style={[styles.sourceStatus, statusStyle(src.status)]}>{src.status}</Text>
            <Text style={styles.sourceData}>{src.dataCollected.join(' · ')}</Text>
          </View>
        ))}
      </View>

      <SectionLabel style={styles.section}>PPG Preview (45 stats)</SectionLabel>
      <View style={styles.ppgTable}>
        <View style={styles.ppgHeader}>
          <Text style={[styles.ppgCell, styles.ppgCellScope]}>Scope</Text>
          <Text style={styles.ppgCell}>PPG</Text>
          <Text style={[styles.ppgCell, styles.ppgGreen]}>Green</Text>
          <Text style={[styles.ppgCell, styles.ppgYellow]}>Yellow</Text>
          <Text style={[styles.ppgCell, styles.ppgRed]}>Red</Text>
        </View>
        {PPG_STATS_PREVIEW.map((row) => (
          <View key={row.scope} style={styles.ppgRow}>
            <Text style={[styles.ppgCell, styles.ppgCellScope, styles.ppgBody]}>{row.scope}</Text>
            <Text style={[styles.ppgCell, styles.ppgBody]}>{row.ppg.toFixed(1)}</Text>
            <Text style={[styles.ppgCell, styles.ppgBody, styles.ppgGreen]}>{row.green.toFixed(1)}</Text>
            <Text style={[styles.ppgCell, styles.ppgBody, styles.ppgYellow]}>{row.yellow.toFixed(1)}</Text>
            <Text style={[styles.ppgCell, styles.ppgBody, styles.ppgRed]}>{row.red.toFixed(1)}</Text>
          </View>
        ))}
      </View>

      <View style={styles.legend}>
        <SectionLabel>Colour compliance</SectionLabel>
        <View style={styles.legendRow}>
          <ComplianceBadge level="green" />
          <Text style={styles.legendText}>≥66% Strong</Text>
          <ComplianceBadge level="yellow" />
          <Text style={styles.legendText}>33–65% Moderate</Text>
          <ComplianceBadge level="red" />
          <Text style={styles.legendText}>{'<33% Caution'}</Text>
        </View>
      </View>
    </View>
  );
}

function SummaryCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summarySub}>{sub}</Text>
    </View>
  );
}

function statusStyle(status: string) {
  if (status === 'active' || status === 'complete') return { color: theme.accentGreen };
  if (status === 'in_progress' || status === 'syncing') return { color: theme.accentOrange };
  return { color: theme.textMuted };
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
  },
  section: {
    alignSelf: 'stretch',
    textAlign: 'center',
    marginBottom: spacing.md,
    marginTop: spacing.lg,
  },
  summaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.md,
    width: '100%',
    marginBottom: spacing.lg,
  },
  summaryCard: {
    flex: 1,
    minWidth: 140,
    maxWidth: 220,
    backgroundColor: theme.surface,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    padding: spacing.md,
    alignItems: 'center',
  },
  summaryValue: {
    fontFamily: fonts.display,
    fontSize: 28,
    color: theme.accentGreen,
    marginBottom: spacing.xs,
  },
  summaryLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: theme.textPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  summarySub: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: theme.textMuted,
    marginTop: 2,
    textAlign: 'center',
  },
  phaseGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    width: '100%',
  },
  phaseCard: {
    width: '100%',
    backgroundColor: theme.surface,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    padding: spacing.md,
  },
  phaseCardHalf: {
    flexBasis: '48%',
    flexGrow: 0,
    maxWidth: 480,
  },
  phaseCardThird: {
    flexBasis: '31%',
    flexGrow: 0,
    maxWidth: 400,
  },
  phaseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  phaseNum: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    color: theme.accentGreen,
    letterSpacing: 1,
  },
  phaseStatus: {
    fontFamily: fonts.body,
    fontSize: 9,
    letterSpacing: 0.5,
  },
  phaseName: {
    fontFamily: fonts.display,
    fontSize: 16,
    color: theme.textPrimary,
    marginBottom: spacing.sm,
  },
  deliverable: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textMuted,
    lineHeight: 18,
    marginBottom: 2,
  },
  sourceGrid: {
    width: '100%',
    gap: spacing.md,
  },
  sourceGridTwo: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  sourceCard: {
    flex: 1,
    minWidth: 280,
    backgroundColor: theme.surface,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    padding: spacing.md,
  },
  sourceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  sourceName: {
    fontFamily: fonts.display,
    fontSize: 16,
    color: theme.textPrimary,
  },
  sourceCategory: {
    fontFamily: fonts.body,
    fontSize: 9,
    color: theme.textFaint,
    letterSpacing: 0.5,
  },
  sourceStatus: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    marginBottom: spacing.sm,
    textTransform: 'capitalize',
  },
  sourceData: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textMuted,
    lineHeight: 18,
  },
  ppgTable: {
    width: '100%',
    maxWidth: 560,
    backgroundColor: theme.surface,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    overflow: 'hidden',
  },
  ppgHeader: {
    flexDirection: 'row',
    borderBottomWidth: layout.borderWidth,
    borderBottomColor: theme.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  ppgRow: {
    flexDirection: 'row',
    borderBottomWidth: layout.borderWidth,
    borderBottomColor: theme.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  ppgCell: {
    flex: 1,
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    color: theme.textMuted,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  ppgCellScope: {
    flex: 1.4,
    textAlign: 'left',
  },
  ppgBody: {
    fontFamily: fonts.body,
    color: theme.textPrimary,
  },
  ppgGreen: { color: theme.accentGreen },
  ppgYellow: { color: theme.yellow },
  ppgRed: { color: theme.loss },
  legend: {
    marginTop: spacing.xl,
    alignItems: 'center',
    width: '100%',
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  legendText: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: theme.textMuted,
  },
});
