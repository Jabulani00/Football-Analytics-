/**
 * Calls taken from the three power-dynamics calculations.
 * A tick is 100 when the read holds for this fixture, otherwise 0.
 */
import type { ImbangiScheduleMatch } from '@/utils/imbangiEngine';
import { buildInitialState } from '@/utils/last5Analysis';
import { resultsFromSeasonMatches } from '@/utils/last6Form';
import type { StandingLike } from '@/utils/motivationEngine';
import { evaluatePowerDynamics, indlelaPath, ppgSwing, streakSide } from '@/utils/powerDynamicsEngine';
import {
  buildPowerDynamicsCalculations,
  SECTOR_HIT,
  type MarginBandId,
  type PowerDynamicsCalculation,
} from '@/utils/powerDynamicsCalculations';
import type { CallSearchContext, CallTableRow } from '@/utils/powerDynamicCallSearch';
import { evaluateProblemCauser } from '@/utils/problemCauser';
import type { PowerDynamicCallDef } from '@/utils/powerDynamicCalls';

export type CalculationCallAspect = {
  id: string;
  tabId: 'calculations';
  functionId: string;
  label: string;
  detail: string;
  pair: true;
  needsFixtures: true;
  binary?: boolean;
  mark?: 'tick' | 'wrong';
};

const side = (who: 'T1' | 'T2', text: string) => `${who} ${text}`;

const CORE_SECTORS: [string, string][] = [
  ['baseline', 'Baseline'],
  ['importance_3pts', 'Importance of 3 points'],
  ['last5', 'Last 5'],
  ['form', 'Form'],
  ['h2h', 'H2H'],
  ['problem_causer', 'Problem causer'],
  ['imbangi', 'Imbangi'],
  ['home_away_strong', 'Home/Away strong'],
];

const Y_SECTORS: [string, string][] = [
  ['indlela', 'Indlela'],
  ['bhozoma', 'Bhozoma'],
  ['child_beater', 'Child beater'],
  ['sudden_drop', 'Sudden drop'],
  ['sudden_pickup', 'Sudden pick up'],
];

const TICK_ROWS: [string, string][] = [
  ['lost_6', 'Lost 6 in a row'],
  ['won_6', 'Won 6 in a row'],
  ['never_lost_twice', 'Never lost twice'],
  ['never_won_twice', 'Never won twice'],
  ['contested_league', 'Contested league'],
];

function read(id: string, functionId: string, label: string, detail: string): CalculationCallAspect {
  return { id, tabId: 'calculations', functionId, label, detail, pair: true, needsFixtures: true, binary: true };
}

function sectorReads(functionId: string, rows: [string, string][]): CalculationCallAspect[] {
  return rows.flatMap(([id, label]) => [
    read(`sector-${id}-t1`, functionId, `${label} · T1 highest`, `${label}. T1’s number is higher than T2.`),
    read(`sector-${id}-t2`, functionId, `${label} · T2 highest`, `${label}. T2’s number is higher than T1.`),
    read(`sector-${id}-t1-low`, functionId, `${label} · T1 lowest`, `${label}. T1’s number is lower than T2.`),
    read(`sector-${id}-t2-low`, functionId, `${label} · T2 lowest`, `${label}. T2’s number is lower than T1.`),
    read(`sector-${id}-level`, functionId, `${label} · level`, `${label}. Both numbers are equal.`),
    read(`sector-${id}-t1-hit`, functionId, `${label} · T1 at ${SECTOR_HIT}+`, `${label}. T1 is ${SECTOR_HIT} or more.`),
    read(`sector-${id}-t2-hit`, functionId, `${label} · T2 at ${SECTOR_HIT}+`, `${label}. T2 is ${SECTOR_HIT} or more.`),
  ]);
}

