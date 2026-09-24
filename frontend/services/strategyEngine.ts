import type { MarketRow } from '@/services/hollywoodFusion';
import type { RawFixture, RawFixtureDetail, StandingRow } from '@/services/oddAlerts';
import type { BetSlipLeg, ComplianceLevel } from '@/types/analytics';
import { buildBhozomaTable, type SeasonMatch } from '@/utils/bhozomaEngine';
import { evaluatePowerDynamics } from '@/utils/powerDynamicsEngine';
import { normalizeTeam } from '@/services/hollywoodMatch';
import { ranksFromStandings, teamResultsFromFixtures } from '@/utils/teamResults';

export type StrategyEvidenceKey =
  | 'form'
  | 'colour'
  | 'h2h'
  | 'motivation'
  | 'bhozoma'
  | 'separator'
  | 'value';

export type StrategyEvidence = {
  status: 'pass' | 'fail' | 'missing';
  note: string;
};

export type StrategyDefinition = {
  id: string;
  name: string;
  required: StrategyEvidenceKey[];
  minimumCompliance: number;
  minimumOdds?: number;
  minimumEdgePct?: number;
};

export type StrategyFixtureContext = {
  detail: RawFixtureDetail;
  standings: StandingRow[];
  recentFixtures: RawFixture[];
};

export type StrategyCandidate = {
  id: string;
  fixture: string;
  kickoff: string;
  market: string;
  selection: string;
  odds: number;
  evidence: Partial<Record<StrategyEvidenceKey, StrategyEvidence>>;
  betSlipLeg?: BetSlipLeg;
};

export type StrategyCall = {
  id: string;
  definitionId: string;
  strategy: string;
  fixture: string;
  kickoff: string;
  market: string;
  selection: string;
  odds: number;
  compliance: number;
  level: ComplianceLevel;
  status: 'qualified' | 'rejected' | 'blocked';
  motives: string[];
  blockers: string[];
  betSlipLeg?: BetSlipLeg;
};

/**
 * First production definition: all decision layers named in the PDF must be
 * present. Missing inputs block a call instead of being silently treated as a
 * pass. More definitions can be added without changing the evaluator.
 */
export const CORE_VALUE_STRATEGY: StrategyDefinition = {
  id: 'core-value-seven-layers',
  name: 'Seven-layer value confirmation',
  required: ['form', 'colour', 'h2h', 'motivation', 'bhozoma', 'separator', 'value'],
  minimumCompliance: 70,
  minimumOdds: 1.2,
  minimumEdgePct: 0,
};

function sampleEvidence(status: StrategyEvidence['status'], note: string): StrategyEvidence {
  return { status, note };
}

function fixtureSide(row: MarketRow): 'home' | 'away' | 'draw' | null {
  if (row.betTypeId !== 15) return null;
  const selection = row.selection.toLowerCase();
  if (selection === 'home') return 'home';
  if (selection === 'away') return 'away';
  if (selection === 'draw') return 'draw';
  return null;
}

function recentPoints(results: ReturnType<typeof teamResultsFromFixtures>, take = 5): number {
  return results.slice(0, take).reduce((total, result) => total + (result.outcome === 'W' ? 3 : result.outcome === 'D' ? 1 : 0), 0);
}

function selectionHitRate(row: MarketRow, fixtures: RawFixture[]): { hits: number; total: number } | null {
  const finished = fixtures.filter(
    (fixture) => fixture.home_goals != null && fixture.away_goals != null,
  );
  if (finished.length === 0) return null;
  const selection = row.selection.toLowerCase();
  let test: ((home: number, away: number) => boolean) | null = null;
  if (row.marketName.toLowerCase().includes('both teams')) {
    const yes = selection === 'yes';
    test = (home, away) => (home > 0 && away > 0) === yes;
  } else {
    const total = /(?:over|under)\s+(\d+(?:\.\d+)?)/i.exec(row.selection);
    if (total) {
      const line = Number(total[1]);
      const over = selection.startsWith('over');
      test = (home, away) => (home + away > line) === over;
    }
  }
  if (!test) return null;
  return {
    hits: finished.filter((fixture) => test!(fixture.home_goals as number, fixture.away_goals as number)).length,
    total: finished.length,
  };
}

