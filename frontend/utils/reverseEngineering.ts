/**
 * Section 7 — reverse engineering.
 * Walk each side's season in order. The 6th match is read from the first 5,
 * the 7th from the 6 before it, and so on. Two calls are scored against the
 * result: the Last 5 window this tab already uses, and every match before it.
 */

import type { SeasonMatch } from '@/utils/bhozomaEngine';
import type { ResultOutcome } from '@/utils/teamResults';

/** First match that can be checked is the 6th, so five games already exist. */
export const REVERSE_MIN_PRIOR = 5;

export type ResultPick = 'team' | 'opponent' | 'draw';

export type SampleRead = {
  teamPts: number;
  oppPts: number;
  teamMp: number;
  oppMp: number;
  /** Null when either side has no earlier match to compare. */
  pick: ResultPick | null;
};

export type ReverseRow = {
  /** 1-based place in this side's season. The first row is 6. */
  gameNumber: number;
  priorCount: number;
  opponentId: number;
  opponentName: string;
  isHome: boolean;
  gf: number;
  ga: number;
  actual: ResultOutcome;
  last5: SampleRead;
  prior: SampleRead;
  last5Hit: boolean | null;
  priorHit: boolean | null;
};

export type RateRead = {
  scored: number;
  hits: number;
  /** Hits divided by every call, including draw calls. */
  accuracy: number | null;
  winnerCalls: number;
  winnerHits: number;
  /** Named-winner calls that the named side actually won. Draw calls are left out. */
  success: number | null;
};

export type ReverseSide = {
  teamId: number;
  label: string;
  rows: ReverseRow[];
  last5: RateRead;
  prior: RateRead;
};

export type ReverseReport = {
  t1: ReverseSide | null;
  t2: ReverseSide | null;
  /** Each fixture once, so a meeting of these two sides is not counted twice. */
  last5: RateRead;
  prior: RateRead;
  checked: number;
  /** Full record correct, Last 5 wrong. */
  missedByLast5: number;
  /** Both calls wrong. */
  missedByBoth: number;
};

type ChronGame = {
  key: string;
  unix: number;
  opponentId: number;
  isHome: boolean;
  gf: number;
  ga: number;
  pts: number;
  outcome: ResultOutcome;
};

function outcomeOf(gf: number, ga: number): ResultOutcome {
  if (gf > ga) return 'W';
  if (gf < ga) return 'L';
  return 'D';
}

function pointsOf(outcome: ResultOutcome): number {
  if (outcome === 'W') return 3;
  if (outcome === 'D') return 1;
  return 0;
}

export function chronGames(matches: SeasonMatch[], teamId: number): ChronGame[] {
  const games: ChronGame[] = [];
  for (const m of matches) {
    if (m.homeId !== teamId && m.awayId !== teamId) continue;
    const isHome = m.homeId === teamId;
    const gf = isHome ? m.homeGoals : m.awayGoals;
    const ga = isHome ? m.awayGoals : m.homeGoals;
    const outcome = outcomeOf(gf, ga);
    games.push({
      key: `${m.unix}:${m.homeId}:${m.awayId}`,
      unix: m.unix,
      opponentId: isHome ? m.awayId : m.homeId,
      isHome,
      gf,
      ga,
      pts: pointsOf(outcome),
      outcome,
    });
  }
  games.sort((a, b) => a.unix - b.unix || a.key.localeCompare(b.key));
  return games;
}

function windowOf(games: ChronGame[], end: number, limit: number | null): ChronGame[] {
  const prior = games.slice(0, end);
  return limit == null ? prior : prior.slice(-limit);
}

function windowBeforeUnix(games: ChronGame[], unix: number, limit: number | null): ChronGame[] {
  const prior = games.filter((g) => g.unix < unix);
  return limit == null ? prior : prior.slice(-limit);
}

function totals(games: ChronGame[]): { pts: number; mp: number } {
  let pts = 0;
  for (const g of games) pts += g.pts;
  return { pts, mp: games.length };
}

