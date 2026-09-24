import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import ComplianceBadge from '@/components/analytics/ComplianceBadge';
import SectionLabel from '@/components/shared/SectionLabel';
import type { HollywoodPopularOddsState } from '@/hooks/useHollywoodPopularOdds';
import { ODDS_FUSION_ROWS } from '@/mock/analyticsData';
import type { FusionRow, MarketRow } from '@/services/hollywoodFusion';
import { complianceFromPercent } from '@/utils/compliance';
import { fonts, layout, spacing, theme } from '@/styles/theme';
import type { BetSlipLeg } from '@/types/analytics';

/** Common display shape so live and sample rows render through one loop. */
type DisplayRow = {
  id: string;
  fixture: string;
  signal: string;
  compliance: number | null;
  book: string;
  market: string;
  odds: number;
  /** Null when we hold no model for the fixture — shown as "—", never as 0%. */
  edge: number | null;
  /** Agreement between our model and the book, when both are known. */
  agreement: FusionRow['agreement'];
  ruleSummary: string | null;
  betSlipLeg: BetSlipLeg | null;
};

const PICK_LABEL: Record<FusionRow['pick'], string> = { '1': 'Home', X: 'Draw', '2': 'Away' };
const OUTCOME_KEY = { '1': 'home', X: 'draw', '2': 'away' } as const;

/** Map a per-market row into the table's display shape. */
function fromMarket(row: MarketRow, i: number): DisplayRow {
  const fairPct = row.fair != null ? row.fair * 100 : null;
  const modelPct = row.modelProb != null ? row.modelProb * 100 : null;

  const signal =
    modelPct != null && fairPct != null
      ? `Us ${modelPct.toFixed(0)}% vs book ${fairPct.toFixed(0)}%`
      : fairPct != null
        ? `Book ${fairPct.toFixed(0)}% · no model yet`
        : 'No de-vig available';

  return {
    id: `${row.eventId}-${row.betTypeId}-${row.marketNumber}-${i}`,
    fixture: row.fixture,
    signal,
    compliance: Math.round(modelPct ?? fairPct ?? 0),
    book: 'Hollywoodbets',
    market: `${row.marketName} — ${row.selection}`,
    odds: row.decimal,
    edge: row.edgePct,
    agreement: row.agreement,
    ruleSummary: row.value
      ? `Δ ${row.value.oppositionDelta.toFixed(2)} ${row.value.deltaBand} · ${row.value.inWatchRange ? 'inside 0.35–0.65' : 'outside 0.35–0.65'}${row.value.investigateScores ? ' · inspect scores' : ''}`
      : null,
    betSlipLeg: row.hbLeg
      ? {
          id: `fusion-${row.eventId}-${row.betTypeId}-${row.marketNumber}`,
          fixture: row.fixture,
          market: row.marketName,
          selection: row.selection,
          odds: row.decimal,
          bookmaker: 'Hollywoodbets',
          kickoff: row.kickoff,
          hbLeg: row.hbLeg,
        }
      : null,
  };
}

/** Map a live Hollywoodbets fusion row into the table's display shape. */
function fromFusion(row: FusionRow): DisplayRow {
  const key = OUTCOME_KEY[row.pick];
  const fairPct = row.fair[key] * 100;
  const modelPct = row.modelProb ? row.modelProb[key] * 100 : null;

  // With a model, the interesting number is ours vs theirs. Without one, say so
  // rather than dressing the book's own fair price up as a signal.
  const signal = modelPct
    ? `Us ${modelPct.toFixed(0)}% vs book ${fairPct.toFixed(0)}% — ${PICK_LABEL[row.pick]}`
    : `Book ${fairPct.toFixed(0)}% — ${PICK_LABEL[row.pick]} · no model yet`;

  return {
    id: String(row.eventId),
    fixture: row.fixture,
    signal,
    compliance: Math.round(modelPct ?? fairPct),
    book: 'Hollywoodbets',
    market: `1X2 — ${PICK_LABEL[row.pick]}`,
    odds: row.decimal[key],
    edge: row.edgePct,
    agreement: row.agreement,
    ruleSummary: null,
    betSlipLeg: row.hbLeg
      ? {
          id: `fusion-${row.eventId}`,
          fixture: row.fixture,
          market: 'Full Time',
          selection: PICK_LABEL[row.pick],
          odds: row.decimal[key],
          bookmaker: 'Hollywoodbets',
          kickoff: row.kickoff,
          hbLeg: row.hbLeg,
        }
      : null,
  };
}

