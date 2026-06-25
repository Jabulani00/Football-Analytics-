import { StyleSheet, Text, View } from 'react-native';

import type { MatchGoalEvent } from '@/services/apiFootball';
import { fonts, spacing, theme } from '@/styles/theme';

type GoalScorersPanelProps = {
  homeName: string;
  awayName: string;
  goals: MatchGoalEvent[];
  configured: boolean;
  matched: boolean;
  loading?: boolean;
};

function formatMinute(minute: number, extra: number | null): string {
  if (extra != null && extra > 0) return `${minute}+${extra}'`;
  return `${minute}'`;
}

export default function GoalScorersPanel({
  homeName,
  awayName,
  goals,
  configured,
  matched,
  loading,
}: GoalScorersPanelProps) {
  const homeGoals = goals.filter((g) => g.side === 'home');
  const awayGoals = goals.filter((g) => g.side === 'away');

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Goal scorers</Text>

      {loading ? (
        <Text style={styles.muted}>Loading scorers…</Text>
      ) : !configured ? (
        <Text style={styles.muted}>
          Goal scorers are not in the OddAlerts feed. Add a free API-Football key
          (API_FOOTBALL_KEY in .env) to show who scored and when.
        </Text>
      ) : !matched ? (
        <Text style={styles.muted}>
          No matching fixture found in API-Football for this league or date — scorer
          lines are unavailable.
        </Text>
      ) : homeGoals.length === 0 && awayGoals.length === 0 ? (
        <Text style={styles.muted}>No goals recorded yet.</Text>
      ) : (
        <View style={styles.columns}>
          <View style={styles.col}>
            <Text style={styles.colHeader} numberOfLines={1}>
              {homeName}
            </Text>
            {homeGoals.map((g, i) => (
              <GoalLine key={`h-${g.minute}-${g.player}-${i}`} goal={g} align="left" />
            ))}
          </View>
          <View style={styles.col}>
            <Text style={[styles.colHeader, styles.textRight]} numberOfLines={1}>
              {awayName}
            </Text>
            {awayGoals.map((g, i) => (
              <GoalLine key={`a-${g.minute}-${g.player}-${i}`} goal={g} align="right" />
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

function GoalLine({ goal, align }: { goal: MatchGoalEvent; align: 'left' | 'right' }) {
  const isOwn = /own goal/i.test(goal.detail);
  const isPen = /penalty/i.test(goal.detail);
  const suffix = isOwn ? ' (OG)' : isPen ? ' (pen)' : '';
  const assist = goal.assist ? ` (${goal.assist})` : '';

  return (
    <Text style={[styles.line, align === 'right' && styles.textRight]}>
      <Text style={styles.minute}>{formatMinute(goal.minute, goal.extra)}</Text>
      {'  '}
      {goal.player}
      {suffix}
      {assist ? <Text style={styles.assist}>{assist}</Text> : null}
    </Text>
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
  },
  columns: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  col: {
    flex: 1,
    gap: 4,
  },
  colHeader: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    color: theme.textFaint,
    marginBottom: 4,
  },
  line: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: theme.textPrimary,
    lineHeight: 18,
  },
  minute: {
    fontFamily: fonts.bodySemiBold,
    color: theme.textMuted,
  },
  assist: {
    fontFamily: fonts.body,
    color: theme.textMuted,
    fontSize: 11,
  },
  textRight: {
    textAlign: 'right',
  },
});
