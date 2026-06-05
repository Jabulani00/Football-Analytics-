import type { StandingRow } from '@/mock/matchData';
import { getStandingsForLeague } from '@/mock/standingsData';

export type TopScorer = {
  rank: number;
  player: string;
  team: string;
  goals: number;
  assists: number;
};

export type FormRow = {
  team: string;
  last5: ('W' | 'D' | 'L')[];
  points: number;
};

export type TrendRow = {
  label: string;
  pct: number;
};

export type LeagueOddsRow = {
  fixture: string;
  kickoff: string;
  home: string;
  draw: string;
  away: string;
};

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function deriveHomeStandings(rows: StandingRow[]): StandingRow[] {
  return [...rows]
    .map((r) => ({
      ...r,
      played: Math.max(12, Math.floor(r.played / 2)),
      won: Math.max(0, r.won - 2),
      points: Math.max(0, r.points - 15),
      gf: Math.max(0, r.gf - 20),
      ga: Math.max(0, r.ga - 10),
      gd: 0,
    }))
    .map((r) => ({ ...r, gd: r.gf - r.ga }))
    .sort((a, b) => b.points - a.points)
    .map((r, i) => ({ ...r, pos: i + 1 }));
}

function deriveAwayStandings(rows: StandingRow[]): StandingRow[] {
  return [...rows]
    .map((r) => ({
      ...r,
      played: Math.max(12, Math.floor(r.played / 2)),
      won: Math.max(0, Math.floor(r.won * 0.7)),
      points: Math.max(0, r.points - 22),
      gf: Math.max(0, r.gf - 25),
      ga: Math.max(0, r.ga - 8),
    }))
    .map((r) => ({ ...r, gd: r.gf - r.ga }))
    .sort((a, b) => b.points - a.points)
    .map((r, i) => ({ ...r, pos: i + 1 }));
}

function deriveArchived(rows: StandingRow[]): StandingRow[] {
  return rows.map((r) => ({
    ...r,
    played: r.played - 4,
    points: Math.max(0, r.points - 8),
    pos: r.pos + (hash(r.team) % 2 === 0 ? 1 : -1),
  })).sort((a, b) => a.pos - b.pos).map((r, i) => ({ ...r, pos: i + 1 }));
}

const TOP_SCORERS: Record<string, TopScorer[]> = {
  epl: [
    { rank: 1, player: 'Haaland', team: 'Man City', goals: 21, assists: 5 },
    { rank: 2, player: 'Salah', team: 'Liverpool', goals: 18, assists: 12 },
    { rank: 3, player: 'Palmer', team: 'Chelsea', goals: 15, assists: 8 },
    { rank: 4, player: 'Saka', team: 'Arsenal', goals: 14, assists: 9 },
    { rank: 5, player: 'Watkins', team: 'Aston Villa', goals: 13, assists: 6 },
  ],
  spl: [
    { rank: 1, player: 'Kyogo', team: 'Celtic', goals: 16, assists: 4 },
    { rank: 2, player: 'Dessers', team: 'Rangers', goals: 14, assists: 3 },
    { rank: 3, player: 'Shankland', team: 'Dundee', goals: 11, assists: 2 },
  ],
};

export function getTopScorers(leagueId: string): TopScorer[] {
  const base = TOP_SCORERS[leagueId];
  if (base) return base;
  const standings = getStandingsForLeague(leagueId);
  return standings.slice(0, 5).map((t, i) => ({
    rank: i + 1,
    player: `Player ${i + 1}`,
    team: t.team,
    goals: 12 - i * 2,
    assists: 4 - i,
  }));
}

export function getLeagueForm(leagueId: string): FormRow[] {
  return getStandingsForLeague(leagueId).slice(0, 10).map((t) => ({
    team: t.team,
    last5: t.form,
    points: t.form.reduce((acc, f) => acc + (f === 'W' ? 3 : f === 'D' ? 1 : 0), 0),
  }));
}

export function getOverUnderTrends(leagueId: string): TrendRow[] {
  const s = hash(leagueId);
  return [
    { label: 'Over 2.5', pct: 52 + (s % 12) },
    { label: 'Over 3.5', pct: 28 + (s % 8) },
    { label: 'Under 2.5', pct: 48 - (s % 10) },
    { label: 'Under 3.5', pct: 72 - (s % 6) },
    { label: 'BTTS Yes', pct: 54 + (s % 10) },
  ];
}

export function getHtFtTrends(leagueId: string): TrendRow[] {
  const s = hash(leagueId);
  return [
    { label: 'Win / Win', pct: 18 + (s % 6) },
    { label: 'Draw / Draw', pct: 8 + (s % 4) },
    { label: 'Draw / Win', pct: 12 + (s % 5) },
    { label: 'Lose / Win', pct: 6 + (s % 3) },
    { label: 'Win / Draw', pct: 10 + (s % 4) },
  ];
}

export function getLeagueOddsOverview(
  leagueId: string,
  fixtures: { homeTeam: { name: string }; awayTeam: { name: string }; kickoff: string; odds: { home: string; draw: string; away: string } }[],
): LeagueOddsRow[] {
  return fixtures
    .filter((f) => f)
    .slice(0, 8)
    .map((f) => ({
      fixture: `${f.homeTeam.name} vs ${f.awayTeam.name}`,
      kickoff: f.kickoff,
      home: f.odds.home,
      draw: f.odds.draw,
      away: f.odds.away,
    }));
}

export function getStandingsBundle(leagueId: string) {
  const current = getStandingsForLeague(leagueId);
  return {
    currentOverall: current,
    currentHome: deriveHomeStandings(current),
    currentAway: deriveAwayStandings(current),
    archivedOverall: deriveArchived(current),
    optaNote: 'Comparison vs Opta expected standing — variance shown in position delta',
  };
}
