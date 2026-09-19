/**
 * Power dynamics T1/T2 sector engine.
 * Run: npx tsx scripts/powerDynamics.test.ts
 */
import {
  classifyBaselineLetter,
  colourFromZone,
  currentStreak,
  evaluatePowerDynamics,
  evaluatePositionGap,
  evaluateStreamline,
  positionGapScale,
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
  check(
    'home more pts → T1 is home',
    t1IsHomeSide({ points: 20, rank: 2 }, { points: 10, rank: 8 }) === true,
  );
  check(
    'away more pts → T1 is away',
    t1IsHomeSide({ points: 10, rank: 8 }, { points: 20, rank: 2 }) === false,
  );
  check(
    'equal pts better GD is T1 even if rank is worse',
    t1IsHomeSide({ points: 15, goalDiff: 8, rank: 6 }, { points: 15, goalDiff: 2, rank: 3 }) === true,
  );
  check(
    'equal pts worse GD → T1 is away',
    t1IsHomeSide({ points: 15, goalDiff: 1, rank: 3 }, { points: 15, goalDiff: 9, rank: 6 }) === false,
  );
  check(
    'equal pts and GD → more goals scored is T1',
    t1IsHomeSide(
      { points: 15, goalDiff: 4, goalsFor: 22, rank: 8 },
      { points: 15, goalDiff: 4, goalsFor: 14, rank: 3 },
    ) === true,
  );
  check(
    'equal pts, GD and GF → better rank is T1',
    t1IsHomeSide(
      { points: 15, goalDiff: 4, goalsFor: 14, rank: 3 },
      { points: 15, goalDiff: 4, goalsFor: 14, rank: 6 },
    ) === true,
  );
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

console.log('\nT1 is the better table side (points, then GD, then GF)');
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

  const tied = evaluatePowerDynamics({
    table: [
      row({
        teamId: 1,
        name: 'Home',
        rank: 6,
        zone: 'mid',
        points: 22,
        goalDiff: 9,
        goalsFor: 30,
        played: 12,
      }),
      row({
        teamId: 2,
        name: 'Away',
        rank: 3,
        zone: 'top',
        points: 22,
        goalDiff: 2,
        goalsFor: 24,
        played: 12,
      }),
      row({ teamId: 3, name: 'C', rank: 1, zone: 'top', points: 30, played: 12 }),
    ],
    homeId: 1,
    awayId: 2,
    homeName: 'Home FC',
    awayName: 'Away FC',
    homeResults: [],
    awayResults: [],
  });
  check('equal pts better GD → T1 is home', tied.t1.venue === 'home' && tied.t1.goalDiff === 9);
  check('equal pts worse GD → T2 is away', tied.t2.venue === 'away' && tied.t2.goalDiff === 2);
  check('GD underdog is T2', tied.underdog === 't2');
}

