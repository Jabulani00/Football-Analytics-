/**
 * Section 7 — H2H options & Polar patterns.
 * Turns a raw H2H list into decision tags (never beaten, polar, Nika Nika, …).
 */

import type { H2HMatch } from '@/services/oddAlerts';
import {
  h2hOutcomeForTeam,
  teamsMatch,
  type H2HOutcome,
  type H2HSplit,
} from '@/utils/h2hDisplay';
import type { TeamResult } from '@/utils/teamResults';
import { lastN } from '@/utils/teamResults';

export type H2HOptionTag = {
  id: string;
  label: string;
  kind: 'info' | 'warn' | 'good' | 'bad' | 'neutral';
  detail: string;
};

export type PolarSequenceHit = {
  pattern: string;
  matchesFound: number;
  sequence: string;
};

export type FixtureH2HOptions = {
  hasData: boolean;
  tags: H2HOptionTag[];
  /** Points share from home lens, e.g. 4/15 vs 6/15. */
  pointsShare: { home: number; away: number; max: number; same: boolean } | null;
  avgGoals: number | null;
  polarSequences: PolarSequenceHit[];
  scoreBetRelevant: boolean;
};

/** W/D/L for a named side in one H2H row. */
export function outcomeForSide(m: H2HMatch, sideName: string): H2HOutcome {
  return h2hOutcomeForTeam(m, sideName);
}

function neverBeaten(
  matches: H2HMatch[],
  viewer: string,
  opponent: string,
  split: H2HSplit,
): boolean {
  const list =
    split === 'overall'
      ? matches
      : split === 'home'
        ? matches.filter((m) => teamsMatch(m.home_name, viewer))
        : matches.filter((m) => teamsMatch(m.away_name, viewer));
  if (list.length === 0) return false;
  // Opponent never beat viewer ⇒ viewer has no losses in this split.
  return list.every((m) => outcomeForSide(m, viewer) !== 'L');
}

function pointsFromOutcomes(outcomes: H2HOutcome[]): number {
  let p = 0;
  for (const o of outcomes) {
    if (o === 'W') p += 3;
    else if (o === 'D') p += 1;
  }
  return p;
}

/** Known polar form sequences from the notes (Team 1 lens, newest→oldest string). */
export const POLAR_PATTERNS: { pattern: string; matchesFound: number }[] = [
  { pattern: 'WWWWL', matchesFound: 5 },
  { pattern: 'WWWDL', matchesFound: 5 },
  { pattern: 'WWWLL', matchesFound: 5 },
  { pattern: 'WWDDL', matchesFound: 5 },
  { pattern: 'WWWL', matchesFound: 4 },
  { pattern: 'WWDL', matchesFound: 4 },
  { pattern: 'WWL', matchesFound: 3 },
  { pattern: 'W', matchesFound: 1 },
];

export function matchPolarSequences(sequenceNewestFirst: H2HOutcome[]): PolarSequenceHit[] {
  const seq = sequenceNewestFirst.join('');
  const hits: PolarSequenceHit[] = [];
  for (const p of POLAR_PATTERNS) {
    if (seq.startsWith(p.pattern)) {
      hits.push({ pattern: p.pattern, matchesFound: p.matchesFound, sequence: seq.slice(0, p.pattern.length) });
    }
  }
  return hits;
}

