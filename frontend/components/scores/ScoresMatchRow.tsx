import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import CountryFlag from '@/components/shared/CountryFlag';
import LivePulse from '@/components/shared/LivePulse';
import TeamLogo from '@/components/shared/TeamLogo';
import StreamlineChip from '@/components/scores/StreamlineChip';
import { firstGoalSide } from '@/utils/firstGoal';
import type { Fixture, FixtureKind } from '@/services/oddAlerts';
import type { StreamName } from '@/utils/powerDynamicsEngine';
import { fonts, layout, spacing, theme } from '@/styles/theme';

type ScoresMatchRowProps = {
  fixture: Fixture;
  onPress?: () => void;
  /** Streamline(s) for upcoming rows (far right). */
  stream?: StreamName | StreamName[] | null;
  showStreamline?: boolean;
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

export default function ScoresMatchRow({
  fixture,
  onPress,
  stream,
  showStreamline,
}: ScoresMatchRowProps) {
  const started = fixture.status === 'LIVE' || fixture.status === 'HT' || fixture.status === 'FT';
  const home = fixture.home.goals ?? 0;
  const away = fixture.away.goals ?? 0;
  const homeWins = started && home > away;
  const awayWins = started && away > home;
  const isDraw = started && home === away;
  const isLive = fixture.status === 'LIVE' || fixture.status === 'HT';
  const upcoming = fixture.status === 'NS' || fixture.status === 'LIVE' || fixture.status === 'HT';
  const streamCol = showStreamline ?? upcoming;
  const first = fixture.status === 'FT'
    ? firstGoalSide(fixture.home.goals, fixture.away.goals, fixture.htScore)
    : 'unknown';
  const hasFinishedScore = fixture.status === 'FT' && fixture.home.goals != null && fixture.away.goals != null;

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed, hovered }) => [
        styles.row,
        (pressed || (Platform.OS === 'web' && hovered)) && onPress ? styles.rowHover : null,
      ]}>
      <View style={styles.mainRow}>
      <View style={styles.statusCol}>
        <StatusColumn fixture={fixture} />
      </View>
      <View style={[styles.teamCell, styles.homeCell]}>
        <Text
          style={[styles.team, styles.homeTeam, started && !homeWins && !isDraw && styles.teamMuted]}
          numberOfLines={1}>
          {fixture.home.name}
        </Text>
        <TeamSide name={fixture.home.name} kind={fixture.kind} />
      </View>
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
      <View style={[styles.teamCell, styles.awayCell]}>
        <TeamSide name={fixture.away.name} kind={fixture.kind} />
        <Text
          style={[styles.team, styles.awayTeam, started && !awayWins && !isDraw && styles.teamMuted]}
          numberOfLines={1}>
          {fixture.away.name}
        </Text>
      </View>
      {streamCol ? <StreamlineChip stream={stream} /> : null}
      </View>
      {hasFinishedScore ? (
        <View style={styles.markers}>
          <Marker label={`SF ${first === 'home' ? fixture.home.name : first === 'away' ? fixture.away.name : first === 'none' ? 'NONE' : '—'}`} state={first === 'unknown' ? 'unknown' : first === 'none' ? 'neutral' : 'yes'} />
          <Marker label={`CF ${first === 'home' ? fixture.away.name : first === 'away' ? fixture.home.name : first === 'none' ? 'NONE' : '—'}`} state={first === 'unknown' ? 'unknown' : first === 'none' ? 'neutral' : 'no'} />
          <Marker label={`NG ${home + away === 0 ? 'YES' : 'NO'}`} state={home + away === 0 ? 'yes' : 'no'} />
        </View>
      ) : null}
    </Pressable>
  );
}

function Marker({ label, state }: { label: string; state: 'yes' | 'no' | 'neutral' | 'unknown' }) {
  return <Text style={[styles.marker, state === 'yes' ? styles.markerYes : state === 'no' ? styles.markerNo : state === 'neutral' ? styles.markerNeutral : styles.markerUnknown]}>{label}</Text>;
}

function TeamSide({ name, kind }: { name: string; kind: FixtureKind }) {
  if (kind === 'country') {
    return <CountryFlag name={name} size={14} />;
  }
  return <TeamLogo name={name} size={18} />;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'column',
    alignItems: 'stretch',
    paddingVertical: spacing.sm,
    paddingLeft: spacing.sm,
    paddingRight: spacing.sm,
    borderBottomWidth: layout.borderWidth,
    borderBottomColor: theme.border,
    minHeight: 44,
    ...(Platform.OS === 'web'
      ? ({ transition: 'background-color 120ms ease' } as object)
      : {}),
  },
  mainRow: { flexDirection: 'row', alignItems: 'center', minHeight: 36 },
  markers: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 4, paddingTop: 3 },
  marker: { overflow: 'hidden', borderRadius: 5, borderWidth: 1, paddingHorizontal: 5, paddingVertical: 1, fontFamily: fonts.bodySemiBold, fontSize: 8 },
  markerYes: { color: '#047857', borderColor: 'rgba(4,120,87,0.28)', backgroundColor: 'rgba(16,185,129,0.10)' },
  markerNo: { color: '#b91c1c', borderColor: 'rgba(185,28,28,0.24)', backgroundColor: 'rgba(239,68,68,0.08)' },
  markerNeutral: { color: theme.textMuted, borderColor: theme.border, backgroundColor: theme.surfaceMuted },
  markerUnknown: { color: theme.textFaint, borderColor: theme.border, backgroundColor: theme.surface },
  rowHover: {
    backgroundColor: theme.surfaceHover,
  },
  statusCol: {
    width: 48,
    flexShrink: 0,
    alignItems: 'flex-start',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  time: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: theme.textMuted,
    fontVariant: ['tabular-nums'],
    ...(Platform.OS === 'web' ? ({ fontFeatureSettings: '"tnum"' } as object) : {}),
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
  teamCell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  homeCell: {
    justifyContent: 'flex-end',
    paddingRight: 6,
  },
  awayCell: {
    justifyContent: 'flex-start',
    paddingLeft: 6,
    paddingRight: 8,
  },
  sideFlag: {
    fontSize: 16,
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
    width: 44,
    flexShrink: 0,
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
