import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useQuery } from '@tanstack/react-query';

import LeagueStatsPanel from '@/components/league/LeagueStatsPanel';
import CompetitionPicker from '@/components/shared/CompetitionPicker';
import DragScroll from '@/components/shared/DragScroll';
import FilterDropdown from '@/components/shared/FilterDropdown';
import IncludedGamesList from '@/components/shared/IncludedGamesList';
import PageControls, { PAGE_SIZE } from '@/components/shared/PageControls';
import { STATS_TABLES } from '@/mock/analyticsData';
import { useLiveCompetitionFeed } from '@/hooks/useLiveCompetitions';
import { useLiveStatsTables } from '@/hooks/useLiveStatsTables';
import { fetchSeasonStandings } from '@/services/oddAlerts';
import { oddAlertsKeys } from '@/services/oddAlertsKeys';
import { clientStaleTime } from '@/services/oddAlertsCachePolicy';
import type { StatFamily, StatsTableMeta } from '@/types/analytics';
import { complianceColor, COMPLIANCE_RULE_TEXT } from '@/utils/compliance';
import { rowGames } from '@/utils/countedGames';
import { liveRowsToDisplay, sortByPrimary } from '@/utils/statsTableAdapter';
import { fonts, layout, spacing, theme } from '@/styles/theme';

// Every catalogue entry maps directly to the matching live builder table name.
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
  { key: 'last5', label: 'Last 5', family: 'ordinary', blurb: 'Core stats over each team’s last 5 games.' },
];

const ADDITIONAL_KEYS = new Set(['ppg', 'series', 'ft_only', 'league_avg']);

const PERIOD_TO_BUILDER: Record<StatsTableMeta['period'], string> = { fulltime: 'ft', firsthalf: 'ht', secondhalf: '2h' };
const tableKey = (table: StatsTableMeta) =>
  `${table.recency && table.recency !== 'all' ? table.recency : table.family ?? 'ordinary'}_${PERIOD_TO_BUILDER[table.period]}_${table.split}`;

