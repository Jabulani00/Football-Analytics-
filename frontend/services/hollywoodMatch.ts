/**
 * Match Hollywoodbets events to the app's fixtures.
 *
 * Hollywoodbets and OddAlerts name teams differently ("Chippa Utd" vs "Chippa
 * United", "Man City" vs "Manchester City") and Hollywoodbets encodes both
 * teams in one `name` string ("Home vs Away"). This normalizes names and pairs
 * an event to a fixture by team match + kickoff proximity.
 *
 * SQUAD TIERS — why the extra gate. Token overlap alone scores "Real Madrid II"
 * against "Real Madrid" at 0.67 and "Barcelona B" against "Barcelona" at 0.50,
 * both of which clear the similarity floor, so a senior fixture could bind to a
 * reserve event and carry its odds. Raising the floor is not an option either:
 * "Man City" vs "Manchester City" also scores exactly 0.50. So squad identity is
 * checked separately from name similarity — reserve, youth and women's sides
 * only ever pair with their own kind — and the squad tokens are stripped before
 * similarity, so "Real Madrid II" vs "Real Madrid B" still reads as one club.
 *
 * Pure (no network, no React) → unit-testable.
 */
import type { HbEvent } from '@/services/hollywoodTypes';

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
    .replace(/[̀-ͯ]/g, '') // strip accents
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((t) => (t in SYNONYMS ? SYNONYMS[t] : t))
    .filter(Boolean);
  return base.join(' ').trim();
}

// ---- Country ----------------------------------------------------------------

/**
 * Providers spell the same country differently. Canonical form is the commoner
 * English name; add to this map rather than loosening the country gate, which
 * is the one part of the key allowed to reject a match outright.
 */
const COUNTRY_ALIASES: Record<string, string> = {
  usa: 'united states',
  'united states of america': 'united states',
  'korea republic': 'south korea',
  'republic of korea': 'south korea',
  'korea dpr': 'north korea',
  'cote divoire': 'ivory coast',
  czechia: 'czech republic',
  turkiye: 'turkey',
  holland: 'netherlands',
  'bosnia herzegovina': 'bosnia and herzegovina',
  uae: 'united arab emirates',
  'congo dr': 'dr congo',
  'democratic republic of congo': 'dr congo',
  'republic of ireland': 'ireland',
  'china pr': 'china',
};

/** Lowercase, strip punctuation/diacritics, then fold known naming variants. */
export function normalizeCountry(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .join(' ')
    .trim();
  return COUNTRY_ALIASES[base] ?? base;
}

// ---- Squad tiers ------------------------------------------------------------

export type SquadTier = 'senior' | 'reserve' | 'youth';

/**
 * Which squad of a club a name refers to. Two names describe the same team only
 * when every field agrees.
 *
 * `level` separates the first team (1) from B/II (2) and C/III (3). `ageCap`
 * holds the U-number for youth sides; a youth side named only "Junior" keeps
 * `null`, and null is compared strictly — pairing it with a U19 would be a
 * guess, and a missed match only shows up as a coverage gap whereas a wrong one
 * attaches the wrong odds to a fixture.
 */
export type SquadTag = {
  tier: SquadTier;
  level: number;
  ageCap: number | null;
  women: boolean;
};

const WOMEN_TOKENS = new Set([
  'women',
  'womens',
  'ladies',
  'feminine',
  'femenino',
  'feminino',
  'femminile',
  'frauen',
  'dames',
  'w',
]);

const YOUTH_TOKENS = new Set([
  'youth',
  'junior',
  'juniors',
  'jr',
  'academy',
  'development',
  'dev',
  'juvenil',
]);

/** Final-token markers for a second/third string. Only counted when last. */
const LEVEL_TOKENS: Record<string, number> = {
  b: 2,
  ii: 2,
  '2': 2,
  c: 3,
  iii: 3,
  '3': 3,
};

