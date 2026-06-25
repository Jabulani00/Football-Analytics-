import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const TOKEN = readFileSync(resolve(__dir, '../.env'), 'utf8').match(/ODDALERTS_TOKEN=(.+)/)?.[1]?.trim();
const get = async (path, params = {}) => {
  const u = new URL(`https://data.oddalerts.com/api/${path}`);
  u.searchParams.set('api_token', TOKEN);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  return (await fetch(u)).json();
};

(async () => {
  const sid = 3567; // WC 2022
  const cid = 1690;
  const stats = await get(`stats/season/${sid}`);
  console.log('WC 2022 teams:', stats.data?.length);
  console.log('sample keys:', Object.keys(stats.data?.[0] || {}).sort().join(', '));
  const withGroup = stats.data?.filter((s) => s.group != null || s.stage != null || s.round != null);
  console.log('with group/stage/round:', withGroup?.length);
  if (stats.data?.[0]) console.log('first team sample:', JSON.stringify(stats.data[0], null, 2).slice(0, 800));

  const now = Math.floor(Date.now() / 1000);
  const fixtures = await get('fixtures/between', {
    from: 1660000000,
    to: 1670000000,
    competitions: cid,
    per_page: 250,
  });
  console.log('\nfixtures count:', fixtures.data?.length);
  const sample = fixtures.data?.[0];
  console.log('fixture keys:', Object.keys(sample || {}).join(', '));
  console.log('sample:', JSON.stringify(sample, null, 2).slice(0, 600));

  // unique competition_name / round / stage fields
  for (const field of ['competition_name', 'round', 'stage', 'group', 'group_name']) {
    const vals = new Set(fixtures.data?.map((f) => f[field]).filter(Boolean));
    if (vals.size) console.log(field, [...vals].slice(0, 20));
  }

  // 2026 WC if exists
  const comps = await get('competitions', { include: 'seasons', per_page: 250 });
  const wc = comps.data?.find((c) => c.id === 1690);
  console.log('\nWC seasons:', wc?.seasons);

  const sid26 = wc?.seasons?.find((s) => s.season_name === '2026')?.season_id;
  if (sid26) {
    const s26 = await get(`stats/season/${sid26}`);
    console.log('WC 2026 teams:', s26.data?.length);
    s26.data?.slice(0, 8).forEach((t) => console.log(' ', t.name, t.points?.total));
  }
})();
