/**
 * Power dynamics T1/T2 sector engine.
 * Run: npx tsx scripts/powerDynamics.test.ts
 */
import {
  classifyBaselineLetter,
  colourFromZone,
  currentStreak,
  evaluatePowerDynamics,
  evaluateStreamline,
  lastGameFlags,
  mshayiNote,
  neverTwiceInRow,
  ppgAlignsWithColour,
  ppgBandForColour,
  recordFromResults,
  sideLabel,
  t1IsHomeSide,
} from '../utils/powerDynamicsEngine';
import type { TeamResult } from '../utils/teamResults';
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
    htGf: over.htGf ?? null,
    htGa: over.htGa ?? null,
  };
}

function row(
  partial: Partial<StandingLike> & Pick<StandingLike, 'teamId' | 'name' | 'rank'>,
): StandingLike {
  return {
    played: 10,
    points: 15,
    zone: 'mid',
    won: 4,
    drawn: 3,
    lost: 3,
    ...partial,
  };
}

console.log('\nlabels / colour / PPG bands');
{
  check('T1 label', sideLabel('t1', 'Arsenal') === 'T1 (Arsenal)');
  check('T2 label', sideLabel('t2', 'Chelsea') === 'T2 (Chelsea)');
  check('home more pts → T1 is home', t1IsHomeSide(20, 10, 2, 8) === true);
  check('away more pts → T1 is away', t1IsHomeSide(10, 20, 8, 2) === false);
  check('equal pts better rank is T1', t1IsHomeSide(15, 15, 3, 6) === true);
  check('equal pts worse home rank → T1 is away', t1IsHomeSide(15, 15, 8, 3) === false);
  check('top → green', colourFromZone('top') === 'green');
  check('mid → yellow', colourFromZone('mid') === 'yellow');
  check('bottom → red', colourFromZone('bottom') === 'red');

  check('green PPG 0.7 = bad', ppgBandForColour(0.7, 'green') === 'bad');
  check('green PPG 1.0 = good', ppgBandForColour(1.0, 'green') === 'good');
  check('green PPG 1.5 = great against', ppgBandForColour(1.5, 'green') === 'great_against');
  check('red PPG 1.6 = good', ppgBandForColour(1.6, 'red') === 'good');
  check('red PPG 1.8 = great', ppgBandForColour(1.8, 'red') === 'great');
  check('yellow PPG 1.2 = mild', ppgBandForColour(1.2, 'yellow') === 'mild');

  check('green 2.0 aligns', ppgAlignsWithColour(2.0, 'green') === true);
  check('green 0.5 does not align', ppgAlignsWithColour(0.5, 'green') === false);
  check('red 0.8 aligns', ppgAlignsWithColour(0.8, 'red') === true);
  check('red 1.8 does not align', ppgAlignsWithColour(1.8, 'red') === false);

  check('mshayi green low', mshayiNote(0.7, 'green') != null);
  check('mshayi red high', mshayiNote(1.6, 'red') != null);
  check('mshayi yellow silent', mshayiNote(1.2, 'yellow') == null);
}

console.log('\nrecords / last game / streaks');
{
  const games: TeamResult[] = [
    res({ outcome: 'W', isHome: true, gf: 2, ga: 0, htGf: 0, htGa: 0, unix: 9 }),
    res({ outcome: 'W', isHome: false, unix: 8 }),
    res({ outcome: 'L', isHome: true, unix: 7 }),
  ];
  const rec = recordFromResults(games);
  check('3 MP', rec.mp === 3);
  check('2 wins', rec.won === 2);
  check('PPG 2.0', rec.ppg === 2);
  check('PPGa from 1 loss', rec.ppga === 1);

  const flags = lastGameFlags(games[0], 1.2);
  check('last game won active', flags.some((f) => f.id === 'won' && f.active));
  check('last game CS active', flags.some((f) => f.id === 'cs' && f.active));
  check('0-0 HT active', flags.some((f) => f.id === '00_ht' && f.active));
  check('last game BTTS off', flags.some((f) => f.id === 'btts' && !f.active));

  const noHt = lastGameFlags(res({ outcome: 'W', isHome: true, gf: 1, ga: 0 }), 1);
  check('HT blocked without score', noHt.some((f) => f.id === '00_ht' && f.blocked));

  const sixW = Array.from({ length: 6 }, (_, i) => res({ outcome: 'W', isHome: i % 2 === 0, unix: 20 - i }));
  check('win streak 6', currentStreak(sixW, 'W') === 6);
  check('never lost twice on all wins', neverTwiceInRow(sixW, 'L') === true);
  check('never won twice is false', neverTwiceInRow(sixW, 'W') === false);
}

