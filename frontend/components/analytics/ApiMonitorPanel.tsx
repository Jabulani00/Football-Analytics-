import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';

import { useLiveCompetitionFeed } from '@/hooks/useLiveCompetitions';
import { fetchAllCompetitions, rateLimiterStats, type Competition } from '@/services/oddAlerts';
import { trafficHistory, type TrafficRecord } from '@/services/apiTrafficLog';
import { fonts, layout, spacing, theme } from '@/styles/theme';

/** Catalogue counts derived from the full competitions feed. */
type Catalogue = {
  total: number;
  leagues: number;
  cups: number;
  countries: number;
  inProgress: number;
  complete: number;
};

function catalogueStats(comps: Competition[]): Catalogue {
  let cups = 0;
  let inProgress = 0;
  let complete = 0;
  const countries = new Set<string>();
  for (const c of comps) {
    if (c.country) countries.add(c.country);
    if (c.isCup) cups += 1;
    const cur = c.seasons.find((s) => s.isCurrent);
    const p = cur?.progress ?? null;
    if (p != null && p >= 100) complete += 1;
    else if (p != null && p > 0 && p < 100) inProgress += 1;
  }
  return {
    total: comps.length,
    leagues: comps.length - cups,
    cups,
    countries: countries.size,
    inProgress,
    complete,
  };
}

/** Live performance read from this session's own request log. */
type Perf = {
  requests: number;
  sample: number;
  avg: number | null;
  p95: number | null;
  successPct: number | null;
  cachePct: number | null;
  errors: number;
};

function perfStats(rows: readonly TrafficRecord[]): Perf {
  const client = rows.filter((r) => r.side === 'client');
  const recent = client.slice(-100);
  const durs = recent
    .map((r) => r.durationMs)
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  const avg = durs.length ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : null;
  const p95 = durs.length ? durs[Math.min(durs.length - 1, Math.floor(durs.length * 0.95))] : null;
  const ok = recent.filter((r) => r.status >= 200 && r.status < 400).length;
  const errors = recent.filter((r) => r.status === 0 || r.status >= 400).length;
  const hits = recent.filter((r) => /hit/i.test(r.cache)).length;
  return {
    requests: client.length,
    sample: recent.length,
    avg,
    p95,
    successPct: recent.length ? Math.round((100 * ok) / recent.length) : null,
    cachePct: recent.length ? Math.round((100 * hits) / recent.length) : null,
    errors,
  };
}

function ratingFor(perf: Perf): { label: string; color: string } {
  if (perf.sample === 0) return { label: 'Idle', color: theme.textMuted };
  if (perf.successPct != null && perf.successPct < 80) return { label: 'Degraded', color: theme.loss };
  const m = perf.avg ?? 0;
  if (m > 0 && m < 400) return { label: 'Fast', color: theme.accentGreen };
  if (m < 1200) return { label: 'OK', color: theme.yellow };
  return { label: 'Slow', color: theme.loss };
}

