import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import FootyTable, { type FootyColumn } from '@/components/analytics/FootyTable';
import FilterDropdown from '@/components/shared/FilterDropdown';
import { useFootyStats } from '@/hooks/useFootyStats';
import {
  bttsSummary,
  buildFootyIndex,
  GOAL_LINES,
  goalLineSummary,
  MIN_CARD_MATCHES,
  MIN_CLEAN_SHEET_MATCHES,
  MIN_CORNER_MATCHES,
  MIN_LEAGUE_PROGRESS,
  MIN_OFFSIDE_MATCHES,
  MIN_RATE_MATCHES,
  perGame,
  rankBothHalves,
  rankBttsSplit,
  rankBttsTeams,
  rankCleanSheets,
  rankGoalLineTeams,
  rankHalfBtts,
  rankHalfGoals,
  rankLeagues,
  rankScorelines,
  rankUpcomingValues,
  rankWdw,
  upcomingBtts,
  upcomingGoalLine,
  type BothHalvesMode,
  type BttsSplit,
  type CleanSheetDirection,
  type CompetitionKind,
  type DisciplineTeam,
  type GoalLine,
  type GoalSide,
  type HalfSide,
  type LeagueSort,
  type Scope,
} from '@/services/footyMarketStats';
import { fonts, spacing, theme } from '@/styles/theme';

type MarketId =
  | 'btts'
  | 'goals'
  | 'wdw'
  | 'halves'
  | 'both'
  | 'clean'
  | 'score'
  | 'corners'
  | 'cards'
  | 'offsides';

