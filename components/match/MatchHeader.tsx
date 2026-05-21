import { StyleSheet, Text, View } from 'react-native';

import LivePulse from '@/components/shared/LivePulse';
import type { Match, MatchEvent } from '@/mock/matchData';
import { fonts, layout, spacing, theme } from '@/styles/theme';

type MatchHeaderProps = {
  match: Match;
};

function formatEventStrip(events: MatchEvent[] | undefined): string {
  const list = events ?? [];
  const goals = list.filter((e) => e.type === 'goal').map((e) => `${e.minute}'`);
  const yellows = list.filter((e) => e.type === 'yellowCard').map((e) => `${e.minute}'`);
  const reds = list.filter((e) => e.type === 'redCard').map((e) => `${e.minute}'`);
  const parts: string[] = [];
  if (goals.length) parts.push(`⚽ ${goals.join(' ')}`);
  if (yellows.length) parts.push(`🟨 ${yellows.join(' ')}`);
  if (reds.length) parts.push(`🟥 ${reds.join(' ')}`);
  return parts.join('  ');
}

function StatusBadge({ match }: { match: Match }) {
  if (match.status === 'LIVE') {
    return (
      <View style={styles.liveBadge}>
        <LivePulse size={8} />
        <Text style={styles.liveText}>
          LIVE · {match.minute}&apos;
        </Text>
      </View>
    );
  }
  if (match.status === 'FT') {
    return <Text style={styles.statusMuted}>FULL TIME</Text>;
  }
  if (match.status === 'HT') {
    return <Text style={styles.statusHt}>HALF TIME</Text>;
  }
  return (
    <Text style={styles.statusMuted}>
      {match.kickoff} · {match.date}
    </Text>
  );
}

export default function MatchHeader({ match }: MatchHeaderProps) {
  const homeWon = match.homeTeam.score > match.awayTeam.score;
  const awayWon = match.awayTeam.score > match.homeTeam.score;
  const isDraw = match.homeTeam.score === match.awayTeam.score;

  const homeScoreStyle = homeWon
    ? styles.scoreWin
    : isDraw
      ? styles.scoreDefault
      : styles.scoreLose;
  const awayScoreStyle = awayWon
    ? styles.scoreWin
    : isDraw
      ? styles.scoreDefault
      : styles.scoreLose;

  return (
    <View style={styles.container}>
      <View style={styles.metaRow}>
        <View>
          <Text style={styles.competition}>{match.competition}</Text>
          <Text style={styles.matchday}>
            {match.season} · {match.matchday}
          </Text>
        </View>
        <Text style={styles.venue}>{match.venue}</Text>
      </View>

      <View style={styles.mainRow}>
        <View style={styles.teamSide}>
          <Text style={styles.teamName}>{match.homeTeam.name}</Text>
          <Text style={styles.crest}>{match.homeTeam.crest}</Text>
          {formatEventStrip(match.homeTeam.events) ? (
            <Text style={styles.eventStrip} numberOfLines={2}>
              {formatEventStrip(match.homeTeam.events)}
            </Text>
          ) : null}
        </View>

        <View style={styles.scoreCenter}>
          <View style={styles.scoreRow}>
            <Text style={[styles.score, homeScoreStyle]}>{match.homeTeam.score}</Text>
            <Text style={styles.scoreSep}>|</Text>
            <Text style={[styles.score, awayScoreStyle]}>{match.awayTeam.score}</Text>
          </View>
          <StatusBadge match={match} />
        </View>

        <View style={[styles.teamSide, styles.teamSideRight]}>
          <Text style={[styles.teamName, styles.textRight]}>{match.awayTeam.name}</Text>
          <Text style={[styles.crest, styles.textRight]}>{match.awayTeam.crest}</Text>
          {formatEventStrip(match.awayTeam.events) ? (
            <Text style={[styles.eventStrip, styles.textRight]} numberOfLines={2}>
              {formatEventStrip(match.awayTeam.events)}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.separator} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.surface,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  competition: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    color: theme.textMuted,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  matchday: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: theme.textMuted,
    marginTop: spacing.xs,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  venue: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: theme.textMuted,
    textAlign: 'right',
    maxWidth: '45%',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  teamSide: {
    flex: 1,
    alignItems: 'flex-start',
  },
  teamSideRight: {
    alignItems: 'flex-end',
  },
  teamName: {
    fontFamily: fonts.display,
    fontSize: 22,
    color: theme.textPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  crest: {
    fontSize: 32,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  eventStrip: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: theme.textMuted,
    lineHeight: 14,
    marginTop: spacing.xs,
  },
  scoreCenter: {
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    minWidth: 140,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  score: {
    fontFamily: fonts.display,
    fontSize: 64,
    lineHeight: 72,
  },
  scoreWin: {
    color: theme.accentGreen,
  },
  scoreLose: {
    color: theme.textMuted,
  },
  scoreDefault: {
    color: theme.textPrimary,
  },
  scoreSep: {
    fontFamily: fonts.display,
    fontSize: 32,
    color: theme.textFaint,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  liveText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: theme.live,
    letterSpacing: 0.5,
  },
  statusMuted: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: theme.textMuted,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  statusHt: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    color: theme.accentOrange,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  textRight: {
    textAlign: 'right',
  },
  separator: {
    height: layout.borderWidth,
    backgroundColor: theme.border,
    marginTop: spacing.lg,
  },
});
