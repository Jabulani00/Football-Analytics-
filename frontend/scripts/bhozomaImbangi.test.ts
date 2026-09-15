/**
 * Unit tests for Section 8 + 9.
 * Run: npx tsx scripts/bhozomaImbangi.test.ts
 */
import { buildBhozomaTable, BHOZOMA_MIN_MP, type SeasonMatch } from '../utils/bhozomaEngine';
import { buildImbangiTable, leagueProgressInfo } from '../utils/imbangiEngine';
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
    'low pts vs above → soft (not giant-killer)',
    charlie?.above.label === 'Soft vs higher sides',
    `label=${charlie?.above.label} pct=${charlie?.above.pctAttained}`,
  );
  check(
    'strong vs below',
    charlie?.below.label === 'Dominates lower sides',
    `label=${charlie?.below.label}`,
  );

  // Charlie takes points from Alpha (above) — should read as giant-killer.
  const punchUp = buildBhozomaTable(
    TABLE,
    [
      { homeId: 3, awayId: 1, homeGoals: 2, awayGoals: 0, unix: 1 },
      { homeId: 3, awayId: 2, homeGoals: 1, awayGoals: 1, unix: 2 },
      { homeId: 1, awayId: 3, homeGoals: 0, awayGoals: 1, unix: 3 },
    ],
    999999,
  );
  const cPunch = punchUp.rows.find((r) => r.teamId === 3);
  check(
    'high pts vs above → giant-killer',
    cPunch?.above.label === 'Giant-killer',
    `label=${cPunch?.above.label} pct=${cPunch?.above.pctAttained}`,
  );

  // ~67% vs below → good, not dominance.
  const midBelow = buildBhozomaTable(
    TABLE,
    [
      { homeId: 3, awayId: 5, homeGoals: 1, awayGoals: 0, unix: 1 },
      { homeId: 3, awayId: 6, homeGoals: 1, awayGoals: 0, unix: 2 },
      { homeId: 5, awayId: 3, homeGoals: 1, awayGoals: 0, unix: 3 },
    ],
    999999,
  );
  const cMid = midBelow.rows.find((r) => r.teamId === 3);
  check(
    '67% vs below → good against lower',
    cMid?.below.label === 'Good against lower sides' &&
      cMid.below.pctAttained != null &&
      Math.round(cMid.below.pctAttained) === 67,
    `label=${cMid?.below.label} pct=${cMid?.below.pctAttained}`,
  );

  const thin = buildBhozomaTable(TABLE, [
    { homeId: 3, awayId: 1, homeGoals: 0, awayGoals: 1, unix: 1 },
  ], null);
  const c2 = thin.rows.find((r) => r.teamId === 3);
  check(
    'MP < 3 → early soft read',
    c2?.above.dataDust === true && c2.above.label === 'Soft vs higher sides · early',
    `label=${c2?.above.label}`,
  );
}

console.log('\nSection 9 — Imbangi + progress');
{
  const matches = matchesForCharlie();
  const imb = buildImbangiTable(TABLE, matches, 80);
  check('imbangi rows > 0', imb.rows.length > 0);
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
