/**
 * Singaye model for Importance of 3 points.
 * Run: npx tsx scripts/importanceOf3.test.ts
 */
import {
  dethroneDiff,
  escapeScoreFor,
  evaluateImportanceOf3,
  matchPullRow,
  takeoverDiff,
  type SingayeRead,
} from '../utils/importanceOf3Engine';
import type { StandingLike } from '../utils/motivationEngine';

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function row(rank: number, points: number, played = 20): StandingLike {
  return { rank, teamId: rank, name: `P${rank}`, points, played };
}

function league(points: number[]): StandingLike[] {
  return points.map((pts, i) => row(i + 1, pts));
}

function side(table: StandingLike[], teamId: number, competitionId?: number): SingayeRead {
  const report = evaluateImportanceOf3({
    table,
    t1Id: teamId,
    t2Id: null,
    competitionId: competitionId ?? null,
    seasonProgress: 50,
    formReady: true,
  });
  if (!report.singaye1) throw new Error(`missing singaye ${teamId}`);
  return report.singaye1;
}

console.log('\ntake over / chaser');
{
  check('level after +3 is a take over', takeoverDiff(40, 37) === 0);
  check('passing is a take over', takeoverDiff(40, 38) < 0);
  check('still behind is a chaser', takeoverDiff(40, 30) === 7);

  const level = side(league([40, 37, 30]), 2);
  check('Singaye 2 take over at 0', level.takeover.verdict === 'take_over' && level.takeover.diff === 0);
  check('falls under take over', level.pull.kind === 'take_over');
  check('ahead in number 1 motivates', level.takeover.motivated && level.takeover.aheadTargets.includes('Number 1'));

  const chase = side(league([40, 30, 20]), 2);
  check('gap 7 is a chaser', chase.takeover.verdict === 'chaser' && chase.takeover.diff === 7);
  check('gap above 4 is not motivation', !chase.takeover.motivated);
  check('falls under chaser', chase.pull.kind === 'chaser');
}

console.log('\ndethrone / escape element');
{
  check('tail passing is a dethrone', dethroneDiff(30, 28) === -1);
  check('tail short is positive', dethroneDiff(40, 30) === 7);
  check('escape matrix', escapeScoreFor('comes_short', false) === 0 && escapeScoreFor('comes_short', true) === 5 && escapeScoreFor('dethrone', false) === 4 && escapeScoreFor('dethrone', true) === 10);

  // Ranks 8–9 sit outside number 1 and top 3. No cup/relegation map.
  const plain = league([40, 37, 34, 30, 28, 22, 20, 18, 16, 10]);

  const bare = side(plain, 8);
  check('mid-table dethrone scores 4', bare.dethrone.verdict === 'dethrone' && bare.escape.score === 4, `score=${bare.escape.score}`);

  const short = side(plain, 5);
  check('comes short with no target scores 0', short.dethrone.verdict === 'comes_short' && short.dethrone.diff === 3 && short.escape.score === 0, `diff=${short.dethrone.diff} score=${short.escape.score}`);

  const motivated = side(plain, 3);
  check('comes short inside 4 on a target scores 5', motivated.dethrone.verdict === 'comes_short' && motivated.dethrone.diff === 1 && motivated.escape.score === 5, `diff=${motivated.dethrone.diff} score=${motivated.escape.score}`);

  const taken = side(plain, 2);
  check('dethrone on a target scores 10', taken.dethrone.verdict === 'dethrone' && taken.escape.score === 10);

  const wide = side(league([40, 30, 20]), 2);
  check('target fight outside 4 scores 0', wide.escape.score === 0 && wide.dethrone.diff === 7);
}

console.log('\npull factor kinds');
{
  check('target + imbangi + few games = 10', matchPullRow({ targetAttached: true, imbangi: true, fewerGames: true }) === 1);
  check('target + imbangi = 8', matchPullRow({ targetAttached: true, imbangi: true, fewerGames: false }) === 2);
  check('target + fewer games, imbangi not checked = 6', matchPullRow({ targetAttached: true, imbangi: null, fewerGames: true }) === 3);
  check('target + non imbangi + few games = 4', matchPullRow({ targetAttached: true, imbangi: false, fewerGames: true }) === 4);
  check('target + non imbangi = 4', matchPullRow({ targetAttached: true, imbangi: false, fewerGames: false }) === 5);
  check('no target + few games = 2', matchPullRow({ targetAttached: false, imbangi: false, fewerGames: true }) === 6);
  check('no target + more than 10 games = 0', matchPullRow({ targetAttached: false, imbangi: true, fewerGames: false }) === 7);

  const close = evaluateImportanceOf3({
    table: league([40, 37, 30]),
    t1Id: 2,
    t2Id: null,
    seasonProgress: 50,
    formReady: true,
  }).singaye1;
  check(
    'close take over with many games is Take over 2 and equals 8',
    close?.pull.type === 'Take over 2' && close.pull.equals === 8 && close.pull.detail.startsWith('Target attached + Imbangi'),
    `${close?.pull.type} ${close?.pull.equals}`,
  );

  const late = evaluateImportanceOf3({
    table: league([40, 37, 30]),
    t1Id: 2,
    t2Id: null,
    seasonProgress: 95,
    formReady: true,
  }).singaye1;
  check('same take over with fewer games equals 10', late?.pull.index === 1 && late.pull.equals === 10, `${late?.pull.type} ${late?.pull.equals}`);

  const chasing = evaluateImportanceOf3({
    table: league([40, 30, 20]),
    t1Id: 2,
    t2Id: null,
    seasonProgress: 40,
    formReady: true,
  }).singaye1;
  check('wide chaser on a target equals 4', chasing?.pull.type === 'Chaser 5' && chasing.pull.equals === 4, `${chasing?.pull.type} ${chasing?.pull.equals}`);

  const plain = evaluateImportanceOf3({
    table: league([40, 37, 34, 30, 28, 22, 20, 10, 16, 12]),
    t1Id: 8,
    t2Id: null,
    seasonProgress: 40,
    formReady: true,
  }).singaye1;
  check('chaser with no target and many games equals 0', plain?.pull.index === 7 && plain.pull.equals === 0, `${plain?.pull.type} equals ${plain?.pull.equals} diff ${plain?.takeover.diff}`);
}

