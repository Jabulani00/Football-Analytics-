/**
 * Section 2 + 3 from the analysis notes:
 *  - Importance of 3 points (motivation after a hypothetical win)
 *  - Chase / Escape / No-reward stance from critical table lines
 *
 * Pure helpers — no React, no network. Safe to unit-test in isolation.
 */

import {
  COMPETITION_ZONES,
  type ZoneKind,
  type ZoneRule,
} from '@/utils/competitionZones';

// ----- Shared types -------------------------------------------------------

export type MotivationGrade = 'A' | 'B' | 'none';

export type MotivationOutcome =
  | 'extend_lead'
  | 'take_over'
  | 'chase_reduce_gap'
  | 'escape_relegation'
  | 'escape_safety'
  | 'no_reward'
  | 'futile_chase';

/** Chase upward, escape downward, or nothing on the line. */
export type TeamStance = 'chase' | 'escape' | 'no_reward';

export type StandingLike = {
  rank: number;
  teamId: number;
  name: string;
  played: number;
  points: number;
  zone?: 'top' | 'mid' | 'bottom';
};

export type CriticalLines = {
  /** Positions worth chasing upward (title, Europe, etc.). */
  chaseTargets: { position: number; label: string }[];
  /** First position that is in the relegation / play-off danger band. */
  relegationLine: number | null;
  relegationLabel: string | null;
  /** Mid-table band (1-based inclusive), for sharper yellow-band reads. */
  midBand: { from: number; to: number } | null;
};

export type GapProbe = {
  key: string;
  label: string;
  /** Points gap after imagining +3 for this team (or neighbour as noted). */
  gap: number;
  /** True when |gap| ≤ MOTIVATION_GAP_MAX. */
  motivates: boolean;
};

export type TeamMotivation = {
  teamId: number;
  name: string;
  rank: number;
  points: number;
  stance: TeamStance;
  stanceReason: string;
  grade: MotivationGrade;
  outcomes: MotivationOutcome[];
  reasons: string[];
  probes: GapProbe[];
  /** True when remaining matches cannot close the nearest chase target. */
  futileChase: boolean;
  /** Late season: pull + push; early: pull only. */
  mode: 'pull' | 'pull_and_push';
  /** Position after a simulated win (same GD assumption). */
  rankAfterWin: number | null;
  isMidTable: boolean;
  /** Dropped out of a critical band but still mathematically linked. */
  dethroned: boolean;
};

export type FixtureMotivation = {
  home: TeamMotivation | null;
  away: TeamMotivation | null;
};

/** Gap of 4 or less after +3 still counts; 4.1+ is ignored. */
export const MOTIVATION_GAP_MAX = 4;
/** Late-season threshold from the notes (~75% league progress). */
export const LATE_SEASON_PROGRESS = 75;
/** Escape matters when within this many points of the relegation line team. */
export const ESCAPE_POINTS_REACH = 3;

// ----- Critical lines -----------------------------------------------------

function isTopAnchored(r: ZoneRule): r is ZoneRule & { from: number; to: number } {
  return (r as { from?: number }).from !== undefined;
}

const CHASE_KINDS: ZoneKind[] = [
  'continentalTop',
  'continentalTopQual',
  'continentalSecond',
  'continentalThird',
];

/**
 * Critical chase / escape lines for a competition.
 * Uses curated zone rules when known; otherwise falls back to table thirds.
 */
