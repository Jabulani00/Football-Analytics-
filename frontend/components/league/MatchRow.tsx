import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import LivePulse from '@/components/shared/LivePulse';
import { firstGoalSide } from '@/utils/firstGoal';
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
  const first = fixture.status === 'FT' ? firstGoalSide(home, away) : 'unknown';
  const hasFinishedScore = fixture.status === 'FT' && fixture.homeTeam.score != null && fixture.awayTeam.score != null;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed, hovered }) => [
        styles.row,
        (pressed || (Platform.OS === 'web' && hovered)) && styles.rowHover,
      ]}>
      <View style={styles.mainRow}>
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
      </View>
      {hasFinishedScore ? (
        <View style={styles.markers}>
          <Text style={[styles.marker, first === 'unknown' ? styles.markerUnknown : styles.markerYes]}>SF {first === 'home' ? fixture.homeTeam.shortName : first === 'away' ? fixture.awayTeam.shortName : first === 'none' ? 'NONE' : '—'}</Text>
          <Text style={[styles.marker, first === 'unknown' ? styles.markerUnknown : styles.markerNo]}>CF {first === 'home' ? fixture.awayTeam.shortName : first === 'away' ? fixture.homeTeam.shortName : first === 'none' ? 'NONE' : '—'}</Text>
          <Text style={[styles.marker, home + away === 0 ? styles.markerYes : styles.markerNo]}>NG {home + away === 0 ? 'YES' : 'NO'}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'column',
    alignItems: 'stretch',
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
  mainRow: { flexDirection: 'row', alignItems: 'center', minHeight: 36 },
  markers: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 4, paddingTop: 3 },
  marker: { overflow: 'hidden', borderRadius: 5, borderWidth: 1, paddingHorizontal: 5, paddingVertical: 1, fontFamily: fonts.bodySemiBold, fontSize: 8 },
  markerYes: { color: '#047857', borderColor: 'rgba(4,120,87,0.28)', backgroundColor: 'rgba(16,185,129,0.10)' },
  markerNo: { color: '#b91c1c', borderColor: 'rgba(185,28,28,0.24)', backgroundColor: 'rgba(239,68,68,0.08)' },
  markerUnknown: { color: theme.textFaint, borderColor: theme.border, backgroundColor: theme.surface },
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
