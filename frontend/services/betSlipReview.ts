import { compareReference, type ReferenceMetrics } from '@/services/bookmakerValue';
import { splitEventName } from '@/services/hollywoodMatch';
import type { BetSlipLeg } from '@/types/analytics';

export type BetSlipMode = 'accumulator' | 'singles';

export type TicketReview = {
  id: string;
  bookmaker: string | null;
  legs: BetSlipLeg[];
  group: number | null;
  combinedOdds: number | null;
  potentialReturn: number | null;
  issue: string | null;
};

export type SlipReview = {
  tickets: TicketReview[];
  totalStake: number | null;
  potentialReturn: number | null;
  issue: string | null;
};

export function ticketGroup(legs: number): number | null {
  const groups = [[1, 2, 3], [4, 5], [8, 10], [15, 20], [25, 30], [40, 50]];
  const index = groups.findIndex((sizes) => sizes.includes(legs));
  return index < 0 ? null : index + 1;
}

function bookKey(name: string): string {
  const key = name.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  return key === 'hollywood' ? 'hollywoodbets' : key;
}

function bookForLeg(leg: BetSlipLeg): { key: string; name: string } | null {
  if (leg.hbLeg && leg.betwayLeg) return null;
  const metadataName = leg.hbLeg ? 'Hollywoodbets' : leg.betwayLeg ? 'Betway' : null;
  const label = leg.bookmaker?.trim() || null;
  if (metadataName && label && bookKey(metadataName) !== bookKey(label)) return null;
  const name = metadataName ?? label;
  const key = name ? bookKey(name) : '';
  return name && key ? { key, name } : null;
}

function sameFixture(first: BetSlipLeg, second: BetSlipLeg): boolean {
  if (first.hbLeg && second.hbLeg && first.hbLeg.eventID === second.hbLeg.eventID) return true;
  if (first.betwayLeg && second.betwayLeg && first.betwayLeg.eventId === second.betwayLeg.eventId) return true;
  const a = splitEventName(first.fixture);
  const b = splitEventName(second.fixture);
  if (a && b) return a.home === b.home && a.away === b.away;
  const left = first.fixture.trim().toLowerCase().replace(/\s+/g, ' ');
  const right = second.fixture.trim().toLowerCase().replace(/\s+/g, ' ');
  return !!left && left === right;
}

function ticketIssue(legs: readonly BetSlipLeg[]): string | null {
  if (legs.some((leg) => !Number.isFinite(leg.odds) || leg.odds < 1)) return 'A selection has invalid decimal odds.';
  if (legs.length > 1 && legs.some((leg) => !leg.fixture.trim())) return 'A selection has no fixture identity.';
  for (let index = 0; index < legs.length; index += 1) {
    if (legs.slice(index + 1).some((other) => sameFixture(legs[index], other))) {
      return 'Same-match combinations require an actual bookmaker builder quote.';
    }
  }
  return null;
}

/** Split accumulators by bookmaker; unassigned selections never become one implied ticket. */
export function reviewBetSlip(legs: readonly BetSlipLeg[], mode: BetSlipMode, stake: number): SlipReview {
  const validStake = Number.isFinite(stake) && stake >= 0;
  const groups = new Map<string, { bookmaker: string | null; legs: BetSlipLeg[] }>();
  legs.forEach((leg, index) => {
    const book = bookForLeg(leg);
    const key = mode === 'singles' ? `single:${index}` : book?.key ?? `unassigned:${index}`;
    const group = groups.get(key) ?? { bookmaker: book?.name ?? null, legs: [] };
    group.legs.push(leg);
    groups.set(key, group);
  });
  const tickets: TicketReview[] = [...groups.entries()].map(([id, group]) => {
    const issue = !group.bookmaker ? 'Bookmaker is unassigned or conflicts with provider metadata.'
      : ticketIssue(group.legs);
    const product = group.legs.reduce((total, leg) => total * leg.odds, 1);
    const combinedOdds = !issue && Number.isFinite(product) ? product : null;
    const potentialReturn = combinedOdds != null && validStake && Number.isFinite(stake * combinedOdds)
      ? stake * combinedOdds : null;
    return {
      id, bookmaker: group.bookmaker, legs: group.legs, group: ticketGroup(group.legs.length),
      combinedOdds, potentialReturn,
      issue: issue ?? (combinedOdds == null ? 'Combined odds are too large to calculate.' : null),
    };
  });
  const issue = !validStake ? 'Enter a finite, non-negative stake.'
    : tickets.some((ticket) => ticket.issue || ticket.potentialReturn == null)
      ? 'Resolve each ticket issue before calculating total stake and return.' : null;
  const totalStake = issue ? null : stake * tickets.length;
  const potentialReturn = issue ? null : tickets.reduce((sum, ticket) => sum + ticket.potentialReturn!, 0);
  return {
    tickets,
    totalStake: totalStake != null && Number.isFinite(totalStake) ? totalStake : null,
    potentialReturn: potentialReturn != null && Number.isFinite(potentialReturn) ? potentialReturn : null,
    issue: issue ?? ((totalStake != null && !Number.isFinite(totalStake)) ||
      (potentialReturn != null && !Number.isFinite(potentialReturn)) ? 'Totals are too large to calculate.' : null),
  };
}