function totalExtremeReads(): CalculationCallAspect[] {
  const groups = [
    ['core', 'core sectors'],
    ['y', 'Y sectors'],
    ['combined', 'combined'],
  ] as const;
  return (['calc1', 'calc2', 'calc3'] as const).flatMap((functionId) =>
    groups.flatMap(([key, name]) =>
      (['t1', 't2'] as const).flatMap((sideId) => {
        const who = sideId === 't1' ? 'T1' : 'T2';
        return [
          read(
            `${functionId}-${key}-${sideId}-high`,
            functionId,
            `${who} ${name} total is highest`,
            `${who} has the higher ${name} total.`,
          ),
          read(
            `${functionId}-${key}-${sideId}-low`,
            functionId,
            `${who} ${name} total is lowest`,
            `${who} has the lower ${name} total.`,
          ),
        ];
      }),
    ),
  );
}

function tickReads(): CalculationCallAspect[] {
  return TICK_ROWS.flatMap(([id, label]) => [
    read(`tick-${id}-t1`, 'ticks', `${label} · T1`, `${label} is on for T1.`),
    read(`tick-${id}-t2`, 'ticks', `${label} · T2`, `${label} is on for T2.`),
  ]);
}

function withMarks(items: CalculationCallAspect[]): CalculationCallAspect[] {
  const out: CalculationCallAspect[] = [];
  for (const item of items) {
    if (!item.binary) {
      out.push(item);
      continue;
    }
    out.push({ ...item, id: `${item.id}::tick`, mark: 'tick' });
    out.push({ ...item, id: `${item.id}::wrong`, mark: 'wrong' });
  }
  return out;
}

const RAW_CALCULATION_ASPECTS: CalculationCallAspect[] = [
  {
    id: 'calc1-t1',
    tabId: 'calculations',
    functionId: 'calc1',
    label: side('T1', 'has more sectors of 6+'),
    detail: 'Calculation 1. T1 has more sectors at 6 or more than T2.',
    pair: true,
    needsFixtures: true,
  },
  {
    id: 'calc1-t2',
    tabId: 'calculations',
    functionId: 'calc1',
    label: side('T2', 'has more sectors of 6+'),
    detail: 'Calculation 1. T2 has more sectors at 6 or more than T1.',
    pair: true,
    needsFixtures: true,
  },
  {
    id: 'calc1-level',
    tabId: 'calculations',
    functionId: 'calc1',
    label: 'Same number of sectors of 6+',
    detail: 'Calculation 1. Both sides have the same number of sectors at 6 or more.',
    pair: true,
    needsFixtures: true,
  },
  {
    id: 'calc2-t1',
    tabId: 'calculations',
    functionId: 'calc2',
    label: side('T1', 'total is higher'),
    detail: 'Calculation 2. T1’s sector total is higher.',
    pair: true,
    needsFixtures: true,
  },
  {
    id: 'calc2-t2',
    tabId: 'calculations',
    functionId: 'calc2',
    label: side('T2', 'total is higher'),
    detail: 'Calculation 2. T2’s sector total is higher.',
    pair: true,
    needsFixtures: true,
  },
  {
    id: 'calc2-level',
    tabId: 'calculations',
    functionId: 'calc2',
    label: 'Totals are level',
    detail: 'Calculation 2. The two sector totals are equal.',
    pair: true,
    needsFixtures: true,
  },
  {
    id: 'calc3-t1',
    tabId: 'calculations',
    functionId: 'calc3',
    label: side('T1', 'won more sectors'),
    detail: 'Calculation 3. T1 won more sectors than T2.',
    pair: true,
    needsFixtures: true,
  },
  {
    id: 'calc3-t2',
    tabId: 'calculations',
    functionId: 'calc3',
    label: side('T2', 'won more sectors'),
    detail: 'Calculation 3. T2 won more sectors than T1.',
    pair: true,
    needsFixtures: true,
  },
  {
    id: 'calc3-level',
    tabId: 'calculations',
    functionId: 'calc3',
    label: 'Same number of sectors won',
    detail: 'Calculation 3. Both sides won the same number of sectors.',
    pair: true,
    needsFixtures: true,
  },
  ...(['high', 'mid', 'low'] as const).flatMap((band) => {
    const word = band === 'high' ? 'a clear separation' : band === 'mid' ? 'a mediocre separation' : 'a Y application';
    return (['t1', 't2'] as const).map((sideId) => ({
      id: `calc3-${sideId}-${band}`,
      tabId: 'calculations' as const,
      functionId: 'calc3' as const,
      label: `${sideId === 't1' ? 'T1' : 'T2'} won ${word}`,
      detail: `Calculation 3. ${sideId === 't1' ? 'T1' : 'T2'} won at least one sector as ${word}.`,
      pair: true as const,
      needsFixtures: true as const,
      binary: true as const,
    }));
  }),
  ...totalExtremeReads(),
  ...sectorReads('core', CORE_SECTORS),
  ...sectorReads('y', Y_SECTORS),
  ...tickReads(),
];

