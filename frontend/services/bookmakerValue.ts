import type { PinnacleFixtureOdds, PinnacleMarketOdds } from '@/services/pinnacleOdds';

type MarketFamily = 'result' | 'btts' | 'totals';
type MarketPeriod = 'ft' | 'h1' | 'h2';

export type SupportedSelection = {
  family: MarketFamily;
  period: MarketPeriod;
  line: number | null;
  outcome: string;
  groupKey: string;
  key: string;
};

function normalizedText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[_/]+/g, ' ').replace(/[^a-z0-9.]+/g, ' ').trim().replace(/\s+/g, ' ');
}

/** Only markets with known, mutually exclusive and exhaustive outcomes are supported. */
export function supportedSelection(market: string, selection: string): SupportedSelection | null {
  if (/[+-]\s*\d/.test(market) || /[+-]\s*\d/.test(selection)) return null;
  let title = normalizedText(market);
  const choice = normalizedText(selection);
  if (!title || !choice) return null;

  const periodPattern = '(first half|1st half|half time|ht|second half|2nd half|full time|ft)';
  const periodOf = (value: string): MarketPeriod =>
    /^(first half|1st half|half time|ht)$/.test(value) ? 'h1'
      : /^(second half|2nd half)$/.test(value) ? 'h2' : 'ft';
  let period: MarketPeriod = 'ft';
  if (new RegExp(`^${periodPattern}$`).test(title)) {
    period = periodOf(title);
    title = 'result';
  } else {
    const prefix = new RegExp(`^${periodPattern} `).exec(title);
    if (prefix) {
      period = periodOf(prefix[1]);
      title = title.slice(prefix[0].length);
    }
    const suffix = new RegExp(` ${periodPattern}$`).exec(title);
    if (suffix) {
      const suffixPeriod = periodOf(suffix[1]);
      if (prefix && suffixPeriod !== period) return null;
      period = suffixPeriod;
      title = title.slice(0, suffix.index);
    }
  }

  let family: MarketFamily;
  let outcome: string;
  let line: number | null = null;
  if (/^(result|match result|1x2|win draw win|match odds|home win|away win|draw win)$/.test(title)) {
    family = 'result';
    const choices: Record<string, string> = {
      home: 'home', 'home win': 'home', '1': 'home',
      draw: 'draw', 'draw win': 'draw', x: 'draw',
      away: 'away', 'away win': 'away', '2': 'away',
    };
    outcome = choices[choice];
    if (!outcome || (title.endsWith(' win') && title !== `${outcome} win`)) return null;
  } else if (/^(btts|both teams to score)$/.test(title)) {
    family = 'btts';
    if (!/^(yes|no|y|n)$/.test(choice)) return null;
    outcome = choice === 'yes' || choice === 'y' ? 'yes' : 'no';
  } else {
    const total = /^(?:total goals?|match goals?|goals?|additional totals|goals? over under|over under goals?|total goals? over under)(?: (\d+(?:\.\d+)?))?$/.exec(title);
    const side = /^(over|under)(?: (\d+(?:\.\d+)?))?$/.exec(choice);
    if (!total || !side) return null;
    const marketLine = total[1] == null ? null : Number(total[1]);
    const selectionLine = side[2] == null ? null : Number(side[2]);
    if (marketLine != null && selectionLine != null && marketLine !== selectionLine) return null;
    line = selectionLine ?? marketLine;
    if (line == null || !Number.isFinite(line) || line < 0 ||
      Number.isInteger(line) || !Number.isInteger(line * 2)) return null;
    family = 'totals';
    outcome = side[1];
  }
  const groupKey = `${family}:${period}${line == null ? '' : `:${line}`}`;
  return { family, period, line, outcome, groupKey, key: `${groupKey}:${outcome}` };
}

export type ReferenceMetrics = {
  probability: number;
  fairOdds: number | null;
  impliedBookProbability: number;
  valuePp: number;
  shortfallPp: number;
  benchmarkEvPct: number;
  shortfallUnitsPerUnit: number;
  oddsDifference: number | null;
};

