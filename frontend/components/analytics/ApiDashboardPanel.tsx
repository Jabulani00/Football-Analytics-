import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';

import { fetchAllCompetitions, rateLimiterStats } from '@/services/oddAlerts';
import { trafficHistory, queryByEndpoint, type TrafficRecord } from '@/services/apiTrafficLog';
import { perfByName } from '@/services/perfLog';
import { captureHealthSample, healthSamples } from '@/services/apiHealthSamples';
import { fonts, layout, spacing, theme } from '@/styles/theme';

const WINDOW = 60; // samples shown in the time-series charts

function latencyTone(ms: number): string {
  return ms < 400 ? theme.accentGreen : ms < 1200 ? theme.yellow : theme.loss;
}
function loadTone(pctOfCap: number): string {
  return pctOfCap < 70 ? theme.accentGreen : pctOfCap < 90 ? theme.yellow : theme.loss;
}

/** A time-series column chart from a list of values. */
function Columns({ values, max, colorFor }: { values: number[]; max: number; colorFor: (v: number) => string }) {
  const safeMax = max > 0 ? max : 1;
  const shown = values.slice(-WINDOW);
  return (
    <View style={styles.chart}>
      {shown.length === 0 ? (
        <Text style={styles.chartEmpty}>collecting…</Text>
      ) : (
        shown.map((v, i) => {
          const h = Math.min(100, Math.max(2, Math.round((100 * v) / safeMax)));
          return <View key={i} style={[styles.col, { height: `${h}%`, backgroundColor: colorFor(v) }]} />;
        })
      )}
    </View>
  );
}

