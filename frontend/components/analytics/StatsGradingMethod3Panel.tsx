import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useQueries, useQuery } from '@tanstack/react-query';

import FilterDropdown from '@/components/shared/FilterDropdown';
import PageControls, { PAGE_SIZE } from '@/components/shared/PageControls';
import { useLiveCompetitionFeed } from '@/hooks/useLiveCompetitions';
import { useLiveFixtures } from '@/hooks/useLiveFixtures';
import { fetchAllFixturesBetween, fetchAllUpcomingValue, seasonWindowUnix } from '@/services/oddAlerts';
import { clientStaleTime } from '@/services/oddAlertsCachePolicy';
import { buildLeagueStatsLive } from '@/services/statsBuilder';
import type { TeamStatsExport } from '@/types/data';
import { valueOddsIndex, lookupOdds } from '@/utils/querySkeleton';
import {
  matchFixture,
  newCondition,
  PRESETS,
  SIDES,
  WINDOWS,
  PERIODS,
  SCOPES,
  CMPS,
  FILTER_STATS,
  filterStat,
  type Cmp,
  type Condition,
  type FilterPeriod,
  type FilterScope,
  type FilterWindow,
  type Reason,
  type Side,
} from '@/utils/strategyFilter';
import { fonts, layout, spacing, theme } from '@/styles/theme';

const CUSTOM = 'custom';

