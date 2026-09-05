import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import type { SeasonMatch } from '@/utils/bhozomaEngine';
import { buildImbanpiTable, type ImbanpiRow } from '@/utils/imbanpiEngine';
import type { StandingLike } from '@/utils/motivationEngine';
import { fonts, layout, spacing, theme } from '@/styles/theme';

type Props = {
  standings: StandingLike[];
  matches: SeasonMatch[];
  loading: boolean;
  error: string | null;
  seasonProgress?: number | null;
};

function RivalRow({ row }: { row: ImbanpiRow }) {
  const tight = row.pointsDiff <= 3;
  return (
    <View style={[styles.row, tight && styles.rowTight]}>
      <View style={styles.rowMain}>
        <Text style={styles.team} numberOfLines={1}>
          #{row.position} {row.teamName}
        </Text>
        <Text style={styles.vs}>
          {row.relation === 'above' ? '↑' : '↓'} vs #{row.opponentPosition} {row.opponentName}
        </Text>
      </View>
      <View style={styles.rowRight}>
        <Text style={[styles.diff, tight && styles.diffHot]}>{row.pointsDiff} pts</Text>
        <Text style={styles.score}>{row.lastScore ?? 'not met yet'}</Text>
      </View>
    </View>
  );
}

/**
 * Section 9 — Imbanpi neighbour table + league progress. Additive standings tab.
 */
export default function ImbanpiView({
  standings,
  matches,
  loading,
  error,
  seasonProgress,
}: Props) {
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.accentGreen} />
        <Text style={styles.muted}>Loading closest-rival meetings…</Text>
      </View>
    );
  }
  if (error) return <Text style={styles.muted}>{error}</Text>;
  if (standings.length === 0) return <Text style={styles.muted}>No standings.</Text>;

  const table = buildImbanpiTable(standings, matches, seasonProgress);
  const { progress } = table;

  return (
    <View>
      <Text style={styles.blurb}>
        Neighbours on the table — the team one place above and below. Smaller point gaps
        mean tighter fights. Recent score shown when they have already met.
      </Text>

      <View style={[styles.progressCard, progress.lateStretch && styles.progressLate]}>
        <Text style={styles.progressTitle}>How far through the season</Text>
        <Text style={styles.progressMeta}>
          {progress.seasonProgress != null ? `${progress.seasonProgress}% played` : 'Progress n/a'}
          {' · '}
          most games played: {progress.maxPlayed}
          {progress.avgRemaining != null ? ` · about ${progress.avgRemaining} left` : ''}
          {progress.lateStretch ? ' · late stretch' : ''}
        </Text>
        <Text style={styles.progressNote}>{progress.note}</Text>
      </View>

      <Text style={styles.sectionTitle}>Closest rivals</Text>
      {table.closest.length === 0 ? (
        <Text style={styles.muted}>No neighbour pairs yet.</Text>
      ) : (
        table.closest.slice(0, 40).map((r) => (
          <RivalRow
            key={`${r.teamId}-${r.opponentId}-${r.relation}`}
            row={r}
          />
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  blurb: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textMuted,
    marginBottom: spacing.sm,
    lineHeight: 17,
  },
  center: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
  muted: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: theme.textMuted,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  progressCard: {
    backgroundColor: theme.surface,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  progressLate: { borderColor: theme.accentOrange },
  progressTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    color: theme.textPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  progressMeta: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: theme.textPrimary,
    marginTop: 4,
  },
  progressNote: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: theme.textMuted,
    marginTop: 4,
    lineHeight: 15,
  },
  sectionTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    color: theme.textPrimary,
    marginBottom: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: theme.surface,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    padding: spacing.sm,
    marginBottom: spacing.xs,
  },
  rowTight: { borderColor: theme.accentOrange, backgroundColor: 'rgba(234, 88, 12, 0.06)' },
  rowMain: { flex: 1, minWidth: 0 },
  team: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: theme.textPrimary },
  vs: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted, marginTop: 2 },
  rowRight: { alignItems: 'flex-end' },
  diff: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: theme.textMuted },
  diffHot: { color: theme.accentOrange },
  score: { fontFamily: fonts.body, fontSize: 10, color: theme.textFaint, marginTop: 2 },
});
