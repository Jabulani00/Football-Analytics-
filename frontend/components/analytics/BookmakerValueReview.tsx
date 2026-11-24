import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

import SectionLabel from '@/components/shared/SectionLabel';
import type { HollywoodPopularOddsState } from '@/hooks/useHollywoodPopularOdds';
import { fetchBetwayHunt } from '@/services/betwayHunt';
import { fetchBetwayEventMarkets } from '@/services/betwayMarkets';
import {
  betwayReviewOffers, hollywoodReviewOffers, matchBetwayEvents,
  type BetwayReviewSource, type ReviewOffer,
} from '@/services/bookmakerReview';
import { isBookmakerSelected } from '@/services/bookmakerSelection';
import {
  findPinnacleReference, parseMachineReference, supportedSelection,
  type MachineReferenceInput,
} from '@/services/bookmakerValue';
import {
  buildBookmakerValueTable, displayOdds, displayProbability, displaySigned,
} from '@/services/bookmakerValueTable';
import { fonts, layout, spacing, theme } from '@/styles/theme';
import type { BetSlipLeg } from '@/types/analytics';

const EMPTY_MODEL: MachineReferenceInput = { probabilityPct: '', source: '', version: '', capturedAt: '' };
const MAX_BETWAY_DETAIL_REQUESTS = 12;
const PAGE_SIZE = 12;

type BetwayState = {
  status: 'idle' | 'loading' | 'loaded' | 'error';
  sources: BetwayReviewSource[];
  message: string | null;
};

const time = (value: string | null) => value && Number.isFinite(Date.parse(value))
  ? new Date(value).toLocaleString() : 'unavailable';

function modelKey(offer: ReviewOffer): string {
  return `${offer.eventId}:${supportedSelection(offer.marketName, offer.selection)?.key ?? offer.id}`;
}

type AnalysedOffer = {
  offer: ReviewOffer;
  pinnacle: ReturnType<typeof findPinnacleReference>;
  machine: ReturnType<typeof parseMachineReference>;
  counterpart: ReviewOffer | null;
  table: ReturnType<typeof buildBookmakerValueTable>;
  input: MachineReferenceInput;
};

function analyseOffer(
  offer: ReviewOffer, offers: readonly ReviewOffer[], live: HollywoodPopularOddsState, input: MachineReferenceInput,
): AnalysedOffer {
  const pinnacle = findPinnacleReference(offer, live.pinnacleOdds, live.pinnacleCapturedAt);
  const machine = parseMachineReference(input);
  const key = supportedSelection(offer.marketName, offer.selection)?.key;
  const counterparts = offers.filter((other) => other.bookmaker !== offer.bookmaker &&
    other.eventId === offer.eventId && supportedSelection(other.marketName, other.selection)?.key === key &&
    Number.isFinite(Date.parse(other.kickoff)) && Number.isFinite(Date.parse(offer.kickoff)) &&
    Math.abs(Date.parse(other.kickoff) - Date.parse(offer.kickoff)) <= 5 * 60_000);
  const counterpart = counterparts.length === 1 ? counterparts[0] : null;
  return {
    offer, pinnacle, machine, counterpart, input,
    table: buildBookmakerValueTable({
      bookmaker: offer.bookmaker, bookOdds: offer.decimal, pinnacle, machine, counterpart,
    }),
  };
}

const SUMMARY_COLUMNS = [
  { label: 'Fixture / selection', width: 230 },
  { label: 'Bookmaker odds', width: 135 },
  { label: 'Implied / net', width: 130 },
  { label: 'Pinnacle / implied', width: 150 },
  { label: 'Bookmaker gaps', width: 155 },
  { label: 'No-vig inputs', width: 200 },
  { label: 'Reference 1', width: 165 },
  { label: 'Reference 2 (MM)', width: 165 },
];
const SUMMARY_WIDTH = SUMMARY_COLUMNS.reduce((sum, column) => sum + column.width, 0);
const DETAIL_COLUMNS = [
  { label: 'Step', flex: 1.2 },
  { label: 'Input / calculation', flex: 2 },
  { label: 'Result', flex: 1 },
];
const COMPACT_DETAIL_COLUMNS = [
  { label: 'Step / calculation', flex: 2.5 },
  { label: 'Result', flex: 1.2 },
];

