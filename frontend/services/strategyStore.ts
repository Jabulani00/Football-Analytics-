/**
 * Cloud persistence for the Strategy Builder's saved strategies.
 *
 * Talks to Supabase over PostgREST with plain `fetch` (no SDK), mirroring
 * services/huntStore.ts. Uses the PUBLIC anon key — the `builder_strategy`
 * table's RLS allows anon read & write (a no-auth store; see the migration
 * 20261109120000_builder_strategy.sql). The service-role key is never used here
 * and must never reach the client.
 *
 * When the Supabase URL or anon key is absent the app keeps working on its
 * localStorage copy alone, so cloud sync is strictly additive.
 */
import type { SavedStrategy, SavedStrategyConfig } from '@/utils/strategyBuilder';
import { describeStrategy } from '@/utils/strategyBuilder';

const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
const TABLE = 'builder_strategy';

/** True only when both the project URL and the public anon key are configured. */
export function strategyCloudEnabled(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

/** One row of public.builder_strategy. */
export type BuilderStrategyRow = {
  id: string;
  name: string;
  note: string | null;
  config: SavedStrategyConfig;
  owner_key: string | null;
  created_at: string;
  updated_at: string;
};

/** Map a DB row to the app's SavedStrategy (recomputing the auto description). */
export function rowToSaved(row: BuilderStrategyRow): SavedStrategy {
  const config: SavedStrategyConfig = {
    conditions: Array.isArray(row.config?.conditions) ? row.config.conditions : [],
    logic: row.config?.logic === 'or' ? 'or' : 'and',
    resultMode: row.config?.resultMode === 'fixtures' ? 'fixtures' : 'teams',
  };
  return {
    id: row.id,
    name: row.name,
    description: describeStrategy(config),
    note: row.note ? row.note : undefined,
    createdAt: row.created_at ?? new Date().toISOString(),
    config,
  };
}

function headers(extra?: Record<string, string>): Record<string, string> {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}
function endpoint(query = ''): string {
  return `${SUPABASE_URL}/rest/v1/${TABLE}${query}`;
}

export class StrategyStoreError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'StrategyStoreError';
  }
}

/** Every saved strategy, newest first. Optionally scoped to one device key. */
export async function listStrategies(ownerKey?: string): Promise<SavedStrategy[]> {
  const scope = ownerKey ? `&owner_key=eq.${encodeURIComponent(ownerKey)}` : '';
  const res = await fetch(`${endpoint(`?select=*&order=created_at.desc${scope}`)}`, { headers: headers() });
  if (!res.ok) throw new StrategyStoreError(`list failed (${res.status})`, res.status);
  const rows = (await res.json()) as BuilderStrategyRow[];
  return rows.map(rowToSaved);
}

/** Insert or update one strategy (by primary key). */
export async function upsertStrategy(input: {
  id: string;
  name: string;
  note?: string | null;
  config: SavedStrategyConfig;
  ownerKey?: string | null;
}): Promise<void> {
  const res = await fetch(endpoint(), {
    method: 'POST',
    headers: headers({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify({
      id: input.id,
      name: input.name,
      note: input.note ?? null,
      config: input.config,
      owner_key: input.ownerKey ?? null,
    }),
  });
  if (!res.ok) throw new StrategyStoreError(`save failed (${res.status})`, res.status);
}

/** Remove one strategy by id. */
export async function deleteStrategy(id: string): Promise<void> {
  const res = await fetch(endpoint(`?id=eq.${encodeURIComponent(id)}`), {
    method: 'DELETE',
    headers: headers({ Prefer: 'return=minimal' }),
  });
  if (!res.ok) throw new StrategyStoreError(`delete failed (${res.status})`, res.status);
}
