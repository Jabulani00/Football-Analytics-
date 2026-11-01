/** Stakeholder rules use website decimal prices, never probabilities or de-vigged prices. */
export type Price = { name: string; odds: number | null; open: boolean };
export type BookMarket = { id: string; name: string; line?: number | null; selections: Price[] };
export type BookFixture = {
  id: string; bookmaker: 'Hollywoodbets' | 'Betway'; name: string; country: string;
  competition: string; kickoff: string; observedAt: string | null;
  home: Price; draw: Price; away: Price; markets: BookMarket[];
};
export type PairAssessment = { gap: number; preference: 'first' | 'second' | 'none'; };
export type TeamAssessment = PairAssessment & {
  ratio: number; group: 1 | 2 | 3; band: 'Below range' | 'Within range' | 'Above range';
  orientation: 'A' | 'B' | 'equal'; category: string | null;
};

function usable(price: Price): boolean {
  return price.open && price.odds != null && Number.isFinite(price.odds) && price.odds >= 1;
}
/** Exact base-ten integer representation, including exponent notation. */
function decimal(value: number): [bigint, number] {
  const [mantissa, exponent = '0'] = value.toString().toLowerCase().split('e');
  const places = (mantissa.split('.')[1]?.length ?? 0) - Number(exponent);
  const digits = BigInt(mantissa.replace('.', ''));
  return places < 0 ? [digits * 10n ** BigInt(-places), 0] : [digits, places];
}
function aligned(a: number, b: number): [bigint, bigint, bigint] {
  const [x, xp] = decimal(a); const [y, yp] = decimal(b);
  const places = Math.max(xp, yp);
  return [x * 10n ** BigInt(places - xp), y * 10n ** BigInt(places - yp), 10n ** BigInt(places)];
}
/** Hollywood's raw feed excludes the stake; restore website decimal prices without float addition. */
export function websitePriceFromNet(net: number): number | null {
  if (!Number.isFinite(net) || net < 0) return null;
  const [digits, places] = decimal(net);
  const scale = 10n ** BigInt(places);
  return Number(digits + scale) / Number(scale);
}
export function assessPair(first: Price, second: Price): PairAssessment | null {
  if (!usable(first) || !usable(second)) return null;
  const [a, b, scale] = aligned(first.odds!, second.odds!);
  const gap = a > b ? a - b : b - a;
  return { gap: Number(gap) / Number(scale),
    preference: gap * 100n < 30n * scale ? 'none' : a < b ? 'first' : 'second' };
}
export function assessTeams(home: Price, away: Price): TeamAssessment | null {
  const pair = assessPair(home, away);
  if (!pair) return null;
  const [h, a] = aligned(home.odds!, away.odds!);
  const small = h < a ? h : a; const big = h > a ? h : a;
  const group = small * 100n < big * 35n ? 1 : small * 100n <= big * 65n ? 2 : 3;
  const orientation = h === a ? 'equal' : h > a ? 'A' : 'B';
  return { ...pair, ratio: Number(small) / Number(big), group,
    band: group === 1 ? 'Below range' : group === 2 ? 'Within range' : 'Above range',
    orientation, category: orientation === 'equal' ? null : `${group}${orientation}` };
}
/** Recognise named two-way markets, never infer opposition merely from having two prices. */
function additionalPair(market: BookMarket): { label: string; first: Price; second: Price } | null {
  if (market.selections.length !== 2) return null;
  const [first, second] = market.selections;
  const names = market.selections.map((selection) => selection.name.trim().toLowerCase());
  if (!names[0] || !names[1] || names[0] === names[1] ||
    names.some((name) => /^(unknown(?: selection)?|none|no goal|tie|x)$/.test(name))) return null;
  const title = market.name.trim().toLowerCase().replace(/[_/]+/g, ' ').replace(/\s+/g, ' ');
  const base = title.replace(/^(?:(?:1st|2nd|first|second) half|full time|match)\s*[-:]?\s*/, '');
  const oddEven = /\bodd\s*(?:-|and)?\s*even\b/.test(base) &&
    names.includes('odd') && names.includes('even');
  const drawNoBet = /^(?:draw no bet|draw-no-bet|dnb)$/.test(base) && !names.includes('draw');
  const homeNoBet = /^home no bet$/.test(base) && names.includes('draw') && !names.includes('home');
  const awayNoBet = /^away no bet$/.test(base) && names.includes('draw') && !names.includes('away');
  const progression = /^(?:to qualify|to advance|to lift (?:the )?trophy|(?:match )?winner including extra time and penalties)$/.test(base)
    && !names.includes('draw');
  const asian = /^asian handicap(?:\s*[-:]?\s*[+-]?\d+(?:\.\d+)?)?$/.test(base) && !names.includes('draw');
  if (asian) {
    const lines = names.map((name) => /(?:^|\s|\()([+-]\d+(?:\.\d+)?)(?:\)|\s|$)/.exec(name));
    // When selection-specific lines exist, they must be opposite values.
    if (lines.some(Boolean) && (!lines.every(Boolean) || Number(lines[0]![1]) !== -Number(lines[1]![1]))) return null;
    // Without selection lines, require the provider's explicit line metadata.
    if (!lines.some(Boolean) && (market.line == null || !Number.isFinite(market.line))) return null;
  }
  return oddEven || drawNoBet || homeNoBet || awayNoBet || progression || asian
    ? { label: market.name, first, second } : null;
}

