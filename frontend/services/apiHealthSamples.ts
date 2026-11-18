/**
 * Rolling time-series of API health, for the API Health dashboard's charts.
 * Sampled periodically by the dashboard; kept in-module so history survives a
 * tab switch. Pure numbers, no payloads.
 */

import { rateLimiterStats } from './oddAlerts';
import { trafficHistory } from './apiTrafficLog';

export type HealthSample = {
  t: number;
  usedPerMin: number;
  maxPerMin: number;
  inFlight: number;
  queued: number;
  latencyMs: number | null;
  successPct: number | null;
};

const MAX_SAMPLES = 120; // ~4 min at a 2s cadence
const sampleGlobal = globalThis as typeof globalThis & { __scorelineHealthSamples?: HealthSample[] };
const ring = (sampleGlobal.__scorelineHealthSamples ??= []);

/** Capture one sample from the live gate + recent request latency, and store it. */
export function captureHealthSample(): HealthSample {
  const g = rateLimiterStats();
  const recent = trafficHistory().filter((r) => r.side === 'client').slice(-20);
  const durs = recent.map((r) => r.durationMs).filter((n) => Number.isFinite(n));
  const latencyMs = durs.length ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : null;
  const ok = recent.filter((r) => r.status >= 200 && r.status < 400).length;
  const successPct = recent.length ? Math.round((100 * ok) / recent.length) : null;
  const sample: HealthSample = {
    t: Date.now(),
    usedPerMin: g.usedInWindow,
    maxPerMin: g.maxPerMin,
    inFlight: g.inFlight,
    queued: g.queued,
    latencyMs,
    successPct,
  };
  ring.push(sample);
  if (ring.length > MAX_SAMPLES) ring.shift();
  return sample;
}

export function healthSamples(): readonly HealthSample[] {
  return ring;
}