function h2hSideResult(
  match: NonNullable<RawFixtureDetail['h2h']>[number],
  fixtureHome: string,
): 'home_win' | 'away_win' | 'draw' | null {
  if (match.home_goals == null || match.away_goals == null) return null;
  const fixtureHomeKey = normalizeTeam(fixtureHome);
  const matchHomeIsFixtureHome = normalizeTeam(match.home_name) === fixtureHomeKey;
  const fixtureHomeGoals = matchHomeIsFixtureHome ? match.home_goals : match.away_goals;
  const fixtureAwayGoals = matchHomeIsFixtureHome ? match.away_goals : match.home_goals;
  if (fixtureHomeGoals === fixtureAwayGoals) return 'draw';
  return fixtureHomeGoals > fixtureAwayGoals ? 'home_win' : 'away_win';
}

/** Translate real standings/results/H2H into the PDF's named evidence layers. */
export function strategyEvidenceFromContext(
  row: MarketRow,
  context: StrategyFixtureContext,
): Partial<Record<StrategyEvidenceKey, StrategyEvidence>> {
  const { detail, standings, recentFixtures } = context;
  const ranks = ranksFromStandings(standings);
  const homeResults = detail.home_id != null ? teamResultsFromFixtures(recentFixtures, detail.home_id, ranks) : [];
  const awayResults = detail.away_id != null ? teamResultsFromFixtures(recentFixtures, detail.away_id, ranks) : [];
  const side = fixtureSide(row);
  const evidence: Partial<Record<StrategyEvidenceKey, StrategyEvidence>> = {};

  if (homeResults.length >= 3 && awayResults.length >= 3) {
    if (side) {
      const homePts = recentPoints(homeResults);
      const awayPts = recentPoints(awayResults);
      const aligned = side === 'home' ? homePts > awayPts : side === 'away' ? awayPts > homePts : Math.abs(homePts - awayPts) <= 2;
      evidence.form = sampleEvidence(aligned ? 'pass' : 'fail', `Last-five form: ${detail.home_name} ${homePts} pts, ${detail.away_name} ${awayPts} pts`);
    } else {
      const rate = selectionHitRate(row, recentFixtures);
      evidence.form = rate
        ? sampleEvidence(rate.hits / rate.total >= 0.6 ? 'pass' : 'fail', `${row.selection} landed in ${rate.hits}/${rate.total} recent team matches`)
        : sampleEvidence('missing', 'This market has no supported recent-form rule');
    }
  } else {
    evidence.form = sampleEvidence('missing', 'At least three finished matches per team are required for form');
  }

  const homeStanding = detail.home_id != null ? standings.find((item) => item.teamId === detail.home_id) : null;
  const awayStanding = detail.away_id != null ? standings.find((item) => item.teamId === detail.away_id) : null;
  if (!homeStanding || !awayStanding) {
    evidence.colour = sampleEvidence('missing', 'Both teams need a live green/yellow/red table position');
  } else if (!side) {
    evidence.colour = sampleEvidence('missing', 'Colour direction is only used by 1X2 side strategies');
  } else {
    const aligned = side === 'home'
      ? homeStanding.rank < awayStanding.rank
      : side === 'away'
        ? awayStanding.rank < homeStanding.rank
        : Math.abs(homeStanding.rank - awayStanding.rank) <= 2;
    evidence.colour = sampleEvidence(
      aligned ? 'pass' : 'fail',
      `${detail.home_name} ${homeStanding.zone} #${homeStanding.rank} vs ${detail.away_name} ${awayStanding.zone} #${awayStanding.rank}`,
    );
  }

  const h2h = detail.h2h ?? [];
  if (h2h.length < 3) {
    evidence.h2h = sampleEvidence('missing', `Only ${h2h.length} H2H meeting${h2h.length === 1 ? '' : 's'} available; need 3`);
  } else if (side) {
    const expected = side === 'home' ? 'home_win' : side === 'away' ? 'away_win' : 'draw';
    const hits = h2h.map((match) => h2hSideResult(match, detail.home_name)).filter((result) => result === expected).length;
    const threshold = side === 'draw' ? 0.3 : 0.5;
    evidence.h2h = sampleEvidence(hits / h2h.length >= threshold ? 'pass' : 'fail', `${row.selection} landed in ${hits}/${h2h.length} H2H meetings`);
  } else {
    const h2hFixtures: RawFixture[] = h2h.map((match) => ({
      ...detail,
      id: match.id,
      home_name: match.home_name,
      away_name: match.away_name,
      home_goals: match.home_goals,
      away_goals: match.away_goals,
    }));
    const rate = selectionHitRate(row, h2hFixtures);
    evidence.h2h = rate
      ? sampleEvidence(rate.hits / rate.total >= 0.6 ? 'pass' : 'fail', `${row.selection} landed in ${rate.hits}/${rate.total} H2H meetings`)
      : sampleEvidence('missing', 'This market has no supported H2H rule');
  }

  if (standings.length === 0 || detail.home_id == null || detail.away_id == null) {
    evidence.motivation = sampleEvidence('missing', 'Standings and team ids are required for three-point motivation');
    evidence.bhozoma = sampleEvidence('missing', 'Standings and result history are required for Bhozoma');
    evidence.separator = sampleEvidence('missing', 'A complete table is required for separator evidence');
    return evidence;
  }

  const dynamics = evaluatePowerDynamics({
    table: standings,
    homeId: detail.home_id,
    awayId: detail.away_id,
    homeName: detail.home_name,
    awayName: detail.away_name,
    homeResults,
    awayResults,
    seasonProgress: detail.season_progress,
    competitionId: detail.competition_id,
    h2hMatches: h2h,
    odds: detail.odds,
  });
  const sideId = side === 'home'
    ? (dynamics.t1.venue === 'home' ? 't1' : 't2')
    : side === 'away'
      ? (dynamics.t1.venue === 'away' ? 't1' : 't2')
      : null;
  const motivations = sideId
    ? [dynamics.competition[sideId]]
    : [dynamics.competition.t1, dynamics.competition.t2];
  const motivated = motivations.filter((item) => item?.grade !== 'none');
  evidence.motivation = sampleEvidence(
    motivated.length > 0 ? 'pass' : 'fail',
    motivated.length > 0
      ? motivated.map((item) => `${item?.name}: ${item?.stanceReason}`).join(' · ')
      : 'No A/B three-point motivation signal for the selected side(s)',
  );

  if (!sideId) {
    evidence.bhozoma = sampleEvidence('missing', 'Bhozoma direction is only used by side strategies');
    evidence.separator = sampleEvidence('missing', 'Separator direction is only used by side strategies');
  } else {
    const seasonMatches: SeasonMatch[] = recentFixtures.flatMap((fixture) =>
      fixture.home_id != null && fixture.away_id != null && fixture.home_goals != null && fixture.away_goals != null
        ? [{ homeId: fixture.home_id, awayId: fixture.away_id, homeGoals: fixture.home_goals, awayGoals: fixture.away_goals, unix: fixture.unix }]
        : [],
    );
    const selectedId = side === 'home' ? detail.home_id : detail.away_id;
    const opponent = side === 'home' ? awayStanding : homeStanding;
    const selected = side === 'home' ? homeStanding : awayStanding;
    const bho = buildBhozomaTable(standings, seasonMatches, detail.competition_id).rows.find((item) => item.teamId === selectedId);
    const bhoSide = selected && opponent && selected.rank < opponent.rank ? bho?.below : bho?.above;
    evidence.bhozoma = !bhoSide || bhoSide.dataDust || bhoSide.pctAttained == null
      ? sampleEvidence('missing', 'Bhozoma needs at least three relevant finished matches')
      : sampleEvidence(
          bhoSide.pctAttained >= (selected && opponent && selected.rank < opponent.rank ? 60 : 30) ? 'pass' : 'fail',
          `${bhoSide.label} · ${bhoSide.pctAttained.toFixed(0)}% points attained (${bhoSide.mp} matches)`,
        );

    const separatorPass = dynamics.baselineGap.supports && dynamics.baselineGap.stronger === sideId;
    evidence.separator = dynamics.baselineGap.separation == null
      ? sampleEvidence('missing', 'Separator gap could not be calculated')
      : sampleEvidence(separatorPass ? 'pass' : 'fail', dynamics.baselineGap.call);
  }

  return evidence;
}

