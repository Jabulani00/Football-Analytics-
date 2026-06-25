import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
let TOKEN = process.env.EXPO_PUBLIC_ODDALERTS_TOKEN;
try {
  TOKEN = readFileSync(resolve(__dir, '../.env'), 'utf8').match(/ODDALERTS_TOKEN=(.+)/)?.[1]?.trim() || TOKEN;
} catch {}
const BASE = 'https://data.oddalerts.com/api';

async function get(path, params = {}) {
  const u = new URL(`${BASE}/${path}`);
  u.searchParams.set('api_token', TOKEN);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  const r = await fetch(u);
  return { status: r.status, json: await r.json().catch(() => null) };
}

(async () => {
  const now = Math.floor(Date.now() / 1000);
  const between = await get('fixtures/between', { from: now - 3 * 86400, to: now, per_page: 250 });
  const fixture = between.json?.data?.find((f) => f.status === 'FT' && (f.home_goals + f.away_goals) >= 3);
  const id = fixture?.id;
  console.log('Fixture', id, fixture?.home_name, fixture?.home_goals, '-', fixture?.away_goals, fixture?.away_name);

  const paths = [
    `fixtures/${id}`,
    `fixtures/${id}/events`,
    `fixtures/${id}/goals`,
    `fixtures/${id}/timeline`,
    `fixtures/${id}/incidents`,
    `events/fixture/${id}`,
    `goals/fixture/${id}`,
    `scorers/fixture/${id}`,
    `fixture/${id}/events`,
  ];
  for (const p of paths) {
    const res = await get(p);
    const d = res.json?.data;
    console.log(`\n${p} [${res.status}]`, d ? `count=${d.length}` : res.json?.message || JSON.stringify(res.json)?.slice(0, 120));
    if (d?.[0]) console.log(' sample:', JSON.stringify(d[0], null, 2).slice(0, 600));
    else if (res.json?.data?.[0] === undefined && res.json && !res.json.data) {
      const keys = Object.keys(res.json);
      if (keys.length < 20) console.log(' keys:', keys.join(', '));
    }
  }

  // try include variants on detail
  for (const inc of ['events', 'goals,events', 'scorers', 'match_events', 'timeline,goals']) {
    const res = await get(`fixtures/${id}`, { include: inc });
    const d = res.json?.data?.[0];
    const extra = d ? Object.keys(d).filter((k) => !['id','home_name','away_name','status'].includes(k) && (k.includes('event') || k.includes('goal') || k.includes('scorer') || k.includes('timeline') || k.includes('incident'))) : [];
    if (extra.length) console.log(`include=${inc}:`, extra, JSON.stringify(d[extra[0]])?.slice(0, 200));
  }

  // search meta or docs endpoint
  for (const p of ['meta', 'endpoints', 'docs']) {
    const res = await get(p);
    console.log(`\n${p}:`, res.status, JSON.stringify(res.json)?.slice(0, 200));
  }
})();
