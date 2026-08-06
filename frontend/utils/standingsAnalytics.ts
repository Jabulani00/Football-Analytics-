/**
 * Standings analytics engine.
 *
 * Takes the base (overall, full-time) league standings and derives every
 * analytics table described in the analytics-integration spec:
 *
 *   • PPG tables — Overall / Home / Away × Full-time / 1st Half / 2nd Half,
 *     each available plain or as a Green / Yellow / Red performance band.
 *   • Last-6 PPG — same split/period matrix, windowed to the last 6 games.
 *   • Recent-form tables — Last 10 / 8 / 6 games × split × period.
 *   • Probability tables — 34 outcome metrics that re-sort the whole table.
 *
 * The underlying app only stores summary rows (W/D/L, GF/GA, points), so —
 * exactly like the existing deriveHome/deriveAway helpers in leagueFeedData —
 * we synthesise a deterministic per-team match history (seeded by team) and
 * aggregate the requested view from it. Same input always yields the same
 * output, so tables are stable across renders.
 *
 * Every builder returns a plain `StandingRow[]` so the main standings table
 * renders unchanged in structure; only its contents and order respond.
 */
import type { StandingRow } from '@/mock/matchData';

export type Split = 'overall' | 'home' | 'away';
export type Period = 'ft' | '1h' | '2h';
export type Band = 'plain' | 'green' | 'yellow' | 'red';
export type FormWindow = 6 | 8 | 10;

export type Selection =
  | { kind: 'standard' }
  | { kind: 'ppg'; split: Split; period: Period; band: Band }
  | { kind: 'last6ppg'; split: Split; period: Period }
  | { kind: 'form'; window: FormWindow; split: Split; period: Period }
  | { kind: 'prob'; metric: ProbMetricKey };

export type StandingsView = {
  rows: StandingRow[];
  /** Insert a visual divider after this many rows (band tables only). */
  bandDivideAfter?: number;
  /** Human-readable description of the active filter. */
  caption: string;
};