export default function OddsFusionPanel({
  live,
  onAddLeg,
}: {
  live: HollywoodPopularOddsState;
  onAddLeg: (leg: BetSlipLeg) => void;
}) {
  const rows = useMemo<DisplayRow[]>(() => {
    // Prefer the per-market view: it covers 1X2, BTTS and the Over/Under lines
    // the value rules actually read, rather than 1X2 alone.
    const extra: DisplayRow[] = live.extraOffers.slice(0, 20).map((offer, index) => ({
      id: `oddalerts-${offer.providerFixtureId}-${offer.bookmakerSlug}-${index}`,
      fixture: offer.fixture,
      signal: 'OddAlerts multi-bookmaker value feed',
      compliance: null,
      book: offer.bookmaker,
      market: `${offer.market} — ${offer.selection}`,
      odds: offer.decimal,
      edge: offer.providerValuePct,
      agreement: null,
      ruleSummary: 'Provider-reported value · PDF pair rules await both opposite prices',
      betSlipLeg: {
        id: `oddalerts-${offer.providerFixtureId}-${offer.bookmakerSlug}-${index}`,
        fixture: offer.fixture,
        market: offer.market,
        selection: offer.selection,
        odds: offer.decimal,
        bookmaker: offer.bookmaker,
        kickoff: offer.kickoffUnix ? new Date(offer.kickoffUnix * 1000).toISOString() : undefined,
      },
    }));
    if (live.marketRows.length > 0) return [...live.marketRows.map(fromMarket), ...extra];
    if (live.rows.length > 0) return [...live.rows.map(fromFusion), ...extra];
    if (extra.length > 0) return extra;
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
      agreement: null,
      ruleSummary: null,
      betSlipLeg: null,
    }));
  }, [live.rows, live.marketRows, live.extraOffers]);

  const isLive = live.rows.length > 0 || live.marketRows.length > 0 || live.extraOffers.length > 0;

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
              {row.ruleSummary ? <Text style={styles.rule}>{row.ruleSummary}</Text> : null}
              {row.agreement ? (
                <Text style={[styles.opinion, row.agreement === 'umbono_munye' ? styles.agree : styles.conflict]}>
                  {row.agreement === 'umbono_munye' ? 'ONE OPINION' : 'MACHINE/BOOK CONFLICT'}
                </Text>
              ) : null}
              {row.compliance != null ? (
                <ComplianceBadge
                  level={complianceFromPercent(row.compliance)}
                  value={row.compliance}
                  compact
                />
              ) : null}
            </View>
            <Text style={styles.dCell}>{row.book}</Text>
            <Text style={styles.dCell}>{row.market}</Text>
            <Text style={[styles.dCell, styles.odds]}>{row.odds.toFixed(2)}</Text>
            <View style={[styles.dCell, styles.edgeCell]}>
              {row.edge == null ? (
                <Text style={[styles.edge, styles.edgeNone]}>—</Text>
              ) : (
                <Text style={[styles.edge, row.edge >= 0 ? styles.edgePos : styles.edgeNeg]}>
                  {row.edge >= 0 ? '+' : ''}
                  {row.edge.toFixed(1)}%
                </Text>
              )}
              {row.betSlipLeg ? (
                <Pressable onPress={() => onAddLeg(row.betSlipLeg as BetSlipLeg)} style={styles.addBtn}>
                  <Text style={styles.addText}>+ SLIP</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ))}
      </View>

      <SectionLabel style={styles.compareTitle}>Same-fixture Bookmaker Comparison</SectionLabel>
      {live.comparisons.length > 0 ? (
        <View style={styles.comparisonList}>
          {live.comparisons.slice(0, 12).map((comparison) => (
            <View key={comparison.id} style={styles.comparisonCard}>
              <Text style={styles.comparisonFixture}>{comparison.fixture}</Text>
              <Text style={styles.comparisonMarket}>{comparison.market} — {comparison.selection}</Text>
              <Text style={styles.comparisonPrices}>
                Hollywoodbets {comparison.hollywoodOdds.toFixed(2)} · {comparison.bookmaker} {comparison.bookmakerOdds.toFixed(2)}
              </Text>
              <Text style={styles.bestPrice}>Best: {comparison.bestBookmaker} @ {comparison.bestOdds.toFixed(2)}</Text>
              <Pressable
                onPress={() => onAddLeg({
                  id: `best-${comparison.id}`,
                  fixture: comparison.fixture,
                  market: comparison.market,
                  selection: comparison.selection,
                  odds: comparison.bestOdds,
                  bookmaker: comparison.bestBookmaker,
                })}
                style={styles.compareAddBtn}>
                <Text style={styles.addText}>+ BEST PRICE TO SLIP</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.noComparison}>
          {live.extraOffers.length > 0
            ? 'Extra-bookmaker feed is live, but no fixture + market pair matches the selected Hollywood league yet.'
            : 'No extra-bookmaker value feed is available for comparison right now.'}
        </Text>
      )}

      <View style={styles.sources}>
        {live.bookmakers
          .slice(0, 20)
          .map((item, index) => (
            <View key={item.id} style={styles.sourceItem}>
              {index > 0 ? <Text style={styles.sourceDot}>·</Text> : null}
              <Text style={styles.sourceTag}>
                {item.name} · {item.status === 'planned' ? 'PLANNED' : item.status === 'live' ? 'LIVE' : 'PROVIDER'}
              </Text>
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
  rule: { fontFamily: fonts.body, fontSize: 9, color: theme.accentOrange, textAlign: 'center' },
  opinion: { fontFamily: fonts.bodySemiBold, fontSize: 8, letterSpacing: 0.5, textAlign: 'center' },
  agree: { color: theme.accentGreen },
  conflict: { color: theme.accentOrange },
  odds: {
    fontFamily: fonts.display,
    fontSize: 14,
    color: theme.accentBlue,
  },
  edge: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
  },
  edgeNone: {
    color: theme.textFaint,
  },
  edgePos: {
    color: theme.accentGreen,
  },
  edgeNeg: {
    color: theme.loss,
  },
  edgeCell: { alignItems: 'center', gap: 4 },
  addBtn: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 3,
    borderWidth: layout.borderWidth,
    borderColor: theme.accentBlue,
    borderRadius: layout.borderRadius,
  },
  addText: { fontFamily: fonts.bodySemiBold, fontSize: 8, color: theme.accentBlue },
  compareAddBtn: { marginTop: spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: 4, borderWidth: layout.borderWidth, borderColor: theme.accentBlue, borderRadius: layout.borderRadius },
  sources: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.lg,
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  compareTitle: { marginTop: spacing.xl, marginBottom: spacing.md, textAlign: 'center' },
  comparisonList: { width: '100%', maxWidth: 900, gap: spacing.sm },
  comparisonCard: {
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    backgroundColor: theme.surface,
    padding: spacing.sm,
    alignItems: 'center',
  },
  comparisonFixture: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: theme.textPrimary },
  comparisonMarket: { fontFamily: fonts.body, fontSize: 10, color: theme.textMuted, marginTop: 2 },
  comparisonPrices: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted, marginTop: spacing.xs },
  bestPrice: { fontFamily: fonts.bodySemiBold, fontSize: 11, color: theme.accentGreen, marginTop: 2 },
  noComparison: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted, textAlign: 'center', maxWidth: 600 },
  sourceItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sourceTag: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: theme.textMuted,
  },
  sourceDot: {
    color: theme.textFaint,
  },
});
