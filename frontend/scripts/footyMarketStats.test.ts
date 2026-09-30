/**
 * Unit tests for Footy Stats rankings.
 */
import {
  aggregateBoxScores,
  asPercentProgress,
  bttsSummary,
  buildFootyIndex,
  extractDiscipline,
  filterFixtures,
  goalLineSummary,
  perGame,
  rankBothHalves,
  rankBttsSplit,
  rankBttsTeams,
  rankCleanSheets,
  rankGoalLineTeams,
  rankHalfBtts,
  rankHalfGoals,
  rankLeagues,
  rankScorelines,
  readBoxScore,
  sampleMatchStats,
  upcomingBtts,
  upcomingGoalLine,
  type FootyFixture,
} from '../services/footyMarketStats';

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  ✓ ${name}`);
    passed += 1;
  } else {
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
    failed += 1;
  }
}

let seq = 0;

function fx(partial: Partial<FootyFixture> & Pick<FootyFixture, 'homeName' | 'awayName'>): FootyFixture {
  seq += 1;
  return {
    id: seq,
    unix: 1_700_000_000 + seq,
    finished: true,
    competitionId: 1,
    competitionName: 'Premier',
    country: 'England',
    isCup: false,
    isFriendly: false,
    progress: 50,
    homeGoals: 1,
    awayGoals: 1,
    htHome: null,
    htAway: null,
    ...partial,
  };
}

function repeat(n: number, make: (i: number) => FootyFixture): FootyFixture[] {
  return Array.from({ length: n }, (_, i) => make(i));
}

const query = { country: null, competitionId: null, kind: 'domestic' as const, scope: 'overall' as const };

console.log('\nFooty stats — filters');
{
  const rows = [
    fx({ homeName: 'A', awayName: 'B', isCup: false }),
    fx({ homeName: 'C', awayName: 'D', isCup: true, competitionId: 2, competitionName: 'Cup' }),
    fx({ homeName: 'E', awayName: 'F', isFriendly: true }),
  ];
  const domestic = filterFixtures(rows, { country: null, competitionId: null, kind: 'domestic' });
  check('domestic filter keeps league matches', domestic.length === 1 && domestic[0].homeName === 'A');
  const cups = filterFixtures(rows, { country: null, competitionId: null, kind: 'cup' });
  check('cup filter keeps cups', cups.length === 1 && cups[0].competitionName === 'Cup');
  check('0.25 progress becomes 25%', asPercentProgress(0.25) === 25);
  check('40 progress stays 40', asPercentProgress(40) === 40);
  check('100 progress stays 100', asPercentProgress(100) === 100);
}

console.log('\nFooty stats — BTTS');
{
  const fixtures = [
    ...repeat(5, (i) => fx({ homeName: 'Alpha', awayName: `A${i}`, homeGoals: 2, awayGoals: 1, competitionId: 1 })),
    ...repeat(3, (i) => fx({ homeName: 'Beta', awayName: `B${i}`, homeGoals: 1, awayGoals: 1, competitionId: 1 })),
    ...repeat(2, (i) => fx({ homeName: 'Beta', awayName: `C${i}`, homeGoals: 1, awayGoals: 0, competitionId: 1 })),
  ];
  const index = buildFootyIndex(fixtures, query);
  const teams = rankBttsTeams(index, 'overall');
  check('BTTS ranks by match count', teams[0]?.team === 'Alpha' && teams[0].hits === 5, teams.map((t) => `${t.team}:${t.hits}`).join(','));
  check('Beta BTTS rate is 60%', teams.find((t) => t.team === 'Beta')?.pct === 60);
  const summary = bttsSummary(index);
  check('sample counts every finished match', summary.matches === 10);

  const split = [
    ...repeat(3, () => fx({ homeName: 'Winner', awayName: 'Foe', homeGoals: 2, awayGoals: 1 })),
    ...repeat(2, () => fx({ homeName: 'Winner', awayName: 'Foe', homeGoals: 0, awayGoals: 1 })),
  ];
  const splitIndex = buildFootyIndex(split, query);
  const wins = rankBttsSplit(splitIndex, 'overall', 'win');
  check('BTTS and win is 3 of 5', wins[0]?.hits === 3 && wins[0]?.pct === 60);

  const halves = repeat(5, () =>
    fx({ homeName: 'Half', awayName: 'Side', homeGoals: 2, awayGoals: 1, htHome: 1, htAway: 1 }),
  );
  const halfIndex = buildFootyIndex(halves, query);
  const first = rankHalfBtts(halfIndex, 'overall', 'first');
  const second = rankHalfBtts(halfIndex, 'overall', 'second');
  check('1st half BTTS is 100% when HT is 1-1', first.find((t) => t.team === 'Half')?.pct === 100);
  check(
    '2nd half BTTS is 0% when only one side scores after the break',
    second.find((t) => t.team === 'Half')?.pct === 0,
  );
}

console.log('\nFooty stats — over/under and league cutoff');
{
  const open = [
    ...repeat(3, (i) => fx({ homeName: 'Goals', awayName: `G${i}`, homeGoals: 3, awayGoals: 1, progress: 50, competitionId: 11, competitionName: 'Open' })),
    ...repeat(2, (i) => fx({ homeName: 'Goals', awayName: `H${i}`, homeGoals: 1, awayGoals: 0, progress: 50, competitionId: 11, competitionName: 'Open' })),
  ];
  const early = repeat(6, (i) =>
    fx({ homeName: 'Early', awayName: `E${i}`, homeGoals: 2, awayGoals: 2, progress: 24, competitionId: 10, competitionName: 'Early' }),
  );
  const done = repeat(6, (i) =>
    fx({ homeName: 'Done', awayName: `D${i}`, homeGoals: 3, awayGoals: 0, progress: 100, competitionId: 12, competitionName: 'Done' }),
  );
  const index = buildFootyIndex([...open, ...early, ...done], query);
  const overs = rankGoalLineTeams(index, 'overall', 2.5, 'over');
  check('over 2.5 is 60% for the running league', overs.find((t) => t.team === 'Goals')?.pct === 60);
  check('a finished league is left off the over list', !overs.some((t) => t.team === 'Done'));
  const unders = rankGoalLineTeams(index, 'overall', 2.5, 'under');
  check('under 2.5 is the complement', unders.find((t) => t.team === 'Goals')?.pct === 40);
  const summary = goalLineSummary(index, 2.5, 'over');
  check('summary skips finished leagues', summary.matches === open.length + early.length);

  const bttsLeagues = rankLeagues(index, { kind: 'btts' }, 'pct', false);
  check('24% progress is below the league cutoff', !bttsLeagues.some((row) => row.league === 'Early'));
  check('25% is not required to be above 25 — 50 qualifies', bttsLeagues.some((row) => row.league === 'Open'));
  check('a completed league still appears on the BTTS league list', bttsLeagues.some((row) => row.league === 'Done'));
  const overLeagues = rankLeagues(index, { kind: 'line', line: 2.5, side: 'over' }, 'pct', true);
  check('a completed league is dropped from over/under leagues', !overLeagues.some((row) => row.league === 'Done'));
  check('open league over rate is 60%', overLeagues.find((row) => row.league === 'Open')?.pct === 60);
}

console.log('\nFooty stats — clean sheets and scorelines');
{
  const thin = repeat(6, (i) => fx({ homeName: 'Thin', awayName: `T${i}`, homeGoals: 1, awayGoals: 0 }));
  const few = [
    fx({ homeName: 'Few', awayName: 'F0', homeGoals: 1, awayGoals: 0 }),
    ...repeat(6, (i) => fx({ homeName: 'Few', awayName: `F${i + 1}`, homeGoals: 1, awayGoals: 1 })),
  ];
  const many = [
    ...repeat(6, (i) => fx({ homeName: 'Many', awayName: `M${i}`, homeGoals: 1, awayGoals: 0 })),
    ...repeat(2, (i) => fx({ homeName: 'Many', awayName: `N${i}`, homeGoals: 1, awayGoals: 1 })),
  ];
  const index = buildFootyIndex([...thin, ...few, ...many], query);
  const most = rankCleanSheets(index, 'overall', 'most');
  check('six matches is below the clean-sheet minimum', !most.some((t) => t.team === 'Thin'));
  check('most clean sheets ranks by count', most[0]?.team === 'Many' && most[0].hits === 6);
  check('seven matches with one clean sheet still qualifies', most.some((t) => t.team === 'Few' && t.hits === 1));
  const least = rankCleanSheets(index, 'overall', 'least');
  check('least clean sheets puts the smaller count first', least[0]?.team === 'Few');

  const scores = buildFootyIndex(
    [
      fx({ homeName: 'A', awayName: 'B', homeGoals: 1, awayGoals: 1 }),
      fx({ homeName: 'C', awayName: 'D', homeGoals: 1, awayGoals: 1 }),
      fx({ homeName: 'E', awayName: 'F', homeGoals: 2, awayGoals: 0 }),
    ],
    query,
  );
  const lines = rankScorelines(scores);
  check('1-1 is the most frequent scoreline', lines[0]?.score === '1-1' && lines[0].count === 2);
  check('1-1 is 66.7%', lines[0]?.pct === 66.7);
  check('1-1 has 2 total goals', lines[0]?.goals === 2);
  check('2-0 is counted once', lines.find((row) => row.score === '2-0')?.count === 1);
}

console.log('\nFooty stats — halves and next 48 hours');
{
  const scored = repeat(5, () =>
    fx({ homeName: 'Both', awayName: 'Opp', homeGoals: 2, awayGoals: 0, htHome: 1, htAway: 0 }),
  );
  const index = buildFootyIndex(scored, query);
  const halfGoals = rankHalfGoals(index, 'overall', 'first');
  check('first-half average is the team’s own goals', halfGoals.find((t) => t.team === 'Both')?.avg === 1);
  check('0.5+ first-half scoring is 100%', halfGoals.find((t) => t.team === 'Both')?.over05 === 100);
  const both = rankBothHalves(index, 'overall', 'team');
  check('scoring in both halves is 100%', both.find((t) => t.team === 'Both')?.pct === 100);
  const bttsBoth = rankBothHalves(index, 'overall', 'btts');
  check('BTTS in both halves is 0% when the opponent never scores', bttsBoth.find((t) => t.team === 'Both')?.pct === 0);

  const history = [
    ...repeat(3, (i) => fx({ id: 100 + i, homeName: 'Home', awayName: 'Mid', homeGoals: 1, awayGoals: 1, competitionId: 40, progress: 40, competitionName: 'Ready' })),
    ...repeat(2, (i) => fx({ id: 200 + i, homeName: 'Home', awayName: 'Mid', homeGoals: 1, awayGoals: 0, competitionId: 40, progress: 40, competitionName: 'Ready' })),
    ...repeat(5, (i) => fx({ id: 300 + i, homeName: 'Away', awayName: 'Mid', homeGoals: 2, awayGoals: 1, competitionId: 40, progress: 40, competitionName: 'Ready' })),
  ];
  const ready = buildFootyIndex(history, query);
  const soon = [
    fx({
      homeName: 'Home',
      awayName: 'Away',
      finished: false,
      homeGoals: null,
      awayGoals: null,
      competitionId: 40,
      progress: 40,
      competitionName: 'Ready',
      unix: 1_800_000_000,
    }),
    fx({
      homeName: 'Home',
      awayName: 'Away',
      finished: false,
      homeGoals: null,
      awayGoals: null,
      competitionId: 20,
      progress: 20,
      competitionName: 'Young',
      unix: 1_800_000_100,
    }),
  ];
  const upcoming = upcomingBtts(ready, soon, query);
  check('next 48 hours hides leagues under 25%', upcoming.length === 1 && upcoming[0].league === 'Ready');
  check('match BTTS is the average of the two team rates', upcoming[0]?.pct === 80, String(upcoming[0]?.pct));
  const overSoon = upcomingGoalLine(ready, soon, query, 2.5, 'over');
  check('over 2.5 upcoming also hides a 20% league', overSoon.every((row) => row.league !== 'Young'));
}

console.log('\nFooty stats — season discipline fields');
{
  const empty = extractDiscipline([]);
  check('an empty season payload has no corner data', empty.hasCorners === false && empty.hasCards === false && empty.hasOffsides === false);
  const feed = extractDiscipline([
    {
      name: 'Rough',
      played: { total: 10 },
      yellow_cards: { total: 20 },
      red_cards: { total: 2 },
      corners_for: { total: 50 },
      corners_against: { total: 40 },
      corners_1h_total: { total: 30 },
      corners_2h_total: { total: 60 },
      corners_over_9_5: { total_percentage: 40 },
      offsides: { total: 25 },
      offsides_over_25: { total_percentage: 55 },
    },
    { name: 'Quiet', played: { total: 8 } },
  ]);
  check('cards are recognised', feed.hasCards === true);
  check('yellows stay a season total', feed.teams.find((t) => t.name === 'Rough')?.yellows === 20);
  check('yellows per game is the total divided by played', perGame(20, 10) === 2);
  check('missing offsides on a quiet team does not hide a league that has them', feed.hasOffsides === true);
  check('half corner totals are recognised only when both halves exist', feed.hasCornerHalves === true);
  check('match corners are for plus against', feed.teams.find((t) => t.name === 'Rough')?.matchCorners === 90);
  check('over 9.5 corners is read as a percentage', feed.teams.find((t) => t.name === 'Rough')?.cornerOver['9.5'] === 40);
  check('over 2.5 offsides is stored', feed.teams.find((t) => t.name === 'Rough')?.offsideOver['2.5'] === 55);
  const noDiscipline = extractDiscipline([{ name: 'Plain', played: { total: 12 }, goals_for: { total: 20 } }]);
  check('goal fields alone do not invent corners or cards', noDiscipline.hasCorners === false && noDiscipline.hasCards === false && noDiscipline.hasOffsides === false);
}

console.log('\nFooty stats — match summary box scores');
{
  check(
    'pressure alone is not a corner or booking sample',
    readBoxScore('A', 'B', { home_pressure: 12, away_pressure: 8 }) == null,
  );
  const first = readBoxScore('Home', 'Away', {
    home_corners: 7,
    away_corners: 4,
    home_yellow_cards: 2,
    away_yellow_cards: 1,
    home_red_cards: 0,
    away_red_cards: 1,
    home_offsides: 3,
    away_offsides: 1,
  });
  check(
    'reads the same stat keys as the match summary',
    first?.homeCorners === 7 && first.awayYellows === 1 && first.homeOffsides === 3,
  );
  const feed = aggregateBoxScores([
    first!,
    readBoxScore('Home', 'Other', {
      home_corners: 6,
      away_corners: 5,
      home_yellow_cards: 3,
      away_yellow_cards: 0,
      home_red_cards: 0,
      away_red_cards: 0,
      home_offsides: 2,
      away_offsides: 2,
    })!,
    readBoxScore('Home', 'Third', {
      home_corners: 2,
      away_corners: 2,
      home_yellow_cards: 1,
      away_yellow_cards: 4,
      home_red_cards: 0,
      away_red_cards: 0,
      home_offsides: 0,
      away_offsides: 1,
    })!,
  ]);
  const home = feed.teams.find((team) => team.name === 'Home');
  check('match corners add both teams', home?.matchCorners === 26);
  check('corners for are this team only', home?.cornersFor === 15);
  check('two of three matches are over 9.5 corners', home?.cornerOver['9.5'] === 66.7);
  check('yellow bookings are summed', home?.yellows === 6);
  check('offsides are this team only', home?.offsides === 5);
  check('two of three matches are over 2.5 offsides', home?.offsideOver['2.5'] === 66.7);
  check('the sample size is the number of matches', feed.sampledMatches === 3);
  check('full-match stats do not invent a half split', feed.hasCornerHalves === false);
  const named = readBoxScore('Home', 'Away', { home_corners: 8, away_corners: 4 }, {
    competitionId: 9,
    competitionName: 'Premier',
    country: 'England',
  });
  const other = readBoxScore('Home', 'Away', { home_corners: 3, away_corners: 3 }, {
    competitionId: 4,
    competitionName: 'Championship',
    country: 'England',
  });
  const split = aggregateBoxScores([named!, other!]);
  check('the same team name in two leagues stays two rows', split.teams.filter((team) => team.name === 'Home').length === 2);
  const premier = split.leagues.find((league) => league.league === 'Premier');
  check('a league corner average uses both teams once', premier?.matchCorners === 12 && premier.cornerMatches === 1);
  const many = [
    ...repeat(12, () => fx({ homeName: 'A', awayName: 'B', competitionId: 1, competitionName: 'One' })),
    ...repeat(4, () => fx({ homeName: 'C', awayName: 'D', competitionId: 2, competitionName: 'Two' })),
  ];
  const sampled = sampleMatchStats(many, null);
  check('each league keeps its own recent matches', sampled.filter((row) => row.competitionId === 1).length === 10);
  check('a smaller league is not dropped', sampled.filter((row) => row.competitionId === 2).length === 4);
  check('one league still uses the deeper sample', sampleMatchStats(repeat(60, () => fx({ homeName: 'A', awayName: 'B' })), 1).length === 48);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
