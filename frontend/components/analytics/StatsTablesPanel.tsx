import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import LeagueStatsPanel from '@/components/league/LeagueStatsPanel';
import CompetitionPicker from '@/components/shared/CompetitionPicker';
import FilterDropdown from '@/components/shared/FilterDropdown';
import { useLiveCompetitionFeed } from '@/hooks/useLiveCompetitions';
import { useLiveStatsTables } from '@/hooks/useLiveStatsTables';
import type { StatFamily } from '@/types/analytics';
import { complianceColor, COMPLIANCE_RULE_TEXT } from '@/utils/compliance';
import { liveRowsToDisplay, sampleRowsForFamily, sortByPrimary } from '@/utils/statsTableAdapter';
import { fonts, layout, spacing, theme } from '@/styles/theme';

// The 72 tables reduced to three simple controls: a family/window, a period and
// a scope. Family × period × scope maps 1:1 to a live builder table name.
type FamilyOption = { key: string; label: string; family: StatFamily; blurb: string };
const FAMILIES: FamilyOption[] = [
  { key: 'ordinary', label: 'Ordinary', family: 'ordinary', blurb: 'Core goal & result rates — win / draw / BTTS / over-under.' },
  { key: 'ppg', label: 'PPG', family: 'ppg', blurb: 'Points per game, plus form and result rates.' },
  { key: 'series', label: 'Series', family: 'series', blurb: 'Current streaks — consecutive wins, unbeaten, BTTS, overs…' },
  { key: 'ft_only', label: 'FT-Only', family: 'ft_only', blurb: 'Full-time patterns — won both halves, win-to-nil, led at HT. Counted on the full match, so the period control does not apply.' },
  { key: 'league_avg', label: 'League Stats', family: 'league_avg', blurb: 'Every team ranked on one stat, with the league average pinned underneath.' },
  { key: 'last10', label: 'Last 10', family: 'ordinary', blurb: 'Core stats over each team’s last 10 games.' },
  { key: 'last8', label: 'Last 8', family: 'ordinary', blurb: 'Core stats over each team’s last 8 games.' },
  { key: 'last6', label: 'Last 6', family: 'ordinary', blurb: 'Core stats over each team’s last 6 games.' },
];

const ADDITIONAL_KEYS = new Set(['ppg', 'series', 'ft_only', 'league_avg']);

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

