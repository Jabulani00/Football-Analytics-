import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useQueries } from '@tanstack/react-query';

import DragScroll from '@/components/shared/DragScroll';
import FilterDropdown from '@/components/shared/FilterDropdown';
import PageControls, { PAGE_SIZE } from '@/components/shared/PageControls';
import { useAllGradingLeagues } from '@/hooks/useLiveCompetitions';
import { fetchAllFixturesBetween, seasonWindowUnix } from '@/services/oddAlerts';
import { clientStaleTime } from '@/services/oddAlertsCachePolicy';
import { analyzeTeamGames, GAP_MARKETS, type GapMarket, type GapPeriod, type GapRate } from '@/utils/gapAnalytics';
import { fonts, layout, spacing, theme } from '@/styles/theme';

type FinderView = 'leagues' | 'teams';
const PERIODS: { value: GapPeriod; label: string }[] = [{ value: 'fulltime', label: 'Full time' }, { value: 'firsthalf', label: 'First half' }, { value: 'secondhalf', label: 'Second half' }];
const TEAM_LIMIT = 200;
const MAX_GAP_LEAGUES = 200;
const MAX_PARALLEL_GAP_FETCHES = 4;
let activeGapFetches = 0;
const waitingGapFetches: Array<() => void> = [];

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
};
type LeagueGapRow = {
  competition: string;
  home: GapRate | null;
  away: GapRate | null;
  overall: GapRate | null;
  gap: number | null;
};

