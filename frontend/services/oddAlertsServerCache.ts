/**
 * Complete-response cache in front of OddAlerts.
 * Stores the raw upstream body. Does not drop fields.
 * In-process singleflight always. Redis when Upstash REST env vars are set.
 */

import { publicParams, trackRequest } from './apiTrafficLog';
import {
  cacheEnabled,
  cacheKey,
  maxRedisBytes,
  ttlFor,
  upstreamConcurrency,
  type TtlWindow,
} from './oddAlertsCachePolicy';

export type UpstreamBody = {
  status: number;
  contentType: string;
  body: string;
};

export type CacheStatus = 'HIT' | 'STALE' | 'MISS' | 'COALESCE' | 'BYPASS';

export type CachedBody = UpstreamBody & { cache: CacheStatus; durationMs: number };

type Stored = UpstreamBody & { storedAt: number };

export type RedisLike = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlMs: number): Promise<void>;
  setNx(key: string, value: string, ttlMs: number): Promise<boolean>;
  del(key: string): Promise<void>;
};

type CacheRuntime = {
  memory: Map<string, Stored>;
  inflight: Map<string, Promise<Stored>>;
  refreshTasks: Set<Promise<unknown>>;
  nowFn: () => number;
  redisOverride: RedisLike | null | undefined;
  upstreamCount: number;
  counts: { hit: number; stale: number; miss: number; coalesce: number; bypass: number };
  activeUpstream: number;
  waitQueue: Array<() => void>;
};

const cacheGlobal = globalThis as typeof globalThis & { __scorelineOddAlertsCache?: CacheRuntime };
const runtime: CacheRuntime = (cacheGlobal.__scorelineOddAlertsCache ??= {
  memory: new Map(),
  inflight: new Map(),
  refreshTasks: new Set(),
  nowFn: () => Date.now(),
  redisOverride: undefined,
  upstreamCount: 0,
  counts: { hit: 0, stale: 0, miss: 0, coalesce: 0, bypass: 0 },
  activeUpstream: 0,
  waitQueue: [],
});
const memory = runtime.memory;
const inflight = runtime.inflight;
const refreshTasks = runtime.refreshTasks;
const MEMORY_CAP = 200;

export function setCacheNowForTests(fn: () => number): void {
  runtime.nowFn = fn;
}

export function setRedisForTests(redis: RedisLike | null | undefined): void {
  runtime.redisOverride = redis;
}

export function clearMemoryCacheForTests(): void {
  memory.clear();
}

export function resetOddAlertsCacheForTests(): void {
  memory.clear();
  inflight.clear();
  refreshTasks.clear();
  runtime.nowFn = () => Date.now();
  runtime.redisOverride = undefined;
  runtime.upstreamCount = 0;
  runtime.counts.hit = 0;
  runtime.counts.stale = 0;
  runtime.counts.miss = 0;
  runtime.counts.coalesce = 0;
  runtime.counts.bypass = 0;
  runtime.activeUpstream = 0;
  runtime.waitQueue.length = 0;
}

export function cacheCounters(): {
  upstream: number;
  hit: number;
  stale: number;
  miss: number;
  coalesce: number;
  bypass: number;
} {
  return { upstream: runtime.upstreamCount, ...runtime.counts };
}

export async function flushCacheRefreshes(): Promise<void> {
  await Promise.all([...refreshTasks]);
}

function now(): number {
  return runtime.nowFn();
}

function dataKey(key: string): string {
  return `oa:v1:${key}`;
}

function lockKey(key: string): string {
  return `oa:v1:lock:${key}`;
}

function upstash(): RedisLike | null {
  if (runtime.redisOverride !== undefined) return runtime.redisOverride;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return createUpstash(url, token);
}

function createUpstash(url: string, token: string): RedisLike {
  async function command(args: string[]): Promise<unknown> {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
    });
    if (!res.ok) throw new Error(`Redis ${res.status}`);
    const json = (await res.json()) as { result?: unknown };
    return json.result;
  }
  return {
    async get(key) {
      const result = await command(['GET', key]);
      return typeof result === 'string' ? result : null;
    },
    async set(key, value, ttlMs) {
      await command(['SET', key, value, 'PX', String(ttlMs)]);
    },
    async setNx(key, value, ttlMs) {
      const result = await command(['SET', key, value, 'NX', 'PX', String(ttlMs)]);
      return result === 'OK';
    },
    async del(key) {
      await command(['DEL', key]);
    },
  };
}