export function evaluateStrategy(
  definition: StrategyDefinition,
  candidate: StrategyCandidate,
): StrategyCall {
  let passed = 0;
  const motives: string[] = [];
  const blockers: string[] = [];

  for (const key of definition.required) {
    const item = candidate.evidence[key];
    if (!item || item.status === 'missing') {
      blockers.push(item?.note ?? `${key} evidence is not available`);
    } else if (item.status === 'pass') {
      passed += 1;
      motives.push(item.note);
    } else {
      motives.push(item.note);
    }
  }

  const compliance = Math.round((passed / definition.required.length) * 100);
  const status: StrategyCall['status'] =
    blockers.length > 0
      ? 'blocked'
      : compliance >= definition.minimumCompliance
        ? 'qualified'
        : 'rejected';
  const level: ComplianceLevel = compliance >= 70 ? 'green' : compliance >= 40 ? 'yellow' : 'red';

  return {
    id: `${definition.id}-${candidate.id}`,
    definitionId: definition.id,
    strategy: definition.name,
    fixture: candidate.fixture,
    kickoff: candidate.kickoff,
    market: candidate.market,
    selection: candidate.selection,
    odds: candidate.odds,
    compliance,
    level,
    status,
    motives,
    blockers,
    betSlipLeg: candidate.betSlipLeg,
  };
}

