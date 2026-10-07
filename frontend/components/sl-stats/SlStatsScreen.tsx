import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import FootyTable, { type FootyColumn } from '@/components/analytics/FootyTable';
import AppNavBar from '@/components/layout/AppNavBar';
import AppShell from '@/components/shared/AppShell';
import DragScroll from '@/components/shared/DragScroll';
import IncludedGamesList from '@/components/shared/IncludedGamesList';
import PageControls from '@/components/shared/PageControls';
import FilterDropdown from '@/components/shared/FilterDropdown';
import { useSlStats } from '@/hooks/useSlStats';
import type { CountedGame } from '@/utils/countedGames';
import {
  CORNER_OVER_LINES,
  GOAL_LINES,
  OFFSIDE_OVER_LINES,
  buildFootyIndex,
  filterFixtures,
  listedGamesForTeam,
  perGame,
  rankBttsSplit,
  rankBttsTeams,
  rankBothHalves,
  rankCleanSheets,
  rankGoalLineTeams,
  rankHalfBtts,
  rankHalfGoals,
  rankLeagues,
  rankScorelines,
  rankWdw,
  upcomingBtts,
  upcomingGoalLine,
  type BothHalvesMode,
  type BttsSplit,
  type CleanSheetDirection,
  type CompetitionKind,
  type GoalLine,
  type GoalSide,
  type HalfSide,
  type LeagueSort,
  type FootyFixture,
  type FootyIndex,
  type Scope,
} from '@/services/footyMarketStats';
import {
  BOARD_FLOORS,
  ORDINARY_PICKS,
  TOP_BOARD,
  bestBetsForFixtures,
  bestBetForFixture,
  combineMatchQuery,
  ordinaryMatches,
  rankCornerLeagues,
  rankCornerMatches,
  rankLeagueAverages,
  rankLeakyFixtures,
  rankOrdinaryTeams,
  rankSecondHalfFixtures,
  rankSeriesTeams,
  rankTopBoard,
  seriesMatches,
  seriesPicks,
  type BestBet,
  type BoardEntity,
  type BoardMeasure,
  type BoardRow,
} from '@/services/slStats';
import { fonts, layout, spacing, theme } from '@/styles/theme';

type AnalysisId =
  | 'btts'
  | 'goals'
  | 'wdw'
  | 'halves'
  | 'filters'
  | 'both'
  | 'clean'
  | 'score'
  | 'corners'
  | 'cards'
  | 'offsides'
  | 'series'
  | 'ordinary'
  | 'league';

const ANALYSES: { value: AnalysisId; label: string; blurb: string }[] = [
  { value: 'btts', label: 'Both teams to score', blurb: 'How often both sides score, then the upcoming matches in that filter.' },
  { value: 'goals', label: 'Over and under goals', blurb: 'Share of matches over or under a goal line.' },
  { value: 'wdw', label: 'Win, draw and loss', blurb: 'Win, draw and loss rates, with the best bet on each upcoming match.' },
  { value: 'halves', label: 'First half and second half goals', blurb: 'Goals scored in one half. Only matches with a half-time score count.' },
  { value: 'filters', label: 'Quick filters', blurb: 'Leaky Leaky and Second Half Delight, from the matches already loaded on this page.' },
  { value: 'both', label: 'Scored in both halves', blurb: 'A side scores before the break and again after it.' },
  { value: 'clean', label: 'Clean sheets', blurb: 'Matches with no goal conceded. A team needs at least 7 matches.' },
  { value: 'score', label: 'Correct score', blurb: 'The full-time scorelines that have come up most often.' },
  { value: 'corners', label: 'Corners', blurb: 'Corners from the same match stats as the match summary.' },
  { value: 'cards', label: 'Yellow and red cards', blurb: 'Team bookings from the match summary. Player names are not in this feed.' },
  { value: 'offsides', label: 'Offsides', blurb: 'Offsides from the same match stats as the match summary.' },
  { value: 'series', label: 'Series', blurb: 'The current run of a stat. A series starts at 3 games.' },
  { value: 'ordinary', label: 'Ordinary stats', blurb: 'Season rates such as scoring percentage, clean sheet, and over 2.5 goals.' },
  { value: 'league', label: 'League average', blurb: 'The league average of an ordinary stat, from the same calculator as the stats tables.' },
];

const KINDS: { value: CompetitionKind; label: string }[] = [
  { value: 'domestic', label: 'Domestic leagues' },
  { value: 'cup', label: 'Cups' },
  { value: 'all', label: 'All competitions' },
];

const SCOPES: { value: Scope; label: string }[] = [
  { value: 'overall', label: 'Overall' },
  { value: 'home', label: 'Home' },
  { value: 'away', label: 'Away' },
];

const BTTS_RESULTS: { value: '' | BttsSplit; label: string }[] = [
  { value: '', label: 'Both teams to score' },
  { value: 'win', label: 'Both teams to score and win' },
  { value: 'draw', label: 'Both teams to score and draw' },
  { value: 'loss', label: 'Both teams to score and lose' },
];

const QUICK_SYSTEMS: { value: 'leaky' | 'second'; label: string }[] = [
  { value: 'leaky', label: 'Leaky Leaky' },
  { value: 'second', label: 'Second Half Delight' },
];

const HALF_CHOICES: { value: '' | HalfSide; label: string }[] = [
  { value: '', label: 'Full match' },
  { value: 'first', label: '1st half' },
  { value: 'second', label: '2nd half' },
];

const GOAL_SIDES: { value: GoalSide; label: string }[] = [
  { value: 'over', label: 'Over' },
  { value: 'under', label: 'Under' },
];

const BOTH_MODES: { value: BothHalvesMode; label: string }[] = [
  { value: 'team', label: 'Team scored in both halves' },
  { value: 'btts', label: 'Both teams scored in both halves' },
];

const CLEAN_DIRS: { value: CleanSheetDirection; label: string }[] = [
  { value: 'most', label: 'Most clean sheets' },
  { value: 'least', label: 'Least clean sheets' },
];

const CARD_KINDS: { value: 'yellow' | 'red'; label: string }[] = [
  { value: 'yellow', label: 'Yellow cards' },
  { value: 'red', label: 'Red cards' },
];

const LEAGUE_SORTS: { value: LeagueSort; label: string }[] = [
  { value: 'pct', label: 'Percentage' },
  { value: 'goals', label: 'Total goals scored' },
  { value: 'avg', label: 'Average goals per match' },
  { value: 'progress', label: 'Season progress' },
];

const QUERY_PAGE = 6;
const BOARD_PAGE = 20;

const BOARD_ENTITIES: { value: BoardEntity; label: string }[] = [
  { value: 'teams', label: 'Teams' },
  { value: 'leagues', label: 'Leagues' },
  { value: 'competitions', label: 'Competitions' },
];

const BOARD_MEASURES: { value: BoardMeasure; label: string }[] = [
  { value: 'series', label: 'Current series' },
  { value: 'ordinary', label: 'Ordinary rate' },
];

const BOARD_POOLS = [
  { value: '30', label: '30 most active' },
  { value: '200', label: '200 most active' },
];

function useNarrow(): boolean {
  const { width } = useWindowDimensions();
  return width < 720;
}

