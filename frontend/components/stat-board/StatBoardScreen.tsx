import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';

import AppNavMenu from '@/components/layout/AppNavMenu';
import AppShell from '@/components/shared/AppShell';
import FilterDropdown from '@/components/shared/FilterDropdown';
import IncludedGamesList from '@/components/shared/IncludedGamesList';
import PageControls, { PAGE_SIZE } from '@/components/shared/PageControls';
import StickyBack from '@/components/shared/StickyBack';
import { useCatalogueTables } from '@/hooks/useCatalogueTables';
import { fonts, spacing, theme } from '@/styles/theme';
import type { TeamStatRow } from '@/types/data';
import { rowGames } from '@/utils/countedGames';
import { complianceColor } from '@/utils/compliance';
import {
  BOARD_LIMIT,
  FT_COLUMNS,
  FT_GROUPS,
  HALF_COLUMNS,
  MINIMUMS,
  ORDINARY_COLUMNS,
  PERIODS,
  SCOPES,
  formatStat,
  explainBoard,
  formatTiming,
  rankRows,
  sampleKeyFor,
  type BoardColumn,
} from '@/utils/statBoard';
import type { TeamTiming } from '@/utils/standingsAnalytics';

type Mode = 'ordinary' | 'ft';

const BLANK_TIMING = [
  'Scored first',
  'Handicap',
  'Early 20',
  '1H 35',
  'Early 60',
  'Early conceded',
  '2H 75',
];

const MEASURED_TIMING: { key: 'firstGoalFor' | 'firstGoalAgainst' | 'scoredIn15' | 'concededIn15' | 'scoredAfter70' | 'concededAfter70'; label: string }[] = [
  { key: 'firstGoalFor', label: '1st goal for' },
  { key: 'firstGoalAgainst', label: '1st goal against' },
  { key: 'scoredIn15', label: 'Goals in 15' },
  { key: 'concededIn15', label: 'Conc. in 15' },
  { key: 'scoredAfter70', label: 'After 70' },
  { key: 'concededAfter70', label: 'Conc. after 70' },
];

