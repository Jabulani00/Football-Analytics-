/**
 * Fixture recommendation + risk engine.
 *
 * Fuses the model prediction with table position, market odds and (for in-play
 * games) the current score + minute, then:
 *   • generates candidate bets across market MODULES (result / goals / btts),
 *   • rates each by a risk-adjusted score,
 *   • recommends the single best outcome, and
 *   • enumerates every RISK factor behind it.
 *
 * "Interchange" on live games: candidate probabilities are recomputed from the
 * current scoreline using a remaining-time Poisson, so the recommendation
 * shifts as the match unfolds.
 *
 * Pure (no network, no React) → unit-testable. Relative import of the (also
 * pure) prediction engine keeps this runnable under tsx as well as Metro.
 */
import { buildScoreMatrix, type FixturePrediction } from '../services/predictionEngine';

/** Market modules a user can filter recommendations by. */
export type MarketModule = 'result' | 'goals' | 'btts';
export const MARKET_MODULES: MarketModule[] = ['result', 'goals', 'btts'];

export type RiskLevel = 'low' | 'medium' | 'high';

export type RecCandidate = {
  module: MarketModule;
  market: string; // e.g. 'Match Result'
  selection: string; // e.g. 'Aberdeen win'
  probability: number; // 0..1 (live-adjusted when in-play)
  /** Model prob − odds-implied prob; positive = value. null when no odds. */
  edge: number | null;
  /** Risk-adjusted ranking score (higher = better recommendation). */
  score: number;
};

export type RiskFactor = {
  label: string;
  severity: RiskLevel;
  detail: string;
};

export type FixtureRecommendation = {
  /** The single best outcome, or null if nothing qualifies. */
  best: RecCandidate | null;
  /** All candidates, best first. */
  candidates: RecCandidate[];
  riskLevel: RiskLevel;
  /** 0 (safe) … 100 (very risky). */
  riskScore: number;
  factors: RiskFactor[];
  /** Effective 1X2 after any live adjustment (for display). */
  effective: { homeWin: number; draw: number; awayWin: number };
};

export type OddsInput = {
  home?: number;
  draw?: number;
  away?: number;
  over25?: number;
  under25?: number;
  over15?: number;
  bttsYes?: number;
  bttsNo?: number;
};

export type LiveInput = {
  minute: number;
  homeGoals: number;
  awayGoals: number;
};

export type RecInput = {
  prediction: FixturePrediction;
  homeName: string;
  awayName: string;
  homePosition?: number | null;
  awayPosition?: number | null;
  odds?: OddsInput | null;
  live?: LiveInput | null;
  /** Restrict candidate markets. Defaults to all market modules. */
  modules?: MarketModule[];
};

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

// ---------------------------------------------------------------------------
// Live adjustment — recompute market probabilities from the current scoreline.
// ---------------------------------------------------------------------------

type EffectiveProbs = {
  homeWin: number;
  draw: number;
  awayWin: number;
  over15: number;
  over25: number;
  over35: number;
  btts: number;
};

function baseProbs(p: FixturePrediction): EffectiveProbs {
  return {
    homeWin: p.homeWin,
    draw: p.draw,
    awayWin: p.awayWin,
    over15: p.over15,
    over25: p.over25,
    over35: p.over35,
    btts: p.btts,
  };
}

/**
 * Blend the current score with a remaining-time Poisson for the goals still to
 * come (expected goals scaled by the fraction of the match left).
 */
function liveProbs(p: FixturePrediction, live: LiveInput): EffectiveProbs {
  const minutesLeft = Math.max(0, Math.min(90, 90 - live.minute));
  const frac = minutesLeft / 90;
  const m = buildScoreMatrix(p.expectedHome * frac, p.expectedAway * frac);

  const hg = live.homeGoals;
  const ag = live.awayGoals;
  let homeWin = 0;
  let draw = 0;
  let awayWin = 0;
  let over15 = 0;
  let over25 = 0;
  let over35 = 0;
  let btts = 0;

  m.grid.forEach((row, i) =>
    row.forEach((prob, j) => {
      const fh = hg + i;
      const fa = ag + j;
      if (fh > fa) homeWin += prob;
      else if (fh === fa) draw += prob;
      else awayWin += prob;
      const total = fh + fa;
      if (total >= 2) over15 += prob;
      if (total >= 3) over25 += prob;
      if (total >= 4) over35 += prob;
      if (fh >= 1 && fa >= 1) btts += prob;
    }),
  );

  return {
    homeWin: clamp01(homeWin),
    draw: clamp01(draw),
    awayWin: clamp01(awayWin),
    over15: clamp01(over15),
    over25: clamp01(over25),
    over35: clamp01(over35),
    btts: clamp01(btts),
  };
}

