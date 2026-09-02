/**
 * Section 4 — Separator tools: yes/no (and graded) flags that help split
 * close fixtures. Pure helpers; UI decides how to present them.
 */

import { evaluateTeamMotivation, type StandingLike } from '@/utils/motivationEngine';
import {
  filterScope,
  lastN,
  type ResultOutcome,
  type TeamResult,
} from '@/utils/teamResults';

export type SeparatorGrade = 'good' | 'mediocre' | 'bad' | 'warn' | 'info';

export type SeparatorFlag = {
  id: string;
  label: string;
  active: boolean;
  grade: SeparatorGrade;
  detail: string;
  /** Which side the flag is about, or 'fixture' for both. */
  side: 'home' | 'away' | 'fixture';
};

export type FixtureSeparators = {
  flags: SeparatorFlag[];
  /** Active flags only, sorted warn → bad → good → mediocre → info. */
  active: SeparatorFlag[];
  pointsDiff: number | null;
};

const GRADE_ORDER: Record<SeparatorGrade, number> = {
  warn: 0,
  bad: 1,
  good: 2,
  mediocre: 3,
  info: 4,
};

function streakOf(results: TeamResult[], outcome: ResultOutcome): number {
  let n = 0;
  for (const r of results) {
    if (r.outcome !== outcome) break;
    n += 1;
  }
  return n;
}

/** True when the side has never produced `outcome` in consecutive pairs in window. */
function neverTwiceInRow(results: TeamResult[], outcome: ResultOutcome, window = 10): boolean {
  const slice = results.slice(0, window);
  if (slice.length < 6) return false;
  for (let i = 0; i < slice.length - 1; i++) {
    if (slice[i].outcome === outcome && slice[i + 1].outcome === outcome) return false;
  }
  return true;
}

/**
 * Sudden drop / pickup: compare points in games 1–3 (most recent) vs 4–6.
 * Drop = recent third clearly worse; pickup = clearly better.
 */
function formSwing(
  results: TeamResult[],
  scope: 'overall' | 'home' | 'away',
): { drop: boolean; rise: boolean; detail: string } | null {
  const scoped = filterScope(results, scope);
  if (scoped.length < 6) return null;
  const recent = pointsFrom(scoped.slice(0, 3));
  const prior = pointsFrom(scoped.slice(3, 6));
  const drop = prior - recent >= 5; // e.g. 7–9 pts → 0–3
  const rise = recent - prior >= 5;
  return {
    drop,
    rise,
    detail: `${scope}: last 3 = ${recent} pts, previous 3 = ${prior} pts`,
  };
}

function pointsFrom(results: TeamResult[]): number {
  let pts = 0;
  for (const r of results) {
    if (r.outcome === 'W') pts += 3;
    else if (r.outcome === 'D') pts += 1;
  }
  return pts;
}

/** Struggle = 2–3 straight losses (or winless) in most recent games. */
function struggle(results: TeamResult[]): { active: boolean; games: number } {
  const last3 = results.slice(0, 3);
  if (last3.length < 2) return { active: false, games: 0 };
  const losses = last3.filter((r) => r.outcome === 'L').length;
  const winless = last3.every((r) => r.outcome !== 'W');
  if (losses >= 2 || (winless && last3.length >= 2)) {
    return { active: true, games: last3.length };
  }
  return { active: false, games: 0 };
}

/**
 * 1-goal-difference win/loss graded using venue + opponent above/below.
 * Mirrors the notes' 9-scenario spirit in a compact rule set.
 */
export function gradeOneGoalResult(r: TeamResult): SeparatorGrade | null {
  if (Math.abs(r.goalDiff) !== 1) return null;
  const above = r.opponentAbove === true;
  const below = r.opponentAbove === false;
  const home = r.isHome;

  if (r.outcome === 'W') {
    if (above) return 'good'; // beat a side above you
    if (below && !home) return 'mediocre'; // away vs below
    if (below && home) return 'mediocre';
    return 'good';
  }
  if (r.outcome === 'L') {
    if (above && !home) return 'mediocre'; // away loss to above — more forgivable
    return 'bad';
  }
  return null;
}

function oneGoalFlags(results: TeamResult[], side: 'home' | 'away'): SeparatorFlag[] {
  const flags: SeparatorFlag[] = [];
  for (const r of lastN(results, 5)) {
    const grade = gradeOneGoalResult(r);
    if (!grade) continue;
    flags.push({
      id: `one_goal_${side}_${r.fixtureId}`,
      label: `1-goal ${r.outcome === 'W' ? 'win' : 'loss'}`,
      active: true,
      grade,
      detail: `${r.isHome ? 'H' : 'A'} ${r.gf}-${r.ga} vs ${r.opponentName}${
        r.opponentAbove === true ? ' (above)' : r.opponentAbove === false ? ' (below)' : ''
      }`,
      side,
    });
  }
  return flags;
}

