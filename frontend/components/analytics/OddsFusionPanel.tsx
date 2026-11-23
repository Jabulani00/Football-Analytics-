import { isBookmakerSelected } from '@/services/bookmakerSelection';
import BookmakerFixtures from '@/components/analytics/BookmakerFixtures';
import { hollywoodFixture } from '@/services/bookmakerFixtures';
import { fetchEventDetail } from '@/services/hollywoodbets';
import { matchHollywoodWithPinnacle } from '@/services/bookmakerAdapter';
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
function formatCapturedAt(value: string | null): string {
  if (!value) return 'capture time unavailable';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'capture time unavailable' : date.toLocaleString();
}

function formatPrice(value: number | null): string {
  return value == null ? '—' : value.toFixed(2);
}

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
  selectedLegs = [],
}: {
  selectedLegs?: readonly BetSlipLeg[];
  live: HollywoodPopularOddsState;
  onAddLeg: (leg: BetSlipLeg) => void;
}) {
  const [showModel, setShowModel] = useState(false);
  const fixtures = useMemo(() => live.events.map((event) => hollywoodFixture(event, live.observedAt, live.tournamentId != null && live.categoryId != null ? { tournamentId: live.tournamentId, tournamentName: live.source?.tournamentName ?? event.tournament, countryId: live.categoryId } : undefined)), [live.events, live.observedAt, live.tournamentId, live.categoryId, live.source?.tournamentName]);
  const [query, setQuery] = useState('');
  const [market, setMarket] = useState('');
  const [pinnacleMarket, setPinnacleMarket] = useState('');
  const [page, setPage] = useState(0);
  useEffect(() => { setQuery(''); setMarket(''); setPinnacleMarket(''); setPage(0); }, [live.categoryId, live.tournamentId]);
  const allRows = useMemo<DisplayRow[]>(() => live.marketRows.length > 0
    ? live.marketRows.map(fromMarket) : live.rows.map(fromFusion), [live.rows, live.marketRows]);
  const markets = [...new Set(allRows.map((row) => row.marketName))];
  const activeMarket = markets.includes(market) ? market : '';
  const shown = paginateFusionRows(allRows, query, activeMarket, page);
  const rows = shown.rows;
  const isLive = allRows.length > 0;
  const pinnacleMarkets = useMemo(() => {
    const names = new Map<string, string>();
    for (const fixture of live.pinnacleOdds) {
      for (const item of fixture.markets) names.set(item.marketKey, item.marketName);
    }
    return [...names.entries()]
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [live.pinnacleOdds]);
  const activePinnacleMarket = pinnacleMarkets.some((item) => item.key === pinnacleMarket)
    ? pinnacleMarket
    : '';
  const pinnacleFixtures = live.pinnacleOdds
    .map((fixture) => {
      const markets = fixture.markets.filter((item) =>
        !activePinnacleMarket || item.marketKey === activePinnacleMarket,
      );
      const selections = markets.flatMap((item) => item.selections);
      return {
        ...fixture,
        markets,
        historySelectionCount: selections.filter((selection) =>
          selection.opening != null || selection.closing != null || selection.peak != null,
        ).length,
        displayedSelectionCount: selections.length,
      };
    })
    .filter((fixture) => fixture.markets.length > 0);
  const hasCurrentPinnaclePrices = live.pinnacleOdds.some((fixture) =>
    fixture.markets.some((item) => item.selections.some((selection) =>
      selection.current != null,
    )),
  );
  const pinnacleSelectionMatches = useMemo(
    () => matchHollywoodWithPinnacle(
      live.marketRows,
      live.pinnacleOdds,
      live.pinnacleCapturedAt,
    ),
    [live.marketRows, live.pinnacleOdds, live.pinnacleCapturedAt],
  );
  const pinnaclePriceFixtureCount = live.pinnacleOdds.filter((fixture) =>
    fixture.markets.some((item) => item.selections.some((selection) =>
      selection.current != null ||
      selection.opening != null ||
      selection.closing != null ||
      selection.peak != null,
    )),
  ).length;

  return (
    <View style={styles.container}>
      <BookmakerFixtures key={`${live.categoryId}-${live.tournamentId}`} showLocationFilters={false} fixtures={fixtures} selectedLegs={selectedLegs} onToggleLeg={onAddLeg} loadMarkets={async (id) => {
        const event = await fetchEventDetail(Number(id));
        if (!event) throw new Error('This fixture is no longer offered by Hollywoodbets.');
        return hollywoodFixture(event, new Date().toISOString(), live.tournamentId != null && live.categoryId != null ? { tournamentId: live.tournamentId, tournamentName: live.source?.tournamentName ?? event.tournament, countryId: live.categoryId } : undefined);
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
                <Pressable onPress={() => onAddLeg(row.betSlipLeg as BetSlipLeg)} style={[styles.addBtn, isBookmakerSelected(selectedLegs, row.betSlipLeg) && styles.selectedSlip]}>
                  <Text style={styles.addText}>{isBookmakerSelected(selectedLegs, row.betSlipLeg) ? 'SELECTED' : '+ SLIP'}</Text>
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

      <SectionLabel style={styles.compareTitle}>Pinnacle Market Odds & Closing History</SectionLabel>
      <Text style={styles.snapshotNote}>
        The OddAlerts market catalog is queried for Pinnacle across up to 12 matched fixtures.
        Only markets with returned Pinnacle prices appear. The upcoming snapshot uses closing-odds
        mode; opening, closing, and peak are the provider&apos;s recorded history, not live odds.
      </Text>
      {live.pinnacleCapturedAt ? (
        <Text style={styles.sourceNote}>
          OddAlerts data received {formatCapturedAt(live.pinnacleCapturedAt)} ·
          {live.pinnacleMatchedFixtureCount} fixtures matched ·
          {pinnaclePriceFixtureCount} with Pinnacle prices ·
          {pinnacleMarkets.length} markets returned from {live.pinnacleCatalogMarketCount} catalog markets
        </Text>
      ) : null}
      {live.pinnacleLoading ? (
        <Text style={styles.noComparison}>Loading Pinnacle market snapshot and batched history…</Text>
      ) : null}
      {live.pinnacleError ? (
        <Text style={styles.pinnacleError}>{live.pinnacleError}</Text>
      ) : null}
      {live.pinnacleWarning ? (
        <Text style={styles.snapshotNote}>{live.pinnacleWarning}</Text>
      ) : null}
      {pinnacleMarkets.length > 0 ? (
        <View style={styles.filters}>
          <FilterDropdown
            label="Pinnacle market"
            value={activePinnacleMarket}
            options={[
              { value: '', label: 'All returned markets' },
              ...pinnacleMarkets.map((item) => ({
                value: item.key,
                label: `${item.label} (${item.key})`,
              })),
            ]}
            onChange={setPinnacleMarket}
            style={styles.pinnacleFilter}
          />
        </View>
      ) : null}
      {pinnacleFixtures.length > 0 ? (
        <View style={styles.comparisonList}>
          {pinnacleFixtures.map((fixture) => (
            <View key={fixture.eventId} style={styles.comparisonCard}>
              <Text style={styles.comparisonFixture}>{fixture.fixture}</Text>
              <Text style={styles.comparisonMarket}>
                Matched via OddAlerts fixture ID {fixture.oddAlertsFixtureId}
              </Text>
              {fixture.latestPriceAt ? (
                <Text style={styles.comparisonMarket}>
                  Latest snapshot timestamp {formatCapturedAt(fixture.latestPriceAt)}
                </Text>
              ) : null}
              {live.pinnacleHistoryRowCount !== null ? (
                <Text style={styles.comparisonMarket}>
                  {fixture.historyRowCount === 0
                    ? 'OddAlerts returned no historical price rows for this fixture in this capture.'
                    : `${fixture.historySelectionCount} of ${fixture.displayedSelectionCount} displayed selections have history (${fixture.historyRowCount} rows returned).`}
                </Text>
              ) : null}
              {fixture.markets.map((item) => (
                <View key={`${item.marketId ?? item.marketKey}`} style={styles.pinnacleMarketBlock}>
                  <Text style={styles.pinnacleMarketName}>
                    {item.marketName} · {item.marketKey}
                  </Text>
                  <View style={styles.pinnacleHeader}>
                    <Text style={[styles.pinnacleCell, styles.pinnacleOutcome]}>Selection</Text>
                    <Text style={styles.pinnacleCell}>Snapshot</Text>
                    <Text style={styles.pinnacleCell}>Opening</Text>
                    <Text style={styles.pinnacleCell}>Closing</Text>
                    <Text style={styles.pinnacleCell}>Peak</Text>
                  </View>
                  {item.selections.map((selection) => (
                    <View key={selection.key} style={styles.pinnacleRow}>
                      <Text style={[styles.pinnacleCell, styles.pinnacleOutcome]}>
                        {selection.label}
                      </Text>
                      <Text style={styles.pinnacleCell}>{formatPrice(selection.current)}</Text>
                      <Text style={styles.pinnacleCell}>{formatPrice(selection.opening)}</Text>
                      <Text style={styles.pinnacleCell}>{formatPrice(selection.closing)}</Text>
                      <Text style={styles.pinnacleCell}>{formatPrice(selection.peak)}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          ))}
        </View>
      ) : !live.pinnacleLoading && !live.pinnacleError && !live.error
        && live.tournamentId != null && live.pinnacleCapturedAt ? (
        <Text style={styles.noComparison}>
          {live.pinnacleMatchedFixtureCount === 0
            ? 'No selected Hollywood fixture matched an OddAlerts fixture ID in the upcoming window, so Pinnacle markets could not be checked.'
            : `Matched ${live.pinnacleMatchedFixtureCount} fixture(s), but OddAlerts returned no Pinnacle market prices for them.`}
        </Text>
      ) : null}

      <SectionLabel style={styles.compareTitle}>Hollywood ? Pinnacle Exact Selection Matches</SectionLabel>
      <Text style={styles.snapshotNote}>
        Fixture IDs are associated first; this list includes only the same outcome, market, period,
        and line when the provider kickoff is within 5 minutes. Pinnacle prices are closing-mode
        snapshots, not live offers.
      </Text>
      {pinnacleSelectionMatches.length > 0 ? (
        <View style={styles.comparisonList}>
          {pinnacleSelectionMatches.slice(0, 20).map((match) => (
            <View key={match.id} style={styles.comparisonCard}>
              <Text style={styles.comparisonFixture}>{match.fixture}</Text>
              <Text style={styles.comparisonMarket}>
                {match.market} ? {match.selection}
              </Text>
              <Text style={styles.comparisonPrices}>
                Hollywoodbets @ {match.hollywoodOdds.toFixed(2)} ? Pinnacle closing-mode @ {match.pinnacleOdds.toFixed(2)}
              </Text>
              <Text style={styles.comparisonMarket}>
                OddAlerts fixture ID {match.oddAlertsFixtureId} ? kickoff difference {match.kickoffDeltaSeconds}s
              </Text>
              <Text style={styles.comparisonMarket}>
                Pinnacle snapshot received {formatCapturedAt(match.capturedAt)}
                {match.providerUpdatedAt
                  ? ` ? provider timestamp ${formatCapturedAt(match.providerUpdatedAt)}`
                  : ''}
              </Text>
            </View>
          ))}
        </View>
      ) : live.pinnacleCapturedAt && !live.pinnacleLoading ? (
        <Text style={styles.noComparison}>
          {live.pinnacleMatchedFixtureCount === 0
            ? 'No Hollywood fixture matched an OddAlerts fixture ID in this capture.'
            : !hasCurrentPinnaclePrices
              ? 'Fixture IDs matched, but no current Pinnacle snapshot prices were returned.'
              : 'Pinnacle prices were returned, but none matched the same market, period, line, and outcome within the 5-minute kickoff window.'}
        </Text>
      ) : null}

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
  selectedSlip: { backgroundColor: '#189F84', borderColor: '#FFD43B', borderWidth: 2 },
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
  pinnacleError: { fontFamily: fonts.body, fontSize: 11, color: theme.loss,
    textAlign: 'center', maxWidth: 720, marginBottom: spacing.md },
  pinnacleHeader: { width: '100%', flexDirection: 'row', borderBottomWidth: layout.borderWidth,
    borderBottomColor: theme.border, paddingVertical: spacing.xs, marginTop: spacing.sm },
  pinnacleRow: { width: '100%', flexDirection: 'row', paddingVertical: spacing.xs, alignItems: 'center' },
  pinnacleCell: { flex: 1, textAlign: 'center', fontFamily: fonts.body, fontSize: 10,
    color: theme.textMuted },
  pinnacleOutcome: { flex: 1.4, textAlign: 'left', fontFamily: fonts.bodySemiBold, color: theme.textPrimary },
  pinnacleFilter: { width: '100%', maxWidth: 520, flexBasis: 'auto' },
  pinnacleMarketBlock: { width: '100%', marginTop: spacing.sm },
  pinnacleMarketName: { fontFamily: fonts.bodySemiBold, fontSize: 11,
    color: theme.accentBlue, textAlign: 'left', marginTop: spacing.xs },
  snapshotNote: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted, textAlign: 'center',
    maxWidth: 720, marginBottom: spacing.md, lineHeight: 17 },
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
