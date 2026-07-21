/** Offline test for services/fixtureCache.ts. Run: npx tsx scripts/test-fixture-cache.ts */
import { cachedFetch, cacheSize, clearFixtureCache } from '../services/fixtureCache';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.log(`  FAIL ${n}`); } };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

(async () => {
  clearFixtureCache();
  let calls = 0;
  const fn = async () => { calls += 1; return calls; };

  // First call runs fn; second (within TTL) is cached.
  const a = await cachedFetch('k', 200, fn);
  const b = await cachedFetch('k', 200, fn);
  ok('caches within TTL', a === 1 && b === 1 && calls === 1);
  ok('cacheSize is 1', cacheSize() === 1);

  // After TTL expiry, fn runs again.
  await sleep(220);
  const c = await cachedFetch('k', 200, fn);
  ok('refetches after TTL', c === 2 && calls === 2);

  // In-flight de-duplication: concurrent calls share one fetch.
  clearFixtureCache();
  let slowCalls = 0;
  const slow = async () => { slowCalls += 1; await sleep(50); return 'x'; };
  const [r1, r2, r3] = await Promise.all([
    cachedFetch('s', 1000, slow),
    cachedFetch('s', 1000, slow),
    cachedFetch('s', 1000, slow),
  ]);
  ok('dedupes concurrent calls', r1 === 'x' && r2 === 'x' && r3 === 'x' && slowCalls === 1);

  // Failures are not cached.
  clearFixtureCache();
  let attempts = 0;
  const flaky = async () => { attempts += 1; if (attempts === 1) throw new Error('boom'); return 'ok'; };
  try { await cachedFetch('f', 1000, flaky); } catch { /* expected */ }
  const recovered = await cachedFetch('f', 1000, flaky);
  ok('does not cache failures', recovered === 'ok' && attempts === 2);

  // Distinct keys are independent.
  clearFixtureCache();
  await cachedFetch('a', 1000, async () => 1);
  await cachedFetch('b', 1000, async () => 2);
  ok('distinct keys independent', cacheSize() === 2);

  console.log(`\n${pass}/${pass + fail} checks passed`);
  process.exit(fail === 0 ? 0 : 1);
})();
