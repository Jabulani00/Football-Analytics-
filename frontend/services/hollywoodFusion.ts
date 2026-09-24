/**
 * Turn Hollywoodbets events into odds-fusion rows: decimal 1X2 odds, the book's
 * de-vigged "fair" probabilities, and — when a model probability is supplied —
 * the betting edge (EV %). Also builds Share-A-Bet legs for the chosen pick.
 *
 * Pure (no network, no React) → unit-testable.
 */
import {
  BET_TYPE,
  bttsDecimal,
  decimal1x2,
  isMarketOpenStatus,
  totalsDecimal,
  toShareLeg,
  type HbBetType,
  type HbEvent,
  type HbMarket,
  type ShareLeg,
} from '@/services/hollywoodTypes';
import { devig1x2, devigBinary, evPct } from '@/services/oddsMath';
import {
  assessValueSelection,
  type ValueAssessment,
} from '@/services/hollywoodValueRules';

export type FusionPick = '1' | 'X' | '2';

export type FusionRow = {
  eventId: number;
  fixture: string; // "Home vs Away"
  kickoff: string; // ISO
  decimal: { home: number; draw: number; away: number };
  /** De-vigged (overround-removed) implied probabilities, 0–1. */
  fair: { home: number; draw: number; away: number };
  /** Our model's probabilities, or null when we had none for this fixture. */
  modelProb: { home: number; draw: number; away: number } | null;
  hasModel: boolean;
  /** Best pick — by the model when we have one, else by the book's fair prices. */
  pick: FusionPick;
  pickSource: 'model' | 'book';
  /** The selection the book itself favours ("iklomba bani" in the notes). */
  bookPick: FusionPick;
  /**
   * Whether we and the book land on the same selection, in the notes' own terms
   * (p82): `umbono_munye` = one opinion, `imibono_ihlukene` = different opinions.
   * Null when there is no model, because with nothing to compare there is no
   * opinion to agree or disagree with. Per p80 a disagreement is not an error —
   * the machine is authoritative and the gap is an underdog opportunity.
   */
  agreement: 'umbono_munye' | 'imibono_ihlukene' | null;
  /** EV % of the pick against our model. Null when we have no model — see below. */
  edgePct: number | null;
  /** Share-A-Bet leg for the pick, ready for createShareABet(). */
  hbLeg: ShareLeg | null;
};

const PICK_KEY: Record<FusionPick, 'home' | 'draw' | 'away'> = { '1': 'home', X: 'draw', '2': 'away' };
const PICK_NUMBER: Record<FusionPick, number> = { '1': 1, X: 2, '2': 3 };

// ---- Per-market fusion ------------------------------------------------------

/**
 * What our model can price. 1X2 is always present; the rest come from the
 * OddAlerts probability payload and are optional because not every fixture
 * publishes them.
 */
export type ModelProbs = {
  home: number;
  draw: number;
  away: number;
  btts?: number;
  over05?: number;
  over15?: number;
  over25?: number;
  over35?: number;
};

/** One selection of one market, priced by the book and (maybe) by us. */
export type MarketRow = {
  eventId: number;
  fixture: string;
  kickoff: string;
  betTypeId: number;
  marketName: string;
  selection: string;
  marketNumber: number;
  decimal: number;
  /** De-vigged book probability, when both sides of the market are known. */
  fair: number | null;
  modelProb: number | null;
  hasModel: boolean;
  edgePct: number | null;
  /** Whether we and the book favour this selection alike — see `FusionRow`. */
  agreement: 'umbono_munye' | 'imibono_ihlukene' | null;
  /** PDF-specific range/delta/ratio assessment; separate from generic EV. */
  value: ValueAssessment | null;
  /** Booking metadata, when the caller supplies tournament context. */
  hbLeg: ShareLeg | null;
};

/** Read a model probability for a named two-way selection, or null. */
function twoWayModel(model: ModelProbs, key: keyof ModelProbs, isPositive: boolean): number | null {
  const p = model[key];
  if (typeof p !== 'number' || Number.isNaN(p)) return null;
  return isPositive ? p : 1 - p;
}