function fmtVal(v: number, kind: 'pct' | 'avg'): string {
  return kind === 'pct' ? `${Math.round(v)}%` : v.toFixed(2);
}
function cmpSym(c: Cmp): string {
  return c === 'gte' ? '≥' : '≤';
}
function prettyMarket(market: string, selection: string): string {
  if (selection) return selection;
  const m = market.toLowerCase().replace(/_probability$/, '');
  const known: Record<string, string> = { home_win: 'Home win', away_win: 'Away win', draw: 'Draw', btts: 'BTTS' };
  if (known[m]) return known[m];
  let x = m.match(/^o(\d)(\d)$/);
  if (x) return `Over ${x[1]}.${x[2]}`;
  x = m.match(/^u(\d)(\d)$/);
  if (x) return `Under ${x[1]}.${x[2]}`;
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
function cloneConditions(conds: Condition[]): Condition[] {
  const stamp = Date.now();
  return conds.map((c, i) => ({ ...c, id: `p${stamp}_${i}` }));
}

export default function StatsGradingMethod3Panel() {
  const narrow = useWindowDimensions().width < 720;

  const feed = useLiveCompetitionFeed(3);
  const liveLeagues = useMemo(() => feed.competitions.filter((c) => c.rank === 0), [feed.competitions]);

  const [presetId, setPresetId] = useState<string>('leaky');
  const [conditions, setConditions] = useState<Condition[]>(() => cloneConditions(PRESETS[0].conditions));
  const [minGames, setMinGames] = useState(10);
  const [showBuilder, setShowBuilder] = useState(false);
  const [page, setPage] = useState(1);

  function applyPreset(id: string) {
    setPresetId(id);
    if (id === CUSTOM) return;
    const p = PRESETS.find((x) => x.id === id);
    if (p) {
      setConditions(cloneConditions(p.conditions));
      setMinGames(p.minGames);
    }
  }
  function patchCondition(id: string, patch: Partial<Condition>) {
    setConditions((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    setPresetId(CUSTOM);
  }
  function removeCondition(id: string) {
    setConditions((cs) => cs.filter((c) => c.id !== id));
    setPresetId(CUSTOM);
  }
  function addCondition() {
    setConditions((cs) => [...cs, newCondition()]);
    setPresetId(CUSTOM);
  }

  // One stats build per ongoing league.
  const results = useQueries({
    queries: liveLeagues.map((comp) => {
      const { fromUnix, toUnix } = seasonWindowUnix(comp.season ?? '');
      return {
        queryKey: ['method3-league', comp.id, comp.season] as const,
        queryFn: () => buildLeagueStatsLive((o) => fetchAllFixturesBetween(o), { competitionId: comp.id, fromUnix, toUnix, season: comp.season }),
        staleTime: clientStaleTime('stats/season'),
      };
    }),
  });
  const sig = results.map((r, i) => (r.data ? `${liveLeagues[i]?.id}:${r.dataUpdatedAt}` : '')).join('|');
  const settled = results.filter((r) => r.isSuccess || r.isError).length;

  const exportByLeague = useMemo(() => {
    const m = new Map<number, TeamStatsExport>();
    results.forEach((r, i) => { if (r.data && liveLeagues[i]) m.set(liveLeagues[i].id, r.data); });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  const up = useLiveFixtures('ns', { upcomingDays: 7, upcomingScope: 'all' });

  const oddsQuery = useQuery({
    queryKey: ['method3-value-odds'],
    queryFn: () => fetchAllUpcomingValue({ maxPages: 6 }),
    staleTime: clientStaleTime('value/upcoming'),
  });
  const oddsIdx = useMemo(() => valueOddsIndex(oddsQuery.data ?? []), [oddsQuery.data]);

  const matches = useMemo(() => {
    const out: { fx: (typeof up.fixtures)[number]; reasons: Reason[] }[] = [];
    for (const fx of up.fixtures) {
      const ex = exportByLeague.get(fx.competition.id);
      if (!ex) continue;
      const res = matchFixture(ex, fx.home.name, fx.away.name, conditions, minGames);
      if (res.matched) out.push({ fx, reasons: res.reasons });
    }
    out.sort((a, b) => a.fx.kickoffUnix - b.fx.kickoffUnix);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exportByLeague, up.fixtures, conditions, minGames]);

  useEffect(() => setPage(1), [presetId, conditions, minGames]);

  const loading = feed.loading || settled < liveLeagues.length || up.loading;
  const pages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
  const safe = Math.min(page, pages);
  const start = (safe - 1) * PAGE_SIZE;
  const visible = matches.slice(start, start + PAGE_SIZE);
  const activePreset = PRESETS.find((p) => p.id === presetId);
  const presetOptions = [...PRESETS.map((p) => ({ value: p.id, label: p.label })), { value: CUSTOM, label: 'Custom filter' }];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Stats Grading · Method 3</Text>
        <Text style={styles.subtitle}>
          A strategy filter that scans upcoming fixtures across every ongoing competition and keeps the
          matches where BOTH teams meet the criteria, read from our season and last-N stats. Pick a preset
          or build your own across any stat. Live in-play rules (shots, pressure, live odds) aren&apos;t in our
          data, so they&apos;re omitted; &quot;BTTS model&quot; uses the historical BTTS% rate; and the 2nd-half 0-0
          rate is a match stat we can&apos;t read per team.
        </Text>
      </View>

      <View style={styles.toolbar}>
        <FilterDropdown label="Strategy" value={presetId} options={presetOptions} onChange={applyPreset} style={narrow ? styles.full : styles.flex} />
        <View style={styles.minGames}>
          <Text style={styles.minLabel}>Min games</Text>
          <TextInput
            value={String(minGames)}
            onChangeText={(t) => { const n = Number(t.replace(/[^0-9]/g, '')); setMinGames(Number.isFinite(n) ? n : 0); setPresetId(CUSTOM); }}
            keyboardType="number-pad"
            style={styles.minInput}
          />
        </View>
      </View>
      {activePreset ? <Text style={styles.presetNote}>{activePreset.note}</Text> : null}

      {/* Conditions builder */}
      <View style={styles.builder}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: showBuilder }} onPress={() => setShowBuilder((o) => !o)} style={styles.builderHead}>
          <Text style={styles.builderTitle}>Conditions · {conditions.length}</Text>
          <Text style={styles.chevron}>{showBuilder ? '▴' : '▾'}</Text>
        </Pressable>
        {showBuilder ? (
          <View style={styles.builderBody}>
            {conditions.map((c) => {
              const stat = filterStat(c.statKey);
              return (
                <View key={c.id} style={styles.condCard}>
                  <View style={styles.condRow}>
                    <FilterDropdown label="Side" value={c.side} options={SIDES} onChange={(v) => patchCondition(c.id, { side: v as Side })} style={styles.condField} />
                    <FilterDropdown label="Stat" value={c.statKey} options={FILTER_STATS.map((s) => ({ value: s.key, label: s.label }))} onChange={(v) => patchCondition(c.id, { statKey: v })} style={styles.condFieldWide} />
                  </View>
                  <View style={styles.condRow}>
                    <FilterDropdown label="Window" value={c.window} options={WINDOWS} onChange={(v) => patchCondition(c.id, { window: v as FilterWindow })} style={styles.condField} />
                    <FilterDropdown label="Period" value={c.period} options={PERIODS} onChange={(v) => patchCondition(c.id, { period: v as FilterPeriod })} style={styles.condField} />
                    <FilterDropdown label="Scope" value={c.scope} options={SCOPES} onChange={(v) => patchCondition(c.id, { scope: v as FilterScope })} style={styles.condField} />
                  </View>
                  <View style={styles.condRow}>
                    <FilterDropdown label="Test" value={c.cmp} options={CMPS} onChange={(v) => patchCondition(c.id, { cmp: v as Cmp })} style={styles.condFieldSm} />
                    <View style={styles.condValueWrap}>
                      <Text style={styles.minLabel}>Value {stat.kind === 'pct' ? '%' : ''}</Text>
                      <TextInput
                        value={String(c.value)}
                        onChangeText={(t) => { const n = Number(t.replace(/[^0-9.]/g, '')); patchCondition(c.id, { value: Number.isFinite(n) ? n : 0 }); }}
                        keyboardType="decimal-pad"
                        style={styles.condValue}
                      />
                    </View>
                    <Pressable accessibilityRole="button" onPress={() => removeCondition(c.id)} style={styles.removeBtn}>
                      <Text style={styles.removeText}>✕</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
            <Pressable accessibilityRole="button" onPress={addCondition} style={styles.addBtn}>
              <Text style={styles.addText}>+ Add condition</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      {/* Status */}
      <View style={styles.statusRow}>
        {loading ? (
          <>
            <ActivityIndicator size="small" color={theme.accentGreen} />
            <Text style={styles.statusMuted}>Scanning fixtures · {settled}/{liveLeagues.length} leagues…</Text>
          </>
        ) : (
          <Text style={styles.statusLive}>● {matches.length} matching fixtures · {liveLeagues.length} competitions{oddsQuery.data ? ' · odds on' : ''}</Text>
        )}
      </View>

      {!loading ? (
        matches.length === 0 ? (
          <Text style={styles.empty}>No upcoming fixtures meet these conditions. Loosen a threshold or lower min games.</Text>
        ) : (
          <>
            <PageControls page={safe} pages={pages} total={matches.length} from={start + 1} to={start + visible.length} onChange={setPage} />
            {visible.map(({ fx, reasons }) => {
              const odds = lookupOdds(oddsIdx, fx.id, fx.home.name, fx.away.name);
              return (
                <View key={fx.id} style={styles.card}>
                  <View style={styles.cardHead}>
                    <View style={styles.cardTitleWrap}>
                      <Text style={styles.cardTitle} numberOfLines={1}>{fx.home.name} <Text style={styles.vs}>vs</Text> {fx.away.name}</Text>
                      <Text style={styles.cardSub} numberOfLines={1}>{fx.competition.name} · {kickoffLabel(fx.kickoffUnix, fx.kickoff)}</Text>
                    </View>
                    {odds ? (
                      <View style={styles.oddsBadge}>
                        <Text style={styles.oddsPrice}>{odds.price.toFixed(2)}</Text>
                        <Text style={styles.oddsSel} numberOfLines={1}>{prettyMarket(odds.market, odds.selection)}</Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.reasonWrap}>
                    {reasons.map((r, i) => (
                      <View key={i} style={styles.reasonChip}>
                        <Text style={styles.reasonText}>
                          <Text style={styles.reasonSide}>{r.side}</Text> {r.label} {fmtVal(r.value, r.kind)} <Text style={styles.reasonTarget}>{cmpSym(r.cmp)}{r.kind === 'pct' ? `${r.target}%` : r.target}</Text>
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              );
            })}
            <PageControls page={safe} pages={pages} total={matches.length} from={start + 1} to={start + visible.length} onChange={setPage} />
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
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: spacing.sm,
    borderWidth: layout.borderWidth, borderColor: theme.border, borderRadius: layout.borderRadius,
    backgroundColor: theme.surface, padding: spacing.md,
  },
  flex: { flexGrow: 1, flexBasis: 220, minWidth: 180 },
  full: { width: '100%', minWidth: 0, flexBasis: 'auto', flexGrow: 0 },
  minGames: { gap: 4 },
  minLabel: { fontFamily: fonts.bodySemiBold, fontSize: 10, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  minInput: { width: 70, borderWidth: layout.borderWidth, borderColor: theme.border, borderRadius: layout.borderRadius, paddingHorizontal: spacing.sm, paddingVertical: 8, fontFamily: fonts.bodyMedium, fontSize: 14, color: theme.textPrimary, backgroundColor: theme.surfaceHover, textAlign: 'center' },
  presetNote: { fontFamily: fonts.body, fontSize: 12, lineHeight: 18, color: theme.textMuted, marginTop: spacing.sm, fontStyle: 'italic' },

  builder: {
    marginTop: spacing.md, borderWidth: layout.borderWidth, borderColor: theme.border,
    borderRadius: layout.borderRadius, backgroundColor: theme.surface, overflow: 'hidden',
  },
  builderHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.md },
  builderTitle: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.textPrimary },
  chevron: { fontFamily: fonts.bodySemiBold, fontSize: 16, color: theme.accentGreen },
  builderBody: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, gap: spacing.sm, borderTopWidth: layout.borderWidth, borderTopColor: theme.border },
  condCard: { borderWidth: layout.borderWidth, borderColor: theme.border, borderRadius: layout.borderRadius, backgroundColor: theme.surfaceHover, padding: spacing.sm, gap: spacing.sm, marginTop: spacing.sm },
  condRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: spacing.sm },
  condField: { flexGrow: 1, flexBasis: 120, minWidth: 100 },
  condFieldWide: { flexGrow: 2, flexBasis: 180, minWidth: 150 },
  condFieldSm: { flexGrow: 0, flexBasis: 90, minWidth: 80 },
  condValueWrap: { gap: 4 },
  condValue: { width: 80, borderWidth: layout.borderWidth, borderColor: theme.border, borderRadius: layout.borderRadius, paddingHorizontal: spacing.sm, paddingVertical: 8, fontFamily: fonts.bodyMedium, fontSize: 14, color: theme.textPrimary, backgroundColor: theme.surface, textAlign: 'center' },
  removeBtn: { alignSelf: 'flex-end', padding: spacing.sm, borderWidth: layout.borderWidth, borderColor: theme.border, borderRadius: layout.borderRadius, backgroundColor: theme.surface },
  removeText: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.loss },
  addBtn: { marginTop: spacing.sm, alignSelf: 'flex-start', borderWidth: 1.5, borderColor: theme.accentGreen, borderRadius: 999, paddingHorizontal: spacing.md, paddingVertical: 6 },
  addText: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: theme.accentGreen },

  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 20, marginTop: spacing.md },
  statusLive: { fontFamily: fonts.bodyMedium, fontSize: 12, color: theme.accentGreen },
  statusMuted: { fontFamily: fonts.body, fontSize: 12, color: theme.textMuted },
  empty: { fontFamily: fonts.body, fontSize: 13, color: theme.textMuted, textAlign: 'center', paddingVertical: spacing.lg },

  card: { marginTop: spacing.sm, borderWidth: layout.borderWidth, borderColor: theme.border, borderRadius: layout.borderRadius, backgroundColor: theme.surface, padding: spacing.md },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm },
  cardTitleWrap: { flex: 1 },
  cardTitle: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: theme.textPrimary },
  vs: { fontFamily: fonts.body, fontSize: 12, color: theme.textFaint },
  cardSub: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted, marginTop: 2 },
  oddsBadge: { alignItems: 'flex-end', borderWidth: 1.5, borderColor: theme.accentGreen, borderRadius: layout.borderRadius, paddingHorizontal: spacing.sm, paddingVertical: 4, backgroundColor: 'rgba(5,150,105,0.06)' },
  oddsPrice: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: theme.accentGreen },
  oddsSel: { fontFamily: fonts.body, fontSize: 9, color: theme.textMuted },
  reasonWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.sm },
  reasonChip: { borderWidth: layout.borderWidth, borderColor: theme.accentGreen, borderRadius: 999, backgroundColor: 'rgba(5,150,105,0.06)', paddingHorizontal: 8, paddingVertical: 2 },
  reasonText: { fontFamily: fonts.body, fontSize: 11, color: theme.textPrimary },
  reasonSide: { fontFamily: fonts.bodySemiBold, color: theme.accentGreen },
  reasonTarget: { fontFamily: fonts.body, fontSize: 10, color: theme.textMuted },
});