/**
 * Convert live odds fusion into strategy calls. Context comes from the same
 * matched OddAlerts fixture as the model; if a join fails the named layer stays
 * visibly missing rather than being manufactured from sample data.
 */
export function strategyCallsFromMarketRows(
  rows: MarketRow[],
  contextByEvent: ReadonlyMap<number, StrategyFixtureContext> = new Map(),
  definitions: StrategyDefinition[] = [CORE_VALUE_STRATEGY],
): StrategyCall[] {
  const bestByFixture = new Map<string, MarketRow>();
  for (const row of rows) {
    if (!row.value || !row.hasModel) continue;
    const existing = bestByFixture.get(row.fixture);
    if (!existing || (row.edgePct ?? -Infinity) > (existing.edgePct ?? -Infinity)) {
      bestByFixture.set(row.fixture, row);
    }
  }

  return [...bestByFixture.values()]
    .flatMap((row) => {
      const value = row.value;
      if (!value) return [];
      const context = contextByEvent.get(row.eventId);
      const realEvidence = context ? strategyEvidenceFromContext(row, context) : {};

      return definitions.map((definition) => {
        const oddsPass = row.decimal >= (definition.minimumOdds ?? 1);
        const edgePass = (row.edgePct ?? -Infinity) >= (definition.minimumEdgePct ?? 0);
        const valuePass = value.hasValue && oddsPass && edgePass;
        return evaluateStrategy(definition, {
          id: `${row.eventId}-${row.betTypeId}-${row.marketNumber}`,
          fixture: row.fixture,
          kickoff: row.kickoff,
          market: row.marketName,
          selection: row.selection,
          odds: row.decimal,
          evidence: {
            form: realEvidence.form ?? { status: 'missing', note: 'Real Overall/Home/Away form is not available for this fixture' },
            colour: realEvidence.colour ?? { status: 'missing', note: 'Green/Yellow/Red table position is not available' },
            h2h: realEvidence.h2h ?? { status: 'missing', note: 'H2H evidence is not available' },
            motivation: realEvidence.motivation ?? { status: 'missing', note: 'Three-point motivation is not available' },
            bhozoma: realEvidence.bhozoma ?? { status: 'missing', note: 'Bhozoma evidence is not available' },
            separator: realEvidence.separator ?? { status: 'missing', note: 'Separator evidence is not available' },
            value: {
              status: valuePass ? 'pass' : 'fail',
              note: valuePass
                ? `PDF value check passed (${value.machineBookGap >= 0 ? '+' : ''}${(value.machineBookGap * 100).toFixed(1)}pp)`
                : `Value gate failed${!oddsPass ? ` · odds below ${(definition.minimumOdds ?? 1).toFixed(2)}` : ''}${!edgePass ? ` · edge below ${(definition.minimumEdgePct ?? 0).toFixed(1)}%` : ''}`,
            },
          },
          betSlipLeg: row.hbLeg
            ? {
                id: `strategy-${row.eventId}-${row.betTypeId}-${row.marketNumber}`,
                fixture: row.fixture,
                market: row.marketName,
                selection: row.selection,
                odds: row.decimal,
                bookmaker: 'Hollywoodbets',
                kickoff: row.kickoff,
                hbLeg: row.hbLeg,
              }
            : undefined,
        });
      });
    })
    .sort((a, b) => b.compliance - a.compliance || a.kickoff.localeCompare(b.kickoff));
}
