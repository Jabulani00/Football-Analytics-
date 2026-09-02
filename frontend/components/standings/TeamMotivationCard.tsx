import { StyleSheet, Text, View } from 'react-native';

import {
  GRADE_LABEL,
  OUTCOME_LABEL,
  STANCE_LABEL,
  type MotivationGrade,
  type TeamMotivation,
  type TeamStance,
} from '@/utils/motivationEngine';
import { fonts, layout, spacing, theme } from '@/styles/theme';

function gradeColor(grade: MotivationGrade): string {
  if (grade === 'A') return theme.accentGreen;
  if (grade === 'B') return theme.yellow;
  return theme.textMuted;
}

function stanceColor(stance: TeamStance): string {
  if (stance === 'chase') return theme.accentBlue;
  if (stance === 'escape') return theme.accentOrange;
  return theme.textFaint;
}

type TeamMotivationCardProps = {
  motivation: TeamMotivation;
  compact?: boolean;
};

export default function TeamMotivationCard({ motivation: m, compact }: TeamMotivationCardProps) {
  const activeProbes = m.probes.filter((p) => p.motivates);

  return (
    <View style={[styles.card, compact && styles.cardCompact]}>
      <View style={styles.head}>
        <View style={styles.headText}>
          <Text style={styles.team} numberOfLines={1}>
            {m.name}
          </Text>
          <Text style={styles.meta}>
            #{m.rank} · {m.points} pts
            {m.rankAfterWin != null && m.rankAfterWin !== m.rank
              ? ` · win → #${m.rankAfterWin}`
              : ''}
            {m.isMidTable ? ' · mid-table' : ''}
          </Text>
        </View>
        <View style={styles.badges}>
          <View style={[styles.badge, { borderColor: stanceColor(m.stance) }]}>
            <Text style={[styles.badgeText, { color: stanceColor(m.stance) }]}>
              {STANCE_LABEL[m.stance]}
            </Text>
          </View>
          <View style={[styles.badge, { borderColor: gradeColor(m.grade), backgroundColor: `${gradeColor(m.grade)}14` }]}>
            <Text style={[styles.badgeText, { color: gradeColor(m.grade) }]}>
              {GRADE_LABEL[m.grade]}
            </Text>
          </View>
        </View>
      </View>

      <Text style={styles.stanceReason}>{m.stanceReason}</Text>

      {m.outcomes.length > 0 ? (
        <View style={styles.outcomeRow}>
          {m.outcomes.map((o) => (
            <View key={o} style={styles.outcomeChip}>
              <Text style={styles.outcomeText}>{OUTCOME_LABEL[o]}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {m.reasons.map((r) => (
        <Text key={r} style={styles.reason}>
          · {r}
        </Text>
      ))}

      {!compact && activeProbes.length > 0 ? (
        <View style={styles.probeBlock}>
          <Text style={styles.probeTitle}>+3 win — gaps ≤ 4 pts</Text>
          {activeProbes.map((p) => (
            <Text key={p.key} style={styles.probeLine}>
              {p.label}: {p.gap > 0 ? '+' : ''}
              {p.gap.toFixed(0)}
            </Text>
          ))}
        </View>
      ) : null}

      {m.dethroned ? <Text style={styles.flag}>Dethroned but still linked to the line</Text> : null}
      {m.futileChase ? <Text style={styles.flagWarn}>Futile chase flagged</Text> : null}
      <Text style={styles.mode}>
        Mode: {m.mode === 'pull' ? 'Pull factors only (early)' : 'Pull + push (late season)'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.surface,
    borderRadius: layout.borderRadius,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardCompact: {
    padding: spacing.sm,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  headText: { flex: 1, minWidth: 0 },
  team: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: theme.textPrimary,
  },
  meta: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: theme.textMuted,
    marginTop: 2,
  },
  badges: { alignItems: 'flex-end', gap: 4 },
  badge: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    letterSpacing: 0.3,
  },
  stanceReason: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: theme.textMuted,
    marginBottom: spacing.xs,
  },
  outcomeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: spacing.xs,
  },
  outcomeChip: {
    backgroundColor: theme.surfaceMuted,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  outcomeText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 10,
    color: theme.textPrimary,
  },
  reason: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: theme.textMuted,
    lineHeight: 16,
  },
  probeBlock: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: layout.borderWidth,
    borderTopColor: theme.border,
  },
  probeTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    color: theme.textFaint,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  probeLine: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: theme.textMuted,
  },
  flag: {
    marginTop: spacing.xs,
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    color: theme.accentBlue,
  },
  flagWarn: {
    marginTop: spacing.xs,
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    color: theme.accentOrange,
  },
  mode: {
    marginTop: spacing.xs,
    fontFamily: fonts.body,
    fontSize: 10,
    color: theme.textFaint,
  },
});
