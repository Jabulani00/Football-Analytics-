import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { describeStrategy, type SavedStrategy, type SavedStrategyConfig } from '@/utils/strategyBuilder';

// Saved Strategy Builder configs — the HOW (conditions, logic, view), never the
// resulting teams or fixtures. Kept separate from the legacy strategyEngine
// store (scoreline.saved-strategies.v1) used by the Strategies tab.
const KEY = 'scoreline.strategy-builder.v1';

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

export function useSavedBuilderStrategies() {
  const [saved, setSaved] = useState<SavedStrategy[]>(() => readJson(KEY, []));

  useEffect(() => writeJson(KEY, saved), [saved]);

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
    return entry;
  }, []);

  const remove = useCallback((id: string) => {
    setSaved((cur) => cur.filter((s) => s.id !== id));
  }, []);

  const rename = useCallback((id: string, name: string) => {
    setSaved((cur) => cur.map((s) => (s.id === id ? { ...s, name: name.trim() || s.name } : s)));
  }, []);

  return { saved, save, remove, rename };
}
