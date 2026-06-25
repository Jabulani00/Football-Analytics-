import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
let TOKEN = process.env.EXPO_PUBLIC_ODDALERTS_TOKEN || process.env.ODDALERTS_TOKEN;
if (!TOKEN) {
  try {
    const env = readFileSync(resolve(__dir, '../.env'), 'utf8');
    const m = env.match(/ODDALERTS_TOKEN=(.+)/);
    TOKEN = m?.[1]?.trim();
  } catch {}
}
const BASE = 'https://data.oddalerts.com/api';

async function get(path, params = {}) {
  const u = new URL(`${BASE}/${path}`);
  u.searchParams.set('api_token', TOKEN);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  const r = await fetch(u);
  const text = await r.text();
  try {
    return { status: r.status, json: JSON.parse(text) };
  } catch {
    return { status: r.status, text: text.slice(0, 300) };
  }
}

const BASE_KEYS = new Set([
  'id', 'home_name', 'away_name', 'home_id', 'away_id', 'competition_id',
  'competition_country', 'competition_name', 'competition_type', 'competition_predictability',
  'season', 'season_id', 'status', 'home_goals', 'away_goals', 'ht_score', 'elapsed',
  'elapsed_seconds', 'time_added', 'home_position', 'away_position', 'home_played', 'away_played',
  'venue', 'home_formation', 'away_formation', 'referee_id', 'unix', 'has_odds',
  'is_friendly', 'is_cup', 'date', 'ko_human',
]);

(async () => {
  const live = await get('fixtures/live');
  let fixture = live.json?.data?.find((f) => f.status === 'FT' && f.home_goals != null);
  if (!fixture) {
    const now = Math.floor(Date.now() / 1000);
    const between = await get('fixtures/between', { from: now - 7 * 86400, to: now });
    fixture = between.json?.data?.find((f) => f.status === 'FT' && f.home_goals != null);
  }
  if (!fixture) {
    console.log('No FT fixture found');
    process.exit(1);
  }
  const id = fixture.id;
  console.log('Fixture:', id, fixture.home_name, fixture.home_goals, '-', fixture.away_goals, fixture.away_name);

  const includes = [
    'probability', 'stats', 'odds', 'h2h', 'referee', 'events', 'lineups', 'players',
    'timeline', 'incidents', 'goals', 'cards', 'substitutions', 'commentary',
  ];
  for (const inc of includes) {
    const res = await get(`fixtures/${id}`, { include: inc });
    const d = res.json?.data?.[0];
    const extra = d ? Object.keys(d).filter((k) => !BASE_KEYS.has(k)) : [];
    console.log(`include=${inc}:`, extra.length ? extra.join(', ') : '(no extra)');
  }

  const full = await get(`fixtures/${id}`, {
    include: 'probability,stats,odds,h2h,referee',
  });
  const d = full.json?.data?.[0];
  console.log('\n=== TOP KEYS ===\n', Object.keys(d || {}).sort().join(', '));
  if (d?.stats) console.log('\nSTATS:\n', Object.keys(d.stats).sort().join(', '));
  if (d?.probability) console.log('\nPROB:\n', Object.keys(d.probability).sort().join(', '));
  if (d?.odds) {
    for (const [market, vals] of Object.entries(d.odds)) {
      console.log(`ODDS ${market}:`, Object.keys(vals).join(', '));
    }
  }
  if (d?.h2h?.[0]) console.log('\nH2H sample:\n', JSON.stringify(d.h2h[0], null, 2));

  // players/fixture
  const players = await get(`players/fixture/${id}`, { per_page: 5 });
  if (players.json?.data?.[0]) {
    console.log('\nPLAYER sample keys:', Object.keys(players.json.data[0]).join(', '));
    console.log(JSON.stringify(players.json.data[0], null, 2));
  }

  // try stats/season for fixture season
  if (fixture.season_id) {
    const season = await get(`stats/season/${fixture.season_id}`);
    const row = season.json?.data?.[0];
    if (row) console.log('\nSEASON STAT keys:', Object.keys(row).sort().join(', '));
  }

  // meta or other endpoints
  for (const path of ['meta', 'bookmakers', 'value/upcoming']) {
    const res = await get(path);
    console.log(`\n${path} status=${res.status} count=${res.json?.data?.length ?? 'n/a'}`);
    if (res.json?.data?.[0]) console.log(' sample keys:', Object.keys(res.json.data[0]).slice(0, 15).join(', '));
  }
})();