function ageOf(stored: Stored): number {
  return now() - stored.storedAt;
}

function usable(stored: Stored, ttl: TtlWindow): 'HIT' | 'STALE' | null {
  const age = ageOf(stored);
  if (age < 0) return null;
  if (age < ttl.freshMs) return 'HIT';
  if (age < ttl.freshMs + ttl.staleMs) return 'STALE';
  return null;
}

function remember(key: string, stored: Stored): void {
  memory.set(key, stored);
  if (memory.size <= MEMORY_CAP) return;
  const oldest = [...memory.entries()].sort((a, b) => a[1].storedAt - b[1].storedAt);
  while (memory.size > MEMORY_CAP && oldest.length > 0) {
    const next = oldest.shift();
    if (next) memory.delete(next[0]);
  }
}

async function readStored(key: string, ttl: TtlWindow): Promise<{ stored: Stored; kind: 'HIT' | 'STALE' } | null> {
  const local = memory.get(key);
  if (local) {
    const kind = usable(local, ttl);
    if (kind) return { stored: local, kind };
    memory.delete(key);
  }
  const redis = upstash();
  if (!redis) return null;
  try {
    const raw = await redis.get(dataKey(key));
    if (!raw) return null;
    const stored = JSON.parse(raw) as Stored;
    if (!stored || typeof stored.body !== 'string' || typeof stored.storedAt !== 'number') return null;
    const kind = usable(stored, ttl);
    if (!kind) return null;
    remember(key, stored);
    return { stored, kind };
  } catch (err) {
    console.log(JSON.stringify({ source: 'oddalerts-traffic', error: 'redis read failed', detail: String(err) }));
    return null;
  }
}

async function writeStored(key: string, stored: Stored, ttl: TtlWindow): Promise<void> {
  remember(key, stored);
  const redis = upstash();
  if (!redis) return;
  const payload = JSON.stringify(stored);
  if (payload.length > maxRedisBytes()) {
    console.log(
      JSON.stringify({
        source: 'oddalerts-traffic',
        error: 'redis skip, body larger than ODDALERTS_CACHE_MAX_BYTES',
        bytes: payload.length,
        path: key,
      }),
    );
    return;
  }
  try {
    await redis.set(dataKey(key), payload, ttl.freshMs + ttl.staleMs);
  } catch (err) {
    console.log(JSON.stringify({ source: 'oddalerts-traffic', error: 'redis write failed', detail: String(err) }));
  }
}

function cacheable(result: UpstreamBody): boolean {
  if (result.status < 200 || result.status >= 300) return false;
  const trimmed = result.body.trimStart();
  return trimmed.startsWith('{') || trimmed.startsWith('[');
}

async function limited<T>(fn: () => Promise<T>): Promise<T> {
  const limit = upstreamConcurrency();
  if (runtime.activeUpstream >= limit) {
    await new Promise<void>((resolve) => {
      runtime.waitQueue.push(resolve);
    });
  }
  runtime.activeUpstream += 1;
  try {
    return await fn();
  } finally {
    runtime.activeUpstream -= 1;
    const next = runtime.waitQueue.shift();
    if (next) next();
  }
}

async function fetchUpstream(fetcher: () => Promise<UpstreamBody>): Promise<UpstreamBody> {
  runtime.upstreamCount += 1;
  return limited(fetcher);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollForFresh(key: string, ttl: TtlWindow, started: number): Promise<Stored | null> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const found = await readStored(key, ttl);
    if (found && found.stored.storedAt >= started - 1) return found.stored;
    await sleep(150);
  }
  return null;
}

