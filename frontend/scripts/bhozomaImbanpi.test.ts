/**
 * Unit tests for Section 8 + 9.
 * Run: npx tsx scripts/bhozomaImbanpi.test.ts
 */
import { buildBhozomaTable, BHOZOMA_MIN_MP, type SeasonMatch } from '../utils/bhozomaEngine';
import { buildImbanpiTable, leagueProgressInfo } from '../utils/imbanpiEngine';
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

function team(
  rank: number,
  teamId: number,
  name: string,
  points: number,
  played = 20,
  zone: 'top' | 'mid' | 'bottom' = 'mid',
): StandingLike {
  return { rank, teamId, name, points, played, zone };
}

const TABLE: StandingLike[] = [
  team(1, 1, 'Alpha', 40, 20, 'top'),
  team(2, 2, 'Bravo', 35, 20, 'top'),
  team(3, 3, 'Charlie', 30, 20, 'mid'),
  team(4, 4, 'Delta', 28, 20, 'mid'),
  team(5, 5, 'Echo', 22, 20, 'bottom'),
  team(6, 6, 'Foxtrot', 15, 20, 'bottom'),
];

/** Charlie (3) plays Alpha/Bravo (above) three times — all losses → low % → Goliath. */
function matchesForCharlie(): SeasonMatch[] {
  const out: SeasonMatch[] = [];
  let u = 1000;
  for (const opp of [1, 2, 1]) {
    out.push({ homeId: 3, awayId: opp, homeGoals: 0, awayGoals: 2, unix: u++ });
  }
  // vs below (Echo, Foxtrot) — wins
  for (const opp of [5, 6, 5]) {
    out.push({ homeId: 3, awayId: opp, homeGoals: 2, awayGoals: 0, unix: u++ });
  }
  return out;
}

console.log('\nSection 8 — Bhozoma');
{
  const matches = matchesForCharlie();
  const table = buildBhozomaTable(TABLE, matches, 999999);
  check('mid rows exist', table.midRows.length > 0);
  const charlie = table.rows.find((r) => r.teamId === 3);
  check('Charlie found', charlie != null);
  check('Charlie is mid', charlie?.isMidTable === true);
  check(
    'above MP >= min',
    (charlie?.above.mp ?? 0) >= BHOZOMA_MIN_MP,
    `mp=${charlie?.above.mp}`,
  );
  check('above not data dust', charlie?.above.dataDust === false);
  check(
    'low pts vs above → Goliath hero',
    charlie?.above.label === 'Goliath hero',
    `label=${charlie?.above.label} pct=${charlie?.above.pctAttained}`,
  );
  check(
    'strong vs below',
    charlie?.below.label === 'Dominates below',
    `label=${charlie?.below.label}`,
  );

  const thin = buildBhozomaTable(TABLE, [
    { homeId: 3, awayId: 1, homeGoals: 0, awayGoals: 1, unix: 1 },
  ], null);
  const c2 = thin.rows.find((r) => r.teamId === 3);
  check('MP < 3 → DATA DUST', c2?.above.dataDust === true && c2.above.label === 'DATA DUST');
}

console.log('\nSection 9 — Imbanpi + progress');
{
  const matches = matchesForCharlie();
  const imb = buildImbanpiTable(TABLE, matches, 80);
  check('imbanpi rows > 0', imb.rows.length > 0);
  check('closest sorted by ΔP', imb.closest[0].pointsDiff <= imb.closest[1].pointsDiff);
  const pair = imb.rows.find((r) => r.teamId === 3 && r.opponentId === 4);
  check('Charlie vs Delta neighbour', pair != null && pair.pointsDiff === 2);
  check('late stretch at 80%', imb.progress.lateStretch === true);

  const early = leagueProgressInfo(TABLE, 40);
  check('early not late stretch', early.lateStretch === false);

  const withScore = imb.rows.find((r) => r.teamId === 3 && r.opponentId === 2);
  check('last meeting score filled when played', withScore?.lastScore != null, `${withScore?.lastScore}`);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
