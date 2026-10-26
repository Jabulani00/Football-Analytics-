import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useQueries } from '@tanstack/react-query';

import DragScroll from '@/components/shared/DragScroll';
import FilterDropdown from '@/components/shared/FilterDropdown';
import PageControls, { PAGE_SIZE } from '@/components/shared/PageControls';
import { useLiveCompetitionFeed } from '@/hooks/useLiveCompetitions';
import { fetchAllFixturesBetween, seasonWindowUnix } from '@/services/oddAlerts';
import { clientStaleTime } from '@/services/oddAlertsCachePolicy';
import { buildLeagueStatsLive } from '@/services/statsBuilder';
import {
  leagueUnityFor,
  superLeagueUnity,
  teamMeasuresForSection,
  assignLeagueTiers,
  buildSuperLeague,
  sectionStats,
  DA_MIN,
  type LeagueUnity,
  type LeagueTier,
  type SuperTeamRow,
  type TeamMeasure,
  type UnitySection,
} from '@/utils/unity';
import { fonts, layout, spacing, theme } from '@/styles/theme';

const SECTIONS: { value: UnitySection; label: string }[] = [
  { value: 'homeaway', label: 'Home / Away' },
  { value: 'halves', label: '1st / 2nd Half' },
  { value: 'opposites', label: 'Opposites' },
];

type UnityView = 'leagues' | 'teams';
type TierFilter = 'all' | LeagueTier;
type SortKey = 'rank' | 'multiple' | 'unity' | 'da' | 'team' | 'league' | 'tier' | 'lgrank';

function pct(v: number | null): string {
  return v == null ? '—' : `${Math.round(v * 100)}%`;
}
function tierColor(t: LeagueTier | null): string {
  if (t === 'top') return theme.accentGreen;
  if (t === 'middle') return theme.yellow;
  return theme.textMuted; // bottom = white/neutral
}
function tierName(t: LeagueTier | null): string {
  if (t === 'top') return 'Top';
  if (t === 'middle') return 'Mid';
  if (t === 'bottom') return 'Bottom';
  return '—';
}
const TIER_RANK: Record<LeagueTier, number> = { top: 0, middle: 1, bottom: 2 };

function sortSuper(rows: SuperTeamRow[], key: SortKey, dir: 'asc' | 'desc'): SuperTeamRow[] {
  const mul = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    let c = 0;
    if (key === 'rank') c = a.overallRank - b.overallRank;
    else if (key === 'unity') c = a.unity - b.unity;
    else if (key === 'da') c = a.da - b.da;
    else if (key === 'multiple') c = (a.multiple ?? -Infinity) - (b.multiple ?? -Infinity);
    else if (key === 'team') c = a.team.localeCompare(b.team);
    else if (key === 'league') c = a.competition.localeCompare(b.competition);
    else if (key === 'tier') c = TIER_RANK[a.tier ?? 'bottom'] - TIER_RANK[b.tier ?? 'bottom'];
    else if (key === 'lgrank') c = a.leagueRank - b.leagueRank;
    if (c === 0) c = a.overallRank - b.overallRank;
    return c * mul;
  });
}