/** Top of table tightly packed (pos 1–5 within ≤3 pts of each other). */
export function contestedLeagueTop(table: StandingLike[], depth = 5): SeparatorFlag {
  const top = [...table].sort((a, b) => a.rank - b.rank).slice(0, Math.min(depth, table.length));
  if (top.length < 3) {
    return {
      id: 'contested_top',
      label: 'Contested league top',
      active: false,
      grade: 'info',
      detail: 'Not enough teams to judge',
      side: 'fixture',
    };
  }
  const spread = top[0].points - top[top.length - 1].points;
  const active = spread <= 3;
  return {
    id: 'contested_top',
    label: 'Contested league top',
    active,
    grade: active ? 'warn' : 'info',
    detail: active
      ? `Positions 1–${top.length} separated by only ${spread} pts — dangerous to play`
      : `Top ${top.length} spread = ${spread} pts`,
    side: 'fixture',
  };
}

/**
 * Child beater (method 1): recent thrashing of a side currently below you (GD ≥ 2).
 * Method 2: top-third side regularly beating bottom-third (2+ such wins in last 6).
 */
function childBeaterFlags(results: TeamResult[], side: 'home' | 'away', zone?: string): SeparatorFlag[] {
  const flags: SeparatorFlag[] = [];
  const recent = lastN(results, 6);
  const thrash = recent.find(
    (r) => r.outcome === 'W' && r.goalDiff >= 2 && r.opponentAbove === false,
  );
  if (thrash) {
    flags.push({
      id: `child_beater_m1_${side}`,
      label: 'Child beater (method 1)',
      active: true,
      grade: 'info',
      detail: `Beat lower side ${thrash.gf}-${thrash.ga} (${thrash.opponentName})`,
      side,
    });
  }
  const topBeatsBottom = recent.filter(
    (r) =>
      r.outcome === 'W' &&
      r.goalDiff >= 2 &&
      r.opponentAbove === false &&
      (zone === 'top' || r.teamRank != null),
  );
  if (topBeatsBottom.length >= 2) {
    flags.push({
      id: `child_beater_m2_${side}`,
      label: 'Child beater (method 2)',
      active: true,
      grade: 'mediocre',
      detail: `${topBeatsBottom.length} heavy wins vs sides below in last 6`,
      side,
    });
  }
  return flags;
}

/** Imbangi — rivals close on points (ΔP ≤ 3). */
function imbangiFlag(homePts: number | null, awayPts: number | null): SeparatorFlag {
  if (homePts == null || awayPts == null) {
    return {
      id: 'imbangi',
      label: 'Imbangi',
      active: false,
      grade: 'info',
      detail: 'Need both sides’ points',
      side: 'fixture',
    };
  }
  const d = Math.abs(homePts - awayPts);
  const active = d <= 3;
  return {
    id: 'imbangi',
    label: 'Imbangi',
    active,
    grade: active ? 'warn' : 'info',
    detail: active
      ? `Rivals — only ${d} pts apart (closer to zero = tighter)`
      : `Points gap ${d} — not a close-table rivalry`,
    side: 'fixture',
  };
}

/** Indlela — a clear “path” signal from streak / never-twice patterns. */
function indlelaFlag(
  home: TeamResult[],
  away: TeamResult[],
): SeparatorFlag {
  const signals: string[] = [];
  if (streakOf(home, 'W') >= 4) signals.push('home long win path');
  if (streakOf(away, 'W') >= 4) signals.push('away long win path');
  if (neverTwiceInRow(home, 'L')) signals.push('home never lost twice');
  if (neverTwiceInRow(away, 'L')) signals.push('away never lost twice');
  const active = signals.length > 0;
  return {
    id: 'indlela',
    label: 'Indlela',
    active,
    grade: active ? 'info' : 'info',
    detail: active ? signals.join(' · ') : 'No clear path pattern in recent form',
    side: 'fixture',
  };
}

