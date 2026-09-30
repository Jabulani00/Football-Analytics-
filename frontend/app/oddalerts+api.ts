// Expo Router API route — server-side proxy for the OddAlerts API.
//
// Served at `/oddalerts` by the Expo dev server (`expo start`) AND in the
// exported server bundle, so the web app works locally and in production
// without any CORS issues. The token stays server-side.
//
// Complete upstream bodies are cached for a short TTL. Identical in-flight
// calls share one OddAlerts request. Set CACHE_ENABLED=false to pass through.

import { fetchThroughCache } from '../services/oddAlertsServerCache';

const UPSTREAM = 'https://data.oddalerts.com/api';

const ALLOWED_PREFIXES = [
  'fixtures',
  'value',
  'trends',
  'odds',
  'stats',
  'bookmakers',
  'players',
  'referees',
  'countries',
  'competitions',
  'teams',
  'meta',
];

// Server-side only — never shipped to the browser. Set ODDALERTS_TOKEN in
// frontend/.env locally and in the Vercel project environment variables.
const TOKEN = process.env.ODDALERTS_TOKEN || process.env.EXPO_PUBLIC_ODDALERTS_TOKEN || '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = (url.searchParams.get('path') ?? '').replace(/^\/+/, '').replace(/\.\.+/g, '');
  const family = path.split('/')[0];

  if (!path || !ALLOWED_PREFIXES.includes(family)) {
    return Response.json({ error: `Unsupported path: "${path}"` }, { status: 400, headers: CORS });
  }

  if (!TOKEN) {
    return Response.json(
      { error: 'ODDALERTS_TOKEN is not configured on the server.' },
      { status: 500, headers: CORS },
    );
  }

  const search = new URLSearchParams();
  url.searchParams.forEach((value, key) => {
    if (key === 'path' || key === 'api_token' || key === 'cache') return;
    search.append(key, value);
  });

  const bypass = url.searchParams.get('cache') === 'off';

  try {
    const result = await fetchThroughCache({
      path,
      params: search,
      bypass,
      fetcher: async () => {
        const upstreamSearch = new URLSearchParams(search);
        upstreamSearch.set('api_token', TOKEN);
        const upstream = await fetch(`${UPSTREAM}/${path}?${upstreamSearch.toString()}`, {
          headers: { Accept: 'application/json' },
        });
        const body = await upstream.text();
        return {
          status: upstream.status,
          contentType: upstream.headers.get('Content-Type') ?? 'application/json; charset=utf-8',
          body,
        };
      },
    });

    const cacheHeader = result.cache === 'BYPASS' ? 'MISS' : result.cache;
    return new Response(result.body, {
      status: result.status,
      headers: {
        ...CORS,
        'Content-Type': result.contentType || 'application/json; charset=utf-8',
        'Cache-Control': 'private, max-age=0',
        'X-Cache': cacheHeader,
        'Server-Timing': `app;dur=${result.durationMs}`,
      },
    });
  } catch (err) {
    return Response.json(
      { error: 'Upstream request failed', detail: String(err) },
      { status: 502, headers: CORS },
    );
  }
}