export default function StatsTablesPanel({
  variant = 'all',
  showCatalogue = false,
}: { variant?: 'all' | 'additional'; showCatalogue?: boolean }) {
  const availableTables = variant === 'additional'
    ? STATS_TABLES.filter((table) => table.group === 'base' && ADDITIONAL_KEYS.has(table.family ?? ''))
    : STATS_TABLES;
  const narrow = useWindowDimensions().width < 720;
  const [tableId, setTableId] = useState(variant === 'additional' ? 'ppg-ft-overall' : 'ordinary-ft-overall');
  const activeTable = availableTables.find((table) => table.id === tableId) ?? availableTables[0];
  const familyKey = activeTable?.recency && activeTable.recency !== 'all' ? activeTable.recency : activeTable?.family ?? 'ordinary';
  const activePeriod = activeTable?.period ?? 'fulltime';
  const scope = activeTable?.split ?? 'overall';
  const family = FAMILIES.find((f) => f.key === familyKey) ?? FAMILIES[0];
  const catalogueGroups = [
    { label: `Base tables (${availableTables.filter((table) => table.group === 'base').length})`, tables: availableTables.filter((table) => table.group === 'base') },
    { label: `Last-N tables (${availableTables.filter((table) => table.group === 'lastN').length})`, tables: availableTables.filter((table) => table.group === 'lastN') },
  ].filter((group) => group.tables.length > 0);

  const feed = useLiveCompetitionFeed(3);
  const competitions = feed.competitions;
  const [competitionId, setCompetitionId] = useState<number | null>(null);
  const [openTeam, setOpenTeam] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [qualityFilter, setQualityFilter] = useState<'all' | 'fulltime' | 'halftime'>('all');
  const [showAllIssues, setShowAllIssues] = useState(false);
  useEffect(() => {
    if (competitionId == null && competitions.length > 0) setCompetitionId(competitions[0].id);
  }, [competitions, competitionId]);

  const activeComp = competitions.find((c) => c.id === competitionId) ?? null;
  const standingsQuery = useQuery({
    queryKey: oddAlertsKeys.seasonStats(activeComp?.seasonId ?? 0),
    queryFn: ({ signal }) => fetchSeasonStandings(activeComp!.seasonId!, signal),
    enabled: activeComp?.seasonId != null,
    staleTime: clientStaleTime('stats/season'),
  });
  const teamRanks = useMemo(
    () => standingsQuery.data?.map(({ teamId, rank }) => ({ teamId, rank })),
    [standingsQuery.data],
  );
  const live = useLiveStatsTables({
    competitionId: competitionId ?? undefined,
    seasonName: activeComp?.season,
    teamRanks,
  });

  // Won-both-halves and the other FT-only patterns use the whole match. The
  // half tables repeat those columns, so this view stays on the full-time table.
  const tableName = activeTable ? tableKey(activeTable) : '';
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

  const waiting = feed.loading || (family.family === 'ppg' && standingsQuery.isPending) || (!!competitionId && live.loading && !isLive);
  const feedError = feed.error ?? live.error;
  const teams = useMemo(() => {
    if (isLeagueStats || waiting) return [];
    if (isLive && liveTable) return sortByPrimary(liveRowsToDisplay(liveTable, family.family));
    return [];
  }, [isLeagueStats, waiting, isLive, liveTable, family.family]);
  const pages = Math.max(1, Math.ceil(teams.length / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const visibleTeams = teams.slice(pageStart, pageStart + PAGE_SIZE);

  useEffect(() => {
    setPage(1);
    setOpenTeam(null);
    setShowAllIssues(false);
  }, [familyKey, activePeriod, scope, competitionId, tableName]);

  const allQualityIssues = live.data?.data_quality?.issues ?? [];
  const filteredQualityIssues = allQualityIssues.filter((issue) =>
    qualityFilter === 'all' || (qualityFilter === 'fulltime'
      ? issue.reason === 'missing_or_invalid_full_time_score'
      : issue.reason !== 'missing_or_invalid_full_time_score'),
  );
  const visibleQualityIssues = showAllIssues ? filteredQualityIssues : filteredQualityIssues.slice(0, 5);

  return (
    <View style={styles.container}>
      {showCatalogue ? (
        <View style={styles.catalogue}>
          <Text style={styles.catalogueTitle}>All {availableTables.length} statistics tables</Text>
          <Text style={styles.catalogueHint}>Choose a table to show its complete live team table below. The same source data powers every entry.</Text>
          {catalogueGroups.map((group) => (
            <View key={group.label} style={styles.catalogueGroup}>
              <Text style={styles.catalogueGroupTitle}>{group.label}</Text>
              <View style={styles.catalogueGrid}>
                {group.tables.map((table) => {
                  const selected = table.id === activeTable?.id;
                  return (
                    <Pressable
                      key={table.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => setTableId(table.id)}
                      style={[styles.catalogueItem, selected && styles.catalogueItemSelected]}>
                      <Text style={[styles.catalogueItemName, selected && styles.catalogueItemNameSelected]}>{table.name}</Text>
                      <Text style={styles.catalogueItemKey}>{tableKey(table)}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}
        </View>
      ) : null}
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
                : 'Live data unavailable'
              : isLeagueStats
                ? 'No finished results yet'
                : 'No finished match data available'}
          </Text>
        )}
      </View>
      {live.data?.data_quality ? (
        <View style={styles.qualityBox}>
          <Text style={styles.qualityText}>
            {live.data.data_quality.fixturesReceived} fixtures received · {live.data.data_quality.completedFixtures} completed ·{' '}
            {live.data.data_quality.usableFullTimeScores} with valid FT scores.{' '}
            {live.data.data_quality.missingOrInvalidFullTimeScores > 0
              ? `INSUFFICIENT API DATA · ${live.data.data_quality.missingOrInvalidFullTimeScores} completed match(es) have no valid full-time score. `
              : `${live.data.data_quality.usableFullTimeScores} completed match(es) have valid full-time scores. `}
            {live.data.data_quality.missingHalfTimeScores + live.data.data_quality.invalidHalfTimeScores > 0
              ? `PARTIAL API DATA · ${live.data.data_quality.missingHalfTimeScores + live.data.data_quality.invalidHalfTimeScores} lack a valid half-time score; full-time statistics remain usable, while half-time and affected FT-Only statistics are unavailable.`
              : 'Half-time scores are available for all completed matches.'}
            {live.data.data_quality.duplicateCompletedFixtures > 0
              ? ` ${live.data.data_quality.duplicateCompletedFixtures} duplicate fixture record(s) were ignored.`
              : ''}
          </Text>
          {allQualityIssues.length > 0 ? (
            <FilterDropdown
              label="Data issue filter"
              value={qualityFilter}
              options={[
                { value: 'all', label: `All issues (${allQualityIssues.length})` },
                { value: 'fulltime', label: 'Full-time score' },
                { value: 'halftime', label: 'Half-time score' },
              ]}
              onChange={(value) => {
                setQualityFilter(value as typeof qualityFilter);
                setShowAllIssues(false);
              }}
            />
          ) : null}
          {visibleQualityIssues.map((issue, index) => (
            <Text key={`${issue.match}-${issue.reason}-${index}`} style={styles.qualityIssue}>
              {issue.match}: {issue.reason.replaceAll('_', ' ')} · missing/invalid {issue.fields.join(', ')} · affects {issue.categories.join(', ')}
            </Text>
          ))}
          {filteredQualityIssues.length > 5 ? (
            <Pressable onPress={() => setShowAllIssues((value) => !value)} accessibilityRole="button">
              <Text style={styles.qualityMore}>{showAllIssues ? 'Show fewer flagged matches' : `Show all ${filteredQualityIssues.length} flagged matches`}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View style={[styles.filters, narrow && styles.filtersNarrow]}>
        <FilterDropdown
          label={`Table (${availableTables.length} available)`}
          value={activeTable?.id ?? ''}
          options={availableTables.map((table) => ({ value: table.id, label: table.name }))}
          onChange={setTableId}
          style={narrow ? styles.filterFull : undefined}
        />
      </View>
      <Text style={styles.blurb}>{family.blurb}</Text>

      {/* Table */}
      {isLeagueStats ? (
        <>
          <LeagueStatsPanel
            teamRows={leagueTeamRows}
            leagueRow={liveTable?.[0]}
            loading={waiting}
            error={feedError}
            onTeamPress={(team) => setOpenTeam((current) => (current === team ? null : team))}
            contextLabel={activeTable?.name ?? 'Selected table'}
          />
          {openTeam ? (
            <IncludedGamesList
              title={`${openTeam} · games in this table`}
              onClose={() => setOpenTeam(null)}
              games={rowGames(leagueTeamRows?.find((row) => row.team_name === openTeam))}
            />
          ) : null}
        </>
      ) : teams.length === 0 ? (
        <Text style={styles.statusMuted}>
          {feedError
            ? `Live statistics are unavailable: ${feedError}`
            : waiting
              ? 'Loading statistics…'
              : 'No finished matches with usable source data for this table.'}
        </Text>
      ) : (
        <>
          {openTeam ? (
            <IncludedGamesList
              title={`${openTeam} · games in this table`}
              onClose={() => setOpenTeam(null)}
              games={teams.find((row) => row.team === openTeam)?.games ?? []}
            />
          ) : null}
          <PageControls
            page={safePage}
            pages={pages}
            total={teams.length}
            from={pageStart + 1}
            to={pageStart + visibleTeams.length}
            onChange={setPage}
          />
          <DragScroll horizontal style={styles.tableScroll} contentContainerStyle={styles.tableScrollContent}>
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
              {visibleTeams.map((row, i) => (
                <Pressable
                  key={row.team}
                  onPress={() => setOpenTeam((current) => (current === row.team ? null : row.team))}
                  style={[styles.tableRow, (pageStart + i) % 2 === 1 && styles.tableRowAlt, openTeam === row.team && styles.tableRowOn]}>
                  <Text style={[styles.cell, styles.cellRank, styles.rankText]}>{pageStart + i + 1}</Text>
                  <Text style={[styles.cell, styles.cellTeam, styles.teamName]} numberOfLines={1}>
                    {row.played != null && row.played < 5 ? `${row.team} · ${row.played}` : row.team}
                  </Text>
                  {row.metrics.map((m, j) => (
                    <View key={m.key} style={styles.cell}>
                      <Text
                        style={[
                          styles.cellValue,
                          j === 0 && styles.cellValuePrimary,
                          { color: m.value == null ? theme.textFaint : complianceColor(m.compliance) },
                        ]}>
                        {m.value == null ? '—' : m.value}
                        {m.value == null || m.raw ? '' : '%'}
                      </Text>
                    </View>
                  ))}
                </Pressable>
              ))}
            </View>
          </DragScroll>
          <PageControls
            page={safePage}
            pages={pages}
            total={teams.length}
            from={pageStart + 1}
            to={pageStart + visibleTeams.length}
            onChange={setPage}
          />

          {family.family === 'ppg' ? (
            <Text style={styles.footHint}>
              {standingsQuery.isError || !teamRanks?.length
                ? 'Current league standings are unavailable; tier PPG values are blank.'
                : 'PPG vs Green / Yellow / Red uses each team’s PPG against opponents in that tier of the current league table. Values need qualifying completed results; no sample values are substituted.'}
            </Text>
          ) : null}
          <Text style={styles.footHint}>
            Colour = how often the stat lands, not whether it is good:{' '}
            {COMPLIANCE_RULE_TEXT}. Streaks are counted in matches (🟢 3+) and PPG
            on its 0–3 scale (🟢 1.80+). A blank cell was not counted. Teams with
            fewer than five games stay on the list after the leaders, with the
            game count next to the name.
            {variant === 'additional'
              ? ' These are the extra families: points per game, series, full-time patterns, and league averages. Tap a team to see the games in this table.'
              : ' Tap a team to see the games in this table, or choose another table above.'}
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%' },
  catalogue: {
    width: '100%', padding: spacing.md, marginBottom: spacing.lg,
    borderWidth: layout.borderWidth, borderColor: theme.border,
    borderRadius: layout.borderRadius, backgroundColor: theme.surface,
  },
  catalogueTitle: { fontFamily: fonts.display, fontSize: 22, color: theme.textPrimary, textAlign: 'center' },
  catalogueHint: { fontFamily: fonts.body, fontSize: 12, color: theme.textMuted, textAlign: 'center', marginTop: spacing.xs, marginBottom: spacing.md },
  catalogueGroup: { width: '100%', marginTop: spacing.sm },
  catalogueGroupTitle: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.textPrimary, marginBottom: spacing.xs },
  catalogueGrid: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  catalogueItem: {
    flexGrow: 1, flexBasis: 180, minWidth: 150, padding: spacing.sm,
    borderWidth: layout.borderWidth, borderColor: theme.border, borderRadius: layout.borderRadius,
    backgroundColor: theme.background,
  },
  catalogueItemSelected: { borderColor: theme.accentGreen, backgroundColor: 'rgba(0,180,120,0.08)' },
  catalogueItemName: { fontFamily: fonts.bodyMedium, fontSize: 11, color: theme.textPrimary },
  catalogueItemNameSelected: { color: theme.accentGreen },
  catalogueItemKey: { fontFamily: fonts.body, fontSize: 9, color: theme.textFaint, marginTop: 2 },
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
  qualityBox: { width: '100%', marginBottom: spacing.md },
  qualityText: {
    width: '100%', textAlign: 'center', fontFamily: fonts.body,
    fontSize: 11, lineHeight: 16, color: theme.textMuted,
  },
  qualityIssue: { width: '100%', textAlign: 'center', fontFamily: fonts.body, fontSize: 10, lineHeight: 15, color: theme.textFaint },
  qualityMore: { width: '100%', textAlign: 'center', fontFamily: fonts.bodyMedium, fontSize: 11, lineHeight: 18, color: theme.accentBlue },

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
  tableRowOn: { backgroundColor: '#DBEAFE' },
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
