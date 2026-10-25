export type BetwayCrawlRun = {
  run_id: string;
  captured_at: string;
  completed_at: string;
  status: 'complete' | 'failed';
  pages_captured: number;
  source_event_count: number;
  excluded_event_count: number;
  fixture_count: number;
};

export type BetwayEvent = {
  provider_event_id: string;
  home_team: string;
  away_team: string;
  competition: string | null;
  start_time: string;
  fixture_status: 'active' | 'suspended';
  lifecycle_state:
    | 'active'
    | 'suspended'
    | 'pending_removal'
    | 'removed_pre_kickoff'
    | 'reopened'
    | 'rescheduled'
    | 'started'
    | 'expired'
    | 'cancelled'
    | 'postponed';
  odds_home: number | null;
  odds_draw: number | null;
  odds_away: number | null;
  market_open: boolean;
  market_suspended: boolean;
  missing_count: number;
  missing_since: string | null;
  last_seen_at: string;
  removed_at: string | null;
  updated_at: string;
};

export type BetwayRemovalEpisode = {
  episode_id: string;
  provider_event_id: string;
  episode_number: number;
  state: 'pending' | 'confirmed';
  verification_status: 'unverified' | 'verified' | 'rejected';
  missing_crawls: number;
  missing_since: string;
  last_missing_at: string;
  confirmed_at: string | null;
  ended_at: string | null;
  odds_home: number | null;
  odds_draw: number | null;
  odds_away: number | null;
  verification_attempts: number;
  verification_next_attempt_at: string;
  verification_last_attempt_at: string | null;
  verification_reason: string | null;
  verification_source_status: string | null;
  verification_source_fixture_id: string | null;
  verification_source_kickoff: string | null;
};

export type BetwayVerifiedRemoval = BetwayRemovalEpisode & { event: BetwayEvent };

export type BetwayChange = {
  change_id: number;
  provider_event_id: string;
  observed_at: string;
  change_type: string;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
};

export type BetwayHuntSnapshot = {
  bookmaker: 'Betway';
  historyAvailable: boolean;
  runs: BetwayCrawlRun[];
  currentEvents: BetwayEvent[];
  verifiedRemovals: BetwayVerifiedRemoval[];
  pendingRemovals: BetwayRemovalEpisode[];
  changes: BetwayChange[];
};

export class BetwayHuntError extends Error {
  constructor(message: string, readonly status: number, readonly body: string) {
    super(message);
    this.name = 'BetwayHuntError';
  }
}

export function betwayHuntEndpoint(): string {
  return process.env.EXPO_PUBLIC_BETWAY_HUNT_URL ?? '/betway-hunt-status';
}

export async function fetchBetwayHunt(
  endpoint = betwayHuntEndpoint(),
  fetchImpl: typeof fetch = fetch,
): Promise<BetwayHuntSnapshot> {
  const response = await fetchImpl(endpoint, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new BetwayHuntError(`Betway Hunt endpoint returned HTTP ${response.status}`, response.status, body);
  }
  const snapshot = (await response.json()) as Partial<BetwayHuntSnapshot>;
  if (
    snapshot.bookmaker !== 'Betway' ||
    !Array.isArray(snapshot.runs) ||
    !Array.isArray(snapshot.currentEvents) ||
    !Array.isArray(snapshot.verifiedRemovals) ||
    !Array.isArray(snapshot.pendingRemovals) ||
    !Array.isArray(snapshot.changes)
  ) {
    throw new BetwayHuntError('Betway Hunt endpoint returned an invalid snapshot', 502, '');
  }
  return snapshot as BetwayHuntSnapshot;
}

export function latestSuccessfulBetwayRun(runs: BetwayCrawlRun[]): BetwayCrawlRun | null {
  return runs.find((run) => run.status === 'complete') ?? null;
}