console.log('\nevaluatePowerDynamics T1 vs T2');
{
  const table: StandingLike[] = [
    row({ teamId: 1, name: 'Home', rank: 2, zone: 'top', points: 28, played: 12, won: 9, drawn: 1, lost: 2 }),
    row({ teamId: 2, name: 'Away', rank: 12, zone: 'mid', points: 14, played: 12, won: 3, drawn: 5, lost: 4 }),
    row({ teamId: 3, name: 'C', rank: 1, zone: 'top', points: 30, played: 12 }),
    row({ teamId: 4, name: 'D', rank: 3, zone: 'top', points: 27, played: 12 }),
    row({ teamId: 5, name: 'E', rank: 4, zone: 'top', points: 26, played: 12 }),
    row({ teamId: 6, name: 'F', rank: 5, zone: 'mid', points: 25, played: 12 }),
  ];

  const homeResults: TeamResult[] = [
    res({ outcome: 'W', isHome: true, opponentAbove: false, opponentRank: 12, gf: 3, ga: 0, goalDiff: 3, unix: 10 }),
    res({ outcome: 'W', isHome: true, opponentAbove: false, opponentRank: 11, gf: 2, ga: 0, goalDiff: 2, unix: 9 }),
    res({ outcome: 'W', isHome: false, opponentAbove: true, unix: 8 }),
    res({ outcome: 'D', isHome: true, unix: 7 }),
    res({ outcome: 'W', isHome: true, unix: 6 }),
    res({ outcome: 'W', isHome: true, unix: 5 }),
    res({ outcome: 'L', isHome: false, unix: 4 }),
  ];
  const awayResults: TeamResult[] = [
    res({ outcome: 'L', isHome: false, teamId: 2, unix: 10 }),
    res({ outcome: 'L', isHome: true, teamId: 2, unix: 9 }),
    res({ outcome: 'D', isHome: false, teamId: 2, unix: 8 }),
    res({ outcome: 'W', isHome: false, teamId: 2, opponentAbove: false, opponentRank: 18, gf: 2, ga: 0, goalDiff: 2, unix: 7 }),
  ];

  const pd = evaluatePowerDynamics({
    table,
    homeId: 1,
    awayId: 2,
    homeName: 'Home FC',
    awayName: 'Away FC',
    homeResults,
    awayResults,
    seasonProgress: 40,
  });

  check('T1 label on snapshot', pd.t1.label === 'T1 (Home FC)');
  check('T2 label on snapshot', pd.t2.label === 'T2 (Away FC)');
  check('T1 is fixture home (more points)', pd.t1.venue === 'home');
  check('T2 is fixture away', pd.t2.venue === 'away');
  check('T2 is underdog', pd.underdog === 't2');
  check('ΔP 14', pd.pointsDiff === 14);
  check('not close', pd.closeOnTable === false);
  check('who faces who mentions Green vs Yellow', pd.colour.whoFacesWho.includes('Green') && pd.colour.whoFacesWho.includes('Yellow'));
  check('six PPG types', pd.colour.t1.types.length === 6);
  check('T1 child beater method 1', pd.childBeater.t1.method1 != null);
  check('T1 win streak >= 1', pd.streaks.win.t1.current >= 1);
  check('T2 struggling', pd.struggle.t2.toLowerCase().includes('struggling'));
  check('T1 in top 5 pack', pd.contested.t1InPack === true);
  check('T2 outside pack', pd.contested.t2InPack === false);
  check('home venue sample', pd.venue.t1.homePpg != null);
  check('character original string', pd.character.t1.original.includes('Original'));
  check('middle guys T2 yellow', pd.middle.t2.yellow === true);
  check('T1 baseline letter A (green + above avg)', pd.baselineGap.t1.letter === 'A', `got ${pd.baselineGap.t1.letter}`);
  check('T2 baseline letter D (yellow + below avg)', pd.baselineGap.t2.letter === 'D', `got ${pd.baselineGap.t2.letter}`);
  check('T1 gap score 6, T2 at 0', pd.baselineGap.t1.score === 6 && pd.baselineGap.t2.score === 0);
  check('AD pair Gr 3 supports', pd.baselineGap.pair === 'AD' && pd.baselineGap.grade === 3 && pd.baselineGap.supports === true);
}

