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
import type { TeamResult } from '../utils/teamResults';
import type { StandingLike } from '../utils/motivationEngine';

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

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
