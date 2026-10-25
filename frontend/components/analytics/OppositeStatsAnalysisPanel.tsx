import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useQueries } from '@tanstack/react-query';

import DragScroll from '@/components/shared/DragScroll';
import FilterDropdown from '@/components/shared/FilterDropdown';
import PageControls, { PAGE_SIZE } from '@/components/shared/PageControls';
import { useAllGradingLeagues, useLiveCompetitionFeed } from '@/hooks/useLiveCompetitions';
import { useLiveStatsTables } from '@/hooks/useLiveStatsTables';
import { fetchAllFixturesBetween, seasonWindowUnix } from '@/services/oddAlerts';
import { clientStaleTime } from '@/services/oddAlertsCachePolicy';
import { buildLeagueStatsLive } from '@/services/statsBuilder';
import {
  buildOppositeStats,
  sortOpposite,
  SHORT_MAX,
  TRIGGER_RATE,
  type OppositePair,
  type OppositeRow,
  type OppositeScope,
} from '@/utils/oppositeStats';
import { fonts, layout, spacing, theme } from '@/styles/theme';

const ALL = 'all';

function pctOrDash(v: number | null): string {
  return v == null ? '—' : `${Math.round(v)}%`;
}
function rate(v: number | null): string {
  return v == null ? '—' : v.toFixed(2);
}

