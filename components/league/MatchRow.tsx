import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import ComplianceBadge from '@/components/analytics/ComplianceBadge';
import LivePulse from '@/components/shared/LivePulse';
import type { Fixture } from '@/mock/fixturesData';
import { getFixtureIntel } from '@/mock/leagueAnalyticsData';
import { cardElevation } from '@/styles/elevation';
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
        <LivePulse size={6} />
        <Text style={styles.liveMin}>{fixture.minute}&apos;</Text>
      </View>
    );
  }
  if (fixture.status === 'HT') {
    return <Text style={styles.ht}>HT</Text>;
  }
  return <Text style={styles.ft}>FT</Text>;
}

function ScoreBlock({ fixture }: { fixture: Fixture }) {
  if (fixture.status === 'NS') {
    return <Text style={styles.vs}>vs</Text>;
  }
  const home = fixture.homeTeam.score ?? 0;
  const away = fixture.awayTeam.score ?? 0;
  const homeWins = home > away;
  const awayWins = away > home;

  return (
    <View style={styles.scoreBlock}>
      <Text style={[styles.scoreNum, homeWins && styles.scoreWin]}>{home}</Text>
      <Text style={styles.scoreSep}> – </Text>
      <Text style={[styles.scoreNum, awayWins && styles.scoreWin]}>{away}</Text>
    </View>
  );
}

function OddsChips({ odds }: { odds: Fixture['odds'] }) {
  const items = [
    { label: '1', value: odds.home },
    { label: 'X', value: odds.draw },
    { label: '2', value: odds.away },
  ];
  return (
    <View style={styles.odds}>
      {items.map((o) => (
        <View key={o.label} style={styles.oddChip}>
          <Text style={styles.oddLabel}>{o.label}</Text>
          <Text style={styles.oddValue}>{o.value}</Text>
        </View>
      ))}
    </View>
  );
}

export default function MatchRow({ fixture, onPress }: MatchRowProps) {
  const intel = getFixtureIntel(fixture.id);
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
      <View style={styles.teamsCol}>
        <Text
          style={[
            styles.teamLine,
            started && !homeWins && !isDraw && styles.teamMuted,
          ]}
          numberOfLines={1}>
          {fixture.homeTeam.name}
        </Text>
        <Text
          style={[
            styles.teamLine,
            started && !awayWins && !isDraw && styles.teamMuted,
          ]}
          numberOfLines={1}>
          {fixture.awayTeam.name}
        </Text>
      </View>
      <View style={styles.scoreCol}>
        <ScoreBlock fixture={fixture} />
      </View>
      <View style={styles.intelCol}>
        {fixture.status === 'NS' ? (
          <>
            <ComplianceBadge level={intel.level} value={intel.compliance} compact />
            <Text style={styles.intelPick} numberOfLines={1}>
              {intel.pick}
            </Text>
          </>
        ) : (
          <OddsChips odds={fixture.odds} />
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
    gap: spacing.md,
    ...cardElevation(1),
    ...(Platform.OS === 'web'
      ? ({ transition: 'background-color 150ms ease, border-left-color 150ms ease' } as object)
      : {}),
  },
  rowHover: {
    backgroundColor: theme.surfaceHover,
    borderLeftColor: theme.accentGreen,
  },
  intelCol: {
    width: 96,
    alignItems: 'flex-end',
    gap: 4,
  },
  intelPick: {
    fontFamily: fonts.body,
    fontSize: 9,
    color: theme.accentBlue,
    maxWidth: 96,
    textAlign: 'right',
  },
  statusCol: {
    width: 60,
    alignItems: 'center',
  },
  time: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: theme.textMuted,
  },
  liveCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  liveMin: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: theme.live,
  },
  ft: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: theme.textMuted,
    letterSpacing: 0.5,
  },
  ht: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: theme.accentOrange,
  },
  teamsCol: {
    flex: 1,
    gap: 4,
  },
  teamLine: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: theme.textPrimary,
  },
  teamMuted: {
    color: theme.textMuted,
  },
  scoreCol: {
    width: 64,
    alignItems: 'center',
  },
  scoreBlock: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  scoreNum: {
    fontFamily: fonts.display,
    fontSize: 18,
    color: theme.textPrimary,
  },
  scoreWin: {
    color: theme.accentGreen,
  },
  scoreSep: {
    fontFamily: fonts.display,
    fontSize: 18,
    color: theme.textMuted,
  },
  vs: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: theme.textMuted,
  },
  odds: {
    flexDirection: 'row',
    gap: 4,
    width: 88,
    justifyContent: 'flex-end',
  },
  oddChip: {
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    paddingHorizontal: 4,
    paddingVertical: 3,
    alignItems: 'center',
    minWidth: 26,
  },
  oddLabel: {
    fontFamily: fonts.body,
    fontSize: 9,
    color: theme.textFaint,
  },
  oddValue: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    color: theme.textMuted,
  },
});
