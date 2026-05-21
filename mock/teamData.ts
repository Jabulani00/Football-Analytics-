import { mockFixtures } from '@/mock/fixturesData';

export type PlayerProfile = {
  name: string;
  position: string;
  age: number;
  nationality: string;
  goals?: number;
};

export type Transfer = {
  player: string;
  from: string;
  to: string;
  fee: string;
  type: 'in' | 'out';
};

export type TeamProfile = {
  id: string;
  name: string;
  leagueId: string;
  coach: string;
  squad: PlayerProfile[];
  transfersIn: Transfer[];
  transfersOut: Transfer[];
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function buildSquad(teamName: string): PlayerProfile[] {
  const positions = ['GK', 'DF', 'DF', 'DF', 'DF', 'MF', 'MF', 'MF', 'FW', 'FW', 'FW', 'FW'];
  return positions.map((pos, i) => ({
    name: `${teamName.split(' ')[0]} Player ${i + 1}`,
    position: pos,
    age: 22 + (i % 12),
    nationality: i % 3 === 0 ? 'ENG' : i % 3 === 1 ? 'BRA' : 'FRA',
    goals: pos === 'FW' ? 3 + (i % 8) : undefined,
  }));
}

const teamIndex = new Map<string, TeamProfile>();

function registerTeam(name: string, leagueId: string) {
  const id = slugify(name);
  if (teamIndex.has(id)) return;
  teamIndex.set(id, {
    id,
    name,
    leagueId,
    coach: `${name} Manager`,
    squad: buildSquad(name),
    transfersIn: [
      { player: 'New Signing A', from: 'Ajax', to: name, fee: '£25m', type: 'in' },
      { player: 'Loan Return', from: 'Championship Club', to: name, fee: 'Loan', type: 'in' },
    ],
    transfersOut: [
      { player: 'Departing B', from: name, to: 'La Liga Club', fee: '£18m', type: 'out' },
    ],
  });
}

for (const [leagueId, fixtures] of Object.entries(mockFixtures)) {
  for (const f of fixtures) {
    registerTeam(f.homeTeam.name, leagueId);
    registerTeam(f.awayTeam.name, leagueId);
  }
}

export function getTeamBySlug(slug: string): TeamProfile | undefined {
  return teamIndex.get(slug);
}

export function getTeamSlug(name: string): string {
  return slugify(name);
}

export function getAllTeamSlugs(): { slug: string }[] {
  return [...teamIndex.keys()].map((slug) => ({ slug }));
}