export const CALCULATION_ASPECTS: CalculationCallAspect[] = withMarks(
  RAW_CALCULATION_ASPECTS.map((item) => ({ ...item, binary: true })),
);

export const CALCULATION_CALL: PowerDynamicCallDef = {
  id: 'calculations',
  index: 'C',
  name: 'Power dynamic calculations',
  detail: 'Calculation 1, 2 and 3, core sectors, Y sectors, and ticks. A tick means the call holds. A cross means it does not.',
  functions: [
    { id: 'calc1', label: 'Calculation 1', detail: 'Sectors of 6 or more.' },
    { id: 'calc2', label: 'Calculation 2', detail: 'Core total, then the Y total, then the two added together. Clear separation is 3, mediocre is 1, poor is 0. A Y application is 0.5.' },
    { id: 'calc3', label: 'Calculation 3', detail: 'Sectors each side won, grouped as clear, mediocre, or a Y application.' },
    { id: 'core', label: 'Core sectors', detail: 'Baseline, importance of 3 points, last 5, form, H2H, problem causer, imbangi, and home/away strong.' },
    { id: 'y', label: 'Y sectors', detail: 'Indlela, Bhozoma, child beater, sudden drop, and sudden pick up. Each one is 0.5 when it is on.' },
    { id: 'ticks', label: 'Ticks', detail: 'Lost 6, won 6, never twice, and contested league.' },
  ],
};

export type CalculationScore = { percent: number; reason: string };

function hit(ok: boolean, reason: string): CalculationScore {
  return { percent: ok ? 100 : 0, reason };
}

function bandCount(calc: PowerDynamicsCalculation, side: 't1' | 't2', band: MarginBandId): number {
  return calc.calc3[side].bands[band].length;
}

/** 100 when the calculation call holds. A wrong mark is the opposite. */
export function scoreCalculationRead(id: string, calc: PowerDynamicsCalculation): CalculationScore | null {
  const mark = id.endsWith('::wrong') ? 'wrong' : id.endsWith('::tick') ? 'tick' : null;
  const base = id.replace(/::(tick|wrong)$/, '');
  const score = scoreCalculationBase(base, calc);
  if (!score || mark !== 'wrong') return score;
  return { percent: 100 - score.percent, reason: score.reason };
}

function shown(value: number): number {
  return Math.round(value * 10) / 10;
}

