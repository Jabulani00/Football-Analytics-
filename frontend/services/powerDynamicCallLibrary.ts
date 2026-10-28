/**
 * One copy of the leagues, tables, and season games used by power-dynamics calls.
 * It starts when the app opens. Choosing an in-option scores this copy and does not fetch again.
 */

import {
  detectKind,
  fetchAllCompetitions,
  fetchAllFixturesBetween,
  fetchSeasonStandings,
  seasonWindowUnix,
  type Competition,
  type RawFixture,
  type StandingRow,
} from '@/services/oddAlerts';
import { buildUpcomingDayKeys, localDateKey, parseDateKey } from '@/utils/dates';
import { seasonFeedFromFixtures } from '@/utils/powerDynamicCallFeed';
import {
  parseSavedPowerDynamicLibrary,
  POWER_DYNAMIC_LIBRARY_VERSION,
  readPowerDynamicLibraryDisk,
  readPowerDynamicLibraryDiskSync,
  writePowerDynamicLibraryDisk,
  type SavedPowerDynamicLibrary,
  type SavedStandingRow,
} from '@/utils/powerDynamicLibraryDisk';
import {
  scorePowerDynamicPacks,
  type PowerDynamicHit,
  type PowerDynamicLeaguePack,
} from '@/utils/powerDynamicLibraryScore';
import type { CallTableRow } from '@/utils/powerDynamicCallSearch';

export const POWER_DYNAMIC_DAY_COUNT = 10;
const LEAGUE_WORKERS = 4;

export type { PowerDynamicHit, PowerDynamicLeaguePack };

export type PowerDynamicLeagueRecord = PowerDynamicLeaguePack & {
  standings: StandingRow[];
};

export type PowerDynamicLibrarySnapshot = {
  phase: 'loading' | 'ready' | 'error';
  /** saved: reading the browser copy. fetch: asking the server because no copy exists yet. */
  hold: 'saved' | 'fetch';
  /** True once this browser has a copy it can open again after a refresh. */
  stored: boolean;
  done: number;
  total: number;
  error: string | null;
  days: string[];
  revision: number;
  packs: PowerDynamicLeagueRecord[];
};

const listeners = new Set<() => void>();

let snapshot: PowerDynamicLibrarySnapshot = {
  phase: 'loading',
  hold: 'saved',
  stored: false,
  done: 0,
  total: 0,
  error: null,
  days: buildUpcomingDayKeys(POWER_DYNAMIC_DAY_COUNT),
  revision: 0,
  packs: [],
};

let task: Promise<void> | null = null;