export function evaluateH2HOptions(opts: {
  matches: H2HMatch[];
  homeName: string;
  awayName: string;
  /** Optional recent form (non-H2H) for polar sequences through T1 lens. */
  homeForm?: TeamResult[];
}): FixtureH2HOptions {
  const { matches, homeName, awayName, homeForm } = opts;

  if (!matches || matches.length === 0) {
    return {
      hasData: false,
      tags: [
        {
          id: 'no_h2h',
          label: 'No H2H data',
          kind: 'neutral',
          detail: 'No effects from H2H for this fixture',
        },
      ],
      pointsShare: null,
      avgGoals: null,
      polarSequences: [],
      scoreBetRelevant: false,
    };
  }

  const tags: H2HOptionTag[] = [];
  const overall = matches;

  // Never beaten — both lenses (overall / home / away splits)
  for (const split of ['overall', 'home', 'away'] as const) {
    if (neverBeaten(matches, homeName, awayName, split)) {
      tags.push({
        id: `never_beaten_home_${split}`,
        label: `${homeName} never beaten (${split})`,
        kind: 'good',
        detail: `From ${homeName}'s lens — no H2H losses in ${split}`,
      });
    }
    if (neverBeaten(matches, awayName, homeName, split)) {
      tags.push({
        id: `never_beaten_away_${split}`,
        label: `${awayName} never beaten (${split})`,
        kind: 'bad',
        detail: `From ${awayName}'s lens — no H2H losses in ${split}`,
      });
    }
  }

  // Points share (home lens on overall list)
  const homeOutcomes = overall.map((m) => outcomeForSide(m, homeName));
  const homePts = pointsFromOutcomes(homeOutcomes);
  const maxPts = overall.length * 3;
  const awayOutcomes = overall.map((m) => outcomeForSide(m, awayName));
  const awayPtsReal = pointsFromOutcomes(awayOutcomes);
  const shareDiff = Math.abs(homePts - awayPtsReal);
  const same = shareDiff <= 3;
  const pointsShare = {
    home: homePts,
    away: awayPtsReal,
    max: maxPts,
    same,
  };
  tags.push({
    id: 'points_share',
    label: same ? 'Even in past meetings' : homePts > awayPtsReal ? 'Home edge in H2H' : 'Away edge in H2H',
    kind: same ? 'neutral' : homePts > awayPtsReal ? 'good' : 'bad',
    detail: `${homePts}–${awayPtsReal} points from past meetings (max ${maxPts} each)`,
  });

  // Polar dominance: one side has ≥70% of available points and ≥3 meetings
  const homeShare = maxPts > 0 ? homePts / maxPts : 0;
  const awayShare = maxPts > 0 ? awayPtsReal / maxPts : 0;
  if (overall.length >= 3 && (homeShare >= 0.7 || awayShare >= 0.7)) {
    const dominant = homeShare >= awayShare ? homeName : awayName;
    tags.push({
      id: 'polar',
      label: 'One side dominates',
      kind: 'warn',
      detail: `${dominant} has clearly dominated these meetings`,
    });
  }

  // Nika Nika — anyone's game: enough meetings, same strength, no polar
  const isPolar = tags.some((t) => t.id === 'polar');
  if (overall.length >= 3 && same && !isPolar) {
    tags.push({
      id: 'nika_nika',
      label: "Anyone's game",
      kind: 'neutral',
      detail: 'Balanced head-to-head — no clear dominator',
    });
  }

  // Last meeting draw → revenge / unsettled
  const last = [...overall].sort((a, b) => {
    // date strings YYYY-MM-DD preferred; fall back to id
    return (b.date || '').localeCompare(a.date || '') || b.id - a.id;
  })[0];
  if (last && (last.draw || outcomeForSide(last, homeName) === 'D')) {
    tags.push({
      id: 'last_draw',
      label: 'Last meeting drew',
      kind: 'warn',
      detail: 'Top dog may want revenge — so does the side that dropped points',
    });
  }

  // Avg goals
  const goalTotals = overall
    .map((m) => m.total_goals ?? (m.home_goals ?? 0) + (m.away_goals ?? 0))
    .filter((g) => g >= 0);
  const avgGoals =
    goalTotals.length > 0 ? goalTotals.reduce((a, b) => a + b, 0) / goalTotals.length : null;
  if (avgGoals != null) {
    if (avgGoals >= 2.5) {
      tags.push({
        id: 'high_avg_goals',
        label: 'High-scoring meetings',
        kind: 'info',
        detail: `Past meetings average ${avgGoals.toFixed(1)} goals`,
      });
    } else if (avgGoals <= 1.5) {
      tags.push({
        id: 'low_avg_goals',
        label: 'Low-scoring meetings',
        kind: 'info',
        detail: `Past meetings average ${avgGoals.toFixed(1)} goals`,
      });
    }
  }

  // Team good / bad from home lens wins rate
  if (overall.length >= 3) {
    const wr = homeOutcomes.filter((o) => o === 'W').length / overall.length;
    if (wr >= 0.6) {
      tags.push({
        id: 'team_good',
        label: 'Strong in these meetings',
        kind: 'good',
        detail: `${homeName} wins ${Math.round(wr * 100)}% of past meetings`,
      });
    } else if (wr <= 0.25) {
      tags.push({
        id: 'team_bad',
        label: 'Struggles in these meetings',
        kind: 'bad',
        detail: `${homeName} wins only ${Math.round(wr * 100)}% of past meetings`,
      });
    }
  }

  // Polar sequences — prefer recent form through T1 lens; else H2H outcomes
  let polarSequences: PolarSequenceHit[] = [];
  if (homeForm && homeForm.length > 0) {
    polarSequences = matchPolarSequences(lastN(homeForm, 5).map((r) => r.outcome));
  } else {
    polarSequences = matchPolarSequences(homeOutcomes.slice(0, 5));
  }
  if (polarSequences.length > 0) {
    const best = polarSequences[0];
    tags.push({
      id: 'polar_sequence',
      label: `Clear win pattern (${best.pattern})`,
      kind: best.matchesFound <= 1 ? 'info' : 'warn',
      detail:
        best.matchesFound === 1
          ? `Only one match in this pattern — weaker signal · ${best.sequence}`
          : `${best.matchesFound} matches fit · ${best.sequence}`,
    });
  }

  const scoreBetRelevant =
    (avgGoals != null && (avgGoals >= 2.5 || avgGoals <= 1.5)) || isPolar || tags.some((t) => t.id === 'last_draw');

  if (scoreBetRelevant) {
    tags.push({
      id: 'score_bet',
      label: 'Worth a correct-score look',
      kind: 'info',
      detail: 'Past meetings suggest checking exact scores or multi-score bets',
    });
  }

  return {
    hasData: true,
    tags,
    pointsShare,
    avgGoals,
    polarSequences,
    scoreBetRelevant,
  };
}
