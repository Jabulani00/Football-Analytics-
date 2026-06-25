import { ActivityIndicator, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import GroupStandingsTable from '@/components/standings/GroupStandingsTable';
import { useGroupStandings } from '@/hooks/useGroupStandings';
import type { Competition } from '@/services/oddAlerts';
import type { GroupStandingRow } from '@/utils/groupStandings';
import { fonts, spacing, theme } from '@/styles/theme';

type GroupStandingsViewProps = {
  competition: Competition;
  seasonId: number | null;
  highlightTeamIds?: number[];
  highlightNames?: string[];
  onTeamPress?: (row: GroupStandingRow) => void;
};

export default function GroupStandingsView({
  competition,
  seasonId,
  highlightTeamIds,
  highlightNames,
  onTeamPress,
}: GroupStandingsViewProps) {
  const { groups, loading, error } = useGroupStandings(competition, seasonId);
  const { width } = useWindowDimensions();
  const columns = width >= 1100 ? 3 : width >= 680 ? 2 : 1;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.accentGreen} />
        <Text style={styles.muted}>Loading group tables…</Text>
      </View>
    );
  }

  if (error) {
    return <Text style={styles.muted}>{error}</Text>;
  }

  if (groups.length === 0) {
    return <Text style={styles.muted}>Group-stage tables will appear once matches are played.</Text>;
  }

  const rows: (typeof groups)[] = [];
  for (let i = 0; i < groups.length; i += columns) {
    rows.push(groups.slice(i, i + columns));
  }

  return (
    <View>
      <Text style={styles.subtitle}>
        {groups.length} groups · top two qualify
        {groups.length >= 12 ? ' (8 best third-placed teams also advance)' : ''}
      </Text>
      {rows.map((chunk, ri) => (
        <View key={ri} style={[styles.grid, columns > 1 && styles.gridMulti]}>
          {chunk.map((group) => (
            <View key={group.letter} style={columns > 1 ? styles.gridCell : styles.gridFull}>
              <GroupStandingsTable
                group={group}
                highlightTeamIds={highlightTeamIds}
                highlightNames={highlightNames}
                onTeamPress={onTeamPress}
              />
            </View>
          ))}
        </View>
      ))}
      <View style={styles.legend}>
        <Legend color="#16A34A" label="Qualifying places" />
        <Legend color="#D97706" label="Possible qualification" />
      </View>
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', paddingVertical: spacing.xxl, gap: spacing.sm },
  muted: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: theme.textMuted,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textMuted,
    marginBottom: spacing.md,
  },
  grid: { gap: spacing.md },
  gridMulti: { flexDirection: 'row', alignItems: 'flex-start' },
  gridCell: { flex: 1, minWidth: 0 },
  gridFull: { width: '100%' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, paddingTop: spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 2 },
  legendText: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted },
});