/**
 * Fusion rows for EVERY market we can actually judge.
 *
 * Deliberately limited to markets our model prices — 1X2, BTTS and the
 * Over/Under 0.5/1.5/2.5/3.5 lines. The book offers far more (correct score, HT/FT,
 * corners…), but emitting rows for those would mean an `edgePct` of null on
 * every one, which is noise dressed as analysis. They remain browsable and
 * bettable in the Hollywoodbets panel; this is the value view.
 *
 * Over/Under lines are matched by the LINE PARSED FROM THE SELECTION NAME, not
 * the selection number, because the book numbers overs 1–5 and unders 16–20 and
 * splits the market across groups.
 */
export function buildMarketRows(
  event: HbEvent,
  model: ModelProbs | null,
  ctx?: { tournamentId: number; tournamentName: string; countryId: number },
): MarketRow[] {
  const rows: MarketRow[] = [];
  const base = { eventId: event.id, fixture: event.name, kickoff: event.startTime };

  const push = (
    betTypeId: number,
    marketName: string,
    sel: { number: number; name: string; decimal: number },
    fair: number | null,
    modelProb: number | null,
    modelFavours: boolean | null,
    bookFavours: boolean | null,
    marketOdds: number[],
  ) => {
    const value =
      modelProb != null && fair != null && modelFavours != null && bookFavours != null
        ? assessValueSelection({
            modelProb,
            bookFairProb: fair,
            decimalOdds: sel.decimal,
            modelFavours,
            bookFavours,
            marketOdds,
          })
        : null;
    const edgePct = value?.expectedValuePct ?? null;
    const source = findOpenSelection(event, betTypeId, sel.number, sel.name);
    rows.push({
      ...base,
      betTypeId,
      marketName,
      selection: sel.name,
      marketNumber: sel.number,
      decimal: sel.decimal,
      fair,
      modelProb,
      hasModel: modelProb != null,
      edgePct,
      agreement: value?.agreement ?? null,
      value,
      hbLeg: ctx && source ? toShareLeg(event, source.betType, source.market, ctx) : null,
    });
  };

  // --- 1X2 -------------------------------------------------------------------
  const ft = decimal1x2(event);
  if (ft) {
    const fair = devig1x2(ft.home, ft.draw, ft.away);
    const bookBest = fair
      ? (['home', 'draw', 'away'] as const).reduce((b, k) => (fair[k] > fair[b] ? k : b), 'home')
      : null;
    const modelBest = model
      ? (['home', 'draw', 'away'] as const).reduce((b, k) => (model[k] > model[b] ? k : b), 'home')
      : null;
    (['home', 'draw', 'away'] as const).forEach((k, i) => {
      push(
        BET_TYPE.FULL_TIME,
        'Full Time',
        { number: i + 1, name: k === 'home' ? 'Home' : k === 'draw' ? 'Draw' : 'Away', decimal: ft[k] },
        fair ? fair[k] : null,
        model ? model[k] : null,
        modelBest == null ? null : modelBest === k,
        bookBest == null ? null : bookBest === k,
        [ft.home, ft.draw, ft.away],
      );
    });
  }

  // --- BTTS ------------------------------------------------------------------
  const btts = bttsDecimal(event);
  if (btts) {
    const fairYes = devigBinary(btts.yes, btts.no);
    for (const [name, dec, positive, num] of [
      ['YES', btts.yes, true, 1],
      ['NO', btts.no, false, 2],
    ] as const) {
      const mp = model ? twoWayModel(model, 'btts', positive) : null;
      push(
        BET_TYPE.BTTS,
        'Both Teams to Score',
        { number: num, name, decimal: dec },
        fairYes == null ? null : positive ? fairYes : 1 - fairYes,
        mp,
        mp == null ? null : mp > 0.5,
        fairYes == null ? null : positive ? fairYes > 0.5 : fairYes < 0.5,
        [btts.yes, btts.no],
      );
    }
  }

  // --- Over/Under ------------------------------------------------------------
  const LINE_KEY: Record<string, keyof ModelProbs> = {
    '0.5': 'over05',
    '1.5': 'over15',
    '2.5': 'over25',
    '3.5': 'over35',
  };
  const totals = totalsDecimal(event);
  for (const [line, sides] of Object.entries(totals)) {
    const key = LINE_KEY[line];
    if (!key || sides.over == null || sides.under == null) continue;
    const fairOver = devigBinary(sides.over, sides.under);
    for (const [name, dec, positive, num] of [
      [`OVER ${line}`, sides.over, true, 1],
      [`UNDER ${line}`, sides.under, false, 2],
    ] as const) {
      const mp = model ? twoWayModel(model, key, positive) : null;
      push(
        BET_TYPE.TOTALS,
        `Total Goals ${line}`,
        { number: num, name, decimal: dec },
        fairOver == null ? null : positive ? fairOver : 1 - fairOver,
        mp,
        mp == null ? null : mp > 0.5,
        fairOver == null ? null : positive ? fairOver > 0.5 : fairOver < 0.5,
        [sides.over, sides.under],
      );
    }
  }

  return rows;
}

