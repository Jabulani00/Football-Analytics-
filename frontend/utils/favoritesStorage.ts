import { Platform } from 'react-native';

const FAV_COMP_KEY = 'scoreline:favoriteCompetitions';
const FAV_COUNTRY_KEY = 'scoreline:favoriteCountries';
const SEEDED_KEY = 'scoreline:favoritesSeeded';
const CUPS_SEEDED_KEY = 'scoreline:popularCupsSeeded';
const COUNTRIES_SEEDED_KEY = 'scoreline:popularCountriesSeeded';
const INTL_SEEDED_KEY = 'scoreline:popularIntlSeeded';

function storageGet(key: string): string | null {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
  } catch {
    /* ignore */
  }
  return null;
}

function storageSet(key: string, value: string): void {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
  } catch {
    /* ignore */
  }
}

function readIds(key: string): number[] {
  const raw = storageGet(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(Number).filter((n) => Number.isFinite(n));
  } catch {
    return [];
  }
}

function writeIds(key: string, ids: number[]): void {
  const unique = [...new Set(ids.filter((n) => Number.isFinite(n)))];
  storageSet(key, JSON.stringify(unique));
}

export function loadFavoriteCompetitionIds(): number[] {
  return readIds(FAV_COMP_KEY);
}

export function saveFavoriteCompetitionIds(ids: number[]): void {
  writeIds(FAV_COMP_KEY, ids);
}

export function loadFavoriteCountryIds(): number[] {
  return readIds(FAV_COUNTRY_KEY);
}

export function saveFavoriteCountryIds(ids: number[]): void {
  writeIds(FAV_COUNTRY_KEY, ids);
}

export function hasSeededFavorites(): boolean {
  return storageGet(SEEDED_KEY) === '1';
}

export function markFavoritesSeeded(): void {
  storageSet(SEEDED_KEY, '1');
}

export function hasSeededPopularCups(): boolean {
  return storageGet(CUPS_SEEDED_KEY) === '1';
}

export function markPopularCupsSeeded(): void {
  storageSet(CUPS_SEEDED_KEY, '1');
}

export function hasSeededPopularCountries(): boolean {
  return storageGet(COUNTRIES_SEEDED_KEY) === '1';
}

export function markPopularCountriesSeeded(): void {
  storageSet(COUNTRIES_SEEDED_KEY, '1');
}

export function hasSeededPopularIntl(): boolean {
  return storageGet(INTL_SEEDED_KEY) === '1';
}

export function markPopularIntlSeeded(): void {
  storageSet(INTL_SEEDED_KEY, '1');
}

export function toggleId(ids: number[], id: number): number[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}
