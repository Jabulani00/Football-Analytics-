import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { describeStrategy, type SavedStrategy, type SavedStrategyConfig } from '@/utils/strategyBuilder';
import { deleteStrategy, listStrategies, strategyCloudEnabled, upsertStrategy } from '@/services/strategyStore';

// Saved Strategy Builder configs — the HOW (conditions, logic, view), never the
// resulting teams or fixtures. Persisted to Supabase when the anon key is set,
// with this localStorage copy as the offline cache / fallback. Kept separate
// from the legacy strategyEngine store (scoreline.saved-strategies.v1).
const KEY = 'scoreline.strategy-builder.v1';
const DEVICE_KEY = 'scoreline.strategy-builder.device.v1';

function readJson<T>(key: string, fallback: T): T {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return fallback;
  try {
    const value = window.localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable in private browsing; building still works.
  }
}

function uid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** A stable per-device tag written on every cloud row (not a security boundary). */
function deviceKey(): string {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return 'app';
  try {
    let v = window.localStorage.getItem(DEVICE_KEY);
    if (!v) { v = uid(); window.localStorage.setItem(DEVICE_KEY, v); }
    return v;
  } catch {
    return 'app';
  }
}

export function useSavedBuilderStrategies() {
  const [saved, setSaved] = useState<SavedStrategy[]>(() => readJson(KEY, []));
  const cloud = strategyCloudEnabled();
  const [syncError, setSyncError] = useState<string | null>(null);

  // Mirror to the local cache on every change so offline reloads keep working.
  useEffect(() => writeJson(KEY, saved), [saved]);

  // On mount, when cloud sync is on, the database is the source of truth.
  useEffect(() => {
    if (!cloud) return;
    let alive = true;
    listStrategies()
      .then((rows) => { if (alive) { setSaved(rows); setSyncError(null); } })
      .catch((err) => { if (alive) setSyncError(err instanceof Error ? err.message : 'sync failed'); });
    return () => { alive = false; };
  }, [cloud]);

  const save = useCallback((name: string, config: SavedStrategyConfig, note?: string) => {
    const trimmedNote = note?.trim();
    const entry: SavedStrategy = {
      id: uid(),
      name: name.trim() || 'Untitled strategy',
      description: describeStrategy(config),
      note: trimmedNote ? trimmedNote : undefined,
      createdAt: new Date().toISOString(),
      config,
    };
    setSaved((cur) => [entry, ...cur]);
    if (cloud) {
      upsertStrategy({ id: entry.id, name: entry.name, note: entry.note ?? null, config, ownerKey: deviceKey() })
        .then(() => setSyncError(null))
        .catch((err) => setSyncError(err instanceof Error ? err.message : 'save to cloud failed'));
    }
    return entry;
  }, [cloud]);

  const remove = useCallback((id: string) => {
    setSaved((cur) => cur.filter((s) => s.id !== id));
    if (cloud) {
      deleteStrategy(id)
        .then(() => setSyncError(null))
        .catch((err) => setSyncError(err instanceof Error ? err.message : 'delete from cloud failed'));
    }
  }, [cloud]);

  const rename = useCallback((id: string, name: string) => {
    let updated: SavedStrategy | undefined;
    setSaved((cur) => cur.map((s) => {
      if (s.id !== id) return s;
      updated = { ...s, name: name.trim() || s.name };
      return updated;
    }));
    if (cloud && updated) {
      upsertStrategy({ id: updated.id, name: updated.name, note: updated.note ?? null, config: updated.config, ownerKey: deviceKey() })
        .then(() => setSyncError(null))
        .catch((err) => setSyncError(err instanceof Error ? err.message : 'rename in cloud failed'));
    }
  }, [cloud]);

  // Edit an existing strategy in place (name / description / build), keeping its id.
  const update = useCallback((id: string, patch: { name?: string; note?: string; config?: SavedStrategyConfig }) => {
    let updated: SavedStrategy | undefined;
    setSaved((cur) => cur.map((s) => {
      if (s.id !== id) return s;
      const config = patch.config ?? s.config;
      const note = patch.note !== undefined ? (patch.note.trim() || undefined) : s.note;
      updated = { ...s, name: patch.name?.trim() || s.name, note, description: describeStrategy(config), config };
      return updated;
    }));
    if (cloud && updated) {
      upsertStrategy({ id: updated.id, name: updated.name, note: updated.note ?? null, config: updated.config, ownerKey: deviceKey() })
        .then(() => setSyncError(null))
        .catch((err) => setSyncError(err instanceof Error ? err.message : 'update to cloud failed'));
    }
    return updated;
  }, [cloud]);

  return { saved, save, update, remove, rename, cloud, syncError };
}