export default function StatBoardScreen({
  mode,
  title,
  kicker,
  blurb,
  onBack,
}: {
  mode: Mode;
  title: string;
  kicker: string;
  blurb: string;
  onBack: () => void;
}) {
  const narrow = useWindowDimensions().width < 720;
  const [competitionId, setCompetitionId] = useState<number | null>(null);
  const [scope, setScope] = useState('overall');
  const [period, setPeriod] = useState('ft');
  const [group, setGroup] = useState('ft');
  const [minimum, setMinimum] = useState('5');
  const [query, setQuery] = useState('');
  const [openTeam, setOpenTeam] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const board = useCatalogueTables(competitionId);

  const activePeriod = mode === 'ordinary' ? period : group;
  const columns = mode === 'ordinary' ? ORDINARY_COLUMNS : activePeriod === 'ft' ? FT_COLUMNS : HALF_COLUMNS;
  const [stat, setStat] = useState(columns[0].key);
  const rankedStat = columns.some((column) => column.key === stat) ? stat : columns[0].key;
  const tableName = `${mode === 'ordinary' ? 'ordinary' : 'ft_only'}_${activePeriod}_${scope}`;
  const showTiming = mode === 'ordinary' && activePeriod === 'ft' && competitionId != null;
  const showLeague = competitionId == null;
  const countedKey = sampleKeyFor(rankedStat, mode);

  const rows = useMemo(() => {
    const source = board.tables?.[tableName] ?? [];
    const ranked = rankRows(source, rankedStat, Number(minimum), countedKey);
    const needle = query.trim().toLowerCase();
    if (!needle) return ranked;
    return ranked.filter((row) => row.team_name.toLowerCase().includes(needle));
  }, [board.tables, tableName, rankedStat, countedKey, minimum, mode, query]);

  const leagueName = useMemo(() => {
    const names = new Map(board.catalog.map((comp) => [String(comp.id), comp.name]));
    return (id: string) => names.get(id) ?? id;
  }, [board.catalog]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const visibleRows = rows.slice(pageStart, pageStart + PAGE_SIZE);
  const openRow = rows.find((row) => `${row.league_id}::${row.team_name}` === openTeam) ?? null;

  useEffect(() => {
    setPage(1);
    setOpenTeam(null);
  }, [tableName, rankedStat, minimum, query, scope, competitionId, activePeriod]);

  const competitionOptions = [
    { value: '', label: 'All loaded leagues' },
    ...board.catalog.map((comp) => ({ value: String(comp.id), label: comp.name })),
  ];

  return (
    <AppShell>
      <ScrollView
        contentContainerStyle={[styles.scroll, narrow && styles.scrollNarrow]}
        showsVerticalScrollIndicator={Platform.OS === 'web'}>
        <StickyBack label="← HOME" onPress={onBack} trailing={<AppNavMenu />} />
        <View style={styles.hero}>
          <Text style={styles.kicker}>{kicker}</Text>
          <Text style={[styles.title, narrow && styles.titleNarrow]}>{title}</Text>
          <Text style={styles.blurb}>{blurb}</Text>
        </View>

        <View style={styles.filters}>
          <FilterDropdown
            label="Competition"
            value={competitionId == null ? '' : String(competitionId)}
            options={competitionOptions}
            emptyLabel={board.loading ? 'Loading…' : board.error ? 'Couldn’t load' : 'All loaded leagues'}
            onChange={(value) => setCompetitionId(value ? Number(value) : null)}
            style={styles.filter}
          />
          <FilterDropdown
            label="Scope"
            value={scope}
            options={SCOPES.map((item) => ({ value: item.value, label: item.label }))}
            onChange={setScope}
            style={styles.filter}
          />
          {mode === 'ordinary' ? (
            <FilterDropdown
              label="Period"
              value={period}
              options={PERIODS.map((item) => ({ value: item.value, label: item.label }))}
              onChange={setPeriod}
              style={styles.filter}
            />
          ) : null}
          <FilterDropdown
            label="Rank by"
            value={rankedStat}
            options={columns.map((column) => ({ value: column.key, label: column.label }))}
            onChange={setStat}
            style={styles.filter}
          />
          <FilterDropdown
            label="Minimum games"
            value={minimum}
            options={MINIMUMS}
            onChange={setMinimum}
            style={styles.filter}
          />
          <View style={[styles.searchField, narrow && styles.searchNarrow]}>
            <Text style={styles.searchLabel}>Team</Text>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search teams"
              placeholderTextColor={theme.textFaint}
              style={styles.search}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        </View>

        {mode === 'ft' ? (
          <View style={styles.groups}>
            {FT_GROUPS.map((item) => {
              const active = group === item.value;
              return (
                <Pressable
                  key={item.value}
                  onPress={() => setGroup(item.value)}
                  style={[styles.group, active && styles.groupOn, narrow && styles.groupNarrow]}>
                  <Text style={[styles.groupText, active && styles.groupTextOn]}>{item.label}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        <FilterStory
          notes={explainBoard({
            mode,
            statKey: rankedStat,
            statLabel: columns.find((column) => column.key === rankedStat)?.label ?? rankedStat,
            period: activePeriod,
            scope,
            competitionName: competitionId == null ? null : leagueName(String(competitionId)),
            minimum: Number(minimum),
            query,
            loading: board.loading && rows.length === 0,
            error: board.error,
            shown: rows.length,
            capped: competitionId == null && board.capped,
            loadedLeagues: board.loadedLeagues,
          })}
        />

        <Status
          loading={board.loading && rows.length === 0}
          error={board.error}
          empty={!board.loading && !board.error && rows.length === 0}
          capped={competitionId == null && board.capped}
          loadedLeagues={board.loadedLeagues}
        />

        {openRow ? (
          <IncludedGamesList
            title={`${openRow.team_name} · games in this filter`}
            onClose={() => setOpenTeam(null)}
            games={rowGames(openRow).filter((game) => {
              if (rankedStat === 'rescued_points') return game.trailed === true;
              if (rankedStat === 'blown_points') return game.led === true;
              if (countedKey === 'sample_size') return true;
              return game.halfValid ?? game.htKnown;
            })}
          />
        ) : null}

        {rows.length > 0 ? (
          <>
            <PageControls
              page={safePage}
              pages={pages}
              total={rows.length}
              from={pageStart + 1}
              to={pageStart + visibleRows.length}
              onChange={setPage}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator>
              <View>
                <View style={styles.headRow}>
                  <Text style={[styles.cell, styles.rank]}>#</Text>
                  <Text style={[styles.cell, styles.team, styles.head]}>Team</Text>
                  {showLeague ? <Text style={[styles.cell, styles.league, styles.head]}>League</Text> : null}
                  <Text style={[styles.cell, styles.games, styles.head]}>G</Text>
                  {columns.map((column) => (
                    <Text
                      key={column.key}
                      style={[styles.cell, styles.stat, styles.head, column.key === rankedStat && styles.rankedHead]}>
                      {column.label}
                    </Text>
                  ))}
                  {mode === 'ordinary' ? (
                    <>
                      {MEASURED_TIMING.map((column) => (
                        <Text key={column.key} style={[styles.cell, styles.stat, styles.head]}>{column.label}</Text>
                      ))}
                      {BLANK_TIMING.map((label) => (
                        <Text key={label} style={[styles.cell, styles.stat, styles.head]}>{label}</Text>
                      ))}
                    </>
                  ) : null}
                </View>
                {visibleRows.map((row, index) => {
                  const key = `${row.league_id}::${row.team_name}`;
                  return (
                    <BoardRow
                      key={key}
                      row={row}
                      index={pageStart + index}
                      selected={openTeam === key}
                      onPress={() => setOpenTeam((current) => (current === key ? null : key))}
                      columns={columns}
                      rankedStat={rankedStat}
                      league={showLeague ? leagueName(String(row.league_id)) : null}
                      timing={showTiming ? board.timing?.get(row.team_name) : undefined}
                      showTiming={showTiming}
                      sampleKey={countedKey}
                      ordinary={mode === 'ordinary'}
                    />
                  );
                })}
              </View>
            </ScrollView>
            <PageControls
              page={safePage}
              pages={pages}
              total={rows.length}
              from={pageStart + 1}
              to={pageStart + visibleRows.length}
              onChange={setPage}
            />
          </>
        ) : null}

        <Text style={styles.foot}>
          Tap a team to see the games in this filter, then open a match. Top {BOARD_LIMIT}, highest first.
          {mode === 'ft'
            ? ' Rescued and blown points are averages, not percentages. Matches with no half-time score stay out of both-halves and HT/FT rates.'
            : ' Timing shows only minutes the season feed already records, and only for a full-time view of one competition.'}
        </Text>
      </ScrollView>
    </AppShell>
  );
}

function BoardRow({
  row,
  index,
  selected,
  onPress,
  columns,
  rankedStat,
  league,
  timing,
  showTiming,
  sampleKey,
  ordinary,
}: {
  row: TeamStatRow;
  index: number;
  selected: boolean;
  onPress: () => void;
  columns: BoardColumn[];
  rankedStat: string;
  league: string | null;
  timing: TeamTiming | undefined;
  showTiming: boolean;
  sampleKey: 'sample_size' | 'ht_sample' | 'rescued_n' | 'blown_n';
  ordinary: boolean;
}) {
  const games = row[sampleKey];
  return (
    <Pressable onPress={onPress} style={[styles.headRow, index % 2 === 1 && styles.zebra, selected && styles.selectedRow]}>
      <Text style={[styles.cell, styles.rank]}>{index + 1}</Text>
      <Text style={[styles.cell, styles.team]} numberOfLines={1}>{row.team_name}</Text>
      {league != null ? <Text style={[styles.cell, styles.league]} numberOfLines={1}>{league}</Text> : null}
      <Text style={[styles.cell, styles.games]}>{typeof games === 'number' ? games : '—'}</Text>
      {columns.map((column) => {
        const signal = row[`${column.key}_signal`];
        const colour =
          signal === 'green' || signal === 'yellow' || signal === 'red' ? complianceColor(signal) : theme.textPrimary;
        return (
          <Text key={column.key} style={[styles.cell, styles.stat, { color: colour }, column.key === rankedStat && styles.ranked]}>
            {formatStat(row, column)}
          </Text>
        );
      })}
      {ordinary ? (
        <>
          {MEASURED_TIMING.map((column) => (
            <Text key={column.key} style={[styles.cell, styles.stat]}>
              {formatTiming(timing, column.key, showTiming)}
            </Text>
          ))}
          {BLANK_TIMING.map((label) => (
            <Text key={label} style={[styles.cell, styles.stat]}>—</Text>
          ))}
        </>
      ) : null}
    </Pressable>
  );
}

function FilterStory({ notes }: { notes: { label: string; choice: string; detail: string }[] }) {
  const [selected, setSelected] = useState(notes[0]?.label ?? '');
  const current = notes.find((note) => note.label === selected) ?? notes[0];
  if (!current) return null;
  return (
    <View style={styles.story}>
      <FilterDropdown
        label="What this filter is doing"
        value={current.label}
        options={notes.map((note) => ({
          value: note.label,
          label: `${note.label}: ${note.choice}`,
        }))}
        onChange={setSelected}
        style={styles.storyDrop}
      />
      <Text style={styles.storyDetail}>{current.detail}</Text>
    </View>
  );
}

function Status({
  loading,
  error,
  empty,
  capped,
  loadedLeagues,
}: {
  loading: boolean;
  error: string | null;
  empty: boolean;
  capped: boolean;
  loadedLeagues: number;
}) {
  if (loading) {
    return (
      <View style={styles.status}>
        <ActivityIndicator color={theme.accentBlue} />
        <Text style={styles.statusText}>Loading finished results…</Text>
      </View>
    );
  }
  if (error) return null;
  if (empty) {
    return (
      <View style={styles.status}>
        <Text style={styles.statusText}>No finished results yet for these filters.</Text>
      </View>
    );
  }
  if (capped) {
    return <Text style={styles.note}>Ranking the {loadedLeagues} busiest leagues loaded for this board.</Text>;
  }
  return null;
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    width: '100%',
  },
  scrollNarrow: {
    paddingHorizontal: spacing.md,
  },
  hero: {
    marginBottom: spacing.lg,
    gap: spacing.xs,
  },
  kicker: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    letterSpacing: 1,
    color: theme.textMuted,
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 32,
    color: theme.textPrimary,
  },
  titleNarrow: {
    fontSize: 26,
  },
  blurb: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: theme.textMuted,
    maxWidth: 680,
  },
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  filter: {
    minWidth: 160,
  },
  searchField: {
    minWidth: 180,
    gap: 4,
  },
  searchNarrow: {
    width: '100%',
  },
  searchLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    color: theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  search: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    fontFamily: fonts.body,
    fontSize: 16,
    color: theme.textPrimary,
    backgroundColor: theme.surface,
  },
  groups: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  group: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupNarrow: {
    flexGrow: 1,
  },
  groupOn: {
    backgroundColor: theme.textPrimary,
    borderColor: theme.textPrimary,
  },
  groupText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: theme.textPrimary,
  },
  groupTextOn: {
    color: theme.surface,
  },
  story: {
    marginBottom: spacing.md,
    gap: spacing.sm,
    maxWidth: 720,
  },
  storyDrop: {
    width: '100%',
    maxWidth: 720,
  },
  storyDetail: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: theme.textMuted,
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  statusText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: theme.textMuted,
    flexShrink: 1,
  },
  note: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textMuted,
    marginBottom: spacing.sm,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    backgroundColor: theme.surface,
  },
  zebra: {
    backgroundColor: theme.surfaceHover,
  },
  selectedRow: {
    backgroundColor: '#DBEAFE',
  },
  cell: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: theme.textPrimary,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  head: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    color: theme.textMuted,
    textTransform: 'uppercase',
  },
  rank: { width: 36 },
  team: { width: 160 },
  league: { width: 140 },
  games: { width: 40, textAlign: 'right' },
  stat: { width: 108, textAlign: 'right' },
  rankedHead: { color: theme.accentBlue },
  ranked: { fontFamily: fonts.bodySemiBold },
  foot: {
    marginTop: spacing.md,
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textMuted,
    maxWidth: 720,
  },
});
