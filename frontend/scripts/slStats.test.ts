/**
 * SL-STATS rankings stay separate from the Footy and match screens.
 */
import {
  combineMatchQuery,
  ordinaryMatches,
  rankCornerLeagues,
  rankCornerMatches,
  rankLeagueAverages,
  rankOrdinaryTeams,
  rankSeriesTeams,
  rankTopBoard,
  seriesMatches,
  seriesPicks,
  bestBetForFixture,
  type CornerMatchRow,
} from '../services/slStats';
import type { DisciplineFeed, FootyFixture } from '../services/footyMarketStats';

let passed = 0;
let failed = 0;
let seq = 0;

function check(name: string, cond: boolean) {
  if (cond) {
    console.log(`  ✓ ${name}`);
    passed += 1;
  } else {
    console.log(`  ✗ ${name}`);
    failed += 1;
  }
}

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
    awayGoals: 0,
    htHome: 0,
    htAway: 0,
    ...partial,
  };
}

console.log('\nSL-STATS');
{
  const picks = seriesPicks();
  check('series picks use a full label', picks.some((item) => item.label === 'Games without a win'));
  const wins = [
    fx({ homeName: 'Alpha', awayName: 'Beta', homeGoals: 2, awayGoals: 0 }),
    fx({ homeName: 'Gamma', awayName: 'Alpha', homeGoals: 0, awayGoals: 1 }),
    fx({ homeName: 'Alpha', awayName: 'Delta', homeGoals: 1, awayGoals: 0 }),
  ];
  const short = rankSeriesTeams(wins.slice(0, 2), 'w');
  check('two wins is not a series', short.every((row) => row.team !== 'Alpha'));
  const ranked = rankSeriesTeams(wins, 'w');
  check('three wins is a series of 3', ranked[0]?.team === 'Alpha' && ranked[0].run === 3);
  const upcoming = fx({
    homeName: 'Alpha',
    awayName: 'Quiet',
    finished: false,
    homeGoals: null,
    awayGoals: null,
    unix: 1_800_000_000,
  });
  const earlierOther = fx({
    homeName: 'Beta',
    awayName: 'Gamma',
    finished: false,
    homeGoals: null,
    awayGoals: null,
    unix: 1_790_000_000,
  });
  const next = seriesMatches(wins, [earlierOther, upcoming], 'w');
  check('the series team’s next match is listed', next[0]?.match === 'Alpha vs Quiet' && next[0].run === 3);
  check('the opponent series is not live', next[0]?.opponentLive === false);
}

{
  const feed: DisciplineFeed = {
    teams: [
      {
        name: 'Alpha',
        league: 'Premier',
        country: 'England',
        competitionId: 1,
        played: 1,
        cornersFor: 8,
        cornersAgainst: 4,
        matchCorners: 12,
        corners1h: null,
        corners2h: null,
        yellows: null,
        reds: null,
        offsides: null,
        cornerOver: { '9.5': 100 },
        offsideOver: {},
      },
      {
        name: 'Beta',
        league: 'Premier',
        country: 'England',
        competitionId: 1,
        played: 1,
        cornersFor: 4,
        cornersAgainst: 8,
        matchCorners: 12,
        corners1h: null,
        corners2h: null,
        yellows: null,
        reds: null,
        offsides: null,
        cornerOver: { '9.5': 100 },
        offsideOver: {},
      },
    ],
    leagues: [
      {
        competitionId: 1,
        league: 'Premier',
        country: 'England',
        cornerMatches: 4,
        matchCorners: 50,
        cornerOver: { '9.5': 50 },
        cardMatches: 0,
        yellows: 0,
        reds: 0,
        offsideMatches: 0,
        offsides: 0,
        offsideOver: {},
      },
    ],
    hasCorners: true,
    hasCornerHalves: false,
    hasCornerOvers: true,
    hasCards: false,
    hasOffsides: false,
    hasOffsideOvers: false,
    sampledMatches: 4,
  };
  const leagues = rankCornerLeagues(feed, '9.5');
  check('league corners are 12.5 from 50 in 4 matches', leagues[0]?.perGame === 12.5 && leagues[0].overPct === 50);
  const upcoming = fx({
    homeName: 'Alpha',
    awayName: 'Beta',
    finished: false,
    homeGoals: null,
    awayGoals: null,
    unix: 1_800_000_000,
    progress: 50,
  });
  const early = fx({
    homeName: 'Alpha',
    awayName: 'Beta',
    finished: false,
    homeGoals: null,
    awayGoals: null,
    progress: 10,
  });
  const matches: CornerMatchRow[] = rankCornerMatches(feed, [upcoming, early]);
  check('upcoming corners average the two teams', matches[0]?.avg === 12 && matches[0].home === 12);
  check('a league under 25% progress is left off', matches.length === 1);
}

