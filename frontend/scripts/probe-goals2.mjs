import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
let TOKEN = readFileSync(resolve(__dir, '../.env'), 'utf8').match(/ODDALERTS_TOKEN=(.+)/)?.[1]?.trim();
const BASE = 'https://data.oddalerts.com/api';

async function get(path, params = {}) {
  const u = new URL(`${BASE}/${path}`);
  u.searchParams.set('api_token', TOKEN);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  const r = await fetch(u);
  return r.json();
}

(async () => {
  const live = (await get('fixtures/live')).data?.find((f) => f.home_goals > 0 || f.away_goals > 0);
  const id = live?.id || 420547636;
  console.log('id', id, live?.home_name, live?.home_goals, '-', live?.away_goals);

  const includes = [
    'probability,stats,odds,h2h,referee',
    'stats,goal_timing,goals_timing,events,timeline',
    'all',
    'everything',
    'live',
    'details',
    'goal_timing',
    'scorers',
    'players',
  ];
  for (const inc of includes) {
    const d = (await get(`fixtures/${id}`, { include: inc })).data?.[0];
    const keys = Object.keys(d || {}).filter((k) =>
      /goal|event|scorer|timing|incident|timeline|player/i.test(k),
    );
    if (keys.length) console.log('include', inc, ':', keys, keys.map((k) => [k, d[k]]));
  }

  const meta = await get('meta');
  console.log('\nmeta keys:', Object.keys(meta || {}));
  if (meta?.data) console.log('meta.data sample:', JSON.stringify(meta.data).slice(0, 800));
  if (meta?.stats) console.log('meta.stats whitelist count:', meta.stats?.length || Object.keys(meta.stats || {}).length);

  // player fixture with stats
  const pf = await get(`players/fixture/${id}`, { include: 'stats', per_page: 5 });
  if (pf.data?.[0]) {
    console.log('\nplayer with include=stats keys:', Object.keys(pf.data[0]));
    console.log(JSON.stringify(pf.data[0], null, 2).slice(0, 800));
  }

  // deep scan fixture object for nested goal data
  const full = (await get(`fixtures/${id}`, { include: 'probability,stats,odds,h2h,referee' })).data?.[0];
  console.log('\nstats keys with timing:', Object.keys(full?.stats || {}).filter((k) => /goal|time|score/i.test(k)));
  console.log('full stats goal_timing:', full?.stats?.goal_timing);
  
  // stringify and search for "scorer" or "minute"
  const str = JSON.stringify(full);
  for (const term of ['scorer', 'minute', 'goal_time', 'goal_timing', 'assister', 'incident']) {
    if (str.toLowerCase().includes(term)) console.log('FOUND in response:', term);
  }
})();