function valueText(value: number | null): string {
  if (value == null) return '—';
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
function rateText(rate: GapRate | null): string { return rate?.percent == null ? '—' : `${rate.percent.toFixed(1)}%`; }
function rateDetail(rate: GapRate | null): string { return rate ? `${rate.hits}/${rate.games}` : '—'; }
export default function UnityFinderPanel() {
  const { width, height } = useWindowDimensions();
  const narrow = width < 720;
  const [helpOpen, setHelpOpen] = useState(false);
  const [period, setPeriod] = useState<GapPeriod>('fulltime');
  const [market, setMarket] = useState<GapMarket>('scored');

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
          const fixtures = await fetchAllFixturesBetween({ fromUnix, toUnix, competitions: String(comp.id), maxPages: 6 }, signal);
          return fixtures;
        }),
        staleTime: clientStaleTime('stats/season'),
      };
    }),
  });
  const sig = results.map((r, i) => (r.data ? `${leagues[i]?.id}:${r.dataUpdatedAt}` : '')).join('|');
  const settled = results.filter((r) => r.isSuccess || r.isError).length;

  const comparisons = useMemo(() => {
    const leagueRows: LeagueGapRow[] = [];
    const allTeams: TeamGapRow[] = [];
    results.forEach((r, i) => {
      if (!r.data || !leagues[i]) return;
      const competition = `${leagues[i].name} · ${leagues[i].country}`;
      const rows = analyzeTeamGames(r.data, period, market);
      if (!rows.length) return;
      const teams = rows.map((t) => ({ ...t, competition }));
      allTeams.push(...teams);
      const combine = (key: 'home' | 'away' | 'overall'): GapRate => {
        const games = teams.reduce((s, t) => s + t[key].games, 0); const hits = teams.reduce((s, t) => s + t[key].hits, 0);
        return { games, hits, percent: games ? 100 * hits / games : null };
      };
      const home = combine('home'); const away = combine('away');
      const overall = combine('overall');
      leagueRows.push({ competition, home, away, overall, gap: home.percent == null || away.percent == null ? null : Math.abs(home.percent - away.percent) });
    });
    const calculated = new Set(leagueRows.map((row) => row.competition));
    for (const league of leagues) {
      const competition = `${league.name} · ${league.country}`;
      if (!calculated.has(competition)) leagueRows.push({ competition, home: null, away: null, overall: null, gap: null });
    }
    return {
      leagues: leagueRows.sort((a, b) => (b.gap ?? -1) - (a.gap ?? -1) || a.competition.localeCompare(b.competition)),
      teams: allTeams.sort((a, b) => (b.gap ?? -1) - (a.gap ?? -1) || a.team.localeCompare(b.team)),
    };
    // The data timestamp signature changes when any league query resolves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, leagues, period, market]);
  const mergedLeagues = comparisons.leagues;
  const teamRows = useMemo(() => {
    let rows = comparisons.teams;
    if (leagueFilter !== 'all') rows = rows.filter((r) => r.competition === leagueFilter);
    const q = query.trim().toLowerCase();
    if (q) rows = rows.filter((r) => r.team.toLowerCase().includes(q) || r.competition.toLowerCase().includes(q));
    return rows.sort((a, b) => (b.gap ?? -1) - (a.gap ?? -1) || a.team.localeCompare(b.team)).slice(0, TEAM_LIMIT);
  }, [comparisons, leagueFilter, query]);

  useEffect(() => setPage(1), [view, leagueFilter, query]);

  const loading = leagueFeed.loading || settled < leagues.length;
  const failed = results.filter((r) => r.isError).length;

  const listLen = view === 'leagues' ? mergedLeagues.length : teamRows.length;
  const pages = Math.max(1, Math.ceil(listLen / PAGE_SIZE));
  const safe = Math.min(page, pages);
  const start = (safe - 1) * PAGE_SIZE;
  const visibleLeagues = mergedLeagues.slice(start, start + PAGE_SIZE);
  const visibleTeams = teamRows.slice(start, start + PAGE_SIZE);

  const leagueOptions = [{ value: 'all', label: `All leagues (${mergedLeagues.length})` }, ...mergedLeagues.map((l) => ({ value: l.competition, label: l.competition }))];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Gap Analytics</Text>
        <Text style={styles.subtitle}>Compare how often a selected result happens at home, away and overall. The Gap is the difference between home and away percentages.</Text>
      </View>
      <View style={styles.viewRow}>
        {([['leagues', 'Leagues (LL)'], ['teams', 'League Amongst Leagues']] as [FinderView, string][]).map(([v, label]) => {
          const on = view === v;
          return <Pressable key={v} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setView(v)} style={[styles.viewBtn, on && styles.viewBtnOn]}><Text style={[styles.viewBtnText, on && styles.viewBtnTextOn]}>{label}</Text></Pressable>;
        })}
        <Pressable accessibilityRole="button" accessibilityLabel="Explain the tables" onPress={() => setHelpOpen(true)} style={styles.helpButton}><Text style={styles.helpButtonText}>ⓘ Table guide</Text></Pressable>
      </View>

      <View style={styles.statusRow}>
        {loading ? <><ActivityIndicator size="small" color={theme.accentGreen} /><Text style={styles.statusMuted}>{leagueFeed.loading ? 'Loading current leagues…' : `Loading completed games · ${settled}/${leagues.length} leagues${failed ? ` · ${failed} unavailable` : ''}…`}</Text></> : <Text style={styles.statusLive}>● {comparisons.leagues.filter((row) => row.gap != null).length} of {leagues.length} leagues · {comparisons.teams.length} teams</Text>}
      </View>

      <View style={styles.filterCard}>
        <Text style={styles.topListNote}>Scoring period</Text>
        <View style={styles.choiceRow}>{PERIODS.map((item) => <Pressable key={item.value} onPress={() => setPeriod(item.value)} style={[styles.choice, period === item.value && styles.choiceOn]}><Text style={[styles.choiceText, period === item.value && styles.choiceTextOn]}>{item.label}</Text></Pressable>)}</View>
        <Text style={styles.topListNote}>Stat to compare</Text>
        <View style={styles.choiceRow}>{GAP_MARKETS.map((item) => <Pressable key={item.key} onPress={() => setMarket(item.key)} style={[styles.choice, market === item.key && styles.choiceOn]}><Text style={[styles.choiceText, market === item.key && styles.choiceTextOn]}>{item.label}</Text></Pressable>)}</View>
        <Text style={styles.topListNote}>Each percentage is qualifying games ÷ games with usable scores. First- and second-half rates include only matches with a half-time score.</Text>
      </View>

      {leagueFeed.error ? <Text style={styles.empty}>Could not load the league list: {leagueFeed.error}</Text> : null}
      {!leagueFeed.loading && leagues.length > 0 && loading ? <Text style={styles.hint}>Showing up to {MAX_GAP_LEAGUES} current domestic leagues, prioritized by season games played. Names appear first; completed home/away game counts fill in as results load.</Text> : null}

      {!loading && mergedLeagues.length === 0 ? <Text style={styles.empty}>No home/away data is available for this stat yet.</Text> : null}

      {!leagueFeed.loading && leagues.length > 0 && view === 'leagues' ? (
        <>
          <PageControls page={safe} pages={pages} total={mergedLeagues.length} from={start + 1} to={start + visibleLeagues.length} onChange={setPage} />
          <DragScroll horizontal style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            <View style={[styles.table, { minWidth: 1040 }]}>
              <View style={[styles.row, styles.headRow]}>
                <Text style={[styles.cRank, styles.headText, styles.right]}>#</Text>
                <Text style={[styles.cLeague, styles.headText]}>League (LL)</Text>
                <Text style={[styles.cNum, styles.headText, styles.right]}>Home hits/games</Text><Text style={[styles.cNum, styles.headText, styles.right]}>Home %</Text>
                <Text style={[styles.cNum, styles.headText, styles.right]}>Away hits/games</Text><Text style={[styles.cNum, styles.headText, styles.right]}>Away %</Text>
                <Text style={[styles.cNum, styles.headText, styles.right]}>Overall hits/games</Text><Text style={[styles.cNum, styles.headText, styles.right]}>Overall %</Text>
                <Text style={[styles.cNum, styles.headText, styles.right]}>Gap (pp)</Text>
              </View>
              {visibleLeagues.map((l, i) => <Pressable key={l.competition} accessibilityRole="button" accessibilityLabel={`View ${l.competition} team home and away gaps`} onPress={() => { setLeagueFilter(l.competition); setQuery(''); setView('teams'); setPage(1); }} style={({ pressed }) => [styles.row, i % 2 === 1 && styles.rowAlt, pressed && styles.rowPressed]}>
                <Text style={[styles.cRank, styles.numDa]}>{start + i + 1}</Text>
                <Text style={[styles.cLeague, styles.league]} numberOfLines={1}>{l.competition}</Text>
                <Text style={[styles.cNum, styles.num]}>{rateDetail(l.home)}</Text><Text style={[styles.cNum, styles.num]}>{rateText(l.home)}</Text>
                <Text style={[styles.cNum, styles.num]}>{rateDetail(l.away)}</Text><Text style={[styles.cNum, styles.num]}>{rateText(l.away)}</Text>
                <Text style={[styles.cNum, styles.num]}>{rateDetail(l.overall)}</Text><Text style={[styles.cNum, styles.num]}>{rateText(l.overall)}</Text>
                <Text style={[styles.cNum, styles.numStrong]}>{valueText(l.gap)}</Text>
              </Pressable>)}
            </View>
          </DragScroll>
          <Text style={styles.hint}>n = games / qualifying games. League rates are weighted across teams. Gap (pp) = absolute home-versus-away percentage-point difference. Select a league for its teams.</Text>
        </>
      ) : null}

      {!leagueFeed.loading && leagues.length > 0 && view === 'teams' ? (
        <>
          <View style={styles.filterCard}>
            <FilterDropdown label="League" value={leagueFilter} options={leagueOptions} onChange={setLeagueFilter} style={narrow ? styles.full : styles.flex} />
            <Text style={styles.topListNote}>Ranked by largest Home/Away Gap first · showing up to {TEAM_LIMIT} teams.</Text>
            <TextInput value={query} onChangeText={setQuery} placeholder="Search team or league…" placeholderTextColor={theme.textFaint} style={styles.search} />
          </View>
          {leagueFilter !== 'all' ? <Text style={styles.selectedLeagueTitle}>{leagueFilter} · team home/away figures</Text> : null}
          <View style={styles.statusRow}><Text style={styles.statusMuted}>{teamRows.length} teams shown · sorted by Gap</Text></View>
          {teamRows.length === 0 ? <Text style={styles.empty}>{loading ? `Team results are loading · ${settled}/${leagues.length} leagues checked.` : 'No teams match this selection.'}</Text> : <>
            <PageControls page={safe} pages={pages} total={teamRows.length} from={start + 1} to={start + visibleTeams.length} onChange={setPage} />
            <DragScroll horizontal style={styles.scroll} contentContainerStyle={styles.scrollContent}>
              <View style={[styles.table, { minWidth: 1160 }]}>
                <View style={[styles.row, styles.headRow]}>
                  <Text style={[styles.cRank, styles.headText, styles.right]}>#</Text>
                  <Text style={[styles.cTeam, styles.headText]}>Team</Text>
                  <Text style={[styles.cLeagueT, styles.headText]}>League</Text>
                  <Text style={[styles.cNum, styles.headText, styles.right]}>Home hits/games</Text><Text style={[styles.cNum, styles.headText, styles.right]}>Home %</Text>
                  <Text style={[styles.cNum, styles.headText, styles.right]}>Away hits/games</Text><Text style={[styles.cNum, styles.headText, styles.right]}>Away %</Text>
                  <Text style={[styles.cNum, styles.headText, styles.right]}>Overall hits/games</Text><Text style={[styles.cNum, styles.headText, styles.right]}>Overall %</Text>
                  <Text style={[styles.cNum, styles.headText, styles.right]}>Gap (pp)</Text>
                </View>
                {visibleTeams.map((r, i) => <View key={`${r.competition}-${r.team}`} style={[styles.row, i % 2 === 1 && styles.rowAlt]}>
                  <Text style={[styles.cRank, styles.numDa]}>{start + i + 1}</Text>
                  <Text style={[styles.cTeam, styles.team]} numberOfLines={1}>{r.team}</Text>
                  <Text style={[styles.cLeagueT, styles.compText]} numberOfLines={1}>{r.competition}</Text>
                  <Text style={[styles.cNum, styles.num]}>{rateDetail(r.home)}</Text><Text style={[styles.cNum, styles.num]}>{rateText(r.home)}</Text>
                  <Text style={[styles.cNum, styles.num]}>{rateDetail(r.away)}</Text><Text style={[styles.cNum, styles.num]}>{rateText(r.away)}</Text>
                  <Text style={[styles.cNum, styles.num]}>{rateDetail(r.overall)}</Text><Text style={[styles.cNum, styles.num]}>{rateText(r.overall)}</Text>
                  <Text style={[styles.cNum, styles.numStrong]}>{valueText(r.gap)}</Text>
                </View>)}
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
              <Text style={styles.helpSectionTitle}>Counts, percentages and Gap</Text>
              <Text style={styles.helpText}>“n” shows qualifying games / games counted. The percentage is qualifying games divided by games with a usable score. Overall combines a team’s home and away games. Gap (pp) is the absolute difference between Home % and Away %, in percentage points. The largest Gap ranks first.</Text>
              <Text style={styles.helpSectionTitle}>Leagues (LL)</Text>
              <Text style={styles.helpText}>League counts and percentages combine the eligible team games in that league, weighted by their game counts. Select a league row to inspect the team results.</Text>
              <Text style={styles.helpSectionTitle}>League Amongst Leagues</Text>
              <Text style={styles.helpText}>Each row shows the selected stat for one team at home, away, and overall. Teams are ordered by the home/away percentage-point Gap; the list shows up to {TEAM_LIMIT} teams.</Text>
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
  rowAlt: { backgroundColor: theme.surfaceHover },
  rowPressed: { backgroundColor: 'rgba(5,150,105,0.10)' },
  headText: { fontFamily: fonts.bodySemiBold, fontSize: 10, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 4 },
  right: { textAlign: 'right' },
  cRank: { width: 44, paddingHorizontal: 4, textAlign: 'right' },
  cLeague: { flex: 1, minWidth: 150, paddingHorizontal: 4 },
  cLeagueT: { width: 160, paddingHorizontal: 4 },
  cTeam: { flex: 1, minWidth: 140, paddingHorizontal: 4 },
  cNum: { width: 102, paddingHorizontal: 4 },
  muted: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted, textAlign: 'right' },
  league: { fontFamily: fonts.bodyMedium, fontSize: 13, color: theme.textPrimary },
  team: { fontFamily: fonts.bodyMedium, fontSize: 13, color: theme.textPrimary },
  compText: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted },
  num: { fontFamily: fonts.body, fontSize: 12, color: theme.textPrimary, textAlign: 'right' },
  numStrong: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.textPrimary, textAlign: 'right' },
  numDa: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.accentGreen, textAlign: 'right' },

  hint: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted, textAlign: 'center', marginTop: spacing.sm },
});
