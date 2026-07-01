import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import LivePulse from '@/components/shared/LivePulse';
import type { MatchTimelineEvent } from '@/services/apiFootball';
import type { ApiStatus, GoalPeriodEvent, MatchStats, OddAlertsChartMarker } from '@/services/oddAlerts';
import { fonts, spacing, theme } from '@/styles/theme';
import {
  eventIcon,
  formatEventMinute,
  periodGoalsToMarkers,
  type TimelineMarker,
} from '@/utils/matchTimeline';
import {
  formatPressure,
  isLiveMatchStatus,
  readPressureFactors,
  type PressureReading,
  type PressureSnapshot,
} from '@/utils/pressureMonitor';

/** OddAlerts-style blues for the mirror pressure chart. */
const PRESSURE_HOME = '#38BDF8';
const PRESSURE_AWAY = '#475569';
const PRESSURE_HOME_DEEP = '#0EA5E9';

const CHART_HEIGHT = 88;
const CHART_HALF = CHART_HEIGHT / 2;
const TICK_MINUTES = [0, 15, 30, 45, 60, 75, 90] as const;
const TICK_LABELS = ['KO', '15', '30', 'HT', '60', '75', 'FT'] as const;

type PressureMonitorPanelProps = {
  homeName: string;
  awayName: string;
  status: ApiStatus;
  reading: PressureReading | null;
  history: PressureSnapshot[];
  stats?: MatchStats;
  apiTimeline: MatchTimelineEvent[];
  periodGoals: GoalPeriodEvent[];
  oddAlertsMarkers: OddAlertsChartMarker[];
  eventsConfigured: boolean;
  timingApproximate?: boolean;
};

function oddAlertsToMarkers(markers: OddAlertsChartMarker[]): TimelineMarker[] {
  return markers.map((m) => ({
    kind: m.kind,
    side: m.side,
    minute: m.minute,
    extra: null,
    label: m.kind === 'goal' ? 'Goal' : 'Card',
    sortKey: m.sortKey,
  }));
}

function apiTimelineToMarkers(events: MatchTimelineEvent[]): TimelineMarker[] {
  return events.map((e) => ({
    kind: e.kind === 'sub' ? 'sub' : e.kind,
    side: e.side,
    minute: e.minute,
    extra: e.extra,
    label: e.kind === 'sub' && e.relatedPlayer ? `${e.player} ↔ ${e.relatedPlayer}` : e.player,
    sortKey: e.minute + (e.extra ?? 0) * 0.01,
  }));
}

function eventKindLabel(kind: TimelineMarker['kind']): string {
  switch (kind) {
    case 'goal':
      return 'Goal';
    case 'yellow':
      return 'Yellow card';
    case 'red':
      return 'Red card';
    case 'sub':
      return 'Substitution';
    case 'corner':
      return 'Corner';
    default:
      return 'Event';
  }
}

function legendIcon(kind: 'shot' | TimelineMarker['kind']): string {
  if (kind === 'shot') return '○';
  return eventIcon(kind);
}

/** Donut-style gauge — home share as coloured arc segment. */
function PressureGauge({ home, size = 44 }: { home: number; away: number; size?: number }) {
  const homePct = Math.min(100, Math.max(0, home));
  return (
    <View style={[styles.gaugeOuter, { width: size, height: size, borderRadius: size / 2 }]}>
      <View
        style={[
          styles.gaugeHomeArc,
          {
            width: size,
            height: size / 2,
            borderTopLeftRadius: size / 2,
            borderTopRightRadius: size / 2,
            opacity: homePct / 100,
          },
        ]}
      />
      <View style={[styles.gaugeInner, { width: size - 10, height: size - 10, borderRadius: (size - 10) / 2 }]}>
        <Text style={styles.gaugeInnerText}>{Math.round(homePct)}</Text>
      </View>
    </View>
  );
}

function PressureFormulaRow({
  label,
  home,
  away,
}: {
  label: string;
  home: number;
  away: number;
}) {
  return (
    <View style={styles.formulaRow}>
      <Text style={styles.formulaRowLabel}>{label}</Text>
      <View style={styles.formulaValues}>
        <Text style={styles.formulaTeamVal}>{formatPressure(home)}</Text>
        <PressureGauge home={home} away={away} />
        <Text style={styles.formulaTeamVal}>{formatPressure(away)}</Text>
      </View>
    </View>
  );
}

