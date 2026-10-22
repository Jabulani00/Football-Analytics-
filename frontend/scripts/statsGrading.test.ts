import {
  directionOf,
  gradeFor,
  resolveRoman,
  gradeTeamsForStat,
  gradeAllTeamsForStat,
  sortGraded,
  nextFixtureFor,
  indexRowsByTeam,
  lookupRow,
  type UpcomingLite,
} from '../utils/statsGrading';
import type { TeamStatRow, TeamStatsExport } from '../types/data';

// ---- percentage bands: 60↑ / 40–59 mid / <40 ↓, inclusive at the boundaries ----
if (directionOf(60) !== 'up' || directionOf(59) !== 'mid' || directionOf(40) !== 'mid' || directionOf(39) !== 'down') {
  throw new Error('Bands must be 60↑ / 40–59 mid / <40 ↓.');
}

// ---- the six canonical grades from the document ----
const cases: [number, number, number | null, string | null, boolean][] = [
  [80, 80, 50, 'A', false],
  [80, 50, 50, 'B', true],
  [50, 50, 40, 'C', false],
  [50, 50, 70, 'D', false],
  [20, 80, 50, 'E', true], // H↓ & overall↑
  [20, 20, 50, 'F', false],
];
for (const [home, overall, league, grade, da] of cases) {
  const got = gradeFor(home, overall, league);
  if ((got?.grade ?? null) !== grade || (got?.da ?? false) !== da) {
    throw new Error(`gradeFor(${home},${overall},${league}) expected ${grade}/${da}, got ${JSON.stringify(got)}`);
  }
}
if (gradeFor(80, 20, 50) !== null) throw new Error('H↑/overall↓ is undefined and must not grade.');
if (gradeFor(20, 50, 50) !== null) throw new Error('H↓/overall-mid is undefined and must not grade.');

// ---- Roman resolution (source list × letter) ----
if (resolveRoman('strong', 1, 'A') !== 'I') throw new Error('strong 1.A → I');
if (resolveRoman('strong', 2, 'A') !== 'III') throw new Error('strong 2.A → III');
if (resolveRoman('strong', 3, 'A') !== 'VII') throw new Error('strong 3.A → VII');
if (resolveRoman('weak', 1, 'E') !== 'II') throw new Error('weak 1.E → II');
if (resolveRoman('strong', 3, 'F') !== null) throw new Error('strong 3.F is undefined');

// ---- grade a competition for one stat, source list 2 (last 10 & 8 averaged) ----
function row(team: string, teamId: number, sample: number, over25: number): TeamStatRow {
  return { team_name: team, league_id: 'L1', season: '2024/2025', team_id: teamId, sample_size: sample, over25 } as unknown as TeamStatRow;
}
const stats: TeamStatsExport = {
  meta: { tables: 1, statsPerTable: 1 },
  tables: {
    // source 2 windows — Alpha home ↑ both windows, overall ↑ both → A
    last10_ft_overall: [row('Alpha', 1, 10, 80), row('Beta', 2, 10, 50)],
    last8_ft_overall: [row('Alpha', 1, 8, 70), row('Beta', 2, 8, 50)],
    last10_ft_home: [row('Alpha', 1, 6, 80), row('Beta', 2, 6, 20)],
    last8_ft_home: [row('Alpha', 1, 5, 80), row('Beta', 2, 5, 20)],
    league_avg_ft_overall: [row('League', 0, 10, 50)],
  },
};
const graded = gradeTeamsForStat(stats, 2, 'over25', 'Test League');
const alpha = graded.find((t) => t.team === 'Alpha');
const beta = graded.find((t) => t.team === 'Beta');
if (!alpha || alpha.grade !== 'A' || alpha.roman !== 'III' || alpha.direction !== 'strong') {
  throw new Error(`Alpha should be strong A / Grade III on source 2: ${JSON.stringify(alpha)}`);
}
// Beta: home ↓ (avg 20), overall mid (avg 50) → undefined, must not grade.
if (beta) throw new Error('Beta (H↓ / overall-mid) must not be graded.');

// averaging: Alpha overall = mean(80,70)=75 (↑), home = mean(80,80)=80 (↑)
if (Math.round(alpha.overallValue) !== 75 || Math.round(alpha.homeValue) !== 80) {
  throw new Error(`Paired windows must average: got overall ${alpha.overallValue}, home ${alpha.homeValue}`);
}

const sorted = sortGraded(graded);
if (sorted[0].team !== 'Alpha') throw new Error('Sort should lead with the graded team.');

// ---- next fixture + opponent grade lookup ----
const fixtures: UpcomingLite[] = [
  { id: 9, kickoffUnix: 2000, kickoff: 'Sat', competition: 'Test League', homeId: 1, homeName: 'Alpha', awayId: 2, awayName: 'Beta' },
  { id: 8, kickoffUnix: 1000, kickoff: 'Fri', competition: 'Test League', homeId: 2, homeName: 'Beta', awayId: 1, awayName: 'Alpha' },
];
const next = nextFixtureFor(1, 'Alpha', fixtures);
if (!next || next.fixture.id !== 8 || next.side !== 'away' || next.opponentName !== 'Beta' || next.opponentId !== 2) {
  throw new Error(`Alpha's next fixture should be the earlier away game vs Beta: ${JSON.stringify(next)}`);
}
if (nextFixtureFor(99, 'Nobody', fixtures) !== null) throw new Error('A team with no fixture must return null.');

// The opponent (Beta) is ungraded for this stat, so its row exists but grade is null.
const gradeAllRows = gradeAllTeamsForStat(stats, 2, 'over25', 'Test League');
const index = indexRowsByTeam(gradeAllRows);
const oppRow = lookupRow(index, next.opponentId, next.opponentName);
if (!oppRow || oppRow.team !== 'Beta' || oppRow.grade !== null) {
  throw new Error(`Opponent lookup should find Beta with a null grade: ${JSON.stringify(oppRow)}`);
}

console.log('✓ Stats Grading: bands, grades, Roman, averaging, next fixture, and opponent lookup.');
