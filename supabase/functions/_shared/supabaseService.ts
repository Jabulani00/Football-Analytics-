export function serviceEnvironment(): { url: string; key: string } | null {
  const url = Deno.env.get('SUPABASE_URL');
  let key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!key) {
    try {
      const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>;
      key = keys.default;
    } catch {
      return null;
    }
  }
  return url && key ? { url, key } : null;
}

export function createRpcClient(url: string, key: string) {
  const base = `${url.replace(/\/+$/, '')}/rest/v1/rpc`;
  const headers = {
    apikey: key,
    ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}),
    'Content-Type': 'application/json',
  };
  return async function rpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${base}/${name}`, {
      method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Supabase RPC ${name}: HTTP ${response.status} ${await response.text()}`);
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  };
}

export function privateWorkerRequest(request: Request): Response | null {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (request.method !== 'POST') return Response.json({ error: 'POST required' }, { status: 405 });
  const expected = Deno.env.get('BETWAY_CRON_SECRET');
  if (!expected) return Response.json({ error: 'BETWAY_CRON_SECRET is not configured' }, { status: 500 });
  if (request.headers.get('x-cron-secret') !== expected) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}
