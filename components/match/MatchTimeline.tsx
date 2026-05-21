import { useEffect, useRef } from 'react';
import { Animated, Platform, StyleSheet, Text, View } from 'react-native';

import SectionLabel from '@/components/shared/SectionLabel';
import type { Match, MatchEvent } from '@/mock/matchData';
import { fonts, layout, spacing, theme } from '@/styles/theme';

type TimelineEntry = MatchEvent & {
  side: 'home' | 'away';
};

function eventIcon(type: MatchEvent['type']): string {
  switch (type) {
    case 'goal':
      return '⚽';
    case 'yellowCard':
      return '🟨';
    case 'redCard':
      return '🟥';
    case 'substitution':
      return '↕';
    default:
      return '·';
  }
}

function pillColor(type: MatchEvent['type']): string {
  switch (type) {
    case 'goal':
      return theme.accentOrange;
    case 'yellowCard':
      return theme.yellow;
    case 'redCard':
      return theme.loss;
    default:
      return theme.surface;
  }
}

function buildTimeline(match: Match): TimelineEntry[] {
  const homeEvents = match.homeTeam.events ?? [];
  const awayEvents = match.awayTeam.events ?? [];
  const home = homeEvents.map((e) => ({ ...e, side: 'home' as const }));
  const away = awayEvents.map((e) => ({ ...e, side: 'away' as const }));
  return [...home, ...away].sort((a, b) => a.minute - b.minute);
}

function TimelineRow({ entry, index }: { entry: TimelineEntry; index: number }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const isHome = entry.side === 'home';

  useEffect(() => {
    const t = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: Platform.OS !== 'web',
      }).start();
    }, index * 50);
    return () => clearTimeout(t);
  }, [index, opacity]);

  return (
    <Animated.View
      style={[
        styles.row,
        isHome ? styles.rowHome : styles.rowAway,
        { opacity },
      ]}>
      {isHome ? (
        <>
          <View style={[styles.minutePill, { backgroundColor: pillColor(entry.type) }]}>
            <Text style={styles.minuteText}>{entry.minute}&apos;</Text>
          </View>
          <Text style={styles.eventIcon}>{eventIcon(entry.type)}</Text>
          <View style={styles.eventBody}>
            <Text style={styles.playerName}>{entry.player}</Text>
            {entry.assist ? <Text style={styles.assist}>{entry.assist}</Text> : null}
          </View>
        </>
      ) : (
        <>
          <View style={[styles.eventBody, styles.eventBodyRight]}>
            <Text style={[styles.playerName, styles.textRight]}>{entry.player}</Text>
            {entry.assist ? (
              <Text style={[styles.assist, styles.textRight]}>{entry.assist}</Text>
            ) : null}
          </View>
          <Text style={styles.eventIcon}>{eventIcon(entry.type)}</Text>
          <View style={[styles.minutePill, { backgroundColor: pillColor(entry.type) }]}>
            <Text style={styles.minuteText}>{entry.minute}&apos;</Text>
          </View>
        </>
      )}
    </Animated.View>
  );
}

type MatchTimelineProps = {
  match: Match;
};

export default function MatchTimeline({ match }: MatchTimelineProps) {
  const entries = buildTimeline(match);

  if (entries.length === 0) {
    return (
      <View style={styles.container}>
        <SectionLabel style={styles.heading}>MATCH EVENTS</SectionLabel>
        <Text style={styles.empty}>No events recorded.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SectionLabel style={styles.heading}>MATCH EVENTS</SectionLabel>
      <View style={styles.timeline}>
        <View style={styles.centerLine} />
        {entries.map((entry, index) => (
          <TimelineRow
            key={`${entry.side}-${entry.minute}-${entry.player}`}
            entry={entry}
            index={index}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    backgroundColor: theme.surface,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
  },
  heading: {
    marginBottom: spacing.lg,
  },
  empty: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: theme.textMuted,
  },
  timeline: {
    position: 'relative',
  },
  centerLine: {
    position: 'absolute',
    left: '50%',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: theme.border,
    marginLeft: -0.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
    width: '50%',
    gap: spacing.sm,
  },
  rowHome: {
    alignSelf: 'flex-start',
    paddingRight: spacing.md,
  },
  rowAway: {
    alignSelf: 'flex-end',
    paddingLeft: spacing.md,
    justifyContent: 'flex-end',
  },
  minutePill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: layout.borderRadius,
    minWidth: 32,
    alignItems: 'center',
  },
  minuteText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    color: theme.bg,
  },
  eventIcon: {
    fontSize: 13,
    marginTop: 2,
  },
  eventBody: {
    flex: 1,
  },
  eventBodyRight: {
    alignItems: 'flex-end',
  },
  playerName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: theme.textPrimary,
  },
  assist: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: theme.textMuted,
    marginTop: 2,
  },
  textRight: {
    textAlign: 'right',
  },
});
