/**
 * Section 1 — core T1 vs T2 comparison (7 stats).
 * Live-calculated from standings + finished results. Pure / additive.
 */

import type { StandingRow } from '@/services/oddAlerts';
import type { ComplianceLevel } from '@/types/analytics';
import type { StatReading } from '@/types/stats';
import { complianceFromPercent } from '@/utils/compliance';
import { filterScope, type TeamResult } from '@/utils/teamResults';

export type CoreStatScope = 'overall' | 'home' | 'away';

function levelPpg(v: number): ComplianceLevel {
  if (v >= 1.8) return 'green';
  if (v >= 1.2) return 'yellow';
  return 'red';
}

function levelScored(v: number): ComplianceLevel {
  if (v >= 1.5) return 'green';
  if (v >= 1.0) return 'yellow';
  return 'red';
}

function levelConceded(v: number): ComplianceLevel {
  if (v <= 1.0) return 'green';
  if (v <= 1.5) return 'yellow';
  return 'red';
}

function rate(results: TeamResult[], pred: (r: TeamResult) => boolean): number | null {
  if (results.length === 0) return null;
  return (results.filter(pred).length / results.length) * 100;
}

function fromStanding(row: StandingRow | null | undefined): {
  ppg: number | null;
  scored: number | null;
  conceded: number | null;
  sample: number;
} {
  if (!row || row.played <= 0) {
    return { ppg: null, scored: null, conceded: null, sample: 0 };
  }
  return {
    ppg: row.points / row.played,
    scored: row.goalsFor / row.played,
    conceded: row.goalsAgainst / row.played,
    sample: row.played,
  };
}

function fromResults(results: TeamResult[]): {
  ppg: number | null;
  scored: number | null;
  conceded: number | null;
  scoringPct: number | null;
  concedingPct: number | null;
  btts: number | null;
  cs: number | null;
  sample: number;
} {
  const n = results.length;
  if (n === 0) {
    return {
      ppg: null,
      scored: null,
      conceded: null,
      scoringPct: null,
      concedingPct: null,
      btts: null,
      cs: null,
      sample: 0,
    };
  }
  let pts = 0;
  let gf = 0;
  let ga = 0;
  for (const r of results) {
    pts += r.outcome === 'W' ? 3 : r.outcome === 'D' ? 1 : 0;
    gf += r.gf;
    ga += r.ga;
  }
  return {
    ppg: pts / n,
    scored: gf / n,
    conceded: ga / n,
    scoringPct: rate(results, (r) => r.gf >= 1),
    concedingPct: rate(results, (r) => r.ga >= 1),
    btts: rate(results, (r) => r.gf >= 1 && r.ga >= 1),
    cs: rate(results, (r) => r.ga === 0),
    sample: n,
  };
}

function row(
  key: string,
  label: string,
  home: number | null,
  away: number | null,
  unit: StatReading['unit'],
  homeLevel: ComplianceLevel,
  awayLevel: ComplianceLevel,
): StatReading | null {
  if (home == null && away == null) return null;
  return {
    key,
    label,
    home: home ?? Number.NaN,
    away: away ?? Number.NaN,
    homeLevel: home == null ? 'yellow' : homeLevel,
    awayLevel: away == null ? 'yellow' : awayLevel,
    unit,
  };
}

/**
 * Build the Section 1 core comparison set.
 * Prefer scoped finished results; fall back to season standings for PPG / averages.
 */
export function buildCoreFixtureStats(opts: {
  homeStanding: StandingRow | null | undefined;
  awayStanding: StandingRow | null | undefined;
  homeResults: TeamResult[];
  awayResults: TeamResult[];
  scope?: CoreStatScope;
}): { rows: StatReading[]; homeSample: number; awaySample: number; source: 'results' | 'standings' | 'mixed' } {
  const scope = opts.scope ?? 'overall';
  const homeR = filterScope(opts.homeResults, scope);
  const awayR = filterScope(opts.awayResults, scope);
  const hr = fromResults(homeR);
  const ar = fromResults(awayR);
  const hs = fromStanding(opts.homeStanding);
  const as = fromStanding(opts.awayStanding);

  // Overall + no results yet → use standings for the three averages.
  const useStandingAverages = scope === 'overall';
  const homePpg = hr.ppg ?? (useStandingAverages ? hs.ppg : null);
  const awayPpg = ar.ppg ?? (useStandingAverages ? as.ppg : null);
  const homeScored = hr.scored ?? (useStandingAverages ? hs.scored : null);
  const awayScored = ar.scored ?? (useStandingAverages ? as.scored : null);
  const homeConc = hr.conceded ?? (useStandingAverages ? hs.conceded : null);
  const awayConc = ar.conceded ?? (useStandingAverages ? as.conceded : null);

  const homeSample = hr.sample > 0 ? hr.sample : useStandingAverages ? hs.sample : 0;
  const awaySample = ar.sample > 0 ? ar.sample : useStandingAverages ? as.sample : 0;

  const usedResults = hr.sample > 0 || ar.sample > 0;
  const usedStandings =
    (homePpg != null && hr.ppg == null) ||
    (awayPpg != null && ar.ppg == null) ||
    (homeScored != null && hr.scored == null) ||
    (awayScored != null && ar.scored == null);
  const source: 'results' | 'standings' | 'mixed' =
    usedResults && usedStandings ? 'mixed' : usedResults ? 'results' : 'standings';

  const rows = [
    row(
      'ppg',
      'PPG',
      homePpg,
      awayPpg,
      'decimal',
      homePpg != null ? levelPpg(homePpg) : 'yellow',
      awayPpg != null ? levelPpg(awayPpg) : 'yellow',
    ),
    row(
      'scored',
      'Scored / match',
      homeScored,
      awayScored,
      'goals',
      homeScored != null ? levelScored(homeScored) : 'yellow',
      awayScored != null ? levelScored(awayScored) : 'yellow',
    ),
    row(
      'conceded',
      'Conceded / match',
      homeConc,
      awayConc,
      'goals',
      homeConc != null ? levelConceded(homeConc) : 'yellow',
      awayConc != null ? levelConceded(awayConc) : 'yellow',
    ),
    row(
      'scoring_pct',
      'Scoring %',
      hr.scoringPct,
      ar.scoringPct,
      'percent',
      hr.scoringPct != null ? complianceFromPercent(hr.scoringPct) : 'yellow',
      ar.scoringPct != null ? complianceFromPercent(ar.scoringPct) : 'yellow',
    ),
    row(
      'conceding_pct',
      'Conceding %',
      hr.concedingPct,
      ar.concedingPct,
      'percent',
      // Lower conceding % is stronger.
      hr.concedingPct != null ? complianceFromPercent(100 - hr.concedingPct) : 'yellow',
      ar.concedingPct != null ? complianceFromPercent(100 - ar.concedingPct) : 'yellow',
    ),
    row(
      'btts',
      'BTTS %',
      hr.btts,
      ar.btts,
      'percent',
      hr.btts != null ? complianceFromPercent(hr.btts) : 'yellow',
      ar.btts != null ? complianceFromPercent(ar.btts) : 'yellow',
    ),
    row(
      'cs',
      'Clean sheets %',
      hr.cs,
      ar.cs,
      'percent',
      hr.cs != null ? complianceFromPercent(hr.cs) : 'yellow',
      ar.cs != null ? complianceFromPercent(ar.cs) : 'yellow',
    ),
  ].filter((r): r is StatReading => r != null);

  return { rows, homeSample, awaySample, source };
}
