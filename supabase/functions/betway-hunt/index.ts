import { captureBetwaySnapshotWithRetries } from '../_shared/betwaySnapshot.ts';
import { createRpcClient, privateWorkerRequest, serviceEnvironment } from '../_shared/supabaseService.ts';

type ApplyResult = { status: string; run_id: string; fixture_count: number; [key: string]: unknown };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-cron-secret',
};

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { ...CORS, 'Cache-Control': 'no-store' },
  });
}

async function publicSnapshot(url: string, key: string) {
  const base = `${url.replace(/\/+$/, '')}/rest/v1`;
  const headers = {
    apikey: key,
    ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}),
  };
  const read = async <T>(path: string): Promise<T> => {
    const response = await fetch(`${base}${path}`, {
      headers,
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new Error(`Betway public read ${path.split('?')[0]}: HTTP ${response.status}`);
    }
    return (await response.json()) as T;
  };

  const now = new Date().toISOString();
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const runsQuery = new URLSearchParams({
    select: 'run_id,captured_at,completed_at,status,pages_captured,source_event_count,excluded_event_count,fixture_count',
    order: 'captured_at.desc',
    limit: '10',
  });
  const currentQuery = new URLSearchParams({
    select: 'provider_event_id,home_team,away_team,competition,start_time,fixture_status,lifecycle_state,odds_home,odds_draw,odds_away,market_open,market_suspended,missing_count,missing_since,last_seen_at,removed_at,updated_at',
    start_time: `gt.${now}`,
    lifecycle_state: 'in.(active,suspended,pending_removal)',
    order: 'start_time.asc',
    limit: '5000',
  });
  const removedQuery = new URLSearchParams({
    select: 'provider_event_id,home_team,away_team,competition,start_time,fixture_status,lifecycle_state,odds_home,odds_draw,odds_away,market_open,market_suspended,missing_count,missing_since,last_seen_at,removed_at,updated_at',
    start_time: `gt.${now}`,
    lifecycle_state: 'eq.removed_pre_kickoff',
    order: 'removed_at.desc',
    limit: '500',
  });
  const episodesQuery = new URLSearchParams({
    select: 'episode_id,provider_event_id,episode_number,state,verification_status,missing_crawls,missing_since,last_missing_at,confirmed_at,ended_at,odds_home,odds_draw,odds_away,verification_attempts,verification_next_attempt_at,verification_last_attempt_at,verification_reason,verification_source_status,verification_source_fixture_id,verification_source_kickoff',
    state: 'in.(pending,confirmed)',
    order: 'last_missing_at.desc',
    limit: '500',
  });
  const changesQuery = new URLSearchParams({
    select: 'change_id,provider_event_id,observed_at,change_type,old_values,new_values',
    observed_at: `gte.${since}`,
    order: 'observed_at.desc',
    limit: '200',
  });
  const marketQuery = new URLSearchParams({
    select: 'provider_event_id,markets',
    order: 'observed_at.desc',
    limit: '5000',
  });

  const [runs, currentEventsRaw, removedEventsRaw, removalEpisodes, changes, marketRows] = await Promise.all([
    read<Record<string, unknown>[]>(`/bw_crawl_run?${runsQuery}`),
    read<Record<string, unknown>[]>(`/bw_event?${currentQuery}`),
    read<Record<string, unknown>[]>(`/bw_event?${removedQuery}`),
    read<Record<string, unknown>[]>(`/bw_removal_episode?${episodesQuery}`),
    read<Record<string, unknown>[]>(`/bw_change?${changesQuery}`),
    read<{ provider_event_id: string; markets: unknown[] }[]>(`/bw_event_market_snapshot?${marketQuery}`),
  ]);
  const marketsByEvent = new Map(marketRows.map((row) => [row.provider_event_id, row.markets]));
  const withMarkets = (event: Record<string, unknown>) => ({
    ...event,
    markets: marketsByEvent.get(String(event.provider_event_id)) ?? [],
  });
  const currentEvents = currentEventsRaw.map(withMarkets);
  const removedEvents = removedEventsRaw.map(withMarkets);

  const removedById = new Map(
    removedEvents.map((event) => [String(event.provider_event_id), event]),
  );
  const verifiedRemovals = removalEpisodes
    .filter((episode) =>
      episode.state === 'confirmed' && episode.verification_status === 'verified'
    )
    .map((episode) => ({
      ...episode,
      event: removedById.get(String(episode.provider_event_id)) ?? null,
    }))
    .filter((episode) => episode.event != null);
  const pendingRemovals = removalEpisodes.filter((episode) =>
    episode.state === 'pending' ||
    (episode.state === 'confirmed' && episode.verification_status === 'unverified')
  );

  return {
    bookmaker: 'Betway',
    historyAvailable: true,
    runs,
    currentEvents,
    verifiedRemovals,
    pendingRemovals,
    changes,
  };
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'GET' && request.method !== 'POST') {
    return json({ error: 'GET or POST required' }, 405);
  }
  const environment = serviceEnvironment();
  if (!environment) return json({ error: 'Supabase service environment is missing' }, 500);

  if (request.method === 'GET') {
    try {
      return json(await publicSnapshot(environment.url, environment.key));
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : String(error) }, 502);
    }
  }

  const rejected = privateWorkerRequest(request);
  if (rejected) {
    const body = await rejected.text();
    return new Response(body, { status: rejected.status, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
  const rpc = createRpcClient(environment.url, environment.key);
  try {
    const snapshot = await captureBetwaySnapshotWithRetries({ runBudgetMs: 120_000, maxAttempts: 3 });
    const applied = await rpc<ApplyResult>('apply_betway_snapshot', { p_snapshot: snapshot });
    if (!applied || applied.status !== 'complete') {
      throw new Error('Betway persistence RPC returned an unexpected result');
    }
    return json({ ok: true, ...applied });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try {
      await rpc<string>('record_betway_crawl_failure', { p_error: message.slice(0, 2_000) });
    } catch (loggingError) {
      console.error('Could not record Betway crawl failure', loggingError);
    }
    return json({ ok: false, error: message }, 502);
  }
});
