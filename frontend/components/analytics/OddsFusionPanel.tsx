import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import ComplianceBadge from '@/components/analytics/ComplianceBadge';
import SectionLabel from '@/components/shared/SectionLabel';
import { useHollywoodPopularOdds } from '@/hooks/useHollywoodPopularOdds';
import { ODDS_FUSION_ROWS } from '@/mock/analyticsData';
import type { FusionRow } from '@/services/hollywoodFusion';
import { complianceFromPercent } from '@/utils/compliance';
import { fonts, layout, spacing, theme } from '@/styles/theme';

/** Common display shape so live and sample rows render through one loop. */
type DisplayRow = {
  id: string;
  fixture: string;
  signal: string;
  compliance: number;
  book: string;
  market: string;
  odds: number;
  edge: number;
};

const PICK_LABEL: Record<FusionRow['pick'], string> = { '1': 'Home', X: 'Draw', '2': 'Away' };

/** Map a live Hollywoodbets fusion row into the table's display shape. */
function fromFusion(row: FusionRow): DisplayRow {
  const fairPct = row.fair[row.pick === '1' ? 'home' : row.pick === 'X' ? 'draw' : 'away'] * 100;
  return {
    id: String(row.eventId),
    fixture: row.fixture,
    signal: `Fair ${fairPct.toFixed(0)}% — ${PICK_LABEL[row.pick]}`,
    compliance: Math.round(fairPct),
    book: 'Hollywoodbets',
    market: `1X2 — ${PICK_LABEL[row.pick]}`,
    odds: row.decimal[row.pick === '1' ? 'home' : row.pick === 'X' ? 'draw' : 'away'],
    edge: row.edgePct,
  };
}

export default function OddsFusionPanel() {
  const live = useHollywoodPopularOdds();

  const rows = useMemo<DisplayRow[]>(() => {
    if (live.rows.length > 0) return live.rows.map(fromFusion);
    // Fallback to bundled sample rows (also used while loading / offline).
    return ODDS_FUSION_ROWS.map((r) => ({
      id: r.id,
      fixture: r.fixture,
      signal: r.statSignal,
      compliance: r.statCompliance,
      book: r.bookmaker,
      market: r.market,
      odds: r.odds,
      edge: r.edge,
    }));
  }, [live.rows]);

  const isLive = live.rows.length > 0;

  return (
    <View style={styles.container}>
      <Text style={styles.intro}>
        Combine statistical outputs with live odds from Odds Alert API and Hollywoodbets.
        Identify value where stat compliance aligns with available prices.
      </Text>

      <View style={styles.sectionRow}>
        <SectionLabel style={styles.section}>Odds Fusion — Live Matches</SectionLabel>
        <Text style={[styles.liveTag, isLive ? styles.liveOn : styles.liveOff]}>
          {live.loading ? 'LOADING…' : isLive ? 'LIVE' : 'SAMPLE'}
        </Text>
      </View>
      {isLive && live.source ? (
        <Text style={styles.sourceNote}>
          {live.source.categoryName} · {live.source.tournamentName}
        </Text>
      ) : null}

      <View style={styles.table}>
        <View style={styles.headerRow}>
          <Text style={[styles.hCell, styles.hCellWide]}>Fixture</Text>
          <Text style={[styles.hCell, styles.hCellWide]}>{isLive ? 'Fair (de-vig)' : 'Stat Signal'}</Text>
          <Text style={styles.hCell}>Book</Text>
          <Text style={styles.hCell}>Market</Text>
          <Text style={styles.hCell}>Odds</Text>
          <Text style={styles.hCell}>Edge</Text>
        </View>
        {rows.map((row) => (
          <View key={row.id} style={styles.dataRow}>
            <Text style={[styles.dCell, styles.dCellWide, styles.fixture]}>{row.fixture}</Text>
            <View style={[styles.dCell, styles.dCellWide, styles.signalCell]}>
              <Text style={styles.signal}>{row.signal}</Text>
              <ComplianceBadge
                level={complianceFromPercent(row.compliance)}
                value={row.compliance}
                compact
              />
            </View>
            <Text style={styles.dCell}>{row.book}</Text>
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
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  liveTag: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    letterSpacing: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: layout.borderRadius,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  liveOn: {
    color: theme.bg,
    backgroundColor: theme.accentGreen,
  },
  liveOff: {
    color: theme.textMuted,
    backgroundColor: theme.surfaceMuted,
  },
  sourceNote: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textMuted,
    marginBottom: spacing.md,
    textAlign: 'center',
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