export function criticalLinesFor(
  competitionId: number | string | null | undefined,
  totalTeams: number,
): CriticalLines {
  if (totalTeams <= 0) {
    return { chaseTargets: [], relegationLine: null, relegationLabel: null, midBand: null };
  }

  const third = Math.max(1, Math.floor(totalTeams / 3));
  const midFrom = third + 1;
  const midTo = Math.max(midFrom, totalTeams - third);
  const midBand = midFrom <= midTo ? { from: midFrom, to: midTo } : null;

  const rules = competitionId != null ? COMPETITION_ZONES[Number(competitionId)] : undefined;
  if (!rules || rules.length === 0) {
    // Fallback: chase pos 1 and end of green third; escape starts at red third.
    const chaseTargets = [
      { position: 1, label: 'Top of table' },
      ...(third > 1 ? [{ position: third, label: 'Top third' }] : []),
    ];
    const relegationLine = totalTeams - third + 1;
    return {
      chaseTargets,
      relegationLine: relegationLine <= totalTeams ? relegationLine : null,
      relegationLabel: 'Bottom third',
      midBand,
    };
  }

  const chaseTargets: { position: number; label: string }[] = [];
  let relegationLine: number | null = null;
  let relegationLabel: string | null = null;

  for (const rule of rules) {
    if (CHASE_KINDS.includes(rule.kind) && isTopAnchored(rule)) {
      // Last place in that band is the line worth chasing into.
      chaseTargets.push({ position: rule.to, label: rule.label });
      if (rule.from === 1 && rule.to >= 1) {
        chaseTargets.push({ position: 1, label: `${rule.label} (1st)` });
      }
    }
    if (
      (rule.kind === 'relegation' || rule.kind === 'relegationPlayoff') &&
      !isTopAnchored(rule)
    ) {
      const line = totalTeams - rule.fromBottom + 1;
      // Keep the highest (safest edge) relegation-related line.
      if (relegationLine == null || line < relegationLine) {
        relegationLine = line;
        relegationLabel = rule.label;
      }
    }
  }

  // Deduplicate chase targets by position (prefer first label).
  const seen = new Set<number>();
  const uniqueChase = chaseTargets
    .filter((t) => t.position >= 1 && t.position <= totalTeams)
    .filter((t) => {
      if (seen.has(t.position)) return false;
      seen.add(t.position);
      return true;
    })
    .sort((a, b) => a.position - b.position);

  if (uniqueChase.length === 0) {
    uniqueChase.push({ position: 1, label: 'Top of table' });
  }

  return {
    chaseTargets: uniqueChase,
    relegationLine:
      relegationLine != null && relegationLine >= 1 && relegationLine <= totalTeams
        ? relegationLine
        : null,
    relegationLabel,
    midBand,
  };
}

// ----- Table helpers ------------------------------------------------------

function sortedTable(rows: StandingLike[]): StandingLike[] {
  return [...rows].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    return a.rank - b.rank;
  });
}

function byRank(rows: StandingLike[]): Map<number, StandingLike> {
  const map = new Map<number, StandingLike>();
  for (const r of sortedTable(rows)) map.set(r.rank, r);
  return map;
}

function findTeam(rows: StandingLike[], teamId: number): StandingLike | null {
  return rows.find((r) => r.teamId === teamId) ?? null;
}

/** Estimate remaining matches from season progress or table depth. */
export function estimateRemainingMatches(
  team: StandingLike,
  table: StandingLike[],
  seasonProgress: number | null | undefined,
): number {
  if (seasonProgress != null && seasonProgress > 0 && seasonProgress < 100 && team.played > 0) {
    const totalApprox = team.played / (seasonProgress / 100);
    return Math.max(0, Math.round(totalApprox - team.played));
  }
  const maxPlayed = Math.max(...table.map((r) => r.played), team.played);
  // Rough: most leagues play 2 × (n-1) games; use maxPlayed as season depth so far.
  const n = table.length;
  const expectedTotal = n > 1 ? 2 * (n - 1) : maxPlayed;
  return Math.max(0, expectedTotal - team.played);
}

/**
 * Simulate this team gaining +3 (and +1 GD proxy) then re-rank.
 * Other teams unchanged — enough to detect take-over / no movement.
 */
export function rankAfterWin(table: StandingLike[], teamId: number): number | null {
  const team = findTeam(table, teamId);
  if (!team) return null;
  const projected = table.map((r) =>
    r.teamId === teamId ? { ...r, points: r.points + 3 } : { ...r },
  );
  projected.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    // Winner of the simulation breaks ties ahead of the side they "beat" on points.
    if (a.teamId === teamId) return -1;
    if (b.teamId === teamId) return 1;
    return a.rank - b.rank;
  });
  const idx = projected.findIndex((r) => r.teamId === teamId);
  return idx >= 0 ? idx + 1 : null;
}

// ----- Stance (Section 3) -------------------------------------------------

function nearestChaseTarget(
  rank: number,
  lines: CriticalLines,
): { position: number; label: string } | null {
  // Prefer the closest target strictly above the team.
  const above = lines.chaseTargets.filter((t) => t.position < rank);
  if (above.length === 0) {
    // Already at or above every chase line — still attach to pos 1 for "extend lead".
    return lines.chaseTargets[0] ?? { position: 1, label: 'Top of table' };
  }
  return above.reduce((best, t) => (t.position > best.position ? t : best));
}