export function compareReference(bookOdds: number, probability: number): ReferenceMetrics | null {
  if (!Number.isFinite(bookOdds) || bookOdds < 1 ||
    !Number.isFinite(probability) || probability < 0 || probability > 1) return null;
  const impliedBookProbability = 1 / bookOdds;
  const valuePp = 100 * (probability - impliedBookProbability);
  const benchmarkEvPct = 100 * (probability * bookOdds - 1);
  if (!Number.isFinite(valuePp) || !Number.isFinite(benchmarkEvPct)) return null;
  const fairOdds = probability > 0 ? 1 / probability : null;
  if (fairOdds != null && !Number.isFinite(fairOdds)) return null;
  return {
    probability, fairOdds, impliedBookProbability, valuePp,
    shortfallPp: Math.min(valuePp, 0),
    benchmarkEvPct,
    shortfallUnitsPerUnit: Math.max(0, -benchmarkEvPct / 100),
    oddsDifference: fairOdds == null ? null : bookOdds - fairOdds,
  };
}

export type PinnacleReference = {
  probability: number;
  odds: number;
  fairOdds: number;
  groupKey: string;
  outcome: string;
  fixtureId: number;
  marketId: number | null;
  marketKey: string;
  outcomes: { outcome: string; odds: number }[];
  capturedAt: string;
};

export type MachineReference = {
  probability: number;
  source: string;
  version: string;
  capturedAt: string;
};

export type MachineReferenceInput = {
  probabilityPct: string;
  source: string;
  version: string;
  capturedAt: string;
};

export function parseMachineReference(input: MachineReferenceInput):
  | { status: 'empty' }
  | { status: 'invalid'; reason: string }
  | { status: 'available'; reference: MachineReference } {
  const { probabilityPct, source, version, capturedAt } = input;
  if (![probabilityPct, source, version, capturedAt].some((value) => value.trim())) return { status: 'empty' };
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(probabilityPct.trim())) {
    return { status: 'invalid', reason: 'Enter an MM probability between 0 and 100%.' };
  }
  const probability = Number(probabilityPct) / 100;
  if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
    return { status: 'invalid', reason: 'Enter an MM probability between 0 and 100%.' };
  }
  if (!source.trim() || !version.trim()) {
    return { status: 'invalid', reason: 'Enter the MM source and model version.' };
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/i.test(capturedAt.trim()) ||
    !Number.isFinite(Date.parse(capturedAt))) {
    return { status: 'invalid', reason: 'Enter the model capture time as ISO 8601 with a time zone.' };
  }
  return { status: 'available', reference: {
    probability, source: source.trim(), version: version.trim(), capturedAt: new Date(capturedAt).toISOString(),
  } };
}

export type PinnacleQuote = {
  odds: number;
  fixtureId: number;
  marketKey: string;
  capturedAt: string;
};

export type PinnacleReferenceResult =
  | { status: 'available'; reference: PinnacleReference; kickoffDeltaSeconds: number }
  | { status: 'unavailable'; reason: string; quote?: PinnacleQuote };

function fairMarket(
  market: PinnacleMarketOdds,
  target: SupportedSelection,
): { probability: number; odds: number; outcomes: { outcome: string; odds: number }[] } | null {
  const expected = target.family === 'result' ? ['home', 'draw', 'away']
    : target.family === 'btts' ? ['yes', 'no'] : ['over', 'under'];
  const prices = new Map<string, number>();
  const seen = new Set<string>();
  for (const selection of market.selections) {
    const parsed = supportedSelection(market.marketName, selection.label);
    if (selection.current == null && parsed?.groupKey !== target.groupKey) continue;
    if (!parsed) return null;
    if (parsed.groupKey !== target.groupKey) {
      if (target.family === 'totals' && parsed.family === 'totals' &&
        parsed.period === target.period && parsed.line !== target.line) continue;
      return null;
    }
    if (!expected.includes(parsed.outcome) || seen.has(parsed.outcome)) return null;
    seen.add(parsed.outcome);
    if (selection.current == null) continue;
    if (!Number.isFinite(selection.current) || selection.current < 1) return null;
    prices.set(parsed.outcome, selection.current);
  }
  if (prices.size !== expected.length || expected.some((outcome) => !prices.has(outcome))) return null;
  const outcomes = expected.map((outcome) => ({ outcome, odds: prices.get(outcome)! }));
  const totalImplied = outcomes.reduce((sum, item) => sum + 1 / item.odds, 0);
  const odds = prices.get(target.outcome);
  if (odds == null || !Number.isFinite(totalImplied) || totalImplied <= 0) return null;
  return { probability: (1 / odds) / totalImplied, odds, outcomes };
}