const MARKETS: { value: MarketId; label: string; blurb: string }[] = [
  {
    value: 'btts',
    label: 'Both teams to score',
    blurb:
      'Teams and leagues ranked by how often both sides score. Upcoming matches use the average of the two teams’ rates. Half-time BTTS only counts matches that have a half-time score.',
  },
  {
    value: 'goals',
    label: 'Over / Under goals',
    blurb:
      'Share of matches that finish over or under a goal line. Leagues already at 100% progress are left out. Upcoming matches in the next 48 hours use each side’s season rate.',
  },
  {
    value: 'wdw',
    label: 'Win / Draw / Win',
    blurb: 'Win, draw, and loss rates, with home-win and away-win split out from each team’s venue record.',
  },
  {
    value: 'halves',
    label: 'First half & second half goals',
    blurb: 'How often a team scores in one half, and how many goals they average there. Only matches with a half-time score are counted.',
  },
  {
    value: 'both',
    label: 'Scored in both halves',
    blurb:
      'A team scores in both halves when they score before the break and again after it. Both teams scoring in both halves needs at least four goals.',
  },
  {
    value: 'clean',
    label: 'Clean sheets',
    blurb: `Matches with no goal conceded. A team needs at least ${MIN_CLEAN_SHEET_MATCHES} matches in this filter before it is listed.`,
  },
  {
    value: 'score',
    label: 'Correct score',
    blurb: 'Full-time scorelines in the current filter, with 1-1 and the other frequent results at the top.',
  },
  {
    value: 'corners',
    label: 'Corners',
    blurb:
      'Corner totals come from the selected league’s season feed. Averages are total corners divided by matches played. Over lines appear only when the feed includes them.',
  },
  {
    value: 'cards',
    label: 'Yellow & red cards',
    blurb:
      'Card totals come from the selected league’s season feed. Player bookings are not in this feed, so there is no player table.',
  },
  {
    value: 'offsides',
    label: 'Offsides',
    blurb:
      'Team offsides per game from the selected league’s season feed. The next-48-hours list adds the home and away offside averages. Over lines appear only when the feed includes them.',
  },
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

const SPLITS: { value: BttsSplit; label: string }[] = [
  { value: 'win', label: 'BTTS & win' },
  { value: 'draw', label: 'BTTS & draw' },
  { value: 'loss', label: 'BTTS & loss' },
];

const HALVES: { value: HalfSide; label: string }[] = [
  { value: 'first', label: '1st half' },
  { value: 'second', label: '2nd half' },
];

const SIDES: { value: GoalSide; label: string }[] = [
  { value: 'over', label: 'Over' },
  { value: 'under', label: 'Under' },
];

const BOTH_MODES: { value: BothHalvesMode; label: string }[] = [
  { value: 'team', label: 'Team scored in both halves' },
  { value: 'btts', label: 'Both teams in both halves' },
];

const CLEAN_DIRS: { value: CleanSheetDirection; label: string }[] = [
  { value: 'most', label: 'Most clean sheets' },
  { value: 'least', label: 'Least clean sheets' },
];

const LEAGUE_SORTS: { value: LeagueSort; label: string }[] = [
  { value: 'pct', label: 'Percentage' },
  { value: 'goals', label: 'Goals scored' },
  { value: 'avg', label: 'Average goals' },
  { value: 'progress', label: 'Progress' },
];

const CORNER_LINES = ['8.5', '9.5', '10.5', '11.5', '12.5'];
const OFFSIDE_LINES = ['1.5', '2.5', '3.5'];

function pct(n: number): string {
  return `${n.toFixed(1)}%`;
}

function maybePct(n: number | null): string {
  return n == null ? '—' : pct(n);
}

function maybeNum(n: number | null): string {
  return n == null ? '—' : n.toFixed(1);
}

function kickoff(unix: number): string {
  return new Date(unix * 1000).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function progressText(n: number | null): string {
  return n == null ? '—' : `${Math.round(n)}%`;
}

function Block({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <View style={styles.block}>
      <Text style={styles.blockTitle}>{title}</Text>
      {note ? <Text style={styles.note}>{note}</Text> : null}
      {children}
    </View>
  );
}

const TEAM_COLS: FootyColumn[] = [
  { key: 'rank', label: '#', flex: 0.4 },
  { key: 'team', label: 'Team', flex: 1.6 },
  { key: 'league', label: 'League', flex: 1.4 },
  { key: 'played', label: 'Played', flex: 0.7 },
  { key: 'hits', label: 'Count', flex: 0.7 },
  { key: 'pct', label: '%', flex: 0.7 },
];

export default function FootyStatsPanel() {
  const [market, setMarket] = useState<MarketId>('btts');
  const [country, setCountry] = useState('');
  const [leagueId, setLeagueId] = useState('');
  const [kind, setKind] = useState<CompetitionKind>('domestic');
  const [scope, setScope] = useState<Scope>('overall');
  const [split, setSplit] = useState<BttsSplit>('win');
  const [half, setHalf] = useState<HalfSide>('first');
  const [line, setLine] = useState<GoalLine>(2.5);
  const [side, setSide] = useState<GoalSide>('over');
  const [bothMode, setBothMode] = useState<BothHalvesMode>('team');
  const [cleanDir, setCleanDir] = useState<CleanSheetDirection>('most');
  const [leagueSort, setLeagueSort] = useState<LeagueSort>('pct');
  const [cornerLine, setCornerLine] = useState('9.5');
  const [offsideLine, setOffsideLine] = useState('2.5');

  const live = useFootyStats({
    country: country || null,
    competitionId: leagueId ? Number(leagueId) : null,
    kind,
  });

  useEffect(() => {
    if (!leagueId) return;
    const comp = live.catalog.find((item) => item.id === Number(leagueId));
    if (!comp) return;
    if (country && comp.country !== country) setLeagueId('');
    if (kind === 'domestic' && comp.isCup) setLeagueId('');
    if (kind === 'cup' && !comp.isCup) setLeagueId('');
  }, [country, kind, leagueId, live.catalog]);

  const countries = useMemo(() => {
    const names = [...new Set(live.catalog.map((comp) => comp.country).filter(Boolean))];
    names.sort((a, b) => a.localeCompare(b));
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
    return [
      { value: '', label: 'All leagues' },
      ...rows.map((comp) => ({ value: String(comp.id), label: `${comp.name} · ${comp.country}` })),
    ];
  }, [live.catalog, country, kind]);

  const index = useMemo(
    () =>
      buildFootyIndex(live.finished, {
        country: country || null,
        competitionId: leagueId ? Number(leagueId) : null,
        kind,
      }),
    [live.finished, country, leagueId, kind],
  );

  const query = useMemo(
    () => ({
      country: country || null,
      competitionId: leagueId ? Number(leagueId) : null,
      kind,
      scope,
    }),
    [country, leagueId, kind, scope],
  );

  const marketMeta = MARKETS.find((item) => item.value === market) ?? MARKETS[0];
  const needsLeague = market === 'corners' || market === 'cards' || market === 'offsides';

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Footy Stats</Text>
      <Text style={styles.blurb}>{marketMeta.blurb}</Text>

      <View style={styles.filters}>
        <FilterDropdown
          label="Market"
          value={market}
          options={MARKETS.map((item) => ({ value: item.value, label: item.label }))}
          onChange={(value) => setMarket(value as MarketId)}
        />
        <FilterDropdown label="Country" value={country} options={countries} onChange={setCountry} />
        <FilterDropdown label="League" value={leagueId} options={leagues} onChange={setLeagueId} />
        <FilterDropdown
          label="Competitions"
          value={kind}
          options={KINDS.map((item) => ({ value: item.value, label: item.label }))}
          onChange={(value) => setKind(value as CompetitionKind)}
        />
        <FilterDropdown
          label="Scope"
          value={scope}
          options={SCOPES.map((item) => ({ value: item.value, label: item.label }))}
          onChange={(value) => setScope(value as Scope)}
        />
        {market === 'btts' ? (
          <>
            <FilterDropdown
              label="BTTS result"
              value={split}
              options={SPLITS.map((item) => ({ value: item.value, label: item.label }))}
              onChange={(value) => setSplit(value as BttsSplit)}
            />
            <FilterDropdown
              label="Half"
              value={half}
              options={HALVES.map((item) => ({ value: item.value, label: item.label }))}
              onChange={(value) => setHalf(value as HalfSide)}
            />
          </>
        ) : null}
        {market === 'goals' ? (
          <>
            <FilterDropdown
              label="Line"
              value={String(line)}
              options={GOAL_LINES.map((item) => ({ value: String(item), label: String(item) }))}
              onChange={(value) => setLine(Number(value) as GoalLine)}
            />
            <FilterDropdown
              label="Side"
              value={side}
              options={SIDES.map((item) => ({ value: item.value, label: item.label }))}
              onChange={(value) => setSide(value as GoalSide)}
            />
            <FilterDropdown
              label="League sort"
              value={leagueSort}
              options={LEAGUE_SORTS}
              onChange={(value) => setLeagueSort(value as LeagueSort)}
            />
          </>
        ) : null}
        {market === 'halves' ? (
          <FilterDropdown
            label="Half"
            value={half}
            options={HALVES.map((item) => ({ value: item.value, label: item.label }))}
            onChange={(value) => setHalf(value as HalfSide)}
          />
        ) : null}
        {market === 'both' ? (
          <FilterDropdown
            label="Market split"
            value={bothMode}
            options={BOTH_MODES.map((item) => ({ value: item.value, label: item.label }))}
            onChange={(value) => setBothMode(value as BothHalvesMode)}
          />
        ) : null}
        {market === 'clean' ? (
          <FilterDropdown
            label="Table"
            value={cleanDir}
            options={CLEAN_DIRS.map((item) => ({ value: item.value, label: item.label }))}
            onChange={(value) => setCleanDir(value as CleanSheetDirection)}
          />
        ) : null}
        {market === 'btts' ? (
          <FilterDropdown
            label="League sort"
            value={leagueSort}
            options={LEAGUE_SORTS}
            onChange={(value) => setLeagueSort(value as LeagueSort)}
          />
        ) : null}
        {market === 'corners' && live.discipline?.hasCornerOvers ? (
          <FilterDropdown
            label="Corner line"
            value={cornerLine}
            options={CORNER_LINES.map((item) => ({ value: item, label: `Over ${item}` }))}
            onChange={setCornerLine}
          />
        ) : null}
        {market === 'offsides' && live.discipline?.hasOffsideOvers ? (
          <FilterDropdown
            label="Offside line"
            value={offsideLine}
            options={OFFSIDE_LINES.map((item) => ({ value: item, label: `Over ${item}` }))}
            onChange={setOffsideLine}
          />
        ) : null}
        {market === 'corners' && live.discipline?.hasCornerHalves ? (
          <FilterDropdown
            label="Half"
            value={half}
            options={HALVES.map((item) => ({ value: item.value, label: item.label }))}
            onChange={(value) => setHalf(value as HalfSide)}
          />
        ) : null}
      </View>

      <Text style={styles.sample}>
        {live.capped
          ? `Showing the ${live.loadedLeagues} most active leagues. Pick a country or league to load a tighter set. `
          : `${live.loadedLeagues} league${live.loadedLeagues === 1 ? '' : 's'} loaded. `}
        {index.matches} finished matches in this filter
        {index.leagues ? ` across ${index.leagues} league${index.leagues === 1 ? '' : 's'}` : ''}.
      </Text>

      {live.loading ? <ActivityIndicator color={theme.accentGreen} style={styles.spinner} /> : null}
      {live.error ? <Text style={styles.error}>{live.error}</Text> : null}

      {!live.loading && market === 'btts' ? (
        <BttsSections index={index} upcoming={live.upcoming} query={query} split={split} half={half} sort={leagueSort} />
      ) : null}
      {!live.loading && market === 'goals' ? (
        <GoalSections
          index={index}
          upcoming={live.upcoming}
          query={query}
          line={line}
          side={side}
          sort={leagueSort}
        />
      ) : null}
      {!live.loading && market === 'wdw' ? <WdwSection index={index} scope={scope} /> : null}
      {!live.loading && market === 'halves' ? <HalfSection index={index} scope={scope} half={half} /> : null}
      {!live.loading && market === 'both' ? <BothSection index={index} scope={scope} mode={bothMode} /> : null}
      {!live.loading && market === 'clean' ? <CleanSection index={index} scope={scope} direction={cleanDir} /> : null}
      {!live.loading && market === 'score' ? <ScoreSection index={index} /> : null}
      {!live.loading && needsLeague ? (
        <DisciplineSections
          market={market}
          hasLeague={Boolean(leagueId)}
          teams={live.discipline?.teams ?? []}
          feed={live.discipline}
          upcoming={live.upcoming}
          query={query}
          half={half}
          cornerLine={cornerLine}
          offsideLine={offsideLine}
        />
      ) : null}
    </View>
  );
}

function teamRows(rows: { team: string; league: string; played: number; hits: number; pct: number }[]) {
  return rows.map((row, index) => ({
    id: `${row.league}-${row.team}-${index}`,
    cells: {
      rank: String(index + 1),
      team: row.team,
      league: row.league,
      played: String(row.played),
      hits: String(row.hits),
      pct: pct(row.pct),
    },
  }));
}

function BttsSections({
  index,
  upcoming,
  query,
  split,
  half,
  sort,
}: {
  index: ReturnType<typeof buildFootyIndex>;
  upcoming: ReturnType<typeof useFootyStats>['upcoming'];
  query: { country: string | null; competitionId: number | null; kind: CompetitionKind; scope: Scope };
  split: BttsSplit;
  half: HalfSide;
  sort: LeagueSort;
}) {
  const summary = bttsSummary(index);
  const teams = rankBttsTeams(index, query.scope);
  const fixtures = upcomingBtts(index, upcoming, query);
  const leagues = rankLeagues(index, { kind: 'btts' }, sort, false);
  const splits = rankBttsSplit(index, query.scope, split);
  const halves = rankHalfBtts(index, query.scope, half);
  const splitLabel = SPLITS.find((item) => item.value === split)?.label ?? 'BTTS';
  const halfLabel = half === 'first' ? '1st half' : '2nd half';
  return (
    <>
      <Text style={styles.summary}>
        Both teams scored in {pct(summary.pct)} of {summary.matches} matches in this filter.
      </Text>
      <Block
        title="Top teams for BTTS"
        note={`Domestic runs are the default competition filter. Ranked by BTTS matches. Teams need ${MIN_RATE_MATCHES} games.`}>
        <FootyTable columns={TEAM_COLS} rows={teamRows(teams)} empty="No teams with enough matches in this filter." />
      </Block>
      <Block
        title="Matches with high BTTS potential"
        note={`Next 48 hours. Ranked by the average of the two teams’ BTTS rates. Leagues under ${MIN_LEAGUE_PROGRESS}% progress are hidden.`}>
        <UpcomingTable rows={fixtures} />
      </Block>
      <Block
        title="Top leagues for BTTS"
        note={`Leagues underway with at least ${MIN_LEAGUE_PROGRESS}% of matches played.`}>
        <LeagueTable rows={leagues} />
      </Block>
      <Block title={splitLabel} note="Share of this team’s matches that were both BTTS and this result.">
        <FootyTable columns={TEAM_COLS} rows={teamRows(splits)} empty="No teams with enough matches in this filter." />
      </Block>
      <Block title={`BTTS in the ${halfLabel}`} note="Only matches with a recorded half-time score.">
        <FootyTable columns={TEAM_COLS} rows={teamRows(halves)} empty="No half-time scores in this filter yet." />
      </Block>
    </>
  );
}

function GoalSections({
  index,
  upcoming,
  query,
  line,
  side,
  sort,
}: {
  index: ReturnType<typeof buildFootyIndex>;
  upcoming: ReturnType<typeof useFootyStats>['upcoming'];
  query: { country: string | null; competitionId: number | null; kind: CompetitionKind; scope: Scope };
  line: GoalLine;
  side: GoalSide;
  sort: LeagueSort;
}) {
  const summary = goalLineSummary(index, line, side);
  const label = `${side === 'over' ? 'Over' : 'Under'} ${line}`;
  const teams = rankGoalLineTeams(index, query.scope, line, side);
  const fixtures = upcomingGoalLine(index, upcoming, query, line, side);
  const leagues = rankLeagues(index, { kind: 'line', line, side }, sort, true);
  return (
    <>
      <Text style={styles.summary}>
        {label} landed in {pct(summary.pct)} of {summary.matches} matches in leagues that are still running.
      </Text>
      <Block title={`${label} — teams`} note="Leagues that have already finished the season are excluded.">
        <FootyTable columns={TEAM_COLS} rows={teamRows(teams)} empty="No teams with enough matches in this filter." />
      </Block>
      <Block
        title={`${label} — next 48 hours`}
        note={`Leagues under ${MIN_LEAGUE_PROGRESS}% progress, and leagues already finished, are hidden.`}>
        <UpcomingTable rows={fixtures} />
      </Block>
      <Block title={`${label} — leagues`} note={`Only leagues at ${MIN_LEAGUE_PROGRESS}% progress or more, and still running.`}>
        <LeagueTable rows={leagues} />
      </Block>
    </>
  );
}

function WdwSection({ index, scope }: { index: ReturnType<typeof buildFootyIndex>; scope: Scope }) {
  const rows = rankWdw(index, scope);
  const columns: FootyColumn[] = [
    { key: 'rank', label: '#', flex: 0.4 },
    { key: 'team', label: 'Team', flex: 1.5 },
    { key: 'league', label: 'League', flex: 1.3 },
    { key: 'played', label: 'Played', flex: 0.7 },
    { key: 'win', label: 'Win', flex: 0.7 },
    { key: 'draw', label: 'Draw', flex: 0.7 },
    { key: 'loss', label: 'Loss', flex: 0.7 },
    { key: 'home', label: 'Home win', flex: 0.8 },
    { key: 'away', label: 'Away win', flex: 0.8 },
  ];
  return (
    <Block title="Win, draw, win" note={`Win, draw, and loss follow the ${scope} filter. Home and away win use each venue.`}>
      <FootyTable
        columns={columns}
        empty="No teams with enough matches in this filter."
        rows={rows.map((row, i) => ({
          id: `${row.league}-${row.team}`,
          cells: {
            rank: String(i + 1),
            team: row.team,
            league: row.league,
            played: String(row.played),
            win: pct(row.winPct),
            draw: pct(row.drawPct),
            loss: pct(row.lossPct),
            home: maybePct(row.homeWinPct),
            away: maybePct(row.awayWinPct),
          },
        }))}
      />
    </Block>
  );
}

function HalfSection({
  index,
  scope,
  half,
}: {
  index: ReturnType<typeof buildFootyIndex>;
  scope: Scope;
  half: HalfSide;
}) {
  const rows = rankHalfGoals(index, scope, half);
  const label = half === 'first' ? '1st half' : '2nd half';
  const columns: FootyColumn[] = [
    { key: 'rank', label: '#', flex: 0.4 },
    { key: 'team', label: 'Team', flex: 1.6 },
    { key: 'league', label: 'League', flex: 1.4 },
    { key: 'played', label: 'Timed', flex: 0.7 },
    { key: 'avg', label: 'Avg goals', flex: 0.8 },
    { key: 'o05', label: '0.5+', flex: 0.7 },
    { key: 'o15', label: '1.5+', flex: 0.7 },
  ];
  return (
    <Block title={`${label} goals`} note="0.5+ means the team scored at least once in that half. 1.5+ means two or more.">
      <FootyTable
        columns={columns}
        empty="No half-time scores in this filter yet."
        rows={rows.map((row, i) => ({
          id: `${row.league}-${row.team}`,
          cells: {
            rank: String(i + 1),
            team: row.team,
            league: row.league,
            played: String(row.played),
            avg: row.avg.toFixed(1),
            o05: pct(row.over05),
            o15: pct(row.over15),
          },
        }))}
      />
    </Block>
  );
}

function BothSection({
  index,
  scope,
  mode,
}: {
  index: ReturnType<typeof buildFootyIndex>;
  scope: Scope;
  mode: BothHalvesMode;
}) {
  const rows = rankBothHalves(index, scope, mode);
  const title = mode === 'team' ? 'Teams that score in both halves' : 'Both teams to score in both halves';
  return (
    <Block title={title} note="Only matches with a half-time score.">
      <FootyTable columns={TEAM_COLS} rows={teamRows(rows)} empty="No half-time scores in this filter yet." />
    </Block>
  );
}

function CleanSection({
  index,
  scope,
  direction,
}: {
  index: ReturnType<typeof buildFootyIndex>;
  scope: Scope;
  direction: CleanSheetDirection;
}) {
  const rows = rankCleanSheets(index, scope, direction);
  const title = direction === 'most' ? 'Teams with most clean sheets' : 'Teams with least clean sheets';
  return (
    <Block title={title} note={`Minimum ${MIN_CLEAN_SHEET_MATCHES} matches. Ranked by clean-sheet count.`}>
      <FootyTable columns={TEAM_COLS} rows={teamRows(rows)} empty="No teams have played enough matches in this filter." />
    </Block>
  );
}

function ScoreSection({ index }: { index: ReturnType<typeof buildFootyIndex> }) {
  const rows = rankScorelines(index);
  const columns: FootyColumn[] = [
    { key: 'rank', label: '#', flex: 0.4 },
    { key: 'score', label: 'Full-time', flex: 1 },
    { key: 'pct', label: '%', flex: 0.8 },
    { key: 'count', label: 'Times', flex: 0.8 },
    { key: 'goals', label: 'Total goals', flex: 0.9 },
  ];
  return (
    <Block title="Frequent full-time scorelines" note="Each finished match in this filter is counted once.">
      <FootyTable
        columns={columns}
        empty="No finished matches in this filter."
        rows={rows.map((row, i) => ({
          id: row.score,
          cells: {
            rank: String(i + 1),
            score: row.score.replace('-', ' - '),
            pct: pct(row.pct),
            count: String(row.count),
            goals: String(row.goals),
          },
        }))}
      />
    </Block>
  );
}

function UpcomingTable({ rows }: { rows: { id: number; unix: number; home: string; away: string; league: string; homePct: number; awayPct: number; pct: number }[] }) {
  const columns: FootyColumn[] = [
    { key: 'ko', label: 'Kickoff', flex: 1.2 },
    { key: 'match', label: 'Match', flex: 2 },
    { key: 'league', label: 'League', flex: 1.3 },
    { key: 'home', label: 'Home', flex: 0.7 },
    { key: 'away', label: 'Away', flex: 0.7 },
    { key: 'pct', label: 'Match', flex: 0.7 },
  ];
  return (
    <FootyTable
      columns={columns}
      empty="No upcoming matches in leagues that have played enough of the season."
      rows={rows.map((row) => ({
        id: String(row.id),
        cells: {
          ko: kickoff(row.unix),
          match: `${row.home} vs ${row.away}`,
          league: row.league,
          home: pct(row.homePct),
          away: pct(row.awayPct),
          pct: pct(row.pct),
        },
      }))}
    />
  );
}

function LeagueTable({
  rows,
}: {
  rows: { league: string; country: string; played: number; progress: number | null; goals: number; avgGoals: number; pct: number }[];
}) {
  const columns: FootyColumn[] = [
    { key: 'rank', label: '#', flex: 0.4 },
    { key: 'league', label: 'League', flex: 1.6 },
    { key: 'country', label: 'Country', flex: 1.1 },
    { key: 'played', label: 'Played', flex: 0.7 },
    { key: 'progress', label: 'Progress', flex: 0.8 },
    { key: 'goals', label: 'Goals', flex: 0.7 },
    { key: 'avg', label: 'Avg', flex: 0.7 },
    { key: 'pct', label: '%', flex: 0.7 },
  ];
  return (
    <FootyTable
      columns={columns}
      empty="No leagues in this filter have reached 25% of the season."
      rows={rows.map((row, i) => ({
        id: `${row.country}-${row.league}`,
        cells: {
          rank: String(i + 1),
          league: row.league,
          country: row.country,
          played: String(row.played),
          progress: progressText(row.progress),
          goals: String(row.goals),
          avg: row.avgGoals.toFixed(1),
          pct: pct(row.pct),
        },
      }))}
    />
  );
}

function DisciplineSections({
  market,
  hasLeague,
  teams,
  feed,
  upcoming,
  query,
  half,
  cornerLine,
  offsideLine,
}: {
  market: MarketId;
  hasLeague: boolean;
  teams: DisciplineTeam[];
  feed: ReturnType<typeof useFootyStats>['discipline'];
  upcoming: ReturnType<typeof useFootyStats>['upcoming'];
  query: { country: string | null; competitionId: number | null; kind: CompetitionKind; scope: Scope };
  half: HalfSide;
  cornerLine: string;
  offsideLine: string;
}) {
  if (!hasLeague) {
    return (
      <Text style={styles.note}>
        Select one league. Corner, card, and offside totals are read from that league’s season feed, and only when the feed includes them.
      </Text>
    );
  }
  if (market === 'corners') return <CornerSection teams={teams} feed={feed} half={half} line={cornerLine} upcoming={upcoming} query={query} />;
  if (market === 'cards') return <CardSection teams={teams} feed={feed} />;
  return <OffsideSection teams={teams} feed={feed} line={offsideLine} upcoming={upcoming} query={query} />;
}

function CornerSection({
  teams,
  feed,
  half,
  line,
  upcoming,
  query,
}: {
  teams: DisciplineTeam[];
  feed: ReturnType<typeof useFootyStats>['discipline'];
  half: HalfSide;
  line: string;
  upcoming: ReturnType<typeof useFootyStats>['upcoming'];
  query: { country: string | null; competitionId: number | null; kind: CompetitionKind; scope: Scope };
}) {
  if (!feed?.hasCorners) {
    return <Text style={styles.note}>This league’s season feed has no corner totals.</Text>;
  }
  const ranked = teams
    .filter((team) => team.played >= MIN_CORNER_MATCHES && (team.matchCorners != null || team.cornersFor != null))
    .map((team) => ({
      team,
      match: perGame(team.matchCorners, team.played),
      forAvg: perGame(team.cornersFor, team.played),
      against: perGame(team.cornersAgainst, team.played),
    }))
    .sort(
      (a, b) =>
        (b.match ?? b.forAvg ?? 0) - (a.match ?? a.forAvg ?? 0) || a.team.name.localeCompare(b.team.name),
    );
  const columns: FootyColumn[] = [
    { key: 'rank', label: '#', flex: 0.4 },
    { key: 'team', label: 'Team', flex: 1.6 },
    { key: 'played', label: 'Played', flex: 0.7 },
    { key: 'match', label: 'Match / game', flex: 1 },
    { key: 'for', label: 'For / game', flex: 0.9 },
    { key: 'against', label: 'Against / game', flex: 1 },
  ];
  const valueFor = (competitionId: number, name: string) => {
    if (query.competitionId != null && competitionId !== query.competitionId) return null;
    const team = teams.find((item) => item.name === name);
    if (!team || team.played < MIN_CORNER_MATCHES) return null;
    return perGame(team.matchCorners, team.played);
  };
  const fixtures = rankUpcomingValues(upcoming, query, valueFor, 'avg');
  const halfKey = half === 'first' ? 'corners1h' : 'corners2h';
  const halfRows = feed.hasCornerHalves
    ? teams
        .filter((team) => team.played >= MIN_CORNER_MATCHES && team[halfKey] != null)
        .map((team) => ({ name: team.name, played: team.played, avg: perGame(team[halfKey], team.played) ?? 0 }))
        .sort((a, b) => b.avg - a.avg)
    : [];
  const overRows = feed.hasCornerOvers
    ? teams
        .filter((team) => team.played >= MIN_CORNER_MATCHES && team.cornerOver[line] != null)
        .map((team) => ({ name: team.name, played: team.played, pct: team.cornerOver[line] }))
        .sort((a, b) => b.pct - a.pct)
    : [];
  return (
    <>
      <Block title="Corners per game" note={`Teams with at least ${MIN_CORNER_MATCHES} matches. Match corners are the two teams combined when the feed provides both sides.`}>
        <FootyTable
          columns={columns}
          empty="No corner totals for teams that have played enough matches."
          rows={ranked.map((row, i) => ({
            id: row.team.name,
            cells: {
              rank: String(i + 1),
              team: row.team.name,
              played: String(row.team.played),
              match: maybeNum(row.match),
              for: maybeNum(row.forAvg),
              against: maybeNum(row.against),
            },
          }))}
        />
      </Block>
      {feed.hasCornerHalves ? (
        <Block title={half === 'first' ? '1st half corners' : '2nd half corners'} note="Average corners in that half, from the season feed.">
          <FootyTable
            columns={[
              { key: 'rank', label: '#', flex: 0.4 },
              { key: 'team', label: 'Team', flex: 1.6 },
              { key: 'played', label: 'Played', flex: 0.7 },
              { key: 'avg', label: 'Per game', flex: 0.8 },
            ]}
            empty="No teams with enough matches have half corner totals."
            rows={halfRows.map((row, i) => ({
              id: row.name,
              cells: { rank: String(i + 1), team: row.name, played: String(row.played), avg: row.avg.toFixed(1) },
            }))}
          />
        </Block>
      ) : (
        <Text style={styles.note}>This feed has no first-half and second-half corner split.</Text>
      )}
      <Block title="Upcoming matches with high average corners" note="Average of the two teams’ match-corners per game. Next 48 hours, leagues at 25% progress or more.">
        <UpcomingTable rows={fixtures} />
      </Block>
      {feed.hasCornerOvers ? (
        <Block title={`Over ${line} corners`} note="Percentage taken from the season feed. It is not estimated from the average.">
          <FootyTable
            columns={[
              { key: 'rank', label: '#', flex: 0.4 },
              { key: 'team', label: 'Team', flex: 1.6 },
              { key: 'played', label: 'Played', flex: 0.7 },
              { key: 'pct', label: '%', flex: 0.7 },
            ]}
            empty={`No Over ${line} corner percentages in this feed.`}
            rows={overRows.map((row, i) => ({
              id: row.name,
              cells: { rank: String(i + 1), team: row.name, played: String(row.played), pct: pct(row.pct) },
            }))}
          />
        </Block>
      ) : (
        <Text style={styles.note}>This feed has no over/under corner percentages.</Text>
      )}
    </>
  );
}

function CardSection({
  teams,
  feed,
}: {
  teams: DisciplineTeam[];
  feed: ReturnType<typeof useFootyStats>['discipline'];
}) {
  if (!feed?.hasCards) {
    return (
      <>
        <Text style={styles.note}>This league’s season feed has no yellow or red card totals.</Text>
        <Text style={styles.note}>Player bookings are not in the feed, so there is no list of players who are carded most.</Text>
      </>
    );
  }
  const rows = teams
    .filter((team) => team.played >= MIN_CARD_MATCHES && (team.yellows != null || team.reds != null))
    .map((team) => ({
      name: team.name,
      played: team.played,
      yellow: perGame(team.yellows, team.played),
      red: perGame(team.reds, team.played),
    }))
    .sort((a, b) => (b.yellow ?? -1) - (a.yellow ?? -1) || a.name.localeCompare(b.name));
  return (
    <>
      <Block title="Cards per match" note={`Teams with at least ${MIN_CARD_MATCHES} matches, ranked by yellow cards per game.`}>
        <FootyTable
          columns={[
            { key: 'rank', label: '#', flex: 0.4 },
            { key: 'team', label: 'Team', flex: 1.6 },
            { key: 'played', label: 'Played', flex: 0.7 },
            { key: 'yellow', label: 'Yellow / game', flex: 1 },
            { key: 'red', label: 'Red / game', flex: 1 },
          ]}
          empty="No card totals for teams that have played enough matches."
          rows={rows.map((row, i) => ({
            id: row.name,
            cells: {
              rank: String(i + 1),
              team: row.name,
              played: String(row.played),
              yellow: maybeNum(row.yellow),
              red: maybeNum(row.red),
            },
          }))}
        />
      </Block>
      <Text style={styles.note}>Player bookings are not in the feed, so there is no list of players who are carded most.</Text>
    </>
  );
}

function OffsideSection({
  teams,
  feed,
  line,
  upcoming,
  query,
}: {
  teams: DisciplineTeam[];
  feed: ReturnType<typeof useFootyStats>['discipline'];
  line: string;
  upcoming: ReturnType<typeof useFootyStats>['upcoming'];
  query: { country: string | null; competitionId: number | null; kind: CompetitionKind; scope: Scope };
}) {
  if (!feed?.hasOffsides) {
    return <Text style={styles.note}>This league’s season feed has no offside totals.</Text>;
  }
  const rows = teams
    .filter((team) => team.played >= MIN_OFFSIDE_MATCHES && team.offsides != null)
    .map((team) => ({ name: team.name, played: team.played, avg: perGame(team.offsides, team.played) ?? 0 }))
    .sort((a, b) => b.avg - a.avg);
  const valueFor = (competitionId: number, name: string) => {
    if (query.competitionId != null && competitionId !== query.competitionId) return null;
    const team = rows.find((item) => item.name === name);
    return team ? team.avg : null;
  };
  const fixtures = rankUpcomingValues(upcoming, query, valueFor, 'sum');
  const overRows = feed.hasOffsideOvers
    ? teams
        .filter((team) => team.played >= MIN_OFFSIDE_MATCHES && team.offsideOver[line] != null)
        .map((team) => ({ name: team.name, played: team.played, pct: team.offsideOver[line] }))
        .sort((a, b) => b.pct - a.pct)
    : [];
  return (
    <>
      <Block title="Teams with the most offsides" note="Offsides of this team only, per game.">
        <FootyTable
          columns={[
            { key: 'rank', label: '#', flex: 0.4 },
            { key: 'team', label: 'Team', flex: 1.6 },
            { key: 'played', label: 'Played', flex: 0.7 },
            { key: 'avg', label: 'Per game', flex: 0.8 },
          ]}
          empty="No offside totals for teams that have played enough matches."
          rows={rows.map((row, i) => ({
            id: row.name,
            cells: { rank: String(i + 1), team: row.name, played: String(row.played), avg: row.avg.toFixed(1) },
          }))}
        />
      </Block>
      <Block title="Upcoming matches with high average offsides" note="Home offsides per game plus away offsides per game. Next 48 hours.">
        <UpcomingTable rows={fixtures} />
      </Block>
      {feed.hasOffsideOvers ? (
        <Block title={`Over ${line} match offsides`} note="Percentage taken from the season feed.">
          <FootyTable
            columns={[
              { key: 'rank', label: '#', flex: 0.4 },
              { key: 'team', label: 'Team', flex: 1.6 },
              { key: 'played', label: 'Played', flex: 0.7 },
              { key: 'pct', label: '%', flex: 0.7 },
            ]}
            empty={`No Over ${line} offside percentages in this feed.`}
            rows={overRows.map((row, i) => ({
              id: row.name,
              cells: { rank: String(i + 1), team: row.name, played: String(row.played), pct: pct(row.pct) },
            }))}
          />
        </Block>
      ) : (
        <Text style={styles.note}>This feed has no over/under offside percentages.</Text>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    maxWidth: 1100,
    gap: spacing.md,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 28,
    color: theme.textPrimary,
    letterSpacing: 0.4,
  },
  blurb: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: theme.textMuted,
    lineHeight: 21,
  },
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  sample: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: theme.textPrimary,
    lineHeight: 20,
  },
  summary: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: theme.textPrimary,
  },
  spinner: {
    marginVertical: spacing.md,
  },
  error: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: theme.loss,
  },
  block: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  blockTitle: {
    fontFamily: fonts.displaySemi,
    fontSize: 18,
    color: theme.textPrimary,
  },
  note: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: theme.textMuted,
    lineHeight: 19,
  },
});
