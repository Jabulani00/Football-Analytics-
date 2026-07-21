/** Perf benchmark for the live builders. Run: npx tsx scripts/bench.ts */
import { buildStatsTables } from '../services/statsBuilder';
import { predictFromStats } from '../services/predictionEngine';
import { computeTeamStrengths, baselineFromResults } from '../services/teamForm';

function makeLeague(teams: number, roundsEach: number): any[] {
  const ids = Array.from({ length: teams }, (_, i) => i + 1);
  const names = ids.map((i) => `Team ${i}`);
  const fixtures: any[] = [];
  let id = 1;
  let unix = 1_700_000_000;
  for (let r = 0; r < roundsEach; r += 1) {
    for (let h = 0; h < teams; h += 1) {
      const a = (h + 1 + r) % teams;
      if (a === h) continue;
      const hg = Math.floor(Math.abs(Math.sin(id * 1.3)) * 4);
      const ag = Math.floor(Math.abs(Math.cos(id * 0.7)) * 3);
      const ht = `${Math.floor(hg / 2)}-${Math.floor(ag / 2)}`;
      fixtures.push({
        id: id++, competition_id: 1, status: 'FT', season: '2026', unix: (unix += 3600),
        home_name: names[h], away_name: names[a], home_id: ids[h], away_id: ids[a],
        home_goals: hg, away_goals: ag, ht_score: ht,
      });
    }
  }
  return fixtures;
}

function time(label: string, fn: () => void, iters = 1) {
  // warm up
  fn();
  const t0 = performance.now();
  for (let i = 0; i < iters; i += 1) fn();
  const ms = (performance.now() - t0) / iters;
  console.log(`  ${label.padEnd(42)} ${ms.toFixed(2)} ms`);
  return ms;
}

let buildBig = 0;
let predictBig = 0;
for (const [teams, rounds] of [[20, 2], [24, 4], [40, 6]] as [number, number][]) {
  const fx = makeLeague(teams, rounds);
  console.log(`\nLeague: ${teams} teams, ${fx.length} finished matches`);
  const b = time('buildStatsTables (36 tables)', () => buildStatsTables({ fixtures: fx, season: '2026' }), 5);
  const base = baselineFromResults(fx);
  time('computeTeamStrengths x all teams', () => {
    for (let i = 1; i <= teams; i += 1) computeTeamStrengths(fx, i);
  }, 5);
  const s = computeTeamStrengths(fx, 1);
  const s2 = computeTeamStrengths(fx, 2);
  const p = time('predictFromStats x 100 fixtures', () => {
    for (let i = 0; i < 100; i += 1) predictFromStats(s.home, s2.away, base);
  }, 5);
  buildBig = b;
  predictBig = p;
}

// Perf thresholds (generous vs measured ~28ms / ~3ms, to absorb CI variance).
const BUILD_LIMIT = 150;
const PREDICT_LIMIT = 30;
let failed = 0;
const assert = (name: string, ms: number, limit: number) => {
  const okp = ms <= limit;
  console.log(`  ${okp ? 'PASS' : 'FAIL'} ${name}: ${ms.toFixed(1)}ms <= ${limit}ms`);
  if (!okp) failed += 1;
};
console.log('\nPerf gates (largest league):');
assert('buildStatsTables (36 tables)', buildBig, BUILD_LIMIT);
assert('predictFromStats x100', predictBig, PREDICT_LIMIT);
console.log(failed === 0 ? '\nall perf gates passed' : `\n${failed} perf gate(s) failed`);
process.exit(failed === 0 ? 0 : 1);
