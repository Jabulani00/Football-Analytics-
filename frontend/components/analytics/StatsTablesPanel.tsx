import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import CompetitionPicker from '@/components/shared/CompetitionPicker';
import { useLiveCompetitions } from '@/hooks/useLiveCompetitions';
import { useLiveStatsTables } from '@/hooks/useLiveStatsTables';
import { getTeamStatsForTable } from '@/mock/analyticsData';
import type { StatFamily } from '@/types/analytics';
import { complianceColor } from '@/utils/compliance';
import { liveRowsToDisplay, sortByPrimary } from '@/utils/statsTableAdapter';
import { fonts, layout, spacing, theme } from '@/styles/theme';

// The 72 tables reduced to three simple controls: a family/window, a period and
// a scope. Family × period × scope maps 1:1 to a live builder table name.
type FamilyOption = { key: string; label: string; family: StatFamily; blurb: string };
const FAMILIES: FamilyOption[] = [
  { key: 'ordinary', label: 'Ordinary', family: 'ordinary', blurb: 'Core goal & result rates — win / draw / BTTS / over-under.' },
  { key: 'ppg', label: 'PPG', family: 'ppg', blurb: 'Points per game, plus form and result rates.' },
  { key: 'series', label: 'Series', family: 'series', blurb: 'Current streaks — consecutive wins, unbeaten, BTTS, overs…' },
  { key: 'ft_only', label: 'FT-Only', family: 'ft_only', blurb: 'Full-time patterns — won both halves, win-to-nil, led at HT.' },
  { key: 'league_avg', label: 'League Avg', family: 'league_avg', blurb: 'League-wide averages across every team.' },
  { key: 'last10', label: 'Last 10', family: 'ordinary', blurb: 'Core stats over each team’s last 10 games.' },
  { key: 'last8', label: 'Last 8', family: 'ordinary', blurb: 'Core stats over each team’s last 8 games.' },
  { key: 'last6', label: 'Last 6', family: 'ordinary', blurb: 'Core stats over each team’s last 6 games.' },
];

type PeriodKey = 'fulltime' | 'firsthalf' | 'secondhalf';
type ScopeKey = 'overall' | 'home' | 'away';
const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: 'fulltime', label: 'Full-time' },
  { key: 'firsthalf', label: '1st Half' },
  { key: 'secondhalf', label: '2nd Half' },
];
const SCOPES: { key: ScopeKey; label: string }[] = [
  { key: 'overall', label: 'Overall' },
  { key: 'home', label: 'Home' },
  { key: 'away', label: 'Away' },
];
const PERIOD_TO_BUILDER: Record<PeriodKey, string> = { fulltime: 'ft', firsthalf: 'ht', secondhalf: '2h' };