// ---------------------------------------------------------------------------
// Deterministic RNG + hashing
// ---------------------------------------------------------------------------

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Small deterministic PRNG (mulberry32) — stable per seed. */
function makeRng(seed: number): () => number {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Synthetic match history
// ---------------------------------------------------------------------------

type Game = {
  home: boolean;
  gf: number; // full-time goals for
  ga: number; // full-time goals against
  gf1: number; // first-half goals for
  ga1: number; // first-half goals against
};

type Result = 'W' | 'D' | 'L';

/** Build a deterministic per-team season. Index 0 = most recent game. */
function genGames(row: StandingRow): Game[] {
  const rng = makeRng(hash(row.team) * 7 + row.points * 13 + row.gf * 3 + 1);

  const results: Result[] = [];
  for (let i = 0; i < row.won; i++) results.push('W');
  for (let i = 0; i < row.drawn; i++) results.push('D');
  for (let i = 0; i < row.lost; i++) results.push('L');
  // Fisher-Yates shuffle → recency ordering (index 0 = most recent).
  for (let i = results.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [results[i], results[j]] = [results[j], results[i]];
  }

  const avgFor = row.played ? row.gf / row.played : 1;
  const avgAgainst = row.played ? row.ga / row.played : 1;

  const games: Game[] = results.map((res) => {
    let gf = 0;
    let ga = 0;
    if (res === 'W') {
      gf = Math.max(1, Math.round(avgFor + rng() * 1.2));
      ga = Math.max(0, Math.min(gf - 1, Math.round(avgAgainst * 0.5 + rng())));
    } else if (res === 'L') {
      ga = Math.max(1, Math.round(avgAgainst + rng() * 1.2));
      gf = Math.max(0, Math.min(ga - 1, Math.round(avgFor * 0.5 + rng())));
    } else {
      const g = Math.min(3, Math.max(0, Math.round(((avgFor + avgAgainst) / 2) * 0.8 + rng() * 0.7)));
      gf = g;
      ga = g;
    }
    const gf1 = Math.min(gf, Math.round(gf * (0.35 + rng() * 0.3)));
    const ga1 = Math.min(ga, Math.round(ga * (0.35 + rng() * 0.3)));
    return { home: false, gf, ga, gf1, ga1 };
  });

  // Assign ~half the games as home, seeded independently of recency.
  const homeTarget = Math.ceil(games.length / 2);
  const idxs = games.map((_, i) => i);
  for (let i = idxs.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [idxs[i], idxs[j]] = [idxs[j], idxs[i]];
  }
  for (let i = 0; i < homeTarget; i++) games[idxs[i]].home = true;

  return games;
}

// ---------------------------------------------------------------------------
// Aggregation helpers
// ---------------------------------------------------------------------------

function periodGoals(g: Game, period: Period): { gf: number; ga: number } {
  if (period === '1h') return { gf: g.gf1, ga: g.ga1 };
  if (period === '2h') return { gf: g.gf - g.gf1, ga: g.ga - g.ga1 };
  return { gf: g.gf, ga: g.ga };
}

function resultOf(gf: number, ga: number): Result {
  return gf > ga ? 'W' : gf < ga ? 'L' : 'D';
}

function filterSplit(games: Game[], split: Split): Game[] {
  if (split === 'home') return games.filter((g) => g.home);
  if (split === 'away') return games.filter((g) => !g.home);
  return games;
}

type Agg = {
  team: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  points: number;
  ppg: number;
  form: Result[];
};

function aggregate(team: string, games: Game[], period: Period): Agg {
  let won = 0;
  let drawn = 0;
  let lost = 0;
  let gf = 0;
  let ga = 0;
  for (const g of games) {
    const p = periodGoals(g, period);
    gf += p.gf;
    ga += p.ga;
    const r = resultOf(p.gf, p.ga);
    if (r === 'W') won++;
    else if (r === 'D') drawn++;
    else lost++;
  }
  const form: Result[] = [];
  for (let i = 0; i < Math.min(5, games.length); i++) {
    const p = periodGoals(games[i], period);
    form.push(resultOf(p.gf, p.ga));
  }
  const played = games.length;
  const points = won * 3 + drawn;
  return { team, played, won, drawn, lost, gf, ga, points, ppg: played ? points / played : 0, form };
}

function aggToRow(a: Agg): StandingRow & { ppg: number } {
  return {
    pos: 0,
    team: a.team,
    played: a.played,
    won: a.won,
    drawn: a.drawn,
    lost: a.lost,
    gf: a.gf,
    ga: a.ga,
    gd: a.gf - a.ga,
    points: a.points,
    form: a.form,
    ppg: a.ppg,
  };
}

function sortRank(rows: (StandingRow & { ppg?: number })[]): StandingRow[] {
  return [...rows]
    .sort((a, b) => {
      const pa = a.ppg ?? a.points / Math.max(1, a.played);
      const pb = b.ppg ?? b.points / Math.max(1, b.played);
      if (pb !== pa) return pb - pa;
      if (b.points !== a.points) return b.points - a.points;
      return b.gd - a.gd;
    })
    .map((r, i) => ({
      pos: i + 1,
      team: r.team,
      played: r.played,
      won: r.won,
      drawn: r.drawn,
      lost: r.lost,
      gf: r.gf,
      ga: r.ga,
      gd: r.gd,
      points: r.points,
      form: r.form,
    }));
}

/** Cache one synthetic season per team for the duration of a build. */
function gamesMap(base: StandingRow[]): Map<string, Game[]> {
  const m = new Map<string, Game[]>();
  for (const r of base) m.set(r.team, genGames(r));
  return m;
}

// ---------------------------------------------------------------------------
// PPG / windowed tables
// ---------------------------------------------------------------------------

function buildPPGTable(
  base: StandingRow[],
  games: Map<string, Game[]>,
  split: Split,
  period: Period,
  window?: number,
): StandingRow[] {
  // Where we hold the real numbers (overall, full-time, whole season), use them
  // verbatim so the analytics view matches the actual standings.
  if (split === 'overall' && period === 'ft' && !window) {
    return sortRank(
      base.map((r) => ({ ...r, ppg: r.points / Math.max(1, r.played) })),
    );
  }
  const rows = base.map((r) => {
    let g = filterSplit(games.get(r.team)!, split);
    if (window) g = g.slice(0, window);
    return aggToRow(aggregate(r.team, g, period));
  });
  return sortRank(rows);
}

// ---------------------------------------------------------------------------
// Color-band tables (perform-against-band)
// ---------------------------------------------------------------------------

/** Two-legged synthetic head-to-head; points/goals earned by A vs B. */
function h2h(
  aStrength: number,
  bStrength: number,
  seedA: number,
  seedB: number,
): { pts: number; w: number; d: number; l: number; gf: number; ga: number } {
  let pts = 0;
  let w = 0;
  let d = 0;
  let l = 0;
  let gf = 0;
  let ga = 0;
  for (let leg = 0; leg < 2; leg++) {
    const home = leg === 0;
    const rng = makeRng(seedA * 131 + seedB * 17 + leg * 7 + 3);
    const diff = aStrength - bStrength + (home ? 0.35 : -0.15) + (rng() - 0.5) * 1.4;
    const r: Result = diff > 0.4 ? 'W' : diff < -0.4 ? 'L' : 'D';
    let agf = Math.max(0, Math.round(1 + aStrength * 0.7 + (r === 'W' ? 1 : 0) + (rng() - 0.5)));
    let aga = Math.max(0, Math.round(1 + bStrength * 0.7 + (r === 'L' ? 1 : 0) + (rng() - 0.5)));
    if (r === 'W' && agf <= aga) agf = aga + 1;
    if (r === 'L' && aga <= agf) aga = agf + 1;
    if (r === 'D') aga = agf;
    gf += agf;
    ga += aga;
    if (r === 'W') {
      pts += 3;
      w++;
    } else if (r === 'D') {
      pts += 1;
      d++;
    } else {
      l++;
    }
  }
  return { pts, w, d, l, gf, ga };
}

function bandGroups(plain: StandingRow[]): { green: string[]; yellow: string[]; red: string[] } {
  const n = plain.length;
  const third = Math.max(1, Math.ceil(n / 3));
  const green = plain.slice(0, third).map((r) => r.team);
  const red = plain.slice(Math.max(third, n - third)).map((r) => r.team);
  const redSet = new Set(red);
  const greenSet = new Set(green);
  const yellow = plain.filter((r) => !greenSet.has(r.team) && !redSet.has(r.team)).map((r) => r.team);
  return { green, yellow, red };
}

function buildBandTable(
  base: StandingRow[],
  games: Map<string, Game[]>,
  split: Split,
  period: Period,
  band: Exclude<Band, 'plain'>,
): { rows: StandingRow[]; bandDivideAfter: number } {
  const plain = buildPPGTable(base, games, split, period);
  const groups = bandGroups(plain);
  const bandTeams = groups[band];
  const bandSet = new Set(bandTeams);

  const strength = new Map<string, number>();
  for (const r of plain) strength.set(r.team, r.points / Math.max(1, r.played));

  // Band teams shown at the top in their plain order.
  const plainByTeam = new Map(plain.map((r) => [r.team, r]));
  const bandRows: StandingRow[] = bandTeams
    .map((t) => plainByTeam.get(t)!)
    .map((r, i) => ({ ...r, pos: i + 1 }));

  // Everyone else ranked purely by points earned against the band.
  const others = base.filter((r) => !bandSet.has(r.team));
  const scored = others.map((r) => {
    let pts = 0;
    let w = 0;
    let d = 0;
    let l = 0;
    let gf = 0;
    let ga = 0;
    for (const opp of bandTeams) {
      const res = h2h(strength.get(r.team) ?? 0, strength.get(opp) ?? 0, hash(r.team), hash(opp));
      pts += res.pts;
      w += res.w;
      d += res.d;
      l += res.l;
      gf += res.gf;
      ga += res.ga;
    }
    return {
      pos: 0,
      team: r.team,
      played: bandTeams.length * 2,
      won: w,
      drawn: d,
      lost: l,
      gf,
      ga,
      gd: gf - ga,
      points: pts,
      form: r.form,
    } satisfies StandingRow;
  });
  scored.sort((a, b) => (b.points !== a.points ? b.points - a.points : b.gd - a.gd));
  const otherRows = scored.map((r, i) => ({ ...r, pos: bandRows.length + i + 1 }));

  return { rows: [...bandRows, ...otherRows], bandDivideAfter: bandRows.length };
}

// ---------------------------------------------------------------------------
// Probability metrics (34)
// ---------------------------------------------------------------------------

export type ProbMetricKey =
  | 'sc'
  | 'conc'
  | 'scm'
  | 'concm'
  | 'bttsY'
  | 'bttsN'
  | 'cs'
  | 'avg'
  | 'fts'
  | 'w'
  | 'd'
  | 'l'
  | 'o15'
  | 'o25'
  | 'o35'
  | 'o45'
  | 'u15'
  | 'u25'
  | 'u35'
  | 'u45'
  | 'o05'
  | 'u05'
  | 'tsc05'
  | 'tconc05'
  | 'tsc15'
  | 'tconc15'
  | 'tsc25'
  | 'tconc25'
  | 'scoredFirst'
  | 'handicap'
  | 'early1h'
  | 'early2h'
  | 'earlyConc'
  | 'late';

export type ProbMetric = { key: ProbMetricKey; label: string; short: string };

export const PROB_METRICS: ProbMetric[] = [
  { key: 'sc', label: 'Scoring %', short: 'SC%' },
  { key: 'conc', label: 'Conceding %', short: 'Conc%' },
  { key: 'scm', label: 'Goals scored / match (avg)', short: 'SC/m' },
  { key: 'concm', label: 'Goals conceded / match (avg)', short: 'Conc/m' },
  { key: 'bttsY', label: 'Both Teams to Score — Yes', short: 'BTTS-Y' },
  { key: 'bttsN', label: 'Both Teams to Score — No', short: 'BTTS-N' },
  { key: 'cs', label: 'Clean sheets', short: 'CS' },
  { key: 'avg', label: 'Average goals / match', short: 'AVG' },
  { key: 'fts', label: 'Failed to score', short: 'FTS' },
  { key: 'w', label: 'Wins', short: 'W%' },
  { key: 'd', label: 'Draws', short: 'D%' },
  { key: 'l', label: 'Losses', short: 'L%' },
  { key: 'o15', label: 'Over 1.5 goals', short: 'O1.5' },
  { key: 'o25', label: 'Over 2.5 goals', short: 'O2.5' },
  { key: 'o35', label: 'Over 3.5 goals', short: 'O3.5' },
  { key: 'o45', label: 'Over 4.5 goals', short: 'O4.5' },
  { key: 'u15', label: 'Under 1.5 goals', short: 'U1.5' },
  { key: 'u25', label: 'Under 2.5 goals', short: 'U2.5' },
  { key: 'u35', label: 'Under 3.5 goals', short: 'U3.5' },
  { key: 'u45', label: 'Under 4.5 goals', short: 'U4.5' },
  { key: 'o05', label: 'Over 0.5 goals', short: 'O0.5' },
  { key: 'u05', label: 'Under 0.5 goals', short: 'U0.5' },
  { key: 'tsc05', label: 'Scoring 0.5+ goals', short: 'SC0.5+' },
  { key: 'tconc05', label: 'Conceding 0.5+ goals', short: 'CN0.5+' },
  { key: 'tsc15', label: 'Scoring 1.5+ goals', short: 'SC1.5+' },
  { key: 'tconc15', label: 'Conceding 1.5+ goals', short: 'CN1.5+' },
  { key: 'tsc25', label: 'Scoring 2.5+ goals', short: 'SC2.5+' },
  { key: 'tconc25', label: 'Conceding 2.5+ goals', short: 'CN2.5+' },
  { key: 'scoredFirst', label: 'Scored first', short: 'ScrdF' },
  { key: 'handicap', label: 'Handicap (avg margin)', short: 'HCP' },
  { key: 'early1h', label: 'Early goals — first 20 min', short: 'E20' },
  { key: 'early2h', label: 'Early goals — up to 60 min', short: 'E60' },
  { key: 'earlyConc', label: 'Early goals conceded', short: 'EC' },
  { key: 'late', label: 'Late goals — from 70 min', short: 'L70' },
];

function pct(games: Game[], cond: (g: Game) => boolean): number {
  if (!games.length) return 0;
  return (games.filter(cond).length / games.length) * 100;
}

function probValue(row: StandingRow, games: Game[], metric: ProbMetricKey): number {
  const total = (g: Game) => g.gf + g.ga;
  const n = games.length || 1;
  const rng = makeRng(hash(row.team) + hash(metric) * 101);
  switch (metric) {
    case 'sc':
      return pct(games, (g) => g.gf >= 1);
    case 'conc':
      return pct(games, (g) => g.ga >= 1);
    case 'scm':
      return games.reduce((s, g) => s + g.gf, 0) / n;
    case 'concm':
      return games.reduce((s, g) => s + g.ga, 0) / n;
    case 'bttsY':
      return pct(games, (g) => g.gf >= 1 && g.ga >= 1);
    case 'bttsN':
      return pct(games, (g) => !(g.gf >= 1 && g.ga >= 1));
    case 'cs':
      return pct(games, (g) => g.ga === 0);
    case 'avg':
      return games.reduce((s, g) => s + total(g), 0) / n;
    case 'fts':
      return pct(games, (g) => g.gf === 0);
    case 'w':
      return pct(games, (g) => g.gf > g.ga);
    case 'd':
      return pct(games, (g) => g.gf === g.ga);
    case 'l':
      return pct(games, (g) => g.gf < g.ga);
    case 'o15':
      return pct(games, (g) => total(g) >= 2);
    case 'o25':
      return pct(games, (g) => total(g) >= 3);
    case 'o35':
      return pct(games, (g) => total(g) >= 4);
    case 'o45':
      return pct(games, (g) => total(g) >= 5);
    case 'u15':
      return pct(games, (g) => total(g) <= 1);
    case 'u25':
      return pct(games, (g) => total(g) <= 2);
    case 'u35':
      return pct(games, (g) => total(g) <= 3);
    case 'u45':
      return pct(games, (g) => total(g) <= 4);
    case 'o05':
      return pct(games, (g) => total(g) >= 1);
    case 'u05':
      return pct(games, (g) => total(g) === 0);
    case 'tsc05':
      return pct(games, (g) => g.gf >= 1);
    case 'tconc05':
      return pct(games, (g) => g.ga >= 1);
    case 'tsc15':
      return pct(games, (g) => g.gf >= 2);
    case 'tconc15':
      return pct(games, (g) => g.ga >= 2);
    case 'tsc25':
      return pct(games, (g) => g.gf >= 3);
    case 'tconc25':
      return pct(games, (g) => g.ga >= 3);
    case 'handicap':
      return games.reduce((s, g) => s + (g.gf - g.ga), 0) / n;
    case 'scoredFirst': {
      // No minute data — anchor to attacking strength with a stable jitter.
      const base = pct(games, (g) => g.gf >= 1);
      return Math.min(100, base * 0.6 + (rng() - 0.5) * 12 + 15);
    }
    case 'early1h':
      return Math.min(100, pct(games, (g) => g.gf1 >= 1) * 0.5 + rng() * 8);
    case 'early2h':
      return Math.min(100, pct(games, (g) => g.gf >= 1) * 0.55 + rng() * 8);
    case 'earlyConc':
      return Math.min(100, pct(games, (g) => g.ga1 >= 1) * 0.5 + rng() * 8);
    case 'late':
      return Math.min(100, pct(games, (g) => g.gf - g.gf1 >= 1) * 0.6 + rng() * 10);
    default:
      return 0;
  }
}

function buildProbTable(
  base: StandingRow[],
  games: Map<string, Game[]>,
  metric: ProbMetricKey,
): StandingRow[] {
  return [...base]
    .map((r) => ({ row: r, v: probValue(r, games.get(r.team)!, metric) }))
    .sort((a, b) => b.v - a.v)
    .map(({ row }, i) => ({ ...row, pos: i + 1 }));
}

// ---------------------------------------------------------------------------
// Captions
// ---------------------------------------------------------------------------

const SPLIT_LABEL: Record<Split, string> = { overall: 'Overall', home: 'Home', away: 'Away' };
const PERIOD_LABEL: Record<Period, string> = { ft: 'Full-time', '1h': '1st Half', '2h': '2nd Half' };
const BAND_LABEL: Record<Exclude<Band, 'plain'>, string> = {
  green: '🟢 Green band',
  yellow: '🟡 Yellow band',
  red: '🔴 Red band',
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function buildStandingsView(base: StandingRow[], sel: Selection): StandingsView {
  if (sel.kind === 'standard') {
    return { rows: base, caption: 'League standings' };
  }
  const games = gamesMap(base);

  if (sel.kind === 'ppg') {
    if (sel.band === 'plain') {
      return {
        rows: buildPPGTable(base, games, sel.split, sel.period),
        caption: `${SPLIT_LABEL[sel.split]} · ${PERIOD_LABEL[sel.period]} · PPG`,
      };
    }
    const { rows, bandDivideAfter } = buildBandTable(base, games, sel.split, sel.period, sel.band);
    return {
      rows,
      bandDivideAfter,
      caption: `${SPLIT_LABEL[sel.split]} · ${PERIOD_LABEL[sel.period]} · ${BAND_LABEL[sel.band]} — points won vs the band`,
    };
  }

  if (sel.kind === 'last6ppg') {
    return {
      rows: buildPPGTable(base, games, sel.split, sel.period, 6),
      caption: `${SPLIT_LABEL[sel.split]} · ${PERIOD_LABEL[sel.period]} · Last 6 PPG`,
    };
  }

  if (sel.kind === 'form') {
    return {
      rows: buildPPGTable(base, games, sel.split, sel.period, sel.window),
      caption: `Last ${sel.window} · ${SPLIT_LABEL[sel.split]} · ${PERIOD_LABEL[sel.period]}`,
    };
  }

  // prob
  const metric = PROB_METRICS.find((m) => m.key === sel.metric) ?? PROB_METRICS[0];
  return {
    rows: buildProbTable(base, games, sel.metric),
    caption: `Ranked by ${metric.label} (${metric.short})`,
  };
}

// ---------------------------------------------------------------------------
// Rank-number zone colouring (promotion / relegation / cup qualification)
// ---------------------------------------------------------------------------

export type PosZone = 'promotion' | 'championsLeague' | 'europaLeague' | 'relegation' | null;

/** Competitive meaning of a finishing position, scaled to league size. */
export function getPosZone(pos: number, total: number): PosZone {
  if (total <= 0) return null;
  if (pos === 1) return 'promotion';
  if (pos <= Math.max(2, Math.round(total * 0.18))) return 'championsLeague';
  if (pos <= Math.max(3, Math.round(total * 0.34))) return 'europaLeague';
  if (pos > total - Math.max(1, Math.round(total * 0.16))) return 'relegation';
  return null;
}
