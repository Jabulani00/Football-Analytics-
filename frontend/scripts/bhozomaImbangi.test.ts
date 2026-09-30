/**
 * Unit tests for Section 8 + 9.
 * Run: npx tsx scripts/bhozomaImbangi.test.ts
 */
import {
  bhozomaFixtureRows,
  buildBhozomaTable,
  formatBhozomaSpan,
  BHOZOMA_MIN_MP,
  type SeasonMatch,
} from '../utils/bhozomaEngine';
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
    'low pts vs above → Goliath hero',
    charlie?.above.label === 'Goliath hero',
    `label=${charlie?.above.label} pct=${charlie?.above.pctAttained}`,
  );
  check(
    'strong vs below → Umnqumi wehlathi',
    charlie?.below.label === 'Umnqumi wehlathi',
    `label=${charlie?.below.label}`,
  );

  // Charlie takes points from sides above — % ≥ 30 → Bhozoma.
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
    '≥30% vs above → Bhozoma',
    cPunch?.above.label === 'Bhozoma',
    `label=${cPunch?.above.label} pct=${cPunch?.above.pctAttained}`,
  );

  // ~67% vs below → Umnqumi wehlathi.
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
    '>50% vs below → Umnqumi wehlathi',
    cMid?.below.label === 'Umnqumi wehlathi' &&
      cMid.below.pctAttained != null &&
      Math.round(cMid.below.pctAttained) === 67,
    `label=${cMid?.below.label} pct=${cMid?.below.pctAttained}`,
  );

  const leakBelow = buildBhozomaTable(
    TABLE,
    [
      { homeId: 3, awayId: 5, homeGoals: 0, awayGoals: 1, unix: 1 },
      { homeId: 3, awayId: 6, homeGoals: 0, awayGoals: 1, unix: 2 },
      { homeId: 5, awayId: 3, homeGoals: 0, awayGoals: 1, unix: 3 },
    ],
    999999,
  );
  const cLeak = leakBelow.rows.find((r) => r.teamId === 3);
  check(
    '≤50% vs below → Hlathi submissive',
    cLeak?.below.label === 'Hlathi submissive',
    `label=${cLeak?.below.label} pct=${cLeak?.below.pctAttained}`,
  );

  const thin = buildBhozomaTable(TABLE, [
    { homeId: 3, awayId: 1, homeGoals: 0, awayGoals: 1, unix: 1 },
  ], null);
  const c2 = thin.rows.find((r) => r.teamId === 3);
  check(
    'MP < 3 → early Goliath hero',
    c2?.above.dataDust === true && c2.above.label === 'Goliath hero · early',
    `label=${c2?.above.label}`,
  );

  // Yellow (3rd) vs a different tier (2nd): split is still on the yellow side’s place.
  check(
    'yellow 3rd vs above is 2–1',
    charlie?.aboveRanks?.from === 2 && charlie?.aboveRanks?.to === 1,
    `span=${formatBhozomaSpan(charlie?.aboveRanks ?? null)}`,
  );
  check(
    'yellow 3rd vs below is 4–last',
    charlie?.belowRanks?.from === 4 && charlie?.belowRanks?.to === 6,
    `span=${formatBhozomaSpan(charlie?.belowRanks ?? null)}`,
  );
  check('1st has no sides above', table.rows[0]?.aboveRanks == null);
  check('last has no sides below', table.rows[5]?.belowRanks == null);
  check('format 8–1', formatBhozomaSpan({ from: 8, to: 1 }) === '8–1');

  const mixedVenue: SeasonMatch[] = [
    { homeId: 3, awayId: 1, homeGoals: 0, awayGoals: 2, unix: 1 },
    { homeId: 3, awayId: 2, homeGoals: 0, awayGoals: 2, unix: 2 },
    { homeId: 1, awayId: 3, homeGoals: 2, awayGoals: 0, unix: 3 },
    { homeId: 5, awayId: 3, homeGoals: 0, awayGoals: 1, unix: 4 },
  ];
  const overallV = buildBhozomaTable(TABLE, mixedVenue, 999999, 'overall');
  const homeV = buildBhozomaTable(TABLE, mixedVenue, 999999, 'home');
  const awayV = buildBhozomaTable(TABLE, mixedVenue, 999999, 'away');
  const cAll = overallV.rows.find((r) => r.teamId === 3);
  const cHome = homeV.rows.find((r) => r.teamId === 3);
  const cAway = awayV.rows.find((r) => r.teamId === 3);
  check('overall counts home+away vs above', cAll?.above.mp === 3, `mp=${cAll?.above.mp}`);
  check('home filter drops away vs above', cHome?.above.mp === 2, `mp=${cHome?.above.mp}`);
  check('away filter keeps only away vs above', cAway?.above.mp === 1, `mp=${cAway?.above.mp}`);
  check('home filter keeps only home vs below', cHome?.below.mp === 0, `mp=${cHome?.below.mp}`);
  check('away filter keeps away vs below', cAway?.below.mp === 1, `mp=${cAway?.below.mp}`);
  check(
    'venue filter does not change table ranks',
    cHome?.rank === 3 && cAway?.rank === 3 && cHome.aboveRanks?.from === 2,
  );

  // 3rd (yellow) vs 2nd (not yellow) — only the yellow side is in the Bhozoma table.
  const fixture = bhozomaFixtureRows(table, [3, 2]);
  check('fixture table is the yellow side only', fixture.length === 1 && fixture[0]?.teamId === 3);
  check('non-yellow 2nd is not listed', fixture.every((r) => r.teamId !== 2 && r.teamId !== 4));
  check(
    '3rd vs 2nd still splits 2–1 / 4–last on the yellow side',
    fixture[0]?.aboveRanks?.from === 2 &&
      fixture[0]?.aboveRanks?.to === 1 &&
      fixture[0]?.belowRanks?.from === 4 &&
      fixture[0]?.belowRanks?.to === 6,
  );

  const bothYellow = bhozomaFixtureRows(table, [3, 4]);
  check('both yellow sides listed', bothYellow.length === 2 && bothYellow[0]?.teamId === 3 && bothYellow[1]?.teamId === 4);

  const neitherYellow = bhozomaFixtureRows(table, [1, 2]);
  check('no yellow sides → empty bhozoma table', neitherYellow.length === 0);

  const twenty: StandingLike[] = Array.from({ length: 20 }, (_, i) =>
    team(i + 1, i + 1, `T${i + 1}`, 60 - i, 20, i < 6 ? 'top' : i < 14 ? 'mid' : 'bottom'),
  );
  const nine = buildBhozomaTable(twenty, [], 999999).rows.find((r) => r.rank === 9);
  check(
    '9th vs a different tier splits 8–1 / 10–20',
    nine?.aboveRanks?.from === 8 &&
      nine?.aboveRanks?.to === 1 &&
      nine?.belowRanks?.from === 10 &&
      nine?.belowRanks?.to === 20,
    `above=${formatBhozomaSpan(nine?.aboveRanks ?? null)} below=${formatBhozomaSpan(nine?.belowRanks ?? null)}`,
  );
  const nineVsTwo = bhozomaFixtureRows(buildBhozomaTable(twenty, [], 999999), [9, 2]);
  check('9th vs 2nd lists only 9th', nineVsTwo.length === 1 && nineVsTwo[0]?.rank === 9);
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
