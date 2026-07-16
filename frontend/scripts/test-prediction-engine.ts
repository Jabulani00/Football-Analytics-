/** Offline test for services/predictionEngine.ts. Run: npx tsx scripts/test-prediction-engine.ts */
import {
  buildScoreMatrix, outcomeProbs, bttsYes, overProb, poissonPmf, predictFromStats,
} from '../services/predictionEngine';

let pass = 0, fail = 0;
const approx = (name: string, got: number, want: number, tol = 1e-6) => {
  if (Math.abs(got - want) <= tol) pass++; else { fail++; console.log(`  FAIL ${name}: got ${got}, want ${want}`); }
};
const ok = (name: string, cond: boolean) => { if (cond) pass++; else { fail++; console.log(`  FAIL ${name}`); } };

// Poisson pmf sums to ~1
approx('pmf sums to 1', Array.from({ length: 40 }, (_, k) => poissonPmf(k, 1.7)).reduce((a, b) => a + b, 0), 1, 1e-6);

// Matrix normalized + outcomes sum to 1
const m = buildScoreMatrix(1.8, 1.0);
approx('matrix total', m.grid.flat().reduce((a, b) => a + b, 0), 1, 1e-9);
const o = outcomeProbs(m);
approx('outcomes sum', o.home + o.draw + o.away, 1, 1e-9);
ok('stronger home wins more', o.home > o.away);

// Symmetric lambdas -> symmetric outcomes
const ms = buildScoreMatrix(1.3, 1.3);
const os = outcomeProbs(ms);
approx('symmetric home==away', os.home, os.away, 1e-9);

// Over line monotonic + BTTS bounds
ok('over monotonic', overProb(m, 0.5) > overProb(m, 1.5) && overProb(m, 1.5) > overProb(m, 2.5));
approx('over0.5 = 1 - P(0-0)', overProb(m, 0.5), 1 - m.grid[0][0], 1e-9);
ok('btts in [0,1]', bttsYes(m) >= 0 && bttsYes(m) <= 1);

// Dixon-Coles lifts draws vs independent
const withDc = outcomeProbs(buildScoreMatrix(1.1, 1.1, -0.13)).draw;
const noDc = outcomeProbs(buildScoreMatrix(1.1, 1.1, 0)).draw;
ok('DC lifts draws', withDc > noDc);

// Full prediction: strong home attack vs leaky away -> home favored
const pred = predictFromStats(
  { scAvg: 2.4, concAvg: 0.8, sample: 12 }, // home at home
  { scAvg: 0.9, concAvg: 2.2, sample: 12 }, // away at away
  { homeAvg: 1.4, awayAvg: 1.1, measured: true },
);
approx('pred 1x2 sums', pred.homeWin + pred.draw + pred.awayWin, 1, 1e-6);
ok('home favored', pred.homeWin > pred.awayWin);
ok('pick is 1', pred.pick === '1');
ok('expected home > away', pred.expectedHome > pred.expectedAway);
ok('confidence 0..100', pred.confidence >= 0 && pred.confidence <= 100);
ok('not lowData at sample 12', pred.lowData === false);
ok('3 correct scores', pred.correctScores.length === 3);

// Low-data flag
const low = predictFromStats(
  { scAvg: 2, concAvg: 1, sample: 2 }, { scAvg: 1, concAvg: 2, sample: 2 },
  { homeAvg: 1.4, awayAvg: 1.1, measured: true },
);
ok('lowData at sample 2', low.lowData === true);

console.log(`\n${pass}/${pass + fail} checks passed`);
if (fail === 0) {
  console.log('Sample prediction:', JSON.stringify({
    '1X2': [Math.round(pred.homeWin * 100), Math.round(pred.draw * 100), Math.round(pred.awayWin * 100)],
    btts: Math.round(pred.btts * 100), over25: Math.round(pred.over25 * 100),
    xg: [pred.expectedHome.toFixed(2), pred.expectedAway.toFixed(2)], topScore: pred.topScore,
    pick: pred.pick, confidence: pred.confidence,
  }));
}
process.exit(fail === 0 ? 0 : 1);
