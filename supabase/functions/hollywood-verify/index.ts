import {
  type ApiFootballFixture,
  type BetwayVerificationCandidate as HollywoodVerificationCandidate,
  decideBetwayRemoval as decideHollywoodDisappearance,
} from '../_shared/betwayVerification.ts';
import { createRpcClient, serviceEnvironment } from '../_shared/supabaseService.ts';

type Claim = {
  candidates: HollywoodVerificationCandidate[];
  allowed_dates: string[];
  daily_budget_remaining?: number;
  reason?: string;
};

function rejectPrivateRequest(request: Request): Response | null {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (request.method !== 'POST') return Response.json({ error: 'POST required' }, { status: 405 });
  const expected = Deno.env.get('HUNT_CRON_SECRET');
  if (!expected) return Response.json({ error: 'HUNT_CRON_SECRET is not configured' }, { status: 500 });
  if (request.headers.get('x-cron-secret') !== expected) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

async function fixturesForDates(dates: string[], key: string): Promise<ApiFootballFixture[]> {
  const fixtures: ApiFootballFixture[] = [];
  for (let offset = 0; offset < dates.length; offset += 3) {
    const batch = await Promise.all(dates.slice(offset, offset + 3).map(async (date) => {
      const url = new URL('https://v3.football.api-sports.io/fixtures');
      url.searchParams.set('date', date);
      url.searchParams.set('timezone', 'UTC');
      const response = await fetch(url, {
        headers: { Accept: 'application/json', 'x-apisports-key': key },
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(`API-Football HTTP ${response.status} for ${date}`);
      const body = await response.json() as { response?: unknown; errors?: unknown };
      if (!Array.isArray(body.response)) {
        throw new Error(`API-Football returned an invalid response for ${date}`);
      }
      return body.response as ApiFootballFixture[];
    }));
    for (const rows of batch) fixtures.push(...rows);
  }
  return fixtures;
}

Deno.serve(async (request: Request) => {
  const rejected = rejectPrivateRequest(request);
  if (rejected) return rejected;
  const environment = serviceEnvironment();
  if (!environment) return Response.json({ error: 'Supabase service environment is missing' }, { status: 500 });
  const apiFootballKey = Deno.env.get('API_FOOTBALL_KEY');
  if (!apiFootballKey) return Response.json({ error: 'API_FOOTBALL_KEY is not configured' }, { status: 500 });
  const rpc = createRpcClient(environment.url, environment.key);

  try {
    const claim = await rpc<Claim>('claim_hollywood_status_verifications', { p_limit: 5 });
    if (!Array.isArray(claim.candidates) || !Array.isArray(claim.allowed_dates)) {
      throw new Error('Hollywood verification claim returned an unexpected result');
    }
    if (claim.candidates.length === 0) {
      return Response.json({
        ok: true,
        claimed: 0,
        resolved: 0,
        reason: claim.reason ?? null,
        daily_budget_remaining: claim.daily_budget_remaining ?? null,
      });
    }

    let results;
    try {
      const fixtures = await fixturesForDates(claim.allowed_dates, apiFootballKey);
      results = claim.candidates.map((candidate) => decideHollywoodDisappearance(candidate, fixtures));
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      results = claim.candidates.map((candidate) =>
        decideHollywoodDisappearance(candidate, [], true, reason.slice(0, 500))
      );
    }
    const resolution = await rpc<Record<string, unknown>>('resolve_hollywood_status_verifications', {
      p_results: results,
    });
    return Response.json({
      ok: true,
      claimed: claim.candidates.length,
      daily_budget_remaining: claim.daily_budget_remaining ?? null,
      ...resolution,
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }
});