/** Market rows across a whole tournament, best edges first. */
export function buildAllMarketRows(
  events: HbEvent[],
  modelFor?: (event: HbEvent) => ModelProbs | null,
  ctx?: { tournamentId: number; tournamentName: string; countryId: number },
): MarketRow[] {
  const rows = events.flatMap((e) => buildMarketRows(e, modelFor?.(e) ?? null, ctx));
  // Rows we can judge lead; unjudged rows keep their natural order behind them.
  return rows.sort((a, b) => (b.edgePct ?? -Infinity) - (a.edgePct ?? -Infinity));
}

function findOpenSelection(
  event: HbEvent,
  betTypeId: number,
  marketNumber: number,
  selectionName: string,
): { betType: HbBetType; market: HbMarket } | null {
  for (const betType of event.betTypes) {
    if (betType.id !== betTypeId || !isMarketOpenStatus(betType.status)) continue;
    const market = betType.markets.find(
      (item) =>
        item.number === marketNumber &&
        (betTypeId === BET_TYPE.FULL_TIME ||
          item.name.trim().toLowerCase() === selectionName.trim().toLowerCase()) &&
        isMarketOpenStatus(item.status),
    );
    if (market) return { betType, market };
  }
  return null;
}

/**
 * @param modelProbFor optional: event → our model's {home,draw,away} probabilities.
 *
 * WHY THE NULL MATTERS. Without a model there is nothing to compare the book
 * against: de-vigging the book and then measuring the book against its own fair
 * prices yields an edge of ~0 by construction. Reporting that as "0% edge" reads
 * as "we checked and found no value", which is a different and much stronger
 * claim than "we never checked". So a row built without a model carries
 * `edgePct: null` and `hasModel: false`, and the UI must say so rather than
 * render a number. The pick still falls back to the book's own favourite, which
 * `pickSource` labels.
 */
export function buildFusionRows(
  events: HbEvent[],
  ctx: { tournamentId: number; tournamentName: string; countryId: number },
  modelProbFor?: (event: HbEvent) => { home: number; draw: number; away: number } | null,
): FusionRow[] {
  const rows: FusionRow[] = [];
  for (const event of events) {
    const decimal = decimal1x2(event);
    if (!decimal) continue;
    const fair = devig1x2(decimal.home, decimal.draw, decimal.away);
    if (!fair) continue;

    const modelProb = modelProbFor?.(event) ?? null;
    const probs = modelProb ?? fair;
    const pick = (['1', 'X', '2'] as FusionPick[]).reduce((best, k) =>
      probs[PICK_KEY[k]] > probs[PICK_KEY[best]] ? k : best,
    );

    const price = decimal[PICK_KEY[pick]];
    const edgePct = modelProb ? evPct(modelProb[PICK_KEY[pick]], price) : null;

    // Which selection the book itself is on — the notes' "iklomba bani".
    const bookPick = (['1', 'X', '2'] as FusionPick[]).reduce((best, k) =>
      fair[PICK_KEY[k]] > fair[PICK_KEY[best]] ? k : best,
    );

    // Build the Share-A-Bet leg for the picked outcome.
    const ft = event.betTypes.find((b) => b.id === BET_TYPE.FULL_TIME);
    const market = ft?.markets.find((m) => m.number === PICK_NUMBER[pick]);
    const hbLeg = ft && market ? toShareLeg(event, ft, market, ctx) : null;

    rows.push({
      eventId: event.id,
      fixture: event.name,
      kickoff: event.startTime,
      decimal,
      fair,
      modelProb,
      hasModel: modelProb != null,
      pick,
      pickSource: modelProb ? 'model' : 'book',
      bookPick,
      agreement: modelProb ? (pick === bookPick ? 'umbono_munye' : 'imibono_ihlukene') : null,
      edgePct,
      hbLeg,
    });
  }
  return rows;
}
