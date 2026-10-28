const BETWAY_MARKETS_URL =
  'https://www.betway.co.za/sportsapi/br/v1/MarketGroupings/MarketGroupNamesAndMarketsForEvent';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(request: Request): Promise<Response> {
  const requestUrl = new URL(request.url);
  const eventId = requestUrl.searchParams.get('eventId')?.trim() ?? '';
  const marketGroupId = requestUrl.searchParams.get('group')?.trim() ?? 'Main';
  const buildABet = requestUrl.searchParams.get('buildABet') === 'true';

  if (!/^\d+$/.test(eventId)) {
    return Response.json({ error: 'A numeric Betway eventId is required.' }, { status: 400, headers: CORS });
  }
  if (marketGroupId.length > 80) {
    return Response.json({ error: 'The Betway market group is invalid.' }, { status: 400, headers: CORS });
  }

  const upstreamUrl = new URL(BETWAY_MARKETS_URL);
  const params: [string, string][] = [
    ['eventId', eventId],
    ['marketGroupId', marketGroupId === 'All' ? '' : marketGroupId],
    ['countryCode', 'ZA'],
    ['cultureCode', 'en-US'],
    ['skip', '0'],
    ['take', '500'],
    ['isBuildABetOnly', String(buildABet)],
    ['searchQuery', ''],
  ];
  for (const [key, value] of params) upstreamUrl.searchParams.append(key, value);

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: {
        Accept: 'application/json',
        Referer: 'https://www.betway.co.za/',
      },
      signal: AbortSignal.timeout(15_000),
    });
    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: {
        ...CORS,
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 's-maxage=15, stale-while-revalidate=30',
      },
    });
  } catch (error) {
    return Response.json(
      { error: 'Betway full markets are temporarily unavailable.', detail: String(error) },
      { status: 502, headers: CORS },
    );
  }
}