export default function OppositeStatsAnalysisPanel() {
  const narrow = useWindowDimensions().width < 720;

  const feed = useLiveCompetitionFeed(3);
  const liveLeagues = useMemo(() => feed.competitions.filter((c) => c.rank === 0), [feed.competitions]);
  const all = useAllGradingLeagues();
  const pickLeagues = all.leagues;
  const leaguesById = useMemo(() => new Map([...pickLeagues, ...liveLeagues].map((l) => [l.id, l])), [pickLeagues, liveLeagues]);

  const [selection, setSelection] = useState<string>('');
  useEffect(() => {
    if (selection !== '') return;
    const first = liveLeagues[0]?.id ?? pickLeagues[0]?.id;
    if (first != null) setSelection(String(first));
  }, [liveLeagues, pickLeagues, selection]);
  const allLeagues = selection === ALL;
  const competitionId = allLeagues || selection === '' ? null : Number(selection);
  const activeComp = competitionId != null ? leaguesById.get(competitionId) ?? null : null;

  const [scope, setScope] = useState<OppositeScope>('overall');
  const [triggerOnly, setTriggerOnly] = useState(true);
  const [page, setPage] = useState(1);

  // Single league.
  const live = useLiveStatsTables({ competitionId: allLeagues ? undefined : competitionId ?? undefined, seasonName: activeComp?.season });

  // All active leagues combined — one build per league.
  const allResults = useQueries({
    queries: (allLeagues ? liveLeagues : []).map((comp) => {
      const { fromUnix, toUnix } = seasonWindowUnix(comp.season ?? '');
      return {
        queryKey: ['opposite-league', comp.id, comp.season] as const,
        queryFn: () =>
          buildLeagueStatsLive((o) => fetchAllFixturesBetween(o), { competitionId: comp.id, fromUnix, toUnix, season: comp.season }),
        staleTime: clientStaleTime('stats/season'),
      };
    }),
  });
  const allSig = allResults.map((r, i) => (r.data ? `${liveLeagues[i]?.id}:${r.dataUpdatedAt}` : '')).join('|');
  const settled = allResults.filter((r) => r.isSuccess || r.isError).length;

  const rows = useMemo(() => {
    let built: OppositeRow[];
    if (allLeagues) {
      const merged: OppositeRow[] = [];
      allResults.forEach((r, i) => {
        if (r.data && liveLeagues[i]) merged.push(...buildOppositeStats(r.data, liveLeagues[i].name, scope));
      });
      built = sortOpposite(merged);
    } else {
      if (!live.data) return [];
      built = sortOpposite(buildOppositeStats(live.data, activeComp?.name ?? '', scope));
    }
    return triggerOnly ? built.filter((r) => r.trigger) : built;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allLeagues, live.data, allSig, activeComp?.name, scope, triggerOnly]);

  useEffect(() => {
    setPage(1);
  }, [selection, scope, triggerOnly]);

  const loading = selection === '' || (allLeagues ? feed.loading || settled < liveLeagues.length : live.loading && !live.data);
  const err = allLeagues ? null : live.error;

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safe = Math.min(page, pages);
  const start = (safe - 1) * PAGE_SIZE;
  const visible = rows.slice(start, start + PAGE_SIZE);

  const leagueOptions = [
    { value: ALL, label: `All active leagues combined (${liveLeagues.length})` },
    ...pickLeagues.map((l) => ({ value: String(l.id), label: `${l.name} · ${l.country}` })),
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Opposite Stats Analysis</Text>
        <Text style={styles.subtitle}>
          Complementary pairs — SC% vs FTS% and Conc% vs CS% — per team. A short difference (≤ {SHORT_MAX}%)
          is balanced near 50/50 (no DA); a long difference is a Double Agent. The trigger keeps teams
          that both score and concede (SC/m ≥ {TRIGGER_RATE} and Conc/m ≥ {TRIGGER_RATE}). Smallest
          difference first. Pick the scope to match the fixture&apos;s Home/Away side.
        </Text>
      </View>

      <View style={styles.toolbar}>
        <FilterDropdown label="League" value={selection} options={leagueOptions} onChange={setSelection} style={narrow ? styles.full : styles.flex} />
        <FilterDropdown
          label="Scope"
          value={scope}
          options={[
            { value: 'overall', label: 'Overall' },
            { value: 'home', label: 'Home' },
            { value: 'away', label: 'Away' },
          ]}
          onChange={(v) => setScope(v as OppositeScope)}
          style={narrow ? styles.full : styles.flex}
        />
        <FilterDropdown
          label="Teams"
          value={triggerOnly ? 'trigger' : 'all'}
          options={[
            { value: 'trigger', label: 'Trigger only' },
            { value: 'all', label: 'All teams' },
          ]}
          onChange={(v) => setTriggerOnly(v === 'trigger')}
          style={narrow ? styles.full : styles.flex}
        />
      </View>

      <View style={styles.statusRow}>
        {loading ? (
          <>
            <ActivityIndicator size="small" color={theme.accentGreen} />
            <Text style={styles.statusMuted}>
              {allLeagues ? `Comparing ${settled}/${liveLeagues.length} leagues…` : 'Comparing opposite stats…'}
            </Text>
          </>
        ) : err ? (
          <Text style={styles.statusMuted}>Live data unavailable: {err}</Text>
        ) : (
          <Text style={styles.statusLive}>
            ● {allLeagues ? `${liveLeagues.length} active leagues` : activeComp?.name ?? ''} · {scope} · {rows.length} teams
          </Text>
        )}
      </View>

      {!loading && !err ? (
        rows.length === 0 ? (
          <Text style={styles.empty}>
            {triggerOnly ? 'No teams meet the trigger here — switch to "All teams" or another league.' : 'No team stats available yet.'}
          </Text>
        ) : (
          <>
            <PageControls page={safe} pages={pages} total={rows.length} from={start + 1} to={start + visible.length} onChange={setPage} />
            <DragScroll horizontal style={styles.scroll} contentContainerStyle={styles.scrollContent}>
              <View style={styles.table}>
                <View style={[styles.row, styles.headRow]}>
                  <Text style={[styles.cRank, styles.headText, styles.right]}>#</Text>
                  <Text style={[styles.cTeam, styles.headText]}>Team</Text>
                  {allLeagues ? <Text style={[styles.cComp, styles.headText]}>League</Text> : null}
                  <Text style={[styles.cPair, styles.headText]}>SC% vs FTS%</Text>
                  <Text style={[styles.cPair, styles.headText]}>Conc% vs CS%</Text>
                  <Text style={[styles.cNum, styles.headText, styles.right]}>SC/m</Text>
                  <Text style={[styles.cNum, styles.headText, styles.right]}>Conc/m</Text>
                  <Text style={[styles.cTrig, styles.headText]}>Trigger</Text>
                </View>
                {visible.map((r, i) => (
                  <View key={`${r.competition}-${r.team}`} style={[styles.row, i % 2 === 1 && styles.rowAlt]}>
                    <Text style={[styles.cRank, styles.muted]}>{start + i + 1}</Text>
                    <Text style={[styles.cTeam, styles.team]} numberOfLines={1}>{r.team}</Text>
                    {allLeagues ? <Text style={[styles.cComp, styles.compText]} numberOfLines={1}>{r.competition}</Text> : null}
                    <PairCell p={r.pairs[0]} />
                    <PairCell p={r.pairs[1]} />
                    <Text style={[styles.cNum, styles.num, r.scAvg != null && r.scAvg >= TRIGGER_RATE && styles.rateOk]}>{rate(r.scAvg)}</Text>
                    <Text style={[styles.cNum, styles.num, r.concAvg != null && r.concAvg >= TRIGGER_RATE && styles.rateOk]}>{rate(r.concAvg)}</Text>
                    <View style={styles.cTrig}>
                      <View style={[styles.trig, r.trigger ? styles.trigOn : styles.trigOff]}>
                        <Text style={[styles.trigText, r.trigger ? styles.trigTextOn : styles.trigTextOff]}>{r.trigger ? '✓ yes' : 'no'}</Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            </DragScroll>
            <Text style={styles.hint}>
              Each pair shows both values, their difference, and the allocation: Short = balanced (no DA),
              Long = DA. Confirm a DA against Home/Away before acting.
            </Text>
          </>
        )
      ) : null}
    </View>
  );
}

function PairCell({ p }: { p: OppositePair }) {
  const allocColor = p.allocation === 'long' ? theme.accentPurple : p.allocation === 'short' ? theme.accentGreen : theme.textMuted;
  return (
    <View style={styles.cPair}>
      <Text style={styles.pairValues} numberOfLines={1}>
        {pctOrDash(p.aValue)} <Text style={styles.pairVs}>vs</Text> {pctOrDash(p.bValue)}
      </Text>
      <View style={styles.pairMeta}>
        <Text style={styles.pairDiff}>{p.difference == null ? '—' : `Δ${Math.round(p.difference)}%`}</Text>
        <View style={[styles.alloc, { borderColor: allocColor }]}>
          <Text style={[styles.allocText, { color: allocColor }]}>
            {p.allocation === 'long' ? 'Long · DA' : p.allocation === 'short' ? 'Short · no DA' : '—'}
          </Text>
        </View>
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
    flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm,
    borderWidth: layout.borderWidth, borderColor: theme.border, borderRadius: layout.borderRadius,
    backgroundColor: theme.surface, padding: spacing.md,
  },
  flex: { flexGrow: 1, flexBasis: 160, minWidth: 140 },
  full: { width: '100%', minWidth: 0, flexBasis: 'auto', flexGrow: 0 },

  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 20, marginTop: spacing.md, marginBottom: spacing.sm },
  statusLive: { fontFamily: fonts.bodyMedium, fontSize: 12, color: theme.accentGreen, textTransform: 'capitalize' },
  statusMuted: { fontFamily: fonts.body, fontSize: 12, color: theme.textMuted },
  empty: { fontFamily: fonts.body, fontSize: 13, color: theme.textMuted, textAlign: 'center', paddingVertical: spacing.lg },

  scroll: { width: '100%', maxWidth: '100%' },
  scrollContent: { minWidth: '100%' },
  table: {
    width: '100%', minWidth: 760, backgroundColor: theme.surface, borderWidth: layout.borderWidth,
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
  compText: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted },
  cPair: { width: 190, paddingHorizontal: 4 },
  cNum: { width: 58, paddingHorizontal: 4 },
  cTrig: { width: 66, paddingHorizontal: 4 },
  muted: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted, textAlign: 'right' },
  team: { fontFamily: fonts.bodyMedium, fontSize: 13, color: theme.textPrimary },
  num: { fontFamily: fonts.body, fontSize: 12, color: theme.textPrimary, textAlign: 'right' },
  rateOk: { color: theme.accentGreen, fontFamily: fonts.bodySemiBold },

  pairValues: { fontFamily: fonts.bodyMedium, fontSize: 13, color: theme.textPrimary },
  pairVs: { fontFamily: fonts.body, fontSize: 10, color: theme.textFaint },
  pairMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  pairDiff: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted },
  alloc: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1 },
  allocText: { fontFamily: fonts.bodySemiBold, fontSize: 9 },

  trig: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  trigOn: { borderColor: theme.accentGreen, backgroundColor: 'rgba(5,150,105,0.08)' },
  trigOff: { borderColor: theme.border, backgroundColor: theme.surfaceHover },
  trigText: { fontFamily: fonts.bodySemiBold, fontSize: 10 },
  trigTextOn: { color: theme.accentGreen },
  trigTextOff: { color: theme.textMuted },

  hint: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted, textAlign: 'center', marginTop: spacing.sm },
});