export type TicketReferenceResult =
  | { status: 'available'; metrics: ReferenceMetrics }
  | { status: 'unavailable'; reason: string };

function referenceProbability(leg: BetSlipLeg, source: 'pinnacle' | 'machine'): number | null {
  const evidence = leg.references;
  if (!evidence || evidence.version !== 'reference-comparison-v1') return null;
  const reference = evidence[source];
  if (!reference || !Number.isFinite(reference.probability) ||
    reference.probability < 0 || reference.probability > 1 ||
    !Number.isFinite(Date.parse(reference.capturedAt))) return null;
  if (source === 'machine') {
    const machine = evidence.machine;
    return machine && machine.source?.trim() && machine.version?.trim() ? machine.probability : null;
  }
  const pinnacle = evidence.pinnacle;
  if (!pinnacle || !pinnacle.marketKey?.trim() || !Number.isSafeInteger(pinnacle.fixtureId) ||
    pinnacle.fixtureId <= 0 || !Array.isArray(pinnacle.outcomes)) return null;
  const expected = pinnacle.groupKey?.startsWith('result:') ? ['home', 'draw', 'away']
    : pinnacle.groupKey?.startsWith('btts:') ? ['yes', 'no']
      : pinnacle.groupKey?.startsWith('totals:') ? ['over', 'under'] : [];
  if (expected.length !== pinnacle.outcomes.length ||
    expected.some((outcome) => pinnacle.outcomes.filter((item) => item.outcome === outcome).length !== 1) ||
    pinnacle.outcomes.some((item) => !Number.isFinite(item.odds) || item.odds < 1)) return null;
  const selected = pinnacle.outcomes.find((item) => item.outcome === pinnacle.outcome);
  if (!selected || selected.odds !== pinnacle.odds) return null;
  const implied = pinnacle.outcomes.reduce((sum, item) => sum + 1 / item.odds, 0);
  const calculated = (1 / selected.odds) / implied;
  return Math.abs(calculated - pinnacle.probability) < 1e-12 ? pinnacle.probability : null;
}

export function ticketReference(
  ticket: TicketReview,
  source: 'pinnacle' | 'machine',
  assumeIndependence: boolean,
): TicketReferenceResult {
  if (ticket.issue || ticket.combinedOdds == null) {
    return { status: 'unavailable', reason: ticket.issue ?? 'Ticket odds are unavailable.' };
  }
  if (ticket.legs.length > 1 && !assumeIndependence) {
    return { status: 'unavailable', reason: 'A joint probability or an explicit independence assumption is required.' };
  }
  const references = ticket.legs.map((leg) => referenceProbability(leg, source));
  if (references.some((reference) => reference == null)) {
    return { status: 'unavailable', reason: `A valid ${source === 'pinnacle' ? 'Pinnacle' : 'MM'} reference is required for every leg.` };
  }
  const probability = references.reduce<number>((product, reference) => product * reference!, 1);
  const metrics = compareReference(ticket.combinedOdds, probability);
  return metrics ? { status: 'available', metrics }
    : { status: 'unavailable', reason: 'Ticket reference cannot be calculated from these inputs.' };
}
