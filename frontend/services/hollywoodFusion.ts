/**
 * Turn Hollywoodbets events into odds-fusion rows: decimal 1X2 odds, the book's
 * de-vigged "fair" probabilities, and — when a model probability is supplied —
 * the betting edge (EV %). Also builds Share-A-Bet legs for the chosen pick.
 *
 * Pure (no network, no React) → unit-testable.
 */
import {
  BET_TYPE,
  decimal1x2,
  toShareLeg,
  type HbEvent,
  type ShareLeg,
} from '@/services/hollywoodbets';
import { devig1x2, evPct } from '@/services/oddsMath';

export type FusionPick = '1' | 'X' | '2';

export type FusionRow = {
  eventId: number;
  fixture: string; // "Home vs Away"
  kickoff: string; // ISO
  decimal: { home: number; draw: number; away: number };
  /** De-vigged (overround-removed) implied probabilities, 0–1. */
  fair: { home: number; draw: number; away: number };
  /** Best pick by the model (or by the book's own fair prices if no model). */
  pick: FusionPick;
  /** EV % of the pick. Uses model probs when provided, else the book's fair prob. */
  edgePct: number;
  /** Share-A-Bet leg for the pick, ready for createShareABet(). */
  hbLeg: ShareLeg | null;
};

const PICK_KEY: Record<FusionPick, 'home' | 'draw' | 'away'> = { '1': 'home', X: 'draw', '2': 'away' };
const PICK_NUMBER: Record<FusionPick, number> = { '1': 1, X: 2, '2': 3 };

/**
 * @param modelProbFor optional: fixture → {home,draw,away} model probabilities.
 *        When present the pick/edge use the model; otherwise they fall back to
 *        the book's own de-vigged prices (edge is ~0 by construction).
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

    const probs = modelProbFor?.(event) ?? fair;
    const pick = (['1', 'X', '2'] as FusionPick[]).reduce((best, k) =>
      probs[PICK_KEY[k]] > probs[PICK_KEY[best]] ? k : best,
    );

    const price = decimal[PICK_KEY[pick]];
    const edge = evPct(probs[PICK_KEY[pick]], price);

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
      pick,
      edgePct: edge,
      hbLeg,
    });
  }
  return rows;
}
