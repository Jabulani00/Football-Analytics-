import BookmakerFixtures from '@/components/analytics/BookmakerFixtures';
import { hollywoodFixture } from '@/services/bookmakerFixtures';
import { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import FilterDropdown from '@/components/shared/FilterDropdown';
import { useHollywoodExport } from '@/hooks/useHollywoodExport';
import { useHollywoodHunt } from '@/hooks/useHollywoodHunt';
import { useHollywoodNav } from '@/hooks/useHollywoodNav';
import { useHollywoodOdds } from '@/hooks/useHollywoodOdds';
import { summarizeCrawlState } from '@/services/huntStore';
import { fetchEventDetail } from '@/services/hollywoodbets';
import { fonts, layout, spacing, theme } from '@/styles/theme';
import type { BetSlipLeg } from '@/types/analytics';

export default function HollywoodOddsPanel({ onAddLeg, selectedLegs = [] }: {
  onAddLeg?: (leg: BetSlipLeg) => void; selectedLegs?: readonly BetSlipLeg[];
}) {
  const narrow = useWindowDimensions().width < 720;
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [tournamentId, setTournamentId] = useState<number | null>(null);

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

  const fieldStyle = narrow ? { width: '100%' as const, minWidth: 0, flexBasis: 'auto' as const, flexGrow: 0 } : { width: '100%' as const, flexBasis: 'auto' as const };

  const legs = useMemo(() => selectedLegs.flatMap((item) => item.hbLeg ? [{ label: `${item.fixture}: ${item.market} - ${item.selection}`, odds: item.odds, leg: item.hbLeg }] : []), [selectedLegs]);
  const fixtures = useMemo(() => odds.events.map((event) => hollywoodFixture(event, null, ctx ?? undefined)), [odds.events, ctx]);
  const combinedOdds = legs.reduce((acc, s) => acc * s.odds, 1);
  const crawlHealth = summarizeCrawlState(hunt.crawlState);

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
                ? `Crawler store unavailable: ${hunt.error}`
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
              value={
                hunt.coverage && hunt.coverage.matched.length + hunt.coverage.missingFromBook.length > 0
                  ? `${hunt.coverage.coveragePct.toFixed(0)}%`
                  : '—'
              }
            />
            <HuntMetric
              label="AWAITING CONFIRMATION"
              value={String(crawlHealth.pendingConfirmations)}
            />
            <HuntMetric label="NOT CRAWLED >24H" value={String(crawlHealth.stale)} />
            <HuntMetric
              label="CRAWL ISSUES"
              value={String(crawlHealth.failures)}
              alert={crawlHealth.failures > 0}
            />
          </View>
        ) : null}
      </View>

      {hunt.coverage ? (
        <View style={styles.huntDetail}>
          <Text style={styles.huntDetailTitle}>COVERAGE RECONCILIATION</Text>
          <Text style={styles.huntDetailText}>
            {hunt.coverage.matched.length + hunt.coverage.missingFromBook.length === 0
              ? 'No upcoming Scoreline fixtures were returned for the comparison window.'
              : `${hunt.coverage.matched.length} of ${hunt.coverage.matched.length + hunt.coverage.missingFromBook.length} Scoreline fixtures matched · ${hunt.coverage.missingFromBook.length} missing at Hollywood · ${hunt.coverage.extraAtBook.length} at Hollywood but missing from Scoreline`}
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

      {hunt.pendingEvents.length > 0 ? (
        <View style={styles.huntDetail}>
          <Text style={styles.huntDetailTitle}>AWAITING INDEPENDENT STATUS CHECK</Text>
          <Text style={styles.huntDetailText}>
            Repeatedly absent from Hollywoodbets, but not counted as removed until the official fixture status is checked.
          </Text>
          {hunt.pendingEvents.slice(0, 8).map((event) => (
            <View key={event.event_id} style={styles.removedRow}>
              <View style={styles.removedBody}>
                <Text style={styles.removedName}>Hollywoodbets · {event.name}</Text>
                <Text style={styles.removedMeta}>
                  {event.missing_count ?? 0} complete crawl misses · kickoff {new Date(event.start_time).toLocaleString()}
                </Text>
                {event.verification_reason ? (
                  <Text style={styles.removedMeta}>Last check: {event.verification_reason}</Text>
                ) : null}
              </View>
              <Text style={styles.pendingTag}>PENDING</Text>
            </View>
          ))}
        </View>
      ) : null}

      {hunt.removedEvents.length > 0 ? (
        <View style={styles.huntDetail}>
          <Text style={styles.huntDetailTitle}>VERIFIED BOOKMAKER REMOVALS</Text>
          {hunt.removedEvents.slice(0, 8).map((event) => (
            <View key={event.event_id} style={styles.removedRow}>
              <View style={styles.removedBody}>
                <Text style={styles.removedName}>Hollywoodbets · {event.name}</Text>
                <Text style={styles.removedMeta}>
                  {event.tournament ?? event.country ?? 'Competition'} · Kickoff {new Date(event.start_time).toLocaleString()}
                </Text>
                <Text style={styles.removedMeta}>
                  Last seen {new Date(event.last_seen).toLocaleString()} · confirmed removed {event.removed_at ? new Date(event.removed_at).toLocaleString() : 'time unknown'}
                </Text>
                <Text style={styles.removedOdds}>
                  Last 1X2 odds · H {event.odds_home?.toFixed(2) ?? '—'} · X {event.odds_draw?.toFixed(2) ?? '—'} · A {event.odds_away?.toFixed(2) ?? '—'}
                </Text>
                <Text style={styles.removedMeta}>
                  {event.removed_at && Date.parse(event.start_time) > Date.parse(event.removed_at)
                    ? `Removed ${formatTimeBeforeKickoff(Date.parse(event.start_time) - Date.parse(event.removed_at))} before kickoff`
                    : 'Confirmed pre-kickoff removal'}
                  {event.missing_count ? ` · ${event.missing_count} complete crawl confirmations` : ''}
                </Text>
              </View>
              <Text style={styles.removedTag}>VERIFIED</Text>
            </View>
          ))}
        </View>
      ) : null}

      {hunt.classifiedEvents.length > 0 ? (
        <View style={styles.huntDetail}>
          <Text style={styles.huntDetailTitle}>RECENT NON-REMOVAL CLASSIFICATIONS</Text>
          <Text style={styles.huntDetailText}>
            These fixtures are excluded from bookmaker-removal signals because kickoff or an independent match status explains the disappearance.
          </Text>
          {hunt.classifiedEvents.slice(0, 10).map((event) => (
            <View key={event.event_id} style={styles.removedRow}>
              <View style={styles.removedBody}>
                <Text style={styles.removedName}>Hollywoodbets · {event.name}</Text>
                <Text style={styles.removedMeta}>{lifecycleExplanation(event.lifecycle_state ?? 'unclassified')}</Text>
                <Text style={styles.removedMeta}>
                  Kickoff {new Date(event.start_time).toLocaleString()}
                  {event.verification_source_status ? ` · source ${event.verification_source_status}` : ''}
                </Text>
              </View>
              <Text style={styles.lifecycleTag}>
                {(event.lifecycle_state ?? 'unclassified').replaceAll('_', ' ').toUpperCase()}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={[styles.filters, narrow && styles.filtersNarrow]}>
        <FilterDropdown
          label="Country"
          value={categoryId == null ? '' : String(categoryId)}
          options={nav.categories.map((item) => ({ value: String(item.id), label: item.name }))}
          onChange={(value) => {
            setCategoryId(Number(value));
            setTournamentId(null);
          }}
          style={fieldStyle}
        />
        {categoryId != null ? (
          <FilterDropdown
            label="League"
            value={tournamentId == null ? '' : String(tournamentId)}
            options={nav.tournaments.map((item) => ({ value: String(item.id), label: item.name }))}
            onChange={(value) => setTournamentId(Number(value))}
            style={fieldStyle}
          />
        ) : null}
      </View>
      {nav.loadingCategories ? <Text style={styles.muted}>Loading countries…</Text> : null}
      {categoryId != null && nav.loadingTournaments ? <Text style={styles.muted}>Loading leagues…</Text> : null}
      {categoryId != null && !nav.loadingTournaments && nav.tournaments.length === 0 ? <Text style={styles.muted}>No leagues.</Text> : null}

      {/* Events */}
      {tournamentId != null ? (
        <View style={styles.events}>
          {odds.loading ? <Text style={styles.muted}>Loading odds…</Text> : null}
          {odds.error ? <Text style={styles.err}>{odds.error}</Text> : null}
          {!odds.loading && !odds.error && odds.events.length === 0 ? (
            <Text style={styles.muted}>No priced matches in this league right now.</Text>
          ) : null}
          <BookmakerFixtures key={`${categoryId}-${tournamentId}`} showLocationFilters={false}
            fixtures={fixtures} selectedLegs={selectedLegs} onToggleLeg={onAddLeg} loadMarkets={async (id) => {
              const event = await fetchEventDetail(Number(id));
              if (!event) throw new Error('This fixture is no longer offered by Hollywoodbets.');
              return hollywoodFixture(event, new Date().toISOString(), ctx ?? undefined);
            }} />
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

        </View>
      ) : null}
      {exportState.status === 'done' ? (
        <Text style={styles.ok}>Booking code {exportState.code} — opening Hollywoodbets…</Text>
      ) : null}
      {exportState.status === 'error' ? <Text style={styles.err}>{exportState.message}</Text> : null}
    </View>
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

function formatTimeBeforeKickoff(milliseconds: number): string {
  const minutes = Math.max(0, Math.floor(milliseconds / 60_000));
  const days = Math.floor(minutes / 1_440);
  const hours = Math.floor((minutes % 1_440) / 60);
  const remainder = minutes % 60;
  return [
    days > 0 ? `${days}d` : null,
    hours > 0 ? `${hours}h` : null,
    `${remainder}m`,
  ].filter((part): part is string => part != null).join(' ');
}

function lifecycleExplanation(state: string): string {
  switch (state) {
    case 'started': return 'Scheduled kickoff was reached; this is not a bookmaker removal.';
    case 'expired': return 'The match finished or aged past kickoff; this is not a bookmaker removal.';
    case 'suspended': return 'The bookmaker market or the match itself is suspended.';
    case 'postponed': return 'The independent fixture source reports the match as postponed.';
    case 'cancelled': return 'The independent fixture source reports the match as cancelled.';
    case 'abandoned': return 'The independent fixture source reports the match as abandoned.';
    case 'rescheduled': return 'The same fixture moved to a different kickoff time.';
    default: return 'The disappearance has a non-removal lifecycle explanation.';
  }
}

const styles = StyleSheet.create({
  container: { width: '100%' },
  filters: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  filtersNarrow: { flexDirection: 'column' },
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
  removedOdds: { fontFamily: fonts.bodySemiBold, fontSize: 11, color: theme.accentGreen, marginTop: 3 },
  removedTag: { fontFamily: fonts.bodySemiBold, fontSize: 8, color: theme.loss, backgroundColor: 'rgba(255, 92, 92, 0.12)', paddingHorizontal: spacing.xs, paddingVertical: 2, borderRadius: layout.borderRadius },
  pendingTag: { fontFamily: fonts.bodySemiBold, fontSize: 8, color: theme.yellow, backgroundColor: 'rgba(255, 204, 0, 0.12)', paddingHorizontal: spacing.xs, paddingVertical: 2, borderRadius: layout.borderRadius },
  lifecycleTag: { maxWidth: 110, fontFamily: fonts.bodySemiBold, fontSize: 8, color: theme.accentBlue, backgroundColor: 'rgba(72, 145, 255, 0.12)', paddingHorizontal: spacing.xs, paddingVertical: 2, borderRadius: layout.borderRadius, textAlign: 'center' },
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
  fixture: { flex: 1, minWidth: 0, fontFamily: fonts.bodySemiBold, fontSize: 15, color: theme.textPrimary },
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
  marketRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
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
