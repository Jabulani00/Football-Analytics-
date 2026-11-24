import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import SectionLabel from '@/components/shared/SectionLabel';
import type { HollywoodPopularOddsState } from '@/hooks/useHollywoodPopularOdds';
import { fetchBetwayHunt } from '@/services/betwayHunt';
import { fetchBetwayEventMarkets } from '@/services/betwayMarkets';
import { comparePriceGap } from '@/services/bookmakerClassification';
import {
  betwayReviewOffers, hollywoodReviewOffers, matchBetwayEvents,
  type BetwayReviewSource, type ReviewOffer,
} from '@/services/bookmakerReview';
import { isBookmakerSelected } from '@/services/bookmakerSelection';
import {
  compareReference, findPinnacleReference, parseMachineReference, supportedSelection,
  type MachineReferenceInput, type ReferenceMetrics,
} from '@/services/bookmakerValue';
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
const pct = (value: number) => `${(value * 100).toFixed(4)}%`;
const signed = (value: number, digits = 4) => `${value >= 0 ? '+' : ''}${value.toFixed(digits)}`;
const odds = (value: number) => Number(value.toFixed(2)) === value ? value.toFixed(2) : String(value);

function modelKey(offer: ReviewOffer): string {
  return `${offer.eventId}:${supportedSelection(offer.marketName, offer.selection)?.key ?? offer.id}`;
}

function Metrics({ label, metrics }: { label: string; metrics: ReferenceMetrics }) {
  return <View style={styles.metricBox}>
    <Text style={styles.emphasis}>{label}: value {signed(metrics.valuePp)} pp · shortfall {metrics.shortfallPp.toFixed(4)} pp</Text>
    <Text style={styles.text}>
      Fair odds {metrics.fairOdds == null ? 'unavailable' : metrics.fairOdds.toFixed(4)}
      {' · '}odds difference {metrics.oddsDifference == null ? 'unavailable' : signed(metrics.oddsDifference)}
      {' · '}benchmark EV {signed(metrics.benchmarkEvPct, 2)}%
      {' · '}shortfall {metrics.shortfallUnitsPerUnit.toFixed(4)} units per unit staked
    </Text>
  </View>;
}

