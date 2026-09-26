import { useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import SubTabBar from '@/components/shared/SubTabBar';
import type { TeamStatRow } from '@/types/data';
import { complianceColor } from '@/utils/compliance';
import {
  buildLeagueStatTable,
  DEFAULT_LEAGUE_STAT,
  LEAGUE_STAT_GROUPS,
  leagueStatDef,
  leagueStatsInGroup,
  MIN_LEAGUE_SAMPLE,
  type LeagueStatGroupId,
  type LeagueStatRank,
} from '@/utils/leagueStats';
import { fonts, layout, spacing, theme } from '@/styles/theme';

type Props = {
  /** `ordinary_{period}_{scope}` — one row per team. */
  teamRows: TeamStatRow[] | undefined;
  /** `league_avg_{period}_{scope}` — the builder's single "League" row. */
  leagueRow: TeamStatRow | undefined;
  loading?: boolean;
  error?: string | null;
  /** Team names to mark (e.g. the two sides of a fixture). */
  highlightTeams?: string[];
  onTeamPress?: (team: string) => void;
  /** Period / scope the host is showing, for the caption. */
  contextLabel?: string;
};

function formatValue(value: number, avg?: boolean): string {
  return avg ? value.toFixed(1) : `${Math.round(value)}%`;
}

function formatDiff(diff: number, avg?: boolean): string {
  if (diff === 0) return 'level';
  const sign = diff > 0 ? '+' : '−';
  const size = Math.abs(diff);
  return `${sign}${avg ? size.toFixed(1) : Math.round(size)}`;
}

function StatRow({
  row,
  avg,
  scale,
  marked,
  lastAbove,
  onPress,
}: {
  row: LeagueStatRank;
  avg?: boolean;
  scale: number;
  marked: boolean;
  /** Draws the above/below-average divider under this row. */
  lastAbove: boolean;
  onPress?: () => void;
}) {
  const color = row.level ? complianceColor(row.level) : theme.accentBlue;
  return (
    <Pressable
      onPress={onPress}
      style={({ hovered }) => [
        styles.row,
        marked && styles.rowMarked,
        lastAbove && styles.rowDivide,
        Platform.OS === 'web' && hovered ? styles.rowHover : null,
      ]}>
      <Text style={styles.rank}>{row.rank}</Text>
      <Text style={[styles.team, marked && styles.teamMarked]} numberOfLines={1}>
        {row.team}
        {row.thin ? <Text style={styles.thin}> n={row.sample}</Text> : null}
      </Text>
      <View style={styles.barTrack}>
        <View
          style={[
            styles.barFill,
            { width: `${Math.min(100, (row.value / scale) * 100)}%`, backgroundColor: color },
          ]}
        />
      </View>
      <Text style={[styles.diff, row.side === 'above' ? styles.diffAbove : row.side === 'below' ? styles.diffBelow : null]}>
        {formatDiff(row.diff, avg)}
      </Text>
      <Text style={[styles.value, { color }]}>{formatValue(row.value, avg)}</Text>
    </Pressable>
  );
}

/**
 * Spec §4.7 — the league's teams ranked on one Ordinary stat with the league
 * average pinned at the bottom, so every row reads above or below the norm.
 * Presentational: the host supplies the builder rows for its period and scope.
 */
export default function LeagueStatsPanel({
  teamRows,
  leagueRow,
  loading,
  error,
  highlightTeams,
  onTeamPress,
  contextLabel,
}: Props) {
  const [statKey, setStatKey] = useState(DEFAULT_LEAGUE_STAT);
  const group = leagueStatDef(statKey)?.group ?? LEAGUE_STAT_GROUPS[0].id;

  const table = useMemo(
    () => buildLeagueStatTable({ statKey, teamRows: teamRows ?? [], leagueRow }),
    [statKey, teamRows, leagueRow],
  );

  const statTabs = leagueStatsInGroup(group).map((d) => ({ id: d.key, label: d.short }));
  const selectGroup = (id: LeagueStatGroupId) => {
    const first = leagueStatsInGroup(id)[0];
    if (first) setStatKey(first.key);
  };

  const marked = new Set(highlightTeams ?? []);
  const avg = table?.stat.avg;
  // Percentages share a 0–100 track; averages scale to the leader.
  const scale = avg ? Math.max(1, table?.rows[0]?.value ?? 1) : 100;
  const average = table?.average ?? null;

  return (
    <View style={styles.wrap}>
      <SubTabBar tabs={LEAGUE_STAT_GROUPS} active={group} onChange={selectGroup} />
      <SubTabBar tabs={statTabs} active={statKey} onChange={setStatKey} />

      {loading && !table?.rows.length ? (
        <View style={styles.loading}>
          <ActivityIndicator color={theme.accentGreen} />
          <Text style={styles.muted}>Building league stats…</Text>
        </View>
      ) : !table || table.rows.length === 0 ? (
        <Text style={styles.muted}>
          No finished results yet for this competition{error ? ` — ${error}` : ''}.
        </Text>
      ) : (
        <>
          <Text style={styles.caption}>
            {table.stat.label} · {table.rows.length} teams{contextLabel ? ` · ${contextLabel}` : ''}
          </Text>

          <View style={styles.table}>
            {table.rows.map((row, i) => (
              <StatRow
                key={row.team}
                row={row}
                avg={avg}
                scale={scale}
                marked={marked.has(row.team)}
                lastAbove={i + 1 === table.divideAfter && i + 1 < table.rows.length}
                onPress={onTeamPress ? () => onTeamPress(row.team) : undefined}
              />
            ))}

            {average ? (
              <View style={styles.averageRow}>
                <Text style={styles.averageLabel}>LEAGUE AVERAGE</Text>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      styles.barFillAverage,
                      { width: `${Math.min(100, (average.value / scale) * 100)}%` },
                    ]}
                  />
                </View>
                <Text style={styles.averageValue}>{formatValue(average.value, avg)}</Text>
              </View>
            ) : null}
          </View>

          <Text style={styles.foot}>
            {average ? `Average of all ${average.teams} teams · smallest sample n=${average.minSample} · ` : ''}
            {table.thinTeams > 0
              ? `${table.thinTeams} team${table.thinTeams === 1 ? '' : 's'} under ${MIN_LEAGUE_SAMPLE} finished games — sample shown next to the name. `
              : ''}
            Colour is how often the stat lands, not whether it is good.
            {error ? ` ${error}` : ''}
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  caption: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: theme.textPrimary,
    marginBottom: spacing.sm,
  },
  table: {
    backgroundColor: theme.surface,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: layout.borderWidth,
    borderBottomColor: theme.border,
    borderLeftWidth: 2,
    borderLeftColor: 'transparent',
  },
  rowMarked: { borderLeftColor: theme.accentGreen, backgroundColor: 'rgba(5, 150, 105, 0.05)' },
  rowDivide: { borderBottomWidth: 2, borderBottomColor: theme.borderStrong },
  rowHover: { backgroundColor: theme.surfaceHover },
  rank: { width: 20, fontFamily: fonts.body, fontSize: 11, color: theme.textFaint },
  team: { width: 120, fontFamily: fonts.bodyMedium, fontSize: 12, color: theme.textPrimary },
  teamMarked: { fontFamily: fonts.bodySemiBold },
  thin: { fontFamily: fonts.body, fontSize: 9, color: theme.textFaint },
  barTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.surfaceMuted,
    overflow: 'hidden',
  },
  barFill: { height: 6, borderRadius: 3 },
  barFillAverage: { backgroundColor: theme.textMuted },
  diff: { width: 40, textAlign: 'right', fontFamily: fonts.body, fontSize: 10, color: theme.textFaint },
  diffAbove: { color: theme.accentGreen },
  diffBelow: { color: theme.loss },
  value: { width: 44, textAlign: 'right', fontFamily: fonts.bodySemiBold, fontSize: 12 },
  averageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderTopWidth: 2,
    borderTopColor: theme.borderStrong,
    backgroundColor: theme.surfaceMuted,
  },
  averageLabel: {
    width: 148,
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    letterSpacing: 0.5,
    color: theme.textMuted,
  },
  averageValue: {
    width: 92,
    textAlign: 'right',
    fontFamily: fonts.display,
    fontSize: 14,
    color: theme.textPrimary,
  },
  loading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  muted: { fontFamily: fonts.body, fontSize: 12, color: theme.textMuted, paddingVertical: spacing.md },
  foot: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: theme.textFaint,
    marginTop: spacing.xs,
    lineHeight: 14,
  },
});