export default function UnityFinderPanel() {
  const narrow = useWindowDimensions().width < 720;

  const feed = useLiveCompetitionFeed(3);
  const leagues = useMemo(() => feed.competitions.filter((c) => c.rank === 0), [feed.competitions]);

  const [section, setSection] = useState<UnitySection>('homeaway');
  const stats = useMemo(() => sectionStats(section), [section]);
  const [statKey, setStatKey] = useState<string>('sc_pct');
  useEffect(() => {
    if (!stats.some((s) => s.key === statKey)) setStatKey(stats[0]?.key ?? '');
  }, [stats, statKey]);

  const [view, setView] = useState<UnityView>('leagues');
  // Super League filters.
  const [leagueFilter, setLeagueFilter] = useState<string>('all');
  const [tierFilter, setTierFilter] = useState<TierFilter>('all');
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('rank');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
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

  // League-level Unity (today's logic) → ranking + tiers.
  const sl = useMemo(() => {
    const perLeague: LeagueUnity[] = [];
    results.forEach((r, i) => {
      // Labels must be unique — league names repeat across countries.
      if (r.data && leagues[i]) perLeague.push(leagueUnityFor(r.data, `${leagues[i].name} · ${leagues[i].country}`, section, statKey));
    });
    return superLeagueUnity(perLeague);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, section, statKey]);

  const tierMap = useMemo(() => assignLeagueTiers(sl.leagues), [sl]);

  // Team-level gaps across leagues → the Super League table.
  const superRows = useMemo(() => {
    const perLeague: { competition: string; teams: TeamMeasure[] }[] = [];
    results.forEach((r, i) => {
      if (r.data && leagues[i]) perLeague.push({ competition: `${leagues[i].name} · ${leagues[i].country}`, teams: teamMeasuresForSection(r.data, section, statKey) });
    });
    return buildSuperLeague(perLeague, tierMap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, section, statKey, tierMap]);

  const teamRows = useMemo(() => {
    let rows = superRows;
    if (leagueFilter !== 'all') rows = rows.filter((r) => r.competition === leagueFilter);
    if (tierFilter !== 'all') rows = rows.filter((r) => r.tier === tierFilter);
    const q = query.trim().toLowerCase();
    if (q) rows = rows.filter((r) => r.team.toLowerCase().includes(q) || r.competition.toLowerCase().includes(q));
    return sortSuper(rows, sortKey, sortDir);
  }, [superRows, leagueFilter, tierFilter, query, sortKey, sortDir]);

  useEffect(() => setPage(1), [section, statKey, view, leagueFilter, tierFilter, query, sortKey, sortDir]);

  const loading = feed.loading || settled < leagues.length;
  const statLabel = stats.find((s) => s.key === statKey)?.label ?? statKey;

  const listLen = view === 'leagues' ? sl.leagues.length : teamRows.length;
  const pages = Math.max(1, Math.ceil(listLen / PAGE_SIZE));
  const safe = Math.min(page, pages);
  const start = (safe - 1) * PAGE_SIZE;
  const visibleLeagues = sl.leagues.slice(start, start + PAGE_SIZE);
  const visibleTeams = teamRows.slice(start, start + PAGE_SIZE);

  const leagueOptions = [{ value: 'all', label: `All leagues (${sl.leagues.length})` }, ...sl.leagues.map((l) => ({ value: l.competition, label: l.competition }))];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>DA Unity Finder</Text>
        <Text style={styles.subtitle}>
          The league amongst leagues — every active league compared. League Unity is the share of a league&apos;s teams that
          are DA on a stat (difference ≥ {DA_MIN}%); leagues are ranked and split into three tiers —
          Top (green), Middle (yellow), Bottom (white). The League Amongst Leagues table lists every team across
          leagues with DA (peak stat), Unity (Peak − Smaller) and the DA ÷ Unity multiple — ranked by
          Unity, each team tied to its league and tier.
        </Text>
      </View>

      <View style={styles.toolbar}>
        <FilterDropdown label="DA place" value={section} options={SECTIONS} onChange={(v) => setSection(v as UnitySection)} style={narrow ? styles.full : styles.flex} />
        <FilterDropdown label="Stat" value={statKey} options={stats.map((s) => ({ value: s.key, label: s.label }))} onChange={setStatKey} style={narrow ? styles.full : styles.flex} />
      </View>

      {/* View switch */}
      <View style={styles.viewRow}>
        {([['leagues', 'Leagues (LL)'], ['teams', 'League Amongst Leagues']] as [UnityView, string][]).map(([v, label]) => {
          const on = view === v;
          return (
            <Pressable key={v} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setView(v)} style={[styles.viewBtn, on && styles.viewBtnOn]}>
              <Text style={[styles.viewBtnText, on && styles.viewBtnTextOn]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.statusRow}>
        {loading ? (
          <>
            <ActivityIndicator size="small" color={theme.accentGreen} />
            <Text style={styles.statusMuted}>Building the league amongst leagues · {settled}/{leagues.length} leagues…</Text>
          </>
        ) : (
          <Text style={styles.statusLive}>● {sl.leagues.length} leagues · {sl.totalTeams} teams · {statLabel}</Text>
        )}
      </View>

      {!loading && sl.leagues.length === 0 ? <Text style={styles.empty}>No league data to measure Unity yet.</Text> : null}

      {!loading && sl.leagues.length > 0 && view === 'leagues' ? (
        <>
          <View style={styles.overall}>
            <Text style={styles.overallLabel}>League-amongst-leagues Unity · {statLabel}</Text>
            <Text style={styles.overallValue}>{pct(sl.overallUnity)}</Text>
            <Text style={styles.overallSub}>{sl.totalDa} of {sl.totalTeams} teams are DA</Text>
          </View>

          <PageControls page={safe} pages={pages} total={sl.leagues.length} from={start + 1} to={start + visibleLeagues.length} onChange={setPage} />
          <DragScroll horizontal style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            <View style={[styles.table, { minWidth: 640 }]}>
              <View style={[styles.row, styles.headRow]}>
                <Text style={[styles.cRank, styles.headText, styles.right]}>#</Text>
                <Text style={[styles.cLeague, styles.headText]}>League (LL)</Text>
                <Text style={[styles.cTier, styles.headText]}>Tier</Text>
                <Text style={[styles.cNum, styles.headText, styles.right]}>Teams</Text>
                <Text style={[styles.cNum, styles.headText, styles.right]}>DA</Text>
                <Text style={[styles.cNum, styles.headText, styles.right]}>Bord.</Text>
                <Text style={[styles.cNum, styles.headText, styles.right]}>None</Text>
                <Text style={[styles.cUnity, styles.headText]}>Unity</Text>
              </View>
              {visibleLeagues.map((l, i) => {
                const tier = tierMap.get(l.competition) ?? null;
                const tc = tierColor(tier);
                return (
                  <View key={l.competition} style={[styles.row, i % 2 === 1 && styles.rowAlt]}>
                    <Text style={[styles.cRank, styles.muted]}>{start + i + 1}</Text>
                    <Text style={[styles.cLeague, styles.league]} numberOfLines={1}>{l.competition}</Text>
                    <View style={styles.cTier}>
                      <View style={[styles.tierChip, { borderColor: tc }]}><Text style={[styles.tierChipText, { color: tc }]}>{tierName(tier)}</Text></View>
                    </View>
                    <Text style={[styles.cNum, styles.num]}>{l.total}</Text>
                    <Text style={[styles.cNum, styles.numDa]}>{l.da}</Text>
                    <Text style={[styles.cNum, styles.muted]}>{l.borderline}</Text>
                    <Text style={[styles.cNum, styles.muted]}>{l.none}</Text>
                    <View style={styles.cUnity}>
                      <View style={styles.bar}><View style={[styles.barFill, { width: `${Math.round((l.unity ?? 0) * 100)}%` }]} /></View>
                      <Text style={styles.unityPct}>{pct(l.unity)}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </DragScroll>
          <Text style={styles.hint}>Tiers split the ranked leagues into three equal thirds — Top (green), Middle (yellow), Bottom (white).</Text>
        </>
      ) : null}

      {!loading && sl.leagues.length > 0 && view === 'teams' ? (
        <>
          {/* Filters */}
          <View style={styles.filterCard}>
            <View style={[styles.filterRow, narrow && styles.filterCol]}>
              <FilterDropdown label="League" value={leagueFilter} options={leagueOptions} onChange={setLeagueFilter} style={narrow ? styles.full : styles.flex} />
              <FilterDropdown label="Sort by" value={sortKey} options={[
                { value: 'rank', label: 'Overall rank' }, { value: 'multiple', label: 'DA ÷ Unity (×)' }, { value: 'unity', label: 'Unity (gap)' },
                { value: 'da', label: 'DA (peak)' }, { value: 'team', label: 'Team name' }, { value: 'league', label: 'League' },
                { value: 'tier', label: 'League tier' }, { value: 'lgrank', label: 'League rank' },
              ]} onChange={(v) => setSortKey(v as SortKey)} style={narrow ? styles.full : styles.flex} />
              <Pressable accessibilityRole="button" onPress={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))} style={styles.dirBtn}>
                <Text style={styles.dirBtnText}>{sortDir === 'asc' ? '↑ Asc' : '↓ Desc'}</Text>
              </Pressable>
            </View>
            <View style={styles.tierBtnRow}>
              {(['all', 'top', 'middle', 'bottom'] as TierFilter[]).map((t) => {
                const on = tierFilter === t;
                const c = t === 'all' ? theme.accentBlue : tierColor(t as LeagueTier);
                return (
                  <Pressable key={t} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setTierFilter(t)} style={[styles.tierBtn, on && { borderColor: c, backgroundColor: 'rgba(5,150,105,0.06)' }]}>
                    <Text style={[styles.tierBtnText, { color: on ? c : theme.textMuted }]}>{t === 'all' ? 'All tiers' : tierName(t as LeagueTier)}</Text>
                  </Pressable>
                );
              })}
            </View>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search team or league…"
              placeholderTextColor={theme.textFaint}
              style={styles.search}
            />
          </View>

          <View style={styles.statusRow}>
            <Text style={styles.statusMuted}>{teamRows.length} teams{leagueFilter !== 'all' || tierFilter !== 'all' || query.trim() ? ' (filtered)' : ''} · overall ranks kept</Text>
          </View>

          {teamRows.length === 0 ? (
            <Text style={styles.empty}>No teams match these filters.</Text>
          ) : (
            <>
              <PageControls page={safe} pages={pages} total={teamRows.length} from={start + 1} to={start + visibleTeams.length} onChange={setPage} />
              <DragScroll horizontal style={styles.scroll} contentContainerStyle={styles.scrollContent}>
                <View style={[styles.table, { minWidth: 800 }]}>
                  <View style={[styles.row, styles.headRow]}>
                    <Text style={[styles.cRank, styles.headText, styles.right]}>#</Text>
                    <Text style={[styles.cTeam, styles.headText]}>Team</Text>
                    <Text style={[styles.cLeagueT, styles.headText]}>League</Text>
                    <Text style={[styles.cTier, styles.headText]}>Tier</Text>
                    <Text style={[styles.cNum, styles.headText, styles.right]}>DA</Text>
                    <Text style={[styles.cNum, styles.headText, styles.right]}>Unity</Text>
                    <Text style={[styles.cNum, styles.headText, styles.right]}>×</Text>
                    <Text style={[styles.cNum, styles.headText, styles.right]}>Lg #</Text>
                  </View>
                  {visibleTeams.map((r, i) => {
                    const tc = tierColor(r.tier);
                    const uc = r.band === 'da' ? theme.accentGreen : r.band === 'borderline' ? theme.yellow : theme.textMuted;
                    return (
                      <View key={`${r.competition}-${r.team}`} style={[styles.row, i % 2 === 1 && styles.rowAlt]}>
                        <Text style={[styles.cRank, styles.numDa]}>{r.overallRank}</Text>
                        <Text style={[styles.cTeam, styles.team]} numberOfLines={1}>{r.team}</Text>
                        <Text style={[styles.cLeagueT, styles.compText]} numberOfLines={1}>{r.competition}</Text>
                        <View style={styles.cTier}>
                          <View style={[styles.tierChip, { borderColor: tc }]}><Text style={[styles.tierChipText, { color: tc }]}>{tierName(r.tier)}</Text></View>
                        </View>
                        <Text style={[styles.cNum, styles.num]}>{Math.round(r.da)}%</Text>
                        <Text style={[styles.cNum, { textAlign: 'right', fontFamily: fonts.bodySemiBold, fontSize: 12, color: uc }]}>{Math.round(r.unity)}%</Text>
                        <Text style={[styles.cNum, styles.numStrong]}>{r.multiple == null ? '—' : `${r.multiple.toFixed(2)}×`}</Text>
                        <Text style={[styles.cNum, styles.muted]}>{r.leagueRank}</Text>
                      </View>
                    );
                  })}
                </View>
              </DragScroll>
              <PageControls page={safe} pages={pages} total={teamRows.length} from={start + 1} to={start + visibleTeams.length} onChange={setPage} />
              <Text style={styles.hint}>
                DA = peak stat · Unity = Peak − Smaller · × = DA ÷ Unity, for {statLabel}. Overall rank is
                across all leagues (by Unity, kept under filtering); Lg # is the team&apos;s rank in its own
                league. Unity colour: green = DA (≥ {DA_MIN}%), yellow = borderline.
              </Text>
            </>
          )}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', alignSelf: 'stretch' },
  header: { marginBottom: spacing.md },
  title: { fontFamily: fonts.display, fontSize: 24, color: theme.textPrimary, marginBottom: spacing.xs },
  subtitle: { fontFamily: fonts.body, fontSize: 13, lineHeight: 20, color: theme.textMuted },

  toolbar: {
    flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm,
    borderWidth: layout.borderWidth, borderColor: theme.border, borderRadius: layout.borderRadius,
    backgroundColor: theme.surface, padding: spacing.md,
  },
  flex: { flexGrow: 1, flexBasis: 180, minWidth: 150 },
  full: { width: '100%', minWidth: 0, flexBasis: 'auto', flexGrow: 0 },

  viewRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  viewBtn: { flex: 1, borderWidth: 1.5, borderColor: theme.border, borderRadius: layout.borderRadius, paddingVertical: spacing.sm, alignItems: 'center', backgroundColor: theme.surface },
  viewBtnOn: { borderColor: theme.accentGreen, backgroundColor: 'rgba(5,150,105,0.08)' },
  viewBtnText: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.textMuted },
  viewBtnTextOn: { color: theme.accentGreen },

  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 20, marginTop: spacing.md },
  statusLive: { fontFamily: fonts.bodyMedium, fontSize: 12, color: theme.accentGreen },
  statusMuted: { fontFamily: fonts.body, fontSize: 12, color: theme.textMuted },
  empty: { fontFamily: fonts.body, fontSize: 13, color: theme.textMuted, textAlign: 'center', paddingVertical: spacing.lg },

  overall: {
    marginTop: spacing.md, borderWidth: layout.borderWidth, borderColor: theme.accentGreen, borderRadius: layout.borderRadius,
    backgroundColor: 'rgba(5,150,105,0.06)', padding: spacing.md, alignItems: 'center',
  },
  overallLabel: { fontFamily: fonts.bodySemiBold, fontSize: 11, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  overallValue: { fontFamily: fonts.display, fontSize: 34, color: theme.accentGreen, marginVertical: 2 },
  overallSub: { fontFamily: fonts.body, fontSize: 12, color: theme.textMuted },

  filterCard: {
    marginTop: spacing.md, borderWidth: layout.borderWidth, borderColor: theme.border, borderRadius: layout.borderRadius,
    backgroundColor: theme.surface, padding: spacing.md, gap: spacing.sm,
  },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: spacing.sm },
  filterCol: { flexDirection: 'column', alignItems: 'stretch' },
  dirBtn: { borderWidth: 1.5, borderColor: theme.border, borderRadius: layout.borderRadius, paddingHorizontal: spacing.md, paddingVertical: 10, backgroundColor: theme.surfaceHover },
  dirBtnText: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: theme.textPrimary },
  tierBtnRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tierBtn: { borderWidth: 1.5, borderColor: theme.border, borderRadius: 999, paddingHorizontal: spacing.md, paddingVertical: 5, backgroundColor: theme.surface },
  tierBtnText: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: theme.textMuted },
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
  headText: { fontFamily: fonts.bodySemiBold, fontSize: 10, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 4 },
  right: { textAlign: 'right' },
  cRank: { width: 38, paddingHorizontal: 4, textAlign: 'right' },
  cLeague: { flex: 1, minWidth: 150, paddingHorizontal: 4 },
  cLeagueT: { width: 150, paddingHorizontal: 4 },
  cTeam: { flex: 1, minWidth: 140, paddingHorizontal: 4 },
  cTier: { width: 64, paddingHorizontal: 4 },
  cNum: { width: 52, paddingHorizontal: 4 },
  cUnity: { width: 150, paddingHorizontal: 4, flexDirection: 'row', alignItems: 'center', gap: 6 },
  muted: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted, textAlign: 'right' },
  league: { fontFamily: fonts.bodyMedium, fontSize: 13, color: theme.textPrimary },
  team: { fontFamily: fonts.bodyMedium, fontSize: 13, color: theme.textPrimary },
  compText: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted },
  num: { fontFamily: fonts.body, fontSize: 12, color: theme.textPrimary, textAlign: 'right' },
  numStrong: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.textPrimary, textAlign: 'right' },
  numDa: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.accentGreen, textAlign: 'right' },
  tierChip: { alignSelf: 'flex-start', borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1 },
  tierChipText: { fontFamily: fonts.bodySemiBold, fontSize: 9 },
  bar: { flex: 1, height: 8, borderRadius: 999, backgroundColor: theme.surfaceMuted, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: theme.accentGreen },
  unityPct: { width: 40, fontFamily: fonts.bodySemiBold, fontSize: 12, color: theme.textPrimary, textAlign: 'right' },

  hint: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted, textAlign: 'center', marginTop: spacing.sm },
});
