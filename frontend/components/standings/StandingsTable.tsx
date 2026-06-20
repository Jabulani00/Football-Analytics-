import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import TeamLogo from '@/components/shared/TeamLogo';
import type { StandingRow, StandingZone, TierPoints } from '@/services/oddAlerts';
import { fonts, layout, spacing, theme } from '@/styles/theme';

type StandingsTableProps = {
  rows: StandingRow[];
  tier: Map<number, TierPoints> | null;
  onTeamPress?: (row: StandingRow) => void;
};

const ZONE_COLOR: Record<StandingZone, string> = {
  top: '#16A34A',
  mid: '#D97706',
  bottom: '#DC2626',
};

const ZONE_TINT: Record<StandingZone, string> = {
  top: 'rgba(22, 163, 74, 0.07)',
  mid: 'rgba(217, 119, 6, 0.06)',
  bottom: 'rgba(220, 38, 38, 0.06)',
};

export default function StandingsTable({ rows, tier, onTeamPress }: StandingsTableProps) {
  const { width } = useWindowDimensions();
  const wide = width >= 760;
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <View>
      <View style={[styles.row, styles.head]}>
        <Text style={[styles.cPos, styles.th]}>#</Text>
        <Text style={[styles.cTeam, styles.th]}>Team</Text>
        <Text style={[styles.cNum, styles.th]}>P</Text>
        {wide ? (
          <>
            <Text style={[styles.cNum, styles.th]}>W</Text>
            <Text style={[styles.cNum, styles.th]}>D</Text>
            <Text style={[styles.cNum, styles.th]}>L</Text>
            <Text style={[styles.cNum, styles.th]}>GF</Text>
            <Text style={[styles.cNum, styles.th]}>GA</Text>
          </>
        ) : null}
        <Text style={[styles.cNum, styles.th]}>GD</Text>
        {wide ? (
          <>
            <Text style={[styles.cNum, styles.th]}>Home</Text>
            <Text style={[styles.cNum, styles.th]}>Away</Text>
          </>
        ) : null}
        <Text style={[styles.cPts, styles.th]}>Pts</Text>
      </View>

      {rows.map((row) => {
        const isOpen = expanded === row.teamId;
        const tp = tier?.get(row.teamId);
        return (
          <View key={row.teamId}>
            <Pressable
              onPress={() => {
                setExpanded(isOpen ? null : row.teamId);
                onTeamPress?.(row);
              }}
              style={({ hovered }) => [
                styles.row,
                { backgroundColor: ZONE_TINT[row.zone] },
                Platform.OS === 'web' && hovered ? styles.rowHover : null,
              ]}>
              <View style={styles.cPos}>
                <View style={[styles.zoneBar, { backgroundColor: ZONE_COLOR[row.zone] }]} />
                <Text style={styles.posText}>{row.rank}</Text>
              </View>
              <View style={styles.cTeam}>
                <TeamLogo name={row.name} size={18} />
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
                  <Text style={[styles.cNum, styles.td]}>{row.goalsFor}</Text>
                  <Text style={[styles.cNum, styles.td]}>{row.goalsAgainst}</Text>
                </>
              ) : null}
              <Text style={[styles.cNum, styles.td]}>
                {row.goalDiff > 0 ? `+${row.goalDiff}` : row.goalDiff}
              </Text>
              {wide ? (
                <>
                  <Text style={[styles.cNum, styles.tdMuted]}>{row.homePoints}</Text>
                  <Text style={[styles.cNum, styles.tdMuted]}>{row.awayPoints}</Text>
                </>
              ) : null}
              <Text style={[styles.cPts, styles.pts]}>{row.points}</Text>
            </Pressable>

            {isOpen ? (
              <View style={styles.detail}>
                {!wide ? (
                  <Text style={styles.detailLine}>
                    Home {row.homePoints} pts · Away {row.awayPoints} pts · W{row.won} D{row.drawn} L
                    {row.lost}
                  </Text>
                ) : null}
                <Text style={styles.detailTitle}>Points won by opponent</Text>
                {tp ? (
                  <View style={styles.tierRow}>
                    <TierChip label="vs Top sides" color={ZONE_COLOR.top} data={tp.top} />
                    <TierChip label="vs Mid-table" color={ZONE_COLOR.mid} data={tp.mid} />
                    <TierChip label="vs Bottom sides" color={ZONE_COLOR.bottom} data={tp.bottom} />
                  </View>
                ) : (
                  <Text style={styles.detailMuted}>Calculating from season results…</Text>
                )}
              </View>
            ) : null}
          </View>
        );
      })}

      <View style={styles.legend}>
        <LegendDot color={ZONE_COLOR.top} label="Top sides" />
        <LegendDot color={ZONE_COLOR.mid} label="Mid-table" />
        <LegendDot color={ZONE_COLOR.bottom} label="Bottom sides" />
      </View>
    </View>
  );
}

function TierChip({
  label,
  color,
  data,
}: {
  label: string;
  color: string;
  data: { points: number; played: number };
}) {
  return (
    <View style={styles.tierChip}>
      <View style={[styles.tierDot, { backgroundColor: color }]} />
      <Text style={styles.tierLabel}>{label}</Text>
      <Text style={styles.tierValue}>
        {data.points} pts
        <Text style={styles.tierGames}> · {data.played} gms</Text>
      </Text>
    </View>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 38,
    borderBottomWidth: layout.borderWidth,
    borderBottomColor: theme.border,
    paddingRight: spacing.sm,
  },
  rowHover: { backgroundColor: theme.surfaceHover },
  head: { backgroundColor: theme.surface, borderBottomColor: theme.border },
  th: { fontFamily: fonts.bodySemiBold, fontSize: 10, color: theme.textFaint, textTransform: 'uppercase' },
  td: { fontFamily: fonts.body, fontSize: 12, color: theme.textPrimary },
  tdMuted: { fontFamily: fonts.body, fontSize: 12, color: theme.textMuted },
  cPos: {
    width: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 2,
  },
  zoneBar: { width: 3, height: 22, borderRadius: 2 },
  posText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: theme.textPrimary, width: 20, textAlign: 'center' },
  cTeam: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minWidth: 0 },
  teamName: { fontFamily: fonts.bodyMedium, fontSize: 13, color: theme.textPrimary, flexShrink: 1 },
  cNum: { width: 34, textAlign: 'center' },
  cPts: { width: 40, textAlign: 'center' },
  pts: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.textPrimary },
  detail: {
    backgroundColor: theme.surfaceMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: layout.borderWidth,
    borderBottomColor: theme.border,
    gap: spacing.xs,
  },
  detailLine: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted },
  detailTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    color: theme.textFaint,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  detailMuted: { fontFamily: fonts.body, fontSize: 11, color: theme.textFaint },
  tierRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tierChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: theme.surface,
    borderRadius: layout.borderRadius,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  tierDot: { width: 8, height: 8, borderRadius: 4 },
  tierLabel: { fontFamily: fonts.bodyMedium, fontSize: 11, color: theme.textMuted },
  tierValue: { fontFamily: fonts.bodySemiBold, fontSize: 11, color: theme.textPrimary },
  tierGames: { fontFamily: fonts.body, fontSize: 10, color: theme.textFaint },
  legend: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    flexWrap: 'wrap',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 9, height: 9, borderRadius: 2 },
  legendText: { fontFamily: fonts.body, fontSize: 10, color: theme.textMuted },
});
