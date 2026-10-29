import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useQueries, useQuery } from '@tanstack/react-query';

import DragScroll from '@/components/shared/DragScroll';
import FilterDropdown from '@/components/shared/FilterDropdown';
import PageControls, { PAGE_SIZE } from '@/components/shared/PageControls';
import { useAllGradingLeagues, useLiveCompetitionFeed } from '@/hooks/useLiveCompetitions';
import { useLiveFixtures } from '@/hooks/useLiveFixtures';
import { useLiveStatsTables } from '@/hooks/useLiveStatsTables';
import { fetchAllFixturesBetween, fetchAllUpcomingValue, seasonWindowUnix } from '@/services/oddAlerts';
import { clientStaleTime } from '@/services/oddAlertsCachePolicy';
import { buildLeagueStatsLive } from '@/services/statsBuilder';
import { nextFixtureFor, type UpcomingLite } from '@/utils/statsGrading';
import {
  buildStatCall,
  sortByDifference,
  sortByValue,
  tallyTiers,
  callStats,
  valueOddsIndex,
  lookupOdds,
  SPLITS,
  type SkeletonRow,
  type SplitMode,
  type Tier,
} from '@/utils/querySkeleton';
import { DA_MIN, NONE_MAX } from '@/utils/unity';
import { fonts, layout, spacing, theme } from '@/styles/theme';

const ALL = 'all';
type SortMode = 'diff' | 'value';
type TierFilter = 'all' | Tier;

const DIRECTION_ROWS: { pattern: string; reading: string; kind: 'goals' | 'none' | 'conditional' }[] = [
  { pattern: 'SC ↑  vs  Conc ↑', reading: 'Goals direction', kind: 'goals' },
  { pattern: 'Conc ↑  vs  Conc ↑', reading: 'No direction', kind: 'none' },
  { pattern: 'SC  vs  SC', reading: 'Depends on opponent', kind: 'conditional' },
];

