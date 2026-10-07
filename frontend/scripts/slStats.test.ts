/**
 * SL-STATS rankings stay separate from the Footy and match screens.
 */
import {
  combineMatchQuery,
  isMidweekKickoff,
  ordinaryMatches,
  rankCornerLeagues,
  rankCornerMatches,
  rankLeagueAverages,
  rankLeakyFixtures,
  rankOrdinaryTeams,
  rankSecondHalfFixtures,
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
  check('league average comes from the stats builder', leagues[0]?.name === 'Premier' && leagues[0].pct === 50);
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

function played(options: {
  team: string;
  count: number;
  gf: number;
  ga: number;
  home?: boolean;
  htGf?: number | null;
  htGa?: number | null;
  competitionId?: number;
  competitionName?: string;
  startUnix: number;
  scores?: { gf: number; ga: number; htGf?: number | null; htGa?: number | null }[];
}): FootyFixture[] {
  return Array.from({ length: options.count }, (_, index) => {
    const score = options.scores?.[index] ?? { gf: options.gf, ga: options.ga, htGf: options.htGf, htGa: options.htGa };
    const home = options.home !== false;
    const htGf = score.htGf === undefined ? 0 : score.htGf;
    const htGa = score.htGa === undefined ? 0 : score.htGa;
    return fx({
      homeName: home ? options.team : `${options.team} opp ${index}`,
      awayName: home ? `${options.team} opp ${index}` : options.team,
      homeGoals: home ? score.gf : score.ga,
      awayGoals: home ? score.ga : score.gf,
      htHome: htGf == null || htGa == null ? null : home ? htGf : htGa,
      htAway: htGf == null || htGa == null ? null : home ? htGa : htGf,
      competitionId: options.competitionId ?? 1,
      competitionName: options.competitionName ?? 'Premier',
      unix: options.startUnix + index,
      finished: true,
    });
  });
}

function upcoming(home: string, away: string, unix: number, competitionId = 1, competitionName = 'Premier'): FootyFixture {
  return fx({
    homeName: home,
    awayName: away,
    homeGoals: null,
    awayGoals: null,
    htHome: null,
    htAway: null,
    finished: false,
    unix,
    competitionId,
    competitionName,
  });
}

function leakyScores(bttsHits: number, concedeHits: number) {
  const scores: { gf: number; ga: number }[] = [];
  for (let index = 0; index < 10; index += 1) {
    const concede = index < concedeHits;
    const btts = index < bttsHits;
    scores.push({ gf: btts || !concede ? 1 : 0, ga: concede ? 1 : 0 });
  }
  return scores;
}

console.log('\nQuick filters');
{
  const home = played({ team: 'Alpha', count: 10, gf: 1, ga: 1, startUnix: 1_800_000_000, scores: leakyScores(7, 8) });
  const away = played({ team: 'Beta', count: 10, gf: 1, ga: 1, home: false, startUnix: 1_800_100_000, scores: leakyScores(6, 8) });
  const short = played({ team: 'Short', count: 9, gf: 1, ga: 1, startUnix: 1_800_200_000 });
  const tight = played({ team: 'Tight', count: 10, gf: 1, ga: 0, startUnix: 1_800_300_000 });
  const open = upcoming('Alpha', 'Beta', 1_900_000_000);
  const rows = rankLeakyFixtures([...home, ...away, ...short, ...tight], [
    open,
    upcoming('Alpha', 'Short', 1_900_000_100),
    upcoming('Alpha', 'Tight', 1_900_000_200),
  ]);
  check('both sides conceding 8 of 10 are listed', rows.some((row) => row.match === 'Alpha vs Beta'));
  check('fewer than 10 games is left out', rows.every((row) => !row.match.includes('Short')));
  check('conceding 0 of 10 is left out', rows.every((row) => !row.match.includes('Tight')));
  const pair = rows.find((row) => row.match === 'Alpha vs Beta');
  check('a 70% both-teams-to-score rate is marked', pair?.homeBttsPass === true && pair.homeBttsPct === 70);
  check('a 60% both-teams-to-score rate stays on the list unmarked', pair?.awayBttsPass === false && pair.awayBttsPct === 60);

  const livelyHome = played({
    team: 'Lively',
    count: 10,
    gf: 2,
    ga: 2,
    competitionId: 2,
    competitionName: 'Open',
    startUnix: 1_810_000_000,
  });
  const livelyAway = played({
    team: 'Loose',
    count: 10,
    gf: 2,
    ga: 2,
    home: false,
    competitionId: 2,
    competitionName: 'Open',
    startUnix: 1_810_100_000,
  });
  const ranked = rankLeakyFixtures(
    [...home, ...away, ...livelyHome, ...livelyAway],
    [open, upcoming('Lively', 'Loose', 1_900_000_300, 2, 'Open')],
  );
  check('the higher both-teams-to-score model ranks first', ranked[0]?.match === 'Lively vs Loose' && ranked[0].btts > (ranked[1]?.btts ?? 1));
}

{
  const day = (weekday: number) => {
    for (let offset = 0; offset < 14; offset += 1) {
      const unix = Math.floor(Date.UTC(2026, 0, 1 + offset, 12, 0, 0) / 1000);
      if (new Date(unix * 1000).getDay() === weekday) return unix;
    }
    return 0;
  };
  check('Tuesday, Wednesday and Thursday are midweek', [2, 3, 4].every((weekday) => isMidweekKickoff(day(weekday))));
  check('Monday and Friday are not midweek', !isMidweekKickoff(day(1)) && !isMidweekKickoff(day(5)));

  const openHome = played({ team: 'Host', count: 10, gf: 1, ga: 2, startUnix: 1_820_000_000, competitionId: 5, competitionName: 'High' });
  const openAway = played({ team: 'Visit', count: 10, gf: 2, ga: 1, home: false, startUnix: 1_820_100_000, competitionId: 5, competitionName: 'High' });
  const quietHome = played({ team: 'Wall', count: 10, gf: 0, ga: 1, startUnix: 1_830_000_000, competitionId: 6, competitionName: 'Low' });
  const quietAway = played({ team: 'Poke', count: 10, gf: 1, ga: 0, home: false, startUnix: 1_830_100_000, competitionId: 6, competitionName: 'Low' });
  const shutHome = played({
    team: 'Shut',
    count: 10,
    gf: 1,
    ga: 0,
    htGf: 1,
    htGa: 0,
    startUnix: 1_840_000_000,
    competitionId: 7,
    competitionName: 'Nil',
  });
  const shutAway = played({
    team: 'Blank',
    count: 10,
    gf: 0,
    ga: 1,
    home: false,
    htGf: 0,
    htGa: 1,
    startUnix: 1_840_100_000,
    competitionId: 7,
    competitionName: 'Nil',
  });
  const few = played({ team: 'Nine', count: 9, gf: 1, ga: 2, startUnix: 1_850_000_000, competitionId: 8, competitionName: 'Short' });
  const fewAway = played({ team: 'Also', count: 10, gf: 2, ga: 1, home: false, startUnix: 1_850_100_000, competitionId: 8, competitionName: 'Short' });
  const slowAwayScores = [
    ...Array.from({ length: 5 }, () => ({ gf: 2, ga: 1, htGf: 0, htGa: 0 })),
    ...Array.from({ length: 3 }, () => ({ gf: 2, ga: 1, htGf: 0, htGa: 0 })),
    ...Array.from({ length: 2 }, () => ({ gf: 0, ga: 1, htGf: 0, htGa: 0 })),
  ];
  const slowAway = played({
    team: 'Late',
    count: 10,
    gf: 0,
    ga: 1,
    home: false,
    startUnix: 1_860_000_000,
    competitionId: 5,
    competitionName: 'High',
    scores: slowAwayScores,
  });
  const heavyHome = played({
    team: 'Early',
    count: 10,
    gf: 3,
    ga: 1,
    htGf: 3,
    htGa: 0,
    startUnix: 1_870_000_000,
    competitionId: 9,
    competitionName: 'Early',
  });
  const heavyAway = played({
    team: 'Reply',
    count: 10,
    gf: 1,
    ga: 3,
    home: false,
    htGf: 0,
    htGa: 3,
    startUnix: 1_870_100_000,
    competitionId: 9,
    competitionName: 'Early',
  });
  const history = [...openHome, ...openAway, ...quietHome, ...quietAway, ...shutHome, ...shutAway, ...few, ...fewAway, ...slowAway, ...heavyHome, ...heavyAway];
  const high = upcoming('Host', 'Visit', day(3), 5, 'High');
  const low = upcoming('Wall', 'Poke', day(1), 6, 'Low');
  const screened = rankSecondHalfFixtures(history, [
    high,
    low,
    upcoming('Shut', 'Blank', day(3), 7, 'Nil'),
    upcoming('Nine', 'Also', day(3), 8, 'Short'),
    upcoming('Host', 'Late', day(3), 5, 'High'),
    upcoming('Early', 'Reply', day(4), 9, 'Early'),
  ]);
  check('a high-scoring second-half match is listed', screened.some((row) => row.match === 'Host vs Visit'));
  check('a league under 2.5 goals stays out until that league is chosen', screened.every((row) => row.match !== 'Wall vs Poke'));
  const chosen = rankSecondHalfFixtures([...quietHome, ...quietAway], [low], { competitionId: 6 });
  check('choosing a league keeps it without the goals-per-game gate', chosen.some((row) => row.match === 'Wall vs Poke'));
  check('a second half that stays 0-0 is left out', screened.every((row) => row.match !== 'Shut vs Blank'));
  check('fewer than 10 games is left out of the second-half list', screened.every((row) => row.match !== 'Nine vs Also'));
  check('scoring in the second half in 3 of the last 5 is left out', screened.every((row) => row.match !== 'Host vs Late'));
  const listed = screened.find((row) => row.match === 'Host vs Visit');
  check('the away side’s last 5 goals are the sort figure', listed?.awayGoalsLast5 === 10);
  check('a Wednesday kickoff is marked midweek', listed?.midweek === true);
  const early = screened.find((row) => row.match === 'Early vs Reply');
  check('a first-half-heavy run stays listed and unmarked', early != null && early.homeHeavyPass === false && early.awayHeavyPass === false);
  const mild = played({
    team: 'Mild',
    count: 10,
    gf: 1,
    ga: 1,
    home: false,
    startUnix: 1_820_200_000,
    competitionId: 5,
    competitionName: 'High',
  });
  const byGoals = rankSecondHalfFixtures([...openHome, ...openAway, ...mild], [upcoming('Host', 'Mild', day(3), 5, 'High'), high]);
  check('more away goals in the last 5 ranks first', byGoals[0]?.match === 'Host vs Visit' && byGoals[0].awayGoalsLast5 === 10 && byGoals[1]?.awayGoalsLast5 === 5);
}

console.log('\nFurther boundaries');
{
  const home = played({ team: 'Alpha', count: 10, gf: 1, ga: 1, startUnix: 2_000_000_000, scores: leakyScores(8, 7) });
  const away = played({ team: 'Beta', count: 10, gf: 1, ga: 1, home: false, startUnix: 2_000_100_000, scores: leakyScores(8, 8) });
  const seven = rankLeakyFixtures([...home, ...away], [upcoming('Alpha', 'Beta', 2_100_000_000)]);
  check('conceding 7 of 10 is left out', seven.length === 0);

  const enough = played({ team: 'Alpha', count: 10, gf: 1, ga: 1, startUnix: 2_000_000_000, scores: leakyScores(8, 8) });
  const cup = fx({
    homeName: 'Alpha',
    awayName: 'Beta',
    finished: false,
    homeGoals: null,
    awayGoals: null,
    isCup: true,
    unix: 2_100_000_000,
  });
  const friendly = fx({
    homeName: 'Alpha',
    awayName: 'Beta',
    finished: false,
    homeGoals: null,
    awayGoals: null,
    isFriendly: true,
    unix: 2_100_000_100,
  });
  check('a cup and a friendly are left off the leaky list', rankLeakyFixtures([...enough, ...away], [cup, friendly]).length === 0);

  const otherLeague = played({
    team: 'Alpha',
    count: 10,
    gf: 1,
    ga: 1,
    startUnix: 2_000_000_000,
    competitionId: 9,
    scores: leakyScores(8, 8),
  });
  check(
    'history from another competition does not qualify',
    rankLeakyFixtures([...otherLeague, ...away], [upcoming('Alpha', 'Beta', 2_100_000_000)]).length === 0,
  );

  const tied = rankLeakyFixtures(
    [...enough, ...away],
    [upcoming('Alpha', 'Beta', 2_100_000_200), upcoming('Alpha', 'Beta', 2_100_000_050)],
  );
  check('an equal model probability lists the earlier kickoff first', tied.length === 2 && tied[0].unix < tied[1].unix);

  const many = rankLeakyFixtures(
    [...enough, ...away],
    Array.from({ length: 41 }, (_, index) => upcoming('Alpha', 'Beta', 2_200_000_000 + index)),
  );
  check('the leaky list stops at 40', many.length === 40);

  const homeOnly = played({
    team: 'Host',
    count: 10,
    gf: 1,
    ga: 2,
    startUnix: 2_300_000_000,
    competitionId: 5,
    competitionName: 'High',
    htGf: 0,
    htGa: 0,
  });
  const awayClean = played({
    team: 'Host',
    count: 10,
    gf: 2,
    ga: 0,
    home: false,
    startUnix: 2_300_100_000,
    competitionId: 5,
    competitionName: 'High',
    htGf: 0,
    htGa: 0,
  });
  const visit = played({
    team: 'Visit',
    count: 10,
    gf: 2,
    ga: 1,
    home: false,
    startUnix: 2_300_200_000,
    competitionId: 5,
    competitionName: 'High',
  });
  const homeGate = rankSecondHalfFixtures(
    [...homeOnly, ...awayClean, ...visit],
    [upcoming('Host', 'Visit', 2_400_000_000, 5, 'High')],
    { competitionId: 5 },
  );
  check('home second-half conceded uses home games, not away games', homeGate.length === 1 && homeGate[0].homeConcededPct === 100);

  const homeClean = played({
    team: 'Wall',
    count: 10,
    gf: 2,
    ga: 0,
    startUnix: 2_500_000_000,
    competitionId: 5,
    competitionName: 'High',
    htGf: 1,
    htGa: 0,
  });
  const awayLeaky = played({
    team: 'Wall',
    count: 10,
    gf: 1,
    ga: 2,
    home: false,
    startUnix: 2_500_100_000,
    competitionId: 5,
    competitionName: 'High',
    htGf: 0,
    htGa: 0,
  });
  const ignored = rankSecondHalfFixtures(
    [...homeClean, ...awayLeaky, ...visit],
    [upcoming('Wall', 'Visit', 2_600_000_000, 5, 'High')],
    { competitionId: 5 },
  );
  check('away concessions do not satisfy the home second-half gate', ignored.length === 0);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