export function stanceForTeam(
  team: StandingLike,
  table: StandingLike[],
  lines: CriticalLines,
  seasonProgress: number | null | undefined,
): Pick<TeamMotivation, 'stance' | 'stanceReason' | 'dethroned' | 'isMidTable' | 'futileChase' | 'mode'> {
  const n = table.length;
  const rankMap = byRank(table);
  const mode: 'pull' | 'pull_and_push' =
    seasonProgress != null && seasonProgress >= LATE_SEASON_PROGRESS ? 'pull_and_push' : 'pull';

  const isMidTable =
    lines.midBand != null &&
    team.rank >= lines.midBand.from &&
    team.rank <= lines.midBand.to;

  const remaining = estimateRemainingMatches(team, table, seasonProgress);
  const target = nearestChaseTarget(team.rank, lines);
  const targetRow = target ? rankMap.get(target.position) : null;

  let futileChase = false;
  if (targetRow && target && team.rank > target.position) {
    const ptsNeeded = Math.max(0, targetRow.points - team.points);
    if (ptsNeeded > remaining * 3) futileChase = true;
  }

  // Escape: within ESCAPE_POINTS_REACH of the team on the relegation line,
  // or already on/below that line.
  let escapeThreat = false;
  if (lines.relegationLine != null) {
    const danger = rankMap.get(lines.relegationLine);
    if (danger) {
      const gapToDanger = team.points - danger.points;
      if (team.rank >= lines.relegationLine || gapToDanger <= ESCAPE_POINTS_REACH) {
        escapeThreat = true;
      }
    }
  }

  // Dethroned: sitting just below a chase line but still within a 4-pt +3 reach.
  let dethroned = false;
  if (target && targetRow && team.rank === target.position + 1) {
    const gapAfterWin = targetRow.points - (team.points + 3);
    if (gapAfterWin <= MOTIVATION_GAP_MAX) dethroned = true;
  }

  // Early season: pull only (chase). Late season: pull + push (escape allowed).
  if (escapeThreat && mode === 'pull_and_push') {
    return {
      stance: 'escape',
      stanceReason:
        lines.relegationLabel != null
          ? `Within reach of ${lines.relegationLabel.toLowerCase()}`
          : 'Within reach of the danger zone',
      dethroned,
      isMidTable,
      futileChase,
      mode,
    };
  }

  if (futileChase && !escapeThreat) {
    return {
      stance: 'no_reward',
      stanceReason: 'Chase is futile — not enough matches left to close the gap',
      dethroned,
      isMidTable,
      futileChase,
      mode,
    };
  }

  if (target && team.rank <= (lines.chaseTargets[0]?.position ?? 1)) {
    // On or above the top chase line.
    const ahead = rankMap.get(team.rank - 1);
    if (!ahead) {
      return {
        stance: 'chase',
        stanceReason: 'Top of the table — protecting the lead',
        dethroned,
        isMidTable,
        futileChase,
        mode,
      };
    }
  }

  if (target && team.rank > target.position) {
    return {
      stance: 'chase',
      stanceReason: `Chasing ${target.label} (pos ${target.position})`,
      dethroned,
      isMidTable,
      futileChase,
      mode,
    };
  }

  // Early-season escape proximity still noted as no_reward (push factors off).
  if (escapeThreat && mode === 'pull') {
    return {
      stance: 'no_reward',
      stanceReason: 'Danger nearby, but early season — push factors not active yet',
      dethroned,
      isMidTable,
      futileChase,
      mode,
    };
  }

  return {
    stance: 'no_reward',
    stanceReason: 'No attached target or danger within reach',
    dethroned,
    isMidTable,
    futileChase,
    mode,
  };
}

// ----- Motivation probes (Section 2) --------------------------------------

function probe(
  key: string,
  label: string,
  gap: number,
): GapProbe {
  return {
    key,
    label,
    gap,
    motivates: Math.abs(gap) <= MOTIVATION_GAP_MAX,
  };
}

