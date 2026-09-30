/**
 * Before/after traffic check for the OddAlerts cache.
 * Uses a fake upstream so it does not call OddAlerts.
 *
 *   npx tsx scripts/apiTrafficBaseline.ts
 */

import { resetTrafficLog, trafficHistory } from '../services/apiTrafficLog';
import {
  cacheCounters,
  clearMemoryCacheForTests,
  fetchThroughCache,
  flushCacheRefreshes,
  resetOddAlertsCacheForTests,
  setCacheNowForTests,
  setRedisForTests,
  type RedisLike,
  type UpstreamBody,
} from '../server/oddAlertsCache';

const BODY = JSON.stringify({
  info: { count: 1000 },
  data: [
    {
      id: 1,
      pressure: { home: [1, 2, 3], away: [4, 5, 6] },
      odds: { ft_result: { home: 1.91, draw: 3.4, away: 4.2 } },
      stats: { shots_on: 4, corners: 7 },
      events: [{ minute: 12, type: 'goal' }],
      nested: { summary: { leaks: [{ market: 'btts' }] } },
    },
  ],
});

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function printDurations(label: string, durations: number[]): void {
  console.log(
    `${label} n=${durations.length} p50=${percentile(durations, 50)}ms p95=${percentile(durations, 95)}ms p99=${percentile(durations, 99)}ms bytes=${BODY.length}`,
  );
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function payload(body = BODY): UpstreamBody {
  return { status: 200, contentType: 'application/json; charset=utf-8', body };
}

function memoryRedis(): RedisLike {
  const store = new Map<string, { value: string; expires: number }>();
  return {
    async get(key) {
      const row = store.get(key);
      if (!row || row.expires <= Date.now()) return null;
      return row.value;
    },
    async set(key, value, ttlMs) {
      store.set(key, { value, expires: Date.now() + ttlMs });
    },
    async setNx(key, value, ttlMs) {
      if (await this.get(key)) return false;
      await this.set(key, value, ttlMs);
      return true;
    },
    async del(key) {
      store.delete(key);
    },
  };
}

async function timeCalls(
  count: number,
  run: () => Promise<{ durationMs: number; body: string; cache: string }>,
): Promise<{ durationMs: number; body: string; cache: string }[]> {
  return Promise.all(Array.from({ length: count }, () => run()));
}

async function main(): Promise<void> {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.ODDALERTS_CACHE_TTLS;
  process.env.CACHE_ENABLED = 'false';
  process.env.ODDALERTS_UPSTREAM_CONCURRENCY = '12';

  resetOddAlertsCacheForTests();
  resetTrafficLog();

  let bypassCalls = 0;
  const cold = await fetchThroughCache({
    path: 'fixtures/live',
    params: new URLSearchParams(),
    bypass: true,
    fetcher: async () => {
      bypassCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 30));
      return payload();
    },
  });
  const burst = await timeCalls(20, () =>
    fetchThroughCache({
      path: 'fixtures/live',
      params: new URLSearchParams(),
      bypass: true,
      fetcher: async () => {
        bypassCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 30));
        return payload();
      },
    }),
  );
  printDurations('bypass cold+burst', [cold.durationMs, ...burst.map((row) => row.durationMs)]);
  console.log(`bypass upstream=${bypassCalls} client=${1 + burst.length}`);
  assert(bypassCalls === 21, `bypass should call upstream 21 times, got ${bypassCalls}`);
  assert(cold.body === BODY, 'bypass dropped or changed the body');
  assert(trafficHistory().some((row) => row.duplicate), 'expected a duplicate client/proxy log line');

  process.env.CACHE_ENABLED = 'true';
  resetOddAlertsCacheForTests();
  resetTrafficLog();

  let cachedCalls = 0;
  const fetcher = async () => {
    cachedCalls += 1;
    await new Promise((resolve) => setTimeout(resolve, 40));
    return payload();
  };
  const first = await fetchThroughCache({
    path: 'fixtures/live',
    params: new URLSearchParams(),
    fetcher,
  });
  const hits = await timeCalls(20, () =>
    fetchThroughCache({
      path: 'fixtures/live',
      params: new URLSearchParams(),
      fetcher,
    }),
  );
  printDurations('cache hit burst', hits.map((row) => row.durationMs));
  console.log(
    `cache upstream=${cachedCalls} client=${1 + hits.length} counters=${JSON.stringify(cacheCounters())}`,
  );
  assert(first.cache === 'MISS', `first cached call should be MISS, got ${first.cache}`);
  assert(hits.every((row) => row.cache === 'HIT'), 'repeated calls should be cache hits');
  assert(cachedCalls === 1, `cache should call upstream once, got ${cachedCalls}`);
  assert(hits.every((row) => row.body === BODY), 'cache hit changed the body');
  assert(percentile(hits.map((row) => row.durationMs), 95) < first.durationMs, 'cache hit p95 should be below the cold call');

  resetOddAlertsCacheForTests();
  let coalescedCalls = 0;
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const pending = timeCalls(20, () =>
    fetchThroughCache({
      path: 'fixtures/upcoming',
      params: new URLSearchParams({ days: '3' }),
      fetcher: async () => {
        coalescedCalls += 1;
        await gate;
        return payload();
      },
    }),
  );
  await new Promise((resolve) => setTimeout(resolve, 20));
  release();
  const joined = await pending;
  const miss = joined.filter((row) => row.cache === 'MISS').length;
  const coalesce = joined.filter((row) => row.cache === 'COALESCE').length;
  console.log(`coalesce upstream=${coalescedCalls} miss=${miss} coalesce=${coalesce}`);
  assert(coalescedCalls === 1, `20 concurrent calls made ${coalescedCalls} upstream requests`);
  assert(miss === 1 && coalesce === 19, `expected 1 MISS and 19 COALESCE, got ${miss} and ${coalesce}`);
  assert(joined.every((row) => row.body === BODY), 'coalesced response changed the body');

  resetOddAlertsCacheForTests();
  let clock = 0;
  setCacheNowForTests(() => clock);
  let refreshCalls = 0;
  const refreshing = async () => {
    refreshCalls += 1;
    return payload(JSON.stringify({ n: refreshCalls, data: JSON.parse(BODY).data }));
  };
  const missRow = await fetchThroughCache({
    path: 'fixtures/live',
    params: new URLSearchParams(),
    fetcher: refreshing,
  });
  clock = 5_000;
  const fresh = await fetchThroughCache({
    path: 'fixtures/live',
    params: new URLSearchParams(),
    fetcher: refreshing,
  });
  clock = 12_000;
  const stale = await fetchThroughCache({
    path: 'fixtures/live',
    params: new URLSearchParams(),
    fetcher: refreshing,
  });
  await flushCacheRefreshes();
  const after = await fetchThroughCache({
    path: 'fixtures/live',
    params: new URLSearchParams(),
    fetcher: refreshing,
  });
  console.log(`swr ${missRow.cache} ${fresh.cache} ${stale.cache} ${after.cache} upstream=${refreshCalls}`);
  assert(missRow.cache === 'MISS' && fresh.cache === 'HIT' && stale.cache === 'STALE', 'TTL windows did not classify');
  assert(stale.body === missRow.body, 'stale response should still be the previous complete body');
  assert(refreshCalls === 2, `background refresh should run once, upstream=${refreshCalls}`);
  assert(after.cache === 'HIT' && after.body.includes('"n":2'), 'background refresh did not replace the cached body');

  resetOddAlertsCacheForTests();
  setRedisForTests(memoryRedis());
  let redisCalls = 0;
  await fetchThroughCache({
    path: 'fixtures/between',
    params: new URLSearchParams({ from: '1', to: '2' }),
    fetcher: async () => {
      redisCalls += 1;
      return payload();
    },
  });
  clearMemoryCacheForTests();
  const fromRedis = await fetchThroughCache({
    path: 'fixtures/between',
    params: new URLSearchParams({ from: '1', to: '2' }),
    fetcher: async () => {
      redisCalls += 1;
      return payload();
    },
  });
  console.log(`redis upstream=${redisCalls} cache=${fromRedis.cache}`);
  assert(redisCalls === 1, `redis hit still called upstream (${redisCalls})`);
  assert(fromRedis.cache === 'HIT' && fromRedis.body === BODY, 'redis hit did not return the complete body');

  resetOddAlertsCacheForTests();
  let current = 0;
  let peak = 0;
  await Promise.all(
    Array.from({ length: 20 }, (_, index) =>
      fetchThroughCache({
        path: 'fixtures/between',
        params: new URLSearchParams({ page: String(index) }),
        fetcher: async () => {
          current += 1;
          peak = Math.max(peak, current);
          await new Promise((resolve) => setTimeout(resolve, 30));
          current -= 1;
          return payload();
        },
      }),
    ),
  );
  console.log(`concurrency peak=${peak}`);
  assert(peak <= 12 && peak > 1, `expected a cap of 12 with real parallelism, peak=${peak}`);

  console.log('baseline ok');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
