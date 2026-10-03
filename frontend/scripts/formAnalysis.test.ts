/**
 * Unit tests for Section 4 + 5.
 * Run: npx tsx scripts/formAnalysis.test.ts
 */
import { contestedLeagueTop, evaluateFixtureSeparators, gradeOneGoalResult } from '../utils/separatorTools';
import {
  analyseFixtureLast5,
  analyseTeamLast5,
  findUkulumbana,
  gradeResult,
  UKULUMBANA,
} from '../utils/last5Analysis';
import {
  analyseTeamLast6,
  last6FormFixtureRows,
  last6FormForSides,
  last6FormLeagueTable,
  last6FormStandings,
} from '../utils/last6Form';
import type { TeamResult } from '../utils/teamResults';
import { teamResultsFromFixtures } from '../utils/teamResults';
import { baselineGapFor, evaluatePositionGap } from '../utils/powerDynamicsEngine';
import type { StandingLike } from '../utils/motivationEngine';
import type { RawFixture } from '../services/oddAlerts';

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function res(over: Partial<TeamResult> & Pick<TeamResult, 'outcome' | 'isHome'>): TeamResult {
  return {
    fixtureId: over.fixtureId ?? Math.floor(Math.random() * 1e6),
    unix: over.unix ?? 1,
    teamId: over.teamId ?? 1,
    opponentId: over.opponentId ?? 2,
    opponentName: over.opponentName ?? 'Opp',
    isHome: over.isHome,
    gf: over.gf ?? (over.outcome === 'W' ? 2 : over.outcome === 'L' ? 0 : 1),
    ga: over.ga ?? (over.outcome === 'W' ? 0 : over.outcome === 'L' ? 2 : 1),
    outcome: over.outcome,
    opponentRank: over.opponentRank ?? null,
    teamRank: over.teamRank ?? 5,
    opponentAbove: over.opponentAbove ?? null,
    goalDiff: over.goalDiff ?? ((over.gf ?? 1) - (over.ga ?? 1)),
  };
}

console.log('\ngradeResult (Section 5)');
{
  check(
    'win away vs above = excellent',
    gradeResult(res({ outcome: 'W', isHome: false, opponentAbove: true })) === 'excellent',
  );
  check(
    'win home vs below = mediocre',
    gradeResult(res({ outcome: 'W', isHome: true, opponentAbove: false })) === 'mediocre',
  );
  check(
    'draw away vs above = good',
    gradeResult(res({ outcome: 'D', isHome: false, opponentAbove: true })) === 'good',
  );
  check(
    'loss home vs below = bad',
    gradeResult(res({ outcome: 'L', isHome: true, opponentAbove: false })) === 'bad',
  );
}

console.log('\nlast5 bands / ukulumbana');
{
  const hot: TeamResult[] = [
    res({ outcome: 'W', isHome: true, opponentAbove: true, unix: 5, fixtureId: 1 }),
    res({ outcome: 'W', isHome: false, opponentAbove: true, unix: 4, fixtureId: 2 }),
    res({ outcome: 'W', isHome: true, opponentAbove: false, unix: 3, fixtureId: 3 }),
    res({ outcome: 'W', isHome: true, opponentAbove: true, unix: 2, fixtureId: 4 }),
    res({ outcome: 'D', isHome: false, opponentAbove: true, unix: 1, fixtureId: 5 }),
  ];
  const t = analyseTeamLast5(1, hot);
  check('hot side is good band', t?.band === 'good', `band=${t?.band} pts=${t?.tablePoints}`);
  check('no inhlambuluko with 1 draw', t?.inhlambuluko === false);

  const drawy: TeamResult[] = [
    res({ outcome: 'D', isHome: true, unix: 5, fixtureId: 11 }),
    res({ outcome: 'D', isHome: false, unix: 4, fixtureId: 12 }),
    res({ outcome: 'D', isHome: true, unix: 3, fixtureId: 13 }),
    res({ outcome: 'L', isHome: true, opponentAbove: true, unix: 2, fixtureId: 14 }),
    res({ outcome: 'L', isHome: false, opponentAbove: false, unix: 1, fixtureId: 15 }),
  ];
  const d = analyseTeamLast5(1, drawy);
  check('3 draws → inhlambuluko', d?.inhlambuluko === true);
  check('drawy option includes inhla', d?.option.includes('inhla') === true);

  const cold: TeamResult[] = Array.from({ length: 5 }, (_, i) =>
    res({ outcome: 'L', isHome: i % 2 === 0, opponentAbove: true, unix: 10 - i, fixtureId: 20 + i }),
  );
  const fix = analyseFixtureLast5(1, 2, hot, cold);
  check('ukulumbana assigned', fix.ukulumbanaId != null && fix.ukulumbanaLabel != null, `${fix.ukulumbanaLabel}`);
  check('21 catalog entries', UKULUMBANA.length === 21);
  check('good vs bad is #1', findUkulumbana('good', 'bad')?.id === 1);
  check('lenses A–D present', fix.lenses.length === 4);
}

