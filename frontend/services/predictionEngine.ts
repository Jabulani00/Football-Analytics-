/**
 * Real-time prediction engine (TypeScript port of backend/prediction).
 *
 * Dixon-Coles bivariate-Poisson core: two expected-goal means (derived from the
 * live stat tables) produce every market — 1X2, BTTS, Over/Under, correct score,
 * expected goals, confidence. Runs entirely client-side on live data, so
 * predictions update whenever the tables rebuild from the API.
 *
 * Pure (no network, no React) → unit-testable and reusable.
 */

// ---- Tunables (mirror backend/prediction/config.py) ------------------------
const MAX_GOALS = 8;
const DIXON_COLES_RHO = -0.13;
const PRIOR_MATCHES = 6; // Bayesian shrinkage toward league mean
const MIN_LAMBDA = 0.15;
const MAX_LAMBDA = 5.0;
const DEFAULT_HOME_AVG = 1.45;
const DEFAULT_AWAY_AVG = 1.15;

// ---- Poisson / Dixon-Coles --------------------------------------------------
function factorial(n: number): number {
  let f = 1;
  for (let i = 2; i <= n; i += 1) f *= i;
  return f;
}

export function poissonPmf(k: number, lam: number): number {
  if (lam <= 0) return k === 0 ? 1 : 0;
  return (Math.exp(-lam) * lam ** k) / factorial(k);
}

