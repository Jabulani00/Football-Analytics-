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
  return (await fetch(u)).json();
}

(async () => {
  const comps = [];
  for (let page = 1; page <= 12; page++) {
    const env = await get('competitions', { include: 'seasons', page, per_page: 250 });
    comps.push(...(env.data || []));
    if (!env.info?.next_page_url) break;
  }
  const wc = comps.filter((c) => /world cup/i.test(c.name));
  console.log('World Cup competitions:', wc.length);
  for (const c of wc.slice(0, 30)) {
    console.log(`  id=${c.id} name="${c.name}" country=${c.country?.name || c.country_id} is_cup=${c.is_cup} seasons=${c.seasons?.length}`);
    if (c.seasons?.[0]) console.log('    season sample:', c.seasons[0]);
  }

  const groupComps = comps.filter((c) => /group [a-l]/i.test(c.name) && /world|fifa|wc/i.test(c.name + (c.country?.name || '')));
  console.log('\nGroup-named WC comps:', groupComps.length);
  for (const c of groupComps.slice(0, 20)) {
    console.log(`  id=${c.id} "${c.name}"`);
  }

  // Also search group stage in name
  const gs = comps.filter((c) => /group stage|groups/i.test(c.name));
  console.log('\nGroup stage comps:', gs.length);
  for (const c of gs.slice(0, 15)) console.log(`  ${c.id} "${c.name}"`);

  // Pick a WC season and check stats/season
  const main = wc.find((c) => /^world cup$/i.test(c.name.trim()) || /fifa world cup/i.test(c.name));
  if (main?.seasons?.[0]) {
    const sid = main.seasons[0].id;
    console.log('\nstats/season for', main.name, sid);
    const stats = await get(`stats/season/${sid}`);
    console.log('teams count:', stats.data?.length);
    const sample = stats.data?.[0];
    console.log('sample keys:', Object.keys(sample || {}).join(', '));
    if (sample?.group) console.log('HAS group field:', sample.group);
    // check all for group field
    const withGroup = stats.data?.filter((s) => s.group != null);
    console.log('rows with group:', withGroup?.length);
    if (withGroup?.[0]) console.log('group sample:', withGroup[0].group, withGroup[0].name);
  }

  // try group competition stats
  if (groupComps[0]) {
    const sid = groupComps[0].seasons?.[0]?.id;
    if (sid) {
      const stats = await get(`stats/season/${sid}`);
      console.log(`\n${groupComps[0].name} standings:`, stats.data?.length);
      stats.data?.slice(0, 5).forEach((r) => console.log(' ', r.name, r.points?.total, r.played?.total));
    }
  }
})();
