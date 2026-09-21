/**
 * Upcoming-fixture Streamline tags.
 * Run: npx tsx scripts/fixtureStreamline.test.ts
 */
import type { Fixture } from '../services/oddAlerts';
import { h2hFromFinishedFixtures, streamForFixture } from '../utils/fixtureStreamline';
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
];

console.log('\nstream on upcoming fixture');
{
  check('NS close game is Bateteme', streamForFixture(fx({ id: 10, status: 'NS' }), table) === 'bateteme');
  check('cup is skipped', streamForFixture(
    fx({
      id: 11,
      status: 'NS',
      competition: {
        id: 99,
        name: 'FA Cup',
        country: 'England',
        type: 'Cup',
        isCup: true,
        isFriendly: false,
      },
    }),
    table,
  ) == null);
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
