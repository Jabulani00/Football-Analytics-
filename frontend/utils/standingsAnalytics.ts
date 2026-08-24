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
  | { kind: 'prob'; metric: ProbMetricKey; period: Period };

/** The value column shown for a probability metric (the stat it's ranked by). */
export type MetricColumn = {
  /** Short header, e.g. "SC%" or "E20". */
  header: string;
  /** Full metric label. */
  full: string;
  /** Per-team display: the headline value + a supporting stat line. */
  values: Map<string, { display: string; sub: string }>;
};

export type StandingsView = {
  rows: StandingRow[];
  /** Insert a visual divider after this many rows (band tables only). */
  bandDivideAfter?: number;
  /** Human-readable description of the active filter. */
  caption: string;
  /** Present for probability tables — the value shown + ranked per team. */
  metric?: MetricColumn;
  /**
   * Provenance for goal-timing tables: 'measured' when every row came from the
   * provider's recorded timings, 'partial' when only some did, 'estimated'
   * when none did. Absent for metrics that are not timing-based.
   */
  timingSource?: 'measured' | 'partial' | 'estimated';
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

/** Deterministic Poisson draw (Knuth), capped so scorelines stay sane. */
function samplePoisson(rng: () => number, lambda: number): number {
  const L = Math.exp(-Math.max(0.05, lambda));
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng();
  } while (p > L && k < 8);
  return k - 1;
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
    // Poisson draws let 0-goal games (clean sheets, 0-0s, failed-to-score)
    // occur at realistic rates, so BTTS/CS/FTS markets are meaningful.
    if (res === 'W') {
      gf = Math.max(1, samplePoisson(rng, Math.max(1.1, avgFor)));
      ga = samplePoisson(rng, Math.max(0.5, avgAgainst * 0.7));
      if (ga >= gf) ga = gf - 1;
    } else if (res === 'L') {
      ga = Math.max(1, samplePoisson(rng, Math.max(1.1, avgAgainst)));
      gf = samplePoisson(rng, Math.max(0.5, avgFor * 0.7));
      if (gf >= ga) gf = ga - 1;
    } else {
      const g = samplePoisson(rng, Math.max(0.4, ((avgFor + avgAgainst) / 2) * 0.85));
      gf = g;
      ga = g;
    }
    gf = Math.max(0, gf);
    ga = Math.max(0, ga);
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

/**
 * Re-express each game so its full-time goals become the chosen period's goals
 * (e.g. 1st-half only). Lets the probability metrics be computed for Full-time,
 * 1st Half or 2nd Half.
 */
function projectPeriod(games: Game[], period: Period): Game[] {
  if (period === 'ft') return games;
  return games.map((g) => {
    const p = periodGoals(g, period);
    return { home: g.home, gf: p.gf, ga: p.ga, gf1: Math.round(p.gf * 0.5), ga1: Math.round(p.ga * 0.5) };
  });
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

type BandRecord = { pts: number; w: number; d: number; l: number; gf: number; ga: number; games: number };

/**
 * A team's record against a colour band, bounded by the games it has actually
 * played. We can't exceed `played` real matches — a side that has played 2
 * games can't have 10 results (or 18 points) versus a band. So we estimate how
 * many of those games fell against the band (proportional to the band's size)
 * and simulate only that many, seeded deterministically.
 */
function recordVsBand(
  team: StandingRow,
  bandTeams: string[],
  strength: Map<string, number>,
  totalTeams: number,
): BandRecord {
  const nOpponents = Math.max(1, totalTeams - 1);
  const estimate = Math.round((team.played * bandTeams.length) / nOpponents);
  const games = Math.max(0, Math.min(team.played, estimate));

  const me = strength.get(team.team) ?? 0;
  const rng = makeRng(hash(team.team) * 71 + bandTeams.length * 13 + 5);
  const rec: BandRecord = { pts: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, games };

  for (let i = 0; i < games; i++) {
    const opp = bandTeams[i % bandTeams.length];
    const so = strength.get(opp) ?? 0;
    const home = i % 2 === 0;
    const diff = me - so + (home ? 0.3 : -0.15) + (rng() - 0.5) * 1.3;
    const res: Result = diff > 0.4 ? 'W' : diff < -0.4 ? 'L' : 'D';
    let mg = Math.max(0, Math.round(1 + me * 0.6 + (res === 'W' ? 1 : 0) + (rng() - 0.5)));
    let og = Math.max(0, Math.round(1 + so * 0.6 + (res === 'L' ? 1 : 0) + (rng() - 0.5)));
    if (res === 'W' && mg <= og) mg = og + 1;
    if (res === 'L' && og <= mg) og = mg + 1;
    if (res === 'D') og = mg;
    rec.gf += mg;
    rec.ga += og;
    if (res === 'W') {
      rec.pts += 3;
      rec.w++;
    } else if (res === 'D') {
      rec.pts += 1;
      rec.d++;
    } else {
      rec.l++;
    }
  }
  return rec;
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

  // Everyone else ranked purely by points earned against the band — bounded by
  // the number of games each team has actually played.
  const others = base.filter((r) => !bandSet.has(r.team));
  const scored = others.map((r) => {
    const rec = recordVsBand(r, bandTeams, strength, base.length);
    return {
      pos: 0,
      team: r.team,
      played: rec.games,
      won: rec.w,
      drawn: rec.d,
      lost: rec.l,
      gf: rec.gf,
      ga: rec.ga,
      gd: rec.gf - rec.ga,
      points: rec.pts,
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
  { key: 'early1h', label: 'First goal — average minute', short: 'FG' },
  { key: 'earlyConc', label: 'First goal conceded — average minute', short: 'FGA' },
  { key: 'late', label: 'Late goals — from 70 min', short: 'L70' },
  { key: 'early2h', label: 'Late goals conceded — from 70 min', short: 'LC70' },
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
      // Share of matches scoring inside the opening 15 minutes (~a third of
      // the half), so the estimate lands near the measured window.
      return Math.min(100, pct(games, (g) => g.gf1 >= 1) * 0.35 + rng() * 5);
    case 'early2h':
      // Late goals conceded — estimated from second-half goals against.
      return Math.min(100, pct(games, (g) => g.ga - g.ga1 >= 1) * 0.6 + rng() * 10);
    case 'earlyConc':
      return Math.min(100, pct(games, (g) => g.ga1 >= 1) * 0.35 + rng() * 5);
    case 'late':
      return Math.min(100, pct(games, (g) => g.gf - g.gf1 >= 1) * 0.6 + rng() * 10);
    default:
      return 0;
  }
}

/** Metrics that read as an average number rather than a percentage. */
const AVG_METRICS = new Set<ProbMetricKey>(['scm', 'concm', 'avg', 'handicap']);

/**
 * Metrics that are about *when* a goal arrives rather than how often. These
 * show a minute as the headline value and rank by it, so the table answers
 * "who gets there first?" — the percentage moves to the supporting stat line.
 */
type TimingSpec = {
  /** Goals the team scores, or the ones it ships. */
  side: 'for' | 'against';
  /** Which goal of the game we time — the opening one or the closing one. */
  edge: 'first' | 'last';
  /** Wording for the percentage on the stat line, e.g. "by 20'". */
  windowLabel: string;
};

const TIMING_SPECS: Partial<Record<ProbMetricKey, TimingSpec>> = {
  early1h: { side: 'for', edge: 'first', windowLabel: "scored by 15'" },
  early2h: { side: 'against', edge: 'last', windowLabel: "from 70'" },
  earlyConc: { side: 'against', edge: 'first', windowLabel: "conceded by 15'" },
  late: { side: 'for', edge: 'last', windowLabel: "from 70'" },
};

/**
 * Measured goal timing for one team, as supplied by the caller.
 *
 * Mirrors `TeamGoalTiming` in services/oddAlerts, kept as a local shape so this
 * module stays free of any API import and remains testable with plain objects.
 */
export type TeamTiming = {
  firstGoalFor: number | null;
  firstGoalAgainst: number | null;
  scoredIn15: { count: number; pct: number };
  concededIn15: { count: number; pct: number };
  scoredAfter70: { count: number; pct: number };
  concededAfter70: { count: number; pct: number };
  coveragePct: number;
};

/**
 * The real cell for a goal-timing metric, or null when this team has no
 * measured timing (a competition the provider does not cover, or a side that
 * has not scored yet). Callers fall back to the estimate in that case.
 *
 * `first`-edge metrics headline the average minute and rank earliest-first;
 * `last`-edge metrics headline the share of matches with a late goal, because
 * the API measures that as a rate rather than a minute.
 */
function realTimingCell(metric: ProbMetricKey, t: TeamTiming, played: number): Cell | null {
  if (metric === 'early1h' || metric === 'earlyConc') {
    const forSide = metric === 'early1h';
    const minute = forSide ? t.firstGoalFor : t.firstGoalAgainst;
    if (minute == null) return null;
    const window = forSide ? t.scoredIn15 : t.concededIn15;
    const verb = forSide ? 'scored' : 'conceded';
    return {
      value: minute,
      asc: true,
      display: `${minute.toFixed(1)}'`,
      sub: `${Math.round(window.pct)}% ${verb} by 15'`,
    };
  }
  if (metric === 'late' || metric === 'early2h') {
    const window = metric === 'late' ? t.scoredAfter70 : t.concededAfter70;
    if (!played) return null;
    return {
      value: window.pct,
      asc: false,
      display: `${Math.round(window.pct)}%`,
      sub: `${window.count} of ${played}`,
    };
  }
  return null;
}

/** The minutes a period can actually contain a goal in. */
function periodBounds(period: Period): { lo: number; hi: number } {
  if (period === '1h') return { lo: 1, hi: 45 };
  if (period === '2h') return { lo: 46, hi: 90 };
  return { lo: 1, hi: 90 };
}

/**
 * Estimated minute of a team's opening (or closing) goal. No real minute data
 * exists in the synthetic history, so — like the app's other goal-timing
 * estimates — we derive a deterministic, plausible minute: the more often a
 * side scores, the sooner its first goal lands (and the later its last one).
 * The result is clamped to the period on screen, so a 2nd-half table never
 * reports a first-half minute.
 */
function synthGoalMinute(
  row: StandingRow,
  games: Game[],
  spec: TimingSpec,
  period: Period,
): number {
  const rng = makeRng(hash(row.team) * 53 + hash(spec.side + spec.edge) * 17 + 7);
  const scored = games.reduce((s, g) => s + (spec.side === 'for' ? g.gf : g.ga), 0);
  const gpm = games.length ? scored / games.length : 0.9;
  const rate = Math.min(1, gpm / 2.4); // 0 (rare) … 1 (frequent)
  // A prolific side opens early; its last goal, by the same token, comes late.
  const frac = spec.edge === 'first' ? 0.62 - rate * 0.42 : 0.5 + rate * 0.38;
  const jitter = (rng() - 0.5) * 0.14;
  const { lo, hi } = periodBounds(period);
  const t = Math.min(0.97, Math.max(0.05, frac + jitter));
  return Math.round(lo + (hi - lo) * t);
}

type Cell = { value: number; asc: boolean; display: string; sub: string };

/**
 * The value + supporting stat shown for one team on a probability metric, plus
 * how to rank it (asc = smaller-is-better, e.g. earliest goal first).
 */
function metricCell(
  row: StandingRow,
  games: Game[],
  metric: ProbMetricKey,
  period: Period,
  measured?: TeamTiming,
): Cell {
  const n = games.length;

  const spec = TIMING_SPECS[metric];
  if (spec) {
    // Measured timing covers the whole match, so it answers the Full-time view
    // only; the half views keep the estimate.
    if (measured && period === 'ft') {
      const real = realTimingCell(metric, measured, row.played);
      if (real) return real;
    }
    // Fallback estimate. It must mirror the measured column's shape, or the
    // same metric would read as a minute for one competition and a rate for
    // another: a minute for the first-goal pair, a rate for the late pair.
    if (spec.edge === 'last') {
      const v = probValue(row, games, metric);
      return { value: v, asc: false, display: `${Math.round(v)}%`, sub: `~${Math.round((v / 100) * n)} of ${n} est.` };
    }
    const minute = synthGoalMinute(row, games, spec, period);
    const hitRate = Math.round(probValue(row, games, metric));
    return {
      value: minute,
      asc: true,
      display: `${minute}'`,
      sub: `${hitRate}% ${spec.windowLabel} est.`,
    };
  }

  const v = probValue(row, games, metric);

  if (AVG_METRICS.has(metric)) {
    const display = metric === 'handicap' ? `${v >= 0 ? '+' : ''}${v.toFixed(2)}` : v.toFixed(2);
    const sub = metric === 'handicap' ? 'avg goal margin' : 'goals / match';
    return { value: v, asc: false, display, sub };
  }

  // Percentage metrics: show the % and how many of the games hit it.
  const hits = Math.round((v / 100) * n);
  return { value: v, asc: false, display: `${Math.round(v)}%`, sub: `${hits} of ${n}` };
}

function buildProbTable(
  base: StandingRow[],
  games: Map<string, Game[]>,
  metric: ProbMetricKey,
  period: Period,
  timing?: Map<string, TeamTiming>,
): { rows: StandingRow[]; metric: MetricColumn; measuredCount: number } {
  const cells = base.map((r) => ({
    row: r,
    cell: metricCell(r, projectPeriod(games.get(r.team)!, period), metric, period, timing?.get(r.team)),
  }));

  // How many rows came from measured timing rather than the estimate.
  const measuredCount =
    TIMING_SPECS[metric] && period === 'ft' && timing
      ? base.filter((r) => {
          const t = timing.get(r.team);
          return !!t && realTimingCell(metric, t, r.played) !== null;
        }).length
      : 0;

  const asc = cells[0]?.cell.asc ?? false;
  cells.sort((a, b) => (asc ? a.cell.value - b.cell.value : b.cell.value - a.cell.value));

  const values = new Map<string, { display: string; sub: string }>();
  for (const { row, cell } of cells) values.set(row.team, { display: cell.display, sub: cell.sub });

  const meta = PROB_METRICS.find((m) => m.key === metric) ?? PROB_METRICS[0];
  return {
    rows: cells.map(({ row }, i) => ({ ...row, pos: i + 1 })),
    metric: { header: meta.short, full: meta.label, values },
    measuredCount,
  };
}

// ---------------------------------------------------------------------------
// Insights — a betting "scout": which teams hit a market often, by scope.
// e.g. "teams that hit Home BTTS 60%+ in this league".
// ---------------------------------------------------------------------------

export type InsightMarket =
  | 'btts'
  | 'o15'
  | 'o25'
  | 'o35'
  | 'sc'
  | 'cs'
  | 'win'
  | 'fts';

export const INSIGHT_MARKETS: { key: InsightMarket; label: string; short: string }[] = [
  { key: 'btts', label: 'Both Teams To Score', short: 'BTTS' },
  { key: 'o15', label: 'Over 1.5 Goals', short: 'Over 1.5' },
  { key: 'o25', label: 'Over 2.5 Goals', short: 'Over 2.5' },
  { key: 'o35', label: 'Over 3.5 Goals', short: 'Over 3.5' },
  { key: 'sc', label: 'Team Scores', short: 'Scores' },
  { key: 'cs', label: 'Clean Sheet', short: 'Clean Sheet' },
  { key: 'win', label: 'Wins', short: 'Wins' },
  { key: 'fts', label: 'Fails To Score', short: 'Fails to Score' },
];

function marketValue(games: Game[], market: InsightMarket): number {
  const total = (g: Game) => g.gf + g.ga;
  switch (market) {
    case 'btts':
      return pct(games, (g) => g.gf >= 1 && g.ga >= 1);
    case 'o15':
      return pct(games, (g) => total(g) >= 2);
    case 'o25':
      return pct(games, (g) => total(g) >= 3);
    case 'o35':
      return pct(games, (g) => total(g) >= 4);
    case 'sc':
      return pct(games, (g) => g.gf >= 1);
    case 'cs':
      return pct(games, (g) => g.ga === 0);
    case 'win':
      return pct(games, (g) => g.gf > g.ga);
    case 'fts':
      return pct(games, (g) => g.gf === 0);
    default:
      return 0;
  }
}

export type InsightRow = { team: string; value: number; played: number };

/** Every team's hit-rate for a market within a scope, ranked high → low. */
export function buildInsights(
  base: StandingRow[],
  opts: { market: InsightMarket; scope: Split },
): InsightRow[] {
  const games = gamesMap(base);
  return base
    .map((r) => {
      const g = filterSplit(games.get(r.team)!, opts.scope);
      return { team: r.team, value: marketValue(g, opts.market), played: g.length };
    })
    .sort((a, b) => b.value - a.value);
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

export function buildStandingsView(
  base: StandingRow[],
  sel: Selection,
  opts?: { timing?: Map<string, TeamTiming> },
): StandingsView {
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
  const meta = PROB_METRICS.find((m) => m.key === sel.metric) ?? PROB_METRICS[0];
  const { rows, metric, measuredCount } = buildProbTable(
    base,
    games,
    sel.metric,
    sel.period,
    opts?.timing,
  );
  const spec = TIMING_SPECS[sel.metric];

  // Timing metrics rank by the clock, so spell out which end of it leads.
  // 'first'-edge metrics headline a minute; the late-goal pair headline a rate.
  const order = spec ? (spec.edge === 'first' ? ' — earliest first' : ' — highest first') : '';

  let timingSource: StandingsView['timingSource'];
  let provenance = '';
  if (spec) {
    timingSource =
      measuredCount === 0 ? 'estimated' : measuredCount === base.length ? 'measured' : 'partial';
    provenance =
      timingSource === 'measured'
        ? ' · recorded timings'
        : timingSource === 'partial'
          ? ` · recorded for ${measuredCount}/${base.length}, rest estimated`
          : ' · estimated (no recorded timings)';
  }

  return {
    rows,
    metric,
    timingSource,
    caption: `${PERIOD_LABEL[sel.period]} · ranked by ${meta.label} (${meta.short})${order}${provenance}`,
  };
}
