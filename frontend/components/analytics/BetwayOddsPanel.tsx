import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { useBetwayHunt } from '@/hooks/useBetwayHunt';
import type { BetwayEvent, BetwayMarket, BetwayMarketSelection } from '@/services/betwayHunt';
import {
  betwayGroupLabel,
  fetchBetwayEventMarkets,
  type BetwayEventMarkets,
} from '@/services/betwayMarkets';
import { fonts, layout, spacing, theme } from '@/styles/theme';
import type { BetSlipLeg } from '@/types/analytics';

const MAX_VISIBLE_FIXTURES = 20;

function localTime(value: string | null): string {
  if (!value) return '—';
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toLocaleString() : '—';
}

function odds(value: number | null): string {
  return value == null ? '—' : value.toFixed(2);
}

function timeBeforeKickoff(start: string, removed: string | null): string {
  if (!removed) return 'before kickoff';
  const milliseconds = Date.parse(start) - Date.parse(removed);
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return 'before kickoff';
  const minutes = Math.round(milliseconds / 60_000);
  if (minutes < 60) return `${minutes}m before kickoff`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${hours}h${remainder ? ` ${remainder}m` : ''} before kickoff`;
}

function Metric({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <View style={[styles.metric, alert && styles.metricAlert]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, alert && styles.alertText]}>{value}</Text>
    </View>
  );
}

function PriceButton({
  event,
  label,
  selection,
  price,
  onAddLeg,
}: {
  event: BetwayEvent;
  label: string;
  selection: string;
  price: number | null;
  onAddLeg?: (leg: BetSlipLeg) => void;
}) {
  const available = event.market_open && price != null;
  const market = event.markets.find((candidate) =>
    candidate.market_type.trim().toLowerCase() === 'win-draw-win',
  );
  const outcome = market?.selections.find((candidate) =>
    candidate.name.trim().toLowerCase() === selection.trim().toLowerCase(),
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Add ${event.home_team} versus ${event.away_team}, ${selection} at ${odds(price)} to bet slip`}
      accessibilityState={{ disabled: !available }}
      disabled={!available}
      onPress={() => {
        if (!available || !onAddLeg || price == null) return;
        onAddLeg({
          id: `betway-${event.provider_event_id}-${label}`,
          fixture: `${event.home_team} vs ${event.away_team}`,
          market: '1X2',
          selection,
          odds: price,
          bookmaker: 'Betway',
          kickoff: event.start_time,
          betwayLeg: market && outcome ? {
            eventId: event.provider_event_id,
            marketId: market.market_id,
            outcomeId: outcome.outcome_id,
            group: 'Main',
            fixture: `${event.home_team} vs ${event.away_team}`,
            marketName: '1X2',
            selectionName: selection,
            offeredOdds: price,
            kickoff: event.start_time,
          } : undefined,
        });
      }}
      style={({ pressed }) => [
        styles.price,
        !available && styles.priceDisabled,
        pressed && styles.pricePressed,
      ]}>
      <Text style={styles.priceLabel}>{label}</Text>
      <Text style={styles.priceValue}>{odds(price)}</Text>
    </Pressable>
  );
}

function MarketSelectionButton({
  event,
  market,
  selection,
  group,
  onAddLeg,
}: {
  event: BetwayEvent;
  market: BetwayMarket;
  selection: BetwayMarketSelection;
  group: string;
  onAddLeg?: (leg: BetSlipLeg) => void;
}) {
  const available = event.fixture_status === 'active' && market.open && selection.available && selection.odds != null;
  const marketName = market.line == null || market.name.includes(String(market.line))
    ? market.name
    : `${market.name} ${market.line}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Add ${event.home_team} versus ${event.away_team}, ${marketName}, ${selection.name} at ${odds(selection.odds)} to bet slip`}
      accessibilityState={{ disabled: !available }}
      disabled={!available}
      onPress={() => {
        if (!available || !onAddLeg || selection.odds == null) return;
        onAddLeg({
          id: `betway-${event.provider_event_id}-${market.market_id}-${selection.outcome_id}`,
          fixture: `${event.home_team} vs ${event.away_team}`,
          market: marketName,
          selection: selection.name,
          odds: selection.odds,
          bookmaker: 'Betway',
          kickoff: event.start_time,
          betwayLeg: {
            eventId: event.provider_event_id,
            marketId: market.market_id,
            outcomeId: selection.outcome_id,
            group,
            fixture: `${event.home_team} vs ${event.away_team}`,
            marketName,
            selectionName: selection.name,
            offeredOdds: selection.odds,
            kickoff: event.start_time,
          },
        });
      }}
      style={({ pressed }) => [
        styles.marketSelection,
        !available && styles.priceDisabled,
        pressed && styles.pricePressed,
      ]}>
      <Text style={styles.marketSelectionName}>{selection.name}</Text>
      <Text style={styles.priceValue}>{odds(selection.odds)}</Text>
    </Pressable>
  );
}

