/**
 * Upcoming-fixture Streamline tags — same engine as Power Dynamics.
 * Run: npx tsx scripts/fixtureStreamline.test.ts
 */
import type { Fixture, H2HMatch } from '../services/oddAlerts';
import { h2hFromFinishedFixtures, streamForFixture } from '../utils/fixtureStreamline';
import { evaluatePowerDynamics, listedStreams } from '../utils/powerDynamicsEngine';
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

function fx(over: Partial<Fixture> & Pick<Fixture, 'id' | 'status'>): Fixture {
  return {
    rawStatus: over.status,
    minute: null,
    addedTime: null,
    kickoffUnix: 1,
    kickoff: '15:00',
    gender: 'men',
    kind: 'club',
    home: { id: 1, name: 'Arsenal', goals: null, position: 2 },
    away: { id: 2, name: 'Leeds', goals: null, position: 6 },
    seasonId: 2263973,
    competition: {
      id: 423,
      name: 'Premier League',
      country: 'England',
      type: 'League',
      isCup: false,
      isFriendly: false,
    },
    ...over,
  };
}

const table: StandingLike[] = [
  { rank: 2, teamId: 1, name: 'Arsenal', points: 12, played: 5, zone: 'top' },
  { rank: 6, teamId: 2, name: 'Leeds', points: 9, played: 5, zone: 'mid' },
  { rank: 1, teamId: 3, name: 'City', points: 28, played: 10, zone: 'top' },
];

console.log('\nstream on upcoming fixture');
{
  check(
    'NS close game is Bateteme',
    streamForFixture(fx({ id: 10, status: 'NS' }), table)[0] === 'bateteme',
  );
  check(
    'far game without PD odds/H2H is not faked as Bookie 2',
    streamForFixture(
      fx({
        id: 12,
        status: 'NS',
        home: { id: 3, name: 'City', goals: null, position: 1 },
        away: { id: 2, name: 'Leeds', goals: null, position: 6 },
      }),
      table,
    ).length === 0,
  );
}

console.log('\nchip matches Power Dynamics');
{
  const game = fx({
    id: 30,
    status: 'NS',
    home: { id: 3, name: 'City', goals: null, position: 1 },
    away: { id: 2, name: 'Leeds', goals: null, position: 6 },
  });
  const h2h: H2HMatch[] = [
    {
      id: 1,
      home_name: 'City',
      away_name: 'Leeds',
      home_goals: 1,
      away_goals: 1,
      ht_score: null,
      total_goals: 2,
      btts: true,
      date: '2026-09-01',
      league: 'PL',
    },
  ];
  const book1x2 = { home: 4.2, away: 1.7 };
  const chip = streamForFixture(game, table, { h2hMatches: h2h, book1x2 });
  const pd = evaluatePowerDynamics({
    table,
    homeId: game.home.id,
    awayId: game.away.id,
    homeName: game.home.name,
    awayName: game.away.name,
    homeResults: [],
    awayResults: [],
    h2hMatches: h2h,
    book1x2,
  });
  check(
    'list chip is listedStreams from evaluatePowerDynamics',
    JSON.stringify(chip) === JSON.stringify(listedStreams(pd.streamline.inStreams)),
  );
  check('that fixture is Zidane Law on both surfaces', chip[0] === 'zidane_law' && pd.streamline.t1Stream === 'zidane_law');

  const closeBook = streamForFixture(fx({ id: 31, status: 'NS' }), table, {
    book1x2: { home: 1.55, away: 5.4 },
  });
  check(
    'close + T1 shorter lists Bateteme and Compliant',
    closeBook.join(',') === 'bateteme,compliant',
  );
}

console.log('\nsame-season H2H from finished list');
{
  const finished = fx({
    id: 20,
    status: 'FT',
    home: { id: 1, name: 'Arsenal', goals: 2, position: 2 },
    away: { id: 2, name: 'Leeds', goals: 2, position: 6 },
  });
  const h2h = h2hFromFinishedFixtures([finished]);
  check('one finished meeting', h2h.length === 1 && h2h[0].home_goals === 2);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
