// Expo Router API route — server-side proxy for club badges (logos).
//
// Looks up a team on TheSportsDB (free, crowd-sourced) and returns the
// transparent-PNG badge URL. Served at `/teamlogo`. Keeps the optional API key
// server-side and avoids CORS on web. Returns `{ badge: null }` (HTTP 200) when
// nothing is found so the client can fall back gracefully.

const TSDB_KEY = process.env.THESPORTSDB_KEY || process.env.EXPO_PUBLIC_THESPORTSDB_KEY || '123';

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
  const name = (url.searchParams.get('name') ?? '').trim();

  const json = (badge: string | null, cache = false) =>
    new Response(JSON.stringify({ badge }), {
      status: 200,
      headers: {
        ...CORS,
        'Content-Type': 'application/json; charset=utf-8',
        ...(cache ? { 'Cache-Control': 'public, max-age=86400, s-maxage=604800' } : {}),
      },
    });

  if (!name) return json(null);

  try {
    const upstream = await fetch(
      `https://www.thesportsdb.com/api/v1/json/${TSDB_KEY}/searchteams.php?t=${encodeURIComponent(name)}`,
      { headers: { Accept: 'application/json' } },
    );
    if (!upstream.ok) return json(null);
    const data = (await upstream.json()) as { teams?: { strTeamBadge?: string | null }[] | null };
    const badge = data?.teams?.[0]?.strTeamBadge ?? null;
    return json(badge, true);
  } catch {
    return json(null);
  }
}
