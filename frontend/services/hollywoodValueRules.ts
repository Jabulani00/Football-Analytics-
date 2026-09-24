import { evPct } from '@/services/oddsMath';

export type OpinionState = 'umbono_munye' | 'imibono_ihlukene';
export type DeltaBand = 'below' | 'equal' | 'above';
export type MachineConclusion = 'selection' | 'opposite';

export type ValueRuleConfig = {
  /** PDF opposition threshold: T1 - T2 = Δ, with 0.30 as the boundary. */
  oppositionDelta: number;
  /** PDF goal-expectation watch range. */
  rangeMin: number;
  rangeMax: number;
  /** PDF topdog ÷ underdog target and accepted distance around it. */
  ratioTarget: number;
  ratioTolerance: number;
  /** Smallest positive machine-v-book probability gap called value. */
  minBookGap: number;
};

export const DEFAULT_VALUE_RULES: ValueRuleConfig = {
  oppositionDelta: 0.3,
  rangeMin: 0.35,
  rangeMax: 0.65,
  ratioTarget: 0.5,
  ratioTolerance: 0.05,
  minBookGap: 0.05,
};

export type ValueAssessment = {
  machineConclusion: MachineConclusion;
  bookConclusion: MachineConclusion;
  /** The machine stays authoritative; this field records whether the book agrees. */
  agreement: OpinionState;
  /** Signed machine probability minus de-vigged bookmaker probability. */
  machineBookGap: number;
  /** |T1 - T2| where T2 is the opposite probability (1 - T1). */
  oppositionDelta: number;
  deltaBand: DeltaBand;
  /** True when the machine probability sits inside the PDF's 0.35–0.65 watch range. */
  inWatchRange: boolean;
  topdogOdds: number | null;
  underdogOdds: number | null;
  topdogUnderdogRatio: number | null;
  /** PDF instruction to inspect Correct Score / Multiscores near a 0.5 ratio. */
  investigateScores: boolean;
  expectedValuePct: number;
  hasValue: boolean;
  reasons: string[];
};

function validProbability(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function roundedHundredth(value: number): number {
  return Math.round(value * 100) / 100;
}

export function classifyOppositionDelta(
  delta: number,
  threshold = DEFAULT_VALUE_RULES.oppositionDelta,
): DeltaBand {
  const compared = roundedHundredth(delta);
  const boundary = roundedHundredth(threshold);
  if (compared < boundary) return 'below';
  if (compared > boundary) return 'above';
  return 'equal';
}

/**
 * Apply the PDF odds rules to one machine-priced selection.
 *
 * `modelFavours`/`bookFavours` are market-level conclusions. For 1X2 they mean
 * "this is the highest-probability outcome"; for two-way markets they mean the
 * positive side is over 50%. This avoids the false 1X2 agreement where two
 * losing outcomes both compared as `false === false`.
 */
export function assessValueSelection(args: {
  modelProb: number;
  bookFairProb: number;
  decimalOdds: number;
  modelFavours: boolean;
  bookFavours: boolean;
  marketOdds?: number[];
  config?: Partial<ValueRuleConfig>;
}): ValueAssessment | null {
  if (
    !validProbability(args.modelProb) ||
    !validProbability(args.bookFairProb) ||
    !Number.isFinite(args.decimalOdds) ||
    args.decimalOdds < 1
  ) {
    return null;
  }

  const config = { ...DEFAULT_VALUE_RULES, ...args.config };
  const oppositionDelta = Math.abs(args.modelProb - (1 - args.modelProb));
  const deltaBand = classifyOppositionDelta(oppositionDelta, config.oppositionDelta);
  const inWatchRange = args.modelProb >= config.rangeMin && args.modelProb <= config.rangeMax;
  const machineBookGap = args.modelProb - args.bookFairProb;
  const expectedValuePct = evPct(args.modelProb, args.decimalOdds);

  const usableOdds = (args.marketOdds ?? [])
    .filter((value) => Number.isFinite(value) && value >= 1)
    .sort((a, b) => a - b);
  const topdogOdds = usableOdds.length >= 2 ? usableOdds[0] : null;
  const underdogOdds = usableOdds.length >= 2 ? usableOdds.at(-1) ?? null : null;
  const topdogUnderdogRatio =
    topdogOdds != null && underdogOdds != null && underdogOdds > 0
      ? topdogOdds / underdogOdds
      : null;
  const investigateScores =
    topdogUnderdogRatio != null &&
    Math.abs(topdogUnderdogRatio - config.ratioTarget) <= config.ratioTolerance;
  const agreement: OpinionState =
    args.modelFavours === args.bookFavours ? 'umbono_munye' : 'imibono_ihlukene';
  const hasValue = machineBookGap >= config.minBookGap && expectedValuePct > 0;

  const reasons: string[] = [
    `Opposition Δ ${oppositionDelta.toFixed(2)} is ${deltaBand} ${config.oppositionDelta.toFixed(2)}`,
    inWatchRange
      ? `Machine probability is inside ${config.rangeMin.toFixed(2)}–${config.rangeMax.toFixed(2)}`
      : `Machine probability is outside ${config.rangeMin.toFixed(2)}–${config.rangeMax.toFixed(2)}`,
    agreement === 'umbono_munye' ? 'Machine and bookmaker agree' : 'Machine and bookmaker differ',
  ];
  if (investigateScores && topdogUnderdogRatio != null) {
    reasons.push(`Topdog/underdog ratio ${topdogUnderdogRatio.toFixed(2)}: inspect Correct Score / Multiscores`);
  }
  if (hasValue) reasons.push(`Machine advantage ${(machineBookGap * 100).toFixed(1)}pp with positive EV`);

  return {
    machineConclusion: args.modelFavours ? 'selection' : 'opposite',
    bookConclusion: args.bookFavours ? 'selection' : 'opposite',
    agreement,
    machineBookGap,
    oppositionDelta,
    deltaBand,
    inWatchRange,
    topdogOdds,
    underdogOdds,
    topdogUnderdogRatio,
    investigateScores,
    expectedValuePct,
    hasValue,
    reasons,
  };
}