console.log('\nrelegation safety and gebe widening');
{
  // Premier League rules: drop starts at 18th in a 20-team table.
  const pts = Array.from({ length: 20 }, (_, i) => 100 - i);
  const safety = side(league(pts), 17, 423);
  check('17th is relegation safety', safety.escape.relegation === 'safety', safety.escape.relegation);
  check('safety line is 18', safety.escape.relegationLine === 18);
  check('safety dethrone is live and scores 10', safety.dethrone.verdict === 'dethrone' && safety.escape.score === 10);

  const dropping = side(league(pts), 18, 423);
  check('18th is escaping relegation', dropping.escape.relegation === 'escaping');

  const leader = side(league([40, 30, 20]), 1);
  check('leader falls under gebe widening', leader.pull.kind === 'gebe_widening' && leader.takeover.verdict === 'none');
  check('win widens the gap by 3', leader.pull.gapNow === 10 && leader.pull.gapAfterWin === 13);
  check('leader wants to widen', leader.pull.widenMotivation);
  check('about 20 games left at 50%', leader.remaining >= 18 && leader.remaining <= 22, `rem=${leader.remaining}`);
}

console.log('\nimbangi fit');
{
  const close = side(league([40, 37, 30]), 2);
  check('ΔP 3 fits Imbangi', close.imbangiAhead?.fits === true && close.imbangiAhead.grade === 'C' && close.imbangiAhead.score === 6, `grade=${close.imbangiAhead?.grade}`);

  const far = side(league([40, 30, 20]), 2);
  check('ΔP 10 does not fit Imbangi', far.imbangiAhead?.fits === false && far.imbangiAhead.grade == null);
}

console.log('\nboth singayes');
{
  const report = evaluateImportanceOf3({
    table: league([40, 37, 34, 30]),
    t1Id: 2,
    t2Id: 3,
    formReady: true,
  });
  check('singaye 1 is T1', report.singaye1?.team.teamId === 2 && report.singaye1.slot === 1);
  check('singaye 2 is T2', report.singaye2?.team.teamId === 3 && report.singaye2.slot === 2);
  check('ahead 2 is singaye 1', report.singaye2?.ahead?.teamId === 2);
  check('tail 1 is singaye 2', report.singaye1?.tail?.teamId === 3);
  check('number 1 and top 3 are listed', report.targets.some((t) => t.label === 'Number 1') && report.targets.some((t) => t.label === 'Top 3'));
  check('unknown league has no cup map', report.zonesMapped === false);
}

console.log('\nfinished lower-league fixture');
{
  const table: StandingLike[] = [];
  for (let rank = 1; rank <= 28; rank++) {
    const points = rank === 11 ? 50 : rank === 16 ? 44 : Math.max(0, 80 - rank * 2);
    table.push({ rank, teamId: 1000 + rank, name: `Side ${rank}`, points, played: 31 });
  }
  const report = evaluateImportanceOf3({
    table,
    t1Id: 1011,
    t2Id: 1016,
    seasonProgress: 93,
    matches: [],
    formReady: true,
  });
  const pointsOf = (read: SingayeRead | null) => (Array.isArray(read?.pull.points) ? read.pull.points.map((p) => p.id) : []);
  check('both sides are on the table', report.singaye1 != null && report.singaye2 != null);
  check('singaye 1 pull points are a list', pointsOf(report.singaye1).join(',') === 'target,imbangi,games', pointsOf(report.singaye1).join(','));
  check('singaye 2 pull points are a list', pointsOf(report.singaye2).join(',') === 'target,imbangi,games', pointsOf(report.singaye2).join(','));
  check('late season still has a pull kind', report.singaye1?.pull.index != null && report.singaye2?.pull.index != null);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
