import { StyleSheet, Text, View } from 'react-native';

import type { MatchGoalEvent } from '@/services/apiFootball';
import type { FixtureGoalTiming, GoalPeriodEvent, GoalTimingBucket } from '@/services/oddAlerts';
import { fonts, spacing, theme } from '@/styles/theme';

type GoalTimingPanelProps = {
  homeName: string;
  awayName: string;
  htScore: string | null;
  goals: MatchGoalEvent[];
  goalsConfigured: boolean;
  goalsMatched: boolean;
  goalsLoading?: boolean;
  oddAlertsTiming: FixtureGoalTiming;
  timingLoading?: boolean;
};

type TimelineItem =
  | { kind: 'ht'; home: number; away: number }
  | { kind: '2h'; }
  | {
      kind: 'exact';
      side: 'home' | 'away';
      minute: number;
      extra: number | null;
      player: string;
      detail: string;
      assist: string | null;
      scoreHome: number;
      scoreAway: number;
      sortKey: number;
    }
  | { kind: 'period'; side: 'home' | 'away'; periodLabel: string; sortKey: number };

function formatMinute(minute: number, extra: number | null): string {
  if (extra != null && extra > 0) return `${minute}+${extra}'`;
  return `${minute}'`;
}

function goalLabel(detail: string): { suffix: string; assistLine: boolean } {
  if (/own goal/i.test(detail)) return { suffix: ' (OG)', assistLine: false };
  if (/penalty/i.test(detail)) return { suffix: ' (Pen.)', assistLine: false };
  return { suffix: '', assistLine: true };
}

function parseHtScore(ht: string | null): { home: number; away: number } | null {
  if (!ht) return null;
  const m = ht.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (!m) return null;
  return { home: Number(m[1]), away: Number(m[2]) };
}

function buildTimeline(
  goals: MatchGoalEvent[],
  periodGoals: GoalPeriodEvent[],
  htScore: string | null,
): TimelineItem[] {
  if (goals.length > 0) {
    const ht = parseHtScore(htScore);
    const items: TimelineItem[] = [];
    let htInserted = false;
    let secondHalfInserted = false;

    for (const g of goals) {
      const sortKey = g.minute + (g.extra ?? 0) * 0.01;

      if (!htInserted && ht && g.minute > 45) {
        items.push({ kind: 'ht', home: ht.home, away: ht.away });
        htInserted = true;
      }
      if (!secondHalfInserted && g.minute > 45) {
        items.push({ kind: '2h' });
        secondHalfInserted = true;
      }

      items.push({
        kind: 'exact',
        side: g.side,
        minute: g.minute,
        extra: g.extra,
        player: g.player,
        detail: g.detail,
        assist: g.assist,
        scoreHome: g.scoreHome,
        scoreAway: g.scoreAway,
        sortKey,
      });
    }

    return items;
  }

  const periodItems: TimelineItem[] = periodGoals.map((g) => ({
    kind: 'period' as const,
    side: g.side,
    periodLabel: g.periodLabel,
    sortKey: g.sortMinute + (g.side === 'away' ? 0.001 : 0),
  }));

  const ht = parseHtScore(htScore);
  if (ht && periodItems.some((p) => p.kind === 'period' && p.sortKey > 45)) {
    const idx = periodItems.findIndex((p) => p.kind === 'period' && p.sortKey > 45);
    periodItems.splice(idx, 0, { kind: 'ht', home: ht.home, away: ht.away }, { kind: '2h' });
  }

  return periodItems;
}

function maxBucketTotal(buckets: GoalTimingBucket[]): number {
  return buckets.reduce((m, b) => Math.max(m, b.home, b.away), 0);
}

