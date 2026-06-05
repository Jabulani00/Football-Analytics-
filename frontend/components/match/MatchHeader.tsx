import { StyleSheet, Text, View } from 'react-native';

import LivePulse from '@/components/shared/LivePulse';
import type { Match, MatchEvent } from '@/mock/matchData';
import { fonts, layout, spacing, theme } from '@/styles/theme';

type MatchHeaderProps = {
  match: Match;
};

function StatusBadge({ match }: { match: Match }) {
  if (match.status === 'LIVE') {
    return (
      <View style={styles.liveBadge}>
        <LivePulse size={6} />
        <Text style={styles.liveText}>LIVE {match.minute}&apos;</Text>
      </View>
    );
  }
  if (match.status === 'FT') return <Text style={styles.statusMuted}>Finished</Text>;
  if (match.status === 'HT') return <Text style={styles.statusHt}>Half time</Text>;
  return <Text style={styles.statusMuted}>{match.kickoff}</Text>;
}

export default function MatchHeader({ match }: MatchHeaderProps) {
  const homeWon = match.homeTeam.score > match.awayTeam.score;
  const awayWon = match.awayTeam.score > match.homeTeam.score;
  const isDraw = match.homeTeam.score === match.awayTeam.score;
  const started = match.status !== 'NS';

  const homeScoreStyle = homeWon ? styles.scoreWin : isDraw ? styles.scoreDefault : styles.scoreLose;
  const awayScoreStyle = awayWon ? styles.scoreWin : isDraw ? styles.scoreDefault : styles.scoreLose;

  return (
    <View style={styles.container}>
      <Text style={styles.breadcrumb}>
        {match.competition} · {match.season}
      </Text>
      <View style={styles.mainRow}>
        <View style={styles.teamSide}>
          <Text style={styles.teamName} numberOfLines={2}>
            {match.homeTeam.name}
          </Text>
        </View>
        <View style={styles.scoreCenter}>
          {started ? (
            <View style={styles.scoreRow}>
              <Text style={[styles.score, homeScoreStyle]}>{match.homeTeam.score}</Text>
              <Text style={styles.scoreSep}>:</Text>
              <Text style={[styles.score, awayScoreStyle]}>{match.awayTeam.score}</Text>
            </View>
          ) : (
            <Text style={styles.vs}>vs</Text>
          )}
          <StatusBadge match={match} />
        </View>
        <View style={[styles.teamSide, styles.teamSideRight]}>
          <Text style={[styles.teamName, styles.textRight]} numberOfLines={2}>
            {match.awayTeam.name}
          </Text>
        </View>
      </View>
    </View>
  );
}

export function MatchGoalScorers({ events }: { events: { home: MatchEvent[]; away: MatchEvent[] } }) {
  const homeGoals = events.home.filter((e) => e.type === 'goal');
  const awayGoals = events.away.filter((e) => e.type === 'goal');
  if (homeGoals.length === 0 && awayGoals.length === 0) return null;

  return (
    <View style={styles.scorers}>
      <View style={styles.scorerCol}>
        {homeGoals.map((g) => (
          <Text key={`h-${g.minute}-${g.player}`} style={styles.scorerLine}>
            {g.player} {g.minute}&apos;
          </Text>
        ))}
      </View>
      <View style={styles.scorerCol}>
        {awayGoals.map((g) => (
          <Text key={`a-${g.minute}-${g.player}`} style={[styles.scorerLine, styles.textRight]}>
            {g.player} {g.minute}&apos;
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.surface,
    paddingVertical: spacing.md,
    borderBottomWidth: layout.borderWidth,
    borderBottomColor: theme.border,
    width: '100%',
  },
  breadcrumb: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: theme.textMuted,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  teamSide: {
    flex: 1,
  },
  teamSideRight: {
    alignItems: 'flex-end',
  },
  teamName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
    color: theme.textPrimary,
    lineHeight: 20,
  },
  scoreCenter: {
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    minWidth: 100,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  score: {
    fontFamily: fonts.display,
    fontSize: 36,
    lineHeight: 40,
  },
  scoreWin: {
    color: theme.textPrimary,
  },
  scoreLose: {
    color: theme.textMuted,
  },
  scoreDefault: {
    color: theme.textPrimary,
  },
  scoreSep: {
    fontFamily: fonts.display,
    fontSize: 28,
    color: theme.textFaint,
  },
  vs: {
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    color: theme.textMuted,
    marginBottom: spacing.xs,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  liveText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    color: theme.live,
  },
  statusMuted: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: theme.textMuted,
    marginTop: spacing.xs,
  },
  statusHt: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    color: theme.accentOrange,
    marginTop: spacing.xs,
  },
  textRight: {
    textAlign: 'right',
  },
  scorers: {
    flexDirection: 'row',
    marginTop: spacing.sm,
    gap: spacing.md,
  },
  scorerCol: {
    flex: 1,
  },
  scorerLine: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: theme.textMuted,
    marginTop: 2,
  },
});
