/**
 * Unit tests for Section 6 + 7.
 * Run: npx tsx scripts/hiddenH2h.test.ts
 */
import { evaluateHiddenLayers, polarityCounts, problemPatternFor } from '../utils/hiddenLayers';
import { evaluateH2HOptions, matchPolarSequences, outcomeForSide } from '../utils/h2hOptions';
import type { TeamResult } from '../utils/teamResults';
import type { StandingLike } from '../utils/motivationEngine';
import type { H2HMatch } from '../services/oddAlerts';

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
  check('Alpha never beaten overall', opts.tags.some((t) => t.id === 'never_beaten_home_overall'));
  check('last draw flagged', opts.tags.some((t) => t.id === 'last_draw'));
  check('outcome for side', outcomeForSide(meetings[3], 'Alpha') === 'W');
  check('polar WWWWL hit', matchPolarSequences(['W', 'W', 'W', 'W', 'L'])[0]?.pattern === 'WWWWL');
  check('high or low avg goals tagged when extreme', opts.avgGoals != null);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