export default function ApiMonitorPanel() {
  const comp = useQuery({
    queryKey: ['api-monitor', 'competitions'],
    queryFn: ({ signal }) => fetchAllCompetitions(signal),
    staleTime: 10 * 60_000,
  });
  const feed = useLiveCompetitionFeed(3);

  // Poll the in-process traffic log so latency / success refresh live.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 2500);
    return () => clearInterval(id);
  }, []);
  const perf = perfStats(trafficHistory());
  const gate = rateLimiterStats();
  const cat = useMemo(() => (comp.data ? catalogueStats(comp.data) : null), [comp.data]);

  // Query-health read from the client-side rate gate.
  const budgetPct = Math.min(100, Math.round((100 * gate.usedInWindow) / gate.maxPerMin));
  const health = gate.cooldownMs > 0
    ? { label: 'Cooling down', color: theme.loss }
    : gate.queued > 0 || budgetPct >= 85
      ? { label: 'Busy', color: theme.yellow }
      : { label: 'Healthy', color: theme.accentGreen };

  const activeNow = feed.competitions.length; // competitions with upcoming fixtures
  const rating = ratingFor(perf);
  const online = perf.sample === 0 ? comp.isSuccess : (perf.successPct ?? 0) >= 50;
  const num = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString());

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <View style={styles.headLeft}>
          <View style={[styles.dot, { backgroundColor: online ? theme.accentGreen : theme.loss }]} />
          <Text style={styles.title}>API Monitor</Text>
        </View>
        <Text style={styles.sub}>
          {comp.isPending ? 'Loading catalogue…' : comp.isError ? 'Catalogue unavailable' : `OddAlerts · ${rating.label}`}
        </Text>
      </View>

      <View style={styles.tiles}>
        <Tile label="Competitions" value={num(cat?.total)} tone={theme.textPrimary} />
        <Tile label="Leagues" value={num(cat?.leagues)} tone={theme.accentGreen} />
        <Tile label="Cups" value={num(cat?.cups)} tone={theme.accentBlue} />
        <Tile label="Countries" value={num(cat?.countries)} tone={theme.accentPurple} />
      </View>
      <View style={styles.tiles}>
        <Tile label="Active now" value={feed.loading ? '…' : activeNow.toLocaleString()} sub="have upcoming fixtures" tone={theme.accentGreen} />
        <Tile label="In progress" value={num(cat?.inProgress)} sub="season under way" tone={theme.accentOrange} />
        <Tile label="Completed" value={num(cat?.complete)} sub="season finished" tone={theme.textMuted} />
      </View>

      <View style={styles.perf}>
        <View style={styles.perfMain}>
          <Text style={[styles.perfBig, { color: rating.color }]}>{perf.avg == null ? '—' : `${perf.avg}ms`}</Text>
          <Text style={styles.perfLabel}>
            avg latency · <Text style={{ color: rating.color, fontFamily: fonts.bodySemiBold }}>{rating.label}</Text>
          </Text>
        </View>
        <View style={styles.perfStats}>
          <Stat label="p95" value={perf.p95 == null ? '—' : `${perf.p95}ms`} />
          <Stat
            label="Success"
            value={perf.successPct == null ? '—' : `${perf.successPct}%`}
            tone={perf.successPct != null && perf.successPct < 90 ? theme.loss : theme.accentGreen}
          />
          <Stat label="Cache hit" value={perf.cachePct == null ? '—' : `${perf.cachePct}%`} />
          <Stat label="Requests" value={perf.requests.toLocaleString()} />
          {perf.errors > 0 ? <Stat label="Errors" value={String(perf.errors)} tone={theme.loss} /> : null}
        </View>
      </View>

      {/* Query health — the client-side rate gate that keeps us under 300/min. */}
      <View style={styles.gateRow}>
        <View style={styles.gateLeft}>
          <View style={[styles.dot, { backgroundColor: health.color }]} />
          <Text style={[styles.gateLabel, { color: health.color }]}>{health.label}</Text>
        </View>
        <View style={styles.gateBarTrack}>
          <View style={[styles.gateBarFill, { width: `${budgetPct}%`, backgroundColor: health.color }]} />
        </View>
        <Text style={styles.gateText}>
          {gate.usedInWindow}/{gate.maxPerMin} per min · {gate.inFlight} in flight · {gate.queued} queued
          {gate.cooldownMs > 0 ? ` · cooldown ${Math.ceil(gate.cooldownMs / 1000)}s` : ''}
        </Text>
      </View>

      <Text style={styles.foot}>
        Catalogue from the OddAlerts competitions feed · performance measured from this session&apos;s live requests
        {perf.sample ? ` (last ${perf.sample})` : ''}. Requests are paced under 300/min with retries and a 429 cooldown.
      </Text>
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

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, tone ? { color: tone } : null]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    backgroundColor: theme.surface,
    padding: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  headLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 9, height: 9, borderRadius: 5 },
  title: { fontFamily: fonts.display, fontSize: 18, color: theme.textPrimary },
  sub: { fontFamily: fonts.bodyMedium, fontSize: 11, color: theme.textMuted },

  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: {
    flexGrow: 1,
    flexBasis: 90,
    minWidth: 80,
    alignItems: 'center',
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    backgroundColor: theme.surfaceHover,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  tileValue: { fontFamily: fonts.display, fontSize: 22 },
  tileLabel: { fontFamily: fonts.bodySemiBold, fontSize: 10, color: theme.textPrimary, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },
  tileSub: { fontFamily: fonts.body, fontSize: 9, color: theme.textMuted, marginTop: 1, textAlign: 'center' },

  perf: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.md,
    borderTopWidth: layout.borderWidth,
    borderTopColor: theme.border,
    paddingTop: spacing.sm,
  },
  perfMain: { minWidth: 120 },
  perfBig: { fontFamily: fonts.display, fontSize: 30, lineHeight: 34 },
  perfLabel: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted },
  perfStats: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, justifyContent: 'flex-end' },
  stat: { alignItems: 'center', minWidth: 54 },
  statValue: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: theme.textPrimary },
  statLabel: { fontFamily: fonts.body, fontSize: 9, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 1 },

  gateRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap', borderTopWidth: layout.borderWidth, borderTopColor: theme.border, paddingTop: spacing.sm },
  gateLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 100 },
  gateLabel: { fontFamily: fonts.bodySemiBold, fontSize: 12 },
  gateBarTrack: { flexGrow: 1, flexBasis: 120, height: 6, borderRadius: 999, backgroundColor: theme.surfaceMuted, overflow: 'hidden' },
  gateBarFill: { height: '100%', borderRadius: 999 },
  gateText: { fontFamily: fonts.body, fontSize: 10, color: theme.textMuted },

  foot: { fontFamily: fonts.body, fontSize: 10, lineHeight: 14, color: theme.textMuted },
});
