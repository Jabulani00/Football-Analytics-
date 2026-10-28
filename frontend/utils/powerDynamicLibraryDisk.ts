/**
 * The power-dynamics league copy, stored as plain data so a refresh can open it
 * without asking the server again.
 */

import type { SeasonMatch } from '@/utils/bhozomaEngine';
import type { ImbangiScheduleMatch } from '@/utils/imbangiEngine';
import type { CallTableRow } from '@/utils/powerDynamicCallSearch';

export const POWER_DYNAMIC_LIBRARY_VERSION = 1;
const LOCAL_KEY = 'scoreline:power-dynamic-library';
const DB_NAME = 'scoreline-power-dynamics';
const STORE = 'library';
const RECORD_KEY = 'snapshot';

export type SavedStandingRow = {
  rank: number;
  teamId: number;
  name: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
  homePoints: number;
  awayPoints: number;
  zone: 'top' | 'mid' | 'bottom';
  timing: {
    firstGoalFor: number | null;
    firstGoalAgainst: number | null;
    scoredIn15: { count: number; pct: number };
    concededIn15: { count: number; pct: number };
    scoredAfter70: { count: number; pct: number };
    concededAfter70: { count: number; pct: number };
    coveragePct: number;
  };
};

export type SavedPowerDynamicPack = {
  seasonId: number;
  competitionId: number;
  competitionType: string;
  seasonName: string;
  name: string;
  country: string;
  standings: SavedStandingRow[];
  table: CallTableRow[];
  matches: SeasonMatch[];
  schedule: ImbangiScheduleMatch[];
  fixtures: {
    id: number;
    homeId: number;
    awayId: number;
    homeName: string;
    awayName: string;
    unix: number;
    dateKey: string;
  }[];
};

export type SavedPowerDynamicLibrary = {
  version: typeof POWER_DYNAMIC_LIBRARY_VERSION;
  days: string[];
  packs: SavedPowerDynamicPack[];
};