function ComparisonTable({
  rows, selectedId, onSelect,
}: {
  rows: AnalysedOffer[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return <ScrollView horizontal style={styles.tableScroll} accessibilityLabel="Scroll reference comparisons horizontally">
    <View role="table" accessibilityLabel="Reference comparisons" style={[styles.table, { width: SUMMARY_WIDTH }]}>
      <View role="row" style={styles.tableHeader}>
        {SUMMARY_COLUMNS.map((column) => <Text key={column.label} role="columnheader"
          style={[styles.headerCell, { width: column.width }]}>{column.label}</Text>)}
      </View>
      {rows.map(({ offer, pinnacle, counterpart, table }, index) => <View key={offer.id} role="row"
        style={[styles.tableRow, index % 2 === 1 && styles.alternateRow, offer.id === selectedId && styles.selectedRow]}>
        <View role="cell" style={[styles.tableCell, { width: SUMMARY_COLUMNS[0].width }]}>
          <Pressable accessibilityRole="button" accessibilityLabel={`View calculations for ${offer.fixture}, ${offer.selection}, ${offer.bookmaker}`}
            accessibilityState={{ selected: offer.id === selectedId }} onPress={() => onSelect(offer.id)}>
            <Text style={styles.title}>{offer.fixture}</Text>
            <Text style={styles.text}>{offer.marketName} · {offer.selection}</Text>
            <Text style={styles.action}>{offer.id === selectedId ? 'SELECTED' : 'VIEW STEPS'}</Text>
          </Pressable>
        </View>
        <View role="cell" style={[styles.tableCell, { width: SUMMARY_COLUMNS[1].width }]}>
          <Text style={styles.title}>{offer.bookmaker}</Text>
          <Text style={styles.emphasis}>{displayOdds(offer.decimal)}</Text>
        </View>
        <View role="cell" style={[styles.tableCell, { width: SUMMARY_COLUMNS[2].width }]}>
          <Text style={styles.text}>{displayProbability(table.bookImplied)}</Text>
          <Text style={styles.note}>Net {(offer.decimal - 1).toFixed(4)}</Text>
        </View>
        <View role="cell" style={[styles.tableCell, { width: SUMMARY_COLUMNS[3].width }]}>
          {table.quote ? <>
            <Text style={styles.text}>{displayOdds(table.quote.odds)}</Text>
            <Text style={styles.note}>{displayProbability(1 / table.quote.odds)} implied</Text>
          </> : <Text style={styles.note}>Unavailable</Text>}
        </View>
        <View role="cell" style={[styles.tableCell, { width: SUMMARY_COLUMNS[4].width }]}>
          <Text style={styles.text}>{table.pinnacleGap
            ? `Pinnacle ${displayOdds(table.pinnacleGap.gap)} (${table.pinnacleGap.size})` : 'Pinnacle unavailable'}</Text>
          <Text style={styles.note}>{table.otherGap && counterpart
            ? `${counterpart.bookmaker} ${displayOdds(table.otherGap.gap)} (${table.otherGap.size})`
            : 'Other book unavailable'}</Text>
        </View>
        <View role="cell" style={[styles.tableCell, { width: SUMMARY_COLUMNS[5].width }]}>
          <Text style={styles.text}>{pinnacle.status === 'available'
            ? pinnacle.reference.outcomes.map((item) => `${item.outcome} ${displayOdds(item.odds)}`).join(' / ')
            : 'Unavailable'}</Text>
        </View>
        {[table.ref1, table.ref2].map((metrics, offset) => <View key={offset} role="cell"
          style={[styles.tableCell, { width: SUMMARY_COLUMNS[6 + offset].width }]}>
          {metrics ? <>
            <Text style={styles.text}>Fair {displayProbability(metrics.probability)}</Text>
            <Text style={[styles.emphasis, metrics.valuePp < 0 && styles.negative, metrics.valuePp > 0 && styles.positive]}>
              {displaySigned(metrics.valuePp)} pp
            </Text>
            <Text style={styles.note}>Shortfall {metrics.shortfallPp.toFixed(4)} pp</Text>
          </> : <Text style={styles.note}>Unavailable</Text>}
        </View>)}
      </View>)}
    </View>
  </ScrollView>;
}

function OfferDetail({
  analysis, onInput, selectedLegs, onToggleLeg,
}: {
  analysis: AnalysedOffer;
  onInput: (input: MachineReferenceInput) => void;
  selectedLegs: readonly BetSlipLeg[];
  onToggleLeg: (leg: BetSlipLeg) => void;
}) {
  const [showModelInput, setShowModelInput] = useState(false);
  const { width } = useWindowDimensions();
  const compact = width < 500;
  const columns = compact ? COMPACT_DETAIL_COLUMNS : DETAIL_COLUMNS;
  const { offer, pinnacle, machine, table, input } = analysis;
  const hasReferences = pinnacle.status === 'available' || machine.status === 'available';
  const leg = offer.betSlipLeg ? {
    ...offer.betSlipLeg,
    odds: offer.decimal,
    references: hasReferences ? {
      version: 'reference-comparison-v1' as const,
      bookmakerCapturedAt: offer.capturedAt,
      ...(pinnacle.status === 'available' ? { pinnacle: pinnacle.reference } : {}),
      ...(machine.status === 'available' ? { machine: machine.reference } : {}),
    } : undefined,
  } : null;
  const selected = leg != null && isBookmakerSelected(selectedLegs, leg);

  return <View style={styles.card}>
    <Text style={styles.title}>Calculation steps: {offer.fixture}</Text>
    <Text style={styles.text}>{offer.bookmaker} · {offer.marketName} · {offer.selection}</Text>
    <Text style={styles.note}>{offer.bookmaker} data received/observed {time(offer.capturedAt)}; quote time may differ.</Text>
    {table.quote ? <Text style={styles.note}>
      Pinnacle fixture {table.quote.fixtureId} · market {table.quote.marketKey} · received {time(table.quote.capturedAt)}.
    </Text> : null}
    {machine.status === 'available' ? <Text style={styles.note}>
      MM (unvalidated): {machine.reference.source} · version {machine.reference.version}
      {' · '}captured {time(machine.reference.capturedAt)}.
    </Text> : null}
    <Text style={styles.note}>
      Calculations use full precision; displayed results are rounded. Value and shortfall are in
      percentage points (pp); benchmark EV is a percentage. Units are hypothetical per unit staked.
    </Text>
    <View role="table" accessibilityLabel="Calculation steps" style={[styles.table, styles.detailTable]}>
      <View role="row" style={styles.tableHeader}>
        {columns.map((column) => <Text key={column.label} role="columnheader"
          style={[styles.headerCell, styles.flexCell, { flex: column.flex }]}>{column.label}</Text>)}
      </View>
      {table.steps.map((step, index) => <View key={step.id} role="row"
        style={[styles.tableRow, index % 2 === 1 && styles.alternateRow]}>
        <View role="rowheader" style={[styles.tableCell, styles.flexCell, { flex: columns[0].flex }]}>
          <Text style={styles.title}>{step.label}</Text>
          {compact ? <Text style={styles.text}>{step.calculation}</Text> : null}
        </View>
        {!compact ? <View role="cell" style={[styles.tableCell, styles.flexCell, { flex: DETAIL_COLUMNS[1].flex }]}>
          <Text style={styles.text}>{step.calculation}</Text>
        </View> : null}
        <View role="cell" style={[styles.tableCell, styles.flexCell, { flex: columns[columns.length - 1].flex }]}>
          <Text style={[styles.emphasis, step.tone === 'negative' && styles.negative,
            step.tone === 'positive' && styles.positive]}>{step.result}</Text>
        </View>
      </View>)}
    </View>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: showModelInput }}
      onPress={() => setShowModelInput((value) => !value)}>
      <Text style={styles.action}>{showModelInput ? 'Hide MM input' : 'Enter / edit MM probability'}</Text>
    </Pressable>
    {showModelInput ? <View style={styles.inputs}>
      {([
        ['probabilityPct', 'MM probability (%)', '55'],
        ['source', 'MM source', 'My model'],
        ['version', 'Model version', 'v1'],
        ['capturedAt', 'Model capture time (ISO 8601 with time zone)', '2026-11-21T09:05:30Z'],
      ] as const).map(([field, label, placeholder]) => <TextInput key={field}
        accessibilityLabel={label} placeholder={placeholder} placeholderTextColor={theme.textFaint}
        value={input[field]} onChangeText={(value) => onInput({ ...input, [field]: value })}
        keyboardType={field === 'probabilityPct' ? 'decimal-pad' : 'default'} style={styles.input} />)}
      <Text style={styles.note}>Enter only your own model output. Input is saved with the selection when you add it to the slip.</Text>
    </View> : null}
    {leg ? <Pressable accessibilityRole="button" accessibilityState={{ selected, disabled: machine.status === 'invalid' && !selected }}
      disabled={machine.status === 'invalid' && !selected} onPress={() => onToggleLeg(leg)} style={styles.button}>
      <Text style={styles.action}>{selected ? 'REMOVE FROM SLIP' : 'ADD TO SLIP WITH REFERENCES'}</Text>
    </Pressable> : <Text style={styles.note}>Comparison only: booking metadata for this selection is unavailable.</Text>}
    {selected ? <Text style={styles.note}>Remove and re-add to save changed reference inputs.</Text> : null}
  </View>;
}

