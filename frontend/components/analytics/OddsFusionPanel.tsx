import BookmakerFixtures from '@/components/analytics/BookmakerFixtures';
import { hollywoodFixture } from '@/services/bookmakerFixtures';
import { fetchEventDetail } from '@/services/hollywoodbets';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import ComplianceBadge from '@/components/analytics/ComplianceBadge';
import SectionLabel from '@/components/shared/SectionLabel';
import type { HollywoodPopularOddsState } from '@/hooks/useHollywoodPopularOdds';
import FilterDropdown from '@/components/shared/FilterDropdown';
import { paginateFusionRows } from '@/services/hollywoodFusionView';
import type { FusionRow, MarketRow } from '@/services/hollywoodFusion';
import { complianceFromPercent } from '@/utils/compliance';
import { fonts, layout, spacing, theme } from '@/styles/theme';
import type { BetSlipLeg } from '@/types/analytics';

/** Hollywood selections only; other bookmakers appear in the matched comparison below. */
type DisplayRow = {
  eventId: number;
  marketName: string;
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
    eventId: row.eventId,
    marketName: row.marketName,
    id: `${row.eventId}-${row.betTypeId}-${row.marketNumber}-${i}`,
    fixture: row.fixture,
    signal,
    compliance: modelPct == null ? null : Math.round(modelPct),
    book: 'Hollywoodbets',
    market: `${row.marketName} — ${row.selection}`,
    odds: row.decimal,
    edge: row.edgePct,
    agreement: row.agreement,
    ruleSummary: null,
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
    eventId: row.eventId,
    marketName: 'Full Time',
    id: String(row.eventId),
    fixture: row.fixture,
    signal,
    compliance: modelPct == null ? null : Math.round(modelPct),
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
  const [showModel, setShowModel] = useState(false);
  const fixtures = useMemo(() => live.events.map((event) => hollywoodFixture(event, live.observedAt)), [live.events, live.observedAt]);
  const [query, setQuery] = useState('');
  const [market, setMarket] = useState('');
  const [page, setPage] = useState(0);
  useEffect(() => { setQuery(''); setMarket(''); setPage(0); }, [live.categoryId, live.tournamentId]);
  const allRows = useMemo<DisplayRow[]>(() => live.marketRows.length > 0
    ? live.marketRows.map(fromMarket) : live.rows.map(fromFusion), [live.rows, live.marketRows]);
  const markets = [...new Set(allRows.map((row) => row.marketName))];
  const activeMarket = markets.includes(market) ? market : '';
  const shown = paginateFusionRows(allRows, query, activeMarket, page);
  const rows = shown.rows;
  const isLive = allRows.length > 0;

  return (
    <View style={styles.container}>
      <BookmakerFixtures key={`${live.categoryId}-${live.tournamentId}`} showLocationFilters={false} fixtures={fixtures} loadMarkets={async (id) => {
        const event = await fetchEventDetail(Number(id));
        if (!event) throw new Error('This fixture is no longer offered by Hollywoodbets.');
        return hollywoodFixture(event, new Date().toISOString());
      }} />
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: showModel }} onPress={() => setShowModel((value) => !value)}>
        <Text style={styles.sourceNote}>{showModel ? 'Hide model comparison and slip tools' : 'Show model comparison and slip tools'}</Text>
      </Pressable>
      {showModel ? <>
      <Text style={styles.intro}>
        Browse Hollywoodbets prices for your selected country and competition.
        Matched model evidence adds probability comparisons and value analysis when available.
      </Text>

      <View style={styles.sectionRow}>
        <SectionLabel style={styles.section}>Odds Fusion - Hollywoodbets</SectionLabel>
        <Text style={[styles.liveTag, isLive ? styles.liveOn : styles.liveOff]}>
          {live.loading ? 'LOADING...' : isLive ? 'HOLLYWOOD PRICES' : 'NO PRICES'}
        </Text>
      </View>
      {isLive && live.source ? (
        <Text style={styles.sourceNote}>
          {live.source.categoryName} · {live.source.tournamentName}
        </Text>
      ) : null}

      <View style={styles.filters}>
        <TextInput accessibilityLabel="Search Hollywood fixtures" placeholder="Search teams in this competition"
          placeholderTextColor={theme.textMuted} value={query}
          onChangeText={(value) => { setQuery(value); setPage(0); }} style={styles.search} />
        <FilterDropdown label="Market" value={activeMarket}
          options={[{ value: '', label: 'All supported markets' }, ...markets.map((name) => ({ value: name, label: name }))]}
          onChange={(value) => { setMarket(value); setPage(0); }} />
      </View>
      <Text style={styles.sourceNote}>
        Showing {shown.visibleFixtureCount} of {shown.fixtureCount} matching fixtures / {shown.selectionCount} selections
      </Text>
      {!live.loading && rows.length === 0 ? <Text style={styles.sourceNote}>
        {live.tournamentId == null ? 'Choose a country and competition above.'
          : live.error ? 'Prices are unavailable. Use Refresh to retry.'
          : allRows.length > 0 ? 'No fixtures match your search or market filter.'
          : 'No supported open prices were returned for this competition.'}
      </Text> : null}

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

      {shown.pageCount > 1 ? <View style={styles.filters}>
        <Pressable accessibilityRole="button" disabled={shown.page === 0} onPress={() => setPage(shown.page - 1)}>
          <Text style={styles.sourceNote}>Previous</Text>
        </Pressable>
        <Text style={styles.sourceNote}>Page {shown.page + 1} of {shown.pageCount}</Text>
        <Pressable accessibilityRole="button" disabled={shown.page + 1 >= shown.pageCount} onPress={() => setPage(shown.page + 1)}>
          <Text style={styles.sourceNote}>Next</Text>
        </Pressable>
      </View> : null}

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
      </> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  filters: { width: '100%', maxWidth: 900, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  search: { flexGrow: 1, minWidth: 220, padding: spacing.md, color: theme.textPrimary,
    borderWidth: 1, borderColor: theme.border, borderRadius: 8, fontFamily: fonts.body },
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
  comparisonList: { width: '100%', gap: spacing.sm },
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
