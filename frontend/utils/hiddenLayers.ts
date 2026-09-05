/**
 * Section 6 — Hidden strength / weakness & problem-address patterns.
 * Used when table ΔP alone is not enough to separate (or risk-check) a fixture.
 */

import type { StandingLike } from '@/utils/motivationEngine';
import { gradeResult, type FormGrade } from '@/utils/last5Analysis';
import { lastN, type TeamResult } from '@/utils/teamResults';

export type Polarity = 'positive' | 'negative' | 'neutral';

export type HiddenSignal = {
  id: string;
  side: 'home' | 'away';
  polarity: 'strength' | 'weakness';
  naming: string;
  value: number;
  level: 'high' | 'medium' | 'low';
  detail: string;
  /** Whether this is strong enough to call out on a slip / summary. */
  canCallOut: boolean;
};

export type ProblemRow = {
  code: string;
  statsAffected: number;
  polarity: Polarity;
  naming: string;
  valueLabel: string;
  level: 'high' | 'medium' | 'low' | 'none';
  canCallOut: boolean;
  detail: string;
};

export type HiddenVerdict =
  | 'separate_home'
  | 'separate_away'
  | 'support_favourite'
  | 'doubt_favourite'
  | 'balanced'
  | 'insufficient_data';

export type FixtureHiddenLayers = {
  mode: 'close' | 'far' | 'unknown';
  pointsDiff: number | null;
  /** Backed side when far apart = higher points (table favourite). */
  favouriteSide: 'home' | 'away' | null;
  homeSignals: HiddenSignal[];
  awaySignals: HiddenSignal[];
  problems: ProblemRow[];
  verdict: HiddenVerdict;
  verdictDetail: string;
  /** Net hidden score: home strengths − weaknesses minus away net. */
  netEdge: number;
};

const CLOSE_MAX = 4;
const FAR_MIN = 4.1;

function polarityOfGrade(g: FormGrade): Polarity {
  if (g === 'excellent' || g === 'good') return 'positive';
  if (g === 'bad') return 'negative';
  return 'neutral';
}

/** Count +/- over the newest `n` graded games (neutrals ignored for mix codes). */
export function polarityCounts(
  results: TeamResult[],
  n: number,
): { positives: number; negatives: number; neutrals: number; sample: number } {
  const slice = lastN(results, n);
  let positives = 0;
  let negatives = 0;
  let neutrals = 0;
  for (const r of slice) {
    const p = polarityOfGrade(gradeResult(r));
    if (p === 'positive') positives += 1;
    else if (p === 'negative') negatives += 1;
    else neutrals += 1;
  }
  return { positives, negatives, neutrals, sample: slice.length };
}

/**
 * Sample-of-4 / sample-of-5 mix codes from the notes (A–F and 4-game mixes).
 * Includes cancel-out when 1+ and 1− with nothing else decisive.
 */
export function problemPatternFor(results: TeamResult[]): ProblemRow | null {
  if (results.length >= 5) {
    const c = polarityCounts(results, 5);
    const { positives: p, negatives: n } = c;
    if (p === 5 && n === 0)
      return row('A', 5, 'positive', '5 positive', '5–0', 'high', true, 'All 5 recent reads positive');
    if (n === 5 && p === 0)
      return row('F', 5, 'negative', '5 negative', '0–5', 'high', true, 'All 5 recent reads negative');
    if (p === 4 && n === 1)
      return row('B', 5, 'positive', '4–1 positive lean', '4–1', 'high', true, 'Strong positive mix');
    if (n === 4 && p === 1)
      return row('E', 5, 'negative', '4–1 negative lean', '1–4', 'high', true, 'Strong negative mix');
    if (p === 3 && n === 2)
      return row('C', 5, 'positive', '3–2 positive lean', '3–2', 'medium', true, 'Mild positive mix');
    if (n === 3 && p === 2)
      return row('D', 5, 'negative', '3–2 negative lean', '2–3', 'medium', true, 'Mild negative mix');
    if (p === 1 && n === 1)
      return row('F2', 2, 'neutral', 'Cancel each other', '1–1', 'none', false, '1 positive + 1 negative — no change overall');
  }

  if (results.length >= 4) {
    const c = polarityCounts(results, 4);
    const { positives: p, negatives: n } = c;
    if (p === 4 && n === 0)
      return row('4P', 4, 'positive', '4 positive / 0 negative', '4–0', 'high', true, 'Clean positive sample of 4');
    if (n === 4 && p === 0)
      return row('4N', 4, 'negative', '4 negative / 0 positive', '0–4', 'high', true, 'Clean negative sample of 4');
    if (p === 3 && n === 1)
      return row('3P1N', 4, 'positive', '3 positive / 1 negative', '3–1', 'medium', true, 'Positive lean sample of 4');
    if (n === 3 && p === 1)
      return row('3N1P', 4, 'negative', '3 negative / 1 positive', '1–3', 'medium', true, 'Negative lean sample of 4');
    if (p === 2 && n === 2)
      return row('2P2N', 4, 'neutral', '2 positive / 2 negative', '2–2', 'none', false, 'Cancel mix — no clear call-out');
  }

  return null;
}