/** More points per game wins. Equal points per game is a draw. Cross-multiply keeps it exact. */
export function pickFromSamples(
  teamPts: number,
  teamMp: number,
  oppPts: number,
  oppMp: number,
): ResultPick | null {
  if (teamMp <= 0 || oppMp <= 0) return null;
  const team = teamPts * oppMp;
  const opp = oppPts * teamMp;
  if (team > opp) return 'team';
  if (team < opp) return 'opponent';
  return 'draw';
}

export function callHit(pick: ResultPick | null, actual: ResultOutcome): boolean | null {
  if (pick == null) return null;
  if (pick === 'team') return actual === 'W';
  if (pick === 'opponent') return actual === 'L';
  return actual === 'D';
}

export type PredictionStory = {
  called: string;
  teamSample: string;
  oppSample: string;
  lean: string;
  verdict: string;
  hit: boolean | null;
};

function countWord(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/**
 * The call in words, plus how far the result sat from it.
 * A wrong winner is "missed by N goals". A winner call that drew is a draw miss.
 */
export function describePrediction(opts: {
  read: SampleRead;
  team: string;
  opponent: string;
  gf: number;
  ga: number;
  actual: ResultOutcome;
}): PredictionStory {
  const { read, team, opponent, gf, ga, actual } = opts;
  const hit = callHit(read.pick, actual);
  const teamSample = `${team} ${read.teamPts} ${countWord(read.teamPts, 'pt', 'pts')} from ${read.teamMp} ${countWord(read.teamMp, 'match', 'matches')}`;
  const oppSample =
    read.oppMp === 0
      ? `${opponent} had no earlier match`
      : `${opponent} ${read.oppPts} ${countWord(read.oppPts, 'pt', 'pts')} from ${read.oppMp} ${countWord(read.oppMp, 'match', 'matches')}`;

  if (read.pick == null) {
    return {
      called: 'No prediction',
      teamSample,
      oppSample,
      lean: '',
      verdict: 'Nothing to compare',
      hit: null,
    };
  }

  const called = read.pick === 'draw' ? 'A draw' : `${read.pick === 'team' ? team : opponent} to win`;
  let lean = 'Level on points per match';
  if (read.pick !== 'draw') {
    const who = read.pick === 'team' ? team : opponent;
    if (read.teamMp === read.oppMp) {
      const diff = Math.abs(read.teamPts - read.oppPts);
      lean = `${who} ahead by ${diff} ${countWord(diff, 'pt', 'pts')}`;
    } else {
      const gap = Math.abs(read.teamPts / read.teamMp - read.oppPts / read.oppMp);
      lean = `${who} ahead by ${gap.toFixed(2)} a match`;
    }
  }

  const margin = Math.abs(gf - ga);
  const verdict =
    hit === false
      ? actual === 'D'
        ? 'Missed. It finished a draw.'
        : `Missed by ${margin} ${countWord(margin, 'goal', 'goals')}.`
      : 'Result matched';

  return { called, teamSample, oppSample, lean, verdict, hit };
}

function readSample(
  teamGames: ChronGame[],
  teamEnd: number,
  oppGames: ChronGame[],
  oppUnix: number,
  limit: number | null,
): SampleRead {
  const team = totals(windowOf(teamGames, teamEnd, limit));
  const opp = totals(windowBeforeUnix(oppGames, oppUnix, limit));
  return {
    teamPts: team.pts,
    oppPts: opp.pts,
    teamMp: team.mp,
    oppMp: opp.mp,
    pick: pickFromSamples(team.pts, team.mp, opp.pts, opp.mp),
  };
}

export function rateFromHits(
  rows: { pick: ResultPick | null; hit: boolean | null }[],
): RateRead {
  let scored = 0;
  let hits = 0;
  let winnerCalls = 0;
  let winnerHits = 0;
  for (const row of rows) {
    if (row.pick == null || row.hit == null) continue;
    scored += 1;
    if (row.hit) hits += 1;
    if (row.pick !== 'draw') {
      winnerCalls += 1;
      if (row.hit) winnerHits += 1;
    }
  }
  return {
    scored,
    hits,
    accuracy: scored > 0 ? hits / scored : null,
    winnerCalls,
    winnerHits,
    success: winnerCalls > 0 ? winnerHits / winnerCalls : null,
  };
}

function rateSide(rows: ReverseRow[], which: 'last5' | 'prior'): RateRead {
  return rateFromHits(
    rows.map((row) => ({
      pick: row[which].pick,
      hit: which === 'last5' ? row.last5Hit : row.priorHit,
    })),
  );
}

export function reverseMissNotes(rows: ReverseRow[]): string[] {
  const called = rows.filter((row) => row.last5Hit != null);
  const last5Miss = called.filter((row) => row.last5Hit === false);
  const notes: { count: number; text: string }[] = [
    {
      count: last5Miss.filter((row) => row.priorHit === true).length,
      text: 'the full record had the result and Last 5 did not',
    },
    {
      count: last5Miss.filter((row) => row.priorHit === false).length,
      text: 'neither Last 5 nor the full record had the result',
    },
    {
      count: last5Miss.filter((row) => row.isHome && row.last5.pick === 'team' && row.actual === 'L').length,
      text: 'the home side had more Last 5 points and lost',
    },
    {
      count: last5Miss.filter((row) => !row.isHome && row.last5.pick === 'team' && row.actual === 'L').length,
      text: 'the away side had more Last 5 points and lost',
    },
    {
      count: last5Miss.filter((row) => row.last5.pick != null && row.last5.pick !== 'draw' && row.actual === 'D').length,
      text: 'Last 5 named a winner and the match was drawn',
    },
  ];
  return notes.filter((note) => note.count > 0).map((note) => `${note.count} · ${note.text}`);
}

function walkSide(
  teamId: number,
  label: string,
  byTeam: Map<number, ChronGame[]>,
  names: Map<number, string>,
  seen: Set<string>,
  unique: ReverseRow[],
): ReverseSide {
  const games = byTeam.get(teamId) ?? [];
  const rows: ReverseRow[] = [];
  for (let i = REVERSE_MIN_PRIOR; i < games.length; i++) {
    const target = games[i];
    const oppGames = byTeam.get(target.opponentId) ?? [];
    const last5 = readSample(games, i, oppGames, target.unix, REVERSE_MIN_PRIOR);
    const prior = readSample(games, i, oppGames, target.unix, null);
    const row: ReverseRow = {
      gameNumber: i + 1,
      priorCount: i,
      opponentId: target.opponentId,
      opponentName: names.get(target.opponentId) ?? `Team ${target.opponentId}`,
      isHome: target.isHome,
      gf: target.gf,
      ga: target.ga,
      actual: target.outcome,
      last5,
      prior,
      last5Hit: callHit(last5.pick, target.outcome),
      priorHit: callHit(prior.pick, target.outcome),
    };
    rows.push(row);
    if (!seen.has(target.key)) {
      seen.add(target.key);
      unique.push(row);
    }
  }
  return {
    teamId,
    label,
    rows,
    last5: rateSide(rows, 'last5'),
    prior: rateSide(rows, 'prior'),
  };
}

export function reverseEngineer(opts: {
  t1Id: number | null;
  t2Id: number | null;
  t1Label: string;
  t2Label: string;
  matches: SeasonMatch[];
  names: Map<number, string>;
}): ReverseReport {
  const ids = [opts.t1Id, opts.t2Id].filter((id): id is number => id != null);
  const byTeam = new Map<number, ChronGame[]>();
  const needed = new Set<number>(ids);
  for (const m of opts.matches) {
    if (needed.has(m.homeId) || needed.has(m.awayId)) {
      needed.add(m.homeId);
      needed.add(m.awayId);
    }
  }
  for (const id of needed) byTeam.set(id, chronGames(opts.matches, id));

  const seen = new Set<string>();
  const unique: ReverseRow[] = [];
  const t1 = opts.t1Id != null ? walkSide(opts.t1Id, opts.t1Label, byTeam, opts.names, seen, unique) : null;
  const t2 = opts.t2Id != null ? walkSide(opts.t2Id, opts.t2Label, byTeam, opts.names, seen, unique) : null;

  return {
    t1,
    t2,
    last5: rateSide(unique, 'last5'),
    prior: rateSide(unique, 'prior'),
    checked: unique.length,
    missedByLast5: unique.filter((row) => row.last5Hit === false && row.priorHit === true).length,
    missedByBoth: unique.filter((row) => row.last5Hit === false && row.priorHit === false).length,
  };
}