export default function BookmakerValueReview({
  live, selectedLegs, onToggleLeg,
}: {
  live: HollywoodPopularOddsState;
  selectedLegs: readonly BetSlipLeg[];
  onToggleLeg: (leg: BetSlipLeg) => void;
}) {
  const [betway, setBetway] = useState<BetwayState>({ status: 'idle', sources: [], message: null });
  const [models, setModels] = useState<Record<string, MachineReferenceInput>>({});
  const [query, setQuery] = useState('');
  const [book, setBook] = useState<'all' | 'Hollywoodbets' | 'Betway'>('all');
  const [page, setPage] = useState(0);
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null);
  const generation = useRef(0);
  useEffect(() => {
    generation.current += 1;
    setBetway({ status: 'idle', sources: [], message: null });
    setModels({});
    setPage(0);
    setSelectedOfferId(null);
    return () => { generation.current += 1; };
  }, [live.categoryId, live.tournamentId, live.observedAt]);

  const offers = useMemo(() => {
    const context = live.tournamentId != null && live.categoryId != null ? {
      tournamentId: live.tournamentId, tournamentName: live.source?.tournamentName ?? '',
      countryId: live.categoryId,
    } : undefined;
    return [
      ...hollywoodReviewOffers(live.events, live.observedAt, context),
      ...betwayReviewOffers(live.events, betway.sources),
    ];
  }, [live.events, live.observedAt, live.tournamentId, live.categoryId, live.source?.tournamentName, betway.sources]);

  const loadBetway = async () => {
    const request = ++generation.current;
    setBetway({ status: 'loading', sources: [], message: null });
    try {
      const snapshot = await fetchBetwayHunt();
      const pairs = matchBetwayEvents(live.events, snapshot.currentEvents);
      const details = await Promise.allSettled(pairs.slice(0, MAX_BETWAY_DETAIL_REQUESTS).map(async ({ betway: event }) => {
        const response = await fetchBetwayEventMarkets(event.provider_event_id, 'All');
        return { event: { ...event, markets: response.markets }, marketsCapturedAt: new Date().toISOString() };
      }));
      if (generation.current !== request) return;
      const byId = new Map(details.flatMap((result) => result.status === 'fulfilled'
        ? [[result.value.event.provider_event_id, result.value] as const] : []));
      const sources = pairs.map(({ betway: event }) =>
        byId.get(event.provider_event_id) ?? { event, marketsCapturedAt: null });
      const failures = details.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
      const notices = [
        pairs.length === 0 ? 'No uniquely matched Betway fixture was found in this competition.' : null,
        failures.length ? `${failures.length} Betway market request(s) failed; only previously observed prices are available for those fixtures. ${failures[0].reason instanceof Error ? failures[0].reason.message : String(failures[0].reason)}` : null,
        pairs.length > MAX_BETWAY_DETAIL_REQUESTS
          ? `Detailed markets were requested for the first ${MAX_BETWAY_DETAIL_REQUESTS} matched fixtures.` : null,
      ].filter(Boolean);
      setBetway({ status: 'loaded', sources, message: notices.join(' ') || null });
    } catch (error) {
      if (generation.current === request) {
        setBetway({ status: 'error', sources: [], message: error instanceof Error ? error.message : 'Betway prices could not be loaded.' });
      }
    }
  };

  const filtered = offers.filter((offer) => (book === 'all' || offer.bookmaker === book) &&
    (!query.trim() || `${offer.fixture} ${offer.marketName} ${offer.selection}`.toLowerCase().includes(query.trim().toLowerCase())));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages - 1);
  const shown = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const rows = shown.map((offer) => analyseOffer(offer, offers, live, models[modelKey(offer)] ?? EMPTY_MODEL));
  const selectedOffer = rows.find(({ offer }) => offer.id === selectedOfferId) ?? rows[0];

  return <View style={styles.container}>
    <SectionLabel>Reference Value &amp; Relative Shortfall</SectionLabel>
    <Text style={styles.note}>
      Pinnacle is a closing-mode benchmark, not a live offer or ground truth. Value is reference probability
      minus the selected book&apos;s raw implied probability. Shortfall is hypothetical, not proof of wrongdoing.
      No result automatically qualifies a bet. Quote freshness is not established by the five-minute fixture match.
    </Text>
    <Pressable accessibilityRole="button" disabled={betway.status === 'loading' || live.events.length === 0}
      onPress={() => void loadBetway()} style={styles.button}>
      <Text style={styles.action}>{betway.status === 'loading' ? 'LOADING BETWAY MATCHES...' : 'LOAD / REFRESH BETWAY COMPARISONS'}</Text>
    </Pressable>
    <Text style={styles.note}>
      On demand: exact team names and kickoff, with up to 12 Betway market-detail requests.
      The existing Betway Hunt snapshot supplies matches; no new OddAlerts snapshot worker is required.
    </Text>
    {betway.message ? <Text accessibilityRole={betway.status === 'error' ? 'alert' : 'text'} style={styles.note}>{betway.message}</Text> : null}
    <Text style={styles.note}>
      Bookmaker shortfall leaderboard unavailable: comparable fresh quote times, reporting population,
      and aggregation rules must be agreed before ranking bookmakers.
    </Text>
    <View style={styles.filters}>
      <TextInput accessibilityLabel="Search reference comparisons" value={query} onChangeText={(value) => { setQuery(value); setPage(0); }}
        placeholder="Search fixture, market, or selection" placeholderTextColor={theme.textFaint} style={styles.input} />
      {(['all', 'Hollywoodbets', 'Betway'] as const).map((item) => <Pressable key={item}
        accessibilityRole="button" accessibilityState={{ selected: item === book }}
        onPress={() => { setBook(item); setPage(0); }} style={[styles.button, item === book && styles.activeButton]}>
        <Text style={styles.action}>{item === 'all' ? 'ALL BOOKS' : item.toUpperCase()}</Text>
      </Pressable>)}
    </View>
    <Text style={styles.note}>{filtered.length} selections · page {currentPage + 1} of {pages}</Text>
    {shown.length === 0 ? <Text style={styles.note}>
      {live.tournamentId == null ? 'Select a country and competition to review prices.' : 'No open supported selections match these filters.'}
    </Text> : null}
    {selectedOffer ? <>
      <Text style={styles.note}>Scroll the comparison table sideways. Select VIEW STEPS for a calculation breakdown and MM input.</Text>
      <ComparisonTable rows={rows} selectedId={selectedOffer.offer.id} onSelect={setSelectedOfferId} />
      <OfferDetail key={selectedOffer.offer.id} analysis={selectedOffer}
        onInput={(value) => setModels((previous) => ({ ...previous, [modelKey(selectedOffer.offer)]: value }))}
        selectedLegs={selectedLegs} onToggleLeg={onToggleLeg} />
    </> : null}
    {pages > 1 ? <View style={styles.filters}>
      <Pressable accessibilityRole="button" disabled={currentPage === 0} onPress={() => setPage(currentPage - 1)}>
        <Text style={styles.action}>Previous</Text>
      </Pressable>
      <Text style={styles.note}>Page {currentPage + 1} of {pages}</Text>
      <Pressable accessibilityRole="button" disabled={currentPage + 1 >= pages} onPress={() => setPage(currentPage + 1)}>
        <Text style={styles.action}>Next</Text>
      </Pressable>
    </View> : null}
  </View>;
}

