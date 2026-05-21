import { StyleSheet, Text, View } from 'react-native';

import ComplianceBadge from '@/components/analytics/ComplianceBadge';
import SectionLabel from '@/components/shared/SectionLabel';
import { ODDS_FUSION_ROWS } from '@/mock/analyticsData';
import { complianceFromPercent } from '@/utils/compliance';
import { fonts, layout, spacing, theme } from '@/styles/theme';

export default function OddsFusionPanel() {
  return (
    <View style={styles.container}>
      <Text style={styles.intro}>
        Combine statistical outputs with live odds from Odds Alert API and Hollywoodbets.
        Identify value where stat compliance aligns with available prices.
      </Text>

      <SectionLabel style={styles.section}>Odds Fusion — Live Matches</SectionLabel>

      <View style={styles.table}>
        <View style={styles.headerRow}>
          <Text style={[styles.hCell, styles.hCellWide]}>Fixture</Text>
          <Text style={[styles.hCell, styles.hCellWide]}>Stat Signal</Text>
          <Text style={styles.hCell}>Book</Text>
          <Text style={styles.hCell}>Market</Text>
          <Text style={styles.hCell}>Odds</Text>
          <Text style={styles.hCell}>Edge</Text>
        </View>
        {ODDS_FUSION_ROWS.map((row) => (
          <View key={row.id} style={styles.dataRow}>
            <Text style={[styles.dCell, styles.dCellWide, styles.fixture]}>{row.fixture}</Text>
            <View style={[styles.dCell, styles.dCellWide, styles.signalCell]}>
              <Text style={styles.signal}>{row.statSignal}</Text>
              <ComplianceBadge
                level={complianceFromPercent(row.statCompliance)}
                value={row.statCompliance}
                compact
              />
            </View>
            <Text style={styles.dCell}>{row.bookmaker}</Text>
            <Text style={styles.dCell}>{row.market}</Text>
            <Text style={[styles.dCell, styles.odds]}>{row.odds.toFixed(2)}</Text>
            <Text
              style={[
                styles.dCell,
                styles.edge,
                row.edge >= 0 ? styles.edgePos : styles.edgeNeg,
              ]}>
              {row.edge >= 0 ? '+' : ''}
              {row.edge.toFixed(1)}%
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.sources}>
        <Text style={styles.sourceTag}>Odds Alert API</Text>
        <Text style={styles.sourceDot}>·</Text>
        <Text style={styles.sourceTag}>Hollywoodbets</Text>
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
  section: {
    alignSelf: 'stretch',
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  table: {
    width: '100%',
    maxWidth: 900,
    backgroundColor: theme.surface,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    borderBottomWidth: layout.borderWidth,
    borderBottomColor: theme.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    backgroundColor: 'rgba(30, 30, 46, 0.5)',
  },
  hCell: {
    flex: 1,
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    color: theme.textMuted,
    textAlign: 'center',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  hCellWide: {
    flex: 1.5,
  },
  dataRow: {
    flexDirection: 'row',
    borderBottomWidth: layout.borderWidth,
    borderBottomColor: theme.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
  },
  dCell: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 11,
    color: theme.textMuted,
    textAlign: 'center',
  },
  dCellWide: {
    flex: 1.5,
  },
  fixture: {
    fontFamily: fonts.bodyMedium,
    color: theme.textPrimary,
    fontSize: 12,
  },
  signalCell: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  signal: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: theme.textMuted,
    textAlign: 'center',
  },
  odds: {
    fontFamily: fonts.display,
    fontSize: 14,
    color: theme.accentBlue,
  },
  edge: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
  },
  edgePos: {
    color: theme.accentGreen,
  },
  edgeNeg: {
    color: theme.loss,
  },
  sources: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  sourceTag: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: theme.textMuted,
  },
  sourceDot: {
    color: theme.textFaint,
  },
});