export default function StatsTablesPanel({ variant = 'all' }: { variant?: 'all' | 'additional' }) {
  const families = variant === 'additional' ? FAMILIES.filter((item) => ADDITIONAL_KEYS.has(item.key)) : FAMILIES;
  const narrow = useWindowDimensions().width < 720;
  const [familyKey, setFamilyKey] = useState(variant === 'additional' ? 'ppg' : 'ordinary');
  const [period, setPeriod] = useState<PeriodKey>('fulltime');
  const [scope, setScope] = useState<ScopeKey>('overall');
  const family = FAMILIES.find((f) => f.key === familyKey) ?? FAMILIES[0];

  const feed = useLiveCompetitionFeed(3);
  const competitions = feed.competitions;
  const [competitionId, setCompetitionId] = useState<number | null>(null);
  useEffect(() => {
    if (competitionId == null && competitions.length > 0) setCompetitionId(competitions[0].id);
  }, [competitions, competitionId]);

  const activeComp = competitions.find((c) => c.id === competitionId) ?? null;
  const live = useLiveStatsTables({
    competitionId: competitionId ?? undefined,
    seasonName: activeComp?.season,
  });

  // Won-both-halves and the other FT-only patterns use the whole match. The
  // half tables repeat those columns, so this view stays on the full-time table.
  const periodApplies = familyKey !== 'ft_only';
  const activePeriod: PeriodKey = periodApplies ? period : 'fulltime';
  const tableName = `${familyKey}_${PERIOD_TO_BUILDER[activePeriod]}_${scope}`;
  const liveTable = competitionId != null ? live.data?.tables[tableName] : undefined;
  // League Stats ranks the teams, so it reads the ordinary table too — the
  // league_avg table is only the single averaged row.
  const isLeagueStats = familyKey === 'league_avg';
  const leagueTeamRows =
    competitionId != null && isLeagueStats
      ? live.data?.tables[`ordinary_${PERIOD_TO_BUILDER[activePeriod]}_${scope}`]
      : undefined;
  const liveRows = isLeagueStats ? leagueTeamRows : liveTable;
  const isLive = !!(liveRows && liveRows.length);

  const waiting = feed.loading || (!!competitionId && live.loading && !isLive);
  const feedError = feed.error ?? live.error;
  const teams = useMemo(() => {
    if (isLeagueStats || waiting) return [];
    if (isLive && liveTable) return sortByPrimary(liveRowsToDisplay(liveTable, family.family));
    const salt =
      PERIODS.findIndex((item) => item.key === activePeriod) * 3 +
      SCOPES.findIndex((item) => item.key === scope);
    return sortByPrimary(sampleRowsForFamily(family.family, salt));
  }, [isLeagueStats, waiting, isLive, liveTable, family.family, activePeriod, scope]);

  return (
    <View style={styles.container}>
      {/* Competition */}
      <CompetitionPicker
        competitions={competitions}
        selectedId={competitionId}
        onSelect={setCompetitionId}
        emptyLabel={feed.loading ? 'Loading…' : feed.error ? 'Couldn’t load' : 'No competitions'}
      />

      {/* Status */}
      <View style={styles.statusRow}>
        {waiting ? (
          <>
            <ActivityIndicator size="small" color={theme.accentGreen} />
            <Text style={styles.statusMuted}>
              {feed.loading ? 'Loading competitions…' : 'Building tables live…'}
            </Text>
          </>
        ) : isLive ? (
          <Text style={[styles.statusText, styles.statusLive]}>
            ● LIVE · {activeComp?.name ?? ''} · {liveRows!.length} teams
          </Text>
        ) : (
          <Text style={styles.statusMuted}>
            {feedError
              ? isLeagueStats
                ? 'Live unavailable'
                : 'Live unavailable — showing sample'
              : isLeagueStats
                ? 'No finished results yet'
                : 'Sample data'}
          </Text>
        )}
      </View>

      <View style={[styles.filters, narrow && styles.filtersNarrow]}>
        <FilterDropdown
          label="Table"
          value={familyKey}
          options={families.map((item) => ({ value: item.key, label: item.label }))}
          onChange={setFamilyKey}
          style={narrow ? styles.filterFull : undefined}
        />
        {periodApplies ? (
          <FilterDropdown
            label="Period"
            value={period}
            options={PERIODS.map((item) => ({ value: item.key, label: item.label }))}
            onChange={(value) => setPeriod(value as PeriodKey)}
            style={narrow ? styles.filterFull : undefined}
          />
        ) : null}
        <FilterDropdown
          label="Scope"
          value={scope}
          options={SCOPES.map((item) => ({ value: item.key, label: item.label }))}
          onChange={(value) => setScope(value as ScopeKey)}
          style={narrow ? styles.filterFull : undefined}
        />
      </View>
      <Text style={styles.blurb}>{family.blurb}</Text>

      {/* Table */}
      {isLeagueStats ? (
        <LeagueStatsPanel
          teamRows={leagueTeamRows}
          leagueRow={liveTable?.[0]}
          loading={waiting}
          error={feedError}
          contextLabel={`${PERIODS.find((p) => p.key === activePeriod)?.label} ${scope}`}
        />
      ) : teams.length === 0 ? null : (
        <>
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
            Colour = how often the stat lands, not whether it is good:{' '}
            {COMPLIANCE_RULE_TEXT}. Streaks are counted in matches (🟢 3+) and PPG
            on its 0–3 scale (🟢 1.80+).
            {variant === 'additional'
              ? ' These are the extra families: points per game, series, full-time patterns, and league averages.'
              : ' Tap a table, period or scope above to explore all 72 views.'}
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%' },
  filters: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  filtersNarrow: { flexDirection: 'column' },
  filterFull: { width: '100%', minWidth: 0, flexBasis: 'auto', flexGrow: 0 },
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
    marginBottom: spacing.md, width: '100%',
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
