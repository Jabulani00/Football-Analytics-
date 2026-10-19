import {
  directionOf,
  gradeFor,
  gradeCompetition,
  rankTeams,
  rankMatches,
  nextFixtureForTeam,
  type UpcomingFixtureLite,
} from '../utils/statsArrangement';
import type { TeamStatRow, TeamStatsExport } from '../types/data';

// ---- direction bands (Method 1) ----
if (directionOf(72) !== 'up' || directionOf(50) !== 'mid' || directionOf(12) !== 'down') {
  throw new Error('Direction bands must be 60↑ / 40–59 (m) / <40 ↓.');
}

// ---- the six canonical grades ----
const cases: [number, number, number | null, string | null, boolean][] = [
  [80, 80, 50, 'A', false],
  [80, 50, 50, 'B', true],
  [50, 50, 40, 'C', false], // overall 50 >= league 40 → above average
  [50, 50, 70, 'D', false], // overall 50 < league 70 → below average
  [20, 50, 50, 'E', true],
  [20, 20, 50, 'F', false],
];
for (const [home, overall, league, grade, da] of cases) {
  const got = gradeFor(home, overall, league);
  if ((got?.grade ?? null) !== grade || (got?.da ?? false) !== da) {
    throw new Error(`gradeFor(${home},${overall},${league}) expected ${grade}/${da}, got ${JSON.stringify(got)}`);
  }
}

// A combination the notes do not name must not grade.
if (gradeFor(80, 20, 50) !== null) throw new Error('Home ↑ / Overall ↓ is undefined and must return null.');
if (gradeFor(null, 80, 50) !== null) throw new Error('Missing Home value must return null.');

// ---- grade a competition ----
function row(team: string, teamId: number, sample: number, over25: number): TeamStatRow {
  return { team_name: team, league_id: 'L1', season: '2024/2025', team_id: teamId, sample_size: sample, over25 } as unknown as TeamStatRow;
}
const stats: TeamStatsExport = {
  meta: { tables: 1, statsPerTable: 1 },
  tables: {
    ordinary_ft_overall: [row('Alpha', 1, 10, 80), row('Beta', 2, 3, 80)],
    ordinary_ft_home: [row('Alpha', 1, 6, 80), row('Beta', 2, 2, 80)],
    league_avg_ft_overall: [row('League', 0, 10, 50)],
  },
};
const graded = gradeCompetition(stats, 100, 'Test League');
const alpha = graded.find((t) => t.team === 'Alpha');
if (!alpha || alpha.strong !== 1 || alpha.aCount !== 1 || alpha.strongStats[0]?.key !== 'over25') {
  throw new Error(`Alpha should grade A (strong) on over25: ${JSON.stringify(alpha)}`);
}

// ranking puts the fuller sample first even with equal strong counts
const ranked = rankTeams([graded]);
if (ranked[0].team !== 'Alpha') throw new Error('Thin-sample Beta must rank below Alpha.');

// ---- match linking ----
const fixtures: UpcomingFixtureLite[] = [
  { id: 9, kickoffUnix: 2000, kickoff: 'Sat', competition: 'Test League', homeId: 1, homeName: 'Alpha', awayId: 2, awayName: 'Beta' },
  { id: 8, kickoffUnix: 1000, kickoff: 'Fri', competition: 'Test League', homeId: 2, homeName: 'Beta', awayId: 1, awayName: 'Alpha' },
];
const matches = rankMatches(ranked, fixtures);
if (matches.length !== 2 || matches[0].home == null) throw new Error('Both fixtures should link to graded teams.');
const next = nextFixtureForTeam(alpha, fixtures);
if (!next || next.fixture.id !== 8 || next.side !== 'away' || next.opponent !== 'Beta') {
  throw new Error(`Alpha's next fixture should be the earlier away game vs Beta: ${JSON.stringify(next)}`);
}

console.log('✓ Stats Arrangement grades A–F, ranks teams, and links upcoming fixtures.');