function row(
  code: string,
  statsAffected: number,
  polarity: Polarity,
  naming: string,
  valueLabel: string,
  level: ProblemRow['level'],
  canCallOut: boolean,
  detail: string,
): ProblemRow {
  return { code, statsAffected, polarity, naming, valueLabel, level, canCallOut, detail };
}

function signalScore(level: HiddenSignal['level']): number {
  if (level === 'high') return 3;
  if (level === 'medium') return 2;
  return 1;
}

function collectSignals(results: TeamResult[], side: 'home' | 'away'): HiddenSignal[] {
  const signals: HiddenSignal[] = [];
  const recent = lastN(results, 6);
  if (recent.length === 0) return signals;

  const winsVsAbove = recent.filter((r) => r.outcome === 'W' && r.opponentAbove === true).length;
  const lossesVsBelow = recent.filter((r) => r.outcome === 'L' && r.opponentAbove === false).length;
  const heavyWins = recent.filter((r) => r.outcome === 'W' && r.goalDiff >= 2).length;
  const softLosses = recent.filter((r) => r.outcome === 'L' && Math.abs(r.goalDiff) === 1).length;

  // Form swing: last 3 pts vs previous 3
  if (recent.length >= 6) {
    const pts = (slice: TeamResult[]) =>
      slice.reduce((s, r) => s + (r.outcome === 'W' ? 3 : r.outcome === 'D' ? 1 : 0), 0);
    const recentPts = pts(recent.slice(0, 3));
    const priorPts = pts(recent.slice(3, 6));
    if (recentPts - priorPts >= 5) {
      signals.push({
        id: `${side}_pickup`,
        side,
        polarity: 'strength',
        naming: 'Hidden pickup',
        value: recentPts - priorPts,
        level: 'high',
        detail: `Last 3 pts ${recentPts} vs prior 3 pts ${priorPts}`,
        canCallOut: true,
      });
    }
    if (priorPts - recentPts >= 5) {
      signals.push({
        id: `${side}_drop`,
        side,
        polarity: 'weakness',
        naming: 'Hidden drop',
        value: priorPts - recentPts,
        level: 'high',
        detail: `Last 3 pts ${recentPts} vs prior 3 pts ${priorPts}`,
        canCallOut: true,
      });
    }
  }

  if (winsVsAbove >= 2) {
    signals.push({
      id: `${side}_wins_above`,
      side,
      polarity: 'strength',
      naming: 'Beats sides above',
      value: winsVsAbove,
      level: winsVsAbove >= 3 ? 'high' : 'medium',
      detail: `${winsVsAbove} wins vs higher-ranked sides in last 6`,
      canCallOut: true,
    });
  }
  if (lossesVsBelow >= 2) {
    signals.push({
      id: `${side}_loss_below`,
      side,
      polarity: 'weakness',
      naming: 'Drops to sides below',
      value: lossesVsBelow,
      level: lossesVsBelow >= 3 ? 'high' : 'medium',
      detail: `${lossesVsBelow} losses vs lower-ranked sides in last 6`,
      canCallOut: true,
    });
  }
  if (heavyWins >= 2) {
    signals.push({
      id: `${side}_heavy_wins`,
      side,
      polarity: 'strength',
      naming: 'Heavy wins',
      value: heavyWins,
      level: 'medium',
      detail: `${heavyWins} wins by 2+ goals in last 6`,
      canCallOut: heavyWins >= 3,
    });
  }
  if (softLosses >= 2) {
    signals.push({
      id: `${side}_soft_losses`,
      side,
      polarity: 'weakness',
      naming: 'Soft 1-goal losses',
      value: softLosses,
      level: 'low',
      detail: `${softLosses} one-goal defeats in last 6`,
      canCallOut: false,
    });
  }

  const pattern = problemPatternFor(results);
  if (pattern && pattern.canCallOut) {
    signals.push({
      id: `${side}_pattern_${pattern.code}`,
      side,
      polarity: pattern.polarity === 'negative' ? 'weakness' : 'strength',
      naming: pattern.naming,
      value: pattern.statsAffected,
      level: pattern.level === 'none' ? 'low' : pattern.level,
      detail: pattern.detail,
      canCallOut: pattern.canCallOut,
    });
  }

  return signals;
}