function scoreCalculationBase(id: string, calc: PowerDynamicsCalculation): CalculationScore | null {
  const c1t1 = calc.calc1.t1.length;
  const c1t2 = calc.calc1.t2.length;
  const c1 = `Sectors of 6+ · T1 ${c1t1} · T2 ${c1t2}`;
  if (id === 'calc1-t1') return hit(c1t1 > c1t2, c1);
  if (id === 'calc1-t2') return hit(c1t2 > c1t1, c1);
  if (id === 'calc1-level') return hit(c1t1 === c1t2, c1);

  const c2 = `Totals · T1 ${calc.calc2.t1} · T2 ${calc.calc2.t2}`;
  if (id === 'calc2-t1') return hit(calc.calc2.t1 > calc.calc2.t2, c2);
  if (id === 'calc2-t2') return hit(calc.calc2.t2 > calc.calc2.t1, c2);
  if (id === 'calc2-level') return hit(calc.calc2.t1 === calc.calc2.t2, c2);

  const c3t1 = calc.calc3.t1.count;
  const c3t2 = calc.calc3.t2.count;
  const c3 = `Sectors won · T1 ${c3t1} · T2 ${c3t2}`;
  if (id === 'calc3-t1') return hit(c3t1 > c3t2, c3);
  if (id === 'calc3-t2') return hit(c3t2 > c3t1, c3);
  if (id === 'calc3-level') return hit(c3t1 === c3t2, c3);

  const extreme = id.match(/^calc[123]-(core|y|combined)-(t1|t2)-(high|low)$/);
  if (extreme) {
    const key = extreme[1] as 'core' | 'y' | 'combined';
    const sideId = extreme[2] as 't1' | 't2';
    const totals =
      key === 'core' ? calc.calc2.core : key === 'y' ? calc.calc2.y : { t1: calc.calc2.t1, t2: calc.calc2.t2 };
    const mine = shown(totals?.[sideId] ?? 0);
    const other = shown(totals?.[sideId === 't1' ? 't2' : 't1'] ?? 0);
    const name = key === 'core' ? 'Core' : key === 'y' ? 'Y' : 'Combined';
    const line = `${name} total · T1 ${shown(totals?.t1 ?? 0)} · T2 ${shown(totals?.t2 ?? 0)}`;
    return hit(extreme[3] === 'high' ? mine > other : mine < other, line);
  }

  const band = id.match(/^calc3-(t1|t2)-(high|mid|low)$/);
  if (!band) return scoreSector(id, calc) ?? scoreTick(id, calc);
  const sideId = band[1] as 't1' | 't2';
  const bandId = band[2] as MarginBandId;
  const count = bandCount(calc, sideId, bandId);
  const word = bandId === 'high' ? '6 or more' : bandId === 'mid' ? '4 to 5.9' : 'less than 4';
  return hit(count > 0, `${sideId === 't1' ? 'T1' : 'T2'} won ${count} sector${count === 1 ? '' : 's'} by ${word}`);
}

function scoreSector(id: string, calc: PowerDynamicsCalculation): CalculationScore | null {
  const match = id.match(/^sector-(.+)-(t1-hit|t2-hit|t1-low|t2-low|t1|t2|level)$/);
  if (!match) return null;
  const row = calc.sectors.find((sector) => sector.id === match[1]);
  if (!row || row.t1 == null || row.t2 == null) return hit(false, 'No figure for this sector');
  const t1 = shown(row.t1);
  const t2 = shown(row.t2);
  const line = `${row.label} · T1 ${t1} · T2 ${t2}`;
  if (match[2] === 't1') return hit(t1 > t2, line);
  if (match[2] === 't1-low') return hit(t1 < t2, line);
  if (match[2] === 't2') return hit(t2 > t1, line);
  if (match[2] === 't2-low') return hit(t2 < t1, line);
  if (match[2] === 'level') return hit(t1 === t2, line);
  if (match[2] === 't1-hit') return hit(t1 >= SECTOR_HIT, line);
  return hit(t2 >= SECTOR_HIT, line);
}

function scoreTick(id: string, calc: PowerDynamicsCalculation): CalculationScore | null {
  const match = id.match(/^tick-(.+)-(t1|t2)$/);
  if (!match) return null;
  const row = calc.ticks.find((tick) => tick.id === match[1]);
  if (!row) return hit(false, 'Tick is not on this fixture');
  const on = match[2] === 't1' ? row.t1 : row.t2;
  return hit(on, row.detail);
}

