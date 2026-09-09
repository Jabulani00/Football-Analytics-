/**
 * Unit tests for Section 1 core fixture stats.
 */
import { buildCoreFixtureStats } from '../utils/coreFixtureStats';
import type { StandingRow } from '../services/oddAlerts';
import type { TeamResult } from '../utils/teamResults';

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  ✓ ${name}`);
    passed += 1;
  } else {
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
    failed += 1;
  }
}

const emptyTiming = {
  firstGoalFor: null,
  firstGoalAgainst: null,
  scoredIn15: { count: 0, pct: 0 },
  concededIn15: { count: 0, pct: 0 },
  scoredAfter70: { count: 0, pct: 0 },
  concededAfter70: { count: 0, pct: 0 },
  coveragePct: 0,
};

function standing(partial: Partial<StandingRow> & { teamId: number; name: string }): StandingRow {
  return {
    rank: 1,
    played: 10,
    won: 5,
    drawn: 2,
    lost: 3,
    goalsFor: 15,
    goalsAgainst: 10,
    goalDiff: 5,
    points: 17,
    homePoints: 10,
    awayPoints: 7,
    zone: 'mid',
    timing: emptyTiming,
    ...partial,
  };
}

function result(partial: Partial<TeamResult> & { gf: number; ga: number; outcome: 'W' | 'D' | 'L' }): TeamResult {
  return {
    fixtureId: 1,
    unix: 1,
    teamId: 1,
    opponentId: 2,
    opponentName: 'Opp',
    isHome: true,
    opponentRank: 5,
    teamRank: 3,
    opponentAbove: true,
    goalDiff: partial.gf - partial.ga,
    ...partial,
  };
}

console.log('\nSection 1 — core fixture stats');
{
  const home = standing({ teamId: 1, name: 'Home', points: 20, played: 10, goalsFor: 18, goalsAgainst: 8 });
  const away = standing({ teamId: 2, name: 'Away', points: 12, played: 10, goalsFor: 10, goalsAgainst: 14 });
  const fromTable = buildCoreFixtureStats({
    homeStanding: home,
    awayStanding: away,
    homeResults: [],
    awayResults: [],
    scope: 'overall',
  });
  check('standings source', fromTable.source === 'standings');
  check('has PPG row', fromTable.rows.some((r) => r.key === 'ppg'));
  check('home PPG = 2.0', fromTable.rows.find((r) => r.key === 'ppg')?.home === 2);
  check('7 rows when rates missing still has averages', fromTable.rows.length >= 3);
  check('no BTTS without results', !fromTable.rows.some((r) => r.key === 'btts'));
}

{
  const homeResults: TeamResult[] = [
    result({ gf: 2, ga: 0, outcome: 'W', isHome: true }),
    result({ gf: 1, ga: 1, outcome: 'D', isHome: false }),
    result({ gf: 0, ga: 2, outcome: 'L', isHome: true }),
    result({ gf: 3, ga: 1, outcome: 'W', isHome: true }),
  ];
  const awayResults: TeamResult[] = [
    result({ teamId: 2, gf: 0, ga: 0, outcome: 'D', isHome: false }),
    result({ teamId: 2, gf: 1, ga: 2, outcome: 'L', isHome: true }),
  ];
  const built = buildCoreFixtureStats({
    homeStanding: null,
    awayStanding: null,
    homeResults,
    awayResults,
    scope: 'overall',
  });
  check('results source', built.source === 'results');
  check('all 7 rows', built.rows.length === 7, `got ${built.rows.length}`);
  const cs = built.rows.find((r) => r.key === 'cs');
  check('home CS 25%', cs != null && Math.round(cs.home) === 25, `cs=${cs?.home}`);
  const homeOnly = buildCoreFixtureStats({
    homeStanding: null,
    awayStanding: null,
    homeResults,
    awayResults,
    scope: 'home',
  });
  check('home scope uses home games only', homeOnly.homeSample === 3, `n=${homeOnly.homeSample}`);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
