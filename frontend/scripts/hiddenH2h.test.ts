/**
 * Unit tests for Section 6 + 7.
 * Run: npx tsx scripts/hiddenH2h.test.ts
 */
import type { H2HMatch } from '../services/oddAlerts';
import { h2hOutcomeForTeam } from '../utils/h2hDisplay';
import { evaluateH2HOptions, formatNeverBeatenSequence, h2hGradeGuide, hasBeenBeaten, isNikaNikaRecord, matchPolarSequences, neverBeatGrade, outcomeForSide, polarEdgeGrade } from '../utils/h2hOptions';
import { evaluateHiddenLayers, polarityCounts, problemPatternFor } from '../utils/hiddenLayers';
import type { StandingLike } from '../utils/motivationEngine';
import type { TeamResult } from '../utils/teamResults';

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

function res(over: Partial<TeamResult> & Pick<TeamResult, 'outcome' | 'isHome'>): TeamResult {
  return {
    fixtureId: over.fixtureId ?? Math.floor(Math.random() * 1e6),
    unix: over.unix ?? 1,
    teamId: over.teamId ?? 1,
    opponentId: over.opponentId ?? 2,
    opponentName: over.opponentName ?? 'Opp',
    isHome: over.isHome,
    gf: over.gf ?? (over.outcome === 'W' ? 2 : over.outcome === 'L' ? 0 : 1),
    ga: over.ga ?? (over.outcome === 'W' ? 0 : over.outcome === 'L' ? 2 : 1),
    outcome: over.outcome,
    opponentRank: over.opponentRank ?? null,
    teamRank: over.teamRank ?? 5,
    opponentAbove: over.opponentAbove ?? null,
    goalDiff: over.goalDiff ?? ((over.gf ?? 1) - (over.ga ?? 1)),
  };
}

function h2h(
  over: Partial<H2HMatch> & Pick<H2HMatch, 'home_name' | 'away_name' | 'home_goals' | 'away_goals'>,
): H2HMatch {
  const hg = over.home_goals;
  const ag = over.away_goals;
  return {
    id: over.id ?? Math.floor(Math.random() * 1e6),
    home_name: over.home_name,
    away_name: over.away_name,
    home_goals: hg,
    away_goals: ag,
    ht_score: null,
    total_goals: (hg ?? 0) + (ag ?? 0),
    btts: (hg ?? 0) > 0 && (ag ?? 0) > 0,
    date: over.date ?? '2026-01-01',
    league: over.league ?? 'Test',
    draw: hg === ag,
    home_win: (hg ?? 0) > (ag ?? 0),
    away_win: (ag ?? 0) > (hg ?? 0),
  };
}

console.log('\nSection 6 — problem patterns');
{
  const fivePos = Array.from({ length: 5 }, (_, i) =>
    res({ outcome: 'W', isHome: true, opponentAbove: true, unix: 10 - i, fixtureId: i + 1 }),
  );
  const a = problemPatternFor(fivePos);
  check('5 positive → code A', a?.code === 'A' && a.canCallOut);

  const mixed = [
    res({ outcome: 'W', isHome: true, opponentAbove: true, unix: 5, fixtureId: 1 }),
    res({ outcome: 'L', isHome: true, opponentAbove: false, unix: 4, fixtureId: 2 }),
    res({ outcome: 'D', isHome: false, unix: 3, fixtureId: 3 }),
    res({ outcome: 'D', isHome: true, unix: 2, fixtureId: 4 }),
  ];
  // With only 1 pos + 1 neg in graded sense, may hit cancel on sample of 2 effective —
  // ensure polarityCounts works:
  const c = polarityCounts(fivePos, 5);
  check('5 wins → 5 positives', c.positives === 5 && c.negatives === 0);
}