export type RestoredPowerDynamicPack = SavedPowerDynamicPack & {
  byTeam: Map<number, CallTableRow>;
  cache: Map<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function zone(value: unknown): CallTableRow['zone'] | null {
  if (value === 'top' || value === 'mid' || value === 'bottom') return value;
  return null;
}

function tally(value: unknown): { count: number; pct: number } {
  if (!isRecord(value)) return { count: 0, pct: 0 };
  return { count: num(value.count) ?? 0, pct: num(value.pct) ?? 0 };
}

function standing(value: unknown): SavedStandingRow | null {
  if (!isRecord(value)) return null;
  const rank = num(value.rank);
  const teamId = num(value.teamId);
  const name = str(value.name);
  const played = num(value.played);
  const points = num(value.points);
  const band = zone(value.zone);
  if (rank == null || teamId == null || name == null || played == null || points == null || !band) return null;
  const timing = isRecord(value.timing) ? value.timing : {};
  return {
    rank,
    teamId,
    name,
    played,
    won: num(value.won) ?? 0,
    drawn: num(value.drawn) ?? 0,
    lost: num(value.lost) ?? 0,
    goalsFor: num(value.goalsFor) ?? 0,
    goalsAgainst: num(value.goalsAgainst) ?? 0,
    goalDiff: num(value.goalDiff) ?? 0,
    points,
    homePoints: num(value.homePoints) ?? 0,
    awayPoints: num(value.awayPoints) ?? 0,
    zone: band,
    timing: {
      firstGoalFor: num(timing.firstGoalFor),
      firstGoalAgainst: num(timing.firstGoalAgainst),
      scoredIn15: tally(timing.scoredIn15),
      concededIn15: tally(timing.concededIn15),
      scoredAfter70: tally(timing.scoredAfter70),
      concededAfter70: tally(timing.concededAfter70),
      coveragePct: num(timing.coveragePct) ?? 0,
    },
  };
}

function tableRow(value: unknown): CallTableRow | null {
  if (!isRecord(value)) return null;
  const rank = num(value.rank);
  const teamId = num(value.teamId);
  const name = str(value.name);
  const played = num(value.played);
  const points = num(value.points);
  const band = zone(value.zone);
  if (rank == null || teamId == null || name == null || played == null || points == null || !band) return null;
  return {
    rank,
    teamId,
    name,
    played,
    points,
    homePoints: num(value.homePoints) ?? 0,
    awayPoints: num(value.awayPoints) ?? 0,
    zone: band,
  };
}

function fixture(value: unknown): SavedPowerDynamicPack['fixtures'][number] | null {
  if (!isRecord(value)) return null;
  const id = num(value.id);
  const homeId = num(value.homeId);
  const awayId = num(value.awayId);
  const homeName = str(value.homeName);
  const awayName = str(value.awayName);
  const unix = num(value.unix);
  const dateKey = str(value.dateKey);
  if (id == null || homeId == null || awayId == null || homeName == null || awayName == null || unix == null || dateKey == null) {
    return null;
  }
  return { id, homeId, awayId, homeName, awayName, unix, dateKey };
}

function match(value: unknown): SeasonMatch | null {
  if (!isRecord(value)) return null;
  const homeId = num(value.homeId);
  const awayId = num(value.awayId);
  const homeGoals = num(value.homeGoals);
  const awayGoals = num(value.awayGoals);
  const unix = num(value.unix);
  if (homeId == null || awayId == null || homeGoals == null || awayGoals == null || unix == null) return null;
  return {
    homeId,
    awayId,
    homeGoals,
    awayGoals,
    unix,
    homeGoalsHt: num(value.homeGoalsHt),
    awayGoalsHt: num(value.awayGoalsHt),
  };
}

function scheduleRow(value: unknown): ImbangiScheduleMatch | null {
  if (!isRecord(value)) return null;
  const homeId = num(value.homeId);
  const awayId = num(value.awayId);
  const unix = num(value.unix);
  if (homeId == null || awayId == null || unix == null || typeof value.finished !== 'boolean') return null;
  return {
    homeId,
    awayId,
    unix,
    finished: value.finished,
    homeGoals: num(value.homeGoals),
    awayGoals: num(value.awayGoals),
  };
}

function pack(value: unknown): RestoredPowerDynamicPack | null {
  if (!isRecord(value)) return null;
  const seasonId = num(value.seasonId);
  const competitionId = num(value.competitionId);
  const name = str(value.name);
  const country = str(value.country);
  if (seasonId == null || competitionId == null || name == null || country == null) return null;
  if (!Array.isArray(value.table) || !Array.isArray(value.fixtures)) return null;
  const table = value.table.map(tableRow).filter((row): row is CallTableRow => row != null);
  const fixtures = value.fixtures.map(fixture).filter((row): row is SavedPowerDynamicPack['fixtures'][number] => row != null);
  const standings = Array.isArray(value.standings)
    ? value.standings.map(standing).filter((row): row is SavedStandingRow => row != null)
    : [];
  const matches = Array.isArray(value.matches) ? value.matches.map(match).filter((row): row is SeasonMatch => row != null) : [];
  const schedule = Array.isArray(value.schedule)
    ? value.schedule.map(scheduleRow).filter((row): row is ImbangiScheduleMatch => row != null)
    : [];
  if (table.length === 0) return null;
  return {
    seasonId,
    competitionId,
    competitionType: str(value.competitionType) ?? '',
    seasonName: str(value.seasonName) ?? '',
    name,
    country,
    standings,
    table,
    matches,
    schedule,
    fixtures,
    byTeam: new Map(table.map((row) => [row.teamId, row])),
    cache: new Map(),
  };
}

/** Turns a stored payload back into league packs. Null when it is not a saved copy. */
export function parseSavedPowerDynamicLibrary(raw: unknown): { days: string[]; packs: RestoredPowerDynamicPack[] } | null {
  if (!isRecord(raw) || raw.version !== POWER_DYNAMIC_LIBRARY_VERSION) return null;
  if (!Array.isArray(raw.days) || !Array.isArray(raw.packs)) return null;
  const days = raw.days.filter((day): day is string => typeof day === 'string' && day.length > 0);
  const packs = raw.packs.map(pack).filter((row): row is RestoredPowerDynamicPack => row != null);
  if (days.length === 0 || packs.length === 0) return null;
  return { days, packs };
}

export function readPowerDynamicLibraryDiskSync(): unknown | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('no indexedDB'));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('indexedDB open failed'));
  });
}

async function idbGet(): Promise<unknown | null> {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(RECORD_KEY);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error ?? new Error('indexedDB read failed'));
    });
  } finally {
    db.close();
  }
}

async function idbPut(value: SavedPowerDynamicLibrary): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const request = db.transaction(STORE, 'readwrite').objectStore(STORE).put(value, RECORD_KEY);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error('indexedDB write failed'));
    });
  } finally {
    db.close();
  }
}

export async function readPowerDynamicLibraryDisk(): Promise<unknown | null> {
  const sync = readPowerDynamicLibraryDiskSync();
  if (sync) return sync;
  try {
    return await idbGet();
  } catch {
    return null;
  }
}

/** Keeps the copy in this browser. IndexedDB holds the full set; localStorage is the instant copy when it fits. */
export async function writePowerDynamicLibraryDisk(value: SavedPowerDynamicLibrary): Promise<boolean> {
  let kept = false;
  try {
    await idbPut(value);
    kept = true;
  } catch {
    /* this browser may block the database */
  }
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(value));
      kept = true;
    }
  } catch {
    try {
      localStorage.removeItem(LOCAL_KEY);
    } catch {
      /* ignore */
    }
  }
  return kept;
}
