/**
 * Section 10 — Stats coverage ("depth of knowledge").
 *
 * The analysis notes list two different coverage questions side by side (p3):
 *
 *   14. Coverage — Competitions: My Machine vs Hollywoodbets
 *   15. Stats Coverage — "identify depth of knowledge for that fixture or
 *       league covered"
 *
 * The first asks whether the book lists a fixture at all, and lives in
 * `services/hollywoodHunt.ts`. This file answers the second, which is about our
 * own data: for a fixture we *can* see, how much history do we actually hold to
 * reason with? A fixture the book lists but that we know almost nothing about is
 * a coverage gap too, and the notes are explicit that thin data must be shown
 * rather than silently treated as a weak signal.
 *
 * The usable threshold is the notes' own, not a new invention: MP of 3 or more
 * is usable, 2 or less is "insufficient data" (p62, p65). At that level p62 says
 * to keep displaying — "not specify / Default, but show the nature… not
 * commanding, show what is there (do not filter)" — so `thin` and `none` are
 * reported as states rather than removed from the feed.
 *
 * Pure — feed it the shared result feed. No network, no React.
 */

import { filterScope, type TeamResult } from '@/utils/teamResults';

/** MP of 3 or more is usable; 2 or less is insufficient (notes p62/p65). */
export const MIN_USABLE_MP = 3;

export type CoverageLevel = 'full' | 'partial' | 'thin' | 'none';

export type SideDepth = {
  side: 'home' | 'away';
  teamId: number;
  teamName: string;
  /** Finished matches we hold, by split. */
  overall: number;
  home: number;
  away: number;
  /** Overall clears the usable bar. */
  usable: boolean;
  /** The venue split that matters for this side clears the bar too. */
  venueUsable: boolean;
};

export type StatsCoverage = {
  home: SideDepth;
  away: SideDepth;
  h2h: number;
  h2hUsable: boolean;
  /** Both sides were found on the league table. */
  inTable: boolean;
  level: CoverageLevel;
  /** Enough to make any call at all — both sides clear the overall bar. */
  callable: boolean;
  /** Plain-English list of what is missing, for display. */
  gaps: string[];
};

function depthFor(
  side: 'home' | 'away',
  teamId: number,
  teamName: string,
  results: TeamResult[],
): SideDepth {
  const overall = results.length;
  const home = filterScope(results, 'home').length;
  const away = filterScope(results, 'away').length;
  return {
    side,
    teamId,
    teamName,
    overall,
    home,
    away,
    usable: overall >= MIN_USABLE_MP,
    // A home side is judged on its home record, an away side on its away record.
    venueUsable: (side === 'home' ? home : away) >= MIN_USABLE_MP,
  };
}

/**
 * Rate how much we actually know about a fixture.
 *
 * `level` is deliberately coarse, because it drives display rather than a
 * decision:
 *   full    — both sides usable overall *and* on the venue split, and H2H exists
 *   partial — both sides usable overall, but a venue split or H2H is thin
 *   thin    — at least one side has some history, but not enough to call
 *   none    — we hold nothing for one or both sides
 */
export function statsCoverage(opts: {
  homeId: number;
  awayId: number;
  homeName: string;
  awayName: string;
  homeResults: TeamResult[];
  awayResults: TeamResult[];
  /** Past meetings between the two sides, however many we hold. */
  h2hCount?: number;
  /** Whether both sides were located on the league table. */
  inTable?: boolean;
}): StatsCoverage {
  const home = depthFor('home', opts.homeId, opts.homeName, opts.homeResults);
  const away = depthFor('away', opts.awayId, opts.awayName, opts.awayResults);

  const h2h = opts.h2hCount ?? 0;
  const h2hUsable = h2h >= MIN_USABLE_MP;
  const inTable = opts.inTable ?? false;

  const gaps: string[] = [];
  if (home.overall === 0) gaps.push(`No results held for ${home.teamName}`);
  else if (!home.usable) gaps.push(`Only ${home.overall} match${home.overall === 1 ? '' : 'es'} for ${home.teamName}`);
  if (away.overall === 0) gaps.push(`No results held for ${away.teamName}`);
  else if (!away.usable) gaps.push(`Only ${away.overall} match${away.overall === 1 ? '' : 'es'} for ${away.teamName}`);
  if (home.usable && !home.venueUsable) gaps.push(`Thin home record for ${home.teamName}`);
  if (away.usable && !away.venueUsable) gaps.push(`Thin away record for ${away.teamName}`);
  if (h2h === 0) gaps.push('No past meetings');
  else if (!h2hUsable) gaps.push(`Only ${h2h} past meeting${h2h === 1 ? '' : 's'}`);
  if (!inTable) gaps.push('One or both sides not on the league table');

  const callable = home.usable && away.usable;

  let level: CoverageLevel;
  if (home.overall === 0 || away.overall === 0) level = 'none';
  else if (!callable) level = 'thin';
  else if (home.venueUsable && away.venueUsable && h2hUsable) level = 'full';
  else level = 'partial';

  return { home, away, h2h, h2hUsable, inTable, level, callable, gaps };
}

export const COVERAGE_LABEL: Record<CoverageLevel, string> = {
  full: 'Full history',
  partial: 'Partial history',
  thin: 'Not enough to call',
  none: 'No history held',
};

/**
 * Roll fixture-level depth up to a league, so the notes' "or league covered"
 * half is answerable too. Counts are of fixtures, not matches.
 */
export type LeagueCoverage = {
  fixtures: number;
  full: number;
  partial: number;
  thin: number;
  none: number;
  /** Share of fixtures we can actually call on, 0–100. */
  callablePct: number;
};

export function leagueCoverage(perFixture: StatsCoverage[]): LeagueCoverage {
  const out: LeagueCoverage = {
    fixtures: perFixture.length,
    full: 0,
    partial: 0,
    thin: 0,
    none: 0,
    callablePct: 0,
  };
  for (const c of perFixture) out[c.level] += 1;
  const callable = perFixture.filter((c) => c.callable).length;
  out.callablePct = perFixture.length > 0 ? (callable / perFixture.length) * 100 : 0;
  return out;
}
