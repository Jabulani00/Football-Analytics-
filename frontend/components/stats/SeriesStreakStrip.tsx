import { StyleSheet, Text, View } from 'react-native';

import { levelForRun, type SeriesGame, type TeamSeries } from '@/utils/fixtureSeries';
import { complianceColor } from '@/utils/compliance';
import { fonts, spacing, theme } from '@/styles/theme';

type Props = {
  teamName: string;
  series: TeamSeries;
};

function stateColor(game: SeriesGame, active: boolean): string {
  if (game.state === 'broke') return theme.loss;
  if (game.state === 'before') return theme.textFaint;
  return active ? theme.accentGreen : theme.textMuted;
}

function GameChip({ game, active }: { game: SeriesGame; active: boolean }) {
  const color = stateColor(game, active);
  const isRun = game.state === 'run';
  return (
    <View
      style={[
        styles.chip,
        { borderColor: color },
        isRun && active && styles.chipRun,
        game.state === 'broke' && styles.chipBroke,
      ]}>
      <Text style={[styles.chipScore, { color }]}>{game.score}</Text>
      <Text style={[styles.chipMeta, { color }]}>
        {game.isHome ? 'H' : 'A'} · {game.opponentName.slice(0, 3).toUpperCase()}
      </Text>
    </View>
  );
}

/**
 * One team's run for a single series stat: chronological chips (oldest left,
 * newest right) so the red game that broke the previous run sits immediately
 * left of the green run it ended.
 */
export default function SeriesStreakStrip({ teamName, series }: Props) {
  const countColor = series.active ? complianceColor(levelForRun(series.run)) : theme.textMuted;
  const broke = series.games.find((g) => g.state === 'broke');

  return (
    <View style={styles.wrap}>
      <View style={styles.headRow}>
        <Text style={styles.team} numberOfLines={1}>
          {teamName}
        </Text>
        <Text style={[styles.count, { color: countColor }]}>
          {series.active
            ? `${series.run} ${series.run === 1 ? 'game' : 'games'}`
            : `no series (${series.run})`}
        </Text>
      </View>

      {series.games.length === 0 ? (
        <Text style={styles.note}>No finished games on record.</Text>
      ) : (
        <>
          <View style={styles.strip}>
            {series.games.map((game) => (
              <GameChip key={game.fixtureId} game={game} active={series.active} />
            ))}
          </View>
          <Text style={styles.note}>
            {series.runFromStart
              ? 'Unbroken across every game on record'
              : broke
                ? `Broke against ${broke.opponentName} (${broke.score})`
                : ''}
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.sm },
  headRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: 3,
  },
  team: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: theme.textPrimary,
    flexShrink: 1,
  },
  count: { fontFamily: fonts.bodySemiBold, fontSize: 11 },
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
  chipRun: { backgroundColor: 'rgba(5, 150, 105, 0.08)' },
  chipBroke: { backgroundColor: 'rgba(220, 38, 38, 0.07)' },
  chipScore: { fontFamily: fonts.bodySemiBold, fontSize: 11 },
  chipMeta: { fontFamily: fonts.body, fontSize: 8, opacity: 0.85 },
  note: {
    fontFamily: fonts.body,
    fontSize: 9,
    color: theme.textFaint,
    marginTop: 2,
  },
});
