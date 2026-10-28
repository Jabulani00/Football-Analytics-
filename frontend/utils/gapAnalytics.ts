import type { RawFixture } from '@/services/oddAlerts';
import { parseScorePair } from '@/utils/matchDetailDisplay';

export type TeamGameCount = { team: string; home: number; away: number };
const COMPLETED_STATUSES = new Set(['FT', 'AET', 'PEN', 'FT_PEN', 'AWD', 'AWARDED', 'WO', 'AWAITING_UPDATES']);

export type GapPeriod = 'fulltime' | 'firsthalf' | 'secondhalf';
export type GapMarket = 'scored' | 'conceded' | 'win' | 'draw' | 'loss' | 'btts' | 'over15' | 'over25' | 'over35';
export type GapRate = { games: number; hits: number; percent: number | null };
export type GapTeamAnalysis = { team: string; home: GapRate; away: GapRate; overall: GapRate; gap: number | null };
export const GAP_MARKETS: { key: GapMarket; label: string }[] = [
  { key: 'scored', label: 'Team scored' }, { key: 'conceded', label: 'Team conceded' },
  { key: 'win', label: 'Team win' }, { key: 'draw', label: 'Draw' }, { key: 'loss', label: 'Team loss' },
  { key: 'btts', label: 'Both teams scored' }, { key: 'over15', label: 'Over 1.5 total goals' },
  { key: 'over25', label: 'Over 2.5 total goals' }, { key: 'over35', label: 'Over 3.5 total goals' },
];

function qualifies(market: GapMarket, gf: number, ga: number): boolean {
  const total = gf + ga;
  switch (market) {
    case 'scored': return gf > 0;
    case 'conceded': return ga > 0;
    case 'win': return gf > ga;
    case 'draw': return gf === ga;
    case 'loss': return gf < ga;
    case 'btts': return gf > 0 && ga > 0;
    case 'over15': return total > 1;
    case 'over25': return total > 2;
    case 'over35': return total > 3;
  }
}

/** Match counts and qualifying-game rates by team, venue, market and scoring period. */
export function analyzeTeamGames(fixtures: RawFixture[], period: GapPeriod, market: GapMarket): GapTeamAnalysis[] {
  type Acc = { team: string; home: { games: number; hits: number }; away: { games: number; hits: number } };
  const teams = new Map<string, Acc>();
  const seen = new Set<number>();
  const ensure = (id: number | null, name: string): Acc => {
    const key = id == null ? `name:${name.trim().toLowerCase()}` : `id:${id}`;
    let row = teams.get(key);
    if (!row) { row = { team: name, home: { games: 0, hits: 0 }, away: { games: 0, hits: 0 } }; teams.set(key, row); }
    return row;
  };
  for (const fixture of fixtures) {
    if (seen.has(fixture.id) || !COMPLETED_STATUSES.has(String(fixture.status).toUpperCase()) || fixture.home_goals == null || fixture.away_goals == null) continue;
    let home = fixture.home_goals; let away = fixture.away_goals;
    if (period !== 'fulltime') {
      const ht = parseScorePair(fixture.ht_score);
      if (!ht) continue; // Half rates use only games with a reliable HT score.
      if (period === 'firsthalf') { home = ht.home; away = ht.away; }
      else { home = Math.max(0, fixture.home_goals - ht.home); away = Math.max(0, fixture.away_goals - ht.away); }
    }
    seen.add(fixture.id);
    const h = ensure(fixture.home_id, fixture.home_name); h.home.games++; if (qualifies(market, home, away)) h.home.hits++;
    const a = ensure(fixture.away_id, fixture.away_name); a.away.games++; if (qualifies(market, away, home)) a.away.hits++;
  }
  const rate = (games: number, hits: number): GapRate => ({ games, hits, percent: games ? hits * 100 / games : null });
  return [...teams.values()].map((t) => {
    const overall = rate(t.home.games + t.away.games, t.home.hits + t.away.hits);
    const home = rate(t.home.games, t.home.hits); const away = rate(t.away.games, t.away.hits);
    return { team: t.team, home, away, overall, gap: home.percent == null || away.percent == null ? null : Math.abs(home.percent - away.percent) };
  }).sort((a, b) => (b.gap ?? -1) - (a.gap ?? -1) || a.team.localeCompare(b.team));
}

/** Count completed league fixtures for every team's home and away side. */
export function countTeamHomeAwayGames(fixtures: RawFixture[]): TeamGameCount[] {
  const teams = new Map<string, TeamGameCount>();
  const seenFixtures = new Set<number>();
  const ensure = (id: number | null, name: string): TeamGameCount => {
    const key = id == null ? `name:${name.trim().toLowerCase()}` : `id:${id}`;
    let row = teams.get(key);
    if (!row) {
      row = { team: name, home: 0, away: 0 };
      teams.set(key, row);
    }
    return row;
  };

  for (const fixture of fixtures) {
    if (seenFixtures.has(fixture.id) || !COMPLETED_STATUSES.has(String(fixture.status).toUpperCase())) continue;
    seenFixtures.add(fixture.id);
    ensure(fixture.home_id, fixture.home_name).home += 1;
    ensure(fixture.away_id, fixture.away_name).away += 1;
  }

  return Array.from(teams.values()).sort((a, b) => a.team.localeCompare(b.team));
}
