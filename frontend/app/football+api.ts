// Expo Router API route — server-side proxy for API-Football (api-sports.io).
// Match events (goals, assists, cards, subs) are not in OddAlerts; this fills the gap.

const UPSTREAM = 'https://v3.football.api-sports.io';

const ALLOWED_PREFIXES = ['fixtures'];

const KEY =
  process.env.API_FOOTBALL_KEY ||
  process.env.EXPO_PUBLIC_API_FOOTBALL_KEY ||
  '';

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

  if (!KEY) {
    return Response.json(
      { error: 'API_FOOTBALL_KEY is not configured on the server.' },
      { status: 500, headers: CORS },
    );
  }

  const search = new URLSearchParams();
  url.searchParams.forEach((value, key) => {
    if (key === 'path') return;
    search.append(key, value);
  });

  try {
    const upstream = await fetch(`${UPSTREAM}/${path}?${search.toString()}`, {
      headers: {
        Accept: 'application/json',
        'x-apisports-key': KEY,
      },
    });
    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: {
        ...CORS,
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 's-maxage=60, stale-while-revalidate=120',
      },
    });
  } catch (err) {
    return Response.json(
      { error: 'Upstream request failed', detail: String(err) },
      { status: 502, headers: CORS },
    );
  }
}