export default function StatsTablesPanel() {
  const [familyKey, setFamilyKey] = useState('ordinary');
  const [period, setPeriod] = useState<PeriodKey>('fulltime');
  const [scope, setScope] = useState<ScopeKey>('overall');
  const family = FAMILIES.find((f) => f.key === familyKey) ?? FAMILIES[0];

  const competitions = useLiveCompetitions(3);
  const [competitionId, setCompetitionId] = useState<number | null>(null);
  useEffect(() => {
    if (competitionId == null && competitions.length > 0) setCompetitionId(competitions[0].id);
  }, [competitions, competitionId]);

  const activeComp = competitions.find((c) => c.id === competitionId) ?? null;
  const live = useLiveStatsTables({
    competitionId: competitionId ?? undefined,
    seasonName: activeComp?.season,
  });

  const tableName = `${familyKey}_${PERIOD_TO_BUILDER[period]}_${scope}`;
  const liveTable = competitionId != null ? live.data?.tables[tableName] : undefined;
  const isLive = !!(liveTable && liveTable.length);

  const teams = useMemo(
    () =>
      isLive
        ? sortByPrimary(liveRowsToDisplay(liveTable!, family.family))
        : getTeamStatsForTable('sample'),
    [isLive, liveTable, family.family],
  );

  return (
    <View style={styles.container}>
      {/* Competition */}
      <CompetitionPicker
        competitions={competitions}
        selectedId={competitionId}
        onSelect={setCompetitionId}
      />

      {/* Status */}
      <View style={styles.statusRow}>
        {live.loading ? (
          <>
            <ActivityIndicator size="small" color={theme.accentGreen} />
            <Text style={styles.statusMuted}>Building tables live…</Text>
          </>
        ) : isLive ? (
          <Text style={[styles.statusText, styles.statusLive]}>
            ● LIVE · {activeComp?.name ?? ''} · {liveTable!.length} teams
          </Text>
        ) : (
          <Text style={styles.statusMuted}>
            {live.error ? 'Live unavailable — showing sample' : 'Sample data'}
          </Text>
        )}
      </View>

      {/* 1) Table family / window */}
      <Text style={styles.controlLabel}>TABLE</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={Platform.OS === 'web'}
        contentContainerStyle={styles.chipRow}>
        {FAMILIES.map((f) => (
          <Chip key={f.key} label={f.label} active={f.key === familyKey} onPress={() => setFamilyKey(f.key)} />
        ))}
      </ScrollView>
      <Text style={styles.blurb}>{family.blurb}</Text>

      {/* 2) Period + Scope segmented controls */}
      <View style={styles.segments}>
        <Segmented options={PERIODS} value={period} onChange={setPeriod} />
        <Segmented options={SCOPES} value={scope} onChange={setScope} />
      </View>

      {/* Table */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={Platform.OS === 'web'}
        style={styles.tableScroll}
        contentContainerStyle={styles.tableScrollContent}>
        <View style={styles.dataTable}>
          <View style={styles.tableHeader}>
            <Text style={[styles.cell, styles.cellRank, styles.headText]}>#</Text>
            <Text style={[styles.cell, styles.cellTeam, styles.headText]}>Team</Text>
            {teams[0]?.metrics.map((m) => (
              <Text key={m.key} style={[styles.cell, styles.headText]}>
                {m.label}
              </Text>
            ))}
          </View>
          {teams.map((row, i) => (
            <View key={row.team} style={[styles.tableRow, i % 2 === 1 && styles.tableRowAlt]}>
              <Text style={[styles.cell, styles.cellRank, styles.rankText]}>{i + 1}</Text>
              <Text style={[styles.cell, styles.cellTeam, styles.teamName]} numberOfLines={1}>
                {row.team}
              </Text>
              {row.metrics.map((m, j) => (
                <View key={m.key} style={styles.cell}>
                  <Text
                    style={[
                      styles.cellValue,
                      j === 0 && styles.cellValuePrimary,
                      { color: complianceColor(m.compliance) },
                    ]}>
                    {m.value}
                    {m.raw ? '' : '%'}
                  </Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>

      <Text style={styles.footHint}>
        Colour = performance band · green strong · yellow mid · red weak. Tap a
        table, period or scope above to explore all 72 views.
      </Text>
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed, hovered }) => [
        styles.chip,
        active && styles.chipActive,
        (pressed || (Platform.OS === 'web' && hovered)) && !active && styles.chipHover,
      ]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.segment}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            style={[styles.segmentItem, active && styles.segmentItemActive]}>
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', alignItems: 'center' },
  statusRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, marginBottom: spacing.md, minHeight: 18,
  },
  statusText: { fontFamily: fonts.bodyMedium, fontSize: 12 },
  statusLive: { color: theme.accentGreen },
  statusMuted: { fontFamily: fonts.body, fontSize: 12, color: theme.textMuted },

  controlLabel: {
    alignSelf: 'flex-start', fontFamily: fonts.bodyMedium, fontSize: 10,
    letterSpacing: 1, color: theme.textMuted, marginBottom: spacing.xs,
  },
  chipRow: { gap: spacing.sm, paddingBottom: spacing.sm, flexGrow: 1 },
  chip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: layout.borderWidth,
    borderColor: theme.border, borderRadius: 999, backgroundColor: theme.surface,
  },
  chipActive: { borderColor: theme.accentGreen, backgroundColor: 'rgba(0,180,120,0.10)' },
  chipHover: { borderColor: theme.textMuted },
  chipText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: theme.textMuted },
  chipTextActive: { color: theme.accentGreen },
  blurb: {
    alignSelf: 'stretch', fontFamily: fonts.body, fontSize: 12, color: theme.textMuted,
    marginBottom: spacing.md, maxWidth: 640,
  },

  segments: {
    flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md,
    justifyContent: 'center', marginBottom: spacing.lg, width: '100%',
  },
  segment: {
    flexDirection: 'row', borderWidth: layout.borderWidth, borderColor: theme.border,
    borderRadius: layout.borderRadius, overflow: 'hidden', backgroundColor: theme.surface,
  },
  segmentItem: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  segmentItemActive: { backgroundColor: theme.accentGreen },
  segmentText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: theme.textMuted },
  segmentTextActive: { color: theme.surface },

  tableScroll: { width: '100%', maxWidth: '100%' },
  tableScrollContent: { minWidth: '100%' },
  dataTable: {
    backgroundColor: theme.surface, borderWidth: layout.borderWidth, borderColor: theme.border,
    borderRadius: layout.borderRadius, minWidth: 640, overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row', borderBottomWidth: layout.borderWidth, borderBottomColor: theme.border,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.sm, backgroundColor: 'rgba(127,127,127,0.06)',
  },
  headText: { fontFamily: fonts.bodyMedium, fontSize: 11, color: theme.textMuted },
  tableRow: {
    flexDirection: 'row', paddingVertical: spacing.sm, paddingHorizontal: spacing.sm,
    alignItems: 'center',
  },
  tableRowAlt: { backgroundColor: 'rgba(127,127,127,0.04)' },
  cell: { width: 64, alignItems: 'center', justifyContent: 'center' },
  cellRank: { width: 28, alignItems: 'flex-start' },
  cellTeam: { width: 128, alignItems: 'flex-start' },
  rankText: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted },
  teamName: { fontFamily: fonts.bodyMedium, fontSize: 12, color: theme.textPrimary },
  cellValue: { fontFamily: fonts.bodyMedium, fontSize: 11 },
  cellValuePrimary: { fontSize: 13, fontFamily: fonts.display },

  footHint: {
    fontFamily: fonts.body, fontSize: 11, color: theme.textMuted, textAlign: 'center',
    marginTop: spacing.md, maxWidth: 560, lineHeight: 16,
  },
});
