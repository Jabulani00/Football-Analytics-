import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import DragScroll from '@/components/shared/DragScroll';
import FilterDropdown from '@/components/shared/FilterDropdown';
import PageControls, { PAGE_SIZE } from '@/components/shared/PageControls';
import { useAllGradingLeagues, useLiveCompetitionFeed } from '@/hooks/useLiveCompetitions';
import { useLiveStatsTables } from '@/hooks/useLiveStatsTables';
import {
  buildOmitTestFromExport,
  sortOmitResults,
  DEFAULT_OMIT_PCT,
  DEFAULT_SENSITIVITY_PCT,
  type OmitScenario,
  type OmitTeamResult,
} from '@/utils/omitTest';
import { fonts, layout, spacing, theme } from '@/styles/theme';

function dirColor(d: OmitScenario['direction']): string {
  return d === 'up' ? theme.accentGreen : d === 'down' ? theme.loss : theme.textMuted;
}
function dirArrow(d: OmitScenario['direction']): string {
  return d === 'up' ? '↑' : d === 'down' ? '↓' : '→';
}
function avg(n: number): string {
  return n.toFixed(2);
}
function signed(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}`;
}
function signedPct(n: number | null): string {
  return n == null ? 'n/a' : `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
}

export default function OmitTestPanel() {
  const narrow = useWindowDimensions().width < 720;

  const feed = useLiveCompetitionFeed(3);
  const liveLeagues = useMemo(() => feed.competitions.filter((c) => c.rank === 0), [feed.competitions]);
  const all = useAllGradingLeagues();
  const pickLeagues = all.leagues;
  const leaguesById = useMemo(
    () => new Map([...pickLeagues, ...liveLeagues].map((l) => [l.id, l])),
    [pickLeagues, liveLeagues],
  );

  const [selection, setSelection] = useState<string>('');
  useEffect(() => {
    if (selection !== '') return;
    const first = liveLeagues[0]?.id ?? pickLeagues[0]?.id;
    if (first != null) setSelection(String(first));
  }, [liveLeagues, pickLeagues, selection]);
  const competitionId = selection === '' ? null : Number(selection);
  const activeComp = competitionId != null ? leaguesById.get(competitionId) ?? null : null;

  const [omitPct, setOmitPct] = useState(DEFAULT_OMIT_PCT);
  const [sensitivityPct, setSensitivityPct] = useState(DEFAULT_SENSITIVITY_PCT);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);

  const live = useLiveStatsTables({
    competitionId: competitionId ?? undefined,
    seasonName: activeComp?.season,
  });

  const rows = useMemo(() => {
    if (!live.data) return [];
    return sortOmitResults(buildOmitTestFromExport(live.data, activeComp?.name ?? '', { omitPct, sensitivityPct }));
  }, [live.data, activeComp?.name, omitPct, sensitivityPct]);

  useEffect(() => {
    setPage(1);
    setOpen(null);
  }, [selection, omitPct, sensitivityPct]);

  const loading = selection === '' || (live.loading && !live.data);
  const err = feed.error ?? live.error;

  const sensitiveCount = rows.filter((r) => r.sensitivity === 'sensitive').length;
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safe = Math.min(page, pages);
  const start = (safe - 1) * PAGE_SIZE;
  const visible = rows.slice(start, start + PAGE_SIZE);

  const leagueOptions = pickLeagues.map((l) => ({ value: String(l.id), label: `${l.name} · ${l.country}` }));
  const pctOptions = [10, 15, 20, 25, 30, 40].map((v) => ({ value: String(v), label: `${v}%` }));
  const sensOptions = [5, 10, 15, 20].map((v) => ({ value: String(v), label: `${v}%` }));

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Omit Test</Text>
        <Text style={styles.subtitle}>
          Does a small share of a team&apos;s matches distort its goals-scored average? For each team
          we remove the highest- and lowest-scoring {omitPct}% of games and recompute. A change of{' '}
          {sensitivityPct}% or more flags the team as sensitive. Original records are never altered.
        </Text>
      </View>

      <View style={styles.toolbar}>
        <FilterDropdown label="League" value={selection} options={leagueOptions} onChange={setSelection} style={narrow ? styles.full : styles.flex} />
        <FilterDropdown label="Omit %" value={String(omitPct)} options={pctOptions} onChange={(v) => setOmitPct(Number(v))} style={narrow ? styles.full : styles.flex} />
        <FilterDropdown label="Sensitivity ≥" value={String(sensitivityPct)} options={sensOptions} onChange={(v) => setSensitivityPct(Number(v))} style={narrow ? styles.full : styles.flex} />
      </View>

      <View style={styles.statusRow}>
        {loading ? (
          <>
            <ActivityIndicator size="small" color={theme.accentGreen} />
            <Text style={styles.statusMuted}>Running the omit test…</Text>
          </>
        ) : err ? (
          <Text style={styles.statusMuted}>Live data unavailable: {err}</Text>
        ) : (
          <Text style={styles.statusLive}>
            ● {activeComp?.name ?? ''} · {rows.length} teams · {sensitiveCount} sensitive
          </Text>
        )}
      </View>

      {!loading && !err ? (
        rows.length === 0 ? (
          <Text style={styles.empty}>No teams with completed matches to test in this league yet.</Text>
        ) : (
          <>
            <PageControls page={safe} pages={pages} total={rows.length} from={start + 1} to={start + visible.length} onChange={setPage} />
            <DragScroll horizontal style={styles.scroll} contentContainerStyle={styles.scrollContent}>
              <View style={styles.table}>
                <View style={[styles.row, styles.headRow]}>
                  <Text style={[styles.cRank, styles.headText, styles.right]}>#</Text>
                  <Text style={[styles.cTeam, styles.headText]}>Team</Text>
                  <Text style={[styles.cNum, styles.headText, styles.right]}>Played</Text>
                  <Text style={[styles.cNum, styles.headText, styles.right]}>Orig avg</Text>
                  <Text style={[styles.cNum, styles.headText, styles.right]}>Omit</Text>
                  <Text style={[styles.cScen, styles.headText]}>Omit highest</Text>
                  <Text style={[styles.cScen, styles.headText]}>Omit lowest</Text>
                  <Text style={[styles.cClass, styles.headText]}>Verdict</Text>
                </View>
                {visible.map((r, i) => {
                  const id = `${r.competition}-${r.team}`;
                  const on = open === id;
                  const high = r.scenarios.find((s) => s.kind === 'highest');
                  const low = r.scenarios.find((s) => s.kind === 'lowest');
                  return (
                    <View key={id}>
                      <Pressable
                        onPress={() => setOpen(on ? null : id)}
                        style={[styles.row, i % 2 === 1 && styles.rowAlt, on && styles.rowOn]}>
                        <Text style={[styles.cRank, styles.muted]}>{start + i + 1}</Text>
                        <Text style={[styles.cTeam, styles.team]} numberOfLines={1}>{r.team}</Text>
                        <Text style={[styles.cNum, styles.num]}>{r.matchesPlayed}</Text>
                        <Text style={[styles.cNum, styles.numStrong]}>{avg(r.originalAverage)}</Text>
                        <Text style={[styles.cNum, styles.muted]}>{r.omittedCount || '—'}</Text>
                        <ScenarioCell s={high} />
                        <ScenarioCell s={low} />
                        <View style={styles.cClass}>
                          <View style={[styles.verdict, r.sensitivity === 'sensitive' ? styles.verdictSens : styles.verdictStable]}>
                            <Text style={[styles.verdictText, r.sensitivity === 'sensitive' ? styles.verdictTextSens : styles.verdictTextStable]}>
                              {r.sensitivity === 'sensitive' ? 'SENSITIVE' : 'STABLE'}
                            </Text>
                          </View>
                        </View>
                      </Pressable>
                      {on ? <OmitDetail row={r} /> : null}
                    </View>
                  );
                })}
              </View>
            </DragScroll>
            <Text style={styles.hint}>
              Tap a team for the omitted matches. &quot;Omit highest/lowest&quot; shows the recalculated
              average and its change after removing those games.
            </Text>
          </>
        )
      ) : null}
    </View>
  );
}

