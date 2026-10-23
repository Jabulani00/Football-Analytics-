import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useQueries } from '@tanstack/react-query';

import DragScroll from '@/components/shared/DragScroll';
import FilterDropdown from '@/components/shared/FilterDropdown';
import PageControls, { PAGE_SIZE } from '@/components/shared/PageControls';
import { useLiveCompetitionFeed } from '@/hooks/useLiveCompetitions';
import { useLiveStatsTables } from '@/hooks/useLiveStatsTables';
import { fetchAllFixturesBetween, seasonWindowUnix } from '@/services/oddAlerts';
import { clientStaleTime } from '@/services/oddAlertsCachePolicy';
import { buildLeagueStatsLive } from '@/services/statsBuilder';
import { GRADABLE_STATS, type Grade } from '@/utils/statsGrading';
import {
  buildMethod2Grid,
  mergeGrids,
  type GradeBucket,
  type Method2Grid,
} from '@/utils/statsGradingMethod2';
import { fonts, layout, spacing, theme } from '@/styles/theme';

const ALL = 'all';
const ALL_GRADES = 'all';

type DirBucket = GradeBucket & { dir: 'strong' | 'weak' };

function gradeColor(letter: Grade): string {
  if (letter === 'A' || letter === 'B') return theme.accentGreen;
  if (letter === 'C') return theme.yellow;
  return theme.loss;
}
function pct(v: number | null): string {
  return v == null ? '—' : `${Math.round(v)}%`;
}
function gradeId(b: DirBucket): string {
  return `${b.dir}:${b.roman}`;
}

export default function StatsGradingMethod2Panel() {
  const narrow = useWindowDimensions().width < 720;

  const feed = useLiveCompetitionFeed(3);
  const leagues = useMemo(() => feed.competitions.filter((c) => c.rank === 0), [feed.competitions]);

  const [selection, setSelection] = useState<string>('');
  useEffect(() => {
    if (leagues.length === 0) return;
    if (selection === '' || (selection !== ALL && !leagues.some((l) => String(l.id) === selection))) {
      setSelection(String(leagues[0].id));
    }
  }, [leagues, selection]);
  const allLeagues = selection === ALL;
  const singleId = allLeagues ? null : Number(selection);
  const activeComp = leagues.find((l) => l.id === singleId) ?? null;

  const [statKey, setStatKey] = useState('over25');
  const [gradeSel, setGradeSel] = useState<string>(ALL_GRADES);
  const [page, setPage] = useState(1);

  const live = useLiveStatsTables({
    competitionId: allLeagues ? undefined : (singleId ?? undefined),
    seasonName: activeComp?.season,
  });

  const allResults = useQueries({
    queries: (allLeagues ? leagues : []).map((comp) => {
      const { fromUnix, toUnix } = seasonWindowUnix(comp.season ?? '');
      return {
        queryKey: ['stats-grading2-league', comp.id, comp.season] as const,
        queryFn: () =>
          buildLeagueStatsLive((o) => fetchAllFixturesBetween(o), {
            competitionId: comp.id,
            fromUnix,
            toUnix,
            season: comp.season,
          }),
        staleTime: clientStaleTime('stats/season'),
      };
    }),
  });
  const allSig = allResults.map((r, i) => (r.data ? `${leagues[i]?.id}:${r.dataUpdatedAt}` : '')).join('|');
  const settled = allResults.filter((r) => r.isSuccess || r.isError).length;

  const grid: Method2Grid | null = useMemo(() => {
    if (!allLeagues) return live.data ? buildMethod2Grid(live.data, statKey, activeComp?.name ?? '') : null;
    const grids = allResults
      .map((r, i) => (r.data && leagues[i] ? buildMethod2Grid(r.data, statKey, leagues[i].name) : null))
      .filter((g): g is Method2Grid => g != null);
    return grids.length ? mergeGrids(grids) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allLeagues, live.data, allSig, statKey, activeComp?.name]);

  const buckets: DirBucket[] = useMemo(() => {
    if (!grid) return [];
    return [
      ...grid.strong.map((b) => ({ ...b, dir: 'strong' as const })),
      ...grid.weak.map((b) => ({ ...b, dir: 'weak' as const })),
    ];
  }, [grid]);

  const selectedBucket = buckets.find((b) => gradeId(b) === gradeSel) ?? null;
  useEffect(() => setPage(1), [gradeSel, statKey, selection]);

  const loading = feed.loading || (allLeagues ? settled < leagues.length : singleId != null && live.loading && !live.data);
  const err = feed.error ?? (allLeagues ? null : live.error);

  const leagueOptions = [
    { value: ALL, label: `All leagues combined (${leagues.length})` },
    ...leagues.map((l) => ({ value: String(l.id), label: `${l.name} · ${l.country}` })),
  ];
  const gradeOptions = [
    { value: ALL_GRADES, label: 'All grades · overview' },
    ...buckets.map((b) => ({ value: gradeId(b), label: `${b.label} · ${b.dir === 'strong' ? 'Strong ↑' : 'Weak ↓'} (${b.teams.length})` })),
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Stats Grading · Method 2</Text>
        <Text style={styles.subtitle}>
          Rows are the fixed combined grades (Roman + source list + strong/weak letter); columns are
          the stat families. Series reads the last 10 &amp; 8 games. Filter by grade to page through
          its teams.
        </Text>
      </View>

      <View style={styles.toolbar}>
        <FilterDropdown label="League" value={selection} options={leagueOptions} onChange={setSelection} style={narrow ? styles.full : styles.flex} />
        <FilterDropdown
          label="Statistic"
          value={statKey}
          options={GRADABLE_STATS.map((s) => ({ value: s.key, label: s.label }))}
          onChange={setStatKey}
          style={narrow ? styles.full : styles.flex}
        />
        <FilterDropdown label="Grade (row)" value={gradeSel} options={gradeOptions} onChange={setGradeSel} style={narrow ? styles.full : styles.flex} />
      </View>

      <View style={styles.statusRow}>
        {loading ? (
          <>
            <ActivityIndicator size="small" color={theme.accentGreen} />
            <Text style={styles.statusMuted}>{allLeagues ? `Grading ${settled}/${leagues.length} leagues…` : 'Grading teams live…'}</Text>
          </>
        ) : err ? (
          <Text style={styles.statusMuted}>Live data unavailable: {err}</Text>
        ) : (
          <Text style={styles.statusLive}>
            ● {allLeagues ? `${leagues.length} leagues` : activeComp?.name ?? ''} · {GRADABLE_STATS.find((s) => s.key === statKey)?.label}
          </Text>
        )}
      </View>

      {!loading && !err && grid ? (
        selectedBucket ? (
          <GradeDetail bucket={selectedBucket} page={page} onPage={setPage} onBack={() => setGradeSel(ALL_GRADES)} allLeagues={allLeagues} />
        ) : (
          <Overview buckets={buckets} onPick={setGradeSel} />
        )
      ) : null}
    </View>
  );
}