function MoreMarkets({ event, onAddLeg }: { event: BetwayEvent; onAddLeg?: (leg: BetSlipLeg) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState('Main');
  const [responses, setResponses] = useState<Record<string, BetwayEventMarkets>>({});
  const [loadingGroup, setLoadingGroup] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const response = responses[selectedGroup];
  const markets = response?.markets ?? [];
  const selectionCount = response?.outcomeCount ?? null;

  const load = async (group: string) => {
    setSelectedGroup(group);
    setExpanded(true);
    if (responses[group] || loadingGroup === group) return;
    setLoadingGroup(group);
    setError(null);
    try {
      const result = await fetchBetwayEventMarkets(event.provider_event_id, group);
      setResponses((current) => ({ ...current, [group]: result }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load Betway markets.');
    } finally {
      setLoadingGroup((current) => current === group ? null : current);
    }
  };

  const toggle = () => {
    if (expanded) {
      setExpanded(false);
      return;
    }
    void load(selectedGroup);
  };

  const groups = response ? ['All', ...response.groups] : ['Main'];
  return (
    <View style={styles.moreMarkets}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={toggle}
        style={styles.moreButton}>
        <Text style={styles.moreButtonText}>
          {loadingGroup && expanded
            ? 'Loading Betway markets…'
            : expanded
              ? `▾ Hide markets${selectionCount == null ? '' : ` (${selectionCount} selections)`}`
              : '▸ More Betway markets'}
        </Text>
      </Pressable>
      {expanded && response ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.marketTabs}>
          {groups.map((group) => (
            <Pressable
              key={group}
              accessibilityRole="button"
              accessibilityLabel={`Betway market group: ${betwayGroupLabel(group)}`}
              accessibilityState={{ selected: selectedGroup === group }}
              onPress={() => void load(group)}
              style={[styles.marketTab, selectedGroup === group && styles.marketTabActive]}>
              <Text style={[styles.marketTabText, selectedGroup === group && styles.marketTabTextActive]}>
                {betwayGroupLabel(group)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      {expanded && error ? <Text style={styles.marketError}>{error}</Text> : null}
      {expanded && !loadingGroup && response && markets.length === 0 ? (
        <Text style={styles.empty}>Betway currently has no available markets in this group.</Text>
      ) : null}
      {expanded && !loadingGroup ? markets.map((market) => (
          <View key={market.market_id} style={styles.marketGroup}>
            <View style={styles.marketHeading}>
              <Text style={styles.marketName}>
                {market.line == null || market.name.includes(String(market.line))
                  ? market.name
                  : `${market.name} ${market.line}`}
              </Text>
              {!market.open ? <Text style={styles.marketClosed}>SUSPENDED</Text> : null}
            </View>
            <View style={styles.marketSelections}>
              {market.selections.map((selection) => (
                <MarketSelectionButton
                  key={selection.outcome_id}
                  event={event}
                  market={market}
                  selection={selection}
                  group={selectedGroup}
                  onAddLeg={onAddLeg}
                />
              ))}
            </View>
          </View>
        )) : null}
    </View>
  );
}

export default function BetwayOddsPanel({ onAddLeg }: { onAddLeg?: (leg: BetSlipLeg) => void }) {
  const narrow = useWindowDimensions().width < 720;
  const hunt = useBetwayHunt();
  const snapshot = hunt.snapshot;
  const latest = hunt.metrics.latestRun;

  return (
    <View style={styles.container}>
      <Text style={styles.intro}>
        Betway pre-match soccer monitoring. Current 1X2 and additional market prices can be added to the shared bet slip;
        disappearances are shown as removals only after independent fixture-status verification.
      </Text>

      <View style={styles.statusCard}>
        <View style={styles.statusHeading}>
          <Text style={styles.title}>BETWAY HUNT</Text>
          {hunt.refreshing ? <Text style={styles.refreshing}>REFRESHING…</Text> : null}
        </View>
        <Text style={styles.statusText}>
          {hunt.loading
            ? 'Reading Betway crawler status…'
            : hunt.error
              ? `Crawler store unavailable: ${hunt.error}`
              : !latest
                ? 'No successful Betway crawler run has been recorded.'
                : `${latest.fixture_count} eligible fixtures captured · last successful crawl ${localTime(latest.captured_at)}`}
        </Text>
        {snapshot ? (
          <View style={styles.metrics}>
            <Metric label="CURRENT" value={String(snapshot.currentEvents.length)} />
            <Metric label="OPEN 1X2" value={String(hunt.metrics.openMarkets)} />
            <Metric label="SUSPENDED" value={String(hunt.metrics.suspended)} alert={hunt.metrics.suspended > 0} />
            <Metric label="AWAITING CHECK" value={String(snapshot.pendingRemovals.length)} />
            <Metric label="VERIFIED REMOVED" value={String(snapshot.verifiedRemovals.length)} alert={snapshot.verifiedRemovals.length > 0} />
            <Metric label="CHANGES / HOUR" value={String(snapshot.changes.length)} />
            <Metric label="STALE >20M" value={hunt.metrics.stale ? 'YES' : 'NO'} alert={hunt.metrics.stale} />
          </View>
        ) : null}
      </View>

      {snapshot && !snapshot.historyAvailable ? (
        <View style={styles.historyNotice}>
          <Text style={styles.historyNoticeTitle}>LIVE ODDS MODE</Text>
          <Text style={styles.historyNoticeText}>
            Current Betway odds are available. Historical removals and change counts will appear after the Supabase public read migration is applied by a project owner.
          </Text>
        </View>
      ) : null}

      {snapshot?.verifiedRemovals.length ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>VERIFIED REMOVED BEFORE KICKOFF</Text>
          <Text style={styles.sectionHint}>
            These fixtures disappeared from Betway and were still independently confirmed as upcoming.
          </Text>
          {snapshot.verifiedRemovals.slice(0, 10).map((removal) => (
            <View key={removal.episode_id} style={[styles.removalRow, narrow && styles.stack]}>
              <View style={styles.grow}>
                <Text style={styles.fixtureName}>Betway · {removal.event.home_team} vs {removal.event.away_team}</Text>
                <Text style={styles.meta}>
                  {removal.event.competition ?? 'Competition'} · Kickoff {localTime(removal.event.start_time)}
                </Text>
                <Text style={styles.meta}>
                  Last seen {localTime(removal.event.last_seen_at)} · removed {timeBeforeKickoff(removal.event.start_time, removal.event.removed_at)}
                </Text>
                <Text style={styles.removedOdds}>
                  Last Betway 1X2 · H {odds(removal.odds_home)} · X {odds(removal.odds_draw)} · A {odds(removal.odds_away)}
                </Text>
                <Text style={styles.meta}>
                  {removal.missing_crawls} complete crawl confirmation{removal.missing_crawls === 1 ? '' : 's'}
                  {removal.verification_source_status ? ` · source status ${removal.verification_source_status}` : ''}
                </Text>
              </View>
              <Text style={styles.verifiedTag}>VERIFIED</Text>
            </View>
          ))}
        </View>
      ) : null}

      {snapshot?.pendingRemovals.length ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>AWAITING CONFIRMATION</Text>
          <Text style={styles.sectionHint}>
            These are candidates only. They are not counted as bookmaker removals until verification succeeds.
          </Text>
          {snapshot.pendingRemovals.slice(0, 8).map((removal) => (
            <View key={removal.episode_id} style={styles.pendingRow}>
              <Text style={styles.fixtureName}>Betway event {removal.provider_event_id}</Text>
              <Text style={styles.meta}>
                {removal.state === 'pending' ? 'Waiting for another complete crawl' : 'Waiting for fixture-status verification'}
                {' · '}{removal.missing_crawls} missing crawl{removal.missing_crawls === 1 ? '' : 's'}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {snapshot?.classifiedEvents.length ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>RECENT NON-REMOVAL CLASSIFICATIONS</Text>
          <Text style={styles.sectionHint}>
            These fixtures are excluded from Betway removal signals because kickoff or an independently verified match status explains the disappearance.
          </Text>
          {snapshot.classifiedEvents.slice(0, 10).map((event) => (
            <View key={event.provider_event_id} style={[styles.removalRow, narrow && styles.stack]}>
              <View style={styles.grow}>
                <Text style={styles.fixtureName}>Betway · {event.home_team} vs {event.away_team}</Text>
                <Text style={styles.meta}>{betwayLifecycleExplanation(event.lifecycle_state)}</Text>
                <Text style={styles.meta}>{event.competition ?? 'Competition'} · Kickoff {localTime(event.start_time)}</Text>
              </View>
              <Text style={styles.lifecycleTag}>{event.lifecycle_state.replaceAll('_', ' ').toUpperCase()}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>CURRENT BETWAY MARKETS</Text>
        <Text style={styles.sectionHint}>
          1X2 is shown first. Open a fixture to load Betway&apos;s live Popular, Goals, Teams, Winner, Halves, Scores,
          Handicaps, Scorers, Combos and Build A Bet groups on demand.
        </Text>
        {!snapshot && !hunt.loading ? <Text style={styles.empty}>Current Betway fixtures are unavailable.</Text> : null}
        {snapshot && snapshot.currentEvents.length === 0 ? <Text style={styles.empty}>No upcoming Betway fixtures were returned.</Text> : null}
        {snapshot?.currentEvents.slice(0, MAX_VISIBLE_FIXTURES).map((event) => (
          <View key={event.provider_event_id} style={styles.fixtureCard}>
            <View style={[styles.fixtureHeader, narrow && styles.stack]}>
              <View style={styles.grow}>
                <Text style={styles.fixtureName}>{event.home_team} vs {event.away_team}</Text>
                <Text style={styles.meta}>{event.competition ?? 'Competition'} · {localTime(event.start_time)}</Text>
              </View>
              <Text style={event.market_open ? styles.openTag : styles.suspendedTag}>
                {event.market_open ? 'BETWAY · OPEN' : 'BETWAY · SUSPENDED'}
              </Text>
            </View>
            <View style={styles.prices}>
              <PriceButton event={event} label="1" selection={event.home_team} price={event.odds_home} onAddLeg={onAddLeg} />
              <PriceButton event={event} label="X" selection="Draw" price={event.odds_draw} onAddLeg={onAddLeg} />
              <PriceButton event={event} label="2" selection={event.away_team} price={event.odds_away} onAddLeg={onAddLeg} />
            </View>
            <MoreMarkets event={event} onAddLeg={onAddLeg} />
          </View>
        ))}
        {snapshot && snapshot.currentEvents.length > MAX_VISIBLE_FIXTURES ? (
          <Text style={styles.empty}>
            Showing the next {MAX_VISIBLE_FIXTURES} of {snapshot.currentEvents.length} Betway fixtures.
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function betwayLifecycleExplanation(state: string): string {
  switch (state) {
    case 'started': return 'Scheduled kickoff was reached; this is not a bookmaker removal.';
    case 'expired': return 'The match finished or aged past kickoff; this is not a bookmaker removal.';
    case 'postponed': return 'The independent fixture source reports the match as postponed.';
    case 'cancelled': return 'The independent fixture source reports the match as cancelled.';
    case 'abandoned': return 'The independent fixture source reports the match as abandoned.';
    case 'rescheduled': return 'The same fixture moved to a different kickoff time.';
    default: return 'The disappearance has a non-removal lifecycle explanation.';
  }
}

const styles = StyleSheet.create({
  container: { width: '100%', gap: spacing.lg },
  intro: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: theme.textMuted },
  statusCard: { padding: spacing.lg, borderWidth: 1, borderColor: theme.accentBlue, borderRadius: layout.borderRadius, backgroundColor: theme.surface },
  statusHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  title: { fontFamily: fonts.display, fontSize: 18, color: theme.accentBlue, letterSpacing: 1 },
  refreshing: { fontFamily: fonts.bodySemiBold, fontSize: 10, color: theme.textMuted },
  statusText: { marginTop: spacing.sm, fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: theme.textMuted },
  metrics: { marginTop: spacing.md, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  metric: { minWidth: 118, flexGrow: 1, padding: spacing.md, borderWidth: 1, borderColor: theme.border, borderRadius: layout.borderRadius, backgroundColor: theme.bg },
  metricAlert: { borderColor: theme.loss },
  metricLabel: { fontFamily: fonts.bodySemiBold, fontSize: 9, color: theme.textMuted, letterSpacing: 0.6 },
  metricValue: { marginTop: 4, fontFamily: fonts.display, fontSize: 20, color: theme.textPrimary },
  alertText: { color: theme.loss },
  section: { padding: spacing.lg, borderWidth: 1, borderColor: theme.border, borderRadius: layout.borderRadius, backgroundColor: theme.surface },
  historyNotice: { padding: spacing.md, borderWidth: 1, borderColor: theme.yellow, borderRadius: layout.borderRadius, backgroundColor: theme.surface },
  historyNoticeTitle: { fontFamily: fonts.display, fontSize: 13, color: theme.yellow, letterSpacing: 0.7 },
  historyNoticeText: { marginTop: 4, fontFamily: fonts.body, fontSize: 12, lineHeight: 18, color: theme.textMuted },
  sectionTitle: { fontFamily: fonts.display, fontSize: 16, color: theme.textPrimary, letterSpacing: 0.7 },
  sectionHint: { marginTop: 4, marginBottom: spacing.md, fontFamily: fonts.body, fontSize: 12, lineHeight: 18, color: theme.textMuted },
  removalRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: theme.border },
  pendingRow: { paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: theme.border },
  fixtureCard: { paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: theme.border },
  fixtureHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  stack: { flexDirection: 'column' },
  grow: { flex: 1 },
  fixtureName: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: theme.textPrimary },
  meta: { marginTop: 3, fontFamily: fonts.body, fontSize: 11, lineHeight: 16, color: theme.textMuted },
  removedOdds: { marginTop: spacing.xs, fontFamily: fonts.bodySemiBold, fontSize: 12, color: theme.accentBlue },
  verifiedTag: { fontFamily: fonts.bodySemiBold, fontSize: 10, color: theme.accentGreen, borderWidth: 1, borderColor: theme.accentGreen, borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  lifecycleTag: { maxWidth: 120, fontFamily: fonts.bodySemiBold, fontSize: 9, color: theme.accentBlue, borderWidth: 1, borderColor: theme.accentBlue, borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 4, textAlign: 'center' },
  openTag: { fontFamily: fonts.bodySemiBold, fontSize: 9, color: theme.accentGreen },
  suspendedTag: { fontFamily: fonts.bodySemiBold, fontSize: 9, color: theme.loss },
  prices: { marginTop: spacing.sm, flexDirection: 'row', gap: spacing.sm },
  price: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: 1, borderColor: theme.accentBlue, borderRadius: layout.borderRadius, backgroundColor: theme.bg },
  priceDisabled: { opacity: 0.45, borderColor: theme.border },
  pricePressed: { opacity: 0.72 },
  priceLabel: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: theme.textMuted },
  priceValue: { fontFamily: fonts.display, fontSize: 15, color: theme.textPrimary },
  moreMarkets: { marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: theme.border, paddingTop: spacing.sm },
  moreButton: { alignSelf: 'flex-start', paddingHorizontal: spacing.sm, paddingVertical: 5, borderWidth: 1, borderColor: theme.border, borderRadius: layout.borderRadius },
  moreButtonText: { fontFamily: fonts.bodySemiBold, fontSize: 11, color: theme.accentBlue },
  marketTabs: { gap: spacing.xs, paddingVertical: spacing.sm },
  marketTab: { paddingHorizontal: spacing.sm, paddingVertical: 6, borderWidth: 1, borderColor: theme.border, borderRadius: 999, backgroundColor: theme.bg },
  marketTabActive: { borderColor: theme.accentBlue, backgroundColor: theme.accentBlue },
  marketTabText: { fontFamily: fonts.bodySemiBold, fontSize: 10, color: theme.textMuted },
  marketTabTextActive: { color: theme.bg },
  marketError: { marginTop: spacing.sm, fontFamily: fonts.body, fontSize: 11, color: theme.loss },
  marketGroup: { marginTop: spacing.sm },
  marketHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  marketName: { fontFamily: fonts.bodySemiBold, fontSize: 11, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  marketClosed: { fontFamily: fonts.bodySemiBold, fontSize: 8, color: theme.loss },
  marketSelections: { marginTop: spacing.xs, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  marketSelection: { minWidth: 120, flexGrow: 1, flexBasis: 150, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: 7, borderWidth: 1, borderColor: theme.border, borderRadius: layout.borderRadius, backgroundColor: theme.bg },
  marketSelectionName: { flexShrink: 1, fontFamily: fonts.body, fontSize: 11, color: theme.textMuted },
  empty: { paddingVertical: spacing.md, fontFamily: fonts.body, fontSize: 12, color: theme.textMuted, textAlign: 'center' },
});