function sideFormFlags(
  results: TeamResult[],
  side: 'home' | 'away',
  table: StandingLike[],
  teamId: number | null | undefined,
  seasonProgress: number | null | undefined,
): SeparatorFlag[] {
  const flags: SeparatorFlag[] = [];
  if (results.length === 0) return flags;

  for (const scope of ['overall', 'home', 'away'] as const) {
    const swing = formSwing(results, scope);
    if (!swing) continue;
    if (swing.drop) {
      flags.push({
        id: `sudden_drop_${side}_${scope}`,
        label: `Sudden drop (${scope})`,
        active: true,
        grade: 'bad',
        detail: swing.detail,
        side,
      });
    }
    if (swing.rise) {
      flags.push({
        id: `sudden_rise_${side}_${scope}`,
        label: `Sudden pickup (${scope})`,
        active: true,
        grade: 'good',
        detail: swing.detail,
        side,
      });
    }
  }

  const winStreak = streakOf(results, 'W');
  const lossStreak = streakOf(results, 'L');
  if (winStreak >= 6) {
    flags.push({
      id: `won6_${side}`,
      label: 'Won 6 in a row',
      active: true,
      grade: 'warn',
      detail: `Current win streak: ${winStreak}`,
      side,
    });
  }
  if (lossStreak >= 6) {
    flags.push({
      id: `lost6_${side}`,
      label: 'Lost 6 in a row',
      active: true,
      grade: 'warn',
      detail: `Current loss streak: ${lossStreak}`,
      side,
    });
  }

  if (neverTwiceInRow(results, 'L')) {
    flags.push({
      id: `never_lost_twice_${side}`,
      label: 'Never lost twice in a row',
      active: true,
      grade: 'good',
      detail: 'No back-to-back losses in last 10',
      side,
    });
  }
  if (neverTwiceInRow(results, 'W')) {
    flags.push({
      id: `never_won_twice_${side}`,
      label: 'Never won twice in a row',
      active: true,
      grade: 'mediocre',
      detail: 'No back-to-back wins in last 10',
      side,
    });
  }

  const str = struggle(results);
  if (str.active) {
    let fightFor = false;
    let fightDetail = 'No position of interest attached';
    if (teamId != null && table.length > 0) {
      const m = evaluateTeamMotivation(teamId, table, { seasonProgress });
      if (m && (m.stance === 'chase' || m.stance === 'escape') && m.grade !== 'none') {
        fightFor = true;
        fightDetail = m.stanceReason;
      }
    }
    flags.push({
      id: `struggle_${side}`,
      label: 'Struggle (2–3 games)',
      active: true,
      grade: fightFor ? 'warn' : 'mediocre',
      detail: fightFor
        ? `Struggling AND something to fight for — ${fightDetail}`
        : `Struggling (${str.games} recent) but no reason to fight (${fightDetail})`,
      side,
    });
  }

  flags.push(...oneGoalFlags(results, side));
  const zone = table.find((t) => t.teamId === teamId)?.zone;
  flags.push(...childBeaterFlags(results, side, zone));

  return flags;
}

export function evaluateFixtureSeparators(opts: {
  table: StandingLike[];
  homeId: number | null | undefined;
  awayId: number | null | undefined;
  homeResults: TeamResult[];
  awayResults: TeamResult[];
  seasonProgress?: number | null;
}): FixtureSeparators {
  const { table, homeId, awayId, homeResults, awayResults, seasonProgress } = opts;
  const flags: SeparatorFlag[] = [];

  const homeRow = homeId != null ? table.find((t) => t.teamId === homeId) : null;
  const awayRow = awayId != null ? table.find((t) => t.teamId === awayId) : null;
  const pointsDiff =
    homeRow && awayRow ? Math.abs(homeRow.points - awayRow.points) : null;

  if (pointsDiff != null) {
    flags.push({
      id: 'points_diff',
      label: 'Points difference (ΔP)',
      active: true,
      grade: pointsDiff <= 4 ? 'warn' : 'info',
      detail:
        pointsDiff <= 4
          ? `ΔP = ${pointsDiff} — close enough to need separators`
          : `ΔP = ${pointsDiff} — enough power gap on paper`,
      side: 'fixture',
    });
  }

  flags.push(contestedLeagueTop(table));
  flags.push(imbangiFlag(homeRow?.points ?? null, awayRow?.points ?? null));
  flags.push(indlelaFlag(homeResults, awayResults));

  flags.push(
    ...sideFormFlags(homeResults, 'home', table, homeId, seasonProgress),
    ...sideFormFlags(awayResults, 'away', table, awayId, seasonProgress),
  );

  const active = flags
    .filter((f) => f.active)
    .sort((a, b) => GRADE_ORDER[a.grade] - GRADE_ORDER[b.grade]);

  return { flags, active, pointsDiff };
}
