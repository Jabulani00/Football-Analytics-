/**
 * Walk-forward accuracy backtest for the prediction engine — live data.
 *   npx tsx scripts/backtest.ts [competitionId ...]
 *
 * For each finished league match (chronological), predict the result using ONLY
 * the matches played before it, then compare the model's pick to the actual
 * outcome. Reports pick accuracy, a naive "always home" baseline, Brier score,
 * and calibration (avg probability assigned to what actually happened).
 */
import * as https from 'https';
import { predictFromStats } from '../services/predictionEngine';
import { computeTeamStrengths, homeVenue, awayVenue, baselineFromResults } from '../services/teamForm';

const PROXY = 'https://football-analytics-rose.vercel.app/oddalerts';
const get = (path: string): Promise<any> =>
  new Promise((res, rej) => {
    https
      .get(`${PROXY}?${path}`, { rejectUnauthorized: false } as any, (r) => {
        let d = '';
        r.on('data', (c) => (d += c));
        r.on('end', () => {
          try { res(JSON.parse(d)); } catch (e) { rej(e); }
        });
      })
      .on('error', rej);
  });

const FINISHED = new Set(['FT', 'AET', 'PEN', 'FT_PEN']);
const actualOf = (f: any): '1' | 'X' | '2' =>
  f.home_goals > f.away_goals ? '1' : f.home_goals === f.away_goals ? 'X' : '2';

async function backtestCompetition(compId: number, from: number, to: number) {
  const rows: any[] = [];
  for (let page = 1; page <= 8; page++) {
    const env = await get(`path=fixtures/between&from=${from}&to=${to}&competitions=${compId}&page=${page}`);
    rows.push(...(env.data || []));
    if (!env.info?.next_page_url) break;
  }
  const finished = rows
    .filter((f) => FINISHED.has(f.status) && f.home_goals != null && f.home_id && f.away_id)
    .sort((a, b) => a.unix - b.unix);

  const pool: any[] = [];
  let correct = 0, total = 0, homeBaseline = 0, brier = 0, calib = 0;
  const MIN_PRIOR = 4;

  for (const m of finished) {
    const priorHome = pool.filter((x) => x.home_id === m.home_id || x.away_id === m.home_id).length;
    const priorAway = pool.filter((x) => x.home_id === m.away_id || x.away_id === m.away_id).length;
    if (priorHome >= MIN_PRIOR && priorAway >= MIN_PRIOR) {
      const hs = computeTeamStrengths(pool, m.home_id);
      const as = computeTeamStrengths(pool, m.away_id);
      const base = baselineFromResults(pool);
      const p = predictFromStats(homeVenue(hs), awayVenue(as), base);
      const actual = actualOf(m);
      if (p.pick === actual) correct++;
      if (actual === '1') homeBaseline++;
      // Brier (3-way) + calibration
      const probs: Record<string, number> = { '1': p.homeWin, X: p.draw, '2': p.awayWin };
      for (const k of ['1', 'X', '2']) brier += (probs[k] - (k === actual ? 1 : 0)) ** 2;
      calib += probs[actual];
      total++;
    }
    pool.push(m);
  }
  return { compId, total, correct, homeBaseline, brier, calib, finished: finished.length };
}

(async () => {
  const now = Math.floor(Date.now() / 1000);
  const from = now - 300 * 86400;
  const ids = (process.argv.slice(2).map(Number).filter(Boolean));
  const comps = ids.length ? ids : [68, 253, 71]; // MLS, USL, Brazil Serie A (busy leagues)

  let gTotal = 0, gCorrect = 0, gHome = 0, gBrier = 0, gCalib = 0;
  for (const id of comps) {
    try {
      const r = await backtestCompetition(id, from, now);
      if (r.total === 0) { console.log(`comp ${id}: not enough data (${r.finished} finished)`); continue; }
      const acc = (100 * r.correct) / r.total;
      const homeAcc = (100 * r.homeBaseline) / r.total;
      console.log(
        `comp ${String(id).padEnd(5)} | tested ${String(r.total).padEnd(4)} | model ${acc.toFixed(1)}% | always-home ${homeAcc.toFixed(1)}% | Brier ${(r.brier / r.total).toFixed(3)} | calib ${(100 * r.calib / r.total).toFixed(1)}%`,
      );
      gTotal += r.total; gCorrect += r.correct; gHome += r.homeBaseline; gBrier += r.brier; gCalib += r.calib;
    } catch (e: any) {
      console.log(`comp ${id}: error ${e.message}`);
    }
  }
  if (gTotal > 0) {
    const acc = (100 * gCorrect) / gTotal;
    const homeAcc = (100 * gHome) / gTotal;
    console.log('\n=== OVERALL ===');
    console.log(`tested ${gTotal} matches | MODEL ${acc.toFixed(1)}% vs always-home ${homeAcc.toFixed(1)}% | Brier ${(gBrier / gTotal).toFixed(3)} | calibration ${(100 * gCalib / gTotal).toFixed(1)}%`);
    console.log(acc > homeAcc ? 'PASS: model beats the naive home baseline' : 'WARN: model does not beat always-home on this sample');
  } else {
    console.log('No matches with enough prior data to backtest.');
  }
})();