export function buildProbes(
  team: StandingLike,
  table: StandingLike[],
  lines: CriticalLines,
): GapProbe[] {
  const rankMap = byRank(table);
  const ptsAfterWin = team.points + 3;
  const probes: GapProbe[] = [];

  const ahead1 = rankMap.get(team.rank - 1);
  const ahead2 = rankMap.get(team.rank - 2);
  const tail1 = rankMap.get(team.rank + 1);
  const tail2 = rankMap.get(team.rank + 2);

  if (ahead1) probes.push(probe('ahead1', `vs ${ahead1.name} (above)`, ahead1.points - ptsAfterWin));
  if (ahead2) probes.push(probe('ahead2', `vs ${ahead2.name} (2 above)`, ahead2.points - ptsAfterWin));
  if (tail1) probes.push(probe('tail1', `vs ${tail1.name} (below)`, team.points - (tail1.points + 3)));
  if (tail2) probes.push(probe('tail2', `vs ${tail2.name} (2 below)`, team.points - (tail2.points + 3)));

  const target = nearestChaseTarget(team.rank, lines);
  if (target) {
    const targetRow = rankMap.get(target.position);
    if (targetRow && targetRow.teamId !== team.teamId) {
      probes.push(
        probe(
          'target',
          `Target: ${target.label} (pos ${target.position})`,
          targetRow.points - ptsAfterWin,
        ),
      );
    }
  }

  if (lines.relegationLine != null) {
    const danger = rankMap.get(lines.relegationLine);
    if (danger && danger.teamId !== team.teamId) {
      probes.push(
        probe(
          'relegation',
          lines.relegationLabel ?? 'Relegation line',
          team.points - (danger.points + 3),
        ),
      );
    }
  }

  return probes;
}

function outcomesFromContext(input: {
  stance: TeamStance;
  probes: GapProbe[];
  rank: number;
  rankAfter: number | null;
  futileChase: boolean;
  dethroned: boolean;
  relegationLine: number | null;
}): { outcomes: MotivationOutcome[]; grade: MotivationGrade; reasons: string[] } {
  const { stance, probes, rank, rankAfter, futileChase, dethroned, relegationLine } = input;
  const outcomes: MotivationOutcome[] = [];
  const reasons: string[] = [];

  if (futileChase) {
    outcomes.push('futile_chase');
    reasons.push('Not enough games left to catch the target');
  }

  const movedUp = rankAfter != null && rankAfter < rank;
  const placesUp = rankAfter != null ? rank - rankAfter : 0;
  const motivating = probes.filter((p) => p.motivates);

  if (stance === 'no_reward' && motivating.length === 0) {
    outcomes.push('no_reward');
    reasons.push('A win does not change the picture enough (gaps > 4 pts)');
    return { outcomes, grade: 'none', reasons };
  }

  if (movedUp && placesUp >= 1) {
    outcomes.push('take_over');
    reasons.push(
      placesUp === 1
        ? `A win takes over 1 place (to #${rankAfter})`
        : `A win climbs ${placesUp} places (to #${rankAfter})`,
    );
  } else if (rank === 1 || (rankAfter === 1 && rank === 1)) {
    outcomes.push('extend_lead');
    reasons.push('A win extends the lead at the top');
  } else if (stance === 'chase' && motivating.some((p) => p.key.startsWith('ahead') || p.key === 'target')) {
    outcomes.push('chase_reduce_gap');
    reasons.push('A win keeps pressure on the side above / target');
  }

  if (stance === 'escape' || (relegationLine != null && rank >= relegationLine - 1)) {
    const relProbe = probes.find((p) => p.key === 'relegation' && p.motivates);
    const tailProbe = probes.find((p) => p.key.startsWith('tail') && p.motivates);
    if (relProbe || (stance === 'escape' && tailProbe)) {
      if (rank >= (relegationLine ?? Infinity)) {
        outcomes.push('escape_relegation');
        reasons.push('A win helps climb out of the danger zone');
      } else {
        outcomes.push('escape_safety');
        reasons.push('A win builds a safety cushion above the danger zone');
      }
    }
  }

  if (dethroned) {
    reasons.push('Recently dropped from a critical line — still mathematically linked');
  }

  if (outcomes.length === 0) {
    if (motivating.length > 0 && stance === 'chase') {
      outcomes.push('chase_reduce_gap');
      reasons.push('Gap after a win stays inside 4 points of a neighbour / target');
    } else {
      outcomes.push('no_reward');
      reasons.push('No meaningful table reward attached to a win');
    }
  }

  // Grade: A = take-over / critical chase / escape; B = softer escape / late push; none = no reward / futile.
  let grade: MotivationGrade = 'none';
  if (outcomes.includes('futile_chase') && outcomes.every((o) => o === 'futile_chase' || o === 'no_reward')) {
    grade = 'none';
  } else if (
    outcomes.includes('take_over') ||
    outcomes.includes('extend_lead') ||
    outcomes.includes('chase_reduce_gap') ||
    outcomes.includes('escape_relegation')
  ) {
    grade = 'A';
  } else if (outcomes.includes('escape_safety')) {
    grade = 'B';
  } else if (outcomes.includes('no_reward')) {
    grade = 'none';
  }

  // Mid-table sharpness: if mid and we found a motivating probe, prefer A.
  return { outcomes: [...new Set(outcomes)], grade, reasons };
}

