import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useQueries } from '@tanstack/react-query';

import DragScroll from '@/components/shared/DragScroll';
import FilterDropdown from '@/components/shared/FilterDropdown';
import PageControls, { PAGE_SIZE } from '@/components/shared/PageControls';
import { useAllGradingLeagues } from '@/hooks/useLiveCompetitions';
import { fetchAllFixturesBetween, fetchSeasonStandings, seasonWindowUnix } from '@/services/oddAlerts';
import { clientStaleTime } from '@/services/oddAlertsCachePolicy';
import { analyzeTeamGames, dominantVenue, dominanceIndex, GAP_MARKETS, MIN_RANK_GAMES_OVERALL, MIN_RANK_GAMES_PER_VENUE, type DominanceVenue, type GapMarket, type GapPeriod, type GapRate } from '@/utils/gapAnalytics';
import { fonts, layout, spacing, theme } from '@/styles/theme';

type FinderView = 'leagues' | 'teams' | 'allTeams';
const PERIODS: { value: GapPeriod; label: string }[] = [{ value: 'fulltime', label: 'Full time' }, { value: 'firsthalf', label: 'First half' }, { value: 'secondhalf', label: 'Second half' }];
const VENUE_FILTERS: { value: DominanceVenue; label: string }[] = [{ value: 'balanced', label: 'Balanced' }, { value: 'home', label: 'Home' }, { value: 'away', label: 'Away' }];
const TABLE_BANDS = ['Top', 'Middle', 'Bottom'] as const;
const DA_BANDS = ['DA', 'Lean DA', 'None DA'] as const;
const TEAM_LIMIT = 200;
const MAX_GAP_LEAGUES = 200;
const MAX_PARALLEL_GAP_FETCHES = 4;
let activeGapFetches = 0;
const waitingGapFetches: (() => void)[] = [];

async function withGapFetchSlot<T>(task: () => Promise<T>): Promise<T> {
  if (activeGapFetches >= MAX_PARALLEL_GAP_FETCHES) {
    await new Promise<void>((resolve) => waitingGapFetches.push(resolve));
  }
  activeGapFetches += 1;
  try {
    return await task();
  } finally {
    activeGapFetches -= 1;
    waitingGapFetches.shift()?.();
  }
}

type TeamGapRow = {
  team: string;
  competition: string;
  home: GapRate;
  away: GapRate;
  overall: GapRate;
  gap: number | null;
  index: number | null;
  dominant: 'Home' | 'Away' | 'Balanced' | null;
  leaguePosition: number | null;
  tableBand: 'Top' | 'Middle' | 'Bottom' | null;
  played: number | null;
  won: number | null;
  drawn: number | null;
  lost: number | null;
  goalsFor: number | null;
  goalsAgainst: number | null;
  goalDiff: number | null;
  points: number | null;
  daBand: DaBand | null;
  gapRankInLeague: number | null;
  gapRankTotal: number;
  statRankInLeague: number | null;
  statRankTotal: number;
  worldRank: number | null;
};
/** Dominance from the home–away gap: 0–15 None DA, 16–24 Lean DA, 25+ DA. */
type DaBand = 'DA' | 'Lean DA' | 'None DA';
type TableThird = 'Top' | 'Middle' | 'Bottom';
type LeagueGapRow = {
  competition: string;
  home: GapRate | null;
  away: GapRate | null;
  overall: GapRate | null;
  gap: number | null;
  index: number | null;
  dominant: 'Home' | 'Away' | 'Balanced' | null;
  daBand: DaBand | null;
};

