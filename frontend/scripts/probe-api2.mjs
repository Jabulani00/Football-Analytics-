import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
let TOKEN = process.env.EXPO_PUBLIC_ODDALERTS_TOKEN;
try {
  const env = readFileSync(resolve(__dir, '../.env'), 'utf8');
  TOKEN = env.match(/ODDALERTS_TOKEN=(.+)/)?.[1]?.trim() || TOKEN;
} catch {}
const BASE = 'https://data.oddalerts.com/api';

async function get(path, params = {}) {
  const u = new URL(`${BASE}/${path}`);
  u.searchParams.set('api_token', TOKEN);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  const r = await fetch(u);
  return r.json();
}

(async () => {
  const now = Math.floor(Date.now() / 1000);
  const between = await get('fixtures/between', { from: now - 3 * 86400, to: now, per_page: 250 });
  const rich = between.data
    ?.filter((f) => f.status === 'FT' && f.home_goals != null && (f.home_goals + f.away_goals) >= 3)
    .sort((a, b) => (b.competition_name?.includes('Premier') ? 1 : 0) - (a.competition_name?.includes('Premier') ? 1 : 0))[0];

  const id = rich?.id || between.data?.find((f) => f.status === 'FT')?.id;
  console.log('Rich fixture:', id, rich?.competition_name, rich?.home_name, rich?.home_goals, '-', rich?.away_goals, rich?.away_name);

  const d = (await get(`fixtures/${id}`, { include: 'probability,stats,odds,h2h,referee' })).data[0];
  console.log('\nFull stats sample values:');
  for (const k of Object.keys(d.stats || {}).sort()) {
    const v = d.stats[k];
    if (v != null && v !== 0) console.log(`  ${k}: ${v}`);
  }

  console.log('\nwinning_team:', d.winning_team);
  console.log('season_progress:', d.season_progress);

  // Check live fixture
  const live = (await get('fixtures/live')).data?.[0];
  if (live) {
    const ld = (await get(`fixtures/${live.id}`, { include: 'stats,probability' })).data[0];
    console.log('\nLIVE fixture stats keys with values:', Object.entries(ld.stats || {}).filter(([,v]) => v != null).map(([k,v]) => `${k}=${v}`).join(', '));
  }

  // value/upcoming sample
  const val = (await get('value/upcoming')).data?.[0];
  console.log('\nvalue/upcoming keys:', Object.keys(val || {}).join(', '));
  console.log(JSON.stringify(val, null, 2).slice(0, 1500));

  // odds/latest
  const oddsLatest = await get('odds/latest');
  console.log('\nodds/latest count:', oddsLatest.data?.length);
  if (oddsLatest.data?.[0]) console.log('sample:', JSON.stringify(oddsLatest.data[0], null, 2).slice(0, 800));

  // teams endpoint?
  for (const p of [`teams/${d.home_id}`, `teams/${d.away_id}`]) {
    try {
      const t = await get(p);
      console.log(`\n${p} status data:`, t.data?.[0] ? Object.keys(t.data[0]).join(', ') : t);
    } catch (e) {
      console.log(p, 'fail');
    }
  }
})();
