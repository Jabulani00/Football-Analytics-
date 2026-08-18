/**
 * Unit tests for the pure tier-table calculation (utils/tieredTables.ts).
 * Run: npx tsx scripts/tieredTables.test.ts
 *
 * No jest — a tiny inline assert harness, so it runs anywhere tsx does.
 */
import {
  buildTieredTables,
  type TierFixture,
  type TierStanding,
  type TierTeamRow,
} from '../utils/tieredTables';

let failures = 0;
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
function eq<T>(name: string, actual: T, expected: T): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  check(name, a === e, `expected ${e}, got ${a}`);
}
const ids = (rows: TierTeamRow[]) => rows.map((r) => r.teamId);

// Convenience: a standings row.
const s = (teamId: number, rank: number, zone: TierStanding['zone']): TierStanding => ({
  teamId,
  name: `T${teamId}`,
  rank,
  zone,
});
// Convenience: a fixture (defaults to competition 100, season 1).
const f = (
  homeId: number,
  awayId: number,
  homeGoals: number,
  awayGoals: number,
  extra: Partial<TierFixture> = {},
): TierFixture => ({
  competitionId: 100,
  seasonId: 1,
  homeId,
  awayId,
  homeGoals,
  awayGoals,
  ...extra,
});

// ---------------------------------------------------------------------------
console.log('Test A — scoping + Yellow/Red vs Green + reinterpretation');
// ---------------------------------------------------------------------------
{
  const standings: TierStanding[] = [
    s(1, 1, 'top'),
    s(2, 2, 'top'),
    s(3, 3, 'mid'),
    s(4, 4, 'mid'),
    s(5, 5, 'bottom'),
    s(6, 6, 'bottom'),
  ];
  const fixtures: TierFixture[] = [
    f(1, 2, 2, 1), // green-vs-green: T1 beats T2
    f(3, 1, 1, 1), // yellow T3 draws green T1
    f(4, 2, 0, 3), // yellow T4 loses to green T2
    f(5, 1, 0, 2), // red T5 loses to green T1
    f(6, 2, 2, 2), // red T6 draws green T2
    f(3, 4, 5, 0), // mid-vs-mid → ignored everywhere
    f(3, 5, 3, 0), // mid-vs-bottom → ignored everywhere
    f(1, 2, 0, 5, { competitionId: 999 }), // other competition → excluded
    f(1, 2, 0, 9, { seasonId: 2 }), // other season → excluded
  ];
  const t = buildTieredTables({ competitionId: 100, seasonId: 1, standings, fixtures });

  eq('green order = [T1, T2]', ids(t.green), [1, 2]);
  eq('T1 green played counts only the green-vs-green game', t.green[0].played, 1);
  eq('T1 green record: 3 pts, GD +1', [t.green[0].points, t.green[0].goalDiff], [3, 1]);
  eq('T2 green record: 0 pts', t.green[1].points, 0);

  eq('yellow order = [T3, T4]', ids(t.yellow), [3, 4]);
  eq('T3 vs-green: 1 pt (a draw)', t.yellow[0].points, 1);
  eq('T4 vs-green: 0 pts', t.yellow[1].points, 0);

  // Red demonstrates reinterpretation: T6 (rank 6) outranks T5 (rank 5) here.
  eq('red order = [T6, T5] (by vs-green points, not overall rank)', ids(t.red), [6, 5]);
  eq('red[0] is overall rank 6', t.red[0].overallRank, 6);
  eq('T6 vs-green: 1 pt', t.red[0].points, 1);
  eq('T5 vs-green: 0 pts', t.red[1].points, 0);
}

// ---------------------------------------------------------------------------
console.log('Test B — Green head-to-head tiebreak beats goal difference');
// ---------------------------------------------------------------------------
{
  // Four green teams. G1 and G2 finish level on points (6 each), but G2 has a
  // much better goal difference. Head-to-head (G1 beat G2) must still rank G1
  // first — proving H2H is applied *before* GD.
  const standings: TierStanding[] = [
    s(11, 1, 'top'),
    s(12, 2, 'top'),
    s(13, 3, 'top'),
    s(14, 4, 'top'),
  ];
  const fixtures: TierFixture[] = [
    f(11, 12, 1, 0), // G1 beats G2 (the decisive head-to-head)
    f(11, 13, 1, 0), // G1 beats G3
    f(14, 11, 1, 0), // G1 loses to G4
    f(12, 13, 1, 0), // G2 beats G3
    f(12, 14, 5, 0), // G2 thrashes G4 → G2's GD is far better than G1's
  ];
  // Points: G1 = 3+3+0 = 6 ; G2 = 0(to G1)+3+3 = 6 (tie)
  //   G1 GD = (1-0)+(1-0)+(0-1) = +1 ; G2 GD = (0-1)+(1-0)+(5-0) = +5
  const t = buildTieredTables({ competitionId: 100, seasonId: 1, standings, fixtures });

  eq('G1 and G2 are level on points', [t.green[0].points, t.green[1].points], [6, 6]);
  check(
    'G2 has the better goal difference',
    t.green.find((r) => r.teamId === 12)!.goalDiff >
      t.green.find((r) => r.teamId === 11)!.goalDiff,
  );
  eq('green order = [G1, G2, G4, G3] — H2H puts G1 above G2', ids(t.green), [11, 12, 14, 13]);
}

// ---------------------------------------------------------------------------
console.log('Test C — empty state: every team keeps its slot with a zero record');
// ---------------------------------------------------------------------------
{
  const standings: TierStanding[] = [
    s(1, 1, 'top'),
    s(2, 2, 'top'),
    s(3, 3, 'mid'),
    s(4, 4, 'bottom'),
  ];
  const t = buildTieredTables({ competitionId: 100, seasonId: 1, standings, fixtures: [] });
  eq('green keeps both teams', ids(t.green), [1, 2]);
  eq('yellow keeps its team', ids(t.yellow), [3]);
  eq('red keeps its team', ids(t.red), [4]);
  eq('all records are zero', [t.green[0].played, t.green[0].points], [0, 0]);
}

// ---------------------------------------------------------------------------
console.log('Test D — a team missing from standings (unknown zone) is ignored');
// ---------------------------------------------------------------------------
{
  const standings: TierStanding[] = [s(1, 1, 'top'), s(2, 2, 'top')];
  const fixtures: TierFixture[] = [
    f(1, 2, 3, 0), // green-vs-green counts
    f(1, 99, 4, 0), // opponent 99 not in standings → ignored
  ];
  const t = buildTieredTables({ competitionId: 100, seasonId: 1, standings, fixtures });
  eq('T1 counts only the known-opponent game', t.green.find((r) => r.teamId === 1)!.played, 1);
  eq('T1 green points = 3', t.green.find((r) => r.teamId === 1)!.points, 3);
}

// ---------------------------------------------------------------------------
if (failures > 0) {
  console.error(`\n${failures} check(s) FAILED`);
  process.exit(1);
} else {
  console.log('\nAll checks passed ✅');
  process.exit(0);
}
