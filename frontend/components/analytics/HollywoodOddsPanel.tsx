import { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import SectionLabel from '@/components/shared/SectionLabel';
import { useHollywoodExport } from '@/hooks/useHollywoodExport';
import { useHollywoodHunt } from '@/hooks/useHollywoodHunt';
import { useHollywoodNav } from '@/hooks/useHollywoodNav';
import { useHollywoodOdds } from '@/hooks/useHollywoodOdds';
import {
  BET_TYPE,
  fetchEventDetail,
  marketGroups,
  toDecimal,
  toShareLeg,
  type HbEvent,
  type ShareLeg,
} from '@/services/hollywoodbets';
import { fonts, layout, spacing, theme } from '@/styles/theme';
import type { BetSlipLeg } from '@/types/analytics';

type Pick = '1' | 'X' | '2';
const PICK_NUMBER: Record<Pick, number> = { '1': 1, X: 2, '2': 3 };

/**
 * A chosen selection, from ANY market rather than 1X2 only.
 *
 * Still keyed one-per-event: books routinely reject correlated legs from the
 * same fixture in one slip (Over 2.5 and BTTS Yes on the same match, say), so
 * picking a second market on a fixture replaces the first rather than stacking.
 */
type Selection = {
  betTypeId: number;
  marketNumber: number;
  label: string;
  leg: ShareLeg;
  odds: number;
};

/**
 * Build the Share-A-Bet leg + decimal price for any market selection.
 *
 * Scans EVERY group carrying this bet type, not just the first. A market split
 * across groups (Additional Totals is five, one per goal line) keeps its
 * selection numbers spread across them, so `find` on the first group would miss
 * OVER 3.5 entirely and the tap would do nothing. The group also has to be the
 * right one because its `eventBetTypeMapID` is what the booking code is built
 * from — the wrong group would reserve the wrong bet.
 */
function legFor(
  event: HbEvent,
  betTypeId: number,
  marketNumber: number,
  label: string,
  ctx: { tournamentId: number; tournamentName: string; countryId: number },
): Selection | null {
  for (const bt of event.betTypes) {
    if (bt.id !== betTypeId) continue;
    const market = bt.markets.find((m) => m.number === marketNumber);
    if (!market) continue;
    return {
      betTypeId,
      marketNumber,
      label,
      leg: toShareLeg(event, bt, market, ctx),
      odds: toDecimal(market.odds),
    };
  }
  return null;
}

/**
 * Every market beyond 1X2 that the book priced for this fixture, each selection
 * tappable and slip-ready. Markets with many outcomes (Correct Score carries 29)
 * scroll horizontally rather than wrapping into a wall of buttons.
 */
function ExtraMarkets({
  event,
  selected,
  onPick,
}: {
  event: HbEvent;
  selected: Selection | undefined;
  onPick: (betTypeId: number, marketNumber: number, label: string) => void;
}) {
  // Split groups are merged here, so "Additional Totals" is one market with all
  // its goal lines rather than five separate two-selection rows.
  const groups = marketGroups(event).filter((g) => g.betTypeId !== BET_TYPE.FULL_TIME);
  if (groups.length === 0) return null;

  return (
    <View style={styles.extras}>
      {groups.map((g) => (
        <View key={g.betTypeId} style={styles.marketGroup}>
          <Text style={styles.marketName}>{g.name}</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.marketRow}>
            {g.selections.map((m, i) => {
              const isSel =
                selected?.betTypeId === g.betTypeId && selected.marketNumber === m.number;
              // The book marks a market unavailable rather than removing it.
              const open = (m.status ?? '').toLowerCase() === 'active';
              return (
                <Pressable
                  key={`${g.betTypeId}-${m.number}-${i}`}
                  disabled={!open}
                  onPress={() => onPick(g.betTypeId, m.number, `${g.name} — ${m.name}`)}
                  style={({ pressed, hovered }) => [
                    styles.selBtn,
                    isSel && styles.oddsBtnActive,
                    !open && styles.selBtnClosed,
                    open && (pressed || (Platform.OS === 'web' && hovered)) && styles.oddsBtnHover,
                  ]}>
                  <Text style={[styles.selName, isSel && styles.oddsTextActive]} numberOfLines={1}>
                    {m.name}
                  </Text>
                  <Text style={[styles.selOdds, isSel && styles.oddsTextActive]}>
                    {m.decimal.toFixed(2)}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ))}
    </View>
  );
}

/**
 * Loads and shows EVERY market for one fixture, on demand.
 *
 * Mirrors Hollywood's own "more" expander, and for the same reason: a single
 * fixture carries ~130 markets and ~600 selections, so pulling that for a whole
 * league would be gratuitous. Collapsed by default; expanding costs one call.
 */
function AllMarkets({
  event,
  selected,
  onPick,
}: {
  event: HbEvent;
  selected: Selection | undefined;
  onPick: (betTypeId: number, marketNumber: number, label: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [full, setFull] = useState<HbEvent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const expand = async () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (full || loading) return;
    setLoading(true);
    setError(null);
    try {
      const detail = await fetchEventDetail(event.id);
      setFull(detail);
      if (!detail) setError('No extra markets returned for this fixture.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load all markets.');
    } finally {
      setLoading(false);
    }
  };

  const shown = full ?? event;
  const count = full ? marketGroups(full).length : null;

  return (
    <View style={styles.allWrap}>
      <Pressable
        onPress={expand}
        style={({ pressed, hovered }) => [
          styles.moreBtn,
          (pressed || (Platform.OS === 'web' && hovered)) && styles.oddsBtnHover,
        ]}>
        <Text style={styles.moreText}>
          {loading
            ? 'Loading all markets…'
            : open
              ? `▾ Hide markets${count ? ` (${count})` : ''}`
              : `▸ More markets${count ? ` (${count})` : ''}`}
        </Text>
      </Pressable>
      {error ? <Text style={styles.err}>{error}</Text> : null}
      {open && !loading ? (
        <ExtraMarkets event={shown} selected={selected} onPick={onPick} />
      ) : null}
    </View>
  );
}

export default function HollywoodOddsPanel({ onAddLeg }: { onAddLeg?: (leg: BetSlipLeg) => void }) {
  const [filter, setFilter] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [tournamentId, setTournamentId] = useState<number | null>(null);
  const [selections, setSelections] = useState<Record<number, Selection>>({});

  const nav = useHollywoodNav(categoryId);
  const category = nav.categories.find((c) => c.id === categoryId) ?? null;
  const tournament = nav.tournaments.find((t) => t.id === tournamentId) ?? null;

  const ctx = useMemo(
    () =>
      category && tournament
        ? { categoryId: category.id, tournamentId: tournament.id, tournamentName: tournament.name, countryId: category.id }
        : null,
    [category, tournament],
  );
  const odds = useHollywoodOdds(ctx);
  const hunt = useHollywoodHunt();
  const { state: exportState, exportSlip } = useHollywoodExport();

  const filteredCountries = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = q ? nav.categories.filter((c) => c.name.toLowerCase().includes(q)) : nav.categories;
    return list.slice(0, 40);
  }, [nav.categories, filter]);

  const legs = useMemo(() => Object.values(selections), [selections]);
  const combinedOdds = legs.reduce((acc, s) => acc * s.odds, 1);
  const unhealthyCrawls = hunt.crawlState.filter(
    (row) => row.status === 'failed' || row.status === 'partial',
  );

  const addSelectionsToSlip = () => {
    if (!onAddLeg) return;
    for (const [eventId, selection] of Object.entries(selections)) {
      const event = odds.events.find((item) => item.id === Number(eventId));
      if (!event) continue;
      const [market, picked = selection.label] = selection.label.split(' — ');
      onAddLeg({
        id: `hollywood-${event.id}-${selection.betTypeId}-${selection.marketNumber}`,
        fixture: event.name,
        market,
        selection: picked,
        odds: selection.odds,
        bookmaker: 'Hollywoodbets',
        kickoff: event.startTime,
        hbLeg: selection.leg,
      });
    }
  };

  const togglePick = (event: HbEvent, betTypeId: number, marketNumber: number, label: string) => {
    if (!ctx) return;
    setSelections((prev) => {
      const current = prev[event.id];
      if (current?.betTypeId === betTypeId && current.marketNumber === marketNumber) {
        const next = { ...prev };
        delete next[event.id];
        return next;
      }
      const sel = legFor(event, betTypeId, marketNumber, label, ctx);
      return sel ? { ...prev, [event.id]: sel } : prev;
    });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.intro}>
        Live Hollywoodbets soccer odds. Pick a country and league, tap selections, then generate a
        booking code that opens a pre-loaded betslip on Hollywoodbets.
      </Text>

      <View style={styles.huntStatus}>
        <Text style={styles.huntTitle}>HOLLYWOOD HUNT</Text>
        <Text style={styles.huntText}>
          {!hunt.configured
            ? 'Database not connected — live odds still work, but removal history is not being stored.'
            : hunt.loading
              ? 'Reading crawler status…'
              : hunt.error
                ? 'Crawler store configured, but currently unavailable.'
                : hunt.crawlState.length === 0
                  ? 'Database connected, but no crawler run has been recorded yet.'
                  : `${hunt.changes.length} change signal${hunt.changes.length === 1 ? '' : 's'} in the last hour${hunt.lastCrawled ? ` · last successful crawl ${new Date(hunt.lastCrawled).toLocaleString()}` : ''}`}
        </Text>
        {hunt.configured && !hunt.loading && !hunt.error ? (
          <View style={styles.huntMetrics}>
            <HuntMetric label="CURRENT" value={String(hunt.currentEvents.length)} />
            <HuntMetric label="REMOVED" value={String(hunt.removedEvents.length)} alert={hunt.removedEvents.length > 0} />
            <HuntMetric
              label="COVERAGE"
              value={hunt.coverage ? `${hunt.coverage.coveragePct.toFixed(0)}%` : '—'}
            />
            <HuntMetric label="CRAWL ISSUES" value={String(unhealthyCrawls.length)} alert={unhealthyCrawls.length > 0} />
          </View>
        ) : null}
      </View>

      {hunt.coverage ? (
        <View style={styles.huntDetail}>
          <Text style={styles.huntDetailTitle}>COVERAGE RECONCILIATION</Text>
          <Text style={styles.huntDetailText}>
            {hunt.coverage.matched.length} matched · {hunt.coverage.missingFromBook.length} in Scoreline but missing at Hollywood · {hunt.coverage.extraAtBook.length} at Hollywood but missing from Scoreline
          </Text>
          {hunt.coverage.missingFromBook.slice(0, 5).map((fixture, index) => (
            <Text key={`${fixture.homeName}-${fixture.awayName}-${index}`} style={styles.gapText}>
              GAP · {fixture.homeName} vs {fixture.awayName}
            </Text>
          ))}
        </View>
      ) : hunt.coverageError ? (
        <Text style={styles.coverageNote}>Coverage comparison is temporarily unavailable; crawler history still refreshes every minute.</Text>
      ) : null}

      {hunt.removedEvents.length > 0 ? (
        <View style={styles.huntDetail}>
          <Text style={styles.huntDetailTitle}>REMOVED / COOLED LISTINGS</Text>
          {hunt.removedEvents.slice(0, 8).map((event) => (
            <View key={event.event_id} style={styles.removedRow}>
              <View style={styles.removedBody}>
                <Text style={styles.removedName}>{event.name}</Text>
                <Text style={styles.removedMeta}>
                  {event.tournament ?? event.country ?? 'Hollywoodbets'} · removed {event.removed_at ? new Date(event.removed_at).toLocaleString() : 'time unknown'}
                </Text>
              </View>
              <Text style={styles.removedTag}>REMOVED</Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* Country */}
      <SectionLabel style={styles.label}>Country</SectionLabel>
      <TextInput
        style={styles.search}
        value={filter}
        onChangeText={setFilter}
        placeholder="Filter countries…"
        placeholderTextColor={theme.textFaint}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {nav.loadingCategories ? <Text style={styles.muted}>Loading…</Text> : null}
        {filteredCountries.map((c) => (
          <Chip
            key={c.id}
            label={c.name}
            active={c.id === categoryId}
            onPress={() => {
              setCategoryId(c.id);
              setTournamentId(null);
            }}
          />
        ))}
      </ScrollView>

      {/* League */}
      {categoryId != null ? (
        <>
          <SectionLabel style={styles.label}>League</SectionLabel>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {nav.loadingTournaments ? <Text style={styles.muted}>Loading…</Text> : null}
            {nav.tournaments.map((t) => (
              <Chip key={t.id} label={t.name} active={t.id === tournamentId} onPress={() => setTournamentId(t.id)} />
            ))}
            {!nav.loadingTournaments && nav.tournaments.length === 0 ? (
              <Text style={styles.muted}>No leagues.</Text>
            ) : null}
          </ScrollView>
        </>
      ) : null}

      {/* Events */}
      {tournamentId != null ? (
        <View style={styles.events}>
          {odds.loading ? <Text style={styles.muted}>Loading odds…</Text> : null}
          {odds.error ? <Text style={styles.err}>{odds.error}</Text> : null}
          {!odds.loading && !odds.error && odds.events.length === 0 ? (
            <Text style={styles.muted}>No priced matches in this league right now.</Text>
          ) : null}
          {odds.events.map((event) => {
            const row = odds.rows.find((r) => r.eventId === event.id);
            if (!row) return null;
            const selected = selections[event.id];
            const risk = hunt.riskByEvent[event.id];
            return (
              <View key={event.id} style={styles.eventCard}>
                <View style={styles.fixtureRow}>
                  <Text style={styles.fixture}>{event.name}</Text>
                  {risk ? (
                    <Text style={[styles.riskTag, ['removed', 'suspended', 'shortened'].includes(risk) ? styles.riskHot : styles.riskCool]}>
                      {risk.toUpperCase()}
                    </Text>
                  ) : null}
                </View>
                <Text style={styles.kickoff}>{new Date(event.startTime).toLocaleString()}</Text>
                <View style={styles.oddsRow}>
                  {(['1', 'X', '2'] as Pick[]).map((p) => {
                    const dec = p === '1' ? row.decimal.home : p === 'X' ? row.decimal.draw : row.decimal.away;
                    const isSel =
                      selected?.betTypeId === BET_TYPE.FULL_TIME &&
                      selected.marketNumber === PICK_NUMBER[p];
                    const label = p === '1' ? 'Home' : p === 'X' ? 'Draw' : 'Away';
                    return (
                      <Pressable
                        key={p}
                        onPress={() => togglePick(event, BET_TYPE.FULL_TIME, PICK_NUMBER[p], `Full Time — ${label}`)}
                        style={({ pressed, hovered }) => [
                          styles.oddsBtn,
                          isSel && styles.oddsBtnActive,
                          (pressed || (Platform.OS === 'web' && hovered)) && styles.oddsBtnHover,
                        ]}>
                        <Text style={[styles.oddsPick, isSel && styles.oddsTextActive]}>{p}</Text>
                        <Text style={[styles.oddsVal, isSel && styles.oddsTextActive]}>{dec.toFixed(2)}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <AllMarkets
                  event={event}
                  selected={selected}
                  onPick={(betTypeId, marketNumber, label) =>
                    togglePick(event, betTypeId, marketNumber, label)
                  }
                />
              </View>
            );
          })}
        </View>
      ) : null}

      {/* Booking code footer */}
      {legs.length > 0 ? (
        <View style={styles.slipBar}>
          <View>
            <Text style={styles.slipLegs}>{legs.length} selection{legs.length > 1 ? 's' : ''}</Text>
            <Text style={styles.slipPicks} numberOfLines={2}>
              {legs.map((s2) => s2.label).join(' · ')}
            </Text>
            <Text style={styles.slipOdds}>Combined @ {combinedOdds.toFixed(2)}</Text>
          </View>
          <Pressable
            onPress={() => exportSlip(legs.map((s) => s.leg))}
            disabled={exportState.status === 'loading'}
            style={({ pressed, hovered }) => [
              styles.exportBtn,
              (pressed || (Platform.OS === 'web' && hovered)) && styles.exportBtnHover,
              exportState.status === 'loading' && styles.exportBtnDisabled,
            ]}>
            <Text style={styles.exportText}>
              {exportState.status === 'loading' ? 'GENERATING…' : 'GENERATE BOOKING CODE'}
            </Text>
          </Pressable>
          {onAddLeg ? (
            <Pressable onPress={addSelectionsToSlip} style={styles.addSlipBtn}>
              <Text style={styles.addSlipText}>ADD TO SCORELINE SLIP</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {exportState.status === 'done' ? (
        <Text style={styles.ok}>Booking code {exportState.code} — opening Hollywoodbets…</Text>
      ) : null}
      {exportState.status === 'error' ? <Text style={styles.err}>{exportState.message}</Text> : null}
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed, hovered }) => [
        styles.chip,
        active && styles.chipActive,
        (pressed || (Platform.OS === 'web' && hovered)) && styles.chipHover,
      ]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function HuntMetric({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <View style={styles.huntMetric}>
      <Text style={[styles.huntMetricValue, alert && styles.huntMetricAlert]}>{value}</Text>
      <Text style={styles.huntMetricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', maxWidth: 720, alignSelf: 'center' },
  intro: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: theme.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  huntStatus: {
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    backgroundColor: theme.surface,
    padding: spacing.md,
    marginBottom: spacing.sm,
    alignItems: 'center',
  },
  huntTitle: { fontFamily: fonts.display, fontSize: 12, color: theme.accentOrange, letterSpacing: 1 },
  huntText: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted, textAlign: 'center', marginTop: 4 },
  huntMetrics: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.md },
  huntMetric: { minWidth: 86, alignItems: 'center', paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, backgroundColor: theme.surfaceMuted, borderRadius: layout.borderRadius },
  huntMetricValue: { fontFamily: fonts.display, fontSize: 17, color: theme.accentGreen },
  huntMetricAlert: { color: theme.accentOrange },
  huntMetricLabel: { fontFamily: fonts.bodySemiBold, fontSize: 8, color: theme.textFaint, letterSpacing: 0.5 },
  huntDetail: { borderWidth: layout.borderWidth, borderColor: theme.border, borderRadius: layout.borderRadius, backgroundColor: theme.surface, padding: spacing.md, marginBottom: spacing.sm },
  huntDetailTitle: { fontFamily: fonts.display, fontSize: 11, color: theme.textPrimary, letterSpacing: 0.8, textAlign: 'center', marginBottom: spacing.xs },
  huntDetailText: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted, textAlign: 'center', lineHeight: 17 },
  gapText: { fontFamily: fonts.bodyMedium, fontSize: 10, color: theme.accentOrange, textAlign: 'center', marginTop: 4 },
  coverageNote: { fontFamily: fonts.body, fontSize: 10, color: theme.textFaint, textAlign: 'center', marginBottom: spacing.sm },
  removedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderTopWidth: layout.borderWidth, borderTopColor: theme.border, paddingTop: spacing.sm, marginTop: spacing.sm },
  removedBody: { flex: 1 },
  removedName: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: theme.textPrimary },
  removedMeta: { fontFamily: fonts.body, fontSize: 10, color: theme.textMuted, marginTop: 2 },
  removedTag: { fontFamily: fonts.bodySemiBold, fontSize: 8, color: theme.loss, backgroundColor: 'rgba(255, 92, 92, 0.12)', paddingHorizontal: spacing.xs, paddingVertical: 2, borderRadius: layout.borderRadius },
  label: { alignSelf: 'flex-start', marginTop: spacing.md, marginBottom: spacing.sm },
  search: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: theme.textPrimary,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: theme.surface,
    marginBottom: spacing.sm,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}),
  },
  chipRow: { gap: spacing.sm, paddingVertical: spacing.xs },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    backgroundColor: theme.surface,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : {}),
  },
  chipActive: { borderColor: theme.accentGreen, backgroundColor: theme.surfaceMuted },
  chipHover: { opacity: 0.85 },
  chipText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: theme.textMuted },
  chipTextActive: { color: theme.accentGreen },
  events: { width: '100%', marginTop: spacing.md, gap: spacing.sm },
  eventCard: {
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    backgroundColor: theme.surface,
    padding: spacing.md,
  },
  fixtureRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  fixture: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: theme.textPrimary },
  riskTag: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 9,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: layout.borderRadius,
    overflow: 'hidden',
  },
  riskHot: { color: theme.loss, backgroundColor: 'rgba(255, 92, 92, 0.12)' },
  riskCool: { color: theme.accentGreen, backgroundColor: 'rgba(63, 211, 148, 0.12)' },
  kickoff: { fontFamily: fonts.body, fontSize: 12, color: theme.textMuted, marginTop: 2, marginBottom: spacing.sm },
  extras: {
    width: '100%',
    marginTop: spacing.sm,
    borderTopWidth: layout.borderWidth,
    borderTopColor: theme.border,
    paddingTop: spacing.sm,
    gap: spacing.xs,
  },
  allWrap: { width: '100%', marginTop: spacing.sm },
  moreBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: layout.borderRadius,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
  },
  moreText: { fontFamily: fonts.bodySemiBold, fontSize: 11, color: theme.textMuted },
  marketGroup: { width: '100%', marginTop: spacing.xs },
  marketName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    color: theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  marketRow: { flexDirection: 'row', gap: spacing.xs, paddingRight: spacing.sm },
  selBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: layout.borderRadius,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    backgroundColor: theme.surfaceMuted,
  },
  selBtnClosed: { opacity: 0.4 },
  selName: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted },
  selOdds: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: theme.textPrimary },
  slipPicks: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted, maxWidth: 380 },
  oddsRow: { flexDirection: 'row', gap: spacing.sm },
  oddsBtn: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: theme.bg,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : {}),
  },
  oddsBtnActive: { borderColor: theme.accentGreen, backgroundColor: theme.accentGreen },
  oddsBtnHover: { opacity: 0.9 },
  oddsPick: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.textMuted },
  oddsVal: { fontFamily: fonts.display, fontSize: 15, color: theme.textPrimary },
  oddsTextActive: { color: theme.bg },
  muted: { fontFamily: fonts.body, fontSize: 13, color: theme.textMuted, paddingVertical: spacing.sm },
  err: { fontFamily: fonts.body, fontSize: 13, color: theme.loss, paddingVertical: spacing.sm },
  ok: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: theme.accentGreen,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  slipBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.lg,
    padding: spacing.md,
    borderWidth: layout.borderWidth,
    borderColor: theme.accentGreen,
    borderRadius: layout.borderRadius,
    backgroundColor: theme.surface,
  },
  slipLegs: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: theme.textPrimary },
  slipOdds: { fontFamily: fonts.display, fontSize: 16, color: theme.accentGreen },
  exportBtn: {
    backgroundColor: theme.accentGreen,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: layout.borderRadius,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : {}),
  },
  exportBtnHover: { opacity: 0.9 },
  exportBtnDisabled: { opacity: 0.5 },
  exportText: { fontFamily: fonts.display, fontSize: 13, color: theme.bg, letterSpacing: 1 },
  addSlipBtn: {
    borderWidth: layout.borderWidth,
    borderColor: theme.accentBlue,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: layout.borderRadius,
  },
  addSlipText: { fontFamily: fonts.display, fontSize: 11, color: theme.accentBlue, letterSpacing: 0.5 },
});