/** Compact scorer list like Flashscore under the scoreboard. */
function ScorerLists({
  homeName,
  awayName,
  goals,
}: {
  homeName: string;
  awayName: string;
  goals: MatchGoalEvent[];
}) {
  const homeGoals = goals.filter((g) => g.side === 'home');
  const awayGoals = goals.filter((g) => g.side === 'away');
  if (!homeGoals.length && !awayGoals.length) return null;

  return (
    <View style={styles.scorerLists}>
      <View style={styles.scorerCol}>
        <Text style={styles.scorerTeam} numberOfLines={1}>
          {homeName}
        </Text>
        {homeGoals.map((g, i) => (
          <ScorerChip key={`h-${g.minute}-${i}`} goal={g} align="left" />
        ))}
      </View>
      <View style={styles.scorerCol}>
        <Text style={[styles.scorerTeam, styles.textRight]} numberOfLines={1}>
          {awayName}
        </Text>
        {awayGoals.map((g, i) => (
          <ScorerChip key={`a-${g.minute}-${i}`} goal={g} align="right" />
        ))}
      </View>
    </View>
  );
}

function ScorerChip({ goal, align }: { goal: MatchGoalEvent; align: 'left' | 'right' }) {
  const { suffix } = goalLabel(goal.detail);
  return (
    <Text style={[styles.scorerLine, align === 'right' && styles.textRight]}>
      {goal.player}
      {suffix}
      <Text style={styles.scorerMinute}> {formatMinute(goal.minute, goal.extra)}</Text>
    </Text>
  );
}

export default function GoalTimingPanel({
  homeName,
  awayName,
  htScore,
  goals,
  goalsConfigured,
  goalsMatched,
  goalsLoading,
  oddAlertsTiming,
  timingLoading,
}: GoalTimingPanelProps) {
  const loading = goalsLoading || timingLoading;
  const timeline = buildTimeline(goals, oddAlertsTiming.periodGoals, htScore);
  const hasExact = goals.length > 0;
  const hasPeriod = oddAlertsTiming.available && oddAlertsTiming.buckets.length > 0;
  const totalGoals = goals.length > 0 || oddAlertsTiming.periodGoals.length > 0;
  const barMax = maxBucketTotal(oddAlertsTiming.buckets);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Goals</Text>

      {loading ? (
        <Text style={styles.muted}>Loading goals…</Text>
      ) : !totalGoals ? (
        <Text style={styles.muted}>No goals recorded yet.</Text>
      ) : (
        <>
          {hasExact ? <ScorerLists homeName={homeName} awayName={awayName} goals={goals} /> : null}

          <View style={styles.timelineWrap}>
            <View style={styles.axisLine} pointerEvents="none" />
            <View style={styles.timeline}>
              {timeline.map((row, i) => (
                <TimelineItemView key={`${row.kind}-${i}`} row={row} />
              ))}
            </View>
          </View>

          {hasPeriod ? (
            <View style={styles.periodSection}>
              <Text style={styles.periodTitle}>Goals by period</Text>
              <View style={styles.periodHeader}>
                <Text style={[styles.periodTeam, styles.textRight]} numberOfLines={1}>
                  {homeName}
                </Text>
                <Text style={styles.periodMid} />
                <Text style={styles.periodTeam} numberOfLines={1}>
                  {awayName}
                </Text>
              </View>
              {oddAlertsTiming.buckets.map((b) => (
                <PeriodBar key={b.key} bucket={b} max={barMax} />
              ))}
            </View>
          ) : null}

          {oddAlertsTiming.approximate && !hasExact ? (
            <Text style={styles.muted}>
              Goal periods estimated from the score when OddAlerts frozen stats do not validate.
            </Text>
          ) : null}

          {!hasExact && !oddAlertsTiming.approximate && oddAlertsTiming.available ? (
            <Text style={styles.muted}>
              Goal periods from OddAlerts stats/fixture — scorer names need API-Football when configured.
            </Text>
          ) : null}

          {!hasExact && !oddAlertsTiming.approximate && goalsConfigured && !goalsMatched ? (
            <Text style={styles.muted}>
              No API-Football match found for these teams — period timing only when available.
            </Text>
          ) : null}
        </>
      )}
    </View>
  );
}

