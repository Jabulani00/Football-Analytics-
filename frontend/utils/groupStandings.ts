import type { RawFixture } from '@/services/oddAlerts';

export type GroupStandingRow = {
  rank: number;
  teamId: number;
  name: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
  /** Top two qualify; third may qualify as best runner-up in some formats. */
  zone: 'qualify' | 'possible' | 'out';
};

export type GroupTable = {
  letter: string;
  teams: string[];
  rows: GroupStandingRow[];
};

const GROUP_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

const STARTED = new Set(['FT', 'LIVE', 'HT', '1H', '2H', 'ET', 'AET', 'FT_PEN', 'PEN']);

/** Main tournaments with a group stage (excludes qualifiers and youth comps). */
export function isGroupStageTournament(competitionName: string): boolean {
  const n = competitionName.trim().toLowerCase();
  if (/qualif|play-off|playoff|play in|u\d{2}|women.*qualif|confederations/i.test(n)) return false;
  if (n === 'world cup' || n === 'world cup women') return true;
  if (n === 'euro' || n === 'euros' || /european championship/.test(n)) return true;
  if (/^copa am[eé]rica$/.test(n)) return true;
  if (n === 'uefa nations league' || n === 'nations league') return true;
  if (n === 'fifa club world cup') return true;
  if (n === 'afc asian cup' || n === 'asian cup') return true;
  if (n === 'africa cup of nations' || n === 'afcon') return true;
  return false;
}

function compareGroupRows(
  a: Omit<GroupStandingRow, 'rank' | 'zone'>,
  b: Omit<GroupStandingRow, 'rank' | 'zone'>,
): number {
  if (b.points !== a.points) return b.points - a.points;
  if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff;
  if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
  return a.name.localeCompare(b.name);
}

function assignGroupZones(rows: Omit<GroupStandingRow, 'rank' | 'zone'>[]): GroupStandingRow[] {
  return rows.map((row, i) => ({
    ...row,
    rank: i + 1,
    zone: i < 2 ? 'qualify' : i === 2 ? 'possible' : 'out',
  }));
}

/** Cluster teams into groups from who has played whom (works for WC 12×4, Euro 6×4, etc.). */
export function clusterTeamsIntoGroups(teamNames: string[], opponents: Map<string, Set<string>>): string[][] {
  const visited = new Set<string>();
  const components: string[][] = [];

  for (const team of teamNames) {
    if (visited.has(team)) continue;
    const stack = [team];
    const comp: string[] = [];
    while (stack.length) {
      const t = stack.pop()!;
      if (visited.has(t)) continue;
      visited.add(t);
      comp.push(t);
      for (const opp of opponents.get(t) ?? []) {
        if (!visited.has(opp)) stack.push(opp);
      }
    }
    if (comp.length >= 2) components.push(comp.sort((a, b) => a.localeCompare(b)));
  }

  components.sort((a, b) => a[0].localeCompare(b[0]));
  return components;
}

function computeGroupStandings(groupTeams: string[], fixtures: RawFixture[]): GroupStandingRow[] {
  const names = new Set(groupTeams);
  const rows = new Map<string, Omit<GroupStandingRow, 'rank' | 'zone'>>();

  for (const t of groupTeams) {
    const fx = fixtures.find((f) => f.home_name === t || f.away_name === t);
    const teamId = fx?.home_name === t ? fx.home_id : fx?.away_id;
    rows.set(t, {
      teamId: teamId ?? 0,
      name: t,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDiff: 0,
      points: 0,
    });
  }

  for (const f of fixtures) {
    if (f.status !== 'FT' || f.home_goals == null || f.away_goals == null) continue;
    if (!names.has(f.home_name) || !names.has(f.away_name)) continue;

    const h = rows.get(f.home_name)!;
    const a = rows.get(f.away_name)!;
    h.played += 1;
    a.played += 1;
    h.goalsFor += f.home_goals;
    h.goalsAgainst += f.away_goals;
    a.goalsFor += f.away_goals;
    a.goalsAgainst += f.home_goals;

    if (f.home_goals > f.away_goals) {
      h.won += 1;
      h.points += 3;
      a.lost += 1;
    } else if (f.home_goals < f.away_goals) {
      a.won += 1;
      a.points += 3;
      h.lost += 1;
    } else {
      h.drawn += 1;
      a.drawn += 1;
      h.points += 1;
      a.points += 1;
    }
  }

  const sorted = [...rows.values()]
    .map((r) => ({ ...r, goalDiff: r.goalsFor - r.goalsAgainst }))
    .sort(compareGroupRows);

  return assignGroupZones(sorted);
}

/**
 * Build labelled group tables (A, B, C…) from season fixtures.
 * Knockout matches are ignored — only intra-group games affect the table.
 */
export function buildGroupTablesFromFixtures(
  fixtures: RawFixture[],
  seasonId?: number | null,
): GroupTable[] {
  const scoped = seasonId
    ? fixtures.filter((f) => f.season_id == null || f.season_id === seasonId)
    : fixtures;

  const opponents = new Map<string, Set<string>>();
  for (const f of scoped) {
    if (!STARTED.has(f.status)) continue;
    const h = f.home_name;
    const a = f.away_name;
    if (!opponents.has(h)) opponents.set(h, new Set());
    if (!opponents.has(a)) opponents.set(a, new Set());
    opponents.get(h)!.add(a);
    opponents.get(a)!.add(h);
  }

  const components = clusterTeamsIntoGroups([...opponents.keys()], opponents);

  return components.map((teams, i) => ({
    letter: GROUP_LETTERS[i] ?? String(i + 1),
    teams,
    rows: computeGroupStandings(teams, scoped),
  }));
}

/** Find the group containing either team id or name. */
export function findGroupForTeams(
  groups: GroupTable[],
  opts: { homeId?: number | null; awayId?: number | null; homeName?: string; awayName?: string },
): GroupTable | null {
  return (
    groups.find((g) =>
      g.rows.some(
        (r) =>
          r.teamId === opts.homeId ||
          r.teamId === opts.awayId ||
          r.name === opts.homeName ||
          r.name === opts.awayName,
      ),
    ) ?? null
  );
}