/** Pair selections only inside the same provider market, period and line. */
export function opposingPairs(market: BookMarket): { label: string; first: Price; second: Price | null }[] {
  const additional = additionalPair(market);
  if (additional) return [additional];
  const selectionNames = market.selections.map((selection) => selection.name.trim().toLowerCase());
  const yesNoOnly = selectionNames.every((name) => /^(yes|no)$/.test(name));
  const totalsOnly = selectionNames.every((name) => /^(over|under)(?:\s+(\d+(?:\.\d+)?))?$/.test(name));
  // Never extract an apparent pair from a compound or three-way market.
  if (!yesNoOnly && !totalsOnly) return [];
  const groups = new Map<string, { first?: Price; second?: Price; ambiguous?: boolean }>();
  for (const selection of market.selections) {
    const text = selection.name.trim().toLowerCase();
    const yesNo = /^(yes|no)$/.exec(text);
    const total = /^(over|under)(?:\s+(\d+(?:\.\d+)?))?$/.exec(text);
    if (!yesNo && !total) continue;
    const line = total ? total[2] ?? market.line : null;
    if (total && line == null) continue;
    const key = yesNo ? 'Yes / No' : `Over / Under ${Number(line)}`;
    const side = (yesNo ? yesNo[1] === 'yes' : total![1] === 'over') ? 'first' : 'second';
    const pair = groups.get(key) ?? {};
    if (pair[side]) pair.ambiguous = true;
    pair[side] = selection; groups.set(key, pair);
  }
  return [...groups.entries()].filter(([, pair]) => !pair.ambiguous).map(([label, pair]) => ({
    label, first: pair.first ?? pair.second!, second: pair.first ? pair.second ?? null : null,
  }));
}
export type FixtureFilters = { query: string; country: string; competition: string; group: string;
  orientation: string; category: string; preference: string; side: string };
export function filterBookFixtures(fixtures: BookFixture[], filters: FixtureFilters): BookFixture[] {
  return fixtures.filter((fixture) => {
    const result = assessTeams(fixture.home, fixture.away);
    return (!filters.query || fixture.name.toLowerCase().includes(filters.query.trim().toLowerCase())) &&
      (!filters.country || fixture.country === filters.country) &&
      (!filters.competition || fixture.competition === filters.competition) &&
      (!filters.group || String(result?.group) === filters.group) &&
      (!filters.orientation || result?.orientation === filters.orientation) &&
      (!filters.category || result?.category === filters.category) &&
      (!filters.preference || (filters.preference === 'unavailable' ? !result
        : filters.preference === 'none' ? result?.preference === 'none' : result != null && result.preference !== 'none')) &&
      (!filters.side || result?.preference === filters.side);
  });
}