function netFor(signals: HiddenSignal[]): number {
  let n = 0;
  for (const s of signals) {
    const w = signalScore(s.level) * (s.canCallOut ? 1 : 0.5);
    n += s.polarity === 'strength' ? w : -w;
  }
  return n;
}

export function evaluateHiddenLayers(opts: {
  table: StandingLike[];
  homeId: number | null | undefined;
  awayId: number | null | undefined;
  homeResults: TeamResult[];
  awayResults: TeamResult[];
}): FixtureHiddenLayers {
  const { table, homeId, awayId, homeResults, awayResults } = opts;
  const homeRow = homeId != null ? table.find((t) => t.teamId === homeId) : null;
  const awayRow = awayId != null ? table.find((t) => t.teamId === awayId) : null;
  const pointsDiff =
    homeRow && awayRow ? Math.abs(homeRow.points - awayRow.points) : null;

  let mode: FixtureHiddenLayers['mode'] = 'unknown';
  if (pointsDiff != null) {
    mode = pointsDiff <= CLOSE_MAX ? 'close' : pointsDiff >= FAR_MIN ? 'far' : 'close';
  }

  let favouriteSide: 'home' | 'away' | null = null;
  if (homeRow && awayRow) {
    if (homeRow.points > awayRow.points) favouriteSide = 'home';
    else if (awayRow.points > homeRow.points) favouriteSide = 'away';
  }

  const homeSignals = collectSignals(homeResults, 'home');
  const awaySignals = collectSignals(awayResults, 'away');
  const homeNet = netFor(homeSignals);
  const awayNet = netFor(awaySignals);
  const netEdge = homeNet - awayNet;

  const problems: ProblemRow[] = [];
  const hp = problemPatternFor(homeResults);
  const ap = problemPatternFor(awayResults);
  if (hp) problems.push({ ...hp, naming: `Home · ${hp.naming}`, detail: `Home: ${hp.detail}` });
  if (ap) problems.push({ ...ap, naming: `Away · ${ap.naming}`, detail: `Away: ${ap.detail}` });

  const hasData = homeResults.length + awayResults.length > 0;
  let verdict: HiddenVerdict = 'insufficient_data';
  let       verdictDetail = 'Not enough recent form to spot a clear pattern.';

  if (hasData) {
    if (mode === 'close') {
      // Seek big hidden gaps to separate.
      if (netEdge >= 2.5) {
        verdict = 'separate_home';
        verdictDetail = `Only ${pointsDiff} pts apart on the table — recent form leans home.`;
      } else if (netEdge <= -2.5) {
        verdict = 'separate_away';
        verdictDetail = `Only ${pointsDiff} pts apart on the table — recent form leans away.`;
      } else {
        verdict = 'balanced';
        verdictDetail = `Only ${pointsDiff} pts apart — strengths and weaknesses cancel out.`;
      }
    } else if (mode === 'far' && favouriteSide) {
      // Risk: weakness of backed side vs strength of underdog.
      const favNet = favouriteSide === 'home' ? homeNet : awayNet;
      const dogNet = favouriteSide === 'home' ? awayNet : homeNet;
      const favWeak = (favouriteSide === 'home' ? homeSignals : awaySignals).filter(
        (s) => s.polarity === 'weakness' && s.canCallOut,
      );
      const dogStrong = (favouriteSide === 'home' ? awaySignals : homeSignals).filter(
        (s) => s.polarity === 'strength' && s.canCallOut,
      );

      if (favWeak.length > 0 && dogStrong.length > 0 && dogNet > favNet) {
        verdict = 'doubt_favourite';
        verdictDetail = `${pointsDiff} pts apart — favourite has a clear weakness and the underdog looks stronger in form.`;
      } else if (favNet >= dogNet) {
        verdict = 'support_favourite';
        verdictDetail = `${pointsDiff} pts apart — recent form still backs the stronger side on the table.`;
      } else {
        verdict = 'doubt_favourite';
        verdictDetail = `${pointsDiff} pts apart — underdog’s recent form looks better than the favourite’s.`;
      }
    } else {
      verdict = 'balanced';
      verdictDetail = 'No clear favourite from the table, and form does not pick one either.';
    }
  }

  return {
    mode,
    pointsDiff,
    favouriteSide,
    homeSignals,
    awaySignals,
    problems,
    verdict,
    verdictDetail,
    netEdge,
  };
}

export const VERDICT_LABEL: Record<HiddenVerdict, string> = {
  separate_home: 'Leans home',
  separate_away: 'Leans away',
  support_favourite: 'Backs the favourite',
  doubt_favourite: 'Doubts the favourite',
  balanced: 'Even — no clear edge',
  insufficient_data: 'Not enough data yet',
};
