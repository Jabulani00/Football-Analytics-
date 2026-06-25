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

function buildGroupsFromFixtures(fixtures) {
  const teamMeta = new Map();
  const edges = new Map();

  for (const f of fixtures) {
    if (f.status !== 'FT' && f.status !== 'LIVE' && f.status !== 'HT' && f.status !== '1H' && f.status !== '2H')
      continue;
    const h = f.home_name;
    const a = f.away_name;
    teamMeta.set(h, { id: f.home_id, name: h });
    teamMeta.set(a, { id: f.away_id, name: a });
    if (!edges.has(h)) edges.set(h, new Set());
    if (!edges.has(a)) edges.set(a, new Set());
    edges.get(h).add(a);
    edges.get(a).add(h);
  }

  const visited = new Set();
  const components = [];
  for (const team of edges.keys()) {
    if (visited.has(team)) continue;
    const stack = [team];
    const comp = [];
    while (stack.length) {
      const t = stack.pop();
      if (visited.has(t)) continue;
      visited.add(t);
      comp.push(t);
      for (const opp of edges.get(t) || []) {
        if (!visited.has(opp)) stack.push(opp);
      }
    }
    if (comp.length >= 2) components.push(comp.sort());
  }
  components.sort((a, b) => a[0].localeCompare(b[0]));
  return { components, teamMeta };
}

function computeGroupStandings(groupTeams, fixtures) {
  const names = new Set(groupTeams);
  const rows = new Map();
  for (const t of groupTeams) {
    const meta = fixtures.find((f) => f.home_name === t || f.away_name === t);
    const id = meta?.home_name === t ? meta.home_id : meta?.away_id;
    rows.set(t, {
      teamId: id ?? 0,
      name: t,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      points: 0,
    });
  }

  for (const f of fixtures) {
    if (f.status !== 'FT' || f.home_goals == null || f.away_goals == null) continue;
    if (!names.has(f.home_name) || !names.has(f.away_name)) continue;
    const h = rows.get(f.home_name);
    const a = rows.get(f.away_name);
    h.played++;
    a.played++;
    h.goalsFor += f.home_goals;
    h.goalsAgainst += f.away_goals;
    a.goalsFor += f.away_goals;
    a.goalsAgainst += f.home_goals;
    if (f.home_goals > f.away_goals) {
      h.won++;
      h.points += 3;
      a.lost++;
    } else if (f.home_goals < f.away_goals) {
      a.won++;
      a.points += 3;
      h.lost++;
    } else {
      h.drawn++;
      a.drawn++;
      h.points++;
      a.points++;
    }
  }

  return [...rows.values()]
    .map((r) => ({ ...r, goalDiff: r.goalsFor - r.goalsAgainst }))
    .sort((x, y) => y.points - x.points || y.goalDiff - x.goalDiff || y.goalsFor - x.goalsFor);
}

(async () => {
  const now = Math.floor(Date.now() / 1000);
  const all = [];
  for (let page = 1; page <= 4; page++) {
    const env = await get('fixtures/between', {
      from: now - 60 * 86400,
      to: now + 90 * 86400,
      competitions: 1690,
      page,
      per_page: 250,
    });
    all.push(...(env.data || []).filter((f) => f.season_id === 1035503));
    if (!env.info?.next_page_url) break;
  }
  console.log('fixtures', all.length);
  const { components } = buildGroupsFromFixtures(all);
  console.log('groups found:', components.length, 'sizes:', components.map((c) => c.length).join(','));

  const letters = 'ABCDEFGHIJKL';
  components.forEach((teams, i) => {
    const standings = computeGroupStandings(teams, all);
    console.log(`\nGroup ${letters[i] || i + 1}`);
    standings.forEach((r, j) =>
      console.log(`  ${j + 1}. ${r.name} ${r.played}P ${r.points}pts GD${r.goalDiff > 0 ? '+' : ''}${r.goalDiff}`),
    );
  });
})();