function kickoff(unix: number): string {
  return new Date(unix * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function pct(n: number): string {
  return `${n.toFixed(1)}%`;
}

function Block({ title, note, children, dropdown = false }: { title: string; note: string; children: ReactNode; dropdown?: boolean }) {
  const [open, setOpen] = useState(false);
  if (!dropdown) {
    return (
      <View style={styles.block}>
        <Text style={styles.blockTitle}>{title}</Text>
        <Text style={styles.note}>{note}</Text>
        {children}
      </View>
    );
  }
  return (
    <View style={styles.disclosure}>
      <Pressable onPress={() => setOpen((value) => !value)} style={styles.disclosureHead}>
        <View style={styles.disclosureCopy}>
          <Text style={styles.disclosureTitle}>{title}</Text>
          <Text style={styles.disclosureNote} numberOfLines={open ? undefined : 1}>{note}</Text>
        </View>
        <Text style={styles.chevron}>{open ? '▾' : '▸'}</Text>
      </Pressable>
      {open ? <View style={styles.disclosureBody}>{children}</View> : null}
    </View>
  );
}

function BestBetLine({ bet }: { bet: BestBet | null }) {
  if (!bet) return <Text style={styles.note}>No qualifying recommendation.</Text>;
  return (
    <View style={styles.bet}>
      <Text style={styles.betKicker}>⚡ BEST BET</Text>
      <View style={styles.betRow}>
        <View style={styles.betText}>
          <Text style={styles.betMarket}>{bet.market}</Text>
          <Text style={styles.betSelection} numberOfLines={2}>
            {bet.selection}
          </Text>
        </View>
        <Text style={styles.betPct}>{Math.round(bet.probability * 100)}%</Text>
      </View>
    </View>
  );
}

export default function SlStatsScreen({ onBack: _onBack }: { onBack: () => void }) {
  const narrow = useNarrow();
  const [analysis, setAnalysis] = useState<AnalysisId>('corners');
  const [country, setCountry] = useState('');
  const [leagueId, setLeagueId] = useState('');
  const [kind, setKind] = useState<CompetitionKind>('domestic');
  const [scope, setScope] = useState<Scope>('overall');
  const [bttsResult, setBttsResult] = useState<'' | BttsSplit>('');
  const [half, setHalf] = useState<'' | HalfSide>('');
  const [quickSystem, setQuickSystem] = useState<'leaky' | 'second'>('leaky');
  const [goalLine, setGoalLine] = useState<GoalLine>(2.5);
  const [goalSide, setGoalSide] = useState<GoalSide>('over');
  const [bothMode, setBothMode] = useState<BothHalvesMode>('team');
  const [cleanDir, setCleanDir] = useState<CleanSheetDirection>('most');
  const [cornerLine, setCornerLine] = useState<(typeof CORNER_OVER_LINES)[number]>(CORNER_OVER_LINES[1]);
  const [offsideLine, setOffsideLine] = useState<(typeof OFFSIDE_OVER_LINES)[number]>(OFFSIDE_OVER_LINES[1]);
  const [cardKind, setCardKind] = useState<'yellow' | 'red'>('yellow');
  const [leagueSort, setLeagueSort] = useState<LeagueSort>('pct');
  const seriesOptions = useMemo(() => seriesPicks(), []);
  const [seriesKey, setSeriesKey] = useState('');
  const [queryPage, setQueryPage] = useState(1);
  const scrollRef = useRef<ScrollView>(null);
  const [statKey, setStatKey] = useState('sc_pct');
  const [boardEntity, setBoardEntity] = useState<BoardEntity>('teams');
  const [boardMeasure, setBoardMeasure] = useState<BoardMeasure>('series');
  const [boardMinimum, setBoardMinimum] = useState(0);
  const [boardPool, setBoardPool] = useState<'30' | '200'>('30');

  const live = useSlStats({
    country: country || null,
    competitionId: leagueId ? Number(leagueId) : null,
    kind,
    leagueCap: Number(boardPool),
  });

  useEffect(() => {
    if (!leagueId) return;
    const stillThere = live.catalog.some((comp) => String(comp.id) === leagueId);
    if (!stillThere) setLeagueId('');
  }, [live.catalog, leagueId, country, kind]);

  const countries = useMemo(() => {
    const names = [...new Set(live.catalog.map((comp) => comp.country).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    return [{ value: '', label: 'All countries' }, ...names.map((name) => ({ value: name, label: name }))];
  }, [live.catalog]);

  const leagues = useMemo(() => {
    const rows = live.catalog.filter((comp) => {
      if (country && comp.country !== country) return false;
      if (kind === 'domestic' && comp.isCup) return false;
      if (kind === 'cup' && !comp.isCup) return false;
      return true;
    });
    rows.sort((a, b) => a.country.localeCompare(b.country) || a.name.localeCompare(b.name));
    return [{ value: '', label: 'All leagues' }, ...rows.map((comp) => ({ value: String(comp.id), label: `${comp.name} · ${comp.country}` }))];
  }, [live.catalog, country, kind]);

  const query = useMemo(
    () => ({ country: country || null, competitionId: leagueId ? Number(leagueId) : null, kind, scope }),
    [country, leagueId, kind, scope],
  );
  const index = useMemo(() => buildFootyIndex(live.finished, query), [live.finished, query]);
  const upcoming = useMemo(
    () => filterFixtures(live.upcoming, query).filter((fx) => !fx.finished && fx.progress != null && fx.progress >= 25),
    [live.upcoming, query],
  );
  const statLabel = ORDINARY_PICKS.find((item) => item.key === statKey)?.label ?? 'Scoring percentage';
  const seriesLabel = seriesOptions.find((item) => item.key === seriesKey)?.label ?? 'Win';
  const boardSeriesKey = seriesKey || 'w';
  const boardSeriesLabel = seriesOptions.find((item) => item.key === boardSeriesKey)?.label ?? 'Win';
  const boardRows = useMemo(
    () =>
      rankTopBoard(live.finished, {
        entity: boardEntity,
        measure: boardMeasure,
        statKey,
        seriesKey: boardSeriesKey,
        scope,
        minimum: boardMinimum,
        limit: TOP_BOARD,
      }),
    [live.finished, boardEntity, boardMeasure, statKey, boardSeriesKey, scope, boardMinimum],
  );
  const boardSentence = boardCopy(boardEntity, boardMeasure, boardMeasure === 'series' ? boardSeriesLabel : statLabel, boardMinimum, !seriesKey && boardMeasure === 'series');

  const combined = useMemo(
    () => combineMatchQuery(live.finished, upcoming, { scope, statKey, statLabel, seriesKey, seriesLabel }),
    [live.finished, upcoming, scope, statKey, statLabel, seriesKey, seriesLabel],
  );
  const queryPages = Math.max(1, Math.ceil(combined.length / QUERY_PAGE));
  const safeQueryPage = Math.min(queryPage, queryPages);
  const queryRows = combined.slice((safeQueryPage - 1) * QUERY_PAGE, safeQueryPage * QUERY_PAGE);
  const bets = useMemo(() => {
    const wanted = new Set(queryRows.map((row) => row.id));
    return bestBetsForFixtures(
      upcoming.filter((fx) => wanted.has(fx.id)),
      live.finished,
    );
  }, [combined, safeQueryPage, upcoming, live.finished]);

  useEffect(() => {
    setQueryPage(1);
  }, [country, leagueId, kind, scope, statKey, seriesKey]);

  const showQueryPage = (next: number) => {
    setQueryPage(next);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  return (
    <AppShell>
      <AppNavBar />
      <DragScroll scrollRef={scrollRef} contentContainerStyle={[styles.scroll, narrow && styles.scrollNarrow]}>
        <View style={[styles.hero, narrow && styles.heroNarrow]}>
          <View style={styles.heroCopy}>
            <Text style={styles.heroKicker}>Query</Text>
            <Text style={[styles.title, narrow && styles.titleNarrow]}>SL-STATS</Text>
            <Text style={styles.blurb}>
              Filters pull an ordinary stat, the league average, and a series, then combine them. Top 200 ranks teams, leagues, or competitions by a current series or by any ordinary rate.
            </Text>
          </View>
          <View style={[styles.heroStat, narrow && styles.heroStatNarrow]}>
            <Text style={[styles.heroNum, narrow && styles.heroNumNarrow]}>{combined.length}</Text>
            <Text style={styles.heroLabel}>matches ranked</Text>
          </View>
        </View>
        <Text style={styles.sample}>
          {live.capped ? `Showing the ${live.loadedLeagues} most active leagues. ` : `${live.loadedLeagues} leagues loaded. `}
          {index.matches} finished matches in this filter.
        </Text>

        <View style={[styles.filters, narrow && styles.filtersNarrow]}>
          <FilterDropdown style={narrow ? styles.filterFull : undefined} label="Analysis" value={analysis} options={ANALYSES.map((item) => ({ value: item.value, label: item.label }))} onChange={(value) => setAnalysis(value as AnalysisId)} />
          <FilterDropdown style={narrow ? styles.filterFull : undefined} label="Country" value={country} options={countries} onChange={setCountry} />
          <FilterDropdown style={narrow ? styles.filterFull : undefined} label="League" value={leagueId} options={leagues} onChange={setLeagueId} />
          <FilterDropdown style={narrow ? styles.filterFull : undefined} label="Competitions" value={kind} options={KINDS} onChange={(value) => setKind(value as CompetitionKind)} />
          <FilterDropdown style={narrow ? styles.filterFull : undefined} label="Scope" value={scope} options={SCOPES} onChange={(value) => setScope(value as Scope)} />
          <FilterDropdown style={narrow ? styles.filterFull : undefined} label="Ordinary stat" value={statKey} options={ORDINARY_PICKS.map((item) => ({ value: item.key, label: item.label }))} onChange={setStatKey} />
          <FilterDropdown style={narrow ? styles.filterFull : undefined} label="Series" value={seriesKey} options={[{ value: '', label: 'No series' }, ...seriesOptions.map((item) => ({ value: item.key, label: item.label }))]} onChange={setSeriesKey} />
          <FilterDropdown style={narrow ? styles.filterFull : undefined} label="Rank" value={boardEntity} options={BOARD_ENTITIES} onChange={(value) => setBoardEntity(value as BoardEntity)} />
          <FilterDropdown style={narrow ? styles.filterFull : undefined} label="Measured by" value={boardMeasure} options={BOARD_MEASURES} onChange={(value) => setBoardMeasure(value as BoardMeasure)} />
          <FilterDropdown style={narrow ? styles.filterFull : undefined} label="At least" value={String(boardMinimum)} options={[{ value: '0', label: 'Best 200' }, ...BOARD_FLOORS.map((item) => ({ value: String(item), label: `${item} or more games` }))]} onChange={(value) => setBoardMinimum(Number(value))} />
          <FilterDropdown style={narrow ? styles.filterFull : undefined} label="Sample" value={boardPool} options={BOARD_POOLS} onChange={(value) => setBoardPool(value as '30' | '200')} />

          {analysis === 'btts' ? (
            <>
              <FilterDropdown style={narrow ? styles.filterFull : undefined} label="Both teams to score result" value={bttsResult} options={BTTS_RESULTS} onChange={(value) => setBttsResult(value as '' | BttsSplit)} />
              <FilterDropdown style={narrow ? styles.filterFull : undefined} label="Half" value={half} options={HALF_CHOICES} onChange={(value) => setHalf(value as '' | HalfSide)} />
              <FilterDropdown style={narrow ? styles.filterFull : undefined} label="League sort" value={leagueSort} options={LEAGUE_SORTS} onChange={(value) => setLeagueSort(value as LeagueSort)} />
            </>
          ) : null}
          {analysis === 'goals' ? (
            <>
              <FilterDropdown style={narrow ? styles.filterFull : undefined} label="Goal line" value={String(goalLine)} options={GOAL_LINES.map((item) => ({ value: String(item), label: `${item} goals` }))} onChange={(value) => setGoalLine(Number(value) as GoalLine)} />
              <FilterDropdown style={narrow ? styles.filterFull : undefined} label="Over or under" value={goalSide} options={GOAL_SIDES} onChange={(value) => setGoalSide(value as GoalSide)} />
              <FilterDropdown style={narrow ? styles.filterFull : undefined} label="League sort" value={leagueSort} options={LEAGUE_SORTS} onChange={(value) => setLeagueSort(value as LeagueSort)} />
            </>
          ) : null}
          {analysis === 'halves' ? (
            <FilterDropdown style={narrow ? styles.filterFull : undefined} label="Half" value={half || 'first'} options={HALF_CHOICES.filter((item) => item.value !== '')} onChange={(value) => setHalf(value as HalfSide)} />
          ) : null}
          {analysis === 'filters' ? (
            <FilterDropdown style={narrow ? styles.filterFull : undefined} label="System" value={quickSystem} options={QUICK_SYSTEMS} onChange={(value) => setQuickSystem(value as 'leaky' | 'second')} />
          ) : null}
          {analysis === 'both' ? (
            <FilterDropdown style={narrow ? styles.filterFull : undefined} label="Both halves" value={bothMode} options={BOTH_MODES} onChange={(value) => setBothMode(value as BothHalvesMode)} />
          ) : null}
          {analysis === 'clean' ? (
            <FilterDropdown style={narrow ? styles.filterFull : undefined} label="Clean sheet table" value={cleanDir} options={CLEAN_DIRS} onChange={(value) => setCleanDir(value as CleanSheetDirection)} />
          ) : null}
          {analysis === 'corners' ? (
            <FilterDropdown style={narrow ? styles.filterFull : undefined} label="Corner line" value={cornerLine} options={CORNER_OVER_LINES.map((item) => ({ value: item, label: `Over ${item} corners` }))} onChange={(value) => setCornerLine(value as (typeof CORNER_OVER_LINES)[number])} />
          ) : null}
          {analysis === 'cards' ? (
            <FilterDropdown style={narrow ? styles.filterFull : undefined} label="Card type" value={cardKind} options={CARD_KINDS} onChange={(value) => setCardKind(value as 'yellow' | 'red')} />
          ) : null}
          {analysis === 'offsides' ? (
            <FilterDropdown style={narrow ? styles.filterFull : undefined} label="Offside line" value={offsideLine} options={OFFSIDE_OVER_LINES.map((item) => ({ value: item, label: `Over ${item} offsides` }))} onChange={(value) => setOffsideLine(value as (typeof OFFSIDE_OVER_LINES)[number])} />
          ) : null}
        </View>

        {live.loading ? <ActivityIndicator color={theme.accentGreen} /> : null}
        {live.error ? <Text style={styles.error}>{live.error}</Text> : null}

        {!live.loading ? (
          <>
            <TopBoard
              key={`${boardEntity}-${boardMeasure}-${boardMinimum}-${statKey}-${boardSeriesKey}-${scope}-${country}-${leagueId}-${kind}`}
              rows={boardRows}
              entity={boardEntity}
              measure={boardMeasure}
              minimum={boardMinimum}
              sentence={boardSentence}
              empty={boardEmpty(boardEntity, boardMeasure, boardMeasure === 'series' ? boardSeriesLabel : statLabel, boardMinimum, kind)}
              index={index}
              scope={scope}
            />
            <QueryBoard
              rows={queryRows}
              bets={bets}
              statLabel={statLabel}
              page={safeQueryPage}
              pages={queryPages}
              total={combined.length}
              onPage={showQueryPage}
            />
            <Block dropdown title="Rankings for this analysis" note={ANALYSES.find((item) => item.value === analysis)?.blurb ?? ''}>
              <AnalysisBody
                analysis={analysis}
                index={index}
                upcoming={upcoming}
                finished={live.finished}
                scope={scope}
                query={query}
                bttsResult={bttsResult}
                half={half}
                quickSystem={quickSystem}
                competitionId={leagueId ? Number(leagueId) : null}
                goalLine={goalLine}
                goalSide={goalSide}
                bothMode={bothMode}
                cleanDir={cleanDir}
                cornerLine={cornerLine}
                offsideLine={offsideLine}
                cardKind={cardKind}
                leagueSort={leagueSort}
                seriesKey={seriesKey}
                seriesLabel={seriesLabel}
                statKey={statKey}
                statLabel={statLabel}
                discipline={live.discipline}
                statsLoading={live.statsLoading}
                bets={bets}
              />
            </Block>
          </>
        ) : null}
      </DragScroll>
    </AppShell>
  );
}

function boardCopy(entity: BoardEntity, measure: BoardMeasure, stat: string, minimum: number, assumedWin: boolean): string {
  const who = entity === 'teams' ? 'Teams' : entity === 'leagues' ? 'Domestic leagues' : 'Competitions';
  const floor = minimum > 0 ? `${minimum} or more games` : 'the best 200';
  const assumed = assumedWin ? ' No series was selected, so this uses Win.' : '';
  const pages = ' Use Previous and Next to move through the full list.';
  if (measure === 'series' && entity === 'teams') {
    return minimum > 0
      ? `${who} with a current ${stat} series of ${floor}, longest run first. Each team is listed once in each competition.${assumed}${pages}`
      : `The best 200 ${who.toLowerCase()} by the current ${stat} series, longest run first. Each team is listed once in each competition.${assumed}${pages}`;
  }
  if (measure === 'series') {
    return minimum > 0
      ? `${who} that contain a current ${stat} series of ${floor}. Ranked by the longest run, then by how many sides reach that length.${assumed}${pages}`
      : `The best 200 ${who.toLowerCase()} by the longest current ${stat} series.${assumed}${pages}`;
  }
  if (entity === 'teams') {
    return minimum > 0
      ? `${who} with ${stat} from ${floor}, ranked by the share of matches.${pages}`
      : `The best 200 ${who.toLowerCase()} by ${stat}, ranked by the share of matches.${pages}`;
  }
  return minimum > 0
    ? `${who} ranked by the average ${stat} of sides with ${floor}. The best side in each one is named beside the average.${pages}`
    : `The best 200 ${who.toLowerCase()} by the average ${stat}. The best side in each one is named beside the average.${pages}`;
}

function boardEmpty(entity: BoardEntity, measure: BoardMeasure, stat: string, minimum: number, kind: CompetitionKind): string {
  if (entity === 'leagues' && kind === 'cup') {
    return 'Leagues are domestic competitions. Switch Competitions to Domestic leagues or All competitions.';
  }
  if (measure === 'series') {
    return minimum > 0
      ? `No ${entity} have a current ${stat} series of ${minimum} or more games in this sample. Choose Best 200, or widen Sample to 200 most active.`
      : `No ${entity} have a current ${stat} series in this sample.`;
  }
  return minimum > 0
    ? `No ${entity} have ${minimum} or more games for ${stat} in this sample. Choose Best 200, or widen Sample to 200 most active.`
    : `No ${entity} have a finished match for ${stat} in this sample.`;
}

function countedFrom(detail: string): string {
  return detail.replace(/^[\d.]+%\s*(from\s+)?/i, '');
}

function joinNames(labels: string[]): string {
  if (labels.length <= 1) return labels[0] ?? '';
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

function FixtureSummary({ row, bet }: { row: ReturnType<typeof combineMatchQuery>[number]; bet: BestBet | null }) {
  const narrow = useNarrow();
  const [likelyOpen, setLikelyOpen] = useState(false);
  const [combinedOpen, setCombinedOpen] = useState(false);
  const parts = row.evidence.filter((line) => line.pct != null);
  const shown = row.combined == null ? '—' : `${Math.round(row.combined)}%`;
  const toggleBoth = () => {
    const next = !(likelyOpen && combinedOpen);
    setLikelyOpen(next);
    setCombinedOpen(next);
  };
  return (
    <View>
      <View style={[styles.queryMatch, narrow && styles.queryMatchNarrow]}>
        <Pressable onPress={toggleBoth} style={styles.queryMatchText}>
          <Text style={styles.fixtureChevron}>{likelyOpen || combinedOpen ? '▾' : '▸'}</Text>
          <View style={styles.queryMatchCopy}>
            <Text style={styles.queryKicker}>{kickoff(row.unix)} · {row.league}</Text>
            <Text style={styles.queryMatchName}>{row.match}</Text>
          </View>
        </Pressable>
        <View style={[styles.queryBadges, narrow && styles.queryBadgesNarrow]}>
          <Pressable onPress={() => setLikelyOpen((value) => !value)} style={[styles.likely, narrow && styles.badgeNarrow]}>
            <Text style={styles.likelyKicker}>Likely outcome</Text>
            <Text style={styles.likelySelection} numberOfLines={2}>{bet?.selection ?? 'No pick'}</Text>
            <Text style={styles.likelyPct}>{bet ? `${Math.round(bet.probability * 100)}%` : '—'}</Text>
          </Pressable>
          <Pressable onPress={() => setCombinedOpen((value) => !value)} style={[styles.queryCombined, narrow && styles.badgeNarrow]}>
            <Text style={styles.combinedKicker}>Combined</Text>
            <Text style={styles.queryCombinedValue}>{shown}</Text>
          </Pressable>
        </View>
      </View>
      {combinedOpen ? (
        <View>
          <Text style={styles.querySection}>How the combined percentage was reached</Text>
          <Text style={styles.formula}>
            {shown} is the average of {joinNames(parts.map((line) => line.label)) || 'no available figures'}.
          </Text>
          <Text style={styles.formula}>
            {parts.map((line, index) => (
              <Text key={line.label}>
                {index > 0 ? ' + ' : ''}
                <Text style={styles.formulaName}>{line.label}</Text>
                {' '}
                <Text style={styles.formulaPct}>{(line.pct as number).toFixed(1)}%</Text>
              </Text>
            ))}
            {parts.length > 0 ? ` ÷ ${parts.length} = ` : ''}
            {row.combined == null ? '—' : <Text style={styles.formulaPct}>{row.combined.toFixed(1)}%</Text>}
            {row.combined != null ? `, shown as ${shown}` : ''}.
          </Text>
          <View style={[styles.queryRow, styles.queryHead]}>
            <Text style={[styles.queryHeadText, styles.queryCalc]}>What was used</Text>
            <Text style={[styles.queryHeadText, styles.queryFigureCol]}>Figure</Text>
          </View>
          {row.evidence.map((line, index) => (
            <View key={line.label} style={[styles.queryRow, index % 2 === 1 && styles.queryAlt]}>
              <View style={styles.queryCalc}>
                <Text style={styles.queryLabel}>{line.label}</Text>
                <Text style={styles.queryFrom}>{countedFrom(line.detail)}</Text>
              </View>
              <Text style={[styles.queryFigure, styles.queryFigureCol]}>{line.pct == null ? '—' : `${line.pct.toFixed(1)}%`}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {likelyOpen ? (
        <View>
          <Text style={styles.querySection}>Why this is the likely outcome</Text>
          <Text style={styles.formula}>{bet ? `${bet.market}: ${bet.selection} at ${Math.round(bet.probability * 100)}%` : 'No qualifying recommendation from the finished matches in this league.'}</Text>
          {row.previous.length > 0 ? <Text style={styles.querySection}>Previous evidence</Text> : null}
          {row.previous.map((item, index) => (
            <View key={`${item.text}-${index}`} style={[styles.queryRow, index % 2 === 1 && styles.queryAlt]}>
              <Text style={[styles.queryLabel, styles.queryCalc]}>{item.text}</Text>
              <Text style={[item.hit ? styles.queryHit : styles.queryMiss, styles.queryFigureCol]}>{item.hit ? 'Hit' : 'Miss'}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Pager({
  page,
  pages,
  total,
  noun = 'matches',
  onChange,
  always = false,
  from,
  to,
}: {
  page: number;
  pages: number;
  total: number;
  noun?: string;
  onChange: (page: number) => void;
  always?: boolean;
  from?: number;
  to?: number;
}) {
  const narrow = useNarrow();
  if (!always && pages <= 1) return null;
  const range = from != null && to != null ? `Showing ${from}–${to} of ${total}` : `${total} ${noun}`;
  const label = `${range} · Page ${page} of ${pages}`;
  return (
    <View style={[styles.pager, narrow && styles.pagerNarrow]}>
      {narrow ? <Text style={styles.pageLabelNarrow}>{label}</Text> : null}
      <View style={[styles.pagerButtons, !narrow && styles.pagerButtonsWide]}>
        <Pressable style={[styles.pageBtn, narrow && styles.pageBtnGrow, page <= 1 && styles.pageBtnOff]} onPress={() => page > 1 && onChange(page - 1)}>
          <Text style={styles.pageBtnText}>Previous</Text>
        </Pressable>
        {narrow ? null : <Text style={styles.pageLabel}>{label}</Text>}
        <Pressable style={[styles.pageBtn, narrow && styles.pageBtnGrow, page >= pages && styles.pageBtnOff]} onPress={() => page < pages && onChange(page + 1)}>
          <Text style={styles.pageBtnText}>Next</Text>
        </Pressable>
      </View>
    </View>
  );
}

function lastResults(finished: FootyFixture[], competitionId: number, team: string): CountedGame[] {
  return finished
    .filter((fx) => fx.finished && fx.competitionId === competitionId && !fx.isFriendly && !fx.isCup && (fx.homeName === team || fx.awayName === team) && fx.homeGoals != null)
    .sort((a, b) => b.unix - a.unix)
    .slice(0, 10)
    .map((fx) => ({
      id: fx.id,
      unix: fx.unix,
      match: `${fx.homeName} ${fx.homeGoals}-${fx.awayGoals} ${fx.awayName}`,
      score: `${fx.homeGoals}-${fx.awayGoals}`,
      detail: `${fx.homeName === team ? 'Home' : 'Away'} · ${team}`,
      htKnown: fx.htHome != null && fx.htAway != null,
    }));
}

function fixtureGames(fx: FootyFixture, finished: FootyFixture[]): CountedGame[] {
  return [
    {
      id: fx.id,
      unix: fx.unix,
      match: `${fx.homeName} vs ${fx.awayName}`,
      score: fx.finished && fx.homeGoals != null ? `${fx.homeGoals}-${fx.awayGoals}` : 'Upcoming',
      detail: fx.competitionName,
      htKnown: true,
    },
    ...lastResults(finished, fx.competitionId, fx.homeName),
    ...lastResults(finished, fx.competitionId, fx.awayName),
  ];
}

function StatsTable({
  columns,
  rows,
  empty,
  onGames,
}: {
  columns: FootyColumn[];
  rows: { id: string; cells: Record<string, string> }[];
  empty: string;
  onGames?: (row: { id: string; cells: Record<string, string> }) => CountedGame[];
}) {
  const narrow = useNarrow();
  const [open, setOpen] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const size = 20;
  const pageCount = Math.max(1, Math.ceil(rows.length / size));
  const safe = Math.min(page, pageCount);
  const start = (safe - 1) * size;
  const visible = rows.slice(start, start + size);
  const signature = `${rows.length}|${rows[0]?.id ?? ''}|${rows[rows.length - 1]?.id ?? ''}`;
  useEffect(() => {
    setPage(1);
    setOpen(null);
  }, [signature]);
  const picked = rows.find((row) => row.id === open);
  const games = picked && onGames ? onGames(picked) : [];
  const toggle = (id: string) => setOpen((current) => (current === id ? null : id));
  const list = open && onGames ? (
    <IncludedGamesList title="Games in this row" games={games} onClose={() => setOpen(null)} />
  ) : null;
  const pager = (slot: string) => (
    <PageControls
      key={slot}
      page={safe}
      pages={pageCount}
      total={rows.length}
      from={rows.length === 0 ? 0 : start + 1}
      to={start + visible.length}
      onChange={(next) => {
        setPage(next);
        setOpen(null);
      }}
    />
  );
  if (!narrow) {
    return (
      <>
        {list}
        {pager('top')}
        <FootyTable columns={columns} rows={visible} empty={empty} onPress={onGames ? toggle : undefined} selectedId={open} />
        {pager('bottom')}
      </>
    );
  }
  if (rows.length === 0) return <Text style={styles.note}>{empty}</Text>;
  const rankCol = columns.find((col) => col.key === 'rank');
  const named = columns.find((col) => ['name', 'team', 'league', 'score', 'match'].includes(col.key)) ?? columns.find((col) => col.key !== 'rank');
  const figureCol =
    columns.find((col) => ['figure', 'value', 'pct', 'run', 'avg'].includes(col.key) && col !== named) ??
    [...columns].reverse().find((col) => col !== named && col.key !== 'rank');
  const rest = columns.filter((col) => col !== rankCol && col !== named && col !== figureCol);
  return (
    <View style={styles.cardList}>
      {pager('top')}
      {visible.map((row) => (
        <Pressable key={row.id} onPress={onGames ? () => toggle(row.id) : undefined} style={[styles.statCard, open === row.id && styles.statCardOn]}>
          <View style={styles.statCardTop}>
            {rankCol ? <Text style={styles.statRank}>{row.cells[rankCol.key]}</Text> : null}
            <Text style={styles.statName}>{named ? row.cells[named.key] : ''}</Text>
            {figureCol ? <Text style={styles.statFigure}>{row.cells[figureCol.key]}</Text> : null}
          </View>
          {rest.map((col) => (
            <Text key={col.key} style={styles.statMeta}>
              {col.label}: {row.cells[col.key] || '—'}
            </Text>
          ))}
          {open === row.id && onGames ? <IncludedGamesList title="Games in this row" games={onGames(row)} onClose={() => setOpen(null)} /> : null}
        </Pressable>
      ))}
      {pager('bottom')}
    </View>
  );
}

function TopBoard({
  rows,
  entity,
  measure,
  minimum,
  sentence,
  empty,
  index,
  scope,
}: {
  rows: BoardRow[];
  entity: BoardEntity;
  measure: BoardMeasure;
  minimum: number;
  sentence: string;
  empty: string;
  index: FootyIndex;
  scope: Scope;
}) {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(rows.length / BOARD_PAGE));
  const safe = Math.min(page, pages);
  const start = (safe - 1) * BOARD_PAGE;
  const visible = rows.slice(start, start + BOARD_PAGE);
  const nameLabel = entity === 'teams' ? 'Team' : entity === 'leagues' ? 'League' : 'Competition';
  const columns = [
    { key: 'rank', label: '#', flex: 0.35 },
    { key: 'name', label: nameLabel, flex: 1.5 },
    ...(entity === 'teams' ? [{ key: 'context', label: 'League', flex: 1.3 }] : []),
    ...(entity === 'competitions' ? [{ key: 'type', label: 'Type', flex: 0.6 }] : []),
    { key: 'country', label: 'Country', flex: 1 },
    ...(measure === 'series'
      ? [
          { key: 'figure', label: entity === 'teams' ? 'Current series' : 'Longest series', flex: 0.9 },
          { key: 'detail', label: entity === 'teams' ? 'Played' : 'Team on that series', flex: entity === 'teams' ? 0.6 : 1.2 },
          ...(entity === 'teams' ? [] : [{ key: 'extra', label: minimum > 0 ? `Teams with ${minimum}+` : 'Teams on a run', flex: 0.8 }]),
        ]
      : [
          { key: 'detail', label: entity === 'teams' ? 'Played' : 'Best team', flex: entity === 'teams' ? 0.6 : 1.2 },
          { key: 'figure', label: entity === 'teams' ? 'Rate' : 'Average', flex: 0.8 },
          ...(entity === 'teams' ? [] : [{ key: 'extra', label: 'Best rate and teams', flex: 1 }]),
        ]),
  ];
  const pager = (slot: string) => (
    <Pager
      key={slot}
      page={safe}
      pages={pages}
      total={rows.length}
      noun="rows"
      always
      from={rows.length === 0 ? 0 : start + 1}
      to={start + visible.length}
      onChange={setPage}
    />
  );
  return (
    <Block dropdown title="Top 200" note={sentence}>
      <Text style={styles.formula}>{sentence}</Text>
      {pager('top')}
      <StatsTable
        columns={columns}
        empty={empty}
        onGames={entity === 'teams' ? (row) => listedGamesForTeam(index, row.cells.name, row.cells.context, scope) : undefined}
        rows={visible.map((row, position) => ({
          id: row.id,
          cells: {
            rank: String(start + position + 1),
            name: row.name,
            context: row.context,
            type: row.typeLabel,
            country: row.country,
            figure: row.figure,
            detail: row.detail,
            extra: row.extra,
          },
        }))}
      />
      {pager('bottom')}
    </Block>
  );
}

function QueryBoard({
  rows,
  bets,
  statLabel,
  page,
  pages,
  total,
  onPage,
}: {
  rows: ReturnType<typeof combineMatchQuery>;
  bets: Map<number, BestBet | null>;
  statLabel: string;
  page: number;
  pages: number;
  total: number;
  onPage: (page: number) => void;
}) {
  if (rows.length === 0) {
    return <Text style={styles.note}>No upcoming matches in this query have played at least 25% of the season.</Text>;
  }
  return (
    <Block dropdown title="Combined calculation" note={`Ordinary ${statLabel}, the league average, and the series when one is selected. The percentage is the average of those calculations.`}>
      <View style={styles.queryTable}>
        {rows.map((row) => (
          <FixtureSummary key={row.id} row={row} bet={bets.get(row.id) ?? null} />
        ))}
      </View>
      <Pager page={page} pages={pages} total={total} onChange={onPage} />
    </Block>
  );
}

function PagedFixtures({
  rows,
}: {
  rows: { id: number; unix: number; match: string; bet: BestBet | null; games: CountedGame[] }[];
}) {
  const [page, setPage] = useState(1);
  const size = 8;
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const safe = Math.min(page, pages);
  const start = (safe - 1) * size;
  const visible = rows.slice(start, start + size);
  return (
    <View style={styles.matchList}>
      {visible.map((row) => (
        <QuickMatchCard key={row.id} id={row.id} unix={row.unix} match={row.match} bet={row.bet} games={row.games} />
      ))}
      <PageControls
        page={safe}
        pages={pages}
        total={rows.length}
        from={rows.length === 0 ? 0 : start + 1}
        to={start + visible.length}
        onChange={setPage}
      />
    </View>
  );
}

function QuickMatchCard({
  id,
  unix,
  match,
  bet,
  games,
}: {
  id: number;
  unix: number;
  match: string;
  bet: BestBet | null;
  games: CountedGame[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <Pressable onPress={() => setOpen((value) => !value)} style={styles.matchCard}>
      <Text style={styles.matchKo}>{kickoff(unix)}</Text>
      <Text style={styles.matchTitle}>{match}</Text>
      <BestBetLine bet={bet} />
      {open ? <IncludedGamesList title="Games in this fixture" games={games} onClose={() => setOpen(false)} /> : null}
    </Pressable>
  );
}

function UpcomingList({
  rows,
}: {
  rows: { id: number; key?: string; unix: number; match: string; league: string; detail: string; bet: BestBet | null; games?: CountedGame[] }[];
}) {
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<number | null>(null);
  const size = 8;
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const safe = Math.min(page, pages);
  const visible = rows.slice((safe - 1) * size, safe * size);
  if (rows.length === 0) {
    return <Text style={styles.note}>No upcoming matches in leagues that have played at least 25% of the season.</Text>;
  }
  return (
    <View style={styles.matchList}>
      {visible.map((row, index) => (
        <Pressable key={row.key ?? `${row.id}-${index}`} onPress={() => setOpen((current) => (current === row.id ? null : row.id))} style={styles.matchCard}>
          <Text style={styles.matchKo}>{kickoff(row.unix)}</Text>
          <Text style={styles.matchTitle}>{row.match}</Text>
          <Text style={styles.note}>{row.league}{row.detail ? ` · ${row.detail}` : ''}</Text>
          <BestBetLine bet={row.bet} />
          {open === row.id ? (
            <IncludedGamesList
              title="Games in this fixture"
              onClose={() => setOpen(null)}
              games={row.games ?? [{ id: row.id, unix: row.unix, match: row.match, score: 'Upcoming', detail: row.league, htKnown: true }]}
            />
          ) : null}
        </Pressable>
      ))}
      <Pager page={safe} pages={pages} total={rows.length} onChange={setPage} />
    </View>
  );
}

function AnalysisBody(props: {
  analysis: AnalysisId;
  index: ReturnType<typeof buildFootyIndex>;
  upcoming: ReturnType<typeof filterFixtures>;
  finished: ReturnType<typeof useSlStats>['finished'];
  scope: Scope;
  query: { country: string | null; competitionId: number | null; kind: CompetitionKind; scope: Scope };
  bttsResult: '' | BttsSplit;
  half: '' | HalfSide;
  quickSystem: 'leaky' | 'second';
  competitionId: number | null;
  goalLine: GoalLine;
  goalSide: GoalSide;
  bothMode: BothHalvesMode;
  cleanDir: CleanSheetDirection;
  cornerLine: string;
  offsideLine: string;
  cardKind: 'yellow' | 'red';
  leagueSort: LeagueSort;
  seriesKey: string;
  seriesLabel: string;
  statKey: string;
  statLabel: string;
  discipline: ReturnType<typeof useSlStats>['discipline'];
  statsLoading: boolean;
  bets: Map<number, BestBet | null>;
}) {
  const lines = (fixtures: typeof props.upcoming, detail: (id: number) => string) =>
    fixtures.slice(0, 8).map((fx) => ({
      id: fx.id,
      unix: fx.unix,
      match: `${fx.homeName} vs ${fx.awayName}`,
      league: fx.competitionName,
      detail: detail(fx.id),
      bet: props.bets.get(fx.id) ?? bestBetForFixture(fx, props.finished),
      games: fixtureGames(fx, props.finished),
    }));

  if (props.analysis === 'btts') {
    const teams =
      props.half === 'first' || props.half === 'second'
        ? rankHalfBtts(props.index, props.scope, props.half)
        : props.bttsResult
          ? rankBttsSplit(props.index, props.scope, props.bttsResult)
          : rankBttsTeams(props.index, props.scope);
    const next = upcomingBtts(props.index, props.upcoming, props.query);
    const leagues = rankLeagues(
      props.index,
      props.half === 'first' || props.half === 'second' ? { kind: 'half', half: props.half } : { kind: 'btts' },
      props.leagueSort,
    );
    return (
      <>
        <RankTable index={props.index} scope={props.scope} title="Best teams" note="Ranked by how often the stat lands." rows={teams.map((row) => ({ id: `${row.league}-${row.team}`, name: row.team, league: row.league, played: row.played, value: pct(row.pct) }))} valueLabel="Rate" />
        <LeagueRateTable title="Best leagues" rows={leagues} sort={props.leagueSort} />
        <Block dropdown title="Upcoming matches" note="Next 48 hours. The best bet is the same pick shown on a fixture.">
          <UpcomingList rows={lines(props.upcoming, (id) => {
            const row = next.find((item) => item.id === id);
            return row ? `Both teams to score ${row.pct.toFixed(1)}%` : '';
          })} />
        </Block>
      </>
    );
  }

  if (props.analysis === 'goals') {
    const teams = rankGoalLineTeams(props.index, props.scope, props.goalLine, props.goalSide);
    const next = upcomingGoalLine(props.index, props.upcoming, props.query, props.goalLine, props.goalSide);
    const label = `${props.goalSide === 'over' ? 'Over' : 'Under'} ${props.goalLine} goals`;
    const leagues = rankLeagues(props.index, { kind: 'line', line: props.goalLine, side: props.goalSide }, props.leagueSort, props.goalSide === 'over');
    return (
      <>
        <RankTable index={props.index} scope={props.scope} title={`Best teams for ${label}`} note="Share of this team’s matches on that side of the line." rows={teams.map((row) => ({ id: `${row.league}-${row.team}`, name: row.team, league: row.league, played: row.played, value: pct(row.pct) }))} valueLabel="Rate" />
        <LeagueRateTable title={`Best leagues for ${label}`} rows={leagues} sort={props.leagueSort} />
        <Block dropdown title="Upcoming matches" note="Next 48 hours. The best bet is the same pick shown on a fixture.">
          <UpcomingList rows={lines(props.upcoming, (id) => {
            const row = next.find((item) => item.id === id);
            return row ? `${label} ${row.pct.toFixed(1)}%` : '';
          })} />
        </Block>
      </>
    );
  }

  if (props.analysis === 'wdw') {
    const teams = rankWdw(props.index, props.scope);
    return (
      <>
        <StatsTable
          columns={[
            { key: 'rank', label: '#', flex: 0.4 },
            { key: 'team', label: 'Team', flex: 1.5 },
            { key: 'league', label: 'League', flex: 1.2 },
            { key: 'played', label: 'Played', flex: 0.7 },
            { key: 'win', label: 'Win', flex: 0.7 },
            { key: 'draw', label: 'Draw', flex: 0.7 },
            { key: 'loss', label: 'Loss', flex: 0.7 },
          ]}
          empty="No teams with enough matches."
          onGames={(row) => listedGamesForTeam(props.index, row.cells.team, row.cells.league, props.scope)}
          rows={teams.map((row, i) => ({
            id: `${row.league}-${row.team}`,
            cells: { rank: String(i + 1), team: row.team, league: row.league, played: String(row.played), win: pct(row.winPct), draw: pct(row.drawPct), loss: pct(row.lossPct) },
          }))}
        />
        <Block dropdown title="Upcoming matches" note="Next 48 hours. The best bet is the same pick shown on a fixture.">
          <UpcomingList rows={lines(props.upcoming, () => '')} />
        </Block>
      </>
    );
  }

  if (props.analysis === 'halves') {
    const side = props.half === 'second' ? 'second' : 'first';
    const teams = rankHalfGoals(props.index, props.scope, side);
    return (
      <>
        <RankTable index={props.index} scope={props.scope} title={side === 'first' ? '1st half goals' : '2nd half goals'} note="Average goals by this team in that half." rows={teams.map((row) => ({ id: `${row.league}-${row.team}`, name: row.team, league: row.league, played: row.played, value: row.avg.toFixed(1) }))} valueLabel="Per game" />
        <Block dropdown title="Upcoming matches" note="Next 48 hours. The best bet is the same pick shown on a fixture.">
          <UpcomingList rows={lines(props.upcoming, () => '')} />
        </Block>
      </>
    );
  }

  if (props.analysis === 'filters') {
    const betFor = (id: number) => {
      const fx = props.upcoming.find((item) => item.id === id);
      if (!fx) return null;
      return props.bets.get(id) ?? bestBetForFixture(fx, props.finished);
    };
    if (props.quickSystem === 'leaky') {
      const rows = rankLeakyFixtures(props.finished, props.upcoming);
      return (
        <>
          <Text style={styles.note}>Both teams conceded in at least 8 of their last 10. Listed by the model both-teams-to-score probability. A 70% recent rate is marked and does not remove a match.</Text>
          <StatsTable
            columns={[
              { key: 'rank', label: '#', flex: 0.4 },
              { key: 'ko', label: 'Kickoff', flex: 1.1 },
              { key: 'match', label: 'Match', flex: 1.6 },
              { key: 'league', label: 'League', flex: 1.2 },
              { key: 'figure', label: 'BTTS', flex: 0.7 },
              { key: 'over15', label: 'Over 1.5', flex: 0.8 },
              { key: 'over25', label: 'Over 2.5', flex: 0.8 },
              { key: 'home', label: 'Home BTTS', flex: 0.9 },
              { key: 'away', label: 'Away BTTS', flex: 0.9 },
              { key: 'xg', label: 'Expected goals', flex: 1.1 },
            ]}
            empty="No upcoming match has both teams conceding in at least 8 of their last 10."
            onGames={(row) => {
              const fx = props.upcoming.find((item) => String(item.id) === row.id);
              return fx ? fixtureGames(fx, props.finished) : [];
            }}
            rows={rows.map((row, index) => ({
              id: String(row.id),
              cells: {
                rank: String(index + 1),
                ko: kickoff(row.unix),
                match: row.match,
                league: row.league,
                figure: `${Math.round(row.btts * 100)}%`,
                over15: `${Math.round(row.over15 * 100)}%`,
                over25: `${Math.round(row.over25 * 100)}%`,
                home: `${row.homeBttsPct.toFixed(1)}% · ${row.homeBttsPass ? 'yes' : 'no'}`,
                away: `${row.awayBttsPct.toFixed(1)}% · ${row.awayBttsPass ? 'yes' : 'no'}`,
                xg: `${row.expectedHome.toFixed(1)}–${row.expectedAway.toFixed(1)}`,
              },
            }))}
          />
          <PagedFixtures
            rows={rows.map((row) => {
              const fx = props.upcoming.find((item) => item.id === row.id);
              return {
                id: row.id,
                unix: row.unix,
                match: row.match,
                bet: betFor(row.id),
                games: fx ? fixtureGames(fx, props.finished) : [],
              };
            })}
          />
        </>
      );
    }
    const rows = rankSecondHalfFixtures(props.finished, props.upcoming, { competitionId: props.competitionId });
    const empty = props.competitionId != null
      ? 'No upcoming match in this league has both teams at or below a 22% second-half 0–0 rate, a home side conceding in the second half in at least 60% of home games, and an away side scoring in the second half in at least 70% of their last 5.'
      : 'No upcoming match has both teams at or below a 22% second-half 0–0 rate, a home side conceding in the second half in at least 60% of home games, and an away side scoring in the second half in at least 70% of their last 5. Competitions also need at least 2.5 goals per game unless one league is selected.';
    return (
      <>
        <Text style={styles.note}>Second-half 0–0 at or below 22% for both teams, home side concedes after the break in at least 60% of home games, and the away side scores after the break in at least 70% of their last 5. Listed by the away side’s goals in those last 5. A second-half-heavy run and a midweek kickoff are marked and do not remove a match.</Text>
        <StatsTable
          columns={[
            { key: 'rank', label: '#', flex: 0.4 },
            { key: 'ko', label: 'Kickoff', flex: 1.1 },
            { key: 'match', label: 'Match', flex: 1.6 },
            { key: 'league', label: 'League', flex: 1.2 },
            { key: 'figure', label: 'Away goals, last 5', flex: 1 },
            { key: 'homeNil', label: 'Home 2H 0–0', flex: 0.9 },
            { key: 'awayNil', label: 'Away 2H 0–0', flex: 0.9 },
            { key: 'homeConc', label: 'Home 2H conceded', flex: 1 },
            { key: 'awaySc', label: 'Away 2H scored', flex: 1 },
            { key: 'homeHeavy', label: 'Home 2nd half', flex: 0.9 },
            { key: 'awayHeavy', label: 'Away 2nd half', flex: 0.9 },
            { key: 'midweek', label: 'Midweek', flex: 0.7 },
          ]}
          empty={empty}
          onGames={(row) => {
            const fx = props.upcoming.find((item) => String(item.id) === row.id);
            return fx ? fixtureGames(fx, props.finished) : [];
          }}
          rows={rows.map((row, index) => ({
            id: String(row.id),
            cells: {
              rank: String(index + 1),
              ko: kickoff(row.unix),
              match: row.match,
              league: row.league,
              figure: String(row.awayGoalsLast5),
              homeNil: `${row.homeNilPct.toFixed(1)}%`,
              awayNil: `${row.awayNilPct.toFixed(1)}%`,
              homeConc: `${row.homeConcededPct.toFixed(1)}%`,
              awaySc: `${row.awayScoredPct.toFixed(1)}%`,
              homeHeavy: `${row.homeHeavy}/10 · ${row.homeHeavyPass ? 'yes' : 'no'}`,
              awayHeavy: `${row.awayHeavy}/10 · ${row.awayHeavyPass ? 'yes' : 'no'}`,
              midweek: row.midweek ? 'Yes' : 'No',
            },
          }))}
        />
        <PagedFixtures
          rows={rows.map((row) => {
            const fx = props.upcoming.find((item) => item.id === row.id);
            return {
              id: row.id,
              unix: row.unix,
              match: row.match,
              bet: betFor(row.id),
              games: fx ? fixtureGames(fx, props.finished) : [],
            };
          })}
        />
      </>
    );
  }

  if (props.analysis === 'both') {
    const teams = rankBothHalves(props.index, props.scope, props.bothMode);
    return (
      <>
        <RankTable index={props.index} scope={props.scope} title="Best teams" note="Share of matches that fit this both-halves stat." rows={teams.map((row) => ({ id: `${row.league}-${row.team}`, name: row.team, league: row.league, played: row.played, value: pct(row.pct) }))} valueLabel="Rate" />
        <Block dropdown title="Upcoming matches" note="Next 48 hours. The best bet is the same pick shown on a fixture.">
          <UpcomingList rows={lines(props.upcoming, () => '')} />
        </Block>
      </>
    );
  }

  if (props.analysis === 'clean') {
    const teams = rankCleanSheets(props.index, props.scope, props.cleanDir);
    return (
      <>
        <RankTable index={props.index} scope={props.scope} title={props.cleanDir === 'most' ? 'Most clean sheets' : 'Least clean sheets'} note="A team needs at least 7 matches." rows={teams.map((row) => ({ id: `${row.league}-${row.team}`, name: row.team, league: row.league, played: row.played, value: `${row.hits} · ${pct(row.pct)}` }))} valueLabel="Clean sheets" />
        <Block dropdown title="Upcoming matches" note="Next 48 hours. The best bet is the same pick shown on a fixture.">
          <UpcomingList rows={lines(props.upcoming, () => '')} />
        </Block>
      </>
    );
  }

  if (props.analysis === 'score') {
    const rows = rankScorelines(props.index);
    return (
      <>
        <StatsTable
          columns={[
            { key: 'rank', label: '#', flex: 0.4 },
            { key: 'score', label: 'Correct score', flex: 1.2 },
            { key: 'count', label: 'Times', flex: 0.7 },
            { key: 'pct', label: 'Share', flex: 0.7 },
          ]}
          empty="No finished scores in this filter."
          rows={rows.map((row, i) => ({ id: row.score, cells: { rank: String(i + 1), score: row.score, count: String(row.count), pct: pct(row.pct) } }))}
        />
        <Block dropdown title="Upcoming matches" note="Next 48 hours. The best bet is the same pick shown on a fixture.">
          <UpcomingList rows={lines(props.upcoming, () => '')} />
        </Block>
      </>
    );
  }

  if (props.analysis === 'corners' || props.analysis === 'cards' || props.analysis === 'offsides') {
    if (props.statsLoading && !props.discipline) return <Text style={styles.note}>Counting match stats from recent finished matches.</Text>;
    const feed = props.discipline;
    if (props.analysis === 'corners') {
      const leagues = feed ? rankCornerLeagues(feed, props.cornerLine) : [];
      const matches = feed ? rankCornerMatches(feed, props.upcoming) : [];
      return (
        <>
          <StatsTable
            columns={[
              { key: 'rank', label: '#', flex: 0.4 },
              { key: 'league', label: 'League', flex: 1.6 },
              { key: 'country', label: 'Country', flex: 1 },
              { key: 'played', label: 'Matches', flex: 0.8 },
              { key: 'avg', label: 'Corners per game', flex: 1 },
              { key: 'pct', label: `Over ${props.cornerLine}`, flex: 0.9 },
            ]}
            empty="No leagues with corner counts yet."
            rows={leagues.map((row, i) => ({ id: row.id, cells: { rank: String(i + 1), league: row.league, country: row.country, played: String(row.played), avg: row.perGame.toFixed(1), pct: pct(row.overPct) } }))}
          />
          <Block dropdown title="Upcoming matches" note="Next 48 hours. Corners per game sit beside the fixture best bet.">
            <UpcomingList
              rows={[
                ...matches.map((row) => ({ id: row.id, unix: row.unix, match: row.match, league: row.league, detail: `Corners ${row.avg.toFixed(1)} per game`, bet: props.bets.get(row.id) ?? null })),
                ...lines(
                  props.upcoming.filter((fx) => !matches.some((row) => row.id === fx.id)),
                  () => '',
                ),
              ]}
            />
          </Block>
        </>
      );
    }
    const cardLabel = props.cardKind === 'yellow' ? 'Yellow cards' : 'Red cards';
    const teams = (feed?.teams ?? [])
      .filter((team) => (props.analysis === 'cards' ? (team.cardPlayed ?? 0) >= 1 : (team.offsidePlayed ?? 0) >= 1))
      .map((team) => {
        if (props.analysis === 'cards') {
          const played = team.cardPlayed ?? team.played;
          const total = props.cardKind === 'yellow' ? team.yellows : team.reds;
          const value = perGame(total, played) ?? 0;
          return { id: `${team.competitionId}-${team.name}`, name: team.name, league: team.league, played, value: value.toFixed(2), sort: value };
        }
        const played = team.offsidePlayed ?? team.played;
        const per = perGame(team.offsides, played) ?? 0;
        const over = team.offsideOver[props.offsideLine];
        return {
          id: `${team.competitionId}-${team.name}`,
          name: team.name,
          league: team.league,
          played,
          value: over == null ? per.toFixed(1) : `${per.toFixed(1)} · Over ${props.offsideLine} ${pct(over)}`,
          sort: over ?? per,
        };
      })
      .sort((a, b) => b.sort - a.sort);
    return (
      <>
        <RankTable index={props.index} scope={props.scope}
          title={props.analysis === 'cards' ? `${cardLabel} per game` : `Offsides per game · Over ${props.offsideLine}`}
          note={props.analysis === 'cards' ? `${cardLabel} of this team, counted from the sampled finished matches.` : `Offsides of this team. Over ${props.offsideLine} is the share of sampled matches above that line.`}
          rows={teams}
          valueLabel={props.analysis === 'cards' ? 'Per game' : 'Per game and over'}
        />
        <Block dropdown title="Upcoming matches" note="Next 48 hours. The best bet is the same pick shown on a fixture.">
          <UpcomingList rows={lines(props.upcoming, () => '')} />
        </Block>
      </>
    );
  }

  if (props.analysis === 'series') {
    if (!props.seriesKey) {
      return <Text style={styles.note}>Choose a series in the query to rank the current runs.</Text>;
    }
    const teams = rankSeriesTeams(props.finished, props.seriesKey, props.scope);
    const next = seriesMatches(props.finished, props.upcoming, props.seriesKey, props.scope);
    return (
      <>
        <StatsTable
          columns={[
            { key: 'rank', label: '#', flex: 0.4 },
            { key: 'team', label: 'Team', flex: 1.6 },
            { key: 'league', label: 'League', flex: 1.3 },
            { key: 'run', label: 'Series', flex: 0.7 },
            { key: 'sample', label: 'Played', flex: 0.7 },
          ]}
          empty={`No team has a live ${props.seriesLabel} series of 3 or more.`}
          onGames={(row) => listedGamesForTeam(props.index, row.cells.team, row.cells.league, props.scope)}
          rows={teams.map((row, i) => ({ id: row.id, cells: { rank: String(i + 1), team: row.team, league: row.league, run: String(row.run), sample: String(row.sample) } }))}
        />
        <Block dropdown title="Upcoming matches" note="Each team’s next match, with the fixture best bet.">
          <UpcomingList
            rows={next.map((row) => ({
              id: row.id,
              key: `${row.id}-${row.team}`,
              unix: row.unix,
              match: row.match,
              league: row.league,
              detail: `${row.team}: ${props.seriesLabel} series ${row.run}. ${row.opponent}${row.opponentLive ? ` series ${row.opponentRun}` : ' series not live'}.`,
              bet: props.bets.get(row.id) ?? null,
            }))}
          />
        </Block>
      </>
    );
  }

  const teams = props.analysis === 'ordinary' ? rankOrdinaryTeams(props.finished, props.statKey, props.scope) : rankLeagueAverages(props.finished, props.statKey, props.scope);
  const next = ordinaryMatches(props.finished, props.upcoming, props.statKey, props.scope);
  return (
    <>
      <RankTable index={props.index} scope={props.scope}
        title={props.analysis === 'ordinary' ? `Best teams for ${props.statLabel}` : `Best leagues for ${props.statLabel}`}
        note={props.analysis === 'ordinary' ? 'Ordinary full-time rate. A team needs at least 5 matches.' : 'League average of that ordinary rate.'}
        rows={teams.map((row) => ({ id: row.id, name: row.name, league: props.analysis === 'ordinary' ? row.league : row.country, played: row.played, value: pct(row.pct) }))}
        valueLabel={props.statLabel}
      />
      <Block dropdown title="Upcoming matches" note="Next 48 hours. The rate sits beside the fixture best bet.">
        <UpcomingList
          rows={next.map((row) => ({
            id: row.id,
            unix: row.unix,
            match: row.match,
            league: row.league,
            detail: row.avg == null ? props.statLabel : `${props.statLabel} ${pct(row.avg)}`,
            bet: props.bets.get(row.id) ?? null,
          }))}
        />
      </Block>
    </>
  );
}

function LeagueRateTable({ title, rows, sort }: { title: string; sort: LeagueSort; rows: ReturnType<typeof rankLeagues> }) {
  const valueOf = (row: (typeof rows)[number]) => {
    if (sort === 'goals') return String(row.goals);
    if (sort === 'avg') return row.avgGoals.toFixed(2);
    if (sort === 'progress') return row.progress == null ? '—' : pct(row.progress);
    return pct(row.pct);
  };
  const label = sort === 'goals' ? 'Goals' : sort === 'avg' ? 'Average' : sort === 'progress' ? 'Progress' : 'Rate';
  return (
    <Block title={title} note="Leagues that have played at least 25% of the season. Over lines leave out leagues that have already finished.">
      <StatsTable
        columns={[
          { key: 'rank', label: '#', flex: 0.4 },
          { key: 'league', label: 'League', flex: 1.6 },
          { key: 'country', label: 'Country', flex: 1 },
          { key: 'played', label: 'Played', flex: 0.7 },
          { key: 'value', label, flex: 0.8 },
        ]}
        empty="No leagues in this filter have played enough of the season."
        rows={rows.map((row, i) => ({
          id: String(row.competitionId),
          cells: { rank: String(i + 1), league: row.league, country: row.country, played: String(row.played), value: valueOf(row) },
        }))}
      />
    </Block>
  );
}

function RankTable({
  title,
  note,
  rows,
  valueLabel,
  index,
  scope,
}: {
  title: string;
  note: string;
  valueLabel: string;
  rows: { id: string; name: string; league: string; played: number; value: string }[];
  index?: FootyIndex;
  scope?: Scope;
}) {
  const [page, setPage] = useState(1);
  const size = 12;
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const safe = Math.min(page, pages);
  const visible = rows.slice((safe - 1) * size, safe * size);
  const start = (safe - 1) * size;
  return (
    <Block title={title} note={note}>
      <StatsTable
        columns={[
          { key: 'rank', label: '#', flex: 0.4 },
          { key: 'name', label: 'Name', flex: 1.6 },
          { key: 'league', label: 'League', flex: 1.3 },
          { key: 'played', label: 'Played', flex: 0.7 },
          { key: 'value', label: valueLabel, flex: 0.9 },
        ]}
        empty="Nothing in this filter has enough matches."
        onGames={index && scope ? (row) => listedGamesForTeam(index, row.cells.name, row.cells.league, scope) : undefined}
        rows={visible.map((row, i) => ({
          id: row.id,
          cells: { rank: String(start + i + 1), name: row.name, league: row.league, played: String(row.played), value: row.value },
        }))}
      />
      <Pager page={safe} pages={pages} total={rows.length} noun="rows" onChange={setPage} />
    </Block>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xl, gap: spacing.md, width: '100%' },
  scrollNarrow: { paddingHorizontal: spacing.md },
  filterFull: { width: '100%', minWidth: 0, flexBasis: 'auto', flexGrow: 0 },
  hero: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.lg,
    backgroundColor: '#0F172A',
    borderRadius: 12,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  heroNarrow: { flexDirection: 'column', alignItems: 'flex-start', gap: spacing.sm, paddingHorizontal: spacing.md },
  heroCopy: { flex: 1, gap: 4 },
  heroKicker: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: '#34D399',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  title: { fontFamily: fonts.display, fontSize: 36, color: '#FFFFFF', letterSpacing: 0.6 },
  titleNarrow: { fontSize: 30 },
  blurb: { fontFamily: fonts.body, fontSize: 15, color: '#CBD5E1', lineHeight: 22, maxWidth: 760 },
  heroStat: { alignItems: 'flex-end', minWidth: 120 },
  heroStatNarrow: { alignItems: 'flex-start', minWidth: 0 },
  heroNum: { fontFamily: fonts.display, fontSize: 44, color: '#FFFFFF', lineHeight: 48 },
  heroNumNarrow: { fontSize: 36, lineHeight: 40 },
  heroLabel: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: '#94A3B8', letterSpacing: 0.4, textTransform: 'uppercase' },
  sample: { fontFamily: fonts.body, fontSize: 13, color: theme.textMuted },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  filtersNarrow: { flexDirection: 'column' },
  block: { gap: spacing.xs },
  disclosure: {
    width: '100%',
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: 10,
    backgroundColor: theme.surface,
    overflow: 'hidden',
  },
  disclosureHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    backgroundColor: '#0F172A',
  },
  disclosureCopy: { flex: 1, gap: 2 },
  disclosureTitle: { fontFamily: fonts.display, fontSize: 18, color: '#FFFFFF' },
  disclosureNote: { fontFamily: fonts.body, fontSize: 13, color: '#CBD5E1', lineHeight: 18 },
  disclosureBody: { padding: spacing.sm, gap: spacing.sm, backgroundColor: theme.bg },
  chevron: { fontFamily: fonts.bodySemiBold, fontSize: 18, color: '#FFFFFF', width: 18 },
  fixtureChevron: { fontFamily: fonts.bodySemiBold, fontSize: 18, color: theme.textPrimary, width: 18 },
  blockTitle: { fontFamily: fonts.display, fontSize: 18, color: theme.textPrimary },
  note: { fontFamily: fonts.body, fontSize: 13, color: theme.textMuted, lineHeight: 18 },
  error: { fontFamily: fonts.body, fontSize: 13, color: '#B91C1C' },
  matchList: { gap: spacing.sm },
  matchCard: { borderWidth: 1, borderColor: theme.border ?? '#E2E8F0', borderRadius: 8, padding: spacing.sm, gap: 4 },
  matchKo: { fontFamily: fonts.body, fontSize: 12, color: theme.textMuted },
  matchTitle: { fontFamily: fonts.bodyMedium ?? fonts.body, fontSize: 15, color: theme.textPrimary },
  bet: { marginTop: 4, gap: 2 },
  betKicker: { fontFamily: fonts.bodyMedium ?? fonts.body, fontSize: 11, letterSpacing: 0.6, color: theme.accentGreen },
  betRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  betText: { flex: 1 },
  betMarket: { fontFamily: fonts.body, fontSize: 12, color: theme.textMuted },
  betSelection: { fontFamily: fonts.bodyMedium ?? fonts.body, fontSize: 15, color: theme.textPrimary },
  betPct: { fontFamily: fonts.display, fontSize: 22, color: theme.accentGreen },
  queryTable: {
    width: '100%',
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    overflow: 'hidden',
    backgroundColor: theme.surface,
  },
  queryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: layout.borderWidth,
    borderBottomColor: theme.border,
    gap: spacing.sm,
  },
  queryHead: { backgroundColor: theme.surfaceMuted },
  queryAlt: { backgroundColor: '#F8FAFC' },
  queryHeadText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    color: theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  queryCalc: { flex: 1 },
  queryFigureCol: { width: 72, textAlign: 'right' },
  queryLabel: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.textPrimary, lineHeight: 18 },
  queryFrom: { fontFamily: fonts.body, fontSize: 12, color: theme.textMuted, lineHeight: 16, marginTop: 1 },
  formula: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: theme.textPrimary,
    lineHeight: 22,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
  },
  formulaName: { fontFamily: fonts.bodySemiBold, color: theme.textPrimary },
  formulaPct: { fontFamily: fonts.bodySemiBold, color: theme.accentGreen },
  queryFigure: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: theme.textPrimary },
  queryMatch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    backgroundColor: '#ECFDF5',
    borderBottomWidth: layout.borderWidth,
    borderBottomColor: theme.border,
    borderTopWidth: 2,
    borderTopColor: theme.accentGreen,
  },
  queryMatchNarrow: { flexDirection: 'column', alignItems: 'stretch', gap: spacing.sm },
  queryBadges: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.sm },
  queryBadgesNarrow: { width: '100%' },
  badgeNarrow: { flex: 1, minWidth: 0, maxWidth: undefined },
  queryMatchText: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  queryMatchCopy: { flex: 1, minWidth: 0, gap: 2 },
  queryKicker: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    color: theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  queryMatchName: { fontFamily: fonts.bodySemiBold, fontSize: 16, color: theme.textPrimary },
  likely: {
    backgroundColor: '#0F172A',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 148,
    maxWidth: 240,
    gap: 1,
  },
  likelyKicker: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    color: '#FDE68A',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  likelySelection: { fontFamily: fonts.bodySemiBold, fontSize: 16, color: '#FFFFFF', lineHeight: 20 },
  likelyPct: { fontFamily: fonts.display, fontSize: 26, color: '#FACC15', lineHeight: 28 },
  queryCombined: {
    backgroundColor: theme.accentGreen,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: 'flex-end',
    minWidth: 96,
  },
  combinedKicker: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    color: '#D1FAE5',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  queryCombinedValue: { fontFamily: fonts.display, fontSize: 30, color: '#FFFFFF', lineHeight: 34 },
  querySection: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    color: theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    backgroundColor: theme.surfaceMuted,
    borderBottomWidth: layout.borderWidth,
    borderBottomColor: theme.border,
  },
  queryHit: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.win, textAlign: 'right' },
  queryMiss: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.loss, textAlign: 'right' },
  pager: { gap: spacing.sm, marginTop: spacing.sm },
  pagerNarrow: { alignItems: 'stretch' },
  pagerButtons: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pagerButtonsWide: { justifyContent: 'space-between' },
  pageBtn: { backgroundColor: '#0F172A', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16 },
  pageBtnGrow: { flex: 1, alignItems: 'center' },
  pageLabelNarrow: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.textPrimary, textAlign: 'center' },
  pageBtnOff: { opacity: 0.35 },
  pageBtnText: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: '#FFFFFF' },
  pageLabel: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.textPrimary, flexShrink: 1, textAlign: 'center' },
  cardList: { gap: spacing.sm },
  statCardOn: { backgroundColor: '#DBEAFE' },
  statCard: {
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: 10,
    backgroundColor: theme.surface,
    padding: spacing.sm,
    gap: 2,
  },
  statCardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  statRank: { fontFamily: fonts.display, fontSize: 18, color: theme.textMuted, width: 32 },
  statName: { flex: 1, fontFamily: fonts.bodySemiBold, fontSize: 15, color: theme.textPrimary },
  statFigure: { fontFamily: fonts.display, fontSize: 18, color: theme.accentGreen, textAlign: 'right' },
  statMeta: { fontFamily: fonts.body, fontSize: 12, color: theme.textMuted, lineHeight: 16, paddingLeft: 40 },
});
