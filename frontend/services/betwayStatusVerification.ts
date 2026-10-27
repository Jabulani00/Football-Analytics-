export type BetwayVerificationCandidate = {
  episode_id: string;
  provider_event_id: string;
  home_team: string;
  away_team: string;
  competition: string | null;
  kickoff_utc: string;
};

export type ApiFootballFixture = {
  fixture: {
    id: number;
    date: string;
    status: { short: string };
  };
  teams: {
    home: { name: string };
    away: { name: string };
  };
  league: {
    name: string;
    country: string | null;
  };
};

export type BetwayVerificationDecision =
  | 'verified'
  | 'cancelled'
  | 'postponed'
  | 'rescheduled'
  | 'suspended'
  | 'abandoned'
  | 'started'
  | 'finished'
  | 'unverified';

export type BetwayVerificationResult = {
  episode_id: string;
  provider_event_id: string;
  decision: BetwayVerificationDecision;
  source_status: string | null;
  source_fixture_id: string | null;
  source_kickoff_utc: string | null;
  reason: string | null;
};

const LIVE_STATUSES = new Set(['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE']);
const FINISHED_STATUSES = new Set(['FT', 'AET', 'PEN', 'AWD', 'WO']);
const MATCH_WINDOW_MS = 36 * 60 * 60 * 1000;
const KICKOFF_MATCH_TOLERANCE_MS = 15 * 60 * 1000;

export function normalizeFixtureName(value: string): string {
  return value
    .toLocaleLowerCase('en')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(fc|sc|cf|fk|afc|bk|if|ac|sv|as|cd|ud)\b/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function namesMatch(left: string, right: string): boolean {
  const a = normalizeFixtureName(left);
  const b = normalizeFixtureName(right);
  if (!a || !b) return false;
  if (a === b) return true;
  const overlap = Math.min(a.length, b.length) / Math.max(a.length, b.length);
  return Math.min(a.length, b.length) >= 5 && overlap >= 0.75 &&
    (a.includes(b) || b.includes(a));
}

function competitionMatches(candidate: BetwayVerificationCandidate, fixture: ApiFootballFixture): boolean {
  if (!candidate.competition?.trim()) return true;
  const sourceParts = [fixture.league.name, fixture.league.country ?? ''].map(normalizeFixtureName);
  const candidateParts = candidate.competition
    .split(',')
    .map(normalizeFixtureName)
    .filter(Boolean);
  return candidateParts.length > 0 && candidateParts.every((part) =>
    sourceParts.some((source) =>
      source === part || (part.length >= 5 && source.includes(part)),
    ),
  );
}

function result(
  candidate: BetwayVerificationCandidate,
  decision: BetwayVerificationDecision,
  fixture: ApiFootballFixture | null,
  reason: string | null,
): BetwayVerificationResult {
  const kickoff = fixture ? Date.parse(fixture.fixture.date) : NaN;
  return {
    episode_id: candidate.episode_id,
    provider_event_id: candidate.provider_event_id,
    decision,
    source_status: fixture?.fixture.status.short.toUpperCase() ?? null,
    source_fixture_id: fixture ? String(fixture.fixture.id) : null,
    source_kickoff_utc: Number.isFinite(kickoff) ? new Date(kickoff).toISOString() : null,
    reason,
  };
}

export function verificationDates(kickoffUtc: string): string[] {
  const timestamp = Date.parse(kickoffUtc);
  if (!Number.isFinite(timestamp)) return [];
  return [-1, 0, 1].map((dayOffset) =>
    new Date(timestamp + dayOffset * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  );
}

export function decideBetwayRemoval(
  candidate: BetwayVerificationCandidate,
  fixtures: ApiFootballFixture[],
  lookupIncomplete = false,
  lookupFailureReason = 'lookup_incomplete',
): BetwayVerificationResult {
  if (lookupIncomplete) {
    return result(candidate, 'unverified', null, lookupFailureReason);
  }

  const candidateKickoff = Date.parse(candidate.kickoff_utc);
  if (!Number.isFinite(candidateKickoff)) {
    return result(candidate, 'unverified', null, 'invalid_candidate_kickoff');
  }

  const matches = fixtures.filter((fixture) => {
    const sourceKickoff = Date.parse(fixture.fixture.date);
    return (
      Number.isFinite(sourceKickoff) &&
      Math.abs(sourceKickoff - candidateKickoff) <= MATCH_WINDOW_MS &&
      namesMatch(fixture.teams.home.name, candidate.home_team) &&
      namesMatch(fixture.teams.away.name, candidate.away_team) &&
      competitionMatches(candidate, fixture)
    );
  });

  if (matches.length === 0) return result(candidate, 'unverified', null, 'no_match');
  if (matches.length !== 1) return result(candidate, 'unverified', null, 'ambiguous_match');

  const fixture = matches[0];
  const status = fixture.fixture.status.short.toUpperCase();
  const sourceKickoff = Date.parse(fixture.fixture.date);

  if (status === 'CANC') return result(candidate, 'cancelled', fixture, null);
  if (status === 'PST' || status === 'POST') {
    return result(candidate, 'postponed', fixture, null);
  }
  if (status === 'SUSP' || status === 'INT') {
    return result(candidate, 'suspended', fixture, null);
  }
  if (status === 'ABD') return result(candidate, 'abandoned', fixture, null);
  if (LIVE_STATUSES.has(status)) return result(candidate, 'started', fixture, null);
  if (FINISHED_STATUSES.has(status)) return result(candidate, 'finished', fixture, null);
  if (status === 'TBD') {
    return result(candidate, 'unverified', fixture, 'source_kickoff_not_defined');
  }
  if (status !== 'NS') {
    return result(candidate, 'unverified', fixture, 'unsupported_source_status');
  }
  if (Math.abs(sourceKickoff - candidateKickoff) > KICKOFF_MATCH_TOLERANCE_MS) {
    return result(candidate, 'rescheduled', fixture, null);
  }
  return result(candidate, 'verified', fixture, null);
}