function OfferCard({
  offer, offers, live, input, onInput, selectedLegs, onToggleLeg,
}: {
  offer: ReviewOffer;
  offers: readonly ReviewOffer[];
  live: HollywoodPopularOddsState;
  input: MachineReferenceInput;
  onInput: (input: MachineReferenceInput) => void;
  selectedLegs: readonly BetSlipLeg[];
  onToggleLeg: (leg: BetSlipLeg) => void;
}) {
  const [showModelInput, setShowModelInput] = useState(false);
  const pinnacle = findPinnacleReference(offer, live.pinnacleOdds, live.pinnacleCapturedAt);
  const quote = pinnacle.status === 'available' ? pinnacle.reference : pinnacle.quote;
  const ref1 = pinnacle.status === 'available'
    ? compareReference(offer.decimal, pinnacle.reference.probability) : null;
  const machine = parseMachineReference(input);
  const ref2 = machine.status === 'available' ? compareReference(offer.decimal, machine.reference.probability) : null;
  const key = supportedSelection(offer.marketName, offer.selection)?.key;
  const counterparts = offers.filter((other) => other.bookmaker !== offer.bookmaker &&
    other.eventId === offer.eventId && supportedSelection(other.marketName, other.selection)?.key === key &&
    Number.isFinite(Date.parse(other.kickoff)) && Number.isFinite(Date.parse(offer.kickoff)) &&
    Math.abs(Date.parse(other.kickoff) - Date.parse(offer.kickoff)) <= 5 * 60_000);
  const counterpart = counterparts.length === 1 ? counterparts[0] : null;
  const pinnacleGap = quote ? comparePriceGap(offer.decimal, quote.odds) : null;
  const otherGap = counterpart ? comparePriceGap(offer.decimal, counterpart.decimal) : null;
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
    <Text style={styles.title}>{offer.fixture}</Text>
    <Text style={styles.text}>{offer.marketName} — {offer.selection}</Text>
    <Text style={styles.emphasis}>
      {offer.bookmaker} @ {odds(offer.decimal)} · implied {pct(1 / offer.decimal)}
      {' · '}net odds {(offer.decimal - 1).toFixed(4)}
    </Text>
    <Text style={styles.note}>{offer.bookmaker} data received/observed {time(offer.capturedAt)}; quote time may differ.</Text>
    {quote ? <Text style={styles.text}>
      Pinnacle closing-mode @ {odds(quote.odds)} · implied {pct(1 / quote.odds)}
      {pinnacleGap ? ` · bookmaker gap ${pinnacleGap.gap} (${pinnacleGap.size})` : ''}
    </Text> : <Text style={styles.note}>Pinnacle selection price unavailable.</Text>}
    {otherGap && counterpart ? <Text style={styles.text}>
      {offer.bookmaker} / {counterpart.bookmaker} same-selection gap {otherGap.gap} ({otherGap.size})
      {' · '}{counterpart.bookmaker} @ {odds(counterpart.decimal)}
    </Text> : null}
    {pinnacle.status === 'available' && ref1 ? <>
      <Text style={styles.text}>
        Reference 1: {pct(pinnacle.reference.probability)} · Pinnacle fixture {pinnacle.reference.fixtureId}
        {' · '}market {pinnacle.reference.marketKey} · received {time(pinnacle.reference.capturedAt)}
      </Text>
      <Text style={styles.note}>
        No-vig inputs: {pinnacle.reference.outcomes.map((item) => `${item.outcome} ${odds(item.odds)}`).join(' / ')}.
      </Text>
      <Metrics label="Pinnacle reference" metrics={ref1} />
    </> : <Text style={styles.note}>Reference 1 unavailable: {pinnacle.status === 'unavailable' ? pinnacle.reason : 'Invalid inputs.'}</Text>}

    {machine.status === 'available' && ref2 ? <>
      <Text style={styles.text}>
        Reference 2 (MM): {pct(machine.reference.probability)} · {machine.reference.source}
        {' · '}version {machine.reference.version} · captured {time(machine.reference.capturedAt)}
      </Text>
      <Metrics label="MM reference (unvalidated)" metrics={ref2} />
    </> : <Text style={styles.note}>
      Reference 2 (MM): {machine.status === 'invalid' ? machine.reason : 'unavailable until you supply your model probability and provenance.'}
    </Text>}
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
  const generation = useRef(0);
  useEffect(() => {
    generation.current += 1;
    setBetway({ status: 'idle', sources: [], message: null });
    setModels({});
    setPage(0);
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
    {shown.map((offer) => {
      const key = modelKey(offer);
      return <OfferCard key={offer.id} offer={offer} offers={offers} live={live}
        input={models[key] ?? EMPTY_MODEL} onInput={(value) => setModels((previous) => ({ ...previous, [key]: value }))}
        selectedLegs={selectedLegs} onToggleLeg={onToggleLeg} />;
    })}
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
  metricBox: { borderLeftWidth: 2, borderLeftColor: theme.accentBlue, paddingLeft: spacing.sm, gap: spacing.xs },
  filters: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center' },
  inputs: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  input: { flexGrow: 1, minWidth: 150, color: theme.textPrimary, fontFamily: fonts.body, fontSize: 12,
    borderWidth: layout.borderWidth, borderColor: theme.border, borderRadius: layout.borderRadius, padding: spacing.sm },
  button: { borderWidth: layout.borderWidth, borderColor: theme.accentBlue, borderRadius: layout.borderRadius,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, alignSelf: 'flex-start' },
  activeButton: { backgroundColor: theme.surfaceMuted },
  action: { color: theme.accentBlue, fontFamily: fonts.bodySemiBold, fontSize: 11 },
});