/* ---------- overview: all grade rows with family counts ---------- */

function Overview({ buckets, onPick }: { buckets: DirBucket[]; onPick: (id: string) => void }) {
  const strong = buckets.filter((b) => b.dir === 'strong');
  const weak = buckets.filter((b) => b.dir === 'weak');
  return (
    <View style={{ gap: spacing.lg, marginTop: spacing.md }}>
      <OverviewTable title="Strong ↑" accent={theme.accentGreen} buckets={strong} onPick={onPick} />
      <OverviewTable title="Weak ↓" accent={theme.loss} buckets={weak} onPick={onPick} />
    </View>
  );
}

function OverviewTable({ title, accent, buckets, onPick }: { title: string; accent: string; buckets: DirBucket[]; onPick: (id: string) => void }) {
  return (
    <View>
      <Text style={[styles.sectionTitle, { color: accent }]}>{title}</Text>
      <DragScroll horizontal style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.table}>
          <View style={[styles.row, styles.headRow]}>
            <Text style={[styles.cGrade, styles.headText]}>Grade · Ordinary</Text>
            <Text style={[styles.cCount, styles.headText, styles.right]}>Teams</Text>
            <Text style={[styles.cCount, styles.headText, styles.right]}>+ Series</Text>
            <Text style={[styles.cCount, styles.headText, styles.right]}>Ord + RFS</Text>
            <Text style={[styles.cCount, styles.headText, styles.right]}>Series + RFS</Text>
            <Text style={[styles.cGo, styles.headText]} />
          </View>
          {buckets.map((b, i) => {
            const color = gradeColor(b.letter);
            const s = b.teams.filter((t) => t.series).length;
            const o = b.teams.filter((t) => t.ordinaryRfs.length).length;
            const sr = b.teams.filter((t) => t.seriesRfs).length;
            return (
              <Pressable
                key={gradeId(b)}
                accessibilityRole="button"
                disabled={b.teams.length === 0}
                onPress={() => onPick(gradeId(b))}
                style={({ pressed }) => [styles.row, i % 2 === 1 && styles.rowAlt, pressed && styles.rowPressed, b.teams.length === 0 && styles.rowEmpty]}>
                <View style={styles.cGrade}>
                  <View style={[styles.tag, { borderColor: color }]}>
                    <Text style={[styles.tagRoman, { color }]}>{b.roman}</Text>
                    <Text style={styles.tagCombo}>{b.sourceList}.{b.letter}</Text>
                  </View>
                  {b.da ? <Text style={styles.da}>DA</Text> : null}
                </View>
                <Text style={[styles.cCount, styles.countStrong]}>{b.teams.length}</Text>
                <Text style={[styles.cCount, styles.count]}>{s || '—'}</Text>
                <Text style={[styles.cCount, styles.count, o ? styles.countWarn : null]}>{o || '—'}</Text>
                <Text style={[styles.cCount, styles.count, sr ? styles.countWarn : null]}>{sr || '—'}</Text>
                <Text style={[styles.cGo, styles.go]}>{b.teams.length ? 'View →' : ''}</Text>
              </Pressable>
            );
          })}
        </View>
      </DragScroll>
    </View>
  );
}