/** "u19" / "u21" → 19 / 21. */
function ageFromToken(token: string): number | null {
  const m = /^u(\d{2})$/.exec(token);
  return m ? Number(m[1]) : null;
}

/** Is `n` a plausible youth age cap? */
function isAgeCap(n: number): boolean {
  return Number.isFinite(n) && n >= 10 && n <= 23;
}

/**
 * Read the squad markers out of a team name.
 * Accepts a raw or already-normalized name.
 */
export function squadTag(name: string): SquadTag {
  const tokens = normalizeTeam(name).split(' ').filter(Boolean);

  let women = false;
  let youth = false;
  let ageCap: number | null = null;
  let level = 1;

  tokens.forEach((token, i) => {
    const isLast = i === tokens.length - 1;

    if (WOMEN_TOKENS.has(token)) {
      // A bare "w" only reads as a gender marker in trailing position —
      // elsewhere it is far more likely part of the club name.
      if (token !== 'w' || isLast) women = true;
      return;
    }

    if (YOUTH_TOKENS.has(token)) {
      youth = true;
      return;
    }

    const age = ageFromToken(token);
    if (age != null) {
      youth = true;
      ageCap = age;
      return;
    }

    // "under 21" spelled out.
    if (token === 'under' && i + 1 < tokens.length) {
      const next = Number(tokens[i + 1]);
      if (isAgeCap(next)) {
        youth = true;
        ageCap = next;
      }
      return;
    }

    // A level marker counts only as the final token, and never as the whole name.
    if (isLast && tokens.length > 1 && token in LEVEL_TOKENS) {
      level = LEVEL_TOKENS[token];
    }
  });

  return { tier: youth ? 'youth' : level > 1 ? 'reserve' : 'senior', level, ageCap, women };
}

/** Drop squad markers so similarity compares the club, not the squad. */
export function stripSquadTokens(name: string): string {
  const tokens = normalizeTeam(name).split(' ').filter(Boolean);
  const kept: string[] = [];

  tokens.forEach((token, i) => {
    const isLast = i === tokens.length - 1;
    if (WOMEN_TOKENS.has(token) && (token !== 'w' || isLast)) return;
    if (YOUTH_TOKENS.has(token)) return;
    if (ageFromToken(token) != null) return;
    if (token === 'under' && isAgeCap(Number(tokens[i + 1]))) return;
    if (tokens[i - 1] === 'under' && isAgeCap(Number(token))) return;
    if (isLast && tokens.length > 1 && token in LEVEL_TOKENS) return;
    kept.push(token);
  });

  // Never strip a name down to nothing.
  return (kept.length > 0 ? kept : tokens).join(' ');
}

/** Do two names refer to the same squad of a club? */
export function sameSquad(a: SquadTag, b: SquadTag): boolean {
  return a.tier === b.tier && a.level === b.level && a.ageCap === b.ageCap && a.women === b.women;
}

// ---- Similarity -------------------------------------------------------------

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

/** Squad-aware comparison: 0 when the two names describe different squads. */
export function teamSimilarity(a: string, b: string): number {
  if (!sameSquad(squadTag(a), squadTag(b))) return 0;
  return nameSimilarity(stripSquadTokens(a), stripSquadTokens(b));
}

/** Split a Hollywoodbets "Home vs Away" event name into the two normalized sides. */
export function splitEventName(eventName: string): { home: string; away: string } | null {
  const parts = eventName.split(/\s+vs?\.?\s+/i);
  if (parts.length !== 2) return null;
  return { home: normalizeTeam(parts[0]), away: normalizeTeam(parts[1]) };
}

export type FixtureKey = {
  homeName: string;
  awayName: string;
  /** Kickoff as unix seconds (optional — improves disambiguation). */
  kickoffUnix?: number;
  /** Country as our provider labels it. Gates the match when both sides have it. */
  country?: string;
  /** League/competition as our provider labels it. Scores only, never rejects. */
  league?: string;
};

