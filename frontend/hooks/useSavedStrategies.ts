import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';

import {
  CORE_VALUE_STRATEGY,
  type StrategyCall,
  type StrategyDefinition,
} from '@/services/strategyEngine';

const STRATEGY_KEY = 'scoreline.saved-strategies.v1';
const HISTORY_KEY = 'scoreline.strategy-evaluations.v1';

type EvaluationRecord = {
  id: string;
  definitionId: string;
  status: 'qualified' | 'rejected';
  compliance: number;
  evaluatedAt: string;
};

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
    // Storage can be unavailable in private browsing; live evaluation still works.
  }
}

function id(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useSavedStrategies() {
  const [custom, setCustom] = useState<StrategyDefinition[]>(() => readJson(STRATEGY_KEY, []));
  const [history, setHistory] = useState<EvaluationRecord[]>(() => readJson(HISTORY_KEY, []));

  useEffect(() => writeJson(STRATEGY_KEY, custom), [custom]);
  useEffect(() => writeJson(HISTORY_KEY, history), [history]);

  const definitions = useMemo(() => [CORE_VALUE_STRATEGY, ...custom], [custom]);

  const save = useCallback((input: Omit<StrategyDefinition, 'id'>) => {
    const definition: StrategyDefinition = { ...input, id: `custom-${id()}` };
    setCustom((current) => [...current, definition]);
    return definition;
  }, []);

  const remove = useCallback((definitionId: string) => {
    setCustom((current) => current.filter((item) => item.id !== definitionId));
    setHistory((current) => current.filter((item) => item.definitionId !== definitionId));
  }, []);

  const record = useCallback((calls: StrategyCall[]) => {
    const complete = calls.filter(
      (call): call is StrategyCall & { status: 'qualified' | 'rejected' } => call.status !== 'blocked',
    );
    if (complete.length === 0) return;
    setHistory((current) => {
      const byId = new Map(current.map((item) => [item.id, item]));
      let changed = false;
      for (const call of complete) {
        const existing = byId.get(call.id);
        if (existing?.status === call.status && existing.compliance === call.compliance) continue;
        byId.set(call.id, {
          id: call.id,
          definitionId: call.definitionId,
          status: call.status,
          compliance: call.compliance,
          evaluatedAt: new Date().toISOString(),
        });
        changed = true;
      }
      return changed ? [...byId.values()].slice(-2000) : current;
    });
  }, []);

  const historyByDefinition = useMemo(() => {
    const result: Record<string, { matched: number; total: number; compliance: number | null }> = {};
    for (const definition of definitions) {
      const rows = history.filter((item) => item.definitionId === definition.id);
      const matched = rows.filter((item) => item.status === 'qualified').length;
      result[definition.id] = {
        matched,
        total: rows.length,
        compliance: rows.length > 0 ? (matched / rows.length) * 100 : null,
      };
    }
    return result;
  }, [definitions, history]);

  return { definitions, custom, save, remove, record, historyByDefinition };
}