// ---------------------------------------------------------------------------
// Candidate generation
// ---------------------------------------------------------------------------

const impliedProb = (odds?: number): number | null =>
  odds && odds > 1 ? clamp01(1 / odds) : null;

const edgeOf = (prob: number, odds?: number): number | null => {
  const imp = impliedProb(odds);
  return imp == null ? null : prob - imp;
};

function resultCandidates(
  eff: EffectiveProbs,
  input: RecInput,
): Omit<RecCandidate, 'score'>[] {
  const { homeName, awayName, odds } = input;
  const out: Omit<RecCandidate, 'score'>[] = [];

  // Straight 1X2 — the single most likely outcome.
  const trio: { sel: string; p: number; o?: number }[] = [
    { sel: `${homeName} win`, p: eff.homeWin, o: odds?.home },
    { sel: 'Draw', p: eff.draw, o: odds?.draw },
    { sel: `${awayName} win`, p: eff.awayWin, o: odds?.away },
  ].sort((a, b) => b.p - a.p);
  out.push({
    module: 'result',
    market: 'Match Result',
    selection: trio[0].sel,
    probability: trio[0].p,
    edge: edgeOf(trio[0].p, trio[0].o),
  });

  // Double chance — the safer two-way cover (drop the least likely outcome).
  const dcOptions = [
    { sel: `${homeName} or Draw (1X)`, p: eff.homeWin + eff.draw },
    { sel: `${homeName} or ${awayName} (12)`, p: eff.homeWin + eff.awayWin },
    { sel: `Draw or ${awayName} (X2)`, p: eff.draw + eff.awayWin },
  ].sort((a, b) => b.p - a.p);
  out.push({
    module: 'result',
    market: 'Double Chance',
    selection: dcOptions[0].sel,
    probability: clamp01(dcOptions[0].p),
    edge: null,
  });

  return out;
}

function goalsCandidates(
  eff: EffectiveProbs,
  odds?: OddsInput | null,
): Omit<RecCandidate, 'score'>[] {
  const overIsMoreLikely = eff.over25 >= 0.5;
  return [
    {
      module: 'goals' as const,
      market: 'Total Goals',
      selection: 'Over 1.5',
      probability: eff.over15,
      edge: edgeOf(eff.over15, odds?.over15),
    },
    overIsMoreLikely
      ? {
          module: 'goals' as const,
          market: 'Total Goals',
          selection: 'Over 2.5',
          probability: eff.over25,
          edge: edgeOf(eff.over25, odds?.over25),
        }
      : {
          module: 'goals' as const,
          market: 'Total Goals',
          selection: 'Under 2.5',
          probability: clamp01(1 - eff.over25),
          edge: edgeOf(clamp01(1 - eff.over25), odds?.under25),
        },
  ];
}

function bttsCandidates(
  eff: EffectiveProbs,
  odds?: OddsInput | null,
): Omit<RecCandidate, 'score'>[] {
  const yes = eff.btts >= 0.5;
  return [
    yes
      ? {
          module: 'btts' as const,
          market: 'Both Teams To Score',
          selection: 'Yes',
          probability: eff.btts,
          edge: edgeOf(eff.btts, odds?.bttsYes),
        }
      : {
          module: 'btts' as const,
          market: 'Both Teams To Score',
          selection: 'No',
          probability: clamp01(1 - eff.btts),
          edge: edgeOf(clamp01(1 - eff.btts), odds?.bttsNo),
        },
  ];
}

// ---------------------------------------------------------------------------
// Risk factors
// ---------------------------------------------------------------------------

const SEVERITY_PENALTY: Record<RiskLevel, number> = { low: 5, medium: 12, high: 22 };

