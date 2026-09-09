/**
 * Seed lists for the home feed and sidebar favourites.
 * OddAlerts competition ids — keep in sync with competitionZones where possible.
 */

/** Big five + Scotland + South Africa (domestic leagues). */
export const POPULAR_CLUB_LEAGUE_IDS: number[] = [
  423, // Premier League
  419, // La Liga
  499, // Serie A
  477, // Bundesliga
  200, // Ligue 1
  259, // Scottish Premiership
  26, // South Africa Premiership
];

/**
 * Name patterns for popular cups / continental club competitions.
 * Resolved against fetchAllCompetitions() because cup ids vary by provider season.
 */
export const POPULAR_CLUB_CUP_NAME_RE =
  /^(uefa\s+)?champions league$|^(uefa\s+)?europa league$|^(uefa\s+)?europa conference|conference league|^fa cup$|^efl cup$|^carabao|^copa del rey$|^coppa italia$|^dfb[- ]?pokal$|^coupe de france$|^scottish cup$|^nedbank cup$|^mtn.?8$/i;

/** Popular countries for the Clubs → Countries sidebar (matched by name). */
export const POPULAR_COUNTRY_NAMES: string[] = [
  'England',
  'Spain',
  'Italy',
  'Germany',
  'France',
  'Netherlands',
  'Portugal',
  'Belgium',
  'Scotland',
  'South Africa',
  'Brazil',
  'Argentina',
  'USA',
  'United States',
  'Turkey',
  'Mexico',
];

/**
 * National-team tournaments that should pin to the top of Countries mode.
 * Matched by competition name.
 */
export const POPULAR_INTERNATIONAL_NAME_RE =
  /world cup|uefa nations league|\beuros?\b|european championship|copa am[eé]rica|africa(n)? cup|afcon|asian cup|gold cup|olympics|olympic|nations cup/i;

export function isPopularCountryName(name: string): boolean {
  const n = name.trim().toLowerCase();
  return POPULAR_COUNTRY_NAMES.some((p) => p.toLowerCase() === n);
}

export function resolvePopularCupIds(comps: { id: number; name: string; isCup?: boolean }[]): number[] {
  return comps.filter((c) => POPULAR_CLUB_CUP_NAME_RE.test(c.name.trim())).map((c) => c.id);
}

export function resolvePopularInternationalIds(comps: { id: number; name: string }[]): number[] {
  return comps.filter((c) => POPULAR_INTERNATIONAL_NAME_RE.test(c.name)).map((c) => c.id);
}