function publish(next: PowerDynamicLibrarySnapshot) {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

export function getPowerDynamicLibrarySnapshot(): PowerDynamicLibrarySnapshot {
  return snapshot;
}

export function subscribePowerDynamicLibrary(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function dayBounds(days: string[]): { fromUnix: number; toUnix: number } {
  const start = parseDateKey(days[0] ?? localDateKey(new Date()));
  const end = parseDateKey(days[days.length - 1] ?? localDateKey(new Date()));
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 0);
  return {
    fromUnix: Math.floor(start.getTime() / 1000),
    toUnix: Math.floor(end.getTime() / 1000),
  };
}

function tableFromStandings(rows: Awaited<ReturnType<typeof fetchSeasonStandings>>): CallTableRow[] {
  return rows.map((row) => ({
    rank: row.rank,
    teamId: row.teamId,
    name: row.name,
    played: row.played,
    points: row.points,
    homePoints: row.homePoints,
    awayPoints: row.awayPoints,
    zone: row.zone,
  }));
}

async function loadLeague(
  seasonId: number,
  competition: Competition,
  fixtures: RawFixture[],
): Promise<PowerDynamicLeagueRecord | null> {
  const standings = await fetchSeasonStandings(seasonId);
  const table = tableFromStandings(standings);
  const season = competition.seasons.find((item) => item.seasonId === seasonId);
  const window = seasonWindowUnix(season?.seasonName ?? '');
  const raw = await fetchAllFixturesBetween({
    fromUnix: window.fromUnix,
    toUnix: window.toUnix,
    competitions: String(competition.id),
    maxPages: 8,
  });
  const feed = seasonFeedFromFixtures(raw, seasonId);
  return {
    seasonId,
    competitionId: competition.id,
    competitionType: competition.type,
    seasonName: season?.seasonName ?? '',
    standings,
    name: competition.name,
    country: competition.country,
    table,
    byTeam: new Map(table.map((row) => [row.teamId, row])),
    matches: feed.matches,
    schedule: feed.schedule,
    cache: new Map(),
    fixtures: fixtures
      .filter((fixture) => fixture.home_id != null && fixture.away_id != null)
      .map((fixture) => ({
        id: fixture.id,
        homeId: fixture.home_id as number,
        awayId: fixture.away_id as number,
        homeName: fixture.home_name,
        awayName: fixture.away_name,
        unix: fixture.unix,
        dateKey: localDateKey(fixture.unix),
      })),
  };
}

function savedFromSnapshot(): SavedPowerDynamicLibrary {
  return {
    version: POWER_DYNAMIC_LIBRARY_VERSION,
    days: snapshot.days,
    packs: snapshot.packs.map((pack) => ({
      seasonId: pack.seasonId,
      competitionId: pack.competitionId,
      competitionType: pack.competitionType,
      seasonName: pack.seasonName,
      name: pack.name,
      country: pack.country,
      standings: pack.standings as SavedStandingRow[],
      table: pack.table,
      matches: pack.matches,
      schedule: pack.schedule,
      fixtures: pack.fixtures,
    })),
  };
}

function readyFromSaved(raw: unknown): boolean {
  const saved = parseSavedPowerDynamicLibrary(raw);
  if (!saved) return false;
  publish({
    phase: 'ready',
    hold: 'saved',
    stored: true,
    done: saved.packs.length,
    total: saved.packs.length,
    error: null,
    days: saved.days,
    revision: snapshot.revision + 1,
    packs: saved.packs,
  });
  return true;
}

async function loadLibrary() {
  const days = buildUpcomingDayKeys(POWER_DYNAMIC_DAY_COUNT);
  publish({
    ...snapshot,
    phase: 'loading',
    hold: 'fetch',
    stored: false,
    done: 0,
    total: 0,
    error: null,
    days,
    packs: [],
  });
  const [competitions, upcoming] = await Promise.all([
    fetchAllCompetitions(),
    fetchAllFixturesBetween({ ...dayBounds(days), maxPages: 40 }),
  ]);
  const byId = new Map(competitions.map((competition) => [competition.id, competition]));
  const grouped = new Map<number, { competitionId: number; fixtures: RawFixture[] }>();
  const daySet = new Set(days);
  for (const fixture of upcoming) {
    if (fixture.home_id == null || fixture.away_id == null) continue;
    const dateKey = localDateKey(fixture.unix);
    if (!daySet.has(dateKey)) continue;
    const competition = byId.get(fixture.competition_id);
    if (!competition || competition.isCup || detectKind(competition.name) === 'country') continue;
    const seasonId = fixture.season_id ?? competition.currentSeason;
    if (seasonId == null) continue;
    const bucket = grouped.get(seasonId) ?? { competitionId: competition.id, fixtures: [] };
    bucket.fixtures.push(fixture);
    grouped.set(seasonId, bucket);
  }

  const jobs = [...grouped.entries()];
  const packs: PowerDynamicLeagueRecord[] = [];
  let cursor = 0;
  let done = 0;
  publish({ ...snapshot, phase: 'loading', hold: 'fetch', done: 0, total: jobs.length, error: null, days, packs: [] });

  async function worker() {
    while (cursor < jobs.length) {
      const job = jobs[cursor];
      cursor += 1;
      if (!job) continue;
      const [seasonId, bucket] = job;
      const competition = byId.get(bucket.competitionId);
      if (!competition) {
        done += 1;
        publish({ ...snapshot, done, total: jobs.length });
        continue;
      }
      try {
        const pack = await loadLeague(seasonId, competition, bucket.fixtures);
        if (pack) packs.push(pack);
      } catch {
        // One league can fail without dropping the rest of the copy.
      } finally {
        done += 1;
        publish({ ...snapshot, done, total: jobs.length, packs: [] });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(LEAGUE_WORKERS, Math.max(jobs.length, 1)) }, () => worker()));
  publish({
    phase: 'ready',
    hold: 'fetch',
    stored: false,
    done: jobs.length,
    total: jobs.length,
    error: null,
    days,
    revision: snapshot.revision + 1,
    packs,
  });
}

/** Opens the browser copy when it exists. The server is used only when this browser has no copy yet. */
export function startPowerDynamicLibrary(): void {
  if (task) return;
  if (readyFromSaved(readPowerDynamicLibraryDiskSync())) {
    task = Promise.resolve();
    return;
  }
  task = (async () => {
    if (readyFromSaved(await readPowerDynamicLibraryDisk())) return;
    await loadLibrary();
    if (snapshot.phase !== 'ready' || snapshot.packs.length === 0) return;
    const stored = await writePowerDynamicLibraryDisk(savedFromSnapshot());
    if (snapshot.phase === 'ready') publish({ ...snapshot, stored });
  })().catch(() => {
    task = null;
    publish({
      ...snapshot,
      phase: 'error',
      hold: 'fetch',
      error: 'The leagues could not be prepared.',
      packs: [],
    });
  });
}

if (typeof window !== 'undefined') startPowerDynamicLibrary();

export function findPowerDynamicFixture(fixtureId: number): {
  record: PowerDynamicLeagueRecord;
  fixture: PowerDynamicLeagueRecord['fixtures'][number];
} | null {
  for (const record of snapshot.packs) {
    const fixture = record.fixtures.find((item) => item.id === fixtureId);
    if (fixture) return { record, fixture };
  }
  return null;
}

export function retryPowerDynamicLibrary(): void {
  if (snapshot.phase !== 'error') return;
  task = null;
  startPowerDynamicLibrary();
}

export { scorePowerDynamicPacks };

export function scorePowerDynamicLibrary(aspectIds: string[], dateKey: string): PowerDynamicHit[] {
  if (snapshot.phase !== 'ready') return [];
  return scorePowerDynamicPacks(snapshot.packs, aspectIds, dateKey);
}