function assessRisk(
  eff: EffectiveProbs,
  input: RecInput,
): { factors: RiskFactor[]; riskScore: number; riskLevel: RiskLevel } {
  const factors: RiskFactor[] = [];
  const { prediction, homePosition, awayPosition, odds, live } = input;

  // Decisiveness of the result market (top vs second) drives the base risk.
  const sorted = [eff.homeWin, eff.draw, eff.awayWin].sort((a, b) => b - a);
  const decisiveness = sorted[0] - sorted[1];
  const baseRisk = (1 - clamp01(decisiveness / 0.5)) * 50;

  if (prediction.lowData) {
    factors.push({
      label: 'Limited data',
      severity: 'high',
      detail: 'Few prior matches — the model is running on a small sample.',
    });
  }
  if (decisiveness < 0.12) {
    factors.push({
      label: 'Coin-flip result',
      severity: 'high',
      detail: 'No clear favourite — the top two outcomes are near-level.',
    });
  } else if (decisiveness < 0.22) {
    factors.push({
      label: 'Tight match',
      severity: 'medium',
      detail: 'A modest edge only — the result is far from certain.',
    });
  }
  if (eff.draw >= 0.33) {
    factors.push({
      label: 'Draw very live',
      severity: 'medium',
      detail: `The draw is a real threat (${Math.round(eff.draw * 100)}%).`,
    });
  }

  // Table contradiction: the favoured team sits well below its opponent.
  if (homePosition != null && awayPosition != null && homePosition > 0 && awayPosition > 0) {
    const favHome = eff.homeWin > eff.awayWin;
    const gap = favHome ? homePosition - awayPosition : awayPosition - homePosition;
    if (gap >= 6) {
      factors.push({
        label: 'Against the table',
        severity: 'medium',
        detail: `The favoured side is ${gap} places lower in the table.`,
      });
    }
  }

  // Odds value: the FAVOURED outcome's price implies a higher chance than the
  // model sees — i.e. the bet you'd actually back offers no value.
  if (odds) {
    const favoured = [
      { p: eff.homeWin, o: odds.home },
      { p: eff.draw, o: odds.draw },
      { p: eff.awayWin, o: odds.away },
    ].sort((a, b) => b.p - a.p)[0];
    const favEdge = edgeOf(favoured.p, favoured.o);
    if (favEdge != null && favEdge <= -0.05) {
      factors.push({
        label: 'No odds value',
        severity: 'medium',
        detail: 'The favourite’s price implies less value than the model sees.',
      });
    }
  }

  // Live volatility: a level game with plenty of time left is unstable.
  if (live) {
    const minutesLeft = Math.max(0, 90 - live.minute);
    if (live.homeGoals === live.awayGoals && minutesLeft > 20) {
      factors.push({
        label: 'Live: level & open',
        severity: 'medium',
        detail: `Scores level with ~${minutesLeft} minutes to play.`,
      });
    }
  }

  const penalties = factors.reduce((s, f) => s + SEVERITY_PENALTY[f.severity], 0);
  const riskScore = Math.round(Math.max(0, Math.min(100, baseRisk + penalties)));

  // Level is the worst of the threshold band and any high/medium factor present.
  let riskLevel: RiskLevel = riskScore >= 66 ? 'high' : riskScore >= 33 ? 'medium' : 'low';
  if (factors.some((f) => f.severity === 'high')) riskLevel = 'high';
  else if (riskLevel === 'low' && factors.some((f) => f.severity === 'medium')) riskLevel = 'medium';

  return { factors, riskScore, riskLevel };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function buildRecommendation(input: RecInput): FixtureRecommendation {
  const eff = input.live ? liveProbs(input.prediction, input.live) : baseProbs(input.prediction);
  const modules = input.modules && input.modules.length > 0 ? input.modules : MARKET_MODULES;

  const raw: Omit<RecCandidate, 'score'>[] = [];
  if (modules.includes('result')) raw.push(...resultCandidates(eff, input));
  if (modules.includes('goals')) raw.push(...goalsCandidates(eff, input.odds));
  if (modules.includes('btts')) raw.push(...bttsCandidates(eff, input.odds));

  const { factors, riskScore, riskLevel } = assessRisk(eff, input);
  const riskUnit = riskScore / 100;

  const candidates: RecCandidate[] = raw
    .map((c) => {
      // Safer, higher-probability picks rank first; value nudges up, poor value down.
      const valueBonus =
        c.edge == null ? 0 : c.edge > 0 ? Math.min(0.08, c.edge * 0.5) : Math.max(-0.08, c.edge * 0.5);
      const score = clamp01(c.probability * (1 - 0.25 * riskUnit) + valueBonus);
      return { ...c, score };
    })
    .sort((a, b) => b.score - a.score);

  return {
    best: candidates[0] ?? null,
    candidates,
    riskLevel,
    riskScore,
    factors,
    effective: { homeWin: eff.homeWin, draw: eff.draw, awayWin: eff.awayWin },
  };
}
