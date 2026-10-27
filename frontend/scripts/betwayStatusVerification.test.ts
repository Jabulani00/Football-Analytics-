import {
  decideBetwayRemoval,
  verificationDates,
  type ApiFootballFixture,
  type BetwayVerificationCandidate,
} from '../services/betwayStatusVerification';

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean): void {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${name}`);
  }
}

const candidate: BetwayVerificationCandidate = {
  episode_id: 'episode-1',
  provider_event_id: 'betway-1',
  home_team: 'Alpha FC',
  away_team: 'Bravo United',
  competition: 'Premier League, South Africa',
  kickoff_utc: '2026-10-12T20:00:00.000Z',
};

function fixture(overrides: {
  id?: number;
  date?: string;
  status?: string;
  home?: string;
  away?: string;
  league?: string;
  country?: string | null;
} = {}): ApiFootballFixture {
  return {
    fixture: {
      id: overrides.id ?? 101,
      date: overrides.date ?? '2026-10-12T20:00:00+00:00',
      status: { short: overrides.status ?? 'NS' },
    },
    teams: {
      home: { name: overrides.home ?? 'Alpha' },
      away: { name: overrides.away ?? 'Bravo United' },
    },
    league: {
      name: overrides.league ?? 'Premier League',
      country: overrides.country ?? 'South Africa',
    },
  };
}

console.log('\nBetway fixture-status verification');

check(
  'scheduled source match with exact identity and kickoff verifies the removal',
  decideBetwayRemoval(candidate, [fixture()]).decision === 'verified',
);
check(
  'cancelled fixtures are rejected as removals',
  decideBetwayRemoval(candidate, [fixture({ status: 'CANC' })]).decision === 'cancelled',
);
check(
  'postponed fixtures are rejected as removals',
  decideBetwayRemoval(candidate, [fixture({ status: 'PST' })]).decision === 'postponed',
);
check(
  'a referee-suspended match is classified as suspended, not started or removed',
  decideBetwayRemoval(candidate, [fixture({ status: 'SUSP' })]).decision === 'suspended',
);
check(
  'an interrupted match is classified as suspended',
  decideBetwayRemoval(candidate, [fixture({ status: 'INT' })]).decision === 'suspended',
);
check(
  'an abandoned match is classified separately from a completed fixture',
  decideBetwayRemoval(candidate, [fixture({ status: 'ABD' })]).decision === 'abandoned',
);
check(
  'a fixture with an undefined kickoff cannot verify bookmaker removal',
  decideBetwayRemoval(candidate, [fixture({ status: 'TBD' })]).reason === 'source_kickoff_not_defined',
);
check(
  'live fixtures are classified as started',
  decideBetwayRemoval(candidate, [fixture({ status: '1H' })]).decision === 'started',
);
check(
  'finished fixtures are rejected as removals',
  decideBetwayRemoval(candidate, [fixture({ status: 'FT' })]).decision === 'finished',
);
check(
  'changed kickoff is classified as rescheduled',
  decideBetwayRemoval(candidate, [fixture({ date: '2026-10-12T21:00:00+00:00' })]).decision === 'rescheduled',
);
check(
  'no provider match remains unverified',
  decideBetwayRemoval(candidate, []).decision === 'unverified',
);
check(
  'ambiguous provider matches remain unverified',
  decideBetwayRemoval(candidate, [fixture(), fixture({ id: 102 })]).reason === 'ambiguous_match',
);
check(
  'reversed teams do not match',
  decideBetwayRemoval(candidate, [fixture({ home: 'Bravo United', away: 'Alpha FC' })]).decision === 'unverified',
);
check(
  'a generic club name cannot verify a longer different club name',
  decideBetwayRemoval(
    { ...candidate, home_team: 'United' },
    [fixture({ home: 'Manchester United' })],
  ).decision === 'unverified',
);
check(
  'different competition does not match',
  decideBetwayRemoval(candidate, [fixture({ league: 'Cup', country: 'Other' })]).decision === 'unverified',
);
check(
  'an incomplete provider lookup cannot verify a removal',
  decideBetwayRemoval(candidate, [fixture()], true).decision === 'unverified',
);
check(
  'an upstream error reason is preserved for the retry audit trail',
  decideBetwayRemoval(candidate, [], true, 'upstream_http_503').reason === 'upstream_http_503',
);
check(
  'date lookup includes adjacent UTC dates for reschedule and timezone checks',
  verificationDates(candidate.kickoff_utc).join(',') === '2026-10-11,2026-10-12,2026-10-13',
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