function ScenarioCell({ s }: { s: OmitScenario | undefined }) {
  if (!s) return <Text style={[styles.cScen, styles.muted]}>—</Text>;
  const color = dirColor(s.direction);
  return (
    <View style={styles.cScen}>
      <Text style={[styles.scenAvg, { color }]}>
        {avg(s.newAverage)} {dirArrow(s.direction)}
      </Text>
      <Text style={styles.scenDelta}>{signed(s.difference)} · {signedPct(s.percentChange)}</Text>
    </View>
  );
}

function OmitDetail({ row }: { row: OmitTeamResult }) {
  return (
    <View style={styles.detail}>
      <View style={styles.detailGrid}>
        <Metric label="Matches" value={String(row.matchesPlayed)} />
        <Metric label="Total goals" value={String(row.totalGoals)} />
        <Metric label="Original avg" value={avg(row.originalAverage)} />
        <Metric label="Omitted" value={`${row.omittedCount} (${Math.round(row.omitPct)}%)`} />
      </View>
      {row.scenarios.map((s) => (
        <View key={s.kind} style={styles.scenBlock}>
          <Text style={styles.scenTitle}>
            Omit {s.kind} · {s.omittedCount} game{s.omittedCount === 1 ? '' : 's'} →{' '}
            <Text style={{ color: dirColor(s.direction) }}>{avg(s.newAverage)} {dirArrow(s.direction)} ({signedPct(s.percentChange)})</Text>
          </Text>
          <View style={styles.omittedWrap}>
            {s.omitted.map((m) => (
              <View key={`${s.kind}-${m.unix}`} style={styles.omChip}>
                <Text style={styles.omChipText} numberOfLines={1}>{m.label} · {m.goals} scored</Text>
              </View>
            ))}
          </View>
          <Text style={styles.scenNote}>
            {s.remainingGoals} goals over {s.remainingMatches} remaining games.
            {' '}
            {s.direction === 'up'
              ? `Removing the ${s.kind} games raises the average — they were dragging it ${s.kind === 'lowest' ? 'down' : 'up'}.`
              : s.direction === 'down'
                ? `Removing the ${s.kind} games lowers the average — they were propping it ${s.kind === 'highest' ? 'up' : 'down'}.`
                : 'No material change — the average is stable.'}
          </Text>
        </View>
      ))}
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
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
  statusLive: { fontFamily: fonts.bodyMedium, fontSize: 12, color: theme.accentGreen },
  statusMuted: { fontFamily: fonts.body, fontSize: 12, color: theme.textMuted },
  empty: { fontFamily: fonts.body, fontSize: 13, color: theme.textMuted, textAlign: 'center', paddingVertical: spacing.lg },

  scroll: { width: '100%', maxWidth: '100%' },
  scrollContent: { minWidth: '100%' },
  table: {
    width: '100%', minWidth: 820, backgroundColor: theme.surface, borderWidth: layout.borderWidth,
    borderColor: theme.border, borderRadius: layout.borderRadius, overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, paddingHorizontal: spacing.sm },
  headRow: { backgroundColor: theme.surfaceMuted, borderBottomWidth: layout.borderWidth, borderBottomColor: theme.border },
  rowAlt: { backgroundColor: theme.surfaceHover },
  rowOn: { backgroundColor: '#DBEAFE' },
  headText: { fontFamily: fonts.bodySemiBold, fontSize: 10, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 4 },
  right: { textAlign: 'right' },
  cRank: { width: 30, paddingHorizontal: 4 },
  cTeam: { flex: 1, minWidth: 140, paddingHorizontal: 4 },
  cNum: { width: 66, paddingHorizontal: 4 },
  cScen: { width: 136, paddingHorizontal: 4 },
  cClass: { width: 96, paddingHorizontal: 4 },
  muted: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted, textAlign: 'right' },
  team: { fontFamily: fonts.bodyMedium, fontSize: 13, color: theme.textPrimary },
  num: { fontFamily: fonts.body, fontSize: 12, color: theme.textPrimary, textAlign: 'right' },
  numStrong: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.textPrimary, textAlign: 'right' },
  scenAvg: { fontFamily: fonts.bodySemiBold, fontSize: 13 },
  scenDelta: { fontFamily: fonts.body, fontSize: 10, color: theme.textMuted, marginTop: 1 },

  verdict: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  verdictSens: { borderColor: theme.accentOrange, backgroundColor: 'rgba(234,88,12,0.08)' },
  verdictStable: { borderColor: theme.border, backgroundColor: theme.surfaceHover },
  verdictText: { fontFamily: fonts.bodySemiBold, fontSize: 9, letterSpacing: 0.5 },
  verdictTextSens: { color: theme.accentOrange },
  verdictTextStable: { color: theme.textMuted },

  hint: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted, textAlign: 'center', marginTop: spacing.sm },

  detail: { borderBottomWidth: layout.borderWidth, borderBottomColor: theme.border, backgroundColor: theme.surfaceHover, padding: spacing.md, gap: spacing.sm },
  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  metric: { flexGrow: 1, flexBasis: 90, minWidth: 80, alignItems: 'center', backgroundColor: theme.surface, borderRadius: layout.borderRadius, paddingVertical: spacing.sm, borderWidth: layout.borderWidth, borderColor: theme.border },
  metricLabel: { fontFamily: fonts.bodyMedium, fontSize: 9, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  metricValue: { fontFamily: fonts.display, fontSize: 17, color: theme.textPrimary, marginTop: 2 },
  scenBlock: { gap: 4, paddingTop: spacing.xs },
  scenTitle: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: theme.textPrimary },
  omittedWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  omChip: { borderWidth: 1, borderColor: theme.border, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2, backgroundColor: theme.surface, maxWidth: 240 },
  omChipText: { fontFamily: fonts.body, fontSize: 11, color: theme.textPrimary },
  scenNote: { fontFamily: fonts.body, fontSize: 11, lineHeight: 16, color: theme.textMuted },
});