function TimelineItemView({ row }: { row: TimelineItem }) {
  if (row.kind === 'ht') {
    return (
      <View style={styles.markerRow}>
        <View style={styles.markerLine} />
        <Text style={styles.markerText}>
          Halftime {row.home} - {row.away}
        </Text>
        <View style={styles.markerLine} />
      </View>
    );
  }

  if (row.kind === '2h') {
    return (
      <View style={styles.markerRow}>
        <View style={styles.markerLine} />
        <Text style={styles.markerTextMuted}>2nd half</Text>
        <View style={styles.markerLine} />
      </View>
    );
  }

  if (row.kind === 'period') {
    return (
      <View style={styles.eventRow}>
        <View style={[styles.eventSide, styles.eventSideHome]}>
          {row.side === 'home' ? (
            <PeriodEventContent periodLabel={row.periodLabel} align="right" />
          ) : null}
        </View>
        <View style={styles.eventCenter}>
          <View style={styles.minutePill}>
            <Text style={styles.minuteText}>{row.periodLabel}</Text>
          </View>
        </View>
        <View style={[styles.eventSide, styles.eventSideAway]}>
          {row.side === 'away' ? (
            <PeriodEventContent periodLabel={row.periodLabel} align="left" />
          ) : null}
        </View>
      </View>
    );
  }

  const { suffix, assistLine } = goalLabel(row.detail);
  const time = formatMinute(row.minute, row.extra);
  const score = `${row.scoreHome} - ${row.scoreAway}`;

  if (row.side === 'home') {
    return (
      <View style={styles.eventRow}>
        <View style={[styles.eventSide, styles.eventSideHome]}>
          <View style={styles.eventContentRight}>
            <Text style={styles.playerName} numberOfLines={2}>
              {row.player}
              {suffix ? <Text style={styles.suffix}>{suffix}</Text> : null}
            </Text>
            {assistLine && row.assist ? (
              <Text style={styles.assistLine} numberOfLines={1}>
                Assist: {row.assist}
              </Text>
            ) : null}
            <Text style={styles.runningScore}>{score}</Text>
          </View>
          <Text style={styles.ballIcon}>⚽</Text>
        </View>
        <View style={styles.eventCenter}>
          <View style={styles.minutePill}>
            <Text style={styles.minuteText}>{time}</Text>
          </View>
        </View>
        <View style={[styles.eventSide, styles.eventSideAway]} />
      </View>
    );
  }

  return (
    <View style={styles.eventRow}>
      <View style={[styles.eventSide, styles.eventSideHome]} />
      <View style={styles.eventCenter}>
        <View style={styles.minutePill}>
          <Text style={styles.minuteText}>{time}</Text>
        </View>
      </View>
      <View style={[styles.eventSide, styles.eventSideAway]}>
        <Text style={styles.ballIcon}>⚽</Text>
        <View style={styles.eventContentLeft}>
          <Text style={styles.playerName} numberOfLines={2}>
            {row.player}
            {suffix ? <Text style={styles.suffix}>{suffix}</Text> : null}
          </Text>
          {assistLine && row.assist ? (
            <Text style={styles.assistLine} numberOfLines={1}>
              Assist: {row.assist}
            </Text>
          ) : null}
          <Text style={styles.runningScore}>{score}</Text>
        </View>
      </View>
    </View>
  );
}

function PeriodEventContent({
  periodLabel,
  align,
}: {
  periodLabel: string;
  align: 'left' | 'right';
}) {
  return (
    <View style={align === 'right' ? styles.eventContentRight : styles.eventContentLeft}>
      <Text style={[styles.playerName, styles.periodOnly, align === 'right' && styles.textRight]}>
        Goal
      </Text>
      <Text style={[styles.runningScore, align === 'right' && styles.textRight]}>{periodLabel}</Text>
    </View>
  );
}