function EventLegend() {
  const items: { kind: 'shot' | TimelineMarker['kind']; label: string }[] = [
    { kind: 'shot', label: 'Shot' },
    { kind: 'goal', label: 'Goal' },
    { kind: 'corner', label: 'Corner' },
    { kind: 'yellow', label: 'Card' },
  ];
  return (
    <View style={styles.legend}>
      {items.map((item) => (
        <View key={item.label} style={styles.legendItem}>
          <Text style={[styles.legendIcon, item.kind === 'yellow' && styles.legendCard]}>{legendIcon(item.kind)}</Text>
          <Text style={styles.legendLabel}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

function EventsToggle({ on, onPress }: { on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.eventsToggle} accessibilityRole="switch">
      <View style={[styles.toggleTrack, on && styles.toggleTrackOn]}>
        <View style={[styles.toggleThumb, on && styles.toggleThumbOn]} />
      </View>
      <Text style={styles.eventsToggleLabel}>Events</Text>
      {on ? <View style={styles.toggleDot} /> : null}
    </Pressable>
  );
}

function MirrorPressureChart({
  history,
  markers,
  maxMinute,
  showEvents,
}: {
  history: PressureSnapshot[];
  markers: TimelineMarker[];
  maxMinute: number;
  showEvents: boolean;
}) {
  const endMinute = Math.max(maxMinute, 90, ...history.map((h) => h.minute), 1);

  const minuteToPct = (minute: number) => Math.min(99, Math.max(0, (minute / endMinute) * 100));

  return (
    <View style={styles.mirrorWrap}>
      <View style={[styles.mirrorChart, { height: CHART_HEIGHT }]}>
        <View style={[styles.mirrorMidline, { top: CHART_HALF }]} />

        <View style={styles.mirrorBars}>
          {history.map((snap) => {
            const homeH = (snap.home / 100) * (CHART_HALF - 2);
            const awayH = (snap.away / 100) * (CHART_HALF - 2);
            return (
              <View key={`bar-${snap.minute}`} style={styles.mirrorCol}>
                <View style={[styles.mirrorHalf, styles.mirrorHalfTop]}>
                  <View style={[styles.mirrorBarHome, { height: homeH }]} />
                </View>
                <View style={[styles.mirrorHalf, styles.mirrorHalfBottom]}>
                  <View style={[styles.mirrorBarAway, { height: awayH }]} />
                </View>
              </View>
            );
          })}
        </View>

        {showEvents
          ? markers.map((m, i) => {
              const leftPct = minuteToPct(m.minute);
              const onHome = m.side === 'home';
              return (
                <View
                  key={`ev-${m.kind}-${m.minute}-${i}`}
                  style={[
                    styles.chartEvent,
                    { left: `${leftPct}%` as const },
                    onHome ? { top: 2 } : { bottom: 2 },
                  ]}
                >
                  <Text style={[styles.chartEventIcon, m.kind === 'yellow' && styles.chartCardIcon]}>
                    {eventIcon(m.kind)}
                  </Text>
                </View>
              );
            })
          : null}
      </View>

      <View style={styles.mirrorAxis}>
        {TICK_LABELS.map((label, i) => {
          const min = i === TICK_LABELS.length - 1 ? endMinute : TICK_MINUTES[i];
          const show = min <= endMinute || i === 0;
          if (!show && i > 0) return <View key={label} style={styles.axisTickSpacer} />;
          return (
            <Text key={label} style={styles.mirrorAxisLabel}>
              {i === TICK_LABELS.length - 1 && endMinute !== 90 ? `${endMinute}` : label}
            </Text>
          );
        })}
      </View>
    </View>
  );
}

function latestEventCaption(
  markers: TimelineMarker[],
  homeName: string,
  awayName: string,
): string | null {
  if (!markers.length) return null;
  const last = markers[markers.length - 1];
  const team = last.side === 'home' ? homeName : awayName;
  return `${team} ${eventKindLabel(last.kind)} · ${formatEventMinute(last.minute, last.extra)}`;
}

export default function PressureMonitorPanel({
  homeName,
  awayName,
  status,
  reading,
  history,
  stats,
  apiTimeline,
  periodGoals,
  oddAlertsMarkers,
  eventsConfigured,
  timingApproximate,
}: PressureMonitorPanelProps) {
  const live = isLiveMatchStatus(status);
  const [showEvents, setShowEvents] = useState(true);

  const allMarkers = useMemo(() => {
    const fromApi = apiTimelineToMarkers(apiTimeline);
    if (fromApi.length > 0) return fromApi;
    if (oddAlertsMarkers.length > 0) return oddAlertsToMarkers(oddAlertsMarkers);
    return periodGoalsToMarkers(periodGoals);
  }, [apiTimeline, oddAlertsMarkers, periodGoals]);

  const chartHistory = useMemo(() => {
    if (history.length > 0) return history;
    if (reading) return [reading.current];
    return [];
  }, [history, reading]);

  const factors = useMemo(() => readPressureFactors(stats), [stats]);
  const maxMinute = reading?.current.minute ?? chartHistory[chartHistory.length - 1]?.minute ?? 90;
  const caption = latestEventCaption(allMarkers, homeName, awayName);

  if (!reading) {
    return (
      <View style={styles.card}>
        <View style={styles.blockHeader}>
          <Text style={styles.fxIcon}>ƒ(x)</Text>
          <Text style={styles.blockTitle}>Pressure Formula</Text>
          {live ? <LivePulse /> : null}
        </View>
        <Text style={styles.muted}>
          {live
            ? 'Waiting for pressure data — include=stats on live fixtures.'
            : 'Pressure index appears when OddAlerts publishes live stats.'}
        </Text>
        {allMarkers.length > 0 ? (
          <View style={styles.monitorBlock}>
            <Text style={styles.blockTitle}>Pressure monitor</Text>
            <EventLegend />
            <EventsToggle on={showEvents} onPress={() => setShowEvents((v) => !v)} />
            {caption ? <Text style={styles.eventCaption}>{caption}</Text> : null}
          </View>
        ) : null}
      </View>
    );
  }

  const { current } = reading;
  const homeAvg = current.homeAvg ?? current.home;
  const awayAvg = current.awayAvg ?? current.away;

  return (
    <View style={styles.card}>
      {/* —— Pressure Formula (OddAlerts layout) —— */}
      <View style={styles.blockHeader}>
        <Text style={styles.fxIcon}>ƒ(x)</Text>
        <Text style={styles.blockTitle}>Pressure Formula</Text>
        {live ? <LivePulse /> : null}
      </View>

      <View style={styles.teamLabels}>
        <Text style={styles.teamLabelHome} numberOfLines={1}>
          {homeName}
        </Text>
        <Text style={styles.teamLabelAway} numberOfLines={1}>
          {awayName}
        </Text>
      </View>

      <PressureFormulaRow label="Live Pressure" home={current.home} away={current.away} />
      <PressureFormulaRow label="Avg Pressure" home={homeAvg} away={awayAvg} />

      <View style={styles.formulaFooter}>
        <EventsToggle on={showEvents} onPress={() => setShowEvents((v) => !v)} />
      </View>

      {/* —— Pressure monitor mirror chart —— */}
      <View style={styles.monitorBlock}>
        <View style={styles.monitorHeader}>
          <Text style={styles.chartIcon}>▥</Text>
          <Text style={styles.blockTitle}>Pressure monitor</Text>
          <EventLegend />
        </View>

        {chartHistory.length > 0 ? (
          <MirrorPressureChart
            history={chartHistory}
            markers={allMarkers}
            maxMinute={maxMinute}
            showEvents={showEvents}
          />
        ) : (
          <Text style={styles.hint}>
            {live
              ? 'Trace builds each minute via include=stats (OddAlerts polls every 60s).'
              : chartHistory.length <= 1
                ? 'Open this match during live play to build the pressure trace — OddAlerts only returns the current snapshot.'
                : 'No pressure trace for this session.'}
          </Text>
        )}

        {showEvents && caption ? <Text style={styles.eventCaption}>{caption}</Text> : null}

        {oddAlertsMarkers.length > 0 && !eventsConfigured ? (
          <Text style={styles.hint}>
            Goal and card markers from OddAlerts stats/fixture
            {timingApproximate ? ' (periods estimated where half-time buckets are unavailable)' : ''}.
          </Text>
        ) : null}
      </View>

      {factors.length > 0 ? (
        <View style={styles.inputsBlock}>
          <Text style={styles.inputsTitle}>Live stat inputs</Text>
          {factors.slice(0, 4).map((f) => (
            <View key={f.label} style={styles.inputRow}>
              <Text style={styles.inputLabel}>{f.label}</Text>
              <Text style={styles.inputHome}>{formatPressure(f.home)}%</Text>
              <View style={styles.inputBar}>
                <View style={[styles.inputBarHome, { flex: f.home }]} />
                <View style={[styles.inputBarAway, { flex: f.away }]} />
              </View>
              <Text style={styles.inputAway}>{formatPressure(f.away)}%</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  blockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  fxIcon: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: theme.accentGreen,
  },
  blockTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: theme.textPrimary,
    flex: 1,
  },
  chartIcon: {
    fontSize: 14,
    color: theme.textMuted,
    marginRight: 4,
  },
  muted: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textMuted,
    lineHeight: 18,
  },
  teamLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  teamLabelHome: {
    flex: 1,
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    color: PRESSURE_HOME_DEEP,
  },
  teamLabelAway: {
    flex: 1,
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    color: PRESSURE_AWAY,
    textAlign: 'right',
  },
  formulaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  formulaRowLabel: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textMuted,
    width: 88,
  },
  formulaValues: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  formulaTeamVal: {
    fontFamily: fonts.displaySemi,
    fontSize: 18,
    color: theme.textPrimary,
    minWidth: 28,
    textAlign: 'center',
  },
  gaugeOuter: {
    backgroundColor: theme.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  gaugeHomeArc: {
    position: 'absolute',
    top: 0,
    backgroundColor: PRESSURE_HOME_DEEP,
  },
  gaugeInner: {
    backgroundColor: theme.surface,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  gaugeInnerText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 9,
    color: theme.textMuted,
  },
  formulaFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  eventsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  toggleTrack: {
    width: 36,
    height: 20,
    borderRadius: 10,
    backgroundColor: theme.surfaceMuted,
    padding: 2,
    justifyContent: 'center',
  },
  toggleTrackOn: {
    backgroundColor: 'rgba(5, 150, 105, 0.25)',
  },
  toggleThumb: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: theme.borderStrong,
  },
  toggleThumbOn: {
    alignSelf: 'flex-end',
    backgroundColor: theme.accentGreen,
  },
  eventsToggleLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: theme.textPrimary,
  },
  toggleDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.accentGreen,
  },
  monitorBlock: {
    marginTop: spacing.xs,
  },
  monitorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginLeft: 'auto',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  legendIcon: {
    fontSize: 10,
    color: theme.textMuted,
  },
  legendCard: {
    color: theme.yellow,
    fontSize: 9,
  },
  legendLabel: {
    fontFamily: fonts.body,
    fontSize: 9,
    color: theme.textFaint,
  },
  mirrorWrap: {
    gap: 4,
  },
  mirrorChart: {
    position: 'relative',
    backgroundColor: '#F0F4F8',
    borderRadius: 6,
    overflow: 'hidden',
  },
  mirrorMidline: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: theme.borderStrong,
    zIndex: 2,
  },
  mirrorBars: {
    flex: 1,
    flexDirection: 'row',
    height: CHART_HEIGHT,
  },
  mirrorCol: {
    flex: 1,
    height: CHART_HEIGHT,
  },
  mirrorHalf: {
    height: CHART_HALF,
    paddingHorizontal: 0.5,
  },
  mirrorHalfTop: {
    justifyContent: 'flex-end',
  },
  mirrorHalfBottom: {
    justifyContent: 'flex-start',
  },
  mirrorBarHome: {
    backgroundColor: PRESSURE_HOME,
    borderTopLeftRadius: 1,
    borderTopRightRadius: 1,
    minHeight: 1,
  },
  mirrorBarAway: {
    backgroundColor: PRESSURE_AWAY,
    borderBottomLeftRadius: 1,
    borderBottomRightRadius: 1,
    minHeight: 1,
  },
  chartEvent: {
    position: 'absolute',
    marginLeft: -7,
    zIndex: 3,
  },
  chartEventIcon: {
    fontSize: 11,
  },
  chartCardIcon: {
    fontSize: 9,
  },
  mirrorAxis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  mirrorAxisLabel: {
    fontFamily: fonts.body,
    fontSize: 9,
    color: theme.textFaint,
    minWidth: 16,
    textAlign: 'center',
  },
  axisTickSpacer: {
    flex: 1,
  },
  eventCaption: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: theme.textPrimary,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  hint: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: theme.textFaint,
    marginTop: spacing.xs,
    lineHeight: 14,
  },
  inputsBlock: {
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.border,
    gap: 4,
  },
  inputsTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    color: theme.textFaint,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  inputLabel: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: theme.textMuted,
    width: 96,
  },
  inputHome: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 9,
    color: PRESSURE_HOME_DEEP,
    width: 30,
    textAlign: 'right',
  },
  inputAway: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 9,
    color: PRESSURE_AWAY,
    width: 30,
  },
  inputBar: {
    flex: 1,
    flexDirection: 'row',
    height: 5,
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: theme.surfaceMuted,
  },
  inputBarHome: {
    backgroundColor: PRESSURE_HOME,
  },
  inputBarAway: {
    backgroundColor: PRESSURE_AWAY,
  },
});