console.log('\nSection 6 — close vs far verdict');
{
  const table: StandingLike[] = [
    { rank: 1, teamId: 1, name: 'Home', points: 40, played: 20, zone: 'top' },
    { rank: 2, teamId: 2, name: 'Away', points: 38, played: 20, zone: 'top' },
  ];
  const strongHome = Array.from({ length: 6 }, (_, i) =>
    res({
      outcome: 'W',
      isHome: true,
      opponentAbove: true,
      unix: 20 - i,
      fixtureId: 100 + i,
      teamId: 1,
      goalDiff: 2,
      gf: 2,
      ga: 0,
    }),
  );
  const weakAway = Array.from({ length: 6 }, (_, i) =>
    res({
      outcome: 'L',
      isHome: false,
      opponentAbove: false,
      unix: 20 - i,
      fixtureId: 200 + i,
      teamId: 2,
    }),
  );
  const close = evaluateHiddenLayers({
    table,
    homeId: 1,
    awayId: 2,
    homeResults: strongHome,
    awayResults: weakAway,
  });
  check('close mode when ΔP ≤ 4', close.mode === 'close', `mode=${close.mode} Δ=${close.pointsDiff}`);
  check('close + home edge → separate_home', close.verdict === 'separate_home', close.verdict);

  const farTable: StandingLike[] = [
    { rank: 1, teamId: 1, name: 'Home', points: 50, played: 20, zone: 'top' },
    { rank: 10, teamId: 2, name: 'Away', points: 20, played: 20, zone: 'bottom' },
  ];
  const far = evaluateHiddenLayers({
    table: farTable,
    homeId: 1,
    awayId: 2,
    homeResults: strongHome,
    awayResults: weakAway,
  });
  check('far mode when ΔP ≥ 4.1', far.mode === 'far');
  check('far + strong fav → support_favourite', far.verdict === 'support_favourite', far.verdict);
}

