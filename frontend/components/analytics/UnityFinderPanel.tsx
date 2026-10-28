import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useQueries } from '@tanstack/react-query';

import DragScroll from '@/components/shared/DragScroll';
import FilterDropdown from '@/components/shared/FilterDropdown';
import PageControls, { PAGE_SIZE } from '@/components/shared/PageControls';
import { useLiveCompetitionFeed } from '@/hooks/useLiveCompetitions';
import { fetchAllFixturesBetween, seasonWindowUnix } from '@/services/oddAlerts';
import { clientStaleTime } from '@/services/oddAlertsCachePolicy';
import { buildLeagueStatsLive } from '@/services/statsBuilder';
import {
  teamMeasuresForSection,
  sectionStats,
  type TeamMeasure,
} from '@/utils/unity';
import { DOMINANCE_STATS } from '@/utils/dominance';
import { fonts, layout, spacing, theme } from '@/styles/theme';

type UnityView = 'leagues' | 'teams';
const TEAM_LIMIT = 200;

type TeamGapRow = {
  team: string;
  competition: string;
  home: number;
  away: number;
  gap: number;
};
type LeagueGapRow = {
  competition: string;
  home: number;
  away: number;
  gap: number;
  teams: number;
};

function valueText(value: number, statKey: string): string {
  const stat = DOMINANCE_STATS.find((item) => item.key === statKey);
  return `${value.toFixed(stat?.decimals ?? 1)}${stat?.pctBased ? '%' : ''}`;
}
export default function UnityFinderPanel() {
  const { width, height } = useWindowDimensions();
  const narrow = width < 720;
  const [helpOpen, setHelpOpen] = useState(false);

  const feed = useLiveCompetitionFeed(3);
  const leagues = useMemo(() => feed.competitions.filter((c) => c.rank === 0), [feed.competitions]);

  const stats = useMemo(() => sectionStats('homeaway'), []);
  const [statKey, setStatKey] = useState<string>('sc_pct');
  useEffect(() => {
    if (!stats.some((s) => s.key === statKey)) setStatKey(stats[0]?.key ?? '');
  }, [stats, statKey]);

  const [view, setView] = useState<UnityView>('leagues');
  const [leagueFilter, setLeagueFilter] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  const results = useQueries({
    queries: leagues.map((comp) => {
      const { fromUnix, toUnix } = seasonWindowUnix(comp.season ?? '');
      return {
        queryKey: ['unity-league', comp.id, comp.season] as const,
        queryFn: () => buildLeagueStatsLive((o) => fetchAllFixturesBetween(o), { competitionId: comp.id, fromUnix, toUnix, season: comp.season }),
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
      const measured: TeamMeasure[] = teamMeasuresForSection(r.data, 'homeaway', statKey);
      const rows = measured.filter((t): t is TeamMeasure & { home: number; away: number } => t.home != null && t.away != null);
      if (!rows.length) return;
      const teams = rows.map((t) => ({ team: t.team, competition, home: t.home, away: t.away, gap: Math.abs(t.home - t.away) }));
      allTeams.push(...teams);
      const home = teams.reduce((sum, t) => sum + t.home, 0) / teams.length;
      const away = teams.reduce((sum, t) => sum + t.away, 0) / teams.length;
      leagueRows.push({ competition, home, away, gap: Math.abs(home - away), teams: teams.length });
    });
    return {
      leagues: leagueRows.sort((a, b) => b.gap - a.gap || a.competition.localeCompare(b.competition)),
      teams: allTeams.sort((a, b) => b.gap - a.gap || a.team.localeCompare(b.team)),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, statKey]);
  const mergedLeagues = comparisons.leagues;
  const teamRows = useMemo(() => {
    let rows = comparisons.teams;
    if (leagueFilter !== 'all') rows = rows.filter((r) => r.competition === leagueFilter);
    const q = query.trim().toLowerCase();
    if (q) rows = rows.filter((r) => r.team.toLowerCase().includes(q) || r.competition.toLowerCase().includes(q));
    return rows.sort((a, b) => b.gap - a.gap || a.team.localeCompare(b.team)).slice(0, TEAM_LIMIT);
  }, [comparisons, leagueFilter, query]);

  useEffect(() => setPage(1), [statKey, view, leagueFilter, query]);

  const loading = feed.loading || settled < leagues.length;
  const statLabel = stats.find((s) => s.key === statKey)?.label ?? statKey;

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
        <Text style={styles.title}>Unity Finder · Home/Away Gap</Text>
        <Text style={styles.subtitle}>Compare each selected stat at home and away. Both tables show the two values and their difference.</Text>
      </View>
      <View style={styles.toolbar}>
        <FilterDropdown label="Stat" value={statKey} options={stats.map((s) => ({ value: s.key, label: s.label }))} onChange={setStatKey} style={narrow ? styles.full : styles.flex} />
      </View>

      <View style={styles.viewRow}>
        {([['leagues', 'Leagues (LL)'], ['teams', 'League Amongst Leagues']] as [UnityView, string][]).map(([v, label]) => {
          const on = view === v;
          return <Pressable key={v} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setView(v)} style={[styles.viewBtn, on && styles.viewBtnOn]}><Text style={[styles.viewBtnText, on && styles.viewBtnTextOn]}>{label}</Text></Pressable>;
        })}
        <Pressable accessibilityRole="button" accessibilityLabel="Explain the tables" onPress={() => setHelpOpen(true)} style={styles.helpButton}><Text style={styles.helpButtonText}>ⓘ Table guide</Text></Pressable>
      </View>

      <View style={styles.statusRow}>
        {loading ? <><ActivityIndicator size="small" color={theme.accentGreen} /><Text style={styles.statusMuted}>Loading season home/away stats · {settled}/{leagues.length} leagues…</Text></> : <Text style={styles.statusLive}>● {mergedLeagues.length} leagues · {comparisons.teams.length} teams · {statLabel}</Text>}
      </View>

      {!loading && mergedLeagues.length === 0 ? <Text style={styles.empty}>No home/away data is available for this stat yet.</Text> : null}

      {!loading && mergedLeagues.length > 0 && view === 'leagues' ? (
        <>
          <PageControls page={safe} pages={pages} total={mergedLeagues.length} from={start + 1} to={start + visibleLeagues.length} onChange={setPage} />
          <DragScroll horizontal style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            <View style={[styles.table, { minWidth: 680 }]}>
              <View style={[styles.row, styles.headRow]}>
                <Text style={[styles.cRank, styles.headText, styles.right]}>#</Text>
                <Text style={[styles.cLeague, styles.headText]}>League (LL)</Text>
                <Text style={[styles.cNum, styles.headText, styles.right]}>Teams</Text>
                <Text style={[styles.cNum, styles.headText, styles.right]}>Home avg</Text>
                <Text style={[styles.cNum, styles.headText, styles.right]}>Away avg</Text>
                <Text style={[styles.cNum, styles.headText, styles.right]}>Gap</Text>
              </View>
              {visibleLeagues.map((l, i) => <Pressable key={l.competition} accessibilityRole="button" accessibilityLabel={`View ${l.competition} team home and away gaps`} onPress={() => { setLeagueFilter(l.competition); setQuery(''); setView('teams'); setPage(1); }} style={({ pressed }) => [styles.row, i % 2 === 1 && styles.rowAlt, pressed && styles.rowPressed]}>
                <Text style={[styles.cRank, styles.numDa]}>{start + i + 1}</Text>
                <Text style={[styles.cLeague, styles.league]} numberOfLines={1}>{l.competition}</Text>
                <Text style={[styles.cNum, styles.num]}>{l.teams}</Text>
                <Text style={[styles.cNum, styles.num]}>{valueText(l.home, statKey)}</Text>
                <Text style={[styles.cNum, styles.num]}>{valueText(l.away, statKey)}</Text>
                <Text style={[styles.cNum, styles.numStrong]}>{valueText(l.gap, statKey)}</Text>
              </Pressable>)}
            </View>
          </DragScroll>
          <Text style={styles.hint}>League Home and Away are averages of the team season figures. League Gap is the absolute difference between those two averages. Select a league row to see its teams.</Text>
        </>
      ) : null}

      {!loading && mergedLeagues.length > 0 && view === 'teams' ? (
        <>
          <View style={styles.filterCard}>
            <FilterDropdown label="League" value={leagueFilter} options={leagueOptions} onChange={setLeagueFilter} style={narrow ? styles.full : styles.flex} />
            <Text style={styles.topListNote}>Ranked by largest Home/Away Gap first · showing up to {TEAM_LIMIT} teams.</Text>
            <TextInput value={query} onChangeText={setQuery} placeholder="Search team or league…" placeholderTextColor={theme.textFaint} style={styles.search} />
          </View>
          {leagueFilter !== 'all' ? <Text style={styles.selectedLeagueTitle}>{leagueFilter} · team home/away figures</Text> : null}
          <View style={styles.statusRow}><Text style={styles.statusMuted}>{teamRows.length} teams shown · sorted by Gap</Text></View>
          {teamRows.length === 0 ? <Text style={styles.empty}>No teams match this selection.</Text> : <>
            <PageControls page={safe} pages={pages} total={teamRows.length} from={start + 1} to={start + visibleTeams.length} onChange={setPage} />
            <DragScroll horizontal style={styles.scroll} contentContainerStyle={styles.scrollContent}>
              <View style={[styles.table, { minWidth: 760 }]}>
                <View style={[styles.row, styles.headRow]}>
                  <Text style={[styles.cRank, styles.headText, styles.right]}>#</Text>
                  <Text style={[styles.cTeam, styles.headText]}>Team</Text>
                  <Text style={[styles.cLeagueT, styles.headText]}>League</Text>
                  <Text style={[styles.cNum, styles.headText, styles.right]}>Home</Text>
                  <Text style={[styles.cNum, styles.headText, styles.right]}>Away</Text>
                  <Text style={[styles.cNum, styles.headText, styles.right]}>Gap</Text>
                </View>
                {visibleTeams.map((r, i) => <View key={`${r.competition}-${r.team}`} style={[styles.row, i % 2 === 1 && styles.rowAlt]}>
                  <Text style={[styles.cRank, styles.numDa]}>{start + i + 1}</Text>
                  <Text style={[styles.cTeam, styles.team]} numberOfLines={1}>{r.team}</Text>
                  <Text style={[styles.cLeagueT, styles.compText]} numberOfLines={1}>{r.competition}</Text>
                  <Text style={[styles.cNum, styles.num]}>{valueText(r.home, statKey)}</Text>
                  <Text style={[styles.cNum, styles.num]}>{valueText(r.away, statKey)}</Text>
                  <Text style={[styles.cNum, styles.numStrong]}>{valueText(r.gap, statKey)}</Text>
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
            <View style={styles.helpHeader}><View style={styles.helpHeaderCopy}><Text style={styles.helpTitle}>Home/Away Gap guide</Text><Text style={styles.helpIntro}>Only Home, Away, and their Gap are shown here.</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close explanation" onPress={() => setHelpOpen(false)} style={styles.helpClose}><Text style={styles.helpCloseText}>Close</Text></Pressable></View>
            <ScrollView style={styles.helpScroll} contentContainerStyle={styles.helpContent}>
              <Text style={styles.helpSectionTitle}>Leagues (LL)</Text>
              <Text style={styles.helpText}>For each league, Home avg is the average of its teams’ home figures for the selected stat. Away avg is the average of their away figures. Gap is the absolute difference between those league averages. League rows are ordered by the largest Gap.</Text>
              <Text style={styles.helpSectionTitle}>League Amongst Leagues</Text>
              <Text style={styles.helpText}>Each row shows one team’s season Home value and Away value. Team Gap is the absolute difference between them. Teams are ordered by largest Gap; selecting a league row opens that league’s teams. The list shows up to {TEAM_LIMIT} teams.</Text>
              <Text style={styles.helpSectionTitle}>Data used</Text>
              <Text style={styles.helpText}>The selected stat comes from the current season’s full-time home and away team tables. Teams without both values are excluded. Percentage stats show a percentage-point gap; count and average stats use their own units. No Unity ratio, Indiv allocation, or half-time comparison is used in these tables.</Text>
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
  cNum: { width: 88, paddingHorizontal: 4 },
  muted: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted, textAlign: 'right' },
  league: { fontFamily: fonts.bodyMedium, fontSize: 13, color: theme.textPrimary },
  team: { fontFamily: fonts.bodyMedium, fontSize: 13, color: theme.textPrimary },
  compText: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted },
  num: { fontFamily: fonts.body, fontSize: 12, color: theme.textPrimary, textAlign: 'right' },
  numStrong: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.textPrimary, textAlign: 'right' },
  numDa: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.accentGreen, textAlign: 'right' },

  hint: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted, textAlign: 'center', marginTop: spacing.sm },
});
