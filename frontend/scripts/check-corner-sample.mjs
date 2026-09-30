const BASE = 'https://football-analytics-rose.vercel.app/oddalerts';

async function get(path, params = {}) {
  const url = new URL(BASE);
  url.searchParams.set('path', path);
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== '') url.searchParams.set(key, String(value));
  }
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return JSON.parse(text);
}

const targets = [
  { name: 'Primera Division', country: 'Guatemala' },
  { name: 'J3-League', country: 'Japan' },
];

const comps = [];
const first = await get('competitions', { include: 'seasons', per_page: 250, page: 1 });
comps.push(...first.data);
const pages = Math.min(Number(first.info?.total_pages ?? 1) || 1, 16);
for (let page = 2; page <= pages; page += 1) {
  const env = await get('competitions', { include: 'seasons', per_page: 250, page });
  comps.push(...env.data);
}

function seasonWindow(seasonName) {
  const years = seasonName.match(/\d{4}/g)?.map(Number) ?? [];
  if (years.length >= 2) {
    return {
      from: Math.floor(Date.UTC(years[0], 6, 1) / 1000),
      to: Math.floor(Date.UTC(years[1], 6, 15) / 1000),
    };
  }
  return {
    from: Math.floor(Date.UTC(years[0], 0, 1) / 1000),
    to: Math.floor(Date.UTC(years[0], 11, 31, 23, 59) / 1000),
  };
}

const FINISHED = new Set(['FT', 'AET', 'PEN', 'FT_PEN', 'AWD', 'AWARDED', 'WO', 'AWAITING_UPDATES']);

for (const target of targets) {
  const comp = comps.find((row) => row.name === target.name && row.country === target.country);
  if (!comp) {
    console.log(`MISSING ${target.country} ${target.name}`);
    continue;
  }
  const seasons = comp.seasons ?? [];
  const season = seasons.find((s) => s.season_id === comp.current_season) ?? seasons[0];
  const progress = season?.progress;
  const window = seasonWindow(season.season_name);
  const fixtures = [];
  for (let page = 1; page <= 6; page += 1) {
    const env = await get('fixtures/between', {
      from: window.from,
      to: window.to,
      competitions: comp.id,
      page,
    });
    fixtures.push(...(env.data ?? []));
    if (!env.info?.next_page_url) break;
  }
  const finished = fixtures
    .filter((fx) => FINISHED.has(fx.status) && fx.home_goals != null)
    .sort((a, b) => b.unix - a.unix)
    .slice(0, 10);
  const boxes = [];
  for (const fx of finished) {
    const detail = await get(`fixtures/${fx.id}`, { include: 'stats' });
    const row = detail.data?.[0];
    const stats = row?.stats ?? null;
    const home = stats?.home_corners;
    const away = stats?.away_corners;
    boxes.push({
      id: fx.id,
      home: fx.home_name,
      away: fx.away_name,
      homeCorners: typeof home === 'number' ? home : null,
      awayCorners: typeof away === 'number' ? away : null,
    });
  }
  const counted = boxes.filter((row) => row.homeCorners != null && row.awayCorners != null);
  const totals = counted.map((row) => row.homeCorners + row.awayCorners);
  const sum = totals.reduce((a, b) => a + b, 0);
  const over = totals.filter((n) => n > 9.5).length;
  const appearances = new Map();
  for (const row of counted) {
    appearances.set(row.home, (appearances.get(row.home) ?? 0) + 1);
    appearances.set(row.away, (appearances.get(row.away) ?? 0) + 1);
  }
  const counts = [...appearances.values()];
  console.log(
    JSON.stringify({
      league: comp.name,
      country: comp.country,
      progress,
      sampledFixtures: finished.length,
      withCorners: counted.length,
      average: counted.length ? Math.round((sum / counted.length) * 10) / 10 : null,
      over95: counted.length ? Math.round((1000 * over) / counted.length) / 10 : null,
      matchTotals: totals,
      teamsAtLeast3: counts.filter((n) => n >= 3).length,
      teamsAtLeast1: counts.length,
      maxTeamGames: counts.length ? Math.max(...counts) : 0,
    }),
  );
}