function fmt(value: number | null, pctBased: boolean, decimals: number): string {
  if (value == null) return '—';
  return pctBased ? `${Math.round(value)}%` : value.toFixed(decimals);
}
function fmtDiff(r: SkeletonRow): string {
  if (r.difference == null) return '—';
  const v = r.pctBased ? `${Math.round(Math.abs(r.difference))}%` : Math.abs(r.difference).toFixed(r.decimals);
  const sign = r.difference > 0 ? '+' : r.difference < 0 ? '−' : '';
  return `${sign}${v}`;
}
function tierColor(t: Tier): string {
  if (t === 'top') return theme.accentGreen;
  if (t === 'middle') return theme.yellow;
  if (t === 'bottom') return theme.textMuted;
  return theme.textFaint;
}
function tierLabel(t: Tier): string {
  if (t === 'top') return 'Top · DA';
  if (t === 'middle') return 'Mid · border';
  if (t === 'bottom') return 'Bottom';
  return '—';
}
/** Turn the value feed's market slug into a readable pick (no explicit selection). */
function prettyMarket(odds: { market: string; selection: string }): string {
  if (odds.selection) return odds.selection;
  const m = odds.market.toLowerCase().replace(/_probability$/, '');
  const known: Record<string, string> = {
    home_win: 'Home win', away_win: 'Away win', draw: 'Draw', btts: 'BTTS',
    home_win_ht: 'Home HT', away_win_ht: 'Away HT', draw_ht: 'Draw HT',
  };
  if (known[m]) return known[m];
  let x = m.match(/^o(\d)(\d)$/);
  if (x) return `Over ${x[1]}.${x[2]}`;
  x = m.match(/^u(\d)(\d)$/);
  if (x) return `Under ${x[1]}.${x[2]}`;
  x = m.match(/^(home|away)_goals_(\d)(\d)$/);
  if (x) return `${x[1] === 'home' ? 'Home' : 'Away'} O${x[2]}.${x[3]}`;
  return m.replace(/_/g, ' ') || 'Value';
}
function kickoffLabel(unix: number, fallback: string): string {
  if (!Number.isFinite(unix) || unix <= 0) return fallback;
  try {
    return new Date(unix * 1000).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch {
    return fallback;
  }
}

export default function QuerySkeletonPanel() {
  const narrow = useWindowDimensions().width < 720;

  const feed = useLiveCompetitionFeed(3);
  const liveLeagues = useMemo(() => feed.competitions.filter((c) => c.rank === 0), [feed.competitions]);
  const all = useAllGradingLeagues();
  const pickLeagues = all.leagues;
  const leaguesById = useMemo(() => new Map([...pickLeagues, ...liveLeagues].map((l) => [l.id, l])), [pickLeagues, liveLeagues]);

  // Default to every ongoing competition combined.
  const [selection, setSelection] = useState<string>(ALL);
  const allLeagues = selection === ALL;
  const singleId = allLeagues || selection === '' ? null : Number(selection);
  const activeComp = singleId != null ? leaguesById.get(singleId) ?? null : null;

  const [split, setSplit] = useState<SplitMode>('homeaway');
  const stats = useMemo(() => callStats(split), [split]);
  const [statKey, setStatKey] = useState('sc_pct');
  useEffect(() => {
    if (!stats.some((s) => s.key === statKey)) setStatKey(stats[0]?.key ?? '');
  }, [stats, statKey]);
  const [sortMode, setSortMode] = useState<SortMode>('diff');
  const [tierFilter, setTierFilter] = useState<TierFilter>('all');
  const [minGames, setMinGames] = useState(5);
  const [page, setPage] = useState(1);
  const [showLogic, setShowLogic] = useState(false);

  // One league.
  const live = useLiveStatsTables({ competitionId: allLeagues ? undefined : singleId ?? undefined, seasonName: activeComp?.season });

  // All ongoing leagues combined — one build per league.
  const allResults = useQueries({
    queries: (allLeagues ? liveLeagues : []).map((comp) => {
      const { fromUnix, toUnix } = seasonWindowUnix(comp.season ?? '');
      return {
        queryKey: ['skeleton-league', comp.id, comp.season] as const,
        queryFn: () => buildLeagueStatsLive((o) => fetchAllFixturesBetween(o), { competitionId: comp.id, fromUnix, toUnix, season: comp.season }),
        staleTime: clientStaleTime('stats/season'),
      };
    }),
  });
  const allSig = allResults.map((r, i) => (r.data ? `${liveLeagues[i]?.id}:${r.dataUpdatedAt}` : '')).join('|');
  const settled = allResults.filter((r) => r.isSuccess || r.isError).length;

  // Upcoming fixtures (all leagues) → each team's next match.
  const up = useLiveFixtures('ns', { upcomingDays: 7, upcomingScope: 'all' });
  const upcoming: UpcomingLite[] = useMemo(
    () => up.fixtures.map((fx) => ({
      id: fx.id, kickoffUnix: fx.kickoffUnix, kickoff: fx.kickoff, competition: fx.competition.name,
      homeId: fx.home.id, homeName: fx.home.name, awayId: fx.away.id, awayName: fx.away.name,
    })),
    [up.fixtures],
  );

  // Upcoming value odds, indexed by fixture id and by name pair.
  const oddsQuery = useQuery({
    queryKey: ['skeleton-value-odds'],
    queryFn: () => fetchAllUpcomingValue({ maxPages: 6 }),
    staleTime: clientStaleTime('value/upcoming'),
  });
  const oddsIdx = useMemo(() => valueOddsIndex(oddsQuery.data ?? []), [oddsQuery.data]);

  const built = useMemo(() => {
    let base: SkeletonRow[] = [];
    if (allLeagues) {
      allResults.forEach((r, i) => { if (r.data && liveLeagues[i]) base.push(...buildStatCall(r.data, liveLeagues[i].name, statKey, split)); });
    } else if (live.data) {
      base = buildStatCall(live.data, activeComp?.name ?? '', statKey, split);
    }
    base = base.filter((r) => r.measure != null && (r.sample ?? 0) >= minGames);
    return sortMode === 'value' ? sortByValue(base) : sortByDifference(base);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allLeagues, live.data, allSig, activeComp?.name, statKey, split, sortMode, minGames]);

  const tiers = useMemo(() => tallyTiers(built), [built]);
  const rows = useMemo(() => (tierFilter === 'all' ? built : built.filter((r) => r.tier === tierFilter)), [built, tierFilter]);

  useEffect(() => setPage(1), [selection, statKey, split, sortMode, tierFilter, minGames]);

  const loading = selection === '' || (allLeagues ? feed.loading || settled < liveLeagues.length : live.loading && !live.data);
  const err = allLeagues ? null : live.error;
  const activeSplit = SPLITS.find((s) => s.id === split)!;
  const statLabel = stats.find((s) => s.key === statKey)?.label ?? statKey;

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safe = Math.min(page, pages);
  const start = (safe - 1) * PAGE_SIZE;
  const visible = rows.slice(start, start + PAGE_SIZE);

  const leagueOptions = [
    { value: ALL, label: `All ongoing competitions (${liveLeagues.length})` },
    ...pickLeagues.map((l) => ({ value: String(l.id), label: `${l.name} · ${l.country}` })),
  ];
  const tierButtons: { id: TierFilter; label: string; n: number }[] = [
    { id: 'all', label: 'All', n: built.length },
    { id: 'top', label: 'Top · 60+', n: tiers.top },
    { id: 'middle', label: 'Middle · 40–59', n: tiers.middle },
    { id: 'bottom', label: 'Bottom · 0–39', n: tiers.bottom },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Query Skeleton</Text>
        <Text style={styles.subtitle}>
          A live call against every ongoing competition. Pick a stat and a split — the difference
          (Home − Away or 1st − 2nd half) is graded into difference tiers: Top (60–100), Middle
          (40–59), Bottom (0–39). The separate DA label uses 0–15 None DA, 16–24 Lean DA, and DA at 25+.
          Biggest difference first, with each
          team&apos;s next fixture and its best value odds.
        </Text>
      </View>

      {/* Stat-call dropdowns */}
      <View style={styles.toolbar}>
        <FilterDropdown label="Competition" value={selection} options={leagueOptions} onChange={setSelection} style={narrow ? styles.full : styles.flex} />
        <View style={[styles.filterRow, narrow && styles.filterCol]}>
          <FilterDropdown label="Stat call" value={statKey} options={stats.map((s) => ({ value: s.key, label: s.label }))} onChange={setStatKey} style={narrow ? styles.full : styles.flex} />
          <FilterDropdown label="Split" value={split} options={SPLITS.map((s) => ({ value: s.id, label: s.label }))} onChange={(v) => setSplit(v as SplitMode)} style={narrow ? styles.full : styles.flex} />
          <FilterDropdown label="Sort by" value={sortMode} options={[{ value: 'diff', label: 'Biggest difference' }, { value: 'value', label: 'Highest value' }]} onChange={(v) => setSortMode(v as SortMode)} style={narrow ? styles.full : styles.flex} />
          <FilterDropdown label="Min games" value={String(minGames)} options={[{ value: '1', label: 'Any games' }, { value: '3', label: '3+ games' }, { value: '5', label: '5+ games' }, { value: '8', label: '8+ games' }]} onChange={(v) => setMinGames(Number(v))} style={narrow ? styles.full : styles.flex} />
        </View>
      </View>

      {/* Tier filter buttons */}
      <View style={styles.tierRow}>
        {tierButtons.map((b) => {
          const on = tierFilter === b.id;
          const color = b.id === 'all' ? theme.accentBlue : tierColor(b.id as Tier);
          return (
            <Pressable
              key={b.id}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => setTierFilter(b.id)}
              style={[styles.tierBtn, on && { borderColor: color, backgroundColor: 'rgba(5,150,105,0.06)' }]}>
              <Text style={[styles.tierBtnText, { color: on ? color : theme.textMuted }]}>{b.label}</Text>
              <Text style={[styles.tierBtnCount, on && { color }]}>{b.n}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Status */}
      <View style={styles.statusRow}>
        {loading ? (
          <>
            <ActivityIndicator size="small" color={theme.accentGreen} />
            <Text style={styles.statusMuted}>{allLeagues ? `Querying ${settled}/${liveLeagues.length} competitions…` : 'Querying the competition…'}</Text>
          </>
        ) : err ? (
          <Text style={styles.statusMuted}>Live data unavailable: {err}</Text>
        ) : (
          <Text style={styles.statusLive}>
            ● {allLeagues ? `${liveLeagues.length} competitions` : activeComp?.name ?? ''} · {statLabel} · {activeSplit.label} · {rows.length} teams
            {oddsQuery.data ? ` · odds ${oddsIdx.byId.size + oddsIdx.byName.size}` : ''}
          </Text>
        )}
      </View>

      {/* Table */}
      {!loading && !err ? (
        rows.length === 0 ? (
          <Text style={styles.empty}>No teams for this call. Try another stat, split or tier.</Text>
        ) : (
          <>
            <PageControls page={safe} pages={pages} total={rows.length} from={start + 1} to={start + visible.length} onChange={setPage} />
            <DragScroll horizontal style={styles.scroll} contentContainerStyle={styles.scrollContent}>
              <View style={styles.table}>
                <View style={[styles.row, styles.headRow]}>
                  <Text style={[styles.cRank, styles.headText, styles.right]}>#</Text>
                  <Text style={[styles.cTeam, styles.headText]}>Team</Text>
                  {allLeagues ? <Text style={[styles.cComp, styles.headText]}>League</Text> : null}
                  <Text style={[styles.cNum, styles.headText, styles.right]}>{activeSplit.aLabel}</Text>
                  <Text style={[styles.cNum, styles.headText, styles.right]}>{activeSplit.bLabel}</Text>
                  <Text style={[styles.cNum, styles.headText, styles.right]}>Diff</Text>
                  <Text style={[styles.cTier, styles.headText]}>Tier</Text>
                  <Text style={[styles.cNext, styles.headText]}>Next match</Text>
                  <Text style={[styles.cOdds, styles.headText]}>Value odds</Text>
                </View>
                {visible.map((r, i) => {
                  const color = tierColor(r.tier);
                  const nf = nextFixtureFor(r.teamId, r.team, upcoming);
                  const odds = nf ? lookupOdds(oddsIdx, nf.fixture.id, nf.fixture.homeName, nf.fixture.awayName) : null;
                  return (
                    <View key={`${r.competition}-${r.team}`} style={[styles.row, i % 2 === 1 && styles.rowAlt]}>
                      <Text style={[styles.cRank, styles.muted]}>{start + i + 1}</Text>
                      <Text style={[styles.cTeam, styles.team]} numberOfLines={1}>
                        {r.team}
                        <Text style={styles.teamGames}>  ·{r.sample ?? 0}g</Text>
                      </Text>
                      {allLeagues ? <Text style={[styles.cComp, styles.compText]} numberOfLines={1}>{r.competition}</Text> : null}
                      <Text style={[styles.cNum, styles.num]}>{fmt(r.aValue, r.pctBased, r.decimals)}</Text>
                      <Text style={[styles.cNum, styles.num]}>{fmt(r.bValue, r.pctBased, r.decimals)}</Text>
                      <Text style={[styles.cNum, styles.numStrong, { color }]}>{fmtDiff(r)}</Text>
                      <View style={styles.cTier}>
                        <View style={[styles.tierChip, { borderColor: color }]}>
                          <Text style={[styles.tierChipText, { color }]}>{tierLabel(r.tier)}</Text>
                        </View>
                      </View>
                      <View style={styles.cNext}>
                        {nf ? (
                          <>
                            <Text style={styles.nextOpp} numberOfLines={1}>{nf.side === 'home' ? 'vs ' : '@ '}{nf.opponentName}</Text>
                            <Text style={styles.nextKo} numberOfLines={1}>{nf.side === 'home' ? 'Home' : 'Away'} · {kickoffLabel(nf.fixture.kickoffUnix, nf.fixture.kickoff)}</Text>
                          </>
                        ) : (
                          <Text style={styles.nextNone}>no fixture</Text>
                        )}
                      </View>
                      <View style={styles.cOdds}>
                        {odds ? (
                          <>
                            <Text style={styles.oddsPrice}>{odds.price.toFixed(2)}</Text>
                            <Text style={styles.oddsSel} numberOfLines={1}>{prettyMarket(odds)}</Text>
                          </>
                        ) : (
                          <Text style={styles.nextNone}>{up.loading || oddsQuery.isPending ? '…' : '—'}</Text>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            </DragScroll>
            <PageControls page={safe} pages={pages} total={rows.length} from={start + 1} to={start + visible.length} onChange={setPage} />
          </>
        )
      ) : null}

      {/* Skeleton logic & legend (the strategy framework) */}
      <View style={styles.logic}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: showLogic }} onPress={() => setShowLogic((o) => !o)} style={styles.logicHead}>
          <Text style={styles.logicTitle}>Skeleton logic & legend</Text>
          <Text style={styles.chevron}>{showLogic ? '▴' : '▾'}</Text>
        </Pressable>
        {showLogic ? (
          <View style={styles.logicBody}>
            <Text style={styles.logicCaption}>Stat-direction logic — how two stats read against each other (at FT / 1st / 2nd half):</Text>
            {DIRECTION_ROWS.map((d) => {
              const c = d.kind === 'goals' ? theme.accentGreen : d.kind === 'conditional' ? theme.yellow : theme.textMuted;
              return (
                <View key={d.pattern} style={styles.logicRow}>
                  <Text style={styles.logicPattern}>{d.pattern}</Text>
                  <View style={[styles.pill, { borderColor: c }]}><Text style={[styles.pillText, { color: c }]}>{d.reading}</Text></View>
                </View>
              );
            })}
            <Text style={styles.logicCaption}>
              Difference tiers: Top = 60–100, Middle = 40–59, Bottom = 0–39. DA status is separate:
              None DA = 0–{NONE_MAX}%, Lean DA = {NONE_MAX + 1}–{DA_MIN - 1}%, DA = {DA_MIN}% or more.
              Value odds are the best price on each team&apos;s next fixture, where the feed prices it.
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', alignSelf: 'stretch' },
  header: { marginBottom: spacing.md },
  title: { fontFamily: fonts.display, fontSize: 24, color: theme.textPrimary, marginBottom: spacing.xs },
  subtitle: { fontFamily: fonts.body, fontSize: 13, lineHeight: 20, color: theme.textMuted },

  toolbar: {
    borderWidth: layout.borderWidth, borderColor: theme.border, borderRadius: layout.borderRadius,
    backgroundColor: theme.surface, padding: spacing.md, gap: spacing.sm,
  },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  filterCol: { flexDirection: 'column' },
  flex: { flexGrow: 1, flexBasis: 160, minWidth: 140 },
  full: { width: '100%', minWidth: 0, flexBasis: 'auto', flexGrow: 0 },

  tierRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  tierBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1.5, borderColor: theme.border, borderRadius: 999,
    paddingHorizontal: spacing.md, paddingVertical: 6, backgroundColor: theme.surface,
  },
  tierBtnText: { fontFamily: fonts.bodySemiBold, fontSize: 12 },
  tierBtnCount: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: theme.textFaint },

  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 20, marginTop: spacing.md },
  statusLive: { fontFamily: fonts.bodyMedium, fontSize: 12, color: theme.accentGreen },
  statusMuted: { fontFamily: fonts.body, fontSize: 12, color: theme.textMuted },
  empty: { fontFamily: fonts.body, fontSize: 13, color: theme.textMuted, textAlign: 'center', paddingVertical: spacing.lg },

  scroll: { width: '100%', maxWidth: '100%' },
  scrollContent: { minWidth: '100%' },
  table: {
    width: '100%', minWidth: 880, backgroundColor: theme.surface, borderWidth: layout.borderWidth,
    borderColor: theme.border, borderRadius: layout.borderRadius, overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, paddingHorizontal: spacing.sm },
  headRow: { backgroundColor: theme.surfaceMuted, borderBottomWidth: layout.borderWidth, borderBottomColor: theme.border },
  rowAlt: { backgroundColor: theme.surfaceHover },
  headText: { fontFamily: fonts.bodySemiBold, fontSize: 10, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 4 },
  right: { textAlign: 'right' },
  cRank: { width: 30, paddingHorizontal: 4 },
  cTeam: { flex: 1, minWidth: 130, paddingHorizontal: 4 },
  cComp: { width: 120, paddingHorizontal: 4 },
  cNum: { width: 64, paddingHorizontal: 4 },
  cTier: { width: 96, paddingHorizontal: 4 },
  cNext: { width: 170, paddingHorizontal: 4 },
  cOdds: { width: 120, paddingHorizontal: 4 },
  muted: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted, textAlign: 'right' },
  team: { fontFamily: fonts.bodyMedium, fontSize: 13, color: theme.textPrimary },
  teamGames: { fontFamily: fonts.body, fontSize: 10, color: theme.textFaint },
  compText: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted },
  num: { fontFamily: fonts.body, fontSize: 12, color: theme.textPrimary, textAlign: 'right' },
  numStrong: { fontFamily: fonts.bodySemiBold, fontSize: 13, textAlign: 'right' },
  tierChip: { alignSelf: 'flex-start', borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  tierChipText: { fontFamily: fonts.bodySemiBold, fontSize: 10 },
  nextOpp: { fontFamily: fonts.bodyMedium, fontSize: 12, color: theme.textPrimary },
  nextKo: { fontFamily: fonts.body, fontSize: 10, color: theme.textMuted, marginTop: 1 },
  nextNone: { fontFamily: fonts.body, fontSize: 11, color: theme.textFaint },
  oddsPrice: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.accentGreen },
  oddsSel: { fontFamily: fonts.body, fontSize: 10, color: theme.textMuted, marginTop: 1 },

  logic: {
    marginTop: spacing.md, borderWidth: layout.borderWidth, borderColor: theme.border,
    borderRadius: layout.borderRadius, backgroundColor: theme.surface, overflow: 'hidden',
  },
  logicHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.md },
  logicTitle: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.textPrimary },
  chevron: { fontFamily: fonts.bodySemiBold, fontSize: 16, color: theme.accentGreen },
  logicBody: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, gap: spacing.sm, borderTopWidth: layout.borderWidth, borderTopColor: theme.border },
  logicCaption: { fontFamily: fonts.body, fontSize: 12, lineHeight: 18, color: theme.textMuted, marginTop: spacing.sm },
  logicRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  logicPattern: { fontFamily: fonts.bodyMedium, fontSize: 13, color: theme.textPrimary },
  pill: { borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 },
  pillText: { fontFamily: fonts.bodySemiBold, fontSize: 11 },
});
