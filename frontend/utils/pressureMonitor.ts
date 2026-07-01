import { Platform } from 'react-native';

import type { ApiStatus, MatchStats, RawFixtureDetail } from '@/services/oddAlerts';

/** One pressure sample — poll `include=stats` during live play and append each minute. */
export type PressureSnapshot = {
  minute: number;
  home: number;
  away: number;
  homeAvg: number | null;
  awayAvg: number | null;
};

export type PressureReading = {
  current: PressureSnapshot;
  possession: { home: number; away: number } | null;
};

export function isLiveMatchStatus(status: ApiStatus | undefined): boolean {
  return status === 'LIVE' || status === 'HT' || status === '1H' || status === '2H';
}

function num(v: number | null | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Read pressure + possession from fixture `stats` (requires `include=stats`). */
export function readPressureReading(detail: Pick<RawFixtureDetail, 'stats' | 'elapsed'>): PressureReading | null {
  const stats = detail.stats;
  if (!stats) return null;

  const home = num(stats.home_pressure);
  const away = num(stats.away_pressure);
  if (home == null || away == null) return null;

  const minute = detail.elapsed ?? 0;
  const homeAvg = num(stats.home_pressure_avg);
  const awayAvg = num(stats.away_pressure_avg);

  const homePoss = num(stats.home_possession);
  const awayPoss = num(stats.away_possession);
  const possession =
    homePoss != null && awayPoss != null ? { home: homePoss, away: awayPoss } : null;

  return {
    current: { minute, home, away, homeAvg, awayAvg },
    possession,
  };
}

/** Append a sample when the minute or values change (max 120 points). */
export function appendPressureSnapshot(
  history: PressureSnapshot[],
  sample: PressureSnapshot,
): PressureSnapshot[] {
  const last = history[history.length - 1];
  if (last && last.minute === sample.minute && last.home === sample.home && last.away === sample.away) {
    return history;
  }

  const withoutDup = history.filter((s) => s.minute !== sample.minute);
  return [...withoutDup, sample].sort((a, b) => a.minute - b.minute).slice(-120);
}

export function formatPressure(n: number): string {
  return n % 1 === 0 ? String(Math.round(n)) : n.toFixed(1);
}

export type PressureFactor = {
  label: string;
  home: number;
  away: number;
};

/** Live stat shares that feed the OddAlerts pressure index (from include=stats). */
export function readPressureFactors(stats: MatchStats | undefined): PressureFactor[] {
  if (!stats) return [];

  const rows: { label: string; homeKey: string; awayKey: string }[] = [
    { label: 'Dangerous attacks', homeKey: 'home_dang_attacks', awayKey: 'away_dang_attacks' },
    { label: 'Attacks', homeKey: 'home_attacks', awayKey: 'away_attacks' },
    { label: 'Shots on target', homeKey: 'home_shots_on', awayKey: 'away_shots_on' },
    { label: 'Total shots', homeKey: 'home_shots', awayKey: 'away_shots' },
    { label: 'Corners', homeKey: 'home_corners', awayKey: 'away_corners' },
    { label: 'Possession', homeKey: 'home_possession', awayKey: 'away_possession' },
  ];

  const factors: PressureFactor[] = [];
  for (const row of rows) {
    const home = num(stats[row.homeKey]);
    const away = num(stats[row.awayKey]);
    if (home == null || away == null) continue;
    const total = home + away;
    if (total <= 0) continue;
    factors.push({
      label: row.label,
      home: Math.round((home / total) * 1000) / 10,
      away: Math.round((away / total) * 1000) / 10,
    });
  }
  return factors;
}

export const PRESSURE_FORMULA_NOTE =
  'OddAlerts pressure comes from include=stats on the fixture endpoint (per Joe @ OddAlerts). ' +
  'Poll every minute during live play and save each snapshot client-side to build the trace chart. ' +
  'The API returns the current index only — not a historical series.';

function pressureStorageKey(fixtureId: number): string {
  return `oddalerts-pressure:${fixtureId}`;
}

/** Restore a trace built while watching live (web sessionStorage). */
export function loadStoredPressureHistory(fixtureId: number): PressureSnapshot[] {
  if (Platform.OS !== 'web' || typeof sessionStorage === 'undefined') return [];
  try {
    const raw = sessionStorage.getItem(pressureStorageKey(fixtureId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PressureSnapshot[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveStoredPressureHistory(fixtureId: number, history: PressureSnapshot[]): void {
  if (Platform.OS !== 'web' || typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(pressureStorageKey(fixtureId), JSON.stringify(history));
  } catch {
    // quota / private mode — ignore
  }
}
