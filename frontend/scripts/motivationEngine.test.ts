/**
 * Unit tests for Section 2 + 3 motivation / chase-escape engine.
 * Run: npx tsx scripts/motivationEngine.test.ts
 */
import {
  MOTIVATION_GAP_MAX,
  criticalLinesFor,
  estimateRemainingMatches,
  evaluateFixtureMotivation,
  evaluateTeamMotivation,
  rankAfterWin,
  type StandingLike,
} from '../utils/motivationEngine';

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function row(
  rank: number,
  teamId: number,
  name: string,
  points: number,
  played = 20,
  zone: 'top' | 'mid' | 'bottom' = 'mid',
): StandingLike {
  return { rank, teamId, name, points, played, zone };
}

/** 6-team mini league for gap maths. */
const MINI: StandingLike[] = [
  row(1, 1, 'Alpha', 40, 20, 'top'),
  row(2, 2, 'Bravo', 37, 20, 'top'),
  row(3, 3, 'Charlie', 34, 20, 'mid'),
  row(4, 4, 'Delta', 30, 20, 'mid'),
  row(5, 5, 'Echo', 28, 20, 'bottom'),
  row(6, 6, 'Foxtrot', 20, 20, 'bottom'),
];

console.log('\ncriticalLinesFor');
{
  const pl = criticalLinesFor(423, 20); // Premier League curated
  check('PL has chase targets', pl.chaseTargets.length > 0);
  check('PL has relegation line', pl.relegationLine != null);
  check('PL mid band exists', pl.midBand != null && pl.midBand.from < pl.midBand.to);

  const fallback = criticalLinesFor(999999, 18);
  check('unknown league still gets thirds fallback', fallback.chaseTargets.length > 0);
  check('fallback relegation near bottom', (fallback.relegationLine ?? 0) > 9);
}

console.log('\nrankAfterWin / remaining');
{
  const r = rankAfterWin(MINI, 3); // Charlie 34 → 37, should pass Bravo tied/over
  check('Charlie climbs after +3', r != null && r < 3, `got ${r}`);
  const rem = estimateRemainingMatches(MINI[0], MINI, 50);
  check('50% progress ⇒ remaining ≈ played', rem >= 18 && rem <= 22, `got ${rem}`);
}

console.log('\nmotivation gaps (Section 2)');
{
  // Bravo 37; ahead Alpha 40; after win 40 — gap 0 ≤ 4 → motivates
  const bravo = evaluateTeamMotivation(2, MINI, { seasonProgress: 80 });
  check('Bravo exists', bravo != null);
  check('Bravo has motivating ahead probe', !!bravo?.probes.some((p) => p.key === 'ahead1' && p.motivates));
  check('Bravo grade is A (chase/take-over)', bravo?.grade === 'A', `got ${bravo?.grade}`);

  // Foxtrot 20; ahead Echo 28; after win 23 — gap 5 > 4 → ahead probe rejects
  const fox = evaluateTeamMotivation(6, MINI, { seasonProgress: 80 });
  const ahead = fox?.probes.find((p) => p.key === 'ahead1');
  check(
    'Foxtrot ahead gap > 4 is rejected',
    ahead != null && ahead.gap > MOTIVATION_GAP_MAX && !ahead.motivates,
    `gap=${ahead?.gap}`,
  );
}

console.log('\nstance chase/escape (Section 3)');
{
  // Late season + near bottom → escape
  const echo = evaluateTeamMotivation(5, MINI, {
    competitionId: 999999,
    seasonProgress: 80,
  });
  check('Echo late-season near danger → escape or chase', echo?.stance === 'escape' || echo?.stance === 'chase', `got ${echo?.stance}`);

  // Early season top chaser
  const charlie = evaluateTeamMotivation(3, MINI, { seasonProgress: 40 });
  check('Charlie early season → chase or no_reward', charlie?.stance === 'chase' || charlie?.stance === 'no_reward', `got ${charlie?.stance}`);
  check('Early mode is pull only', charlie?.mode === 'pull');

  // Futile: huge gap, almost no games left
  const stuck: StandingLike[] = [
    row(1, 1, 'Leader', 50, 30, 'top'),
    row(2, 2, 'Chaser', 20, 30, 'mid'),
  ];
  const futile = evaluateTeamMotivation(2, stuck, { seasonProgress: 95 });
  check('Huge gap late → futile or no_reward', !!futile && (futile.futileChase || futile.stance === 'no_reward'));
}

console.log('\nfixture pair');
{
  const fix = evaluateFixtureMotivation(MINI, 2, 5, { seasonProgress: 80, competitionId: 999999 });
  check('home evaluated', fix.home != null);
  check('away evaluated', fix.away != null);
  check('unknown team → null', evaluateFixtureMotivation(MINI, 99, null).home == null);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
