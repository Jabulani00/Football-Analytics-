import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import LivePulse from '@/components/shared/LivePulse';
import type { Fixture } from '@/mock/fixturesData';
import { fonts, layout, spacing, theme } from '@/styles/theme';

type MatchRowProps = {
  fixture: Fixture;
  onPress: () => void;
};

function StatusColumn({ fixture }: { fixture: Fixture }) {
  if (fixture.status === 'NS') {
    return <Text style={styles.time}>{fixture.kickoff}</Text>;
  }
  if (fixture.status === 'LIVE') {
    return (
      <View style={styles.liveCol}>
        <LivePulse size={5} />
        <Text style={styles.liveMin}>{fixture.minute}&apos;</Text>
      </View>
    );
  }
  if (fixture.status === 'HT') {
    return <Text style={styles.ht}>HT</Text>;
  }
  return <Text style={styles.ft}>FT</Text>;
}

export default function MatchRow({ fixture, onPress }: MatchRowProps) {
  const started = fixture.status !== 'NS';
  const home = fixture.homeTeam.score ?? 0;
  const away = fixture.awayTeam.score ?? 0;
  const homeWins = started && home > away;
  const awayWins = started && away > home;
  const isDraw = started && home === away;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed, hovered }) => [
        styles.row,
        (pressed || (Platform.OS === 'web' && hovered)) && styles.rowHover,
      ]}>
      <View style={styles.statusCol}>
        <StatusColumn fixture={fixture} />
      </View>
      <Text
        style={[styles.team, styles.homeTeam, started && !homeWins && !isDraw && styles.teamMuted]}
        numberOfLines={1}>
        {fixture.homeTeam.name}
      </Text>
      <View style={styles.scoreCol}>
        {started ? (
          <Text style={styles.score}>
            <Text style={homeWins ? styles.scoreWin : undefined}>{home}</Text>
            <Text style={styles.scoreSep}> - </Text>
            <Text style={awayWins ? styles.scoreWin : undefined}>{away}</Text>
          </Text>
        ) : (
          <Text style={styles.vs}>-</Text>
        )}
      </View>
      <Text
        style={[styles.team, styles.awayTeam, started && !awayWins && !isDraw && styles.teamMuted]}
        numberOfLines={1}>
        {fixture.awayTeam.name}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: layout.borderWidth,
    borderBottomColor: theme.border,
    gap: spacing.sm,
    minHeight: 40,
    ...(Platform.OS === 'web'
      ? ({ transition: 'background-color 120ms ease' } as object)
      : {}),
  },
  rowHover: {
    backgroundColor: theme.surfaceHover,
  },
  statusCol: {
    width: 44,
    alignItems: 'center',
  },
  time: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textMuted,
  },
  liveCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  liveMin: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    color: theme.live,
  },
  ft: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    color: theme.textMuted,
  },
  ht: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    color: theme.accentOrange,
  },
  team: {
    flex: 1,
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: theme.textPrimary,
  },
  homeTeam: {
    textAlign: 'right',
  },
  awayTeam: {
    textAlign: 'left',
  },
  teamMuted: {
    color: theme.textMuted,
    fontFamily: fonts.body,
  },
  scoreCol: {
    width: 52,
    alignItems: 'center',
  },
  score: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: theme.textPrimary,
  },
  scoreWin: {
    color: theme.textPrimary,
    fontFamily: fonts.display,
  },
  scoreSep: {
    color: theme.textMuted,
    fontFamily: fonts.body,
  },
  vs: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textFaint,
  },
});