console.log('\nbaseline gap A–F');
{
  check('strong + above = A', classifyBaselineLetter('top', 2.0, 1.5) === 'A');
  check('strong + below = B', classifyBaselineLetter('top', 1.2, 1.5) === 'B');
  check('balanced + above = C', classifyBaselineLetter('mid', 1.6, 1.5) === 'C');
  check('balanced + below = D', classifyBaselineLetter('mid', 1.2, 1.5) === 'D');
  check('weak + above = E', classifyBaselineLetter('bottom', 1.6, 1.5) === 'E');
  check('weak + below = F', classifyBaselineLetter('bottom', 0.8, 1.5) === 'F');

  const even: StandingLike[] = [
    row({ teamId: 1, name: 'H', rank: 1, zone: 'top', points: 30, played: 10, won: 10, drawn: 0, lost: 0 }),
    row({ teamId: 2, name: 'A', rank: 10, zone: 'bottom', points: 5, played: 10, won: 1, drawn: 2, lost: 7 }),
    row({ teamId: 3, name: 'C', rank: 5, zone: 'mid', points: 15, played: 10, won: 4, drawn: 3, lost: 3 }),
  ];
  const af = evaluatePowerDynamics({
    table: even,
    homeId: 1,
    awayId: 2,
    homeName: 'Top',
    awayName: 'Bottom',
    homeResults: [],
    awayResults: [],
  });
  check('AF: T1 received 10', af.baselineGap.t1.received === 10);
  check('AF: T2 received 0', af.baselineGap.t2.received === 0);
  check('AF: T1 gap 10, T2 gap 0', af.baselineGap.t1.score === 10 && af.baselineGap.t2.score === 0);
  check('AF pair', af.baselineGap.pair === 'AF');
  check('AF Gr 1', af.baselineGap.grade === 1);

  const same = evaluatePowerDynamics({
    table: [
      row({ teamId: 1, name: 'H', rank: 2, zone: 'top', points: 22, played: 10 }),
      row({ teamId: 2, name: 'A', rank: 3, zone: 'top', points: 21, played: 10 }),
      row({ teamId: 3, name: 'C', rank: 10, zone: 'bottom', points: 5, played: 10 }),
    ],
    homeId: 1,
    awayId: 2,
    homeName: 'One',
    awayName: 'Two',
    homeResults: [],
    awayResults: [],
  });
  check('same letter both at 0', same.baselineGap.t1.score === 0 && same.baselineGap.t2.score === 0);
  check('same letter stronger is level', same.baselineGap.stronger === 'level');
}

console.log('\nT1 is the side with more points');
{
  const table: StandingLike[] = [
    row({ teamId: 1, name: 'Home', rank: 12, zone: 'mid', points: 14, played: 12, won: 3, drawn: 5, lost: 4 }),
    row({ teamId: 2, name: 'Away', rank: 2, zone: 'top', points: 28, played: 12, won: 9, drawn: 1, lost: 2 }),
    row({ teamId: 3, name: 'C', rank: 1, zone: 'top', points: 30, played: 12 }),
  ];
  const swapped = evaluatePowerDynamics({
    table,
    homeId: 1,
    awayId: 2,
    homeName: 'Home FC',
    awayName: 'Away FC',
    homeResults: [res({ outcome: 'L', isHome: true, teamId: 1, unix: 2 })],
    awayResults: [res({ outcome: 'W', isHome: false, teamId: 2, unix: 2 })],
  });
  check('T1 is the away side (28 pts)', swapped.t1.venue === 'away' && swapped.t1.label === 'T1 (Away FC)');
  check('T2 is the home side (14 pts)', swapped.t2.venue === 'home' && swapped.t2.label === 'T2 (Home FC)');
  check('T2 is underdog', swapped.underdog === 't2');
  check('T1 last game is the away team win', swapped.lastGame.t1.some((f) => f.id === 'won' && f.active));
}

console.log('\nstreamline');
{
  const close = evaluateStreamline({
    t1Points: 18,
    t2Points: 15,
    t1Label: 'T1 (A)',
    t2Label: 'T2 (B)',
    t1BaselineScore: 2,
    t2BaselineScore: 0,
  });
  check('ΔP 3 is close', close.close === true && close.delta === 3);
  check('close → both Bateteme', close.t1Stream === 'bateteme' && close.t2Stream === 'bateteme');

  const far = evaluateStreamline({
    t1Points: 28,
    t2Points: 14,
    t1Label: 'T1 (A)',
    t2Label: 'T2 (B)',
    t1BaselineScore: 6,
    t2BaselineScore: 0,
  });
  check('ΔP 14 is far', far.far === true && far.delta === 14);
  check('far + T1 gap backed → Zidanloom', far.t1Stream === 'zidanloom');
  check('far + T2 not backed → Bookie', far.t2Stream === 'bookie');

  const farUnbacked = evaluateStreamline({
    t1Points: 22,
    t2Points: 10,
    t1Label: 'T1 (A)',
    t2Label: 'T2 (B)',
    t1BaselineScore: 0,
    t2BaselineScore: 4,
  });
  check('far T1 without baseline gap → Bookie', farUnbacked.t1Stream === 'bookie');
  check('far T2 with baseline gap → Zidanloom', farUnbacked.t2Stream === 'zidanloom');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