/** All prices used for reference 1 must belong to one supported Pinnacle market capture. */
export function findPinnacleReference(
  offer: { eventId: number; kickoff: string; marketName: string; selection: string },
  fixtures: readonly PinnacleFixtureOdds[],
  capturedAt: string | null,
): PinnacleReferenceResult {
  const target = supportedSelection(offer.marketName, offer.selection);
  if (!target) return { status: 'unavailable', reason: 'Unsupported or ambiguous market, period, outcome, or line.' };
  if (!capturedAt || !Number.isFinite(Date.parse(capturedAt))) {
    return { status: 'unavailable', reason: 'Pinnacle snapshot capture time is unavailable.' };
  }
  const matches = fixtures.filter((fixture) => fixture.eventId === offer.eventId);
  if (matches.length !== 1) {
    return { status: 'unavailable', reason: matches.length ? 'Ambiguous Pinnacle fixture match.' : 'No Pinnacle fixture match.' };
  }
  const fixture = matches[0];
  const kickoff = Date.parse(offer.kickoff) / 1000;
  if (!Number.isFinite(kickoff) || fixture.oddAlertsKickoffUnix == null ||
    !Number.isFinite(fixture.oddAlertsKickoffUnix)) {
    return { status: 'unavailable', reason: 'Fixture kickoff is unavailable.' };
  }
  const kickoffDeltaSeconds = Math.abs(kickoff - fixture.oddAlertsKickoffUnix);
  if (kickoffDeltaSeconds > 5 * 60) {
    return { status: 'unavailable', reason: 'Fixture kickoffs differ by more than five minutes.' };
  }
  const candidates = fixture.markets.filter((market) => market.selections.some((selection) =>
    selection.current != null &&
    supportedSelection(market.marketName, selection.label)?.key === target.key));
  if (candidates.length !== 1) {
    return { status: 'unavailable', reason: candidates.length
      ? 'More than one Pinnacle market matches this selection.'
      : 'No exact Pinnacle selection in this snapshot.' };
  }
  const market = candidates[0];
  const selected = market.selections.filter((selection) =>
    supportedSelection(market.marketName, selection.label)?.key === target.key);
  if (selected.length !== 1 || selected[0].current == null ||
    !Number.isFinite(selected[0].current) || selected[0].current < 1) {
    return { status: 'unavailable', reason: 'Pinnacle selection price is ambiguous or invalid.' };
  }
  const quote = {
    odds: selected[0].current, fixtureId: fixture.oddAlertsFixtureId,
    marketKey: market.marketKey, capturedAt,
  };
  const fair = fairMarket(market, target);
  if (!fair || fair.probability <= 0 || !Number.isFinite(1 / fair.probability)) {
    return { status: 'unavailable', reason: 'Pinnacle market is incomplete, ambiguous, or has invalid prices.', quote };
  }
  return {
    status: 'available',
    reference: {
      probability: fair.probability, odds: fair.odds, fairOdds: 1 / fair.probability,
      groupKey: target.groupKey, outcome: target.outcome,
      fixtureId: fixture.oddAlertsFixtureId, marketId: market.marketId,
      marketKey: market.marketKey, outcomes: fair.outcomes, capturedAt,
    },
    kickoffDeltaSeconds,
  };
}
