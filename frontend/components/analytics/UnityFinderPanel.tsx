import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
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
  sectionStats,
  NONE_MAX,
  DA_MIN,
  type LeagueUnity,
  type UnitySection,
} from '@/utils/unity';
import { fonts, layout, spacing, theme } from '@/styles/theme';

const SECTIONS: { value: UnitySection; label: string }[] = [
  { value: 'homeaway', label: 'Home / Away' },
  { value: 'halves', label: '1st / 2nd Half' },
  { value: 'opposites', label: 'Opposites' },
];

function pct(v: number | null): string {
  return v == null ? '—' : `${Math.round(v * 100)}%`;
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
  const [page, setPage] = useState(1);

  const results = useQueries({
    queries: leagues.map((comp) => {
      const { fromUnix, toUnix } = seasonWindowUnix(comp.season ?? '');
      return {
        queryKey: ['unity-league', comp.id, comp.season] as const,
        queryFn: () =>
          buildLeagueStatsLive((o) => fetchAllFixturesBetween(o), { competitionId: comp.id, fromUnix, toUnix, season: comp.season }),
        staleTime: clientStaleTime('stats/season'),
      };
    }),
  });
  const sig = results.map((r, i) => (r.data ? `${leagues[i]?.id}:${r.dataUpdatedAt}` : '')).join('|');
  const settled = results.filter((r) => r.isSuccess || r.isError).length;

  const sl = useMemo(() => {
    const perLeague: LeagueUnity[] = [];
    results.forEach((r, i) => {
      if (r.data && leagues[i]) perLeague.push(leagueUnityFor(r.data, leagues[i].name, section, statKey));
    });
    return superLeagueUnity(perLeague);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, section, statKey]);

  useEffect(() => setPage(1), [section, statKey]);

  const loading = feed.loading || settled < leagues.length;
  const statLabel = stats.find((s) => s.key === statKey)?.label ?? statKey;

  const pages = Math.max(1, Math.ceil(sl.leagues.length / PAGE_SIZE));
  const safe = Math.min(page, pages);
  const start = (safe - 1) * PAGE_SIZE;
  const visible = sl.leagues.slice(start, start + PAGE_SIZE);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>DA Unity Finder</Text>
        <Text style={styles.subtitle}>
          The super league of all active leagues. For one DA stat, Unity is the share of a league&apos;s
          teams that are DA on it (difference ≥ {DA_MIN}%; 0–{NONE_MAX}% none, {NONE_MAX + 1}–{DA_MIN - 1}%
          borderline). Leagues are ranked against each other — most unified first.
        </Text>
      </View>

      <View style={styles.toolbar}>
        <FilterDropdown label="DA place" value={section} options={SECTIONS} onChange={(v) => setSection(v as UnitySection)} style={narrow ? styles.full : styles.flex} />
        <FilterDropdown label="Stat" value={statKey} options={stats.map((s) => ({ value: s.key, label: s.label }))} onChange={setStatKey} style={narrow ? styles.full : styles.flex} />
      </View>

      <View style={styles.statusRow}>
        {loading ? (
          <>
            <ActivityIndicator size="small" color={theme.accentGreen} />
            <Text style={styles.statusMuted}>Building the super league · {settled}/{leagues.length} leagues…</Text>
          </>
        ) : (
          <Text style={styles.statusLive}>● {sl.leagues.length} leagues · {sl.totalTeams} teams</Text>
        )}
      </View>

      {!loading ? (
        sl.leagues.length === 0 ? (
          <Text style={styles.empty}>No league data to measure Unity yet.</Text>
        ) : (
          <>
            <View style={styles.overall}>
              <Text style={styles.overallLabel}>Super-league Unity · {statLabel}</Text>
              <Text style={styles.overallValue}>{pct(sl.overallUnity)}</Text>
              <Text style={styles.overallSub}>{sl.totalDa} of {sl.totalTeams} teams are DA</Text>
            </View>

            <PageControls page={safe} pages={pages} total={sl.leagues.length} from={start + 1} to={start + visible.length} onChange={setPage} />
            <DragScroll horizontal style={styles.scroll} contentContainerStyle={styles.scrollContent}>
              <View style={styles.table}>
                <View style={[styles.row, styles.headRow]}>
                  <Text style={[styles.cRank, styles.headText, styles.right]}>#</Text>
                  <Text style={[styles.cLeague, styles.headText]}>League (LL)</Text>
                  <Text style={[styles.cNum, styles.headText, styles.right]}>Teams</Text>
                  <Text style={[styles.cNum, styles.headText, styles.right]}>DA</Text>
                  <Text style={[styles.cNum, styles.headText, styles.right]}>Bord.</Text>
                  <Text style={[styles.cNum, styles.headText, styles.right]}>None</Text>
                  <Text style={[styles.cUnity, styles.headText]}>Unity</Text>
                </View>
                {visible.map((l, i) => (
                  <View key={l.competition} style={[styles.row, i % 2 === 1 && styles.rowAlt]}>
                    <Text style={[styles.cRank, styles.muted]}>{start + i + 1}</Text>
                    <Text style={[styles.cLeague, styles.league]} numberOfLines={1}>{l.competition}</Text>
                    <Text style={[styles.cNum, styles.num]}>{l.total}</Text>
                    <Text style={[styles.cNum, styles.numDa]}>{l.da}</Text>
                    <Text style={[styles.cNum, styles.muted]}>{l.borderline}</Text>
                    <Text style={[styles.cNum, styles.muted]}>{l.none}</Text>
                    <View style={styles.cUnity}>
                      <View style={styles.bar}>
                        <View style={[styles.barFill, { width: `${Math.round((l.unity ?? 0) * 100)}%` }]} />
                      </View>
                      <Text style={styles.unityPct}>{pct(l.unity)}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </DragScroll>
            <Text style={styles.hint}>
              Unity = DA teams ÷ league teams for {statLabel}. A high Unity means most of the league shows
              DA on this stat. DA = difference ≥ {DA_MIN}%; borderline {NONE_MAX + 1}–{DA_MIN - 1}%.
            </Text>
          </>
        )
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

  scroll: { width: '100%', maxWidth: '100%', marginTop: spacing.sm },
  scrollContent: { minWidth: '100%' },
  table: {
    width: '100%', minWidth: 560, backgroundColor: theme.surface, borderWidth: layout.borderWidth,
    borderColor: theme.border, borderRadius: layout.borderRadius, overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, paddingHorizontal: spacing.sm },
  headRow: { backgroundColor: theme.surfaceMuted, borderBottomWidth: layout.borderWidth, borderBottomColor: theme.border },
  rowAlt: { backgroundColor: theme.surfaceHover },
  headText: { fontFamily: fonts.bodySemiBold, fontSize: 10, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 4 },
  right: { textAlign: 'right' },
  cRank: { width: 30, paddingHorizontal: 4 },
  cLeague: { flex: 1, minWidth: 150, paddingHorizontal: 4 },
  cNum: { width: 52, paddingHorizontal: 4 },
  cUnity: { width: 160, paddingHorizontal: 4, flexDirection: 'row', alignItems: 'center', gap: 6 },
  muted: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted, textAlign: 'right' },
  league: { fontFamily: fonts.bodyMedium, fontSize: 13, color: theme.textPrimary },
  num: { fontFamily: fonts.body, fontSize: 12, color: theme.textPrimary, textAlign: 'right' },
  numDa: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.accentGreen, textAlign: 'right' },
  bar: { flex: 1, height: 8, borderRadius: 999, backgroundColor: theme.surfaceMuted, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: theme.accentGreen },
  unityPct: { width: 40, fontFamily: fonts.bodySemiBold, fontSize: 12, color: theme.textPrimary, textAlign: 'right' },

  hint: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted, textAlign: 'center', marginTop: spacing.sm },
});
