/**
 * Form + child beater labels.
 * PPG bands depend on the side's table colour. A red side whose PPG sits on
 * 1.5–1.7 is a child beater. Yellow sides use the Bhozoma vs-below rule:
 * more than half the points from teams below them → Umnqumi wehlathi.
 */

import {
  buildBhozomaTable,
  seasonMatchPeriodGoals,
  type BhozomaPeriod,
  type BhozomaVenue,
  type SeasonMatch,
} from '@/utils/bhozomaEngine';
import type { StandingLike } from '@/utils/motivationEngine';
import { colourWord, type TableColour } from '@/utils/powerDynamicsEngine';

export type FormChildBand = 'bad' | 'mild' | 'good' | 'great';

export const FORM_CHILD_BAND_LABEL: Record<FormChildBand, string> = {
  bad: 'Bad',
  mild: 'Mild / ok',
  good: 'Good',
  great: 'Great',
};

export type FormChildGroup = 'table' | '1h' | '2h' | 'ft';
export type FormChildVenue = 'overall' | 'home' | 'away';

export type FormChildRecord = {
  mp: number;
  won: number;
  drawn: number;
  lost: number;
  points: number;
  ppg: number | null;
};

export type FormChildSide = {
  label: string;
  teamId: number | null;
  colour: TableColour | null;
  rank: number | null;
  /** League-table record. Used by the Overall table tab. */
  table: FormChildRecord;
};

export type FormChildRow = {
  label: string;
  teamId: number | null;
  tier: string;
  colour: TableColour | null;
  rank: number | null;
  mp: number;
  won: number;
  drawn: number;
  lost: number;
  points: number;
  ppg: number | null;
  band: FormChildBand | null;
  bandLabel: string;
  childBeater: boolean;
  /** Red sides: Umshayi wezingane, or an explicit miss. Other tiers stay null. */
  umshayi: string | null;
  /** Confirmed or early Bhozoma read, when the side is Umnqumi wehlathi. */
  bhozoma: string | null;
};

export type FixtureExclude = { unix: number; homeId: number; awayId: number };

/**
 * Green: 0–0.7 Bad, 0.8–1.2 Good, 1.3–3 Great.
 * Yellow: 0–0.9 Bad, 1.0–1.4 Mild/ok, 1.5–1.7 Good, 1.8–3 Great.
 * Red: 0–1 Bad, 1.1–1.4 Mild/ok, 1.5–1.7 Good, 1.8–3 Great.
 * Gaps between the written tenths belong to the band that starts at the next cut.
 */
export function formChildBand(ppg: number, colour: TableColour): FormChildBand {
  if (colour === 'green') {
    if (ppg < 0.8) return 'bad';
    if (ppg < 1.3) return 'good';
    return 'great';
  }
  if (colour === 'yellow') {
    if (ppg < 1.0) return 'bad';
    if (ppg < 1.5) return 'mild';
    if (ppg < 1.8) return 'good';
    return 'great';
  }
  if (ppg < 1.1) return 'bad';
  if (ppg < 1.5) return 'mild';
  if (ppg < 1.8) return 'good';
  return 'great';
}

/** Red PPG on 1.5 or 1.7 — the red "good" band. */
export function isRedChildBeater(ppg: number | null, colour: TableColour | null): boolean {
  if (ppg == null || colour !== 'red' || !Number.isFinite(ppg)) return false;
  return ppg >= 1.5 && ppg < 1.8;
}

/** Red sides are always called. PPG on 1.5–1.7 is Umshayi wezingane; every other red PPG is not. */
export function umshayiWezingane(ppg: number | null, colour: TableColour | null): string | null {
  if (colour !== 'red') return null;
  return isRedChildBeater(ppg, colour) ? 'Umshayi wezingane' : 'Not a child beater';
}

export function halfTimeCoverage(matches: SeasonMatch[]): { covered: number; total: number } {
  return {
    covered: matches.filter((m) => m.homeGoalsHt != null && m.awayGoalsHt != null).length,
    total: matches.length,
  };
}