console.log('\nseparators (Section 4)');
{
  const table: StandingLike[] = [
    { rank: 1, teamId: 1, name: 'A', points: 40, played: 20, zone: 'top' },
    { rank: 2, teamId: 2, name: 'B', points: 39, played: 20, zone: 'top' },
    { rank: 3, teamId: 3, name: 'C', points: 38, played: 20, zone: 'top' },
    { rank: 4, teamId: 4, name: 'D', points: 37, played: 20, zone: 'top' },
    { rank: 5, teamId: 5, name: 'E', points: 37, played: 20, zone: 'mid' },
    { rank: 6, teamId: 6, name: 'F', points: 20, played: 20, zone: 'bottom' },
  ];
  const top = contestedLeagueTop(table);
  check('tight top 5 → contested', top.active === true);

  const winStreak = Array.from({ length: 6 }, (_, i) =>
    res({ outcome: 'W', isHome: true, unix: 100 - i, fixtureId: 30 + i, teamId: 1 }),
  );
  const sep = evaluateFixtureSeparators({
    table,
    homeId: 1,
    awayId: 6,
    homeResults: winStreak,
    awayResults: [],
    seasonProgress: 80,
  });
  check('won 6 flag active', sep.active.some((f) => f.id === 'won6_home'));
  check('ΔP present', sep.pointsDiff != null);
  check('imbangi inactive when far apart', sep.flags.some((f) => f.id === 'imbangi' && !f.active));

  const one = gradeOneGoalResult(
    res({ outcome: 'W', isHome: true, opponentAbove: true, gf: 2, ga: 1, goalDiff: 1 }),
  );
  check('1-goal win vs above = good', one === 'good');
}

console.log('\nleague-only results (no cups)');
{
  const fx = (over: Partial<RawFixture> & Pick<RawFixture, 'id' | 'home_id' | 'away_id'>): RawFixture =>
    ({
      home_name: 'A',
      away_name: 'B',
      competition_id: 423,
      competition_country: 'England',
      competition_name: 'Premier League',
      competition_type: 'League',
      competition_predictability: null,
      season: '2026/2027',
      season_id: 2263973,
      status: 'FT',
      home_goals: 1,
      away_goals: 0,
      ht_score: null,
      elapsed: null,
      elapsed_seconds: null,
      time_added: null,
      home_position: null,
      away_position: null,
      unix: 1,
      has_odds: false,
      is_friendly: false,
      is_cup: false,
      date: '2026-09-01',
      ko_human: '',
      ...over,
    }) as RawFixture;
  const list = [
    fx({ id: 1, home_id: 1, away_id: 2, unix: 30 }),
    fx({
      id: 2,
      home_id: 1,
      away_id: 9,
      unix: 20,
      competition_id: 99,
      competition_name: 'Carabao Cup',
      is_cup: true,
      home_goals: 4,
      away_goals: 0,
    }),
    fx({ id: 3, home_id: 2, away_id: 1, unix: 10, home_goals: 0, away_goals: 2 }),
    fx({
      id: 4,
      home_id: 1,
      away_id: 8,
      unix: 5,
      season: '2025/2026',
      season_id: 111,
      home_goals: 0,
      away_goals: 1,
    }),
  ];
  const leagueOnly = teamResultsFromFixtures(list, 1, null, { competitionId: 423 });
  check('cup fixture dropped from league PPG sample', leagueOnly.length === 3);
  check('league games only', leagueOnly.every((r) => r.competitionId === 423));
  const thisSeason = teamResultsFromFixtures(list, 1, null, { competitionId: 423, seasonId: 2263973 });
  check('last-season league game dropped', thisSeason.length === 2);
  check('this-season games only', thisSeason.every((r) => r.seasonId === 2263973));
}