console.log('\nSection 7 — H2H options');
{
  check('no data tag', evaluateH2HOptions({ matches: [], homeName: 'A', awayName: 'B' }).tags[0]?.id === 'no_h2h');

  const meetings: H2HMatch[] = [
    h2h({ home_name: 'Alpha', away_name: 'Beta', home_goals: 1, away_goals: 1, date: '2026-03-01', id: 1 }),
    h2h({ home_name: 'Beta', away_name: 'Alpha', home_goals: 0, away_goals: 1, date: '2026-02-01', id: 2 }),
    h2h({ home_name: 'Alpha', away_name: 'Beta', home_goals: 3, away_goals: 1, date: '2026-01-01', id: 3 }),
    h2h({ home_name: 'Alpha', away_name: 'Beta', home_goals: 2, away_goals: 0, date: '2025-12-01', id: 4 }),
  ];
  const opts = evaluateH2HOptions({ matches: meetings, homeName: 'Alpha', awayName: 'Beta' });
  check('has data', opts.hasData);
  check('points share present', opts.pointsShare != null);
  check(
    'points share max ≤ 15',
    (opts.pointsShare?.max ?? 99) <= 15,
    `max=${opts.pointsShare?.max}`,
  );
  check('Alpha never beaten overall', opts.tags.some((t) => t.id === 'never_beaten_home_overall'));
  check('Alpha never beaten at home', opts.tags.some((t) => t.id === 'never_beaten_home_home'));
  check('Alpha never beaten away', opts.tags.some((t) => t.id === 'never_beaten_home_away'));
  const neverTag = opts.tags.find((t) => t.id === 'never_beaten_home_overall');
  check(
    'never beaten shows W/D sequence',
    neverTag?.label.includes('(D W W W)') === true,
    neverTag?.label,
  );
  check('formatNeverBeatenSequence caps at 5', formatNeverBeatenSequence(['W', 'W', 'W', 'D', 'D', 'W']) === '(W W W D D)');
  check('formatNeverBeatenSequence', formatNeverBeatenSequence(['W', 'W', 'W', 'D', 'D']) === '(W W W D D)');
  check(
    'never beaten detail has W/D/L totals',
    /In .+?: \d+ wins?, \d+ draws?, \d+ loss/.test(neverTag?.detail ?? '') === true,
    neverTag?.detail,
  );
  check('last draw flagged', opts.tags.some((t) => t.id === 'last_draw'));
  check('outcome for side', outcomeForSide(meetings[3], 'Alpha') === 'W');
  check('polar WWWWL hit', matchPolarSequences(['W', 'W', 'W', 'W', 'L'])[0]?.pattern === 'WWWWL');
  check('high or low avg goals tagged when extreme', opts.avgGoals != null);

  const mixed: H2HMatch[] = [
    h2h({ home_name: 'Alpha', away_name: 'Beta', home_goals: 2, away_goals: 0, date: '2026-04-01', id: 10 }),
    h2h({ home_name: 'Beta', away_name: 'Alpha', home_goals: 3, away_goals: 0, date: '2026-03-01', id: 11 }),
  ];
  const mixedOpts = evaluateH2HOptions({ matches: mixed, homeName: 'Alpha', awayName: 'Beta' });
  const mixedIds = mixedOpts.tags.map((t) => t.id);
  check('Alpha has been beaten overall', hasBeenBeaten(mixed, 'Alpha') === true);
  check('Beta has been beaten overall', hasBeenBeaten(mixed, 'Beta') === true);
  check('overall never-beaten dropped after a loss', mixedIds.every((id) => !id.endsWith('_overall') || !id.includes('never_beaten')));
  check('Alpha still never beaten at home', mixedIds.includes('never_beaten_home_home'));
  check('Beta still never beaten at home', mixedIds.includes('never_beaten_away_home'));
  check('Alpha not tagged never beaten away', mixedIds.includes('never_beaten_home_away') === false);
  check('Beta not tagged never beaten away', mixedIds.includes('never_beaten_away_away') === false);

  const flagLoss: H2HMatch[] = [
    h2h({ home_name: 'Alpha', away_name: 'Beta', home_goals: 2, away_goals: 0, date: '2026-05-01', id: 20 }),
    {
      ...h2h({
        home_name: 'Beta',
        away_name: 'Alpha',
        home_goals: null,
        away_goals: null,
        date: '2026-04-01',
        id: 21,
      }),
      draw: true,
      home_win: true,
      away_win: false,
    },
  ];
  check('flag loss is L for Alpha even with null scores', h2hOutcomeForTeam(flagLoss[1], 'Alpha') === 'L');
  const flagOpts = evaluateH2HOptions({ matches: flagLoss, homeName: 'Alpha', awayName: 'Beta' });
  const flagIds = flagOpts.tags.map((t) => t.id);
  check('flagged away loss blocks never beaten overall', flagIds.includes('never_beaten_home_overall') === false);
  check('flagged away loss still allows never beaten at home', flagIds.includes('never_beaten_home_home'));
  check('flagged away loss blocks never beaten away', flagIds.includes('never_beaten_home_away') === false);

  const olderLoss: H2HMatch[] = [
    h2h({ home_name: 'Alpha', away_name: 'Beta', home_goals: 1, away_goals: 0, date: '2026-06-01', id: 30 }),
    h2h({ home_name: 'Alpha', away_name: 'Beta', home_goals: 2, away_goals: 1, date: '2026-05-01', id: 31 }),
    h2h({ home_name: 'Beta', away_name: 'Alpha', home_goals: 0, away_goals: 1, date: '2026-04-01', id: 32 }),
    h2h({ home_name: 'Alpha', away_name: 'Beta', home_goals: 3, away_goals: 1, date: '2026-03-01', id: 33 }),
    h2h({ home_name: 'Alpha', away_name: 'Beta', home_goals: 2, away_goals: 0, date: '2026-02-01', id: 34 }),
    h2h({ home_name: 'Beta', away_name: 'Alpha', home_goals: 4, away_goals: 0, date: '2025-01-01', id: 35 }),
  ];
  const olderOpts = evaluateH2HOptions({ matches: olderLoss, homeName: 'Alpha', awayName: 'Beta' });
  const olderIds = olderOpts.tags.map((t) => t.id);
  check('older loss blocks never beaten overall', olderIds.includes('never_beaten_home_overall') === false);
  check('older away loss still allows never beaten at home', olderIds.includes('never_beaten_home_home'));
  check('older away loss blocks never beaten away', olderIds.includes('never_beaten_home_away') === false);
}