function scheduleRefresh(key: string, ttl: TtlWindow, fetcher: () => Promise<UpstreamBody>): void {
  if (inflight.has(key)) return;
  const shared = (async (): Promise<Stored> => {
    const fresh = await fetchUpstream(fetcher);
    if (!cacheable(fresh)) {
      const current = memory.get(key);
      if (current) return current;
      throw new Error('OddAlerts background refresh was not cacheable');
    }
    const stored: Stored = { ...fresh, storedAt: now() };
    await writeStored(key, stored, ttl);
    return stored;
  })();
  inflight.set(key, shared);
  refreshTasks.add(shared);
  void shared
    .catch((err) => {
      console.log(JSON.stringify({ source: 'oddalerts-traffic', error: 'background refresh failed', detail: String(err) }));
    })
    .finally(() => {
      refreshTasks.delete(shared);
      if (inflight.get(key) === shared) inflight.delete(key);
    });
}

async function loadShared(
  key: string,
  ttl: TtlWindow,
  fetcher: () => Promise<UpstreamBody>,
): Promise<{ stored: Stored; leader: boolean }> {
  const existing = inflight.get(key);
  if (existing) return { stored: await existing, leader: false };

  const task = (async () => {
    const redis = upstash();
    let holdLock = false;
    const started = now();
    if (redis) {
      try {
        holdLock = await redis.setNx(lockKey(key), '1', 30_000);
      } catch (err) {
        console.log(JSON.stringify({ source: 'oddalerts-traffic', error: 'redis lock failed', detail: String(err) }));
        holdLock = true;
      }
      if (!holdLock) {
        const waited = await pollForFresh(key, ttl, started);
        if (waited) return waited;
      }
    }
    try {
      const fresh = await fetchUpstream(fetcher);
      const stored: Stored = { ...fresh, storedAt: now() };
      if (cacheable(fresh)) await writeStored(key, stored, ttl);
      return stored;
    } finally {
      if (holdLock && redis) {
        try {
          await redis.del(lockKey(key));
        } catch {
          /* lock expires on its own */
        }
      }
    }
  })();

  inflight.set(key, task);
  try {
    return { stored: await task, leader: true };
  } finally {
    if (inflight.get(key) === task) inflight.delete(key);
  }
}

function finish(
  started: number,
  path: string,
  params: URLSearchParams,
  stored: UpstreamBody,
  cache: CacheStatus,
): CachedBody {
  const durationMs = Math.max(0, now() - started);
  runtime.counts[cache === 'HIT' ? 'hit' : cache === 'STALE' ? 'stale' : cache === 'MISS' ? 'miss' : cache === 'COALESCE' ? 'coalesce' : 'bypass'] += 1;
  trackRequest({ side: 'proxy', path, params: publicParams(params) }).finish({
    status: stored.status,
    bytes: stored.body.length,
    cache,
    durationMs,
  });
  return { ...stored, cache, durationMs };
}

export async function fetchThroughCache(options: {
  path: string;
  params: URLSearchParams;
  fetcher: () => Promise<UpstreamBody>;
  bypass?: boolean;
}): Promise<CachedBody> {
  const started = now();
  const key = cacheKey(options.path, options.params);
  const ttl = ttlFor(options.path);
  const bypass = options.bypass || !cacheEnabled();

  if (bypass) {
    try {
      const fresh = await options.fetcher();
      runtime.upstreamCount += 1;
      return finish(started, options.path, options.params, fresh, 'BYPASS');
    } catch (err) {
      finish(started, options.path, options.params, { status: 0, contentType: 'application/json', body: '' }, 'BYPASS');
      throw err;
    }
  }

  const cached = await readStored(key, ttl);
  if (cached?.kind === 'HIT') {
    return finish(started, options.path, options.params, cached.stored, 'HIT');
  }
  if (cached?.kind === 'STALE') {
    scheduleRefresh(key, ttl, options.fetcher);
    return finish(started, options.path, options.params, cached.stored, 'STALE');
  }

  try {
    const { stored, leader } = await loadShared(key, ttl, options.fetcher);
    return finish(started, options.path, options.params, stored, leader ? 'MISS' : 'COALESCE');
  } catch (err) {
    finish(started, options.path, options.params, { status: 0, contentType: 'application/json', body: '' }, 'MISS');
    throw err;
  }
}