console.log('\nlast 6 form');
{
  const sixW: TeamResult[] = Array.from({ length: 6 }, (_, i) =>
    res({ outcome: 'W', isHome: i % 2 === 0, unix: 10 - i, fixtureId: i + 1, opponentAbove: false }),
  );
  const hot = analyseTeamLast6(1, sixW);
  check('6 wins is strong', hot?.band === 'strong' && hot.points === 18);
  check('6 wins WDL is 6-0-0', hot?.won === 6 && hot.drawn === 0 && hot.lost === 0);

  const sixL: TeamResult[] = Array.from({ length: 6 }, (_, i) =>
    res({ outcome: 'L', isHome: true, unix: 10 - i, fixtureId: i + 1 }),
  );
  const cold = analyseTeamLast6(1, sixL);
  check('6 losses is poor', cold?.band === 'poor' && cold.points === 0);

  const mixed: TeamResult[] = [
    res({ outcome: 'W', isHome: true, unix: 6, fixtureId: 1 }),
    res({ outcome: 'D', isHome: false, unix: 5, fixtureId: 2 }),
    res({ outcome: 'W', isHome: true, unix: 4, fixtureId: 3 }),
    res({ outcome: 'L', isHome: false, unix: 3, fixtureId: 4 }),
    res({ outcome: 'D', isHome: true, unix: 2, fixtureId: 5 }),
    res({ outcome: 'L', isHome: false, unix: 1, fixtureId: 6 }),
  ];
  const mid = analyseTeamLast6(1, mixed);
  check('2W 2D 2L is mixed 8 pts', mid?.band === 'mixed' && mid.points === 8, `band=${mid?.band} pts=${mid?.points}`);

  const pickup: TeamResult[] = [
    res({ outcome: 'W', isHome: true, unix: 6, fixtureId: 1 }),
    res({ outcome: 'W', isHome: true, unix: 5, fixtureId: 2 }),
    res({ outcome: 'W', isHome: true, unix: 4, fixtureId: 3 }),
    res({ outcome: 'L', isHome: true, unix: 3, fixtureId: 4 }),
    res({ outcome: 'L', isHome: true, unix: 2, fixtureId: 5 }),
    res({ outcome: 'L', isHome: true, unix: 1, fixtureId: 6 }),
  ];
  check('WWW then LLL (newest first) is picking up', analyseTeamLast6(1, pickup)?.trend === 'picking_up');

  const drop: TeamResult[] = [
    res({ outcome: 'L', isHome: true, unix: 6, fixtureId: 1 }),
    res({ outcome: 'L', isHome: true, unix: 5, fixtureId: 2 }),
    res({ outcome: 'L', isHome: true, unix: 4, fixtureId: 3 }),
    res({ outcome: 'W', isHome: true, unix: 3, fixtureId: 4 }),
    res({ outcome: 'W', isHome: true, unix: 2, fixtureId: 5 }),
    res({ outcome: 'W', isHome: true, unix: 1, fixtureId: 6 }),
  ];
  check('LLL then WWW (newest first) is dropping', analyseTeamLast6(1, drop)?.trend === 'dropping');

  const pair = last6FormForSides({
    t1TeamId: 1,
    t2TeamId: 2,
    t1Results: sixW,
    t2Results: sixL,
    t1Label: 'T1',
    t2Label: 'T2',
  });
  check('T1 better last-6 form when 18 vs 0', pair.split && pair.call.includes('T1 is in better last-6 form'));
  check('empty results is no sample', analyseTeamLast6(1, []) == null);
  check('3 wins in 3 games still strong on PPG', analyseTeamLast6(1, sixW.slice(0, 3))?.band === 'strong');

  const standings: StandingLike[] = [
    { rank: 1, teamId: 1, name: 'Alpha', points: 20, played: 8, zone: 'top' },
    { rank: 2, teamId: 2, name: 'Bravo', points: 14, played: 8, zone: 'mid' },
    { rank: 3, teamId: 3, name: 'Charlie', points: 6, played: 8, zone: 'bottom' },
  ];
  const season = [
    { homeId: 1, awayId: 2, homeGoals: 2, awayGoals: 0, unix: 6 },
    { homeId: 3, awayId: 1, homeGoals: 0, awayGoals: 1, unix: 5 },
    { homeId: 2, awayId: 3, homeGoals: 1, awayGoals: 1, unix: 4 },
    { homeId: 1, awayId: 3, homeGoals: 3, awayGoals: 0, unix: 3 },
    { homeId: 2, awayId: 1, homeGoals: 0, awayGoals: 2, unix: 2 },
    { homeId: 3, awayId: 2, homeGoals: 2, awayGoals: 0, unix: 1 },
  ];
  const league = last6FormLeagueTable(standings, season);
  check('full table has every side', league.length === 3 && league[0]?.teamId === 1);
  check('Alpha last-6 is 4 wins', league[0]?.form?.won === 4 && league[0]?.form?.points === 12);
  const fixtureOnly = last6FormFixtureRows(league, [1, 2]);
  check('this fixture lists only those two sides', fixtureOnly.length === 2 && fixtureOnly[0]?.teamId === 1 && fixtureOnly[1]?.teamId === 2);
  check('Charlie is not on the fixture table', fixtureOnly.every((r) => r.teamId !== 3));
  check('Alpha is form #1 on last-6 points', league[0]?.formRank === 1);
  const formTable = last6FormStandings(league);
  check('form standings ranked by last-6', formTable[0]?.teamId === 1 && formTable[0]?.rank === 1);
  check(
    'Charlie outranks Bravo on last-6 points',
    formTable[1]?.teamId === 3 && formTable[2]?.teamId === 2,
    `order=${formTable.map((r) => r.teamId).join(',')}`,
  );

  const t1Form = league.find((r) => r.teamId === 1);
  const t2Form = league.find((r) => r.teamId === 2);
  const formGap = evaluatePositionGap({
    tableSize: league.length,
    t1Rank: t1Form?.formRank,
    t2Rank: t2Form?.formRank,
    t1Label: 'T1 (Alpha)',
    t2Label: 'T2 (Bravo)',
  });
  const formBaseline = baselineGapFor(
    {
      side: 't1',
      venue: 'home',
      teamId: 1,
      name: 'Alpha',
      label: 'T1 (Alpha)',
      rank: t1Form?.formRank ?? null,
      points: t1Form?.form?.points ?? null,
      played: t1Form?.form?.mp ?? null,
      goalDiff: t1Form?.form?.gd ?? null,
      goalsFor: t1Form?.form?.gf ?? null,
      zone: 'top',
      colour: 'green',
      overall: { mp: 0, won: 0, drawn: 0, lost: 0, points: 0, ppg: null, ppga: null, scored: null, conceded: null },
      home: { mp: 0, won: 0, drawn: 0, lost: 0, points: 0, ppg: null, ppga: null, scored: null, conceded: null },
      away: { mp: 0, won: 0, drawn: 0, lost: 0, points: 0, ppg: null, ppga: null, scored: null, conceded: null },
      vsAbove: { mp: 0, won: 0, drawn: 0, lost: 0, points: 0, ppg: null, ppga: null, scored: null, conceded: null },
      vsBelow: { mp: 0, won: 0, drawn: 0, lost: 0, points: 0, ppg: null, ppga: null, scored: null, conceded: null },
      vsTopThird: { mp: 0, won: 0, drawn: 0, lost: 0, points: 0, ppg: null, ppga: null, scored: null, conceded: null },
      vsBottomThird: { mp: 0, won: 0, drawn: 0, lost: 0, points: 0, ppg: null, ppga: null, scored: null, conceded: null },
    },
    {
      side: 't2',
      venue: 'away',
      teamId: 2,
      name: 'Bravo',
      label: 'T2 (Bravo)',
      rank: t2Form?.formRank ?? null,
      points: t2Form?.form?.points ?? null,
      played: t2Form?.form?.mp ?? null,
      goalDiff: t2Form?.form?.gd ?? null,
      goalsFor: t2Form?.form?.gf ?? null,
      zone: 'mid',
      colour: 'yellow',
      overall: { mp: 0, won: 0, drawn: 0, lost: 0, points: 0, ppg: null, ppga: null, scored: null, conceded: null },
      home: { mp: 0, won: 0, drawn: 0, lost: 0, points: 0, ppg: null, ppga: null, scored: null, conceded: null },
      away: { mp: 0, won: 0, drawn: 0, lost: 0, points: 0, ppg: null, ppga: null, scored: null, conceded: null },
      vsAbove: { mp: 0, won: 0, drawn: 0, lost: 0, points: 0, ppg: null, ppga: null, scored: null, conceded: null },
      vsBelow: { mp: 0, won: 0, drawn: 0, lost: 0, points: 0, ppg: null, ppga: null, scored: null, conceded: null },
      vsTopThird: { mp: 0, won: 0, drawn: 0, lost: 0, points: 0, ppg: null, ppga: null, scored: null, conceded: null },
      vsBottomThird: { mp: 0, won: 0, drawn: 0, lost: 0, points: 0, ppg: null, ppga: null, scored: null, conceded: null },
    },
    formTable,
    formGap,
  );
  check('form gap uses last-6 places', formGap.t1Rank === 1 && formGap.t2Rank === 3);
  check('form baseline assigns the type to the higher form side', formBaseline.stronger === 't1' && formBaseline.t1.letter != null);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