/** Horizontal bars for a ranked timing breakdown. */
function HBars({ rows, empty }: { rows: { name: string; value: number; p95?: number; count?: number }[]; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0) return <Text style={styles.chartEmpty}>{empty}</Text>;
  return (
    <View style={styles.hbars}>
      {rows.map((r) => {
        const pct = Math.max(4, Math.round((100 * r.value) / max));
        return (
          <View key={r.name} style={styles.hbarRow}>
            <Text style={styles.hbarName} numberOfLines={1}>{r.name}</Text>
            <View style={styles.hbarTrack}>
              <View style={[styles.hbarFill, { width: `${pct}%`, backgroundColor: latencyTone(r.value) }]} />
            </View>
            <Text style={styles.hbarVal}>
              {r.value}ms
              {r.p95 != null || r.count != null ? (
                <Text style={styles.hbarSub}> {r.p95 != null ? `· p95 ${r.p95}` : ''}{r.count != null ? ` · ${r.count}×` : ''}</Text>
              ) : null}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: string }) {
  return (
    <View style={styles.tile}>
      <Text style={[styles.tileValue, { color: tone }]} numberOfLines={1}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
      {sub ? <Text style={styles.tileSub}>{sub}</Text> : null}
    </View>
  );
}

export default function ApiDashboardPanel() {
  const comp = useQuery({
    queryKey: ['api-monitor', 'competitions'],
    queryFn: ({ signal }) => fetchAllCompetitions(signal),
    staleTime: 10 * 60_000,
  });

  // Sample health every 2s so the time-series charts fill in live.
  const [, setTick] = useState(0);
  useEffect(() => {
    captureHealthSample();
    const id = setInterval(() => { captureHealthSample(); setTick((t) => t + 1); }, 2000);
    return () => clearInterval(id);
  }, []);

  const gate = rateLimiterStats();
  const samples = healthSamples();
  const calc = perfByName();
  const endpoints = queryByEndpoint(trafficHistory());

  const used = samples.map((s) => s.usedPerMin);
  const latency = samples.map((s) => s.latencyMs ?? 0);
  const maxPerMin = gate.maxPerMin;
  const maxLatency = Math.max(100, ...latency);
  const budgetPct = Math.min(100, Math.round((100 * gate.usedInWindow) / maxPerMin));

  const lastLatency = useMemo(() => {
    const l = [...samples].reverse().find((s) => s.latencyMs != null);
    return l?.latencyMs ?? null;
  }, [samples]);
  const lastSuccess = useMemo(() => {
    const l = [...samples].reverse().find((s) => s.successPct != null);
    return l?.successPct ?? null;
  }, [samples]);

  const health = gate.cooldownMs > 0
    ? { label: 'Cooling down', color: theme.loss }
    : gate.queued > 0 || budgetPct >= 85
      ? { label: 'Busy', color: theme.yellow }
      : { label: 'Healthy', color: theme.accentGreen };

  const total = comp.data?.length ?? null;
  const cups = comp.data?.filter((c) => c.isCup).length ?? null;
  const countries = comp.data ? new Set(comp.data.map((c) => c.country)).size : null;
  const n = (v: number | null) => (v == null ? '—' : v.toLocaleString());

  return (
    <View style={styles.container}>
      <View style={styles.head}>
        <View style={styles.headLeft}>
          <View style={[styles.dot, { backgroundColor: health.color }]} />
          <Text style={styles.title}>API Health Dashboard</Text>
        </View>
        <Text style={[styles.healthLabel, { color: health.color }]}>{health.label}</Text>
      </View>
      <Text style={styles.subtitle}>
        Live view of how the app queries OddAlerts (300 req/min cap) and how long each feature takes to compute and arrive.
      </Text>

      {/* Live tiles */}
      <View style={styles.tiles}>
        <Tile label="Requests / min" value={`${gate.usedInWindow}`} sub={`of ${maxPerMin} cap`} tone={loadTone(budgetPct)} />
        <Tile label="Avg latency" value={lastLatency == null ? '—' : `${lastLatency}ms`} sub="recent" tone={lastLatency == null ? theme.textMuted : latencyTone(lastLatency)} />
        <Tile label="Success" value={lastSuccess == null ? '—' : `${lastSuccess}%`} tone={lastSuccess != null && lastSuccess < 90 ? theme.loss : theme.accentGreen} />
        <Tile label="In flight" value={String(gate.inFlight)} tone={theme.accentBlue} />
        <Tile label="Queued" value={String(gate.queued)} tone={gate.queued > 0 ? theme.yellow : theme.textMuted} />
      </View>

      {/* Health vs querying — two synced time series */}
      <Text style={styles.section}>Health vs querying · live</Text>
      <View style={styles.chartCard}>
        <View style={styles.chartHead}>
          <Text style={styles.chartTitle}>Requests / min</Text>
          <Text style={styles.chartScale}>0–{maxPerMin}</Text>
        </View>
        <Columns values={used} max={maxPerMin} colorFor={(v) => loadTone((100 * v) / maxPerMin)} />
      </View>
      <View style={styles.chartCard}>
        <View style={styles.chartHead}>
          <Text style={styles.chartTitle}>Latency (ms)</Text>
          <Text style={styles.chartScale}>0–{maxLatency}</Text>
        </View>
        <Columns values={latency} max={maxLatency} colorFor={latencyTone} />
      </View>
      <Text style={styles.hint}>
        Taller request bars = heavier querying; taller latency bars = slower responses. Green/amber/red track the 300/min budget and response speed. Last {Math.min(WINDOW, samples.length)} samples (~2s each).
      </Text>

      {/* Timings */}
      <Text style={styles.section}>Calculation time · per feature</Text>
      <View style={styles.chartCard}>
        <HBars rows={calc.map((c) => ({ name: c.name, value: c.avg, p95: c.p95, count: c.count }))} empty="Open Stats, Strategy Builder or Power Dynamics to measure." />
      </View>

      <Text style={styles.section}>Query time · by endpoint</Text>
      <View style={styles.chartCard}>
        <HBars rows={endpoints.map((e) => ({ name: e.name, value: e.avg, p95: e.p95, count: e.count }))} empty="No requests yet this session." />
      </View>

      {/* Catalogue footer */}
      <Text style={styles.foot}>
        Catalogue: {n(total)} competitions · {n(cups)} cups · {n(countries)} countries. Requests are paced under 300/min with retries and a 429 cooldown; calculation time is measured in-app per feature.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', alignSelf: 'stretch' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  headLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
  title: { fontFamily: fonts.display, fontSize: 22, color: theme.textPrimary },
  healthLabel: { fontFamily: fonts.bodySemiBold, fontSize: 13 },
  subtitle: { fontFamily: fonts.body, fontSize: 13, lineHeight: 20, color: theme.textMuted, marginTop: spacing.xs, marginBottom: spacing.md },

  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  tile: {
    flexGrow: 1, flexBasis: 100, minWidth: 90, alignItems: 'center',
    borderWidth: layout.borderWidth, borderColor: theme.border, borderRadius: layout.borderRadius,
    backgroundColor: theme.surface, paddingVertical: spacing.md, paddingHorizontal: spacing.xs,
  },
  tileValue: { fontFamily: fonts.display, fontSize: 24 },
  tileLabel: { fontFamily: fonts.bodySemiBold, fontSize: 10, color: theme.textPrimary, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },
  tileSub: { fontFamily: fonts.body, fontSize: 9, color: theme.textMuted, marginTop: 1 },

  section: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: theme.textPrimary, marginTop: spacing.md, marginBottom: spacing.xs },
  chartCard: {
    borderWidth: layout.borderWidth, borderColor: theme.border, borderRadius: layout.borderRadius,
    backgroundColor: theme.surface, padding: spacing.sm, marginBottom: spacing.sm,
  },
  chartHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  chartTitle: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: theme.textPrimary },
  chartScale: { fontFamily: fonts.body, fontSize: 10, color: theme.textMuted },
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 76, gap: 1, backgroundColor: theme.surfaceHover, borderRadius: 6, paddingHorizontal: 3, paddingVertical: 3 },
  col: { flex: 1, minWidth: 2, borderRadius: 1 },
  chartEmpty: { fontFamily: fonts.body, fontSize: 11, color: theme.textFaint, fontStyle: 'italic', alignSelf: 'center' },

  hbars: { gap: 6 },
  hbarRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  hbarName: { width: 128, fontFamily: fonts.bodyMedium, fontSize: 12, color: theme.textPrimary },
  hbarTrack: { flex: 1, height: 12, borderRadius: 999, backgroundColor: theme.surfaceMuted, overflow: 'hidden' },
  hbarFill: { height: '100%', borderRadius: 999 },
  hbarVal: { width: 118, textAlign: 'right', fontFamily: fonts.bodySemiBold, fontSize: 11, color: theme.textPrimary },
  hbarSub: { fontFamily: fonts.body, fontSize: 10, color: theme.textMuted },

  hint: { fontFamily: fonts.body, fontSize: 10, lineHeight: 14, color: theme.textMuted, marginBottom: spacing.sm },
  foot: { fontFamily: fonts.body, fontSize: 10, lineHeight: 14, color: theme.textMuted, marginTop: spacing.sm },
});
