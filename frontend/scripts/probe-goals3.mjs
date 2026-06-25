import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const TOKEN = readFileSync(resolve(__dir, '../.env'), 'utf8').match(/ODDALERTS_TOKEN=(.+)/)?.[1]?.trim();
const BASE = 'https://data.oddalerts.com/api';

async function get(path, params = {}) {
  const u = new URL(`${BASE}/${path}`);
  u.searchParams.set('api_token', TOKEN);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  const r = await fetch(u);
  const text = await r.text();
  try { return JSON.parse(text); } catch { return { _raw: text.slice(0, 300) }; }
}

(async () => {
  const live = (await get('fixtures/live')).data || [];
  const withGoals = live.filter((f) => (f.home_goals || 0) + (f.away_goals || 0) > 0);
  console.log('live with goals:', withGoals.length);
  const id = withGoals[0]?.id || live[0]?.id;
  if (!id) return;

  const detail = (await get(`fixtures/${id}`, { include: 'probability,stats,odds,h2h,referee' })).data?.[0];
  console.log('FULL DETAIL JSON length', JSON.stringify(detail).length);
  // print any non-standard keys deeply
  function findKeys(obj, prefix = '') {
    if (!obj || typeof obj !== 'object') return;
    for (const [k, v] of Object.entries(obj)) {
      if (/goal|scorer|event|timing|minute|incident|card|corner/i.test(k)) {
        console.log(prefix + k, '=', typeof v === 'object' ? JSON.stringify(v).slice(0, 200) : v);
      }
      if (v && typeof v === 'object' && !Array.isArray(v) && prefix.split('.').length < 4) findKeys(v, prefix + k + '.');
      if (Array.isArray(v) && v.length && typeof v[0] === 'object') {
        const sample = v[0];
        for (const sk of Object.keys(sample)) {
          if (/goal|scorer|event|timing|minute|player/i.test(sk)) {
            console.log(prefix + k + '[].' + sk, JSON.stringify(sample).slice(0, 300));
            break;
          }
        }
      }
    }
  }
  findKeys(detail);

  // try paths from journal / common patterns
  const paths = [
    `fixtures/${id}/stats`,
    `stats/fixture/${id}`,
    `fixture-stats/${id}`,
    `live/fixtures/${id}`,
    `fixtures/live/${id}`,
    `timing/fixture/${id}`,
    `goals/${id}`,
    `events/${id}`,
  ];
  for (const p of paths) {
    const res = await get(p);
    if (res.data?.length || (res.data && typeof res.data === 'object' && Object.keys(res.data).length)) {
      console.log('\nHIT', p, JSON.stringify(res).slice(0, 500));
    }
  }

  // FT game with goals - full dump stats
  const now = Math.floor(Date.now() / 1000);
  const ft = (await get('fixtures/between', { from: now - 86400, to: now })).data?.find(
    (f) => f.status === 'FT' && f.home_goals + f.away_goals >= 4,
  );
  if (ft) {
    const fd = (await get(`fixtures/${ft.id}`, { include: 'stats' })).data?.[0];
    console.log('\nFT game', ft.home_name, ft.home_goals, '-', ft.away_goals, ft.away_name);
    findKeys(fd);
  }
})();
