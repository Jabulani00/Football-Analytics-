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
  const cid = 1690;
  const sid = 1035503; // 2026
  const all = [];
  for (let page = 1; page <= 8; page++) {
    const env = await get('fixtures/between', {
      from: 1740000000,
      to: 1790000000,
      competitions: cid,
      page,
      per_page: 250,
    });
    all.push(...(env.data || []));
    if (!env.info?.next_page_url) break;
  }
  const wc = all.filter((f) => f.season_id === sid);
  console.log('WC 2026 fixtures:', wc.length, 'FT:', wc.filter((f) => f.status === 'FT').length);

  // positions in fixtures
  const pos = wc.filter((f) => f.home_position != null).slice(0, 5);
  console.log('position sample:', pos.map((f) => `${f.home_name}(${f.home_position}) v ${f.away_name}(${f.away_position})`));

  // build opponent graph for FT group-looking games (3 games per team in group)
  const ft = wc.filter((f) => f.status === 'FT' && f.home_goals != null);
  const teamOpponents = new Map();
  const teamIds = new Map();
  for (const f of ft) {
    const h = f.home_name;
    const a = f.away_name;
    teamIds.set(h, f.home_id);
    teamIds.set(a, f.away_id);
    if (!teamOpponents.has(h)) teamOpponents.set(h, new Set());
    if (!teamOpponents.has(a)) teamOpponents.set(a, new Set());
    teamOpponents.get(h).add(a);
    teamOpponents.get(a).add(h);
  }
  console.log('teams with results:', teamOpponents.size);

  // find connected components of size 4
  const visited = new Set();
  const groups = [];
  for (const team of teamOpponents.keys()) {
    if (visited.has(team)) continue;
    const stack = [team];
    const comp = new Set();
    while (stack.length) {
      const t = stack.pop();
      if (visited.has(t)) continue;
      visited.add(t);
      comp.add(t);
      for (const opp of teamOpponents.get(t) || []) {
        if (!visited.has(opp)) stack.push(opp);
      }
    }
    if (comp.size >= 3) groups.push([...comp].sort());
  }
  groups.sort((a, b) => a[0].localeCompare(b[0]));
  console.log('connected groups:', groups.length);
  groups.forEach((g, i) => console.log(` Group ${i + 1} (${g.length}):`, g.join(', ')));

  // stats points for teams in first group
  const stats = await get(`stats/season/${sid}`);
  const byName = new Map(stats.data.map((s) => [s.name, s]));
  if (groups[0]) {
    console.log('\nstandings data group 1:');
    for (const t of groups[0]) {
      const s = byName.get(t);
      console.log(' ', t, 'pts', s?.points?.total, 'gd', s?.goals_difference?.total, 'played', s?.played?.total);
    }
  }
})();