{
  const played = ['Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta'].map((name, i) =>
    fx({
      homeName: 'Alpha',
      awayName: name,
      homeGoals: 2,
      awayGoals: 0,
      unix: 1_700_000_000 + i,
      id: 100 + i,
    }),
  );
  const teams = rankOrdinaryTeams(played, 'w_pct');
  check('ordinary W ranks the team that won all five', teams[0]?.name === 'Alpha' && teams[0].pct === 100);
  const leagues = rankLeagueAverages(played, 'cs_pct');
  check('league average comes from the stats builder', leagues[0]?.name === 'Premier' && leagues[0].pct === 16.7);
  const next = ordinaryMatches(
    played,
    [
      fx({
        homeName: 'Alpha',
        awayName: 'Beta',
        finished: false,
        homeGoals: null,
        awayGoals: null,
        unix: 1_800_000_000,
        progress: 40,
      }),
    ],
    'w_pct',
  );
  check('ordinary upcoming keeps the team rate', next[0]?.homePct === 100);
  const strong = [
    ...Array.from({ length: 8 }, (_, i) =>
      fx({ homeName: 'Alpha', awayName: `Opp${i}`, homeGoals: 3, awayGoals: 0, unix: 1_700_000_100 + i, id: 300 + i }),
    ),
    ...Array.from({ length: 8 }, (_, i) =>
      fx({ homeName: `Host${i}`, awayName: 'Beta', homeGoals: 2, awayGoals: 0, unix: 1_700_000_200 + i, id: 400 + i }),
    ),
  ];
  const bet = bestBetForFixture(
    fx({ homeName: 'Alpha', awayName: 'Beta', finished: false, homeGoals: null, awayGoals: null, unix: 1_800_000_000 }),
    strong,
  );
  check('the best bet names the stronger side and a percentage', bet != null && bet.selection.includes('Alpha') && bet.probability > 0.4);
  const queried = combineMatchQuery(
    played,
    [
      fx({
        homeName: 'Alpha',
        awayName: 'Beta',
        finished: false,
        homeGoals: null,
        awayGoals: null,
        unix: 1_800_000_000,
        progress: 40,
      }),
    ],
    { scope: 'overall', statKey: 'w_pct', statLabel: 'Win', seriesKey: '', seriesLabel: '' },
  );
  const homeLine = queried[0]?.evidence.find((line) => line.label === 'Home Win');
  const leagueLine = queried[0]?.evidence.find((line) => line.label === 'League average Win');
  const used = queried[0]?.evidence.filter((line) => line.pct != null).map((line) => line.pct as number) ?? [];
  const expected = used.length ? Math.round((used.reduce((sum, n) => sum + n, 0) / used.length) * 10) / 10 : null;
  check('the query keeps the home win calculation', homeLine?.pct === 100 && homeLine.detail.includes('5 previous'));
  check('the query includes the league average', leagueLine != null);
  check('the combined figure is the average of those calculations', queried[0]?.combined === expected);
  check('previous evidence shows a home win', queried[0]?.previous.some((row) => row.team === 'Alpha' && row.hit && row.text.startsWith('Alpha 2-0')) === true);
}