function PeriodBar({ bucket, max }: { bucket: GoalTimingBucket; max: number }) {
  const homeFlex = max > 0 ? bucket.home / max : 0;
  const awayFlex = max > 0 ? bucket.away / max : 0;

  return (
    <View style={styles.barRow}>
      <View style={styles.barSide}>
        {bucket.home > 0 ? (
          <View style={[styles.barHome, { flex: homeFlex }]}>
            <Text style={styles.barCount}>{bucket.home}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.barLabel}>{bucket.label}</Text>
      <View style={[styles.barSide, styles.barSideAway]}>
        {bucket.away > 0 ? (
          <View style={[styles.barAway, { flex: awayFlex }]}>
            <Text style={styles.barCount}>{bucket.away}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const AXIS_WIDTH = 40;

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  title: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: theme.textPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  muted: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textMuted,
    lineHeight: 18,
    marginTop: spacing.xs,
  },
  scorerLists: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  scorerCol: {
    flex: 1,
    gap: 2,
  },
  scorerTeam: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    color: theme.textFaint,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  scorerLine: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: theme.textPrimary,
    lineHeight: 17,
  },
  scorerMinute: {
    fontFamily: fonts.body,
    color: theme.textMuted,
    fontSize: 11,
  },
  timelineWrap: {
    position: 'relative',
    minHeight: 40,
  },
  axisLine: {
    position: 'absolute',
    left: '50%',
    marginLeft: -0.5,
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: theme.borderStrong,
  },
  timeline: {
    gap: spacing.sm,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    minHeight: 36,
  },
  eventSide: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
    paddingTop: 2,
  },
  eventSideHome: {
    justifyContent: 'flex-end',
  },
  eventSideAway: {
    justifyContent: 'flex-start',
  },
  eventCenter: {
    width: AXIS_WIDTH,
    alignItems: 'center',
    zIndex: 1,
  },
  minutePill: {
    backgroundColor: theme.surfaceMuted,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 36,
    alignItems: 'center',
  },
  minuteText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    color: theme.textMuted,
  },
  eventContentRight: {
    flex: 1,
    alignItems: 'flex-end',
  },
  eventContentLeft: {
    flex: 1,
    alignItems: 'flex-start',
  },
  playerName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: theme.textPrimary,
    lineHeight: 16,
  },
  suffix: {
    fontFamily: fonts.body,
    color: theme.textMuted,
    fontSize: 11,
  },
  assistLine: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: theme.textFaint,
    marginTop: 1,
  },
  runningScore: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    color: theme.textMuted,
    marginTop: 2,
  },
  ballIcon: {
    fontSize: 11,
    lineHeight: 16,
    marginTop: 1,
  },
  periodOnly: {
    fontFamily: fonts.body,
    color: theme.textMuted,
  },
  markerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginVertical: 4,
  },
  markerLine: {
    flex: 1,
    height: 1,
    backgroundColor: theme.border,
  },
  markerText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    color: theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  markerTextMuted: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: theme.textFaint,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  textRight: {
    textAlign: 'right',
  },
  periodSection: {
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  periodTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    color: theme.textFaint,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: spacing.xs,
  },
  periodHeader: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  periodTeam: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 10,
    color: theme.textFaint,
  },
  periodMid: {
    width: AXIS_WIDTH,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 4,
  },
  barSide: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    minHeight: 16,
  },
  barSideAway: {
    justifyContent: 'flex-start',
  },
  barLabel: {
    width: AXIS_WIDTH,
    fontFamily: fonts.body,
    fontSize: 9,
    color: theme.textFaint,
    textAlign: 'center',
  },
  barHome: {
    backgroundColor: theme.accentGreen,
    borderRadius: 2,
    minWidth: 18,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    height: 16,
    maxWidth: '100%',
  },
  barAway: {
    backgroundColor: theme.live,
    borderRadius: 2,
    minWidth: 18,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    height: 16,
    maxWidth: '100%',
  },
  barCount: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 9,
    color: '#fff',
  },
});
