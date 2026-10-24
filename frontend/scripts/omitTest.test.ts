import { buildTeamOmitTest, omitCount, sortOmitResults, type OmitMatch } from '../utils/omitTest';

function m(goals: number, unix: number): OmitMatch {
  return { label: `game ${unix}`, goals, unix };
}

// ---- omit count rounding ----
if (omitCount(8, 20) !== 2) throw new Error('8 games @ 20% rounds to 2.');
if (omitCount(10, 20) !== 2) throw new Error('10 games @ 20% = 2.');
if (omitCount(1, 20) !== 0) throw new Error('A single game cannot be omitted.');
if (omitCount(3, 20) !== 1) throw new Error('3 games @ 20% rounds up to at least 1.');
if (omitCount(2, 90) !== 1) throw new Error('Never omit all games — cap at matches-1.');

// ---- Example FC from the spec: 8 games, 16 goals, two 0-goal matches ----
// Scores: 0, 0, 1, 2, 3, 3, 3, 4  → total 16, avg 2.00
const fc = buildTeamOmitTest('Example FC', 1, 'Test League', [
  m(0, 1), m(0, 2), m(1, 3), m(2, 4), m(3, 5), m(3, 6), m(3, 7), m(4, 8),
], { omitPct: 20, sensitivityPct: 10 });

if (fc.matchesPlayed !== 8 || fc.totalGoals !== 16 || Math.abs(fc.originalAverage - 2) > 1e-9) {
  throw new Error(`Baseline wrong: ${JSON.stringify(fc)}`);
}
if (fc.omittedCount !== 2) throw new Error('20% of 8 omits 2.');

const low = fc.scenarios.find((s) => s.kind === 'lowest')!;
// Remove the two 0-goal games → 16 goals over 6 games = 2.667, +33.33%, UP.
if (low.remainingMatches !== 6 || low.remainingGoals !== 16) throw new Error(`Low-omit remainder wrong: ${JSON.stringify(low)}`);
if (Math.abs(low.newAverage - 16 / 6) > 1e-9) throw new Error('Low-omit new average must be 16/6.');
if (low.direction !== 'up' || Math.round((low.percentChange ?? 0) * 100) / 100 !== 33.33) {
  throw new Error(`Low-omit should be +33.33% UP: ${JSON.stringify(low)}`);
}

const high = fc.scenarios.find((s) => s.kind === 'highest')!;
// Remove the two top games (4 and 3) → 9 goals over 6 = 1.5, DOWN.
if (high.remainingGoals !== 9 || Math.abs(high.newAverage - 1.5) > 1e-9 || high.direction !== 'down') {
  throw new Error(`High-omit should drop to 1.5 DOWN: ${JSON.stringify(high)}`);
}

// Max |% change| = 33.33 ≥ 10 → SENSITIVE.
if (fc.sensitivity !== 'sensitive') throw new Error('Example FC should be SENSITIVE at a 10% threshold.');

// ---- a flat team is STABLE and its average is unchanged ----
const flat = buildTeamOmitTest('Flat', 2, 'Test League', [m(1, 1), m(1, 2), m(1, 3), m(1, 4), m(1, 5)], { omitPct: 20, sensitivityPct: 10 });
if (flat.sensitivity !== 'stable' || flat.scenarios.some((s) => s.direction !== 'unchanged')) {
  throw new Error('A team that always scores 1 must be STABLE / unchanged.');
}

// ---- zero-average team reports percentChange null, not a divide-by-zero ----
const none = buildTeamOmitTest('Scoreless', 3, 'Test League', [m(0, 1), m(0, 2), m(0, 3), m(0, 4)], { omitPct: 20 });
if (none.originalAverage !== 0 || none.scenarios.some((s) => s.percentChange !== null)) {
  throw new Error('A 0-average team must report percentChange as null.');
}

// ---- sort puts the most-distorted team first ----
const sorted = sortOmitResults([flat, fc]);
if (sorted[0].team !== 'Example FC') throw new Error('Sort should lead with the most sensitive team.');

console.log('✓ Omit Test: baseline, highest/lowest omission, sensitivity, zero-average, sorting.');
