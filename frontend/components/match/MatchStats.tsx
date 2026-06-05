import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import SectionLabel from '@/components/shared/SectionLabel';
import type { Match } from '@/mock/matchData';
import { fonts, layout, spacing, theme } from '@/styles/theme';

type StatRowConfig = {
  label: string;
  home: number;
  away: number;
  format?: (n: number) => string;
  highlight?: boolean;
};

type MatchStatsProps = {
  stats: Match['stats'];
};

function StatBar({ home, away }: { home: number; away: number }) {
  const homeAnim = useRef(new Animated.Value(0)).current;
  const awayAnim = useRef(new Animated.Value(0)).current;
  const total = home + away || 1;
  const homePct = (home / total) * 100;
  const awayPct = (away / total) * 100;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(homeAnim, { toValue: homePct, duration: 300, useNativeDriver: false }),
      Animated.timing(awayAnim, { toValue: awayPct, duration: 300, useNativeDriver: false }),
    ]).start();
  }, [awayAnim, awayPct, homeAnim, homePct]);

  const homeWidth = homeAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] });
  const awayWidth = awayAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] });

  return (
    <View style={styles.barTrack}>
      <View style={styles.barHalf}>
        <Animated.View style={[styles.barHome, { width: homeWidth }]} />
      </View>
      <View style={styles.barHalf}>
        <Animated.View style={[styles.barAway, { width: awayWidth }]} />
      </View>
    </View>
  );
}

function StatRow({ row }: { row: StatRowConfig }) {
  const fmt = row.format ?? ((n: number) => String(n));
  const isPct = row.label === 'Possession';

  return (
    <View style={[styles.statRow, row.highlight && styles.statRowHighlight]}>
      <View style={styles.statValues}>
        <Text style={[styles.statValue, styles.statValueLeft]}>
          {fmt(row.home)}
          {isPct ? '%' : ''}
        </Text>
        <Text style={[styles.statLabel, row.highlight && styles.statLabelHighlight]}>
          {row.label.toUpperCase()}
        </Text>
        <Text style={[styles.statValue, styles.statValueRight]}>
          {fmt(row.away)}
          {isPct ? '%' : ''}
        </Text>
      </View>
      <StatBar home={row.home} away={row.away} />
    </View>
  );
}

export default function MatchStats({ stats }: MatchStatsProps) {
  const rows: StatRowConfig[] = [
    { label: 'Possession', home: stats.possession[0], away: stats.possession[1] },
    { label: 'Shots', home: stats.shots[0], away: stats.shots[1] },
    { label: 'Shots on Target', home: stats.shotsOnTarget[0], away: stats.shotsOnTarget[1] },
    { label: 'Corners', home: stats.corners[0], away: stats.corners[1] },
    { label: 'Fouls', home: stats.fouls[0], away: stats.fouls[1] },
    { label: 'Offsides', home: stats.offsides[0], away: stats.offsides[1] },
    {
      label: 'xG',
      home: stats.xG[0],
      away: stats.xG[1],
      format: (n) => n.toFixed(2),
      highlight: true,
    },
  ];

  return (
    <View style={styles.container}>
      <SectionLabel style={styles.heading}>MATCH STATS</SectionLabel>
      {rows.map((row) => (
        <StatRow key={row.label} row={row} />
      ))}
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
    marginBottom: spacing.md,
  },
  heading: {
    marginBottom: spacing.lg,
  },
  statRow: {
    marginBottom: spacing.lg,
  },
  statRowHighlight: {
    paddingTop: spacing.sm,
    borderTopWidth: layout.borderWidth,
    borderTopColor: theme.border,
  },
  statValues: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  statValue: {
    fontFamily: fonts.display,
    fontSize: 16,
    color: theme.textPrimary,
    minWidth: 48,
  },
  statValueLeft: {
    textAlign: 'right',
    flex: 1,
  },
  statValueRight: {
    textAlign: 'left',
    flex: 1,
  },
  statLabel: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: theme.textMuted,
    textAlign: 'center',
    flex: 1.2,
    letterSpacing: 0.5,
  },
  statLabelHighlight: {
    fontFamily: fonts.bodyMedium,
    fontStyle: 'italic',
    color: theme.accentGreen,
  },
  barTrack: {
    flexDirection: 'row',
    height: 4,
    gap: 2,
  },
  barHalf: {
    flex: 1,
    backgroundColor: theme.border,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  barHome: {
    height: '100%',
    backgroundColor: theme.accentGreen,
    alignSelf: 'flex-end',
  },
  barAway: {
    height: '100%',
    backgroundColor: theme.awayBar,
    alignSelf: 'flex-start',
  },
});
