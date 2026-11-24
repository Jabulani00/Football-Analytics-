import type { BetSlipLeg } from '@/types/analytics';
/** Stakeholder rules use website decimal prices, never probabilities or de-vigged prices. */
export type Price = { name: string; odds: number | null; open: boolean; betSlipLeg?: BetSlipLeg };
export type BookMarket = { id: string; name: string; line?: number | null; selections: Price[] };
export type BookFixture = {
  id: string; bookmaker: 'Hollywoodbets' | 'Betway'; name: string; country: string;
  competition: string; kickoff: string; observedAt: string | null;
  home: Price; draw: Price; away: Price; markets: BookMarket[];
};
export type PriceGap = { gap: number; size: 'small' | 'big' };
export type PairAssessment = PriceGap & { preference: 'first' | 'second' | 'none'; };
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
function gapParts(first: number, second: number, boundary = 1.5) {
  const [a, b, scale] = aligned(first, second);
  const difference = a > b ? a - b : b - a;
  const [boundaryDigits, boundaryPlaces] = decimal(boundary);
  return {
    difference, scale,
    gap: Number(difference) / Number(scale),
    size: difference * 10n ** BigInt(boundaryPlaces) < boundaryDigits * scale ? 'small' as const : 'big' as const,
  };
}
export function comparePriceGap(first: number, second: number): PriceGap | null {
  if (!Number.isFinite(first) || first < 1 || !Number.isFinite(second) || second < 1) return null;
  const { gap, size } = gapParts(first, second);
  return { gap, size };
}
export function assessPair(first: Price, second: Price, boundary = 1.5): PairAssessment | null {
  if (!usable(first) || !usable(second) || !Number.isFinite(boundary) || boundary < 0) return null;
  const { gap, size, difference, scale } = gapParts(first.odds!, second.odds!, boundary);
  return { gap, size,
    preference: difference * 100n < 30n * scale ? 'none' : first.odds! < second.odds! ? 'first' : 'second' };
}
export function assessTeams(home: Price, away: Price, boundary = 1.5): TeamAssessment | null {
  const pair = assessPair(home, away, boundary);
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
  orientation: string; category: string; preference: string; side: string; gapSize: string; gapOrder: string };
export type FixtureGapSettings = { boundary: number; min: number | null; max: number | null };
export type FixtureGapInput = { boundary: string; min: string; max: string };

export function parseFixtureGapSettings(input: FixtureGapInput):
  | { status: 'valid'; settings: FixtureGapSettings }
  | { status: 'invalid'; reason: string } {
  const parse = (value: string): number | null => {
    const text = value.trim();
    if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return null;
    const number = Number(text);
    return Number.isFinite(number) ? number : null;
  };
  const boundary = parse(input.boundary);
  if (boundary == null) return { status: 'invalid', reason: 'Enter a non-negative small / big gap boundary.' };
  const min = input.min.trim() ? parse(input.min) : null;
  if (input.min.trim() && min == null) return { status: 'invalid', reason: 'Enter a non-negative minimum team gap.' };
  const max = input.max.trim() ? parse(input.max) : null;
  if (input.max.trim() && max == null) return { status: 'invalid', reason: 'Enter a non-negative maximum team gap.' };
  if (min != null && max != null && min > max) {
    return { status: 'invalid', reason: 'Minimum team gap cannot exceed the maximum.' };
  }
  return { status: 'valid', settings: { boundary, min, max } };
}

function compareGapTo(first: number, second: number, limit: number): number {
  const { difference, scale } = gapParts(first, second);
  const [digits, places] = decimal(limit);
  const delta = difference * 10n ** BigInt(places) - digits * scale;
  return delta < 0n ? -1 : delta > 0n ? 1 : 0;
}

export function filterBookFixtures(
  fixtures: BookFixture[], filters: FixtureFilters,
  gapSettings: FixtureGapSettings = { boundary: 1.5, min: null, max: null },
): BookFixture[] {
  const selected = fixtures.map((fixture, index) => ({
    fixture, index, result: assessTeams(fixture.home, fixture.away, gapSettings.boundary),
  })).filter(({ fixture, result }) => {
    return (!filters.query || fixture.name.toLowerCase().includes(filters.query.trim().toLowerCase())) &&
      (!filters.country || fixture.country === filters.country) &&
      (!filters.competition || fixture.competition === filters.competition) &&
      (!filters.group || String(result?.group) === filters.group) &&
      (!filters.orientation || result?.orientation === filters.orientation) &&
      (!filters.category || result?.category === filters.category) &&
      (!filters.preference || (filters.preference === 'unavailable' ? !result
        : filters.preference === 'none' ? result?.preference === 'none' : result != null && result.preference !== 'none')) &&
      (!filters.side || result?.preference === filters.side) &&
      (!filters.gapSize || result?.size === filters.gapSize) &&
      (gapSettings.min == null || (result != null &&
        compareGapTo(fixture.home.odds!, fixture.away.odds!, gapSettings.min) >= 0)) &&
      (gapSettings.max == null || (result != null &&
        compareGapTo(fixture.home.odds!, fixture.away.odds!, gapSettings.max) <= 0));
  });
  if (filters.gapOrder === 'asc' || filters.gapOrder === 'desc') {
    const direction = filters.gapOrder === 'asc' ? 1 : -1;
    selected.sort((left, right) => {
      if (!left.result || !right.result) return left.result ? -1 : right.result ? 1 : left.index - right.index;
      const a = gapParts(left.fixture.home.odds!, left.fixture.away.odds!);
      const b = gapParts(right.fixture.home.odds!, right.fixture.away.odds!);
      const delta = a.difference * b.scale - b.difference * a.scale;
      return (delta < 0n ? -1 : delta > 0n ? 1 : 0) * direction || left.index - right.index;
    });
  }
  return selected.map(({ fixture }) => fixture);
}