// ----- Public API ---------------------------------------------------------

export function evaluateTeamMotivation(
  teamId: number,
  table: StandingLike[],
  opts: {
    competitionId?: number | string | null;
    seasonProgress?: number | null;
  } = {},
): TeamMotivation | null {
  if (table.length === 0) return null;
  const team = findTeam(table, teamId);
  if (!team) return null;

  const lines = criticalLinesFor(opts.competitionId ?? null, table.length);
  const stanceBit = stanceForTeam(team, table, lines, opts.seasonProgress);
  const probes = buildProbes(team, table, lines);
  const rankAfter = rankAfterWin(table, teamId);
  const { outcomes, grade, reasons } = outcomesFromContext({
    stance: stanceBit.stance,
    probes,
    rank: team.rank,
    rankAfter,
    futileChase: stanceBit.futileChase,
    dethroned: stanceBit.dethroned,
    relegationLine: lines.relegationLine,
  });

  // If every probe rejects and stance is no_reward, force grade none.
  const anyProbe = probes.some((p) => p.motivates);
  const finalGrade: MotivationGrade =
    !anyProbe && stanceBit.stance === 'no_reward' && !outcomes.includes('take_over')
      ? 'none'
      : grade;

  return {
    teamId: team.teamId,
    name: team.name,
    rank: team.rank,
    points: team.points,
    stance: stanceBit.stance,
    stanceReason: stanceBit.stanceReason,
    grade: finalGrade,
    outcomes,
    reasons,
    probes,
    futileChase: stanceBit.futileChase,
    mode: stanceBit.mode,
    rankAfterWin: rankAfter,
    isMidTable: stanceBit.isMidTable,
    dethroned: stanceBit.dethroned,
  };
}

export function evaluateFixtureMotivation(
  table: StandingLike[],
  homeId: number | null | undefined,
  awayId: number | null | undefined,
  opts: {
    competitionId?: number | string | null;
    seasonProgress?: number | null;
  } = {},
): FixtureMotivation {
  return {
    home: homeId != null ? evaluateTeamMotivation(homeId, table, opts) : null,
    away: awayId != null ? evaluateTeamMotivation(awayId, table, opts) : null,
  };
}

export function evaluateTableStances(
  table: StandingLike[],
  opts: {
    competitionId?: number | string | null;
    seasonProgress?: number | null;
  } = {},
): TeamMotivation[] {
  return sortedTable(table)
    .map((r) => evaluateTeamMotivation(r.teamId, table, opts))
    .filter((m): m is TeamMotivation => m != null);
}

export const OUTCOME_LABEL: Record<MotivationOutcome, string> = {
  extend_lead: 'Extend the lead',
  take_over: 'Take over a place',
  chase_reduce_gap: 'Chase — reduce the gap',
  escape_relegation: 'Escape relegation',
  escape_safety: 'Build relegation safety',
  no_reward: 'No table reward',
  futile_chase: 'Futile chase',
};

export const STANCE_LABEL: Record<TeamStance, string> = {
  chase: 'Chase',
  escape: 'Escape',
  no_reward: 'No reward',
};

export const GRADE_LABEL: Record<MotivationGrade, string> = {
  A: 'Motivation A',
  B: 'Motivation B',
  none: 'No motivation',
};
