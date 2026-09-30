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

export function resetTrafficLog(): void {
  seen.clear();
  history.length = 0;
}