function valueText(value: number | null): string {
  if (value == null) return '—';
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
function percentText(percent: number | null): string { return percent == null ? '—' : `${percent.toFixed(1)}%`; }
function rateText(rate: GapRate | null): string { return percentText(rate?.percent ?? null); }
function rateDetail(rate: GapRate | null): string { return rate ? `${rate.hits}/${rate.games}` : '—'; }
function venueText(side: 'Home' | 'Away' | 'Balanced' | null, gap: number | null): string {
  if (!side) return '—';
  return side === 'Balanced' ? side : `${side} dominant · ${valueText(gap)}pp`;
}
function tierColor(tier: TableThird | null): string {
  return tier === 'Top' ? theme.accentGreen : tier === 'Middle' ? theme.yellow : tier === 'Bottom' ? theme.loss : theme.textMuted;
}
function tierBackground(tier: TableThird | null): string {
  return tier === 'Top' ? 'rgba(5,150,105,0.10)' : tier === 'Middle' ? 'rgba(234,179,8,0.12)' : tier === 'Bottom' ? 'rgba(220,38,38,0.08)' : theme.surfaceMuted;
}
function daColor(band: DaBand | null): string {
  return band === 'DA' ? theme.accentGreen : band === 'Lean DA' ? theme.yellow : band === 'None DA' ? theme.loss : theme.textMuted;
}
function daBackground(band: DaBand | null): string {
  return band === 'DA' ? 'rgba(5,150,105,0.10)' : band === 'Lean DA' ? 'rgba(234,179,8,0.12)' : band === 'None DA' ? 'rgba(220,38,38,0.08)' : theme.surfaceMuted;
}
/** None DA 0–15, Lean DA 16–24, DA 25+ — measured on the home–away gap (pp). */
function daBandForGap(gap: number | null): DaBand | null {
  if (gap == null) return null;
  return gap < 16 ? 'None DA' : gap < 25 ? 'Lean DA' : 'DA';
}
export default function UnityFinderPanel() {
  const { width, height } = useWindowDimensions();
  const narrow = width < 720;
  const [helpOpen, setHelpOpen] = useState(false);
  const [period, setPeriod] = useState<GapPeriod>('fulltime');
  const [market, setMarket] = useState<GapMarket>('scored');
  const [venueFilter, setVenueFilter] = useState<DominanceVenue>('balanced');
  const [tierFilter, setTierFilter] = useState<'all' | (typeof TABLE_BANDS)[number]>('all');
  const [daTierFilter, setDaTierFilter] = useState<'all' | DaBand>('all');
  const [dominanceSideFilter, setDominanceSideFilter] = useState<'all' | 'Home' | 'Away' | 'Balanced'>('all');

  const leagueFeed = useAllGradingLeagues();
  const leagues = useMemo(() => [...leagueFeed.leagues]
    .sort((a, b) => (b.seasonPlayed ?? -1) - (a.seasonPlayed ?? -1) || a.country.localeCompare(b.country) || a.name.localeCompare(b.name))
    .slice(0, MAX_GAP_LEAGUES), [leagueFeed.leagues]);

  const [view, setView] = useState<FinderView>('leagues');
  const [leagueFilter, setLeagueFilter] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  const results = useQueries({
    queries: leagues.map((comp) => {
      const { fromUnix, toUnix } = seasonWindowUnix(comp.season ?? '');
      return {
        queryKey: ['home-away-game-gap', comp.id, comp.season] as const,
        queryFn: ({ signal }: { signal: AbortSignal }) => withGapFetchSlot(async () => {
          // Pull the whole season: a large page size plus a high page cap so even
          // a 20–24 team league (380–552 matches) loads in full, not the first 6 pages.
          const fixtures = await fetchAllFixturesBetween({ fromUnix, toUnix, competitions: String(comp.id), perPage: 250, maxPages: 12 }, signal);
          return fixtures;
        }),
        staleTime: clientStaleTime('stats/season'),
      };
    }),
  });
  const standingsResults = useQueries({
    queries: leagues.map((comp) => ({
      queryKey: ['gap-analytics-standings', comp.seasonId] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => comp.seasonId == null
        ? Promise.resolve([])
        : withGapFetchSlot(() => fetchSeasonStandings(comp.seasonId!, signal)),
      enabled: comp.seasonId != null,
      staleTime: clientStaleTime('stats/season'),
    })),
  });
  const sig = results.map((r, i) => (r.data ? `${leagues[i]?.id}:${r.dataUpdatedAt}` : '')).join('|');
  const standingsSig = standingsResults.map((r) => r.dataUpdatedAt).join('|');
  const settled = results.filter((r) => r.isSuccess || r.isError).length;
  const standingsSettled = standingsResults.filter((r, i) => r.isSuccess || r.isError || leagues[i]?.seasonId == null).length;
  const standingsFailed = standingsResults.filter((r) => r.isError).length;

  const comparisons = useMemo(() => {
    const leagueRows: LeagueGapRow[] = [];
    const allTeams: TeamGapRow[] = [];
    results.forEach((r, i) => {
      if (!r.data || !leagues[i]) return;
      const competition = `${leagues[i].name} · ${leagues[i].country}`;
      const rows = analyzeTeamGames(r.data, period, market);
      if (!rows.length) return;
      const standings = standingsResults[i].data ?? [];
      const standingById = new Map(standings.map((s) => [s.teamId, s]));
      const baseTeams = rows.map((t) => {
        const standing = t.teamId == null ? undefined : standingById.get(t.teamId);
        const tableBand: TeamGapRow['tableBand'] = standing?.zone === 'top' ? 'Top' : standing?.zone === 'mid' ? 'Middle' : standing?.zone === 'bottom' ? 'Bottom' : null;
        const index = dominanceIndex(market, t.home, t.away, venueFilter);
        return { ...t, competition, index, dominant: dominantVenue(market, t.home, t.away), leaguePosition: standing?.rank ?? null, tableBand, played: standing?.played ?? null, won: standing?.won ?? null, drawn: standing?.drawn ?? null, lost: standing?.lost ?? null, goalsFor: standing?.goalsFor ?? null, goalsAgainst: standing?.goalsAgainst ?? null, goalDiff: standing?.goalDiff ?? null, points: standing?.points ?? null, daBand: index == null ? null : daBandForGap(t.gap), gapRankInLeague: null as number | null, gapRankTotal: 0, statRankInLeague: null as number | null, statRankTotal: 0, worldRank: null as number | null };
      });
      const rankableByGap = baseTeams.filter((t) => t.index != null && t.gap != null).sort((a, b) => (b.gap ?? -1) - (a.gap ?? -1) || a.team.localeCompare(b.team));
      rankableByGap.forEach((t, rank) => { t.gapRankInLeague = rank + 1; t.gapRankTotal = rankableByGap.length; });
      const rankableByStat = baseTeams.filter((t) => t.index != null).sort((a, b) => (b.index ?? -1) - (a.index ?? -1) || b.overall.games - a.overall.games || a.team.localeCompare(b.team));
      rankableByStat.forEach((t, rank) => { t.statRankInLeague = rank + 1; t.statRankTotal = rankableByStat.length; });
      const teams = baseTeams;
      allTeams.push(...teams);
      // League rankings only summarize teams with an official table row, so leagues
      // OddAlerts has no standings for don't rank across leagues.
      const qualified = teams.filter((t) => t.index != null && t.leaguePosition != null);
      if (!qualified.length) return;
      const combine = (key: 'home' | 'away' | 'overall'): GapRate => {
        const games = qualified.reduce((s, t) => s + t[key].games, 0); const hits = qualified.reduce((s, t) => s + t[key].hits, 0);
        return { games, hits, percent: games ? 100 * hits / games : null };
      };
      const home = combine('home'); const away = combine('away');
      const overall = combine('overall');
      const index = dominanceIndex(market, home, away, venueFilter);
      const leagueGap = home.percent == null || away.percent == null ? null : Math.abs(home.percent - away.percent);
      leagueRows.push({ competition, home, away, overall, gap: leagueGap, index, dominant: dominantVenue(market, home, away), daBand: index == null ? null : daBandForGap(leagueGap) });
    });
    const calculated = new Set(leagueRows.map((row) => row.competition));
    for (const league of leagues) {
      const competition = `${league.name} · ${league.country}`;
      if (!calculated.has(competition)) leagueRows.push({ competition, home: null, away: null, overall: null, gap: null, index: null, dominant: null, daBand: null });
    }
    const teamOrder = (a: TeamGapRow, b: TeamGapRow) => (b.index ?? -1) - (a.index ?? -1) || b.overall.games - a.overall.games || a.team.localeCompare(b.team);
    const leagueOrder = (a: LeagueGapRow, b: LeagueGapRow) => (b.index ?? -1) - (a.index ?? -1) || (b.overall?.games ?? 0) - (a.overall?.games ?? 0) || a.competition.localeCompare(b.competition);
    const sortedLeagues = leagueRows.sort(leagueOrder);
    const globallyRanked = allTeams.sort(teamOrder);
    // The cross-league World ranking requires an official table row, so teams from
    // leagues without standings are left out of "Teams amongst leagues".
    globallyRanked.filter((t) => t.index != null && t.leaguePosition != null).slice(0, TEAM_LIMIT).forEach((t, rank) => { t.worldRank = rank + 1; });
    return {
      leagues: sortedLeagues,
      teams: globallyRanked,
    };
    // The data timestamp signature changes when any league query resolves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, leagues, period, market, standingsSig, venueFilter]);
  const q = query.trim().toLowerCase();
  const allLeagues = comparisons.leagues;
  const mergedLeagues = useMemo(() => comparisons.leagues.filter((row) => {
    if (q && !row.competition.toLowerCase().includes(q)) return false;
    if (daTierFilter !== 'all' && row.daBand !== daTierFilter) return false;
    if (dominanceSideFilter !== 'all' && row.dominant !== dominanceSideFilter) return false;
    return true;
  }), [comparisons, q, daTierFilter, dominanceSideFilter]);
  const teamRows = useMemo(() => {
    let rows = comparisons.teams;
    if (leagueFilter !== 'all') rows = rows.filter((r) => r.competition === leagueFilter);
    if (view === 'allTeams') rows = rows.filter((r) => r.worldRank != null);
    if (tierFilter !== 'all') rows = rows.filter((r) => r.tableBand === tierFilter);
    if (daTierFilter !== 'all') rows = rows.filter((r) => r.daBand === daTierFilter);
    if (q) rows = rows.filter((r) => r.team.toLowerCase().includes(q) || r.competition.toLowerCase().includes(q));
    if (dominanceSideFilter !== 'all') rows = rows.filter((r) => r.dominant === dominanceSideFilter);
    return rows.sort((a, b) => (b.index ?? -1) - (a.index ?? -1) || b.overall.games - a.overall.games || a.team.localeCompare(b.team)).slice(0, TEAM_LIMIT);
  }, [comparisons, leagueFilter, q, tierFilter, daTierFilter, view, dominanceSideFilter]);

  useEffect(() => setPage(1), [view, leagueFilter, query, tierFilter, daTierFilter, venueFilter, dominanceSideFilter]);
  useEffect(() => {
    if (view === 'teams' && leagueFilter === 'all' && leagues.length) {
      setLeagueFilter(`${leagues[0].name} · ${leagues[0].country}`);
    }
  }, [view, leagueFilter, leagues]);

  const loading = leagueFeed.loading || settled < leagues.length;
  const failed = results.filter((r) => r.isError).length;

  const listLen = view === 'leagues' ? mergedLeagues.length : teamRows.length;
  const pages = Math.max(1, Math.ceil(listLen / PAGE_SIZE));
  const safe = Math.min(page, pages);
  const start = (safe - 1) * PAGE_SIZE;
  const visibleLeagues = mergedLeagues.slice(start, start + PAGE_SIZE);
  const visibleTeams = teamRows.slice(start, start + PAGE_SIZE);

  const leagueOptions = [
    ...(view === 'allTeams' ? [{ value: 'all', label: `All leagues (${allLeagues.length})` }] : []),
    ...allLeagues.map((l) => ({ value: l.competition, label: l.competition })),
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Gap Analytics</Text>
        <Text style={styles.subtitle}>Compare how often a selected result happens at home, away and overall. The Gap is the difference between home and away percentages.</Text>
      </View>
      <View style={styles.viewRow}>
        {([['leagues', 'League rankings'], ['teams', 'Teams in one league'], ['allTeams', 'Teams amongst leagues (S over L)']] as [FinderView, string][]).map(([v, label]) => {
          const on = view === v;
          return <Pressable key={v} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => { if (v === 'allTeams') setLeagueFilter('all'); setView(v); }} style={[styles.viewBtn, on && styles.viewBtnOn]}><Text style={[styles.viewBtnText, on && styles.viewBtnTextOn]}>{label}</Text></Pressable>;
        })}
        <Pressable accessibilityRole="button" accessibilityLabel="Explain the tables" onPress={() => setHelpOpen(true)} style={styles.helpButton}><Text style={styles.helpButtonText}>ⓘ Table guide</Text></Pressable>
      </View>

      <View style={styles.statusRow}>
        {loading || standingsSettled < leagues.length ? <><ActivityIndicator size="small" color={theme.accentGreen} /><Text style={styles.statusMuted}>{leagueFeed.loading ? 'Loading current leagues…' : `Loading games ${settled}/${leagues.length} · league tables ${standingsSettled}/${leagues.length}${failed ? ` · ${failed} game feeds unavailable` : ''}${standingsFailed ? ` · ${standingsFailed} league tables unavailable` : ''}…`}</Text></> : <Text style={styles.statusLive}>● {comparisons.leagues.filter((row) => row.index != null).length} ranked leagues · {comparisons.teams.filter((row) => row.index != null).length} ranked teams</Text>}
      </View>

      <View style={styles.filterCard}>
        <Text style={styles.topListNote}>Scoring period</Text>
        <View style={styles.choiceRow}>{PERIODS.map((item) => <Pressable key={item.value} onPress={() => setPeriod(item.value)} style={[styles.choice, period === item.value && styles.choiceOn]}><Text style={[styles.choiceText, period === item.value && styles.choiceTextOn]}>{item.label}</Text></Pressable>)}</View>
        <Text style={styles.topListNote}>Stat to compare</Text>
        <View style={styles.choiceRow}>{GAP_MARKETS.map((item) => <Pressable key={item.key} onPress={() => setMarket(item.key)} style={[styles.choice, market === item.key && styles.choiceOn]}><Text style={[styles.choiceText, market === item.key && styles.choiceTextOn]}>{item.label}</Text></Pressable>)}</View>
        <Text style={styles.topListNote}>Dominance check</Text>
        <View style={styles.choiceRow}>{VENUE_FILTERS.map((item) => <Pressable key={item.value} onPress={() => setVenueFilter(item.value)} style={[styles.choice, venueFilter === item.value && styles.choiceOn]}><Text style={[styles.choiceText, venueFilter === item.value && styles.choiceTextOn]}>{item.label}</Text></Pressable>)}</View>
        <Text style={styles.topListNote}>For a rank: {MIN_RANK_GAMES_OVERALL}+ counted games overall, with at least {MIN_RANK_GAMES_PER_VENUE} at home and {MIN_RANK_GAMES_PER_VENUE} away. First- and second-half samples include only matches with a half-time score.</Text>
      </View>

      {leagueFeed.error ? <Text style={styles.empty}>Could not load the league list: {leagueFeed.error}</Text> : null}
      {!leagueFeed.loading && leagues.length > 0 && loading ? <Text style={styles.hint}>Showing up to {MAX_GAP_LEAGUES} current domestic leagues, prioritized by season games played. Names appear first; completed home/away game counts fill in as results load.</Text> : null}

      {!loading && mergedLeagues.length === 0 ? <Text style={styles.empty}>No home/away data is available for this stat yet.</Text> : null}

      {!leagueFeed.loading && leagues.length > 0 && view === 'leagues' ? (
        <>
          <View style={styles.filterCard}>
            <Text style={styles.topListNote}>Search leagues</Text>
            <TextInput value={query} onChangeText={setQuery} placeholder="Search league or country…" placeholderTextColor={theme.textFaint} style={styles.search} />
            <Text style={styles.topListNote}>DA · None DA 0–15 · Lean DA 16–24 · DA 25+ gap (pp)</Text>
            <View style={styles.choiceRow}>{(['all', ...DA_BANDS] as const).map((band) => <Pressable key={band} onPress={() => setDaTierFilter(band)} style={[styles.choice, daTierFilter === band && { borderColor: band === 'all' ? theme.accentGreen : daColor(band), backgroundColor: band === 'all' ? 'rgba(5,150,105,0.08)' : daBackground(band) }]}><Text style={[styles.choiceText, daTierFilter === band && { color: band === 'all' ? theme.accentGreen : daColor(band) }]}>{band === 'all' ? 'All DA' : band}</Text></Pressable>)}</View>
            <Text style={styles.topListNote}>Dominant venue</Text>
            <View style={styles.choiceRow}>{(['all', 'Home', 'Away', 'Balanced'] as const).map((side) => <Pressable key={side} onPress={() => setDominanceSideFilter(side)} style={[styles.choice, dominanceSideFilter === side && styles.choiceOn]}><Text style={[styles.choiceText, dominanceSideFilter === side && styles.choiceTextOn]}>{side === 'all' ? 'All venues' : side}</Text></Pressable>)}</View>
          </View>
          <PageControls page={safe} pages={pages} total={mergedLeagues.length} from={start + 1} to={start + visibleLeagues.length} onChange={setPage} />
          <DragScroll horizontal style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            <View style={[styles.table, { minWidth: 1140 }]}>
              <View style={[styles.row, styles.headRow]}>
                <Text style={[styles.cRank, styles.headText, styles.right]}>DA #</Text>
                <Text style={[styles.cLeague, styles.headText]}>League</Text>
                <Text style={[styles.cNum, styles.headText]}>DA</Text>
                <Text style={[styles.cNum, styles.headText, styles.right]}>Home hits/games</Text><Text style={[styles.cNum, styles.headText, styles.right]}>Home %</Text>
                <Text style={[styles.cNum, styles.headText, styles.right]}>Away hits/games</Text><Text style={[styles.cNum, styles.headText, styles.right]}>Away %</Text>
                <Text style={[styles.cNum, styles.headText, styles.right]}>Overall hits/games</Text><Text style={[styles.cNum, styles.headText, styles.right]}>Overall %</Text>
                <Text style={[styles.cNum, styles.headText, styles.right]}>Gap (pp)</Text><Text style={[styles.cNum, styles.headText]}>Dominant venue</Text><Text style={[styles.cNum, styles.headText, styles.right]}>DA score</Text>
              </View>
              {([...DA_BANDS, null] as const).map((band) => {
                const group = visibleLeagues.filter((row) => row.daBand === band);
                if (!group.length) return null;
                return <View key={band ?? 'unranked-leagues'}>
                  <View style={[styles.sectionRow, { backgroundColor: daBackground(band) }]}><Text style={[styles.sectionTitle, { color: daColor(band) }]}>{band ? `${band} · ${band === 'DA' ? '25+' : band === 'Lean DA' ? '16–24' : '0–15'} gap` : 'Not ranked · sample unavailable'}</Text></View>
                  {group.map((l) => {
                    const rank = comparisons.leagues.findIndex((row) => row.competition === l.competition) + 1;
                    return <Pressable key={l.competition} accessibilityRole="button" accessibilityLabel={`View ${l.competition} team home and away gaps`} onPress={() => { setLeagueFilter(l.competition); setQuery(''); setView('teams'); setPage(1); }} style={({ pressed }) => [styles.row, { backgroundColor: daBackground(band) }, pressed && styles.rowPressed]}>
                      <Text style={[styles.cRank, styles.numDa]}>{l.index == null ? '—' : `#${rank}`}</Text>
                      <Text style={[styles.cLeague, styles.league]} numberOfLines={1}>{l.competition}</Text>
                      <Text style={[styles.cNum, styles.numStrong, { color: daColor(band) }]}>{band ?? '—'}</Text>
                      <Text style={[styles.cNum, styles.num]}>{rateDetail(l.home)}</Text><Text style={[styles.cNum, styles.num]}>{rateText(l.home)}</Text>
                      <Text style={[styles.cNum, styles.num]}>{rateDetail(l.away)}</Text><Text style={[styles.cNum, styles.num]}>{rateText(l.away)}</Text>
                      <Text style={[styles.cNum, styles.num]}>{rateDetail(l.overall)}</Text><Text style={[styles.cNum, styles.num]}>{rateText(l.overall)}</Text>
                      <Text style={[styles.cNum, styles.num]}>{valueText(l.gap)}</Text><Text style={[styles.cNum, styles.num]}>{venueText(l.dominant, l.gap)}</Text><Text style={[styles.cNum, styles.numStrong]}>{percentText(l.index)}</Text>
                    </Pressable>;
                  })}
                </View>;
              })}
            </View>
          </DragScroll>
          <Text style={styles.hint}>League rankings compare individual league summaries using teams that meet the sample rule. Click a league to open its S over L table. DA equally weights league Home % and Away %; eligible game count breaks ties.</Text>
        </>
      ) : null}

      {!leagueFeed.loading && leagues.length > 0 && (view === 'teams' || view === 'allTeams') ? (
        <>
          <View style={styles.filterCard}>
            <FilterDropdown label="League" value={leagueFilter} options={leagueOptions} onChange={setLeagueFilter} style={narrow ? styles.full : styles.flex} />
            <View><Text style={styles.topListNote}>DA · None DA 0–15 · Lean DA 16–24 · DA 25+ gap (pp)</Text><View style={styles.choiceRow}>{(['all', ...DA_BANDS] as const).map((band) => <Pressable key={band} onPress={() => setDaTierFilter(band)} style={[styles.choice, daTierFilter === band && styles.choiceOn]}><Text style={[styles.choiceText, daTierFilter === band && styles.choiceTextOn]}>{band === 'all' ? 'All DA' : band}</Text></Pressable>)}</View></View>
            <View><Text style={styles.topListNote}>Official league table third</Text><View style={styles.choiceRow}>{(['all', ...TABLE_BANDS] as const).map((band) => <Pressable key={band} onPress={() => setTierFilter(band)} style={[styles.choice, tierFilter === band && { borderColor: band === 'all' ? theme.accentGreen : tierColor(band), backgroundColor: band === 'all' ? 'rgba(5,150,105,0.08)' : tierBackground(band) }]}><Text style={[styles.choiceText, tierFilter === band && { color: band === 'all' ? theme.accentGreen : tierColor(band) }]}>{band === 'all' ? 'All thirds' : band}</Text></Pressable>)}</View></View>
            <View><Text style={styles.topListNote}>Dominant venue</Text><View style={styles.choiceRow}>{(['all', 'Home', 'Away', 'Balanced'] as const).map((side) => <Pressable key={side} onPress={() => setDominanceSideFilter(side)} style={[styles.choice, dominanceSideFilter === side && styles.choiceOn]}><Text style={[styles.choiceText, dominanceSideFilter === side && styles.choiceTextOn]}>{side === 'all' ? 'All venues' : side}</Text></Pressable>)}</View></View>
            <Text style={styles.topListNote}>{view === 'allTeams' ? `Top ${TEAM_LIMIT} eligible teams across leagues, ranked by DA; World # stays fixed when filters narrow the list.` : 'Teams in the selected league, ranked by DA.'} A rank needs 8+ total games, including 4+ home and 4+ away. The cross-league World # additionally needs an official league table, so leagues without standings don't appear in Teams amongst leagues. DA (None DA / Lean DA / DA) comes from the home–away gap and is shown separately from the official table position.</Text>
            <TextInput value={query} onChangeText={setQuery} placeholder="Search team or league…" placeholderTextColor={theme.textFaint} style={styles.search} />
          </View>
          {leagueFilter !== 'all' ? <Text style={styles.selectedLeagueTitle}>{leagueFilter} · team home/away figures</Text> : null}
          <View style={styles.statusRow}><Text style={styles.statusMuted}>{teamRows.filter((r) => r.index != null).length} ranked of {teamRows.length} teams shown · grouped Top, Middle, Bottom by official league table</Text></View>
          {teamRows.length === 0 ? <Text style={styles.empty}>{loading ? `Team results are loading · ${settled}/${leagues.length} leagues checked.` : 'No teams match this selection.'}</Text> : <>
            <PageControls page={safe} pages={pages} total={teamRows.length} from={start + 1} to={start + visibleTeams.length} onChange={setPage} />
            <DragScroll horizontal style={styles.scroll} contentContainerStyle={styles.scrollContent}>
              <View style={[styles.table, { minWidth: 2320 }]}>
                <View style={[styles.row, styles.headRow]}>
                  <Text style={[styles.cRank, styles.headText, styles.right]}>DA #</Text>
                  <Text style={[styles.cTeam, styles.headText]}>Team</Text>
                  <Text style={[styles.cLeagueT, styles.headText]}>League</Text>
                  <Text style={[styles.cNum, styles.headText, styles.right]}>League pos</Text>
                  <Text style={[styles.cNum, styles.headText]}>DA</Text>
                  <Text style={[styles.cNum, styles.headText]}>Table third</Text>
                  <Text style={[styles.cStat, styles.headText, styles.right]}>P</Text>
                  <Text style={[styles.cStat, styles.headText, styles.right]}>W</Text>
                  <Text style={[styles.cStat, styles.headText, styles.right]}>D</Text>
                  <Text style={[styles.cStat, styles.headText, styles.right]}>L</Text>
                  <Text style={[styles.cStat, styles.headText, styles.right]}>GF</Text>
                  <Text style={[styles.cStat, styles.headText, styles.right]}>GA</Text>
                  <Text style={[styles.cStat, styles.headText, styles.right]}>GD</Text>
                  <Text style={[styles.cStat, styles.headText, styles.right]}>Pts</Text>
                  <Text style={[styles.cNum, styles.headText, styles.right]}>Gap rank (L)</Text>
                  <Text style={[styles.cNum, styles.headText, styles.right]}>Stat rank (L)</Text>
                  <Text style={[styles.cNum, styles.headText, styles.right]}>World #</Text>
                  <Text style={[styles.cNum, styles.headText, styles.right]}>Home hits/games</Text><Text style={[styles.cNum, styles.headText, styles.right]}>Home %</Text>
                  <Text style={[styles.cNum, styles.headText, styles.right]}>Away hits/games</Text><Text style={[styles.cNum, styles.headText, styles.right]}>Away %</Text>
                  <Text style={[styles.cNum, styles.headText, styles.right]}>Overall hits/games</Text><Text style={[styles.cNum, styles.headText, styles.right]}>Overall %</Text>
                  <Text style={[styles.cNum, styles.headText, styles.right]}>Gap (pp)</Text><Text style={[styles.cNum, styles.headText]}>Dominant venue</Text><Text style={[styles.cNum, styles.headText, styles.right]}>DA score</Text>
                </View>
                {(['Top', 'Middle', 'Bottom', null] as const).map((band) => {
                  const groupRows = visibleTeams.filter((r) => r.tableBand === band);
                  if (!groupRows.length) return null;
                  return <View key={band ?? 'no-table-position'}>
                    <View style={[styles.sectionRow, { backgroundColor: tierBackground(band) }]}><Text style={[styles.sectionTitle, { color: tierColor(band) }]}>{band ? `${band} of the league table` : 'No league table position'}</Text></View>
                    {groupRows.map((r) => {
                      const rank = teamRows.findIndex((row) => row.competition === r.competition && row.team === r.team) + 1;
                      return <View key={`${r.competition}-${r.team}`} style={[styles.row, rank % 2 === 0 && styles.rowAlt, { backgroundColor: tierBackground(r.tableBand) }]}>
                        <Text style={[styles.cRank, styles.numDa]}>{r.index == null ? '—' : rank}</Text>
                        <Text style={[styles.cTeam, styles.team]} numberOfLines={1}>{r.team}</Text>
                        <Text style={[styles.cLeagueT, styles.compText]} numberOfLines={1}>{r.competition}</Text>
                        <Text style={[styles.cNum, styles.num]}>{r.leaguePosition == null ? '—' : `#${r.leaguePosition}`}</Text>
                        <Text style={[styles.cNum, styles.num]}>{r.daBand ?? '—'}</Text>
                        <Text style={[styles.cNum, styles.numStrong, { color: tierColor(r.tableBand) }]}>{r.tableBand ?? '—'}</Text>
                        <Text style={[styles.cStat, styles.num]}>{valueText(r.played)}</Text>
                        <Text style={[styles.cStat, styles.num]}>{valueText(r.won)}</Text>
                        <Text style={[styles.cStat, styles.num]}>{valueText(r.drawn)}</Text>
                        <Text style={[styles.cStat, styles.num]}>{valueText(r.lost)}</Text>
                        <Text style={[styles.cStat, styles.num]}>{valueText(r.goalsFor)}</Text>
                        <Text style={[styles.cStat, styles.num]}>{valueText(r.goalsAgainst)}</Text>
                        <Text style={[styles.cStat, styles.num]}>{r.goalDiff == null ? '—' : r.goalDiff > 0 ? `+${r.goalDiff}` : String(r.goalDiff)}</Text>
                        <Text style={[styles.cStat, styles.numStrong]}>{valueText(r.points)}</Text>
                        <Text style={[styles.cNum, styles.num]}>{r.gapRankInLeague == null ? '—' : `#${r.gapRankInLeague}/${r.gapRankTotal}`}</Text>
                        <Text style={[styles.cNum, styles.num]}>{r.statRankInLeague == null ? '—' : `#${r.statRankInLeague}/${r.statRankTotal}`}</Text>
                        <Text style={[styles.cNum, styles.numStrong]}>{r.worldRank == null ? '—' : `#${r.worldRank}`}</Text>
                        <Text style={[styles.cNum, styles.num]}>{rateDetail(r.home)}</Text><Text style={[styles.cNum, styles.num]}>{rateText(r.home)}</Text>
                        <Text style={[styles.cNum, styles.num]}>{rateDetail(r.away)}</Text><Text style={[styles.cNum, styles.num]}>{rateText(r.away)}</Text>
                        <Text style={[styles.cNum, styles.num]}>{rateDetail(r.overall)}</Text><Text style={[styles.cNum, styles.num]}>{rateText(r.overall)}</Text>
                        <Text style={[styles.cNum, styles.num]}>{valueText(r.gap)}</Text><Text style={[styles.cNum, styles.num]}>{venueText(r.dominant, r.gap)}</Text><Text style={[styles.cNum, styles.numStrong]}>{percentText(r.index)}</Text>
                      </View>;
                    })}
                  </View>;
                })}
              </View>
            </DragScroll>
            <PageControls page={safe} pages={pages} total={teamRows.length} from={start + 1} to={start + visibleTeams.length} onChange={setPage} />
          </>}
        </>
      ) : null}

      <Modal visible={helpOpen} transparent animationType="fade" onRequestClose={() => setHelpOpen(false)}>
        <View style={styles.helpModal}>
          <Pressable style={styles.helpBackdrop} onPress={() => setHelpOpen(false)} accessibilityLabel="Close explanation" />
          <View style={[styles.helpSheet, { maxHeight: Math.max(300, Math.round(height * 0.82)) }]}>
            <View style={styles.helpHeader}><View style={styles.helpHeaderCopy}><Text style={styles.helpTitle}>Gap Analytics guide</Text><Text style={styles.helpIntro}>Choose a scoring period and stat, then compare home, away and overall results.</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close explanation" onPress={() => setHelpOpen(false)} style={styles.helpClose}><Text style={styles.helpCloseText}>Close</Text></Pressable></View>
            <ScrollView style={styles.helpScroll} contentContainerStyle={styles.helpContent}>
              <Text style={styles.helpSectionTitle}>The selected stat and period</Text>
              <Text style={styles.helpText}>Pick a result (such as Team scored, Win, Both teams scored, or Over 2.5 goals) and Full time, First half or Second half. The same definition is used for every league and team, so comparisons are like-for-like.</Text>
              <Text style={styles.helpSectionTitle}>Minimum games for a rank</Text>
              <Text style={styles.helpText}>A team needs at least 8 counted matches overall — at least 4 at home and at least 4 away — before it receives a DA ranking or league Gap rank. Within a single selected league, teams rank on this sample alone. The cross-league World # and League rankings additionally need an official league table, so leagues OddAlerts has no standings for (many youth, reserve and lower-tier competitions) don't appear across leagues. The table still shows available counts and rates while a team builds its sample.</Text>
              <Text style={styles.helpSectionTitle}>Counts, percentages and Gap</Text>
              <Text style={styles.helpText}>“n” shows qualifying games / games counted. Overall combines a team’s home and away games. Gap (pp) is the absolute difference between Home % and Away %, in percentage points. The dominant venue says which side has the more favorable rate; Loss and Conceded are inverted for that comparison.</Text>
              <Text style={styles.helpSectionTitle}>DA score (ranking order)</Text>
              <Text style={styles.helpText}>For each team, take the selected result’s Home % and Away %, then average them equally: DA score = (Home % + Away %) ÷ 2. The two venues count the same even if the team has played more games at one venue. For “Team loss” and “Team conceded,” lower is better, so those rates are reversed before the average. The DA score runs 0–100 and sets the ranking order.</Text>
              <Text style={styles.helpSectionTitle}>DA (from the Gap)</Text>
              <Text style={styles.helpText}>Gap = the absolute difference between Home % and Away %, shown in percentage points. DA classifies that gap: 0–15 is None DA, 16–24 is Lean DA, and 25 or more is DA. The League rankings group and colour by DA; the team tables show DA as a plain column and group by the official league-table third instead.</Text>
              <Text style={styles.helpSectionTitle}>Dominance check filter</Text>
              <Text style={styles.helpText}>Balanced ranks by the equally weighted Home and Away rates. Home ranks by the Home rate only; Away ranks by the Away rate only. The 8 overall / 4 home / 4 away sample minimum still applies in every mode. Gap continues to show the home-away difference.</Text>
              <Text style={styles.helpSectionTitle}>League rankings</Text>
              <Text style={styles.helpText}>Compares individual league summaries. Select a league row to open its teams in S over L.</Text>
              <Text style={styles.helpSectionTitle}>Teams in one league</Text>
              <Text style={styles.helpText}>Shows teams within one selected league, grouped and coloured by the official league-table third (Top, Middle, Bottom of the standings). Filter by that third or by the separate DA (None DA / Lean DA / DA, from the gap). Each team shows its official table position and full standings stats — P (played), W, D, L, GF, GA, GD and Pts — alongside its DA, Stat rank (L) for the selected dominance check and Gap rank among eligible teams in that league.</Text>
              <Text style={styles.helpSectionTitle}>Teams amongst leagues · S over L</Text>
              <Text style={styles.helpText}>Shows only the top {TEAM_LIMIT} teams worldwide across the selected league set, ranked by the current dominance check. Rows are grouped and coloured by the official league-table third (Top green, Middle yellow, Bottom red); DA (None DA / Lean DA / DA) is a plain column. World # is their position in the full Top 200. Filtering by league or tier keeps that worldwide position visible. Each team also shows its position and stat/Gap rank within its own league.</Text>
              <Text style={styles.helpSectionTitle}>Data used</Text>
              <Text style={styles.helpText}>Only completed fixtures in the current season count. Half-time and second-half calculations exclude matches without a valid half-time score. A postponed, upcoming or live game does not count. Rates use only games with the scores needed for that stat.</Text>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', alignSelf: 'stretch' },
  header: { marginBottom: spacing.md },
  title: { fontFamily: fonts.display, fontSize: 24, color: theme.textPrimary, marginBottom: spacing.xs },
  subtitle: { fontFamily: fonts.body, fontSize: 13, lineHeight: 20, color: theme.textMuted },
  helpButton: { borderWidth: layout.borderWidth, borderColor: theme.accentGreen, borderRadius: 999, paddingHorizontal: spacing.md, paddingVertical: 7, backgroundColor: 'rgba(5,150,105,0.06)' },
  helpButtonText: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: theme.accentGreen },
  helpModal: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.md },
  helpBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15, 23, 42, 0.55)' },
  helpSheet: { width: '100%', maxWidth: 680, borderWidth: layout.borderWidth, borderColor: theme.border, borderRadius: 16, backgroundColor: theme.surface, padding: spacing.md, gap: spacing.sm },
  helpHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  helpHeaderCopy: { flex: 1, gap: 3 },
  helpTitle: { fontFamily: fonts.display, fontSize: 20, color: theme.textPrimary },
  helpIntro: { fontFamily: fonts.body, fontSize: 12, lineHeight: 18, color: theme.textMuted },
  helpClose: { borderWidth: layout.borderWidth, borderColor: theme.border, borderRadius: layout.borderRadius, paddingHorizontal: spacing.md, paddingVertical: 7 },
  helpCloseText: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: theme.textPrimary },
  helpScroll: { flexGrow: 0 },
  helpContent: { gap: spacing.sm, paddingBottom: spacing.sm },
  helpSectionTitle: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: theme.accentGreen, marginTop: spacing.xs },
  helpText: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: theme.textPrimary },

  toolbar: {
    flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm,
    borderWidth: layout.borderWidth, borderColor: theme.border, borderRadius: layout.borderRadius,
    backgroundColor: theme.surface, padding: spacing.md,
  },
  flex: { flexGrow: 1, flexBasis: 180, minWidth: 150 },
  full: { width: '100%', minWidth: 0, flexBasis: 'auto', flexGrow: 0 },

  viewRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  viewBtn: { flex: 1, borderWidth: 1.5, borderColor: theme.border, borderRadius: layout.borderRadius, paddingVertical: spacing.sm, alignItems: 'center', backgroundColor: theme.surface },
  viewBtnOn: { borderColor: theme.accentGreen, backgroundColor: 'rgba(5,150,105,0.08)' },
  viewBtnText: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.textMuted },
  viewBtnTextOn: { color: theme.accentGreen },

  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 20, marginTop: spacing.md },
  statusLive: { fontFamily: fonts.bodyMedium, fontSize: 12, color: theme.accentGreen },
  statusMuted: { fontFamily: fonts.body, fontSize: 12, color: theme.textMuted },
  empty: { fontFamily: fonts.body, fontSize: 13, color: theme.textMuted, textAlign: 'center', paddingVertical: spacing.lg },

  filterCard: {
    marginTop: spacing.md, borderWidth: layout.borderWidth, borderColor: theme.border, borderRadius: layout.borderRadius,
    backgroundColor: theme.surface, padding: spacing.md, gap: spacing.sm,
  },
  topListNote: { fontFamily: fonts.body, fontSize: 12, lineHeight: 18, color: theme.textMuted },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  choice: { borderWidth: layout.borderWidth, borderColor: theme.border, borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 6, backgroundColor: theme.surfaceHover },
  choiceOn: { borderColor: theme.accentGreen, backgroundColor: 'rgba(5,150,105,0.08)' },
  choiceText: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted },
  choiceTextOn: { fontFamily: fonts.bodySemiBold, color: theme.accentGreen },
  selectedLeagueTitle: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: theme.textPrimary, marginTop: spacing.md },
  search: {
    borderWidth: layout.borderWidth, borderColor: theme.border, borderRadius: layout.borderRadius,
    paddingHorizontal: spacing.md, paddingVertical: 9, fontFamily: fonts.body, fontSize: 13, color: theme.textPrimary, backgroundColor: theme.surfaceHover,
  },

  scroll: { width: '100%', maxWidth: '100%', marginTop: spacing.sm },
  scrollContent: { minWidth: '100%' },
  table: {
    width: '100%', backgroundColor: theme.surface, borderWidth: layout.borderWidth,
    borderColor: theme.border, borderRadius: layout.borderRadius, overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, paddingHorizontal: spacing.sm },
  headRow: { backgroundColor: theme.surfaceMuted, borderBottomWidth: layout.borderWidth, borderBottomColor: theme.border },
  sectionRow: { width: '100%', backgroundColor: theme.surfaceMuted, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderTopWidth: layout.borderWidth, borderTopColor: theme.border },
  sectionTitle: { fontFamily: fonts.bodySemiBold, fontSize: 11, color: theme.accentGreen, textTransform: 'uppercase', letterSpacing: 0.5 },
  rowAlt: { backgroundColor: theme.surfaceHover },
  rowPressed: { backgroundColor: 'rgba(5,150,105,0.10)' },
  headText: { fontFamily: fonts.bodySemiBold, fontSize: 10, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 4 },
  right: { textAlign: 'right' },
  cRank: { width: 44, paddingHorizontal: 4, textAlign: 'right' },
  cLeague: { flex: 1, minWidth: 150, paddingHorizontal: 4 },
  cLeagueT: { width: 160, paddingHorizontal: 4 },
  cTeam: { flex: 1, minWidth: 140, paddingHorizontal: 4 },
  cNum: { width: 102, paddingHorizontal: 4 },
  cStat: { width: 46, paddingHorizontal: 4 },
  muted: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted, textAlign: 'right' },
  league: { fontFamily: fonts.bodyMedium, fontSize: 13, color: theme.textPrimary },
  team: { fontFamily: fonts.bodyMedium, fontSize: 13, color: theme.textPrimary },
  compText: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted },
  num: { fontFamily: fonts.body, fontSize: 12, color: theme.textPrimary, textAlign: 'right' },
  numStrong: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.textPrimary, textAlign: 'right' },
  numDa: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.accentGreen, textAlign: 'right' },

  hint: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted, textAlign: 'center', marginTop: spacing.sm },
});
