import { normalizeCountry } from '@/services/hollywoodMatch';

export type CompetitionCandidate = {
  id: number;
  name: string;
  country: string;
};

function normalizedName(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/&/g, ' and ')
    .replace(/\s*\((?:early betting|early odds)\)\s*$/i, '')
    .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function southAfricanLeagueAlias(name: string, country: string): boolean {
  if (normalizeCountry(country) !== 'south africa') return false;
  const aliases = new Set(['psl', 'premier league', 'premier soccer league']);
  return aliases.has(name);
}

export function oddAlertsCompetitionSearchTerm(
  hollywoodCompetition: string,
  hollywoodCountry: string,
): string {
  const name = normalizedName(hollywoodCompetition);
  if (normalizeCountry(hollywoodCountry) === 'south africa' && name === 'psl') {
    return 'Premier League';
  }
  return hollywoodCompetition
    .replace(/\s*\((?:early betting|early odds)\)\s*$/i, '')
    .trim();
}

/** Match by exact competition and country, with only the known South African PSL alias. */
export function matchingOddAlertsCompetitionIds(
  hollywoodCompetition: string,
  hollywoodCountry: string,
  candidates: readonly CompetitionCandidate[],
): number[] {
  const name = normalizedName(hollywoodCompetition);
  const country = normalizeCountry(hollywoodCountry);
  const exact = candidates.filter((candidate) => {
    const candidateName = normalizedName(candidate.name);
    return candidateName === name || southAfricanLeagueAlias(name, country)
      && southAfricanLeagueAlias(candidateName, country);
  });
  const inCountry = exact.filter((candidate) => normalizeCountry(candidate.country) === country);
  return [...new Set(inCountry.map((candidate) => candidate.id))];
}