/* ---------- detail: one grade's teams, paginated ---------- */

function GradeDetail({
  bucket,
  page,
  onPage,
  onBack,
  allLeagues,
}: {
  bucket: DirBucket;
  page: number;
  onPage: (p: number) => void;
  onBack: () => void;
  allLeagues: boolean;
}) {
  const color = gradeColor(bucket.letter);
  const total = bucket.teams.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safe = Math.min(page, pages);
  const start = (safe - 1) * PAGE_SIZE;
  const visible = bucket.teams.slice(start, start + PAGE_SIZE);

  return (
    <View style={{ marginTop: spacing.md }}>
      <View style={styles.detailHead}>
        <Pressable accessibilityRole="button" onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>← All grades</Text>
        </Pressable>
        <View style={[styles.tag, styles.tagLg, { borderColor: color }]}>
          <Text style={[styles.tagRomanLg, { color }]}>{bucket.roman}</Text>
          <Text style={styles.tagCombo}>{bucket.sourceList}.{bucket.letter}</Text>
        </View>
        <Text style={styles.detailLabel}>
          {bucket.dir === 'strong' ? 'Strong ↑' : 'Weak ↓'} · {total} team{total === 1 ? '' : 's'}
        </Text>
      </View>

      <PageControls page={safe} pages={pages} total={total} from={start + 1} to={start + visible.length} onChange={onPage} />

      <DragScroll horizontal style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.table}>
          <View style={[styles.row, styles.headRow]}>
            <Text style={[styles.cRank, styles.headText, styles.right]}>#</Text>
            <Text style={[styles.cTeam, styles.headText]}>Team</Text>
            {allLeagues ? <Text style={[styles.cComp, styles.headText]}>League</Text> : null}
            <Text style={[styles.cFam, styles.headText]}>+ Series (last 10 & 8)</Text>
            <Text style={[styles.cFam, styles.headText]}>Ordinary + RFS</Text>
            <Text style={[styles.cFam, styles.headText]}>Series + RFS</Text>
            <Text style={[styles.cNum, styles.headText, styles.right]}>Home</Text>
            <Text style={[styles.cNum, styles.headText, styles.right]}>Overall</Text>
            <Text style={[styles.cNum, styles.headText, styles.right]}>League</Text>
          </View>
          {visible.map((t, i) => (
            <View key={`${t.competition}-${t.team}`} style={[styles.row, i % 2 === 1 && styles.rowAlt]}>
              <Text style={[styles.cRank, styles.muted]}>{start + i + 1}</Text>
              <Text style={[styles.cTeam, styles.team]} numberOfLines={1}>{t.team}</Text>
              {allLeagues ? <Text style={[styles.cComp, styles.compText]} numberOfLines={1}>{t.competition}</Text> : null}
              <Text style={[styles.cFam, styles.famText]} numberOfLines={1}>{t.series ? `${t.series.label} ×${t.series.run}` : '—'}</Text>
              <Text style={[styles.cFam, t.ordinaryRfs.length ? styles.famWarn : styles.famMuted]} numberOfLines={2}>
                {t.ordinaryRfs.length ? `⚠ ${t.ordinaryRfs.join(' · ')}` : 'ok'}
              </Text>
              <Text style={[styles.cFam, t.seriesRfs ? styles.famWarn : styles.famMuted]} numberOfLines={1}>
                {t.seriesRfs ? `⚠ ${t.seriesRfs.label} (${t.seriesRfs.run})` : '—'}
              </Text>
              <Text style={[styles.cNum, styles.num]}>{pct(t.homeValue)}</Text>
              <Text style={[styles.cNum, styles.numStrong, { color }]}>{pct(t.overallValue)}</Text>
              <Text style={[styles.cNum, styles.muted]}>{pct(t.leagueValue)}</Text>
            </View>
          ))}
        </View>
      </DragScroll>

      <PageControls page={safe} pages={pages} total={total} from={start + 1} to={start + visible.length} onChange={onPage} />
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

  sectionTitle: { fontFamily: fonts.display, fontSize: 16, marginBottom: spacing.sm },

  scroll: { width: '100%', maxWidth: '100%' },
  scrollContent: { minWidth: '100%' },
  table: {
    width: '100%', minWidth: 760, backgroundColor: theme.surface, borderWidth: layout.borderWidth,
    borderColor: theme.border, borderRadius: layout.borderRadius, overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, paddingHorizontal: spacing.sm },
  headRow: { backgroundColor: theme.surfaceMuted, borderBottomWidth: layout.borderWidth, borderBottomColor: theme.border },
  rowAlt: { backgroundColor: theme.surfaceHover },
  rowPressed: { backgroundColor: '#DBEAFE' },
  rowEmpty: { opacity: 0.5 },
  headText: { fontFamily: fonts.bodySemiBold, fontSize: 10, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 4 },
  right: { textAlign: 'right' },

  // overview columns
  cGrade: { width: 150, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 },
  cCount: { flex: 1, minWidth: 70, textAlign: 'right', paddingHorizontal: 4 },
  cGo: { width: 70, paddingHorizontal: 4 },
  count: { fontFamily: fonts.bodyMedium, fontSize: 13, color: theme.textPrimary },
  countStrong: { fontFamily: fonts.display, fontSize: 15, color: theme.textPrimary },
  countWarn: { color: theme.loss },
  go: { fontFamily: fonts.bodySemiBold, fontSize: 11, color: theme.accentGreen },

  tag: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1.5, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 1 },
  tagLg: { paddingVertical: 3, paddingHorizontal: spacing.sm },
  tagRoman: { fontFamily: fonts.display, fontSize: 15 },
  tagRomanLg: { fontFamily: fonts.display, fontSize: 22 },
  tagCombo: { fontFamily: fonts.bodySemiBold, fontSize: 11, color: theme.textMuted },
  da: { fontFamily: fonts.bodySemiBold, fontSize: 9, color: '#FFFFFF', backgroundColor: theme.accentPurple, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 999, overflow: 'hidden' },

  // detail columns
  cRank: { width: 30, paddingHorizontal: 4 },
  cTeam: { flex: 1, minWidth: 140, paddingHorizontal: 4 },
  cComp: { width: 120, paddingHorizontal: 4 },
  cFam: { width: 170, paddingHorizontal: 4 },
  cNum: { width: 64, paddingHorizontal: 4 },
  muted: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted, textAlign: 'right' },
  team: { fontFamily: fonts.bodyMedium, fontSize: 13, color: theme.textPrimary },
  compText: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted },
  famText: { fontFamily: fonts.body, fontSize: 12, color: theme.textPrimary },
  famMuted: { fontFamily: fonts.body, fontSize: 12, color: theme.textFaint },
  famWarn: { fontFamily: fonts.bodyMedium, fontSize: 11, color: theme.loss },
  num: { fontFamily: fonts.body, fontSize: 12, color: theme.textPrimary, textAlign: 'right' },
  numStrong: { fontFamily: fonts.bodySemiBold, fontSize: 13, textAlign: 'right' },

  detailHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm, flexWrap: 'wrap' },
  backBtn: { paddingVertical: 4, paddingHorizontal: spacing.sm, borderWidth: layout.borderWidth, borderColor: theme.border, borderRadius: 999, backgroundColor: theme.surface },
  backText: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: theme.accentGreen },
  detailLabel: { fontFamily: fonts.bodyMedium, fontSize: 13, color: theme.textMuted },
});
