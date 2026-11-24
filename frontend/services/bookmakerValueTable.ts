import { comparePriceGap } from './bookmakerClassification';
import {
  compareReference, pinnacleImpliedTotal,
  type parseMachineReference, type PinnacleReferenceResult, type ReferenceMetrics,
} from './bookmakerValue';

type MachineResult = ReturnType<typeof parseMachineReference>;

export type CalculationStep = {
  id: string;
  label: string;
  calculation: string;
  result: string;
  tone?: 'positive' | 'negative';
};

export const displayProbability = (value: number) => {
  const percentage = value * 100;
  return `${percentage !== 0 && Math.abs(percentage) < 0.0001
    ? percentage.toPrecision(4) : percentage.toFixed(4)}%`;
};
export const displaySigned = (value: number, digits = 4) => `${value >= 0 ? '+' : ''}${value.toFixed(digits)}`;
export const displayOdds = (value: number) =>
  Number(value.toFixed(2)) === value ? value.toFixed(2) : String(value);

function appendReferenceSteps(
  steps: CalculationStep[], prefix: string, label: string, metrics: ReferenceMetrics, bookOdds: number,
) {
  const probability = String(metrics.probability * 100);
  const bookImplied = String(metrics.impliedBookProbability * 100);
  const tone = metrics.valuePp < 0 ? 'negative' : metrics.valuePp > 0 ? 'positive' : undefined;
  steps.push(
    {
      id: `${prefix}-fair-odds`, label: `${label} fair odds`,
      calculation: `1 / ${metrics.probability}`,
      result: metrics.fairOdds == null ? 'Unavailable at 0% probability' : metrics.fairOdds.toFixed(4),
    },
    {
      id: `${prefix}-odds-difference`, label: `${label} odds difference`,
      calculation: metrics.fairOdds == null
        ? 'Requires finite reference fair odds'
        : `${displayOdds(bookOdds)} - ${metrics.fairOdds}`,
      result: metrics.oddsDifference == null ? 'Unavailable' : displaySigned(metrics.oddsDifference),
    },
    {
      id: `${prefix}-value`, label: `${label} value`,
      calculation: `${probability}% - ${bookImplied}%`,
      result: `${displaySigned(metrics.valuePp)} pp`, tone,
    },
    {
      id: `${prefix}-shortfall`, label: `${label} relative shortfall`,
      calculation: `min(${metrics.valuePp} pp, 0)`,
      result: `${metrics.shortfallPp.toFixed(4)} pp`,
      tone: metrics.shortfallPp < 0 ? 'negative' : undefined,
    },
    {
      id: `${prefix}-ev`, label: `${label} benchmark EV`,
      calculation: `(${metrics.probability} x ${displayOdds(bookOdds)} - 1) x 100`,
      result: `${displaySigned(metrics.benchmarkEvPct)}%`, tone,
    },
    {
      id: `${prefix}-units`, label: `${label} hypothetical shortfall`,
      calculation: `max(0, -(${metrics.benchmarkEvPct}) / 100)`,
      result: `${metrics.shortfallUnitsPerUnit.toFixed(4)} units per unit staked`,
      tone: metrics.shortfallUnitsPerUnit > 0 ? 'negative' : undefined,
    },
  );
}

