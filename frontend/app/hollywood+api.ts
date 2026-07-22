// Expo Router API route — server-side proxy for the Hollywoodbets sportsbook.
//
// Served at `/hollywood` by the Expo dev server AND in the exported server
// bundle, so the web app reaches Hollywoodbets without CORS issues.
//
// Why a proxy is required: every Hollywoodbets data host locks CORS to
// `https://www.hollywoodbets.net` (Access-Control-Allow-Origin is their own
// origin, never `*`), so a browser on our origin is blocked. Server-to-server
// has no CORS, and we forward the browser Origin they expect. The feeds are
// unauthenticated public GET/POST endpoints — no token is involved.
//
// Requires `web.output: "server"` in app.json.

// Upstream hosts we allow. Keyed by a short `host` query param the client sends.
const HOSTS: Record<string, string> = {
  events: 'https://sport-events-api.hollywoodbets.net',
  settings: 'https://comet-settings-api.hollywoodbets.net',
  live: 'https://betepsweb.hollywoodbets.net',
  bet: 'https://betapi.hollywoodbets.net',
};

// Path prefixes we permit per host, so the proxy can't be turned into an open
// relay. Matched against the start of the (cleaned) path.
const ALLOWED: Record<string, string[]> = {
  events: ['api/events', 'api/sports'],
  settings: ['api/'],
  live: ['live-or-upcoming/'],
  bet: ['api/punters/ShareABet'],
};

// Hollywoodbets validates the Origin/Referer against their own site.
const HB_ORIGIN = 'https://www.hollywoodbets.net';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function resolve(request: Request): { url: string; error?: undefined } | { url?: undefined; error: Response } {
  const url = new URL(request.url);
  const hostKey = url.searchParams.get('host') ?? '';
  const path = (url.searchParams.get('path') ?? '').replace(/^\/+/, '').replace(/\.\.+/g, '');
  const base = HOSTS[hostKey];

  if (!base || !ALLOWED[hostKey].some((prefix) => path.startsWith(prefix))) {
    return {
      error: Response.json(
        { error: `Unsupported host/path: "${hostKey}" / "${path}"` },
        { status: 400, headers: CORS },
      ),
    };
  }

  const search = new URLSearchParams();
  url.searchParams.forEach((value, key) => {
    if (key === 'host' || key === 'path') return;
    search.append(key, value);
  });
  const qs = search.toString();
  return { url: `${base}/${path}${qs ? `?${qs}` : ''}` };
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(request: Request): Promise<Response> {
  const r = resolve(request);
  if (r.error) return r.error;
  try {
    const upstream = await fetch(r.url, {
      headers: { Accept: 'application/json', Origin: HB_ORIGIN, Referer: `${HB_ORIGIN}/` },
    });
    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: {
        ...CORS,
        'Content-Type': 'application/json; charset=utf-8',
        // Odds move; keep it fresh but allow a short shared-cache window.
        'Cache-Control': 's-maxage=15, stale-while-revalidate=30',
      },
    });
  } catch (err) {
    return Response.json({ error: 'Upstream request failed', detail: String(err) }, { status: 502, headers: CORS });
  }
}

export async function POST(request: Request): Promise<Response> {
  const r = resolve(request);
  if (r.error) return r.error;
  try {
    const payload = await request.text();
    const upstream = await fetch(r.url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Origin: HB_ORIGIN,
        Referer: `${HB_ORIGIN}/`,
      },
      body: payload,
    });
    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    return Response.json({ error: 'Upstream request failed', detail: String(err) }, { status: 502, headers: CORS });
  }
}