function emptyRecord(): FormChildRecord {
  return { mp: 0, won: 0, drawn: 0, lost: 0, points: 0, ppg: null };
}

function withoutFixture(matches: SeasonMatch[], exclude: FixtureExclude | null | undefined): SeasonMatch[] {
  if (!exclude) return matches;
  return matches.filter(
    (m) => !(m.unix === exclude.unix && m.homeId === exclude.homeId && m.awayId === exclude.awayId),
  );
}

function tallyTeam(
  teamId: number,
  matches: SeasonMatch[],
  venue: FormChildVenue,
  period: BhozomaPeriod,
): FormChildRecord {
  let won = 0;
  let drawn = 0;
  let lost = 0;
  for (const m of matches) {
    const asHome = m.homeId === teamId;
    const asAway = m.awayId === teamId;
    if (!asHome && !asAway) continue;
    if (venue === 'home' && !asHome) continue;
    if (venue === 'away' && !asAway) continue;
    const goals = seasonMatchPeriodGoals(m, period);
    if (!goals) continue;
    const gf = asHome ? goals.home : goals.away;
    const ga = asHome ? goals.away : goals.home;
    if (gf > ga) won += 1;
    else if (gf === ga) drawn += 1;
    else lost += 1;
  }
  const mp = won + drawn + lost;
  const points = won * 3 + drawn;
  return { mp, won, drawn, lost, points, ppg: mp > 0 ? points / mp : null };
}

function umnqumiLabel(
  standings: StandingLike[],
  matches: SeasonMatch[],
  competitionId: number | string | null | undefined,
  venue: BhozomaVenue,
  period: BhozomaPeriod,
  teamId: number | null,
): string | null {
  if (teamId == null || standings.length === 0) return null;
  const table = buildBhozomaTable(standings, matches, competitionId, venue, period);
  const row = table.rows.find((r) => r.teamId === teamId);
  if (!row?.isMidTable) return null;
  const label = row.below.label;
  if (label && label.startsWith('Umnqumi wehlathi')) return label;
  return null;
}

function rowFor(
  side: FormChildSide,
  record: FormChildRecord,
  bhozoma: string | null,
): FormChildRow {
  const band = record.ppg != null && side.colour ? formChildBand(record.ppg, side.colour) : null;
  return {
    label: side.label,
    teamId: side.teamId,
    tier: colourWord(side.colour),
    colour: side.colour,
    rank: side.rank,
    mp: record.mp,
    won: record.won,
    drawn: record.drawn,
    lost: record.lost,
    points: record.points,
    ppg: record.ppg,
    band,
    bandLabel: band ? FORM_CHILD_BAND_LABEL[band] : '—',
    childBeater: isRedChildBeater(record.ppg, side.colour),
    umshayi: umshayiWezingane(record.ppg, side.colour),
    bhozoma,
  };
}

/** Both sides for the open tab. Overall table uses the league table; the other tabs use finished games. */
export function formChildTable(opts: {
  t1: FormChildSide;
  t2: FormChildSide;
  standings: StandingLike[];
  matches: SeasonMatch[];
  competitionId?: number | string | null;
  group: FormChildGroup;
  venue: FormChildVenue;
  exclude?: FixtureExclude | null;
}): FormChildRow[] {
  const games = withoutFixture(opts.matches, opts.exclude);
  const period: BhozomaPeriod = opts.group === '1h' || opts.group === '2h' ? opts.group : 'ft';
  const venue: BhozomaVenue = opts.group === 'table' ? 'overall' : opts.venue;
  return [opts.t1, opts.t2].map((side) => {
    const record =
      opts.group === 'table'
        ? side.table.mp > 0
          ? side.table
          : emptyRecord()
        : side.teamId == null
          ? emptyRecord()
          : tallyTeam(side.teamId, games, opts.group === 'table' ? 'overall' : opts.venue, period);
    const bhozoma = umnqumiLabel(opts.standings, games, opts.competitionId, venue, period, side.teamId);
    return rowFor(side, record, bhozoma);
  });
}
