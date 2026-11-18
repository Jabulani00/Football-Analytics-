/**
 * In-process request log for OddAlerts traffic.
 * Used by the Expo client and the server proxy. Never records the API token.
 */

export type TrafficSide = 'client' | 'proxy';

export type TrafficRecord = {
  side: TrafficSide;
  path: string;
  params: Record<string, string>;
  timestamp: number;
  durationMs: number;
  status: number;
  bytes: number;
  duplicate: boolean;
  cache: string;
};

const trafficGlobal = globalThis as typeof globalThis & {
  __scorelineOddAlertsTraffic?: { seen: Set<string>; history: TrafficRecord[] };
};
const trafficState = (trafficGlobal.__scorelineOddAlertsTraffic ??= {
  seen: new Set<string>(),
  history: [],
});
const seen = trafficState.seen;
const history = trafficState.history;

export function publicParams(
  params: Record<string, string | number | undefined | null> | URLSearchParams,
): Record<string, string> {
  const entries: [string, string][] = [];
  if (params instanceof URLSearchParams) {
    params.forEach((value, key) => {
      if (key === 'api_token' || key === 'path' || key === 'cache') return;
      entries.push([key, value]);
    });
  } else {
    for (const [key, value] of Object.entries(params)) {
      if (key === 'api_token' || key === 'path' || key === 'cache') continue;
      if (value == null || value === '') continue;
      entries.push([key, String(value)]);
    }
  }
  entries.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
  return Object.fromEntries(entries);
}

export function trackRequest(input: {
  side: TrafficSide;
  path: string;
  params: Record<string, string>;
}): {   finish: (partial: { status: number; bytes: number; cache: string; durationMs?: number }) => TrafficRecord } {
  const key = `${input.side}:${input.path}?${JSON.stringify(input.params)}`;
  const duplicate = seen.has(key);
  seen.add(key);
  const timestamp = Date.now();
  return {
    finish(partial) {
      const record: TrafficRecord = {
        side: input.side,
        path: input.path,
        params: input.params,
        timestamp,
        durationMs: partial.durationMs ?? Date.now() - timestamp,
        status: partial.status,
        bytes: partial.bytes,
        duplicate,
        cache: partial.cache,
      };
      history.push(record);
      if (history.length > 500) history.shift();
      console.log(JSON.stringify({ source: 'oddalerts-traffic', ...record }));
      return record;
    },
  };
}

export function trafficHistory(): readonly TrafficRecord[] {
  return history;
}

/** Map a request path to a user-facing feature/endpoint name. */
export function endpointLabel(path: string): string {
  if (path.startsWith('competitions')) return 'Leagues catalogue';
  if (path.startsWith('countries')) return 'Countries';
  if (path === 'fixtures/live') return 'Live scores';
  if (path.startsWith('fixtures/upcoming')) return 'Upcoming fixtures';
  if (path.startsWith('fixtures/between')) return 'Season fixtures';
  if (path.startsWith('fixtures')) return 'Fixtures';
  if (path.startsWith('stats')) return 'Stats';
  if (path.startsWith('standings')) return 'Standings';
  if (path.startsWith('players')) return 'Players';
  if (path.startsWith('odds')) return 'Odds';
  if (path.startsWith('value')) return 'Value bets';
  if (path.startsWith('probability')) return 'Probability';
  if (path.startsWith('predictions')) return 'Predictions';
  return path.split('/')[0] || 'Other';
}

export type EndpointAgg = { name: string; count: number; avg: number; p95: number };

/** Aggregate recent client request durations by endpoint, slowest first. */
export function queryByEndpoint(rows: readonly TrafficRecord[], sample = 200): EndpointAgg[] {
  const client = rows.filter((r) => r.side === 'client').slice(-sample);
  const by = new Map<string, number[]>();
  for (const r of client) {
    if (!Number.isFinite(r.durationMs)) continue;
    const k = endpointLabel(r.path);
    const arr = by.get(k) ?? [];
    arr.push(r.durationMs);
    by.set(k, arr);
  }
  const out: EndpointAgg[] = [];
  for (const [name, arr] of by) {
    const sorted = [...arr].sort((a, b) => a - b);
    out.push({
      name,
      count: arr.length,
      avg: Math.round(arr.reduce((x, y) => x + y, 0) / arr.length),
      p95: Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]),
    });
  }
  return out.sort((a, b) => b.avg - a.avg);
}

export function resetTrafficLog(): void {
  seen.clear();
  history.length = 0;
}