function dixonColesTau(i: number, j: number, lh: number, la: number, rho: number): number {
  if (i === 0 && j === 0) return 1 - lh * la * rho;
  if (i === 0 && j === 1) return 1 + lh * rho;
  if (i === 1 && j === 0) return 1 + la * rho;
  if (i === 1 && j === 1) return 1 - rho;
  return 1;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

export type ScoreMatrix = { grid: number[][]; lamHome: number; lamAway: number };

export function buildScoreMatrix(
  lamHomeIn: number,
  lamAwayIn: number,
  rho = DIXON_COLES_RHO,
  maxGoals = MAX_GOALS,
): ScoreMatrix {
  const lamHome = clamp(lamHomeIn, MIN_LAMBDA, MAX_LAMBDA);
  const lamAway = clamp(lamAwayIn, MIN_LAMBDA, MAX_LAMBDA);
  const homePmf = Array.from({ length: maxGoals + 1 }, (_, i) => poissonPmf(i, lamHome));
  const awayPmf = Array.from({ length: maxGoals + 1 }, (_, j) => poissonPmf(j, lamAway));

  const grid: number[][] = [];
  let total = 0;
  for (let i = 0; i <= maxGoals; i += 1) {
    const row: number[] = [];
    for (let j = 0; j <= maxGoals; j += 1) {
      const p = homePmf[i] * awayPmf[j] * Math.max(dixonColesTau(i, j, lamHome, lamAway, rho), 1e-9);
      row.push(p);
      total += p;
    }
    grid.push(row);
  }
  if (total > 0) for (let i = 0; i < grid.length; i += 1) for (let j = 0; j < grid[i].length; j += 1) grid[i][j] /= total;
  return { grid, lamHome, lamAway };
}

export function outcomeProbs(m: ScoreMatrix): { home: number; draw: number; away: number } {
  let home = 0, draw = 0, away = 0;
  m.grid.forEach((row, i) => row.forEach((p, j) => {
    if (i > j) home += p; else if (i === j) draw += p; else away += p;
  }));
  return { home, draw, away };
}

export function bttsYes(m: ScoreMatrix): number {
  const pHomeZero = m.grid[0].reduce((s, p) => s + p, 0);
  const pAwayZero = m.grid.reduce((s, row) => s + row[0], 0);
  return Math.max(0, 1 - pHomeZero - pAwayZero + m.grid[0][0]);
}

export function overProb(m: ScoreMatrix, line: number): number {
  const threshold = Math.floor(line);
  let over = 0;
  m.grid.forEach((row, i) => row.forEach((p, j) => { if (i + j > threshold) over += p; }));
  return over;
}

export function topScores(m: ScoreMatrix, n: number): { score: string; p: number }[] {
  const cells: { score: string; p: number }[] = [];
  m.grid.forEach((row, i) => row.forEach((p, j) => cells.push({ score: `${i}-${j}`, p })));
  cells.sort((a, b) => b.p - a.p);
  return cells.slice(0, n);
}

// ---- Strengths → lambdas ----------------------------------------------------
export type VenueStats = { scAvg: number; concAvg: number; sample: number };
export type LeagueBaseline = { homeAvg: number; awayAvg: number; measured: boolean };

/** Shrink a per-game rate toward the league mean for small samples. */
function shrink(rate: number, mean: number, sample: number): number {
  if (sample <= 0) return mean;
  const w = sample / (sample + PRIOR_MATCHES);
  return w * rate + (1 - w) * mean;
}

export function computeLambdas(
  homeHome: VenueStats,
  awayAway: VenueStats,
  league: LeagueBaseline,
): { lamHome: number; lamAway: number } {
  const homeAvg = league.homeAvg > 0 ? league.homeAvg : DEFAULT_HOME_AVG;
  const awayAvg = league.awayAvg > 0 ? league.awayAvg : DEFAULT_AWAY_AVG;

  const homeAttack = shrink(homeHome.scAvg, homeAvg, homeHome.sample);
  const homeDefense = shrink(homeHome.concAvg, awayAvg, homeHome.sample);
  const awayAttack = shrink(awayAway.scAvg, awayAvg, awayAway.sample);
  const awayDefense = shrink(awayAway.concAvg, homeAvg, awayAway.sample);

  // λ_home = homeAttack × (awayDefense / homeAvg); symmetric for away.
  const lamHome = (homeAttack * awayDefense) / homeAvg;
  const lamAway = (awayAttack * homeDefense) / awayAvg;
  return { lamHome, lamAway };
}

// ---- Full prediction --------------------------------------------------------
export type FixturePrediction = {
  homeWin: number; draw: number; awayWin: number;
  btts: number;
  over15: number; over25: number; over35: number;
  expectedHome: number; expectedAway: number;
  topScore: string;
  correctScores: { score: string; p: number }[];
  pick: '1' | 'X' | '2';
  confidence: number;
  lowData: boolean;
};

export function predictFromStats(
  homeHome: VenueStats,
  awayAway: VenueStats,
  league: LeagueBaseline,
): FixturePrediction {
  const { lamHome, lamAway } = computeLambdas(homeHome, awayAway, league);
  const m = buildScoreMatrix(lamHome, lamAway);
  const o = outcomeProbs(m);
  const cs = topScores(m, 3);

  const outcomes: [string, number][] = [['1', o.home], ['X', o.draw], ['2', o.away]];
  outcomes.sort((a, b) => b[1] - a[1]);
  const pick = outcomes[0][0] as '1' | 'X' | '2';

  // Confidence: decisiveness (top-vs-second margin) tempered by sample size.
  const margin = Math.min(1, (outcomes[0][1] - outcomes[1][1]) / 0.5);
  const sampleScore = Math.min(1, Math.min(homeHome.sample, awayAway.sample) / 8);
  const lowData = Math.min(homeHome.sample, awayAway.sample) < 4;
  const confidence = Math.round(100 * (0.7 * margin + 0.3 * sampleScore));

  return {
    homeWin: o.home, draw: o.draw, awayWin: o.away,
    btts: bttsYes(m),
    over15: overProb(m, 1.5), over25: overProb(m, 2.5), over35: overProb(m, 3.5),
    expectedHome: m.lamHome, expectedAway: m.lamAway,
    topScore: cs[0]?.score ?? '1-1',
    correctScores: cs,
    pick,
    confidence,
    lowData,
  };
}
