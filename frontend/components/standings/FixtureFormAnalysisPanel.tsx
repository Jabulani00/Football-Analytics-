import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useFixtureFormAnalysis } from '@/hooks/useFixtureFormAnalysis';
import {
  CHANGE_LABEL,
  OPTION_LABEL,
  type FormGrade,
  type TeamLast5,
} from '@/utils/last5Analysis';
import type { StandingLike } from '@/utils/motivationEngine';
import type { SeparatorFlag, SeparatorGrade } from '@/utils/separatorTools';
import { fonts, layout, spacing, theme } from '@/styles/theme';

type Props = {
  standings: StandingLike[];
  homeId: number | null | undefined;
  awayId: number | null | undefined;
  homeName: string;
  awayName: string;
  seasonProgress?: number | null;
};

function gradeColor(g: SeparatorGrade | FormGrade): string {
  switch (g) {
    case 'good':
    case 'excellent':
      return theme.accentGreen;
    case 'mediocre':
    case 'warn':
      return theme.yellow;
    case 'bad':
      return theme.loss;
    default:
      return theme.textMuted;
  }
}

function FlagChip({ flag }: { flag: SeparatorFlag }) {
  return (
    <View style={[styles.chip, { borderColor: gradeColor(flag.grade) }]}>
      <Text style={[styles.chipLabel, { color: gradeColor(flag.grade) }]}>{flag.label}</Text>
      <Text style={styles.chipDetail} numberOfLines={2}>
        {flag.side !== 'fixture' ? `[${flag.side}] ` : ''}
        {flag.detail}
      </Text>
    </View>
  );
}

function Last5Block({ title, team }: { title: string; team: TeamLast5 }) {
  return (
    <View style={styles.last5Card}>
      <Text style={styles.last5Title}>{title}</Text>
      <Text style={styles.last5Meta}>
        {OPTION_LABEL[team.option]} · {team.tablePoints} pts · grade {team.gradePoints}
      </Text>
      <Text style={styles.seq}>{team.sequence.join(' ')}</Text>
      <Text style={styles.last5Meta}>
        {CHANGE_LABEL[team.change]} ({team.initialBand} → {team.finalBand})
        {team.inhlambuluko ? ' · Inhlambuluko' : ''}
      </Text>
      <View style={styles.gradeRow}>
        {team.games.map((g) => (
          <View
            key={g.result.fixtureId}
            style={[styles.gradePill, { borderColor: gradeColor(g.grade) }]}>
            <Text style={[styles.gradePillText, { color: gradeColor(g.grade) }]}>
              {g.result.outcome}/{g.points}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * Additive Summary block for Section 4 (separators) + Section 5 (last 5).
 * Does not replace Table stakes / recommendations.
 */
export default function FixtureFormAnalysisPanel({
  standings,
  homeId,
  awayId,
  homeName,
  awayName,
  seasonProgress,
}: Props) {
  const { loading, error, separators, last5, homeResultsCount, awayResultsCount } =
    useFixtureFormAnalysis({
      homeId,
      awayId,
      standings,
      seasonProgress,
      enabled: homeId != null || awayId != null,
    });

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Separators & last 5</Text>
      <Text style={styles.sub}>
        Section 4 flags · Section 5 Ukulumbana · {homeName} vs {awayName}
      </Text>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={theme.accentGreen} />
          <Text style={styles.muted}>Loading recent form…</Text>
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {!loading && homeResultsCount + awayResultsCount === 0 && !error ? (
        <Text style={styles.muted}>No recent finished matches found for these sides yet.</Text>
      ) : null}

      {separators && separators.active.length > 0 ? (
        <View style={styles.block}>
          <Text style={styles.blockTitle}>
            Active separators ({separators.active.length})
            {separators.pointsDiff != null ? ` · ΔP ${separators.pointsDiff}` : ''}
          </Text>
          <View style={styles.chipList}>
            {separators.active.slice(0, 12).map((f) => (
              <FlagChip key={f.id} flag={f} />
            ))}
          </View>
        </View>
      ) : null}

      {last5?.home || last5?.away ? (
        <View style={styles.block}>
          <Text style={styles.blockTitle}>Last 5 analysis</Text>
          {last5.ukulumbanaLabel ? (
            <Text style={styles.ukulumbana}>
              Ukulumbana #{last5.ukulumbanaId}: {last5.ukulumbanaLabel}
              {last5.significantSplit ? ' · split' : ' · same-strength lean'}
            </Text>
          ) : null}
          {last5.home ? <Last5Block title={homeName} team={last5.home} /> : null}
          {last5.away ? <Last5Block title={awayName} team={last5.away} /> : null}

          <Text style={styles.lensTitle}>Lenses A–D (last 5 pts)</Text>
          {last5.lenses.map((l) => (
            <Text key={l.id} style={styles.lensLine}>
              {l.id}. {l.label}: {l.homeScore}–{l.awayScore} (Δ {l.diff > 0 ? '+' : ''}
              {l.diff}) {l.sameStrength ? '· same strength' : '· gap'}
            </Text>
          ))}
          <Text style={styles.reliability}>{last5.reliabilityNote}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  title: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: theme.textPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  sub: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: theme.textMuted,
    marginBottom: spacing.sm,
  },
  loading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  muted: { fontFamily: fonts.body, fontSize: 12, color: theme.textMuted },
  error: { fontFamily: fonts.body, fontSize: 12, color: theme.loss, marginBottom: spacing.sm },
  block: { marginBottom: spacing.sm },
  blockTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    color: theme.textPrimary,
    marginBottom: spacing.xs,
  },
  chipList: { gap: spacing.xs },
  chip: {
    borderWidth: 1,
    borderRadius: layout.borderRadius,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: theme.surface,
  },
  chipLabel: { fontFamily: fonts.bodySemiBold, fontSize: 11 },
  chipDetail: { fontFamily: fonts.body, fontSize: 10, color: theme.textMuted, marginTop: 2 },
  last5Card: {
    backgroundColor: theme.surface,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    padding: spacing.sm,
    marginBottom: spacing.xs,
  },
  last5Title: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.textPrimary },
  last5Meta: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted, marginTop: 2 },
  seq: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: theme.textPrimary,
    letterSpacing: 2,
    marginVertical: 4,
  },
  gradeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  gradePill: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  gradePillText: { fontFamily: fonts.bodyMedium, fontSize: 10 },
  ukulumbana: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: theme.accentBlue,
    marginBottom: spacing.sm,
  },
  lensTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    color: theme.textFaint,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.sm,
    marginBottom: 4,
  },
  lensLine: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted, marginBottom: 2 },
  reliability: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: theme.textFaint,
    marginTop: spacing.xs,
    fontStyle: 'italic',
  },
});
