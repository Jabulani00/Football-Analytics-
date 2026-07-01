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
  return r.json().catch(() => ({}));
};

(async () => {
  const now = Math.floor(Date.now() / 1000);
  const wc = (await get('fixtures/between', {
    from: now - 14 * 86400,
    to: now,
    competitions: 1690,
    per_page: 250,
  })).data?.find((f) => f.status === 'FT' && f.home_goals + f.away_goals >= 3);
  const id = wc?.id;
  console.log('WC fixture', id, wc?.home_name, wc?.home_goals, '-', wc?.away_goals, wc?.away_name);

  const sf = await get(`stats/fixture/${id}`, { include: 'goal_timing' });
  console.log('\nstats/fixture full dump (team 1):');
  console.log(JSON.stringify(sf.data?.[0], null, 2));

  // paths
  for (const p of [
    `goal_timing/fixture/${id}`,
    `fixtures/${id}/goal_timing`,
    `timing/${id}`,
    `goals/timing/${id}`,
    `fixtures/${id}/timing`,
  ]) {
    const r = await get(p);
    if (r.data?.length || (r.data && typeof r.data === 'object' && Object.keys(r.data).length > 1)) {
      console.log('\nHIT', p, JSON.stringify(r).slice(0, 800));
    }
  }

  // fixture detail deep
  const d = (await get(`fixtures/${id}`, { include: 'stats,goal_timing,timing' })).data?.[0];
  console.log('\nfixture extra keys:', Object.keys(d || {}).filter((k) => !['id','home_name'].includes(k)).slice(0, 40));

  // live WC
  const live = (await get('fixtures/live')).data?.find((f) => f.competition_name === 'World Cup' && f.home_goals + f.away_goals > 0);
  if (live) {
    console.log('\nLIVE WC', live.id, live.home_name, live.home_goals, '-', live.away_goals);
    const ld = (await get(`fixtures/${live.id}`, { include: 'stats,goal_timing,timing,goals' })).data?.[0];
    const keys = Object.keys(ld || {});
    console.log('live keys:', keys.join(', '));
    if (ld.goal_timing) console.log('goal_timing:', JSON.stringify(ld.goal_timing));
    if (ld.timing) console.log('timing:', JSON.stringify(ld.timing));
    if (ld.goals) console.log('goals:', JSON.stringify(ld.goals).slice(0, 500));
    const lsf = await get(`stats/fixture/${live.id}`, { include: 'goal_timing' });
    console.log('live stats/fixture goal_timing_for:', JSON.stringify(lsf.data?.[0]?.goal_timing_for)?.slice(0, 500));
  }

  // search meta endpoint
  const meta = await get('meta');
  console.log('\nmeta sample:', JSON.stringify(meta).slice(0, 400));
})();
