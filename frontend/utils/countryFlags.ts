// Maps OddAlerts `competition_country` names to emoji flags for the feed.
// Falls back to a neutral marker for unmapped / international competitions.

const FLAGS: Record<string, string> = {
  England: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  Scotland: '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
  Wales: '🏴󠁧󠁢󠁷󠁬󠁳󠁿',
  'Northern Ireland': '🇬🇧',
  Ireland: '🇮🇪',
  Spain: '🇪🇸',
  Germany: '🇩🇪',
  Italy: '🇮🇹',
  France: '🇫🇷',
  Netherlands: '🇳🇱',
  Portugal: '🇵🇹',
  Belgium: '🇧🇪',
  Turkey: '🇹🇷',
  Turkmenistan: '🇹🇲',
  Greece: '🇬🇷',
  Russia: '🇷🇺',
  Ukraine: '🇺🇦',
  Poland: '🇵🇱',
  Austria: '🇦🇹',
  Switzerland: '🇨🇭',
  Denmark: '🇩🇰',
  Sweden: '🇸🇪',
  Norway: '🇳🇴',
  Finland: '🇫🇮',
  Iceland: '🇮🇸',
  Croatia: '🇭🇷',
  Serbia: '🇷🇸',
  Romania: '🇷🇴',
  Bulgaria: '🇧🇬',
  Hungary: '🇭🇺',
  'Czech Republic': '🇨🇿',
  Czechia: '🇨🇿',
  Slovakia: '🇸🇰',
  Slovenia: '🇸🇮',
  Belarus: '🇧🇾',
  Estonia: '🇪🇪',
  Latvia: '🇱🇻',
  Lithuania: '🇱🇹',
  Brazil: '🇧🇷',
  Argentina: '🇦🇷',
  Uruguay: '🇺🇾',
  Chile: '🇨🇱',
  Colombia: '🇨🇴',
  Peru: '🇵🇪',
  Ecuador: '🇪🇨',
  Paraguay: '🇵🇾',
  Bolivia: '🇧🇴',
  Mexico: '🇲🇽',
  'United States': '🇺🇸',
  USA: '🇺🇸',
  Canada: '🇨🇦',
  Japan: '🇯🇵',
  'South Korea': '🇰🇷',
  China: '🇨🇳',
  Australia: '🇦🇺',
  'Saudi Arabia': '🇸🇦',
  Qatar: '🇶🇦',
  'United Arab Emirates': '🇦🇪',
  Egypt: '🇪🇬',
  Morocco: '🇲🇦',
  Algeria: '🇩🇿',
  Tunisia: '🇹🇳',
  Nigeria: '🇳🇬',
  Ghana: '🇬🇭',
  'South Africa': '🇿🇦',
  India: '🇮🇳',
  Indonesia: '🇮🇩',
  Thailand: '🇹🇭',
  Vietnam: '🇻🇳',
  Malaysia: '🇲🇾',
  Israel: '🇮🇱',
  Cyprus: '🇨🇾',
  Georgia: '🇬🇪',
  Armenia: '🇦🇲',
  Azerbaijan: '🇦🇿',
  Kazakhstan: '🇰🇿',
  Albania: '🇦🇱',
  Bosnia: '🇧🇦',
  'Bosnia and Herzegovina': '🇧🇦',
  'North Macedonia': '🇲🇰',
  Montenegro: '🇲🇪',
  Kosovo: '🇽🇰',
  Moldova: '🇲🇩',
  Luxembourg: '🇱🇺',
  Malta: '🇲🇹',
  'Faroe Islands': '🇫🇴',
  Andorra: '🇦🇩',
  Gibraltar: '🇬🇮',
  'Costa Rica': '🇨🇷',
  Honduras: '🇭🇳',
  Guatemala: '🇬🇹',
  Panama: '🇵🇦',
  Jamaica: '🇯🇲',
  Venezuela: '🇻🇪',
  Europe: '🇪🇺',
  World: '🌍',
  International: '🌍',
};

export function countryFlag(country: string | null | undefined): string {
  if (!country) return '🌍';
  return FLAGS[country] ?? '🏳️';
}

/** True when we have a real flag for this name (used to flag national teams). */
export function hasCountryFlag(country: string | null | undefined): boolean {
  return !!country && country in FLAGS;
}

// ISO subdivisions the API uses that have their own emoji flags.
const SUBDIVISION_FLAGS: Record<string, string> = {
  'GB-ENG': FLAGS.England,
  'GB-SCT': FLAGS.Scotland,
  'GB-WLS': FLAGS.Wales,
  'GB-NIR': '🇬🇧',
};

/**
 * Flag for an ISO country code (e.g. `MX`, `GB-ENG`). Two-letter codes are turned
 * into regional-indicator emoji; falls back to the name map, then a neutral globe.
 */
export function flagFromCode(
  code: string | null | undefined,
  name?: string | null,
): string {
  if (code) {
    const upper = code.toUpperCase();
    if (SUBDIVISION_FLAGS[upper]) return SUBDIVISION_FLAGS[upper];
    if (/^[A-Z]{2}$/.test(upper)) {
      return String.fromCodePoint(
        ...[...upper].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
      );
    }
  }
  if (name && name in FLAGS) return FLAGS[name];
  return '🌍';
}
