import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import LivePulse from '@/components/shared/LivePulse';
import type { Fixture } from '@/services/oddAlerts';
import { fonts, layout, spacing, theme } from '@/styles/theme';

type ScoresMatchRowProps = {
  fixture: Fixture;
  onPress?: () => void;
};

function StatusColumn({ fixture }: { fixture: Fixture }) {
  if (fixture.status === 'NS') {
    return <Text style={styles.time}>{fixture.kickoff}</Text>;
  }
  if (fixture.status === 'HT') {
    return <Text style={styles.ht}>HT</Text>;
  }
  if (fixture.status === 'LIVE') {
    const added = fixture.addedTime ? `+${fixture.addedTime}` : '';
    return (
      <View style={styles.liveCol}>
        <LivePulse size={5} />
        <Text style={styles.liveMin}>
          {fixture.minute ?? 0}
          {added}&apos;
        </Text>
      </View>
    );
  }
  if (fixture.status === 'FT') {
    return <Text style={styles.ft}>FT</Text>;
  }
  return <Text style={styles.ft}>{fixture.rawStatus}</Text>;
}

export default function ScoresMatchRow({ fixture, onPress }: ScoresMatchRowProps) {
  const started = fixture.status === 'LIVE' || fixture.status === 'HT' || fixture.status === 'FT';
  const home = fixture.home.goals ?? 0;
  const away = fixture.away.goals ?? 0;
  const homeWins = started && home > away;
  const awayWins = started && away > home;
  const isDraw = started && home === away;
  const isLive = fixture.status === 'LIVE' || fixture.status === 'HT';

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed, hovered }) => [
        styles.row,
        (pressed || (Platform.OS === 'web' && hovered)) && onPress ? styles.rowHover : null,
      ]}>
      <View style={styles.statusCol}>
        <StatusColumn fixture={fixture} />
      </View>
      <Text
        style={[styles.team, styles.homeTeam, started && !homeWins && !isDraw && styles.teamMuted]}
        numberOfLines={1}>
        {fixture.home.name}
      </Text>
      <View style={styles.scoreCol}>
        {started ? (
          <Text style={[styles.score, isLive && styles.scoreLive]}>
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
        {fixture.away.name}
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
    width: 50,
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
  scoreLive: {
    color: theme.live,
  },
  scoreWin: {
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
