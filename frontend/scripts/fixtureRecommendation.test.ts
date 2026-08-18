/**
 * Unit tests for the fixture recommendation + risk engine.
 * Run: npx tsx scripts/fixtureRecommendation.test.ts
 */
import { buildRecommendation } from '../utils/fixtureRecommendation';
import type { FixturePrediction } from '../services/predictionEngine';

let failures = 0;
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
function eq<T>(name: string, actual: T, expected: T): void {
  check(name, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const pred = (over: Partial<FixturePrediction> = {}): FixturePrediction => ({
  homeWin: 0.4,
  draw: 0.3,
  awayWin: 0.3,
  btts: 0.5,
  over15: 0.7,
  over25: 0.5,
  over35: 0.3,
  expectedHome: 1.4,
  expectedAway: 1.1,
  topScore: '1-1',
  correctScores: [],
  pick: '1',
  confidence: 50,
  lowData: false,
  ...over,
});

// ---------------------------------------------------------------------------
console.log('Test A — strong favourite → low risk, safe Double-Chance best pick');
// ---------------------------------------------------------------------------
{
  const rec = buildRecommendation({
    prediction: pred({ homeWin: 0.7, draw: 0.18, awayWin: 0.12, over15: 0.8, over25: 0.55 }),
    homeName: 'Home',
    awayName: 'Away',
  });
  eq('risk level is low', rec.riskLevel, 'low');
  eq('no risk factors', rec.factors.length, 0);
  eq('best pick is the safe Double Chance', rec.best?.market, 'Double Chance');
  check('best probability ≈ home+draw (0.88)', Math.abs((rec.best?.probability ?? 0) - 0.88) < 1e-6);
  check(
    'candidates are sorted by score',
    rec.candidates.every((c, i) => i === 0 || rec.candidates[i - 1].score >= c.score),
  );
}

// ---------------------------------------------------------------------------
console.log('Test B — coin-flip → high risk with the right factors');
// ---------------------------------------------------------------------------
{
  const rec = buildRecommendation({
    prediction: pred({ homeWin: 0.34, draw: 0.33, awayWin: 0.33 }),
    homeName: 'Home',
    awayName: 'Away',
  });
  eq('risk level is high', rec.riskLevel, 'high');
  check('flags coin-flip result', rec.factors.some((f) => f.label === 'Coin-flip result'));
  check('flags the live draw threat', rec.factors.some((f) => f.label === 'Draw very live'));
}

// ---------------------------------------------------------------------------
console.log('Test C — limited data forces high risk');
// ---------------------------------------------------------------------------
{
  const rec = buildRecommendation({
    prediction: pred({ homeWin: 0.72, draw: 0.16, awayWin: 0.12, lowData: true }),
    homeName: 'Home',
    awayName: 'Away',
  });
  check('flags limited data', rec.factors.some((f) => f.label === 'Limited data' && f.severity === 'high'));
  eq('risk level is high despite a clear favourite', rec.riskLevel, 'high');
}

// ---------------------------------------------------------------------------
console.log('Test D — module filter restricts candidate markets');
// ---------------------------------------------------------------------------
{
  const rec = buildRecommendation({
    prediction: pred({ over15: 0.85, over25: 0.6 }),
    homeName: 'Home',
    awayName: 'Away',
    modules: ['goals'],
  });
  check('every candidate is a goals market', rec.candidates.every((c) => c.module === 'goals'));
  eq('best goals pick is Over 1.5', rec.best?.selection, 'Over 1.5');
}

// ---------------------------------------------------------------------------
console.log('Test E — odds value: negative edge flagged, positive edge is not');
// ---------------------------------------------------------------------------
{
  // Model 50% home, price 1.5 ⇒ implied 66.7% ⇒ negative edge.
  const noValue = buildRecommendation({
    prediction: pred({ homeWin: 0.5, draw: 0.25, awayWin: 0.25 }),
    homeName: 'Home',
    awayName: 'Away',
    odds: { home: 1.5, draw: 4, away: 6 },
  });
  check('flags no odds value', noValue.factors.some((f) => f.label === 'No odds value'));

  // Model 50% home, price 3.0 ⇒ implied 33.3% ⇒ positive edge.
  const value = buildRecommendation({
    prediction: pred({ homeWin: 0.5, draw: 0.25, awayWin: 0.25 }),
    homeName: 'Home',
    awayName: 'Away',
    odds: { home: 3.0, draw: 4, away: 3.5 },
  });
  check('no "no value" flag when the price is generous', !value.factors.some((f) => f.label === 'No odds value'));
  const resultPick = value.candidates.find((c) => c.market === 'Match Result');
  check('result candidate shows positive edge', (resultPick?.edge ?? -1) > 0);
}

// ---------------------------------------------------------------------------
console.log('Test F — live interchange: 2-0 at 80’ swings probs and settles Over 1.5');
// ---------------------------------------------------------------------------
{
  const base = pred({ homeWin: 0.45, draw: 0.28, awayWin: 0.27, expectedHome: 1.6, expectedAway: 1.2 });
  const prematch = buildRecommendation({ prediction: base, homeName: 'Home', awayName: 'Away' });
  const live = buildRecommendation({
    prediction: base,
    homeName: 'Home',
    awayName: 'Away',
    live: { minute: 80, homeGoals: 2, awayGoals: 0 },
  });
  check('live home-win prob rises above pre-match', live.effective.homeWin > prematch.effective.homeWin);
  check('live home-win prob is now dominant (>0.9)', live.effective.homeWin > 0.9);
  const over15 = live.candidates.find((c) => c.selection === 'Over 1.5');
  check('Over 1.5 is effectively settled (>0.99)', (over15?.probability ?? 0) > 0.99);
  eq('live risk is low with a commanding lead', live.riskLevel, 'low');
}

// ---------------------------------------------------------------------------
console.log('Test G — table contradiction flag');
// ---------------------------------------------------------------------------
{
  const favLower = buildRecommendation({
    prediction: pred({ homeWin: 0.55, draw: 0.2, awayWin: 0.25 }),
    homeName: 'Home',
    awayName: 'Away',
    homePosition: 15,
    awayPosition: 3,
  });
  check('flags favouring a much lower side', favLower.factors.some((f) => f.label === 'Against the table'));

  const favHigher = buildRecommendation({
    prediction: pred({ homeWin: 0.55, draw: 0.2, awayWin: 0.25 }),
    homeName: 'Home',
    awayName: 'Away',
    homePosition: 3,
    awayPosition: 15,
  });
  check('no flag when the favourite is higher up', !favHigher.factors.some((f) => f.label === 'Against the table'));
}

// ---------------------------------------------------------------------------
if (failures > 0) {
  console.error(`\n${failures} check(s) FAILED`);
  process.exit(1);
} else {
  console.log('\nAll checks passed ✅');
  process.exit(0);
}