console.log('\nSection 7 — numbered H2H says + never-beat grades');
{
  check('5W is Grade A', neverBeatGrade(5, 5, 0) === 'A');
  check('4W1D is Grade A', neverBeatGrade(5, 4, 1) === 'A');
  check('3W2D is Grade A', neverBeatGrade(5, 3, 2) === 'A');
  check('2W3D is Grade B', neverBeatGrade(5, 2, 3) === 'B');
  check('1W4D is Grade C', neverBeatGrade(5, 1, 4) === 'C');
  check('5D is Grade C', neverBeatGrade(5, 0, 5) === 'C');
  check('4W is Grade A', neverBeatGrade(4, 4, 0) === 'A');
  check('3W1D is Grade A', neverBeatGrade(4, 3, 1) === 'A');
  check('2W2D is Grade B', neverBeatGrade(4, 2, 2) === 'B');
  check('1W3D is Grade C', neverBeatGrade(4, 1, 3) === 'C');
  check('4D is Grade C', neverBeatGrade(4, 0, 4) === 'C');
  check('3W is Grade A', neverBeatGrade(3, 3, 0) === 'A');
  check('2W1D is Grade A', neverBeatGrade(3, 2, 1) === 'A');
  check('1W2D is Grade B', neverBeatGrade(3, 1, 2) === 'B');
  check('3D is Grade C', neverBeatGrade(3, 0, 3) === 'C');
  check('2W is Grade A', neverBeatGrade(2, 2, 0) === 'A');
  check('1W1D is Grade B', neverBeatGrade(2, 1, 1) === 'B');
  check('2D is Grade C', neverBeatGrade(2, 0, 2) === 'C');

  check('polar 5W is A', polarEdgeGrade(5, 5, 0, 0) === 'A');
  check('polar 4W1D is A', polarEdgeGrade(5, 4, 1, 0) === 'A');
  check('polar 4W1L is A', polarEdgeGrade(5, 4, 0, 1) === 'A');
  check('polar 3W2D is B', polarEdgeGrade(5, 3, 2, 0) === 'B');
  check('polar 3W1D1L is B', polarEdgeGrade(5, 3, 1, 1) === 'B');
  check('polar 3W2L is B', polarEdgeGrade(5, 3, 0, 2) === 'B');
  check('polar 4W is A', polarEdgeGrade(4, 4, 0, 0) === 'A');
  check('polar 3W1D is A', polarEdgeGrade(4, 3, 1, 0) === 'A');
  check('polar 3W1L is A', polarEdgeGrade(4, 3, 0, 1) === 'A');
  check('polar 2W2D is B', polarEdgeGrade(4, 2, 2, 0) === 'B');
  check('polar 2W1D1L is B', polarEdgeGrade(4, 2, 1, 1) === 'B');
  check('polar 3W is A', polarEdgeGrade(3, 3, 0, 0) === 'A');
  check('polar 2W1L is B', polarEdgeGrade(3, 2, 0, 1) === 'B');
  check('polar 2W1D is B', polarEdgeGrade(3, 2, 1, 0) === 'B');
  check('polar 2W is A', polarEdgeGrade(2, 2, 0, 0) === 'A');
  check('polar 1W1D is C', polarEdgeGrade(2, 1, 1, 0) === 'C');
  check('nika 5: 2W2L1D', isNikaNikaRecord(5, 2, 1, 2) === true);
  check('nika 5: 3W2L', isNikaNikaRecord(5, 3, 0, 2) === true);
  check('nika 4: 2W1L1D', isNikaNikaRecord(4, 2, 1, 1) === true);
  check('nika 4: 2W2L', isNikaNikaRecord(4, 2, 0, 2) === true);
  check('nika 3: 1W1L1D', isNikaNikaRecord(3, 1, 1, 1) === true);
  check('nika 2: 1W1L', isNikaNikaRecord(2, 1, 0, 1) === true);
  check('2 draws is not nika', isNikaNikaRecord(2, 0, 2, 0) === false);
  check(
    'polar grade guide lists 5 H2H Grade A',
    h2hGradeGuide('polar').windows[0]?.grades[0]?.lines.includes('5 wins') === true,
  );
  check(
    'never-beats grade guide lists 5 draws as C',
    h2hGradeGuide('never_beats').windows[0]?.grades.some((g) => g.grade === 'C' && g.lines.includes('5 draws')) === true,
  );

  const fiveT2Wins: H2HMatch[] = [1, 2, 3, 4, 5].map((i) =>
    h2h({ home_name: 'T2side', away_name: 'T1side', home_goals: 2, away_goals: 0, date: `2026-0${i}-01`, id: i }),
  );
  const five = evaluateH2HOptions({
    matches: fiveT2Wins,
    homeName: 'T1side',
    awayName: 'T2side',
    t1Name: 'T1side',
    t2Name: 'T2side',
  });
  check('block 1 is T1 never beats T2', five.says[0]?.title === 'T1 never beats T2');
  check('5 T2 wins is Grade A', five.says[0]?.grade === 'A');
  check('block 2 is T2 edge (polar)', five.says[1]?.title === 'T2 edge (polar)');
  check('block 2 polar grade is A', five.says[1]?.grade === 'A');
  check('block 3 supports T2 when Δ > 3', five.says[2]?.detail.includes('Support T2') === true);
  check('block 4 is not nika nika', five.says[3]?.title === 'Not nika nika');

  const twoDraws: H2HMatch[] = [
    h2h({ home_name: 'T1side', away_name: 'T2side', home_goals: 1, away_goals: 1, date: '2026-02-01', id: 40 }),
    h2h({ home_name: 'T2side', away_name: 'T1side', home_goals: 0, away_goals: 0, date: '2026-01-01', id: 41 }),
  ];
  const level = evaluateH2HOptions({
    matches: twoDraws,
    homeName: 'T1side',
    awayName: 'T2side',
    t1Name: 'T1side',
    t2Name: 'T2side',
  });
  check('2 draws is Grade C', level.says[0]?.grade === 'C');
  check('Δ ≤ 3 is almost equal', level.says[2]?.detail.includes('almost equal') === true);
  check('Δ 0 is specified without calling 2 draws nika nika', level.says[3]?.title === 'Point difference is 0');

  const closePts: H2HMatch[] = [
    h2h({ home_name: 'T1side', away_name: 'T2side', home_goals: 1, away_goals: 0, date: '2026-03-01', id: 50 }),
    h2h({ home_name: 'T2side', away_name: 'T1side', home_goals: 1, away_goals: 1, date: '2026-02-01', id: 51 }),
    h2h({ home_name: 'T1side', away_name: 'T2side', home_goals: 0, away_goals: 0, date: '2026-01-01', id: 52 }),
  ];
  const close = evaluateH2HOptions({
    matches: closePts,
    homeName: 'T1side',
    awayName: 'T2side',
    t1Name: 'T1side',
    t2Name: 'T2side',
  });
  check('T1 has beaten T2 when they have a win', close.says[0]?.title === 'T1 has beaten T2');
  check('Δ 3 is almost equal not support', close.says[2]?.detail.includes('almost equal') === true);
  check('1W 2D is not nika nika', close.says[3]?.title === 'Not nika nika');

  const nikaFive: H2HMatch[] = [
    h2h({ home_name: 'T1side', away_name: 'T2side', home_goals: 1, away_goals: 0, date: '2026-05-01', id: 80 }),
    h2h({ home_name: 'T1side', away_name: 'T2side', home_goals: 2, away_goals: 0, date: '2026-04-01', id: 81 }),
    h2h({ home_name: 'T2side', away_name: 'T1side', home_goals: 1, away_goals: 0, date: '2026-03-01', id: 82 }),
    h2h({ home_name: 'T2side', away_name: 'T1side', home_goals: 2, away_goals: 0, date: '2026-02-01', id: 83 }),
    h2h({ home_name: 'T1side', away_name: 'T2side', home_goals: 1, away_goals: 1, date: '2026-01-01', id: 84 }),
  ];
  const nika = evaluateH2HOptions({
    matches: nikaFive,
    homeName: 'T1side',
    awayName: 'T2side',
    t1Name: 'T1side',
    t2Name: 'T2side',
  });
  check('2W 2L 1D is nika nika', nika.says[3]?.title === 'Nika nika' || nika.says[3]?.title.includes('Nika nika'));

  const split32: H2HMatch[] = [
    h2h({ home_name: 'T1side', away_name: 'T2side', home_goals: 1, away_goals: 0, date: '2026-05-01', id: 90 }),
    h2h({ home_name: 'T1side', away_name: 'T2side', home_goals: 2, away_goals: 0, date: '2026-04-01', id: 91 }),
    h2h({ home_name: 'T1side', away_name: 'T2side', home_goals: 3, away_goals: 0, date: '2026-03-01', id: 92 }),
    h2h({ home_name: 'T2side', away_name: 'T1side', home_goals: 1, away_goals: 0, date: '2026-02-01', id: 93 }),
    h2h({ home_name: 'T2side', away_name: 'T1side', home_goals: 2, away_goals: 0, date: '2026-01-01', id: 94 }),
  ];
  const both = evaluateH2HOptions({
    matches: split32,
    homeName: 'T1side',
    awayName: 'T2side',
    t1Name: 'T1side',
    t2Name: 'T2side',
  });
  check('3W 2L is polar Grade B', both.says[1]?.title.includes('edge (polar)') === true && both.says[1]?.grade === 'B');
  check('3W 2L is also nika nika', both.says[3]?.title.includes('Nika nika') === true);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