function asTable(rows: StandingLike[]): CallTableRow[] {
  return rows.map((row) => ({
    rank: row.rank,
    teamId: row.teamId,
    name: row.name,
    played: row.played,
    points: row.points,
    homePoints: 0,
    awayPoints: 0,
    zone: row.zone ?? 'mid',
  }));
}

function calculationFor(
  home: CallTableRow,
  away: CallTableRow,
  table: CallTableRow[],
  context: CallSearchContext | undefined,
): PowerDynamicsCalculation | null {
  const standings = context?.standings?.length ? context.standings : asTable(table);
  const matches = (context?.matches ?? []).filter((match) => {
    const fixture = context?.fixture;
    if (!fixture) return true;
    return !(match.unix === fixture.unix && match.homeId === fixture.homeId && match.awayId === fixture.awayId);
  });
  if (standings.length < 2) return null;
  const homeResults = resultsFromSeasonMatches(home.teamId, matches, standings);
  const awayResults = resultsFromSeasonMatches(away.teamId, matches, standings);
  const pd = evaluatePowerDynamics({
    table: standings,
    homeId: home.teamId,
    awayId: away.teamId,
    homeName: home.name,
    awayName: away.name,
    homeResults,
    awayResults,
    competitionId: context?.competitionId,
  });
  const initial = buildInitialState({
    homeId: home.teamId,
    awayId: away.teamId,
    homeResults,
    awayResults,
  });
  const t1Results = pd.t1.venue === 'home' ? homeResults : awayResults;
  const t2Results = pd.t2.venue === 'home' ? homeResults : awayResults;
  const schedule: ImbangiScheduleMatch[] = context?.schedule ?? [];
  const kickoff = context?.fixture?.unix ?? null;
  return buildPowerDynamicsCalculations({
    pd,
    standings,
    matches,
    schedule,
    competitionId: context?.competitionId,
    h2hMatches: [],
    homeName: home.name,
    awayName: away.name,
    initial,
    indlela: {
      t1: indlelaPath({
        teamId: pd.t1.teamId,
        homeId: home.teamId,
        awayId: away.teamId,
        kickoffUnix: kickoff,
        schedule,
        table: standings,
      }),
      t2: indlelaPath({
        teamId: pd.t2.teamId,
        homeId: home.teamId,
        awayId: away.teamId,
        kickoffUnix: kickoff,
        schedule,
        table: standings,
      }),
    },
    problem: evaluateProblemCauser({ matches: [], t1Name: pd.t1.name, t2Name: pd.t2.name }),
    swing: { t1: ppgSwing(t1Results), t2: ppgSwing(t2Results) },
    loss: { t1: streakSide(t1Results, 'L'), t2: streakSide(t2Results, 'L') },
    win: { t1: streakSide(t1Results, 'W'), t2: streakSide(t2Results, 'W') },
  });
}

export function scoreCalculationFixture(
  aspectId: string,
  home: CallTableRow,
  away: CallTableRow,
  table: CallTableRow[],
  context?: CallSearchContext,
): CalculationScore | null {
  const kind = aspectId.replace(/::(tick|wrong)$/, '');
  if (!kind.startsWith('calc') && !kind.startsWith('sector-') && !kind.startsWith('tick-')) return null;
  const fixture = context?.fixture ?? { homeId: home.teamId, awayId: away.teamId, unix: 0 };
  const key = `calc:${fixture.homeId}:${fixture.awayId}:${fixture.unix}`;
  const cache = context?.cache;
  let calc = cache?.get(key) as PowerDynamicsCalculation | null | undefined;
  if (calc === undefined) {
    calc = calculationFor(home, away, table, context);
    cache?.set(key, calc);
  }
  if (!calc) return null;
  return scoreCalculationRead(aspectId, calc);
}