const styles = StyleSheet.create({
  container: { width: '100%', gap: spacing.sm, alignItems: 'center', marginVertical: spacing.lg },
  card: { width: '100%', padding: spacing.md, gap: spacing.xs, backgroundColor: theme.surface,
    borderWidth: layout.borderWidth, borderColor: theme.border, borderRadius: layout.borderRadius },
  title: { color: theme.textPrimary, fontFamily: fonts.bodySemiBold, fontSize: 13 },
  text: { color: theme.textPrimary, fontFamily: fonts.body, fontSize: 12, lineHeight: 19 },
  emphasis: { color: theme.accentBlue, fontFamily: fonts.bodySemiBold, fontSize: 12, lineHeight: 19 },
  note: { color: theme.textMuted, fontFamily: fonts.body, fontSize: 11, lineHeight: 18 },
  tableScroll: { width: '100%', flexGrow: 0 },
  table: { borderWidth: layout.borderWidth, borderColor: theme.borderStrong, backgroundColor: theme.surface },
  detailTable: { width: '100%' },
  flexCell: { minWidth: 0 },
  tableHeader: { flexDirection: 'row', backgroundColor: theme.surfaceMuted },
  headerCell: { padding: spacing.sm, color: theme.textPrimary, fontFamily: fonts.bodySemiBold, fontSize: 11,
    borderRightWidth: layout.borderWidth, borderRightColor: theme.borderStrong },
  tableRow: { flexDirection: 'row', borderTopWidth: layout.borderWidth, borderTopColor: theme.border },
  alternateRow: { backgroundColor: theme.surfaceHover },
  selectedRow: { backgroundColor: '#EFF6FF' },
  tableCell: { padding: spacing.sm, borderRightWidth: layout.borderWidth, borderRightColor: theme.border,
    justifyContent: 'center', gap: spacing.xs },
  negative: { color: theme.loss },
  positive: { color: theme.win },
  filters: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center' },
  inputs: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  input: { flexGrow: 1, minWidth: 150, color: theme.textPrimary, fontFamily: fonts.body, fontSize: 12,
    borderWidth: layout.borderWidth, borderColor: theme.border, borderRadius: layout.borderRadius, padding: spacing.sm },
  button: { borderWidth: layout.borderWidth, borderColor: theme.accentBlue, borderRadius: layout.borderRadius,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, alignSelf: 'flex-start' },
  activeButton: { backgroundColor: theme.surfaceMuted },
  action: { color: theme.accentBlue, fontFamily: fonts.bodySemiBold, fontSize: 11 },
});