console.log('\nstreamline');
{
  const close = evaluateStreamline({
    t1Points: 18,
    t2Points: 15,
    t1Label: 'T1 (A)',
    t2Label: 'T2 (B)',
  });
  check('ΔP 3 is close', close.close === true && close.delta === 3);
  check('close → both Bateteme', close.t1Stream === 'bateteme' && close.t2Stream === 'bateteme');

  const zidane = evaluateStreamline({
    t1Points: 28,
    t2Points: 14,
    t1Label: 'T1 (A)',
    t2Label: 'T2 (B)',
    h2hMeetings: 4,
    t1H2hWins: 0,
    t2H2hWins: 0,
  });
  check('T1 never beaten T2 → Zidane Law', zidane.t1Stream === 'zidane_law' && zidane.t2Stream === 'zidane_law');
  check('Zidane Law flag', zidane.t1NeverBeatenT2 === true && zidane.t2BeatsT1 === false);

  const bookie = evaluateStreamline({
    t1Points: 22,
    t2Points: 10,
    t1Label: 'T1 (A)',
    t2Label: 'T2 (B)',
    h2hMeetings: 5,
    t1H2hWins: 0,
    t2H2hWins: 3,
  });
  check('T2 beats T1 + T1 never won → Bookie mistake', bookie.t1Stream === 'bookie' && bookie.t2Stream === 'bookie');
  check('Bookie T2 beats T1', bookie.t2BeatsT1 === true && bookie.t1NeverBeatenT2 === true);

  const compliant = evaluateStreamline({
    t1Points: 28,
    t2Points: 10,
    t1Label: 'T1 (A)',
    t2Label: 'T2 (B)',
    t1Ppg: 2.1,
    t2Ppg: 1.2,
    t1Odds: 1.55,
    t2Odds: 5.5,
  });
  check('high T1 PPG + lower T1 odds → compliant', compliant.oddsOutcome === 'compliant' && compliant.t1PpgHigh === true);
  check('compliant stream membership', compliant.inStreams.compliant === true && compliant.t1Stream === 'compliant');

  const nonComp = evaluateStreamline({
    t1Points: 28,
    t2Points: 10,
    t1Label: 'T1 (A)',
    t2Label: 'T2 (B)',
    t1Ppg: 2.1,
    t2Ppg: 1.2,
    t1Odds: 4.2,
    t2Odds: 1.7,
  });
  check('high T1 PPG + higher T1 odds → non-compliant', nonComp.oddsOutcome === 'non_compliant');
}

console.log('\nposition gap analysis (G1 = largest)');
{
  const full22 = evaluatePositionGap({
    tableSize: 22,
    t1Rank: 1,
    t2Rank: 22,
    t1Label: 'T1 (A)',
    t2Label: 'T2 (B)',
  });
  check('22-team 1…22 is G1', full22.grade === 'G1' && full22.span === 22 && full22.gradeIndex === 1);

  const full20 = evaluatePositionGap({
    tableSize: 20,
    t1Rank: 1,
    t2Rank: 20,
    t1Label: 'T1 (A)',
    t2Label: 'T2 (B)',
  });
  check('20-team full table is G1', full20.grade === 'G1' && full20.span === 20);

  const mid = evaluatePositionGap({
    tableSize: 20,
    t1Rank: 2,
    t2Rank: 5,
    t1Label: 'T1 (A)',
    t2Label: 'T2 (B)',
  });
  check('20-team span 4 is G17', mid.grade === 'G17' && mid.span === 4 && mid.gradeIndex === 17);
  check('call is the grade only', mid.call === 'G17');

  const near = evaluatePositionGap({
    tableSize: 20,
    t1Rank: 10,
    t2Rank: 11,
    t1Label: 'T1 (A)',
    t2Label: 'T2 (B)',
  });
  check('20-team neighbours are G19', near.grade === 'G19' && near.gradeIndex === 19);

  const table20: StandingLike[] = Array.from({ length: 20 }, (_, i) =>
    row({
      teamId: i + 1,
      name: `Club ${i + 1}`,
      rank: i + 1,
      points: 60 - i,
      zone: i < 7 ? 'top' : i < 14 ? 'mid' : 'bottom',
    }),
  );
  const live = evaluatePowerDynamics({
    table: table20,
    homeId: 2,
    awayId: 5,
    homeName: 'Two',
    awayName: 'Five',
    homeResults: [],
    awayResults: [],
  });
  check('live T1 is #2', live.t1.rank === 2);
  check('live T2 is #5', live.t2.rank === 5);
  check('live gap is G17', live.positionGap.grade === 'G17' && live.positionGap.span === 4);

  const scale22 = positionGapScale(22);
  check('22-team scale has 21 grades', scale22.length === 21);
  check('22-team G1 gap is 22', scale22[0].grade === 'G1' && scale22[0].span === 22);
  check('22-team last grade is G21 gap 2', scale22[20].grade === 'G21' && scale22[20].span === 2);
  check('20-team G1 gap is 20', positionGapScale(20)[0].span === 20);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
