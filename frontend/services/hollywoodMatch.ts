/**
 * Match Hollywoodbets events to the app's fixtures.
 *
 * Hollywoodbets and OddAlerts name teams differently ("Chippa Utd" vs "Chippa
 * United", "Man City" vs "Manchester City") and Hollywoodbets encodes both
 * teams in one `name` string ("Home vs Away"). This normalizes names and pairs
 * an event to a fixture by team match + kickoff proximity.
 *
 * Pure (no network, no React) → unit-testable.
 */
import type { HbEvent } from '@/services/hollywoodbets';

/** Common short forms → canonical tokens, applied after basic normalization. */
const SYNONYMS: Record<string, string> = {
  utd: 'united',
  fc: '',
  afc: '',
  cf: '',
  sc: '',
  city: 'city',
  intl: 'international',
  amp: 'and',
};

/** Lowercase, strip punctuation/diacritics and noise tokens → a comparable key. */
export function normalizeTeam(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((t) => (t in SYNONYMS ? SYNONYMS[t] : t))
    .filter(Boolean);
  return base.join(' ').trim();
}

/** Split a Hollywoodbets "Home vs Away" event name into normalized team keys. */
export function splitEventName(eventName: string): { home: string; away: string } | null {
  const parts = eventName.split(/\s+vs?\.?\s+/i);
  if (parts.length !== 2) return null;
  return { home: normalizeTeam(parts[0]), away: normalizeTeam(parts[1]) };
}

/** Token-overlap similarity of two normalized names, in [0, 1]. */
export function nameSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const ta = new Set(a.split(' '));
  const tb = new Set(b.split(' '));
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared += 1;
  const denom = Math.max(ta.size, tb.size);
  return denom > 0 ? shared / denom : 0;
}

export type FixtureKey = {
  homeName: string;
  awayName: string;
  /** Kickoff as unix seconds (optional — improves disambiguation). */
  kickoffUnix?: number;
};

export type EventMatch = { event: HbEvent; score: number };

const KICKOFF_TOLERANCE_S = 3 * 3600; // events within ±3h of kickoff are candidates
const MIN_TEAM_SIM = 0.5; // each side must clear this to count as a match

/**
 * Find the best Hollywoodbets event for a fixture. Returns the event and a
 * confidence score (0–1), or null if nothing clears the threshold.
 */
export function matchFixtureToEvent(fixture: FixtureKey, events: HbEvent[]): EventMatch | null {
  const fHome = normalizeTeam(fixture.homeName);
  const fAway = normalizeTeam(fixture.awayName);
  let best: EventMatch | null = null;

  for (const event of events) {
    const teams = splitEventName(event.name);
    if (!teams) continue;

    const simHome = nameSimilarity(fHome, teams.home);
    const simAway = nameSimilarity(fAway, teams.away);
    if (simHome < MIN_TEAM_SIM || simAway < MIN_TEAM_SIM) continue;

    let score = (simHome + simAway) / 2;

    // Reward kickoff proximity when both timestamps are available.
    if (fixture.kickoffUnix) {
      const evUnix = Math.floor(new Date(event.startTime).getTime() / 1000);
      const delta = Math.abs(evUnix - fixture.kickoffUnix);
      if (delta > KICKOFF_TOLERANCE_S) continue;
      score += (1 - delta / KICKOFF_TOLERANCE_S) * 0.25;
    }

    if (!best || score > best.score) best = { event, score };
  }
  return best;
}
