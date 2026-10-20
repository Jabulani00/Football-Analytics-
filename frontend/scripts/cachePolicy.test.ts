import { ttlNameFor, ttlFor, clientStaleTime } from '../services/oddAlertsCachePolicy';

type Case = { path: string; name: string | null; fresh: number };

// The results feed (`fixtures/between`) and the stat endpoints are the heaviest
// pulls; they must resolve to their designed windows, not the id/fallback TTLs.
const cases: Case[] = [
  { path: 'fixtures/live', name: 'fixtures/live', fresh: 10_000 },
  { path: 'fixtures/upcoming', name: 'fixtures/upcoming', fresh: 20_000 },
  { path: 'value/upcoming', name: 'fixtures/upcoming', fresh: 20_000 },
  { path: 'fixtures/between', name: 'fixtures/between', fresh: 60_000 }, // regression: used to hit fixtures/id (15s)
  { path: 'fixtures/123', name: 'fixtures/id', fresh: 15_000 },
  { path: 'stats/season', name: 'stats', fresh: 60_000 }, // bare client label
  { path: 'stats/season/3872', name: 'stats', fresh: 60_000 },
  { path: 'stats/fixture', name: 'stats', fresh: 60_000 },
  { path: 'stats/fixture/9', name: 'stats', fresh: 60_000 },
  { path: 'competitions', name: 'reference', fresh: 5 * 60_000 },
  { path: 'nonsense/path', name: null, fresh: 30_000 }, // fallback
];

for (const c of cases) {
  const name = ttlNameFor(c.path);
  if (name !== c.name) throw new Error(`ttlNameFor(${c.path}) expected ${c.name}, got ${name}`);
  const fresh = clientStaleTime(c.path);
  if (fresh !== c.fresh) throw new Error(`clientStaleTime(${c.path}) expected ${c.fresh}, got ${fresh}`);
  // server TTL reads the same resolver
  if (ttlFor(c.path).freshMs !== c.fresh) throw new Error(`ttlFor(${c.path}).freshMs expected ${c.fresh}`);
}

console.log('✓ Cache policy resolves fixtures/between and stats labels to their designed TTLs.');