/** The least an event must carry to be matchable — `HbEvent` and stored
 *  listings both satisfy it, so they share one matcher. `HbEvent` names the
 *  country `category`; stored listings name it `country`. */
export type MatchableEvent = {
  name: string;
  startTime: string;
  country?: string;
  category?: string;
  tournament?: string;
};

export type EventMatch<E extends MatchableEvent = HbEvent> = { event: E; score: number };

export const KICKOFF_TOLERANCE_S = 3 * 3600; // events within ±3h of kickoff are candidates
export const MIN_TEAM_SIM = 0.5; // each side must clear this to count as a match

/** Relative worth of each part of the key. Renormalised over what is present. */
const W_TEAMS = 0.6;
const W_KICKOFF = 0.25;
const W_LEAGUE = 0.15;

function eventCountry(event: MatchableEvent): string | undefined {
  return event.country ?? event.category;
}

/**
 * Find the best Hollywoodbets event for a fixture. Returns the event and a
 * confidence score in [0, 1], or null if nothing clears the threshold.
 *
 * THE KEY (analysis notes p77/p78). The notes rank four fields: country,
 * kick-off time, team names and league. Country and kick-off are the top two on
 * both pages, so they are allowed to *reject*: a country mismatch or a kick-off
 * outside tolerance disqualifies the event outright. League is deliberately not
 * allowed to reject — the same notes say a league may be "spelled wrong or
 * called a different name", so it only contributes to the score. Team names
 * both gate (via `MIN_TEAM_SIM`, which carries the squad-tier rules) and score.
 *
 * A field absent on either side is skipped rather than counted as a mismatch,
 * and the weights renormalise over whatever was actually compared, so a fixture
 * with no country still scores on the same [0, 1] scale.
 */
export function matchFixtureToEvent<E extends MatchableEvent>(
  fixture: FixtureKey,
  events: E[],
): EventMatch<E> | null {
  const fixtureCountry = fixture.country ? normalizeCountry(fixture.country) : undefined;
  let best: EventMatch<E> | null = null;

  for (const event of events) {
    const teams = splitEventName(event.name);
    if (!teams) continue;

    // Country gates — but only when both sides actually carry one.
    const evCountryRaw = eventCountry(event);
    if (fixtureCountry && evCountryRaw && normalizeCountry(evCountryRaw) !== fixtureCountry) {
      continue;
    }

    // A squad mismatch scores 0, so reserve/youth/women's sides never bind to
    // the senior fixture, nor across age groups. Home must match home and away
    // away, so a side-swapped listing is not a match.
    const simHome = teamSimilarity(fixture.homeName, teams.home);
    const simAway = teamSimilarity(fixture.awayName, teams.away);
    if (simHome < MIN_TEAM_SIM || simAway < MIN_TEAM_SIM) continue;

    let score = W_TEAMS * ((simHome + simAway) / 2);
    let weight = W_TEAMS;

    // Kick-off proximity. Both sides are absolute instants (unix / ISO), so no
    // timezone folding is needed to satisfy the notes' "standard time".
    if (fixture.kickoffUnix) {
      const evUnix = Math.floor(new Date(event.startTime).getTime() / 1000);
      if (!Number.isFinite(evUnix)) continue;
      const delta = Math.abs(evUnix - fixture.kickoffUnix);
      if (delta > KICKOFF_TOLERANCE_S) continue;
      score += W_KICKOFF * (1 - delta / KICKOFF_TOLERANCE_S);
      weight += W_KICKOFF;
    }

    if (fixture.league && event.tournament) {
      score += W_LEAGUE * nameSimilarity(normalizeTeam(fixture.league), normalizeTeam(event.tournament));
      weight += W_LEAGUE;
    }

    const normalised = weight > 0 ? score / weight : 0;
    if (!best || normalised > best.score) best = { event, score: normalised };
  }
  return best;
}
