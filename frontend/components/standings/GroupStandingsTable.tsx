import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import CountryFlag from '@/components/shared/CountryFlag';
import type { GroupStandingRow, GroupTable } from '@/utils/groupStandings';
import { fonts, layout, spacing, theme } from '@/styles/theme';

const ZONE_COLOR = {
  qualify: '#16A34A',
  possible: '#D97706',
  out: 'transparent',
} as const;

type GroupStandingsTableProps = {
  group: GroupTable;
  highlightTeamIds?: number[];
  highlightNames?: string[];
  onTeamPress?: (row: GroupStandingRow) => void;
  compact?: boolean;
};

export default function GroupStandingsTable({
  group,
  highlightTeamIds = [],
  highlightNames = [],
  onTeamPress,
  compact,
}: GroupStandingsTableProps) {
  const { width } = useWindowDimensions();
  const wide = !compact && width >= 520;

  return (
    <View style={styles.card}>
      <Text style={styles.groupTitle}>Group {group.letter}</Text>
      <View style={[styles.row, styles.head]}>
        <Text style={[styles.cPos, styles.th]}>#</Text>
        <Text style={[styles.cTeam, styles.th]}>Team</Text>
        <Text style={[styles.cNum, styles.th]}>P</Text>
        {wide ? (
          <>
            <Text style={[styles.cNum, styles.th]}>W</Text>
            <Text style={[styles.cNum, styles.th]}>D</Text>
            <Text style={[styles.cNum, styles.th]}>L</Text>
          </>
        ) : null}
        <Text style={[styles.cNum, styles.th]}>GD</Text>
        <Text style={[styles.cPts, styles.th]}>Pts</Text>
      </View>
      {group.rows.map((row) => {
        const highlight =
          highlightTeamIds.includes(row.teamId) || highlightNames.includes(row.name);
        return (
          <Pressable
            key={row.teamId || row.name}
            onPress={() => onTeamPress?.(row)}
            style={({ hovered }) => [
              styles.row,
              highlight && styles.rowHighlight,
              row.zone === 'qualify' && styles.rowQualify,
              Platform.OS === 'web' && hovered ? styles.rowHover : null,
            ]}>
            <View style={styles.cPos}>
              {row.zone !== 'out' ? (
                <View style={[styles.zoneBar, { backgroundColor: ZONE_COLOR[row.zone] }]} />
              ) : null}
              <Text style={styles.posText}>{row.rank}</Text>
            </View>
            <View style={styles.cTeam}>
              <CountryFlag name={row.name} size={16} />
              <Text style={styles.teamName} numberOfLines={1}>
                {row.name}
              </Text>
            </View>
            <Text style={[styles.cNum, styles.td]}>{row.played}</Text>
            {wide ? (
              <>
                <Text style={[styles.cNum, styles.td]}>{row.won}</Text>
                <Text style={[styles.cNum, styles.td]}>{row.drawn}</Text>
                <Text style={[styles.cNum, styles.td]}>{row.lost}</Text>
              </>
            ) : null}
            <Text style={[styles.cNum, styles.td]}>
              {row.goalDiff > 0 ? `+${row.goalDiff}` : row.goalDiff}
            </Text>
            <Text style={[styles.cPts, styles.pts]}>{row.points}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.surface,
    borderRadius: layout.borderRadius,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  groupTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: theme.textPrimary,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 36,
    borderTopWidth: layout.borderWidth,
    borderTopColor: theme.border,
    paddingRight: spacing.sm,
  },
  rowHover: { backgroundColor: theme.surfaceHover },
  rowHighlight: { backgroundColor: 'rgba(5, 150, 105, 0.1)' },
  rowQualify: { backgroundColor: 'rgba(22, 163, 74, 0.05)' },
  head: { backgroundColor: theme.surfaceMuted, borderTopWidth: 0 },
  th: { fontFamily: fonts.bodySemiBold, fontSize: 10, color: theme.textFaint, textTransform: 'uppercase' },
  td: { fontFamily: fonts.body, fontSize: 12, color: theme.textPrimary },
  cPos: {
    width: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingLeft: spacing.sm,
  },
  zoneBar: { width: 3, height: 20, borderRadius: 2 },
  posText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: theme.textPrimary, width: 16, textAlign: 'center' },
  cTeam: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minWidth: 0 },
  teamName: { fontFamily: fonts.bodyMedium, fontSize: 12, color: theme.textPrimary, flexShrink: 1 },
  cNum: { width: 30, textAlign: 'center' },
  cPts: { width: 36, textAlign: 'center' },
  pts: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: theme.textPrimary },
});
