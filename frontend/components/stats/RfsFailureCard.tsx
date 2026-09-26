import { StyleSheet, Text, View } from 'react-native';

import { complianceColor } from '@/utils/compliance';
import type { RfsGame, RfsOrdinaryRow, RfsSeriesRow } from '@/utils/fixtureRfs';
import { fonts, layout, spacing, theme } from '@/styles/theme';

type Props = {
  row: RfsOrdinaryRow | RfsSeriesRow;
  teamName: string;
};

const isOrdinary = (row: RfsOrdinaryRow | RfsSeriesRow): row is RfsOrdinaryRow => 'rate' in row;

function venue(game: RfsGame): string {
  return `${game.isHome ? 'vs' : 'at'} ${game.opponentName}`;
}

function stateColor(game: RfsGame): string {
  if (game.state === 'failed') return theme.loss;
  if (game.state === 'miss') return theme.textFaint;
  return theme.accentGreen;
}

function GameChip({ game }: { game: RfsGame }) {
  const color = stateColor(game);
  return (
    <View
      style={[
        styles.chip,
        { borderColor: color },
        game.state === 'hit' && styles.chipHit,
        game.state === 'failed' && styles.chipFailed,
      ]}>
      <Text style={[styles.chipScore, { color }]}>{game.score}</Text>
      <Text style={[styles.chipMeta, { color }]}>
        {game.isHome ? 'H' : 'A'} · {game.opponentName.slice(0, 3).toUpperCase()}
      </Text>
    </View>
  );
}

/** What the team normally does, e.g. "Usually scores · 90% of 10". */
function usualText(row: RfsOrdinaryRow | RfsSeriesRow): string {
  if (isOrdinary(row)) return `Usually ${row.usual} · ${row.rate}% of ${row.sample}`;
  return row.without ? `${row.run} games without ${row.label}` : `${row.run}-game ${row.label} run`;
}

/** What the last game did instead. */
function failedText(row: RfsOrdinaryRow | RfsSeriesRow): string {
  const last = row.last;
  if (isOrdinary(row)) return `${row.failed} in ${last.score} ${venue(last)}`;
  return `broken by ${last.score} ${venue(last)}`;
}

/**
 * One RFS: the stat, the team, how strong the usual was, and the game that went
 * against it — with the run shown chip by chip, newest (the failure) on the right.
 */
export default function RfsFailureCard({ row, teamName }: Props) {
  const usualColor = complianceColor(row.level);
  const also = isOrdinary(row) && row.alsoLabels.length > 0 ? row.alsoLabels.join(' · ') : null;

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.label} numberOfLines={1}>
          {row.label}
        </Text>
        <Text style={styles.team} numberOfLines={1}>
          {teamName}
        </Text>
      </View>
      {also ? <Text style={styles.also}>also {also}</Text> : null}

      <Text style={styles.sentence}>
        <Text style={[styles.usual, { color: usualColor }]}>{usualText(row)}</Text>
        <Text style={styles.dash}> — </Text>
        <Text style={styles.failed}>{failedText(row)}</Text>
      </Text>

      <View style={styles.strip}>
        {row.games.map((game) => (
          <GameChip key={game.fixtureId} game={game} />
        ))}
      </View>

      {!isOrdinary(row) && row.runFromStart ? (
        <Text style={styles.note}>Ran unbroken from the first game on record</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.surface,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderLeftWidth: 3,
    borderLeftColor: theme.loss,
    borderRadius: layout.borderRadius,
    padding: spacing.sm,
    marginBottom: spacing.xs,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  label: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: theme.textPrimary, flexShrink: 1 },
  team: { fontFamily: fonts.bodySemiBold, fontSize: 11, color: theme.textMuted, flexShrink: 1 },
  also: { fontFamily: fonts.body, fontSize: 9, color: theme.textFaint },
  sentence: { marginTop: 2, marginBottom: spacing.xs, lineHeight: 15 },
  usual: { fontFamily: fonts.bodySemiBold, fontSize: 11 },
  dash: { fontFamily: fonts.body, fontSize: 11, color: theme.textFaint },
  failed: { fontFamily: fonts.body, fontSize: 11, color: theme.loss },
  strip: { flexDirection: 'row', flexWrap: 'wrap', gap: 3 },
  chip: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
    minWidth: 38,
    alignItems: 'center',
    backgroundColor: theme.surface,
  },
  chipHit: { backgroundColor: 'rgba(5, 150, 105, 0.08)' },
  chipFailed: { backgroundColor: 'rgba(220, 38, 38, 0.07)' },
  chipScore: { fontFamily: fonts.bodySemiBold, fontSize: 11 },
  chipMeta: { fontFamily: fonts.body, fontSize: 8, opacity: 0.85 },
  note: {
    fontFamily: fonts.body,
    fontSize: 9,
    color: theme.textFaint,
    marginTop: 2,
  },
});
