import { firstGoalSide } from '../utils/firstGoal';

const cases: [string, Parameters<typeof firstGoalSide>[0], Parameters<typeof firstGoalSide>[1], string | null, string][] = [
  ['0-0 has no first goal', 0, 0, '0-0', 'none'],
  ['one-sided half-time proves the first scorer', 2, 1, '1-0', 'home'],
  ['a 1-1 half-time score does not prove the order', 2, 2, '1-1', 'unknown'],
  ['one-sided second half after a goalless half proves the scorer', 2, 0, '0-0', 'home'],
  ['both sides scoring after half-time leaves order unknown', 2, 1, '0-0', 'unknown'],
  ['single scorer can be inferred without a half-time score', 0, 2, null, 'away'],
  ['both scorers without half-time data remain unknown', 2, 1, null, 'unknown'],
  ['invalid half-time score falls back to unambiguous full-time evidence', 1, 0, '2-0', 'home'],
];

let failed = 0;
for (const [name, home, away, ht, expected] of cases) {
  const got = firstGoalSide(home, away, ht);
  if (got !== expected) {
    failed += 1;
    console.error(`✗ ${name}: got ${got}, expected ${expected}`);
  } else {
    console.log(`✓ ${name}`);
  }
}
if (failed) throw new Error(`${failed} first-goal checks failed`);
console.log(`\n${cases.length} first-goal checks passed`);
