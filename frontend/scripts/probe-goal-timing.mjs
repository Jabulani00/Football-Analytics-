import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const TOKEN = readFileSync(resolve(__dir, '../.env'), 'utf8').match(/ODDALERTS_TOKEN=(.+)/)?.[1]?.trim();
const get = async (path, params = {}) => {
  const u = new URL(`https://data.oddalerts.com/api/${path}`);
  u.searchParams.set('api_token', TOKEN);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  const r = await fetch(u);
  const t = await r.text();
  try { return { status: r.status, json: JSON.parse(t) }; } catch { return { status: r.status, raw: t.slice(0, 200) }; }
};

(async () => {
  // Live / recent with goals
  const now = Math.floor(Date.now() / 1000);
  let fixtures = [];
  for (const ep of ['fixtures/live', null]) {
    if (ep) {
      const live = (await get(ep)).json?.data || [];
      fixtures.push(...live.filter((f) => (f.home_goals || 0) + (f.away_goals || 0) > 0));
    }
  }
  const between = (await get('fixtures/between', { from: now - 3 * 86400, to: now, per_page: 250 })).json?.data || [];
  fixtures.push(...between.filter((f) => f.status === 'FT' && f.home_goals + f.away_goals >= 2));

  const id = fixtures[0]?.id || 420547636;
  const f = fixtures[0];
  console.log('Probe fixture:', id, f?.home_name, f?.home_goals, '-', f?.away_goals, f?.away_name, f?.status);

  const includes = [
    'stats', 'probability', 'odds', 'h2h', 'referee',
    'goal_timing', 'goals_timing', 'timing', 'goals', 'events', 'live',
    'stats,goal_timing', 'stats,timing', 'stats,goals',
    'probability,stats,odds,h2h,referee,goal_timing',
  ];
  for (const inc of includes) {
    const res = await get(`fixtures/${id}`, { include: inc });
    const d = res.json?.data?.[0];
    if (!d) { console.log('include', inc, 'no data'); continue; }
    const timingKeys = Object.keys(d).filter((k) => /goal|timing|event|minute|scorer/i.test(k));
    if (d.stats) {
      const sk = Object.keys(d.stats).filter((k) => /goal|timing|minute/i.test(k));
      if (sk.length) console.log('include', inc, 'stats:', sk, sk.map((k) => [k, d.stats[k]]));
    }
    if (timingKeys.length) console.log('include', inc, 'top:', timingKeys, timingKeys.map((k) => [k, typeof d[k] === 'object' ? JSON.stringify(d[k]).slice(0,150) : d[k]]));
  }

  // stats/fixture
  const sf = await get(`stats/fixture/${id}`);
  console.log('\nstats/fixture type:', sf.json?.data?.length, 'items');
  if (sf.json?.data?.[0]) {
    const keys = Object.keys(sf.json.data[0]).filter((k) => /goal|timing|minute/i.test(k));
    console.log('timing keys:', keys);
    for (const k of keys.slice(0, 10)) console.log(' ', k, JSON.stringify(sf.json.data[0][k])?.slice(0, 200));
  }

  // try stats/fixture with include
  for (const inc of ['goal_timing', 'timing', 'goals']) {
    const res = await get(`stats/fixture/${id}`, { include: inc });
    const d = res.json?.data?.[0];
    if (d?.goal_timing) console.log('stats/fixture include', inc, 'goal_timing:', JSON.stringify(d.goal_timing).slice(0, 500));
  }

  // dump full fixture with all includes once
  const full = (await get(`fixtures/${id}`, { include: 'probability,stats,odds,h2h,referee' })).json?.data?.[0];
  const str = JSON.stringify(full);
  const idx = str.toLowerCase().indexOf('timing');
  if (idx >= 0) console.log('\nFOUND timing in full response near:', str.slice(Math.max(0, idx - 50), idx + 200));

  // search value/upcoming for corners/timing
  const val = (await get('value/upcoming')).json?.data?.find((v) => v.home_goals > 0);
  if (val) {
    const vk = Object.keys(val).filter((k) => /goal|timing|minute/i.test(k));
    console.log('\nvalue/upcoming keys:', vk, vk.map((k) => [k, val[k]]));
  }
})();
