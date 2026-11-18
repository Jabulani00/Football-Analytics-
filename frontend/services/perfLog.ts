/**
 * In-process timing log for named client-side calculations (Strategy Builder,
 * Stats grading, Characters, Power Dynamics, …) — how long each feature takes to
 * compute before it reaches the user. Pure timing, no payloads. The API Monitor
 * reads it to show per-feature calculation time.
 */

export type PerfSpan = { name: string; durationMs: number; timestamp: number };

const perfGlobal = globalThis as typeof globalThis & { __scorelinePerfLog?: { history: PerfSpan[] } };
const state = (perfGlobal.__scorelinePerfLog ??= { history: [] });
const history = state.history;

const nowMs = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();

/** Record one completed calculation. Sub-millisecond/no-op spans are dropped so they don't skew the average. */
export function recordSpan(name: string, durationMs: number): void {
  if (!Number.isFinite(durationMs) || durationMs < 0.05) return;
  history.push({ name, durationMs, timestamp: Date.now() });
  if (history.length > 600) history.shift();
}

/** Time a synchronous calculation and record it under `name`. Returns fn's result. */
export function timeSpan<T>(name: string, fn: () => T): T {
  const start = nowMs();
  try {
    return fn();
  } finally {
    recordSpan(name, nowMs() - start);
  }
}

export function perfSpans(): readonly PerfSpan[] {
  return history;
}

export type PerfAgg = { name: string; count: number; avg: number; p95: number; last: number };

/** Per-feature rollup over the most recent spans (newest first by average cost). */
export function perfByName(limitPerName = 60): PerfAgg[] {
  const byName = new Map<string, number[]>();
  for (const s of history) {
    const arr = byName.get(s.name) ?? [];
    arr.push(s.durationMs);
    byName.set(s.name, arr);
  }
  const out: PerfAgg[] = [];
  for (const [name, all] of byName) {
    const recent = all.slice(-limitPerName);
    if (!recent.length) continue;
    const sorted = [...recent].sort((a, b) => a - b);
    const avg = recent.reduce((x, y) => x + y, 0) / recent.length;
    const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
    out.push({
      name,
      count: all.length,
      avg: Math.round(avg),
      p95: Math.round(p95),
      last: Math.round(recent[recent.length - 1]),
    });
  }
  return out.sort((a, b) => b.avg - a.avg);
}
