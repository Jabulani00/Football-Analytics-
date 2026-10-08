/**
 * Fills the existing OddAlerts server cache before a device asks.
 * Calls fetchThroughCache only. Does not change TTLs or bypass the cache.
 * Live and upcoming stay inside their fresh windows. Other paths still miss
 * through to the API when a device asks for them.
 */

import { fetchThroughCache } from './oddAlertsServerCache';

const UPSTREAM = 'https://data.oddalerts.com/api';

type Job = {
  path: string;
  params: Record<string, string>;
  everyMs: number;
};

const JOBS: Job[] = [
  { path: 'fixtures/live', params: {}, everyMs: 8_000 },
  { path: 'fixtures/upcoming', params: { days: '1', page: '1' }, everyMs: 15_000 },
  { path: 'fixtures/upcoming', params: { days: '7', page: '1' }, everyMs: 15_000 },
  { path: 'countries', params: {}, everyMs: 4 * 60_000 },
  {
    path: 'competitions',
    params: { include: 'seasons', per_page: '250', page: '1' },
    everyMs: 4 * 60_000,
  },
];

type WarmRow = {
  path: string;
  params: string;
  cache?: string;
  status?: number;
  skipped?: boolean;
  error?: string;
};

const marker = globalThis as typeof globalThis & { __scorelineOddAlertsWarmer?: boolean };

function token(): string {
  return process.env.ODDALERTS_TOKEN || process.env.EXPO_PUBLIC_ODDALERTS_TOKEN || '';
}

async function warmJob(job: Job): Promise<WarmRow> {
  const apiToken = token();
  const params = new URLSearchParams(job.params);
  const label = params.toString();
  if (!apiToken) return { path: job.path, params: label, skipped: true };

  const result = await fetchThroughCache({
    path: job.path,
    params,
    fetcher: async () => {
      const upstreamSearch = new URLSearchParams(params);
      upstreamSearch.set('api_token', apiToken);
      const upstream = await fetch(`${UPSTREAM}/${job.path}?${upstreamSearch.toString()}`, {
        headers: { Accept: 'application/json' },
      });
      const body = await upstream.text();
      return {
        status: upstream.status,
        contentType: upstream.headers.get('Content-Type') ?? 'application/json; charset=utf-8',
        body,
      };
    },
  });

  return { path: job.path, params: label, cache: result.cache, status: result.status };
}

let pass: Promise<WarmRow[]> | null = null;

/** One pass over the shared first-paint paths. Overlapping calls share the same pass. */
export function warmOnce(): Promise<WarmRow[]> {
  if (pass) return pass;
  pass = Promise.all(
    JOBS.map((job) =>
      warmJob(job).catch((err: unknown) => ({
        path: job.path,
        params: new URLSearchParams(job.params).toString(),
        error: err instanceof Error ? err.message : 'warm failed',
      })),
    ),
  ).finally(() => {
    pass = null;
  });
  return pass;
}

/** Starts the in-process loop once. Safe to call from every server entry. */
export function startOddAlertsWarmer(): void {
  if (marker.__scorelineOddAlertsWarmer) return;
  if (!token()) return;
  marker.__scorelineOddAlertsWarmer = true;
  void warmOnce();
  for (const job of JOBS) {
    const timer = setInterval(() => {
      void warmJob(job).catch(() => {});
    }, job.everyMs);
    if (typeof timer === 'object' && timer !== null && 'unref' in timer) {
      (timer as { unref: () => void }).unref();
    }
  }
}
