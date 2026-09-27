/**
 * Section 7 — H2H options & Polar patterns.
 * Turns a raw H2H list into decision tags (never beaten, polar, Nika Nika, …).
 */

import type { H2HMatch } from '@/services/oddAlerts';
import {
  H2H_MEETINGS_LIMIT,
  h2hOutcomeForTeam,
  recentH2hMeetings,
  teamInH2hMatch,
  teamsMatch,
  type H2HOutcome,
  type H2HSplit,
} from '@/utils/h2hDisplay';
import type { TeamResult } from '@/utils/teamResults';
import { lastN } from '@/utils/teamResults';

/** Max H2H points each side can show in the points-share read (5 meetings × 3). */
export const H2H_POINTS_SHARE_MAX = H2H_MEETINGS_LIMIT * 3;

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

export type H2HGrade = 'A' | 'B' | 'C';

export type H2HSayBlock = {
  n: 1 | 2 | 3 | 4;
  id: string;
  title: string;
  detail: string;
  kind: H2HOptionTag['kind'];
  grade?: H2HGrade | null;
  gradeKind?: 'never_beats' | 'polar' | null;
};

export type FixtureH2HOptions = {
  hasData: boolean;
  tags: H2HOptionTag[];
  /** Numbered "What the head-to-head says" blocks. */
  says: H2HSayBlock[];
  /** Points share from home lens, e.g. 4/15 vs 6/15. */
  pointsShare: { home: number; away: number; max: number; same: boolean; diff: number } | null;
  avgGoals: number | null;
  polarSequences: PolarSequenceHit[];
  scoreBetRelevant: boolean;
};

/** W/D/L for a named side in one H2H row. */
export function outcomeForSide(m: H2HMatch, sideName: string): H2HOutcome {
  return h2hOutcomeForTeam(m, sideName);
}