{
  const longWins = (name: string, count: number, competitionId: number, competitionName: string, cup = false) =>
    Array.from({ length: count }, (_, index) =>
      fx({
        homeName: name,
        awayName: `Opp ${competitionId}-${index}`,
        homeGoals: 1,
        awayGoals: 0,
        competitionId,
        competitionName,
        isCup: cup,
        unix: 1_700_000_000 + competitionId * 1000 + index,
      }),
    );
  const sample = [
    ...longWins('Alpha', 12, 1, 'Premier'),
    ...longWins('Beta', 6, 2, 'Championship'),
    ...longWins('CupSide', 10, 9, 'FA Cup', true),
  ];
  const teams = rankTopBoard(sample, {
    entity: 'teams',
    measure: 'series',
    statKey: 'w_pct',
    seriesKey: 'w',
    scope: 'overall',
    minimum: 10,
  });
  check('a win series of 10 or more keeps the long runs', teams.some((row) => row.name === 'Alpha' && row.figure === '12 games'));
  check('a win series under 10 is left out', teams.every((row) => row.name !== 'Beta'));
  check('cup sides stay off the league team board only when ranking leagues', rankTopBoard(sample, {
    entity: 'leagues',
    measure: 'series',
    statKey: 'w_pct',
    seriesKey: 'w',
    scope: 'overall',
    minimum: 10,
  }).every((row) => row.name !== 'FA Cup') && teams.some((row) => row.name === 'CupSide'));
  const leagues = rankTopBoard(sample, {
    entity: 'leagues',
    measure: 'series',
    statKey: 'w_pct',
    seriesKey: 'w',
    scope: 'overall',
    minimum: 10,
  });
  check('leagues rank by the longest win series of 10 or more', leagues.length === 1 && leagues[0].name === 'Premier' && leagues[0].detail === 'Alpha' && leagues[0].extra === '1');
  const competitions = rankTopBoard(sample, {
    entity: 'competitions',
    measure: 'series',
    statKey: 'w_pct',
    seriesKey: 'w',
    scope: 'overall',
    minimum: 10,
  });
  check('competitions include the cup with a 10-game win series', competitions.some((row) => row.name === 'FA Cup' && row.typeLabel === 'Cup' && row.figure === '10 games'));
  const btts = [
    ...Array.from({ length: 10 }, (_, index) =>
      fx({
        homeName: 'Alpha',
        awayName: `Btts ${index}`,
        homeGoals: index < 8 ? 2 : 1,
        awayGoals: index < 8 ? 1 : 0,
        unix: 1_710_000_000 + index,
      }),
    ),
    ...Array.from({ length: 10 }, (_, index) =>
      fx({
        homeName: `Host ${index}`,
        awayName: 'Beta',
        homeGoals: index < 2 ? 1 : 2,
        awayGoals: index < 2 ? 1 : 0,
        unix: 1_720_000_000 + index,
      }),
    ),
  ];
  const rates = rankTopBoard(btts, {
    entity: 'teams',
    measure: 'ordinary',
    statKey: 'btts_yes',
    seriesKey: '',
    scope: 'overall',
    minimum: 10,
  });
  check('both teams to score ranks the higher rate from 10 games', rates[0]?.name === 'Alpha' && rates[0].figure === '80.0%' && rates[1]?.name === 'Beta');
  const averages = rankTopBoard(btts, {
    entity: 'leagues',
    measure: 'ordinary',
    statKey: 'btts_yes',
    seriesKey: '',
    scope: 'overall',
    minimum: 10,
  });
  check('the league average is the mean of the qualifying teams', averages[0]?.figure === '50.0%' && averages[0].detail === 'Alpha');
  const open = rankTopBoard(
    [
      ...longWins('Alpha', 12, 1, 'Premier'),
      ...longWins('Short', 1, 1, 'Premier'),
      fx({ homeName: 'Cold', awayName: 'Warm', homeGoals: 0, awayGoals: 1, competitionId: 1, competitionName: 'Premier' }),
    ],
    { entity: 'teams', measure: 'series', statKey: 'w_pct', seriesKey: 'w', scope: 'overall', minimum: 0 },
  );
  check('best 200 keeps the long run first and still lists a one-game series', open[0]?.name === 'Alpha' && open.some((row) => row.name === 'Short'));
  check('a team with no current series stays off the best 200', open.every((row) => row.name !== 'Cold'));
  check('the board stops at the requested length', rankTopBoard(sample, {
    entity: 'teams',
    measure: 'series',
    statKey: 'w_pct',
    seriesKey: 'w',
    scope: 'overall',
    minimum: 5,
    limit: 1,
  }).length === 1);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
