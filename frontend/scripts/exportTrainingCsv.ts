/**
 * Training-data exporter — builds a leak-free CSV for match-outcome prediction,
 * using the app's own stat terminology.
 *
 * It pulls finished fixtures across many leagues from the OddAlerts proxy, walks
 * each team's matches in time order, and for every match writes:
 *   - match details (league, season, date, teams, scores),
 *   - POINT-IN-TIME pre-match form for each side (only games played BEFORE the
 *     match — no leakage), overall and venue, in our vocabulary (scored %, BTTS %,
 *     over 2.5 %, clean-sheet %, PPG, …),
 *   - the targets to predict (result, goals, BTTS, over/under, half-time).
 *
 * Usage:  npx tsx scripts/exportTrainingCsv.ts [months=14] [maxPages=90] [out=../training_data.csv]
 */
import { writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ---- config -----------------------------------------------------------------
const MONTHS = Number(process.argv[2] ?? 14);
const MAX_PAGES = Number(process.argv[3] ?? 90);
const OUT = process.argv[4] ?? '../training_data.csv';
const PER_PAGE = 250;
const WIN_OVERALL = 10;   // last-N overall form
const WIN_VENUE = 6;      // last-N venue (home team home / away team away) form
const MIN_OVERALL = 5;    // both teams need this many prior games to emit a row

function proxyBase(): string {
  try {
    const env = readFileSync(resolve(__dirname, '../.env'), 'utf8');
    const m = env.match(/^EXPO_PUBLIC_ODDALERTS_PROXY=(.+)$/m);
    if (m) return m[1].trim();
  } catch { /* fall through */ }
  return 'https://football-analytics-rose.vercel.app/oddalerts';
}
const PROXY = proxyBase();

type Raw = {
  id: number; unix: number; status: string;
  home_id: number | null; away_id: number | null; home_name: string; away_name: string;
  home_goals: number | null; away_goals: number | null; ht_score: string | null;
  competition_id?: number; competition_name?: string; season?: string | null;
};
const FINISHED = new Set(['FT', 'AET', 'PEN', 'FT_PEN', 'AWD', 'AWARDED', 'WO']);

async function fetchPage(from: number, to: number, page: number): Promise<{ rows: Raw[]; hasNext: boolean }> {
  const url = `${PROXY}?path=fixtures/between&from=${from}&to=${to}&per_page=${PER_PAGE}&page=${page}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`page ${page}: HTTP ${res.status}`);
  const body = await res.json() as { data?: Raw[]; info?: { next_page_url?: string | null } };
  return { rows: body.data ?? [], hasNext: Boolean(body.info?.next_page_url) };
}

function parseHt(s: string | null): [number, number] | null {
  if (!s) return null;
  const m = s.match(/^(\d+)\s*-\s*(\d+)$/);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

// One match from a team's perspective, for rolling form.
type Persp = { unix: number; isHome: boolean; gf: number; ga: number; htGf: number | null; htGa: number | null };

function rnd(v: number, d = 3): number { return Math.round(v * 10 ** d) / 10 ** d; }

/** Aggregate a team's form over its most recent `n` perspective-matches. */
function form(hist: Persp[], n: number): Record<string, number> {
  const s = hist.slice(-n);
  const g = s.length;
  if (g === 0) return { n: 0 };
  const sum = (f: (m: Persp) => number) => s.reduce((t, m) => t + f(m), 0);
  const pct = (f: (m: Persp) => boolean) => rnd((100 * s.filter(f).length) / g, 1);
  const ht = s.filter((m) => m.htGf != null && m.htGa != null);
  const htPct = (f: (m: Persp) => boolean) => (ht.length ? rnd((100 * ht.filter(f).length) / ht.length, 1) : 0);
  const pts = sum((m) => (m.gf > m.ga ? 3 : m.gf === m.ga ? 1 : 0));
  return {
    n: g,
    gf_avg: rnd(sum((m) => m.gf) / g, 2),
    ga_avg: rnd(sum((m) => m.ga) / g, 2),
    goals_avg: rnd(sum((m) => m.gf + m.ga) / g, 2),
    ppg: rnd(pts / g, 2),
    scored_pct: pct((m) => m.gf > 0),
    conceded_pct: pct((m) => m.ga > 0),
    clean_sheet_pct: pct((m) => m.ga === 0),
    failed_to_score_pct: pct((m) => m.gf === 0),
    btts_pct: pct((m) => m.gf > 0 && m.ga > 0),
    over_1_5_pct: pct((m) => m.gf + m.ga >= 2),
    over_2_5_pct: pct((m) => m.gf + m.ga >= 3),
    over_3_5_pct: pct((m) => m.gf + m.ga >= 4),
    win_pct: pct((m) => m.gf > m.ga),
    draw_pct: pct((m) => m.gf === m.ga),
    loss_pct: pct((m) => m.gf < m.ga),
    scored_1h_pct: htPct((m) => (m.htGf ?? 0) > 0),
    conceded_1h_pct: htPct((m) => (m.htGa ?? 0) > 0),
  };
}

async function main() {
  const now = Math.floor(Date.now() / 1000);
  const from = now - MONTHS * 30 * 24 * 3600;
  console.log(`Proxy: ${PROXY}`);
  console.log(`Window: ${MONTHS} months · up to ${MAX_PAGES} pages × ${PER_PAGE}`);

  // 1) pull finished fixtures — concurrent batches, stop on the first empty page.
  const CONCURRENCY = 6;
  const raw: Raw[] = [];
  let stop = false;
  for (let base = 1; base <= MAX_PAGES && !stop; base += CONCURRENCY) {
    const pages = Array.from({ length: Math.min(CONCURRENCY, MAX_PAGES - base + 1) }, (_, i) => base + i);
    const got = await Promise.all(pages.map(async (page) => {
      try { return await fetchPage(from, now, page); }
      catch { await new Promise((r) => setTimeout(r, 1200)); try { return await fetchPage(from, now, page); } catch { return { rows: [] as Raw[], hasNext: false }; } }
    }));
    for (const g of got) { raw.push(...g.rows); if (g.rows.length === 0 || !g.hasNext) stop = true; }
    console.log(`  pages ${pages[0]}–${pages[pages.length - 1]}: ${raw.length} fixtures so far`);
  }

  const finished = raw.filter((f) =>
    FINISHED.has(f.status) && f.home_goals != null && f.away_goals != null && f.home_id != null && f.away_id != null,
  ).sort((a, b) => a.unix - b.unix);
  console.log(`Finished fixtures: ${finished.length}`);

  // 2) walk in time order, building point-in-time features.
  const hist = new Map<number, Persp[]>();
  const push = (teamId: number, p: Persp) => { const l = hist.get(teamId) ?? []; l.push(p); hist.set(teamId, l); };
  const venue = (teamId: number, home: boolean) => (hist.get(teamId) ?? []).filter((m) => m.isHome === home);

  const rows: Record<string, string | number>[] = [];
  for (const f of finished) {
    const hId = f.home_id!, aId = f.away_id!;
    const hHist = hist.get(hId) ?? [], aHist = hist.get(aId) ?? [];
    const hg = f.home_goals!, ag = f.away_goals!;
    const ht = parseHt(f.ht_score);

    if (hHist.length >= MIN_OVERALL && aHist.length >= MIN_OVERALL) {
      const hOvr = form(hHist, WIN_OVERALL), hVen = form(venue(hId, true), WIN_VENUE);
      const aOvr = form(aHist, WIN_OVERALL), aVen = form(venue(aId, false), WIN_VENUE);
      const row: Record<string, string | number> = {
        fixture_id: f.id,
        date: new Date(f.unix * 1000).toISOString().slice(0, 10),
        competition_id: f.competition_id ?? '',
        competition: f.competition_name ?? '',
        season: f.season ?? '',
        home_id: hId, home_team: f.home_name,
        away_id: aId, away_team: f.away_name,
      };
      for (const [k, v] of Object.entries(hOvr)) row[`h_ovr_${k}`] = v;
      for (const [k, v] of Object.entries(hVen)) row[`h_home_${k}`] = v;
      for (const [k, v] of Object.entries(aOvr)) row[`a_ovr_${k}`] = v;
      for (const [k, v] of Object.entries(aVen)) row[`a_away_${k}`] = v;
      // targets (what actually happened).
      Object.assign(row, {
        y_home_goals: hg, y_away_goals: ag, y_total_goals: hg + ag, y_goal_diff: hg - ag,
        y_result: hg > ag ? 'H' : hg < ag ? 'A' : 'D',
        y_home_win: hg > ag ? 1 : 0, y_draw: hg === ag ? 1 : 0, y_away_win: hg < ag ? 1 : 0,
        y_btts: hg > 0 && ag > 0 ? 1 : 0,
        y_over_1_5: hg + ag >= 2 ? 1 : 0, y_over_2_5: hg + ag >= 3 ? 1 : 0, y_over_3_5: hg + ag >= 4 ? 1 : 0,
        y_ht_home: ht ? ht[0] : '', y_ht_away: ht ? ht[1] : '', y_ht_total: ht ? ht[0] + ht[1] : '',
        y_ht_btts: ht ? (ht[0] > 0 && ht[1] > 0 ? 1 : 0) : '',
        y_1h_result: ht ? (ht[0] > ht[1] ? 'H' : ht[0] < ht[1] ? 'A' : 'D') : '',
        y_2h_total: ht ? (hg - ht[0]) + (ag - ht[1]) : '',
      });
      rows.push(row);
    }

    // append this match to both teams' histories (AFTER features are computed).
    push(hId, { unix: f.unix, isHome: true, gf: hg, ga: ag, htGf: ht ? ht[0] : null, htGa: ht ? ht[1] : null });
    push(aId, { unix: f.unix, isHome: false, gf: ag, ga: hg, htGf: ht ? ht[1] : null, htGa: ht ? ht[0] : null });
  }

  // 3) write CSV.
  if (!rows.length) { console.error('No training rows produced.'); process.exit(1); }
  const cols = Object.keys(rows[0]);
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c] ?? '')).join(','))].join('\n');
  const outPath = resolve(__dirname, OUT);
  writeFileSync(outPath, csv, 'utf8');

  const leagues = new Set(rows.map((r) => r.competition));
  const teams = new Set(rows.flatMap((r) => [r.home_team, r.away_team]));
  console.log(`\n✓ Wrote ${rows.length} rows × ${cols.length} columns`);
  console.log(`  Leagues: ${leagues.size} · Teams: ${teams.size}`);
  console.log(`  File: ${outPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