/** Meetings in a split from `viewer`'s venue lens, newest first. */
function matchesInSplit(
  matches: H2HMatch[],
  viewer: string,
  split: H2HSplit,
): H2HMatch[] {
  const list =
    split === 'overall'
      ? matches
      : split === 'home'
        ? matches.filter((m) => teamsMatch(m.home_name, viewer))
        : matches.filter((m) => teamsMatch(m.away_name, viewer));
  return [...list].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

function outcomesInSplit(
  matches: H2HMatch[],
  viewer: string,
  split: H2HSplit,
): H2HOutcome[] {
  return matchesInSplit(matches, viewer, split)
    .filter((m) => teamInH2hMatch(m, viewer))
    .map((m) => outcomeForSide(m, viewer));
}

/** True if this side has any H2H loss in the full set (any venue). */
export function hasBeenBeaten(matches: H2HMatch[], viewer: string): boolean {
  return matches.some((m) => {
    if (!teamInH2hMatch(m, viewer)) return false;
    if (h2hOutcomeForTeam(m, viewer) === 'L') return true;
    const opp = teamsMatch(m.home_name, viewer) ? m.away_name : m.home_name;
    return h2hOutcomeForTeam(m, opp) === 'W';
  });
}

function neverBeaten(
  matches: H2HMatch[],
  viewer: string,
  split: H2HSplit,
): H2HOutcome[] | null {
  // Overall is unbeaten only with no losses anywhere. Home / away stay venue-specific.
  if (split === 'overall' && hasBeenBeaten(matches, viewer)) return null;
  const outcomes = outcomesInSplit(matches, viewer, split);
  if (outcomes.length === 0) return null;
  if (outcomes.some((o) => o === 'L')) return null;
  return outcomes;
}

/** Max results shown inside the never-beaten brackets. */
export const NEVER_BEATEN_SEQ_LIMIT = 5;

/** e.g. (W W W D D) — at most 5, newest first. */
export function formatNeverBeatenSequence(
  outcomes: H2HOutcome[],
  limit: number = NEVER_BEATEN_SEQ_LIMIT,
): string {
  if (outcomes.length === 0) return '';
  return `(${outcomes.slice(0, limit).join(' ')})`;
}

/**
 * Grade T2's unbeaten H2H when T1 never beats T2 (T2 wins + draws, no T1 wins).
 * 5 games: A = 5W / 4W1D / 3W2D · B = 2W3D · C = 1W4D or 5D
 * 4 games: A = 4W / 3W1D · B = 2W2D · C = 1W3D or 4D
 * 3 games: A = 3W / 2W1D · B = 1W2D · C = 3D
 * 2 games: A = 2W · B = 1W1D · C = 2D
 */
export function neverBeatGrade(games: number, wins: number, draws: number): H2HGrade | null {
  if (games < 1 || wins < 0 || draws < 0 || wins + draws !== games) return null;
  if (games === 5) {
    if (wins >= 3) return 'A';
    if (wins === 2) return 'B';
    return 'C';
  }
  if (games === 4) {
    if (wins >= 3) return 'A';
    if (wins === 2) return 'B';
    return 'C';
  }
  if (games === 3) {
    if (wins >= 2) return 'A';
    if (wins === 1) return 'B';
    return 'C';
  }
  if (games === 2) {
    if (wins === 2) return 'A';
    if (wins === 1) return 'B';
    return 'C';
  }
  if (games === 1) return wins === 1 ? 'A' : 'C';
  return null;
}

/**
 * Grade the polar edge from the leading side’s W/D/L in the last H2H window.
 * 5: A = 5W / 4W1D / 4W1L · B = 3W2D / 3W1D1L / 3W2L
 * 4: A = 4W / 3W1D / 3W1L · B = 2W2D / 2W1D1L
 * 3: A = 3W · B = 2W1L / 2W1D
 * 2: A = 2W · C = 1W1D
 */
export function polarEdgeGrade(
  games: number,
  wins: number,
  draws: number,
  losses: number,
): H2HGrade | null {
  if (games < 2 || wins + draws + losses !== games) return null;
  if (games === 5) {
    if (wins === 5 && draws === 0 && losses === 0) return 'A';
    if (wins === 4 && draws === 1 && losses === 0) return 'A';
    if (wins === 4 && draws === 0 && losses === 1) return 'A';
    if (wins === 3 && draws === 2 && losses === 0) return 'B';
    if (wins === 3 && draws === 1 && losses === 1) return 'B';
    if (wins === 3 && draws === 0 && losses === 2) return 'B';
    return null;
  }
  if (games === 4) {
    if (wins === 4 && draws === 0 && losses === 0) return 'A';
    if (wins === 3 && draws === 1 && losses === 0) return 'A';
    if (wins === 3 && draws === 0 && losses === 1) return 'A';
    if (wins === 2 && draws === 2 && losses === 0) return 'B';
    if (wins === 2 && draws === 1 && losses === 1) return 'B';
    return null;
  }
  if (games === 3) {
    if (wins === 3 && draws === 0 && losses === 0) return 'A';
    if (wins === 2 && draws === 0 && losses === 1) return 'B';
    if (wins === 2 && draws === 1 && losses === 0) return 'B';
    return null;
  }
  if (games === 2) {
    if (wins === 2 && draws === 0 && losses === 0) return 'A';
    if (wins === 1 && draws === 1 && losses === 0) return 'C';
    return null;
  }
  return null;
}

/**
 * Nika nika — anyone’s game — from a side’s W/D/L in the last H2H window.
 * 5: 2W2L1D or 3W2L · 4: 2W1L1D or 2W2L · 3: 1W1L1D · 2: 1W1L
 */
export function isNikaNikaRecord(
  games: number,
  wins: number,
  draws: number,
  losses: number,
): boolean {
  if (games < 2 || wins + draws + losses !== games) return false;
  if (games === 5) {
    return (wins === 2 && losses === 2 && draws === 1) || (wins === 3 && losses === 2 && draws === 0);
  }
  if (games === 4) {
    return (wins === 2 && losses === 1 && draws === 1) || (wins === 2 && losses === 2 && draws === 0);
  }
  if (games === 3) return wins === 1 && losses === 1 && draws === 1;
  if (games === 2) return wins === 1 && losses === 1 && draws === 0;
  return false;
}

export type H2HGradeGuideKind = 'never_beats' | 'polar';

export type H2HGradeGuide = {
  kind: H2HGradeGuideKind;
  title: string;
  note: string;
  windows: { games: number; grades: { grade: H2HGrade; lines: string[] }[] }[];
};

export const NEVER_BEAT_GRADE_GUIDE: H2HGradeGuide = {
  kind: 'never_beats',
  title: 'T1 never beats T2 grades',
  note: 'Graded from T2’s wins and draws when T1 has never beaten T2.',
  windows: [
    {
      games: 5,
      grades: [
        { grade: 'A', lines: ['5 wins', '4 wins 1 draw', '3 wins 2 draws'] },
        { grade: 'B', lines: ['2 wins 3 draws'] },
        { grade: 'C', lines: ['1 win 4 draws', '5 draws'] },
      ],
    },
    {
      games: 4,
      grades: [
        { grade: 'A', lines: ['4 wins', '3 wins 1 draw'] },
        { grade: 'B', lines: ['2 wins 2 draws'] },
        { grade: 'C', lines: ['1 win 3 draws', '4 draws'] },
      ],
    },
    {
      games: 3,
      grades: [
        { grade: 'A', lines: ['3 wins', '2 wins 1 draw'] },
        { grade: 'B', lines: ['1 win 2 draws'] },
        { grade: 'C', lines: ['3 draws'] },
      ],
    },
    {
      games: 2,
      grades: [
        { grade: 'A', lines: ['2 wins'] },
        { grade: 'B', lines: ['1 win 1 draw'] },
        { grade: 'C', lines: ['2 draws'] },
      ],
    },
  ],
};

export const POLAR_EDGE_GRADE_GUIDE: H2HGradeGuide = {
  kind: 'polar',
  title: 'Edge (polar) grades',
  note: 'Graded from the leading side’s wins, draws and losses in this H2H.',
  windows: [
    {
      games: 5,
      grades: [
        { grade: 'A', lines: ['5 wins', '4 wins 1 draw', '4 wins 1 loss'] },
        { grade: 'B', lines: ['3 wins 2 draws', '3 wins 1 draw 1 loss', '3 wins 2 losses'] },
      ],
    },
    {
      games: 4,
      grades: [
        { grade: 'A', lines: ['4 wins', '3 wins 1 draw', '3 wins 1 loss'] },
        { grade: 'B', lines: ['2 wins 2 draws', '2 wins 1 draw 1 loss'] },
      ],
    },
    {
      games: 3,
      grades: [
        { grade: 'A', lines: ['3 wins'] },
        { grade: 'B', lines: ['2 wins 1 loss', '2 wins 1 draw'] },
      ],
    },
    {
      games: 2,
      grades: [
        { grade: 'A', lines: ['2 wins'] },
        { grade: 'C', lines: ['1 win 1 draw'] },
      ],
    },
  ],
};

export function h2hGradeGuide(kind: H2HGradeGuideKind): H2HGradeGuide {
  return kind === 'polar' ? POLAR_EDGE_GRADE_GUIDE : NEVER_BEAT_GRADE_GUIDE;
}

function countWdl(outcomes: H2HOutcome[]): { w: number; d: number; l: number } {
  let w = 0;
  let d = 0;
  let l = 0;
  for (const o of outcomes) {
    if (o === 'W') w += 1;
    else if (o === 'D') d += 1;
    else l += 1;
  }
  return { w, d, l };
}

/** Prefer meetings in the fixture’s current competition when the name matches. */
export function filterH2hByCompetition(
  matches: H2HMatch[],
  competitionName?: string | null,
): H2HMatch[] {
  const name = competitionName?.trim();
  if (!name) return matches;
  const inLeague = matches.filter((m) => {
    const league = m.league?.trim() ?? '';
    if (!league) return false;
    return teamsMatch(league, name);
  });
  return inLeague.length > 0 ? inLeague : matches;
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
  /** T1 / T2 from the table. Defaults to home / away. */
  t1Name?: string | null;
  t2Name?: string | null;
  /** Current fixture competition — used for never-beaten totals. */
  competitionName?: string | null;
  /** Optional recent form (non-H2H) for polar sequences through T1 lens. */
  homeForm?: TeamResult[];
}): FixtureH2HOptions {
  const { matches, homeName, awayName, competitionName, homeForm } = opts;
  const t1 = (opts.t1Name ?? '').trim() || homeName;
  const t2 = (opts.t2Name ?? '').trim() || awayName;

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
      says: [],
      pointsShare: null,
      avgGoals: null,
      polarSequences: [],
      scoreBetRelevant: false,
    };
  }

  const tags: H2HOptionTag[] = [];
  /** Points share / polar use last 5 meetings only (max 15 pts each). */
  const overall = recentH2hMeetings(matches, H2H_MEETINGS_LIMIT);
  const leagueLabel = competitionName?.trim() || 'these meetings';

  // Never beaten — overall is unbeaten everywhere; home / away are that venue only.
  for (const split of ['overall', 'home', 'away'] as const) {
    const homeSeq = neverBeaten(matches, homeName, split);
    if (homeSeq) {
      const seq = formatNeverBeatenSequence(homeSeq);
      const { w, d, l } = countWdl(homeSeq);
      if (l === 0) {
        tags.push({
          id: `never_beaten_home_${split}`,
          label: `${homeName} never beaten (${split}) ${seq}`,
          kind: 'good',
          detail: `In ${leagueLabel}: ${w} win${w === 1 ? '' : 's'}, ${d} draw${d === 1 ? '' : 's'}, ${l} losses (${split})`,
        });
      }
    }
    const awaySeq = neverBeaten(matches, awayName, split);
    if (awaySeq) {
      const seq = formatNeverBeatenSequence(awaySeq);
      const { w, d, l } = countWdl(awaySeq);
      if (l === 0) {
        tags.push({
          id: `never_beaten_away_${split}`,
          label: `${awayName} never beaten (${split}) ${seq}`,
          kind: 'bad',
          detail: `In ${leagueLabel}: ${w} win${w === 1 ? '' : 's'}, ${d} draw${d === 1 ? '' : 's'}, ${l} losses (${split})`,
        });
      }
    }
  }

  // Points share — last 5 only so max is 15 per side
  const homeOutcomes = overall.map((m) => outcomeForSide(m, homeName));
  const homePts = pointsFromOutcomes(homeOutcomes);
  const maxPts = overall.length * 3;
  const awayOutcomes = overall.map((m) => outcomeForSide(m, awayName));
  const awayPtsReal = pointsFromOutcomes(awayOutcomes);
  const t1Outcomes = overall.map((m) => outcomeForSide(m, t1));
  const t2Outcomes = overall.map((m) => outcomeForSide(m, t2));
  const t1Pts = pointsFromOutcomes(t1Outcomes);
  const t2Pts = pointsFromOutcomes(t2Outcomes);
  const t1Wdl = countWdl(t1Outcomes);
  const t2Wdl = countWdl(t2Outcomes);
  const shareDiff = Math.abs(t1Pts - t2Pts);
  const same = shareDiff <= 3;
  const greaterIsT1 = t1Pts >= t2Pts;
  const greaterLabel = greaterIsT1 ? 'T1' : 'T2';
  const greaterName = greaterIsT1 ? t1 : t2;
  const greaterWdl = greaterIsT1 ? t1Wdl : t2Wdl;
  const polarGrade = polarEdgeGrade(overall.length, greaterWdl.w, greaterWdl.d, greaterWdl.l);
  const polar = polarGrade != null;
  const nikaNika =
    isNikaNikaRecord(overall.length, t1Wdl.w, t1Wdl.d, t1Wdl.l) ||
    isNikaNikaRecord(overall.length, t2Wdl.w, t2Wdl.d, t2Wdl.l);
  const pointsShare = {
    home: homePts,
    away: awayPtsReal,
    max: maxPts,
    same,
    diff: shareDiff,
  };
  tags.push({
    id: 'points_share',
    label: same ? 'Even in past meetings' : homePts > awayPtsReal ? 'Home edge in H2H' : 'Away edge in H2H',
    kind: same ? 'neutral' : homePts > awayPtsReal ? 'good' : 'bad',
    detail: `${homePts}–${awayPtsReal} points from last ${overall.length} meetings (max ${H2H_POINTS_SHARE_MAX} each)`,
  });

  const t1NeverBeats = overall.length > 0 && t1Wdl.w === 0;
  const says: H2HSayBlock[] = [];

  if (t1NeverBeats) {
    const grade = neverBeatGrade(overall.length, t2Wdl.w, t2Wdl.d);
    says.push({
      n: 1,
      id: 'say_never_beats',
      title: 'T1 never beats T2',
      detail: `${t1} has never beaten ${t2} in the last ${overall.length} (${t2Wdl.w} win${t2Wdl.w === 1 ? '' : 's'}, ${t2Wdl.d} draw${t2Wdl.d === 1 ? '' : 's'} for T2).`,
      kind: 'warn',
      grade,
      gradeKind: grade ? 'never_beats' : null,
    });
  } else {
    says.push({
      n: 1,
      id: 'say_never_beats',
      title: 'T1 has beaten T2',
      detail: `${t1} has beaten ${t2} in these meetings (${t1Wdl.w}W / ${t1Wdl.d}D / ${t1Wdl.l}L).`,
      kind: 'info',
      grade: null,
      gradeKind: null,
    });
  }

  if (polarGrade) {
    says.push({
      n: 2,
      id: 'say_edge_polar',
      title: `${greaterLabel} edge (polar)`,
      detail: `${greaterName} ${greaterWdl.w}W / ${greaterWdl.d}D / ${greaterWdl.l}L at this H2H · ${t1Pts}–${t2Pts} points.`,
      kind: 'warn',
      grade: polarGrade,
      gradeKind: 'polar',
    });
  } else {
    says.push({
      n: 2,
      id: 'say_edge_polar',
      title: 'No edge (polar)',
      detail: 'Neither side’s H2H record matches a polar edge grade.',
      kind: 'neutral',
      grade: null,
      gradeKind: null,
    });
  }

  const nMeet = overall.length;
  if (shareDiff <= 3) {
    says.push({
      n: 3,
      id: 'say_points',
      title: `These ${nMeet} H2H games are ${maxPts} points`,
      detail: `T1 is almost equal to T2 (${t1Pts}–${t2Pts}, difference ${shareDiff} ≤ 3).`,
      kind: 'neutral',
    });
  } else {
    says.push({
      n: 3,
      id: 'say_points',
      title: `These ${nMeet} H2H games are ${maxPts} points`,
      detail: `Support ${greaterLabel} (${greaterName}) — H2H ${t1Pts}–${t2Pts}, difference ${shareDiff} is greater than 3.`,
      kind: greaterIsT1 ? 'good' : 'bad',
    });
  }

  if (shareDiff === 0 && nikaNika) {
    says.push({
      n: 4,
      id: 'say_nika',
      title: 'Point difference is 0 · Nika nika',
      detail: "Level on H2H points — anyone's game (nika nika).",
      kind: 'neutral',
    });
  } else if (shareDiff === 0) {
    says.push({
      n: 4,
      id: 'say_nika',
      title: 'Point difference is 0',
      detail: 'T1 and T2 are level on H2H points.',
      kind: 'neutral',
    });
  } else if (nikaNika) {
    says.push({
      n: 4,
      id: 'say_nika',
      title: 'Nika nika',
      detail: "Anyone's game — no clear dominator.",
      kind: 'neutral',
    });
  } else {
    says.push({
      n: 4,
      id: 'say_nika',
      title: 'Not nika nika',
      detail: "H2H is not anyone's game.",
      kind: 'info',
    });
  }

  if (polar) {
    tags.push({
      id: 'polar',
      label: `${greaterLabel} edge (polar) · Grade ${polarGrade}`,
      kind: 'warn',
      detail: `${greaterName} ${greaterWdl.w}W / ${greaterWdl.d}D / ${greaterWdl.l}L`,
    });
  }

  if (nikaNika) {
    tags.push({
      id: 'nika_nika',
      label: 'Nika nika',
      kind: 'neutral',
      detail: "Anyone's game — no clear dominator",
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
    (avgGoals != null && (avgGoals >= 2.5 || avgGoals <= 1.5)) || polar || tags.some((t) => t.id === 'last_draw');

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
    says,
    pointsShare,
    avgGoals,
    polarSequences,
    scoreBetRelevant,
  };
}