export function buildBookmakerValueTable({
  bookmaker, bookOdds, pinnacle, machine, counterpart,
}: {
  bookmaker: string;
  bookOdds: number;
  pinnacle: PinnacleReferenceResult;
  machine: MachineResult;
  counterpart: { bookmaker: string; decimal: number } | null;
}) {
  if (!Number.isFinite(bookOdds) || bookOdds < 1) {
    throw new RangeError('A valid bookmaker decimal price is required.');
  }
  const bookImplied = 1 / bookOdds;
  const quote = pinnacle.status === 'available' ? pinnacle.reference : pinnacle.quote ?? null;
  const pinnacleGap = quote ? comparePriceGap(bookOdds, quote.odds) : null;
  const otherGap = counterpart ? comparePriceGap(bookOdds, counterpart.decimal) : null;
  const ref1 = pinnacle.status === 'available' ? compareReference(bookOdds, pinnacle.reference.probability) : null;
  const ref2 = machine.status === 'available' ? compareReference(bookOdds, machine.reference.probability) : null;
  const steps: CalculationStep[] = [
    { id: 'book-odds', label: 'Bookmaker decimal odds', calculation: `${bookmaker} selected price`, result: displayOdds(bookOdds) },
    {
      id: 'book-implied', label: 'Bookmaker implied probability',
      calculation: `(1 / ${displayOdds(bookOdds)}) x 100`, result: displayProbability(bookImplied),
    },
    {
      id: 'book-net', label: 'Bookmaker net odds',
      calculation: `${displayOdds(bookOdds)} - 1`, result: (bookOdds - 1).toFixed(4),
    },
    {
      id: 'pinnacle-odds', label: 'Pinnacle closing-mode odds',
      calculation: 'Matched selection price', result: quote ? displayOdds(quote.odds) : 'Unavailable',
    },
    {
      id: 'pinnacle-implied', label: 'Pinnacle implied probability',
      calculation: quote ? `(1 / ${displayOdds(quote.odds)}) x 100` : 'Pinnacle selection price unavailable',
      result: quote ? displayProbability(1 / quote.odds) : 'Unavailable',
    },
    {
      id: 'pinnacle-gap', label: 'Bookmaker / Pinnacle gap',
      calculation: quote && pinnacleGap
        ? `${displayOdds(Math.max(bookOdds, quote.odds))} - ${displayOdds(Math.min(bookOdds, quote.odds))}`
        : 'A matched Pinnacle selection price is required',
      result: pinnacleGap ? `${displayOdds(pinnacleGap.gap)} (${pinnacleGap.size})` : 'Unavailable',
    },
    {
      id: 'other-gap', label: 'Other bookmaker gap',
      calculation: counterpart && otherGap
        ? `${counterpart.bookmaker}: ${displayOdds(Math.max(bookOdds, counterpart.decimal))} - ${displayOdds(Math.min(bookOdds, counterpart.decimal))}`
        : 'A unique matching selection from another bookmaker is required',
      result: otherGap ? `${displayOdds(otherGap.gap)} (${otherGap.size})` : 'Unavailable',
    },
  ];

  if (pinnacle.status === 'available' && ref1) {
    const { reference } = pinnacle;
    const terms = reference.outcomes.map((item) => `1 / ${displayOdds(item.odds)}`).join(' + ');
    for (const item of reference.outcomes) {
      steps.push({
        id: `pinnacle-input-${item.outcome}`, label: `No-vig input: ${item.outcome}`,
        calculation: `(1 / ${displayOdds(item.odds)}) x 100`, result: displayProbability(1 / item.odds),
      });
    }
    steps.push(
      {
        id: 'pinnacle-input-total', label: 'Total Pinnacle implied probability',
        calculation: `(${terms}) x 100`, result: displayProbability(pinnacleImpliedTotal(reference.outcomes)),
      },
      {
        id: 'reference1-probability', label: 'Reference 1 no-vig probability',
        calculation: `((1 / ${displayOdds(reference.odds)}) / (${terms})) x 100`,
        result: displayProbability(reference.probability),
      },
    );
    appendReferenceSteps(steps, 'reference1', 'Reference 1', ref1, bookOdds);
  } else {
    steps.push({
      id: 'reference1-unavailable', label: 'No-vig inputs / Reference 1',
      calculation: pinnacle.status === 'unavailable' ? pinnacle.reason : 'Invalid reference inputs.',
      result: 'Unavailable',
    });
  }

  if (machine.status === 'available' && ref2) {
    steps.push({
      id: 'reference2-probability', label: 'Reference 2 (MM) probability',
      calculation: `Manually supplied: ${machine.reference.source}, version ${machine.reference.version}`,
      result: displayProbability(machine.reference.probability),
    });
    appendReferenceSteps(steps, 'reference2', 'Reference 2 (MM)', ref2, bookOdds);
  } else {
    steps.push({
      id: 'reference2-unavailable', label: 'Reference 2 (MM)',
      calculation: machine.status === 'invalid' ? machine.reason
        : machine.status === 'empty' ? 'Enter your model probability, source, version and capture time.'
          : 'Invalid reference inputs.',
      result: 'Unavailable',
    });
  }
  return { bookImplied, quote, pinnacleGap, otherGap, ref1, ref2, steps };
}
