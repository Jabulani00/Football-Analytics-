import {
  FIRST_HALF_STATS,
  FULLTIME_ONLY_STATS,
  HTFT_COMBOS,
  LEAGUE_AVG_STATS,
  ORDINARY_STATS,
  PPG_SCOPES,
  SECOND_HALF_STATS,
  SERIES_STATS,
  TABLE_CONTEXTS,
} from '@/constants/statsCatalogue';
import { getFixturesForLeague, type Fixture } from '@/mock/fixturesData';
import type { ComplianceLevel } from '@/types/analytics';
import type { FixtureStatsBundle, PpgReading, StatReading } from '@/types/stats';
import { complianceFromPercent } from '@/utils/compliance';

type TableCtx = (typeof TABLE_CONTEXTS)[number];

type TeamProfile = {
  attack: number;
  defense: number;
  homeBoost: number;
  form: number;
};

const RFS_FAILURES = [
  'Failed BTTS Yes usual (last match)',
  'Failed Over 2.5 usual (last match)',
  'Failed Clean Sheet pattern',
  'Failed Scored First usual',
  'Failed Win usual at home',
  'Conceded after scoring first',
  'No goal in 2nd half after usual',
];

const RFS_STREAKS = [
  'BTTS Yes streak ended (was 4)',
  'Win streak ended (was 3)',
  'Over 2.5 streak ended (was 5)',
  'Clean sheet streak ended',
  'Scored in both halves streak ended',
  'Unbeaten run ended',
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function rnd(base: number, spread: number, salt: number): number {
  const x = Math.sin(base * 12.9898 + salt * 78.233) * 43758.5453;
  return (x - Math.floor(x)) * spread * 2 - spread;
}

function level(v: number): ComplianceLevel {
  return complianceFromPercent(Math.round(v));
}

function teamProfile(name: string): TeamProfile {
  const h = hash(name);
  return {
    attack: 0.35 + (h % 45) / 100,
    defense: 0.3 + ((h >> 4) % 40) / 100,
    homeBoost: 0.06 + ((h >> 8) % 12) / 100,
    form: -0.12 + ((h >> 12) % 25) / 100,
  };
}

function contextModifiers(ctx: TableCtx) {
  const recencyShift =
    ctx.group === 'lastN'
      ? ctx.recency === 'last10'
        ? 0.04
        : ctx.recency === 'last8'
          ? 0.07
          : 0.11
      : 0;
  const periodShift =
    ctx.period === 'firsthalf' ? -0.08 : ctx.period === 'secondhalf' ? 0.05 : 0;
  return { recencyShift, periodShift, split: ctx.split };
}

function teamPct(
  profile: TeamProfile,
  statKey: string,
  isHome: boolean,
  ctx: TableCtx,
  fixtureSalt: number,
): number {
  const { recencyShift, periodShift, split } = contextModifiers(ctx);
  const homeAdvantage = isHome ? profile.homeBoost : -profile.homeBoost * 0.6;
  const form = profile.form * (ctx.group === 'lastN' ? 1.4 : 1);
  const salt = rnd(fixtureSalt, 6, hash(statKey + (isHome ? 'h' : 'a')));

  let base = 50;

  switch (statKey) {
    case 'sc_pct':
      base = 38 + profile.attack * 42 + homeAdvantage * 80 + form * 30;
      break;
    case 'conc_pct':
      base = 42 + (1 - profile.defense) * 38 + (isHome ? -4 : 6) + form * 15;
      break;
    case 'sc_avg':
      base = (1.1 + profile.attack * 1.4 + homeAdvantage * 2) * 28;
      break;
    case 'conc_avg':
      base = (0.9 + (1 - profile.defense) * 1.2 + (isHome ? -0.15 : 0.2)) * 28;
      break;
    case 'btts_yes':
      base = 36 + profile.attack * 22 + (1 - profile.defense) * 18 + periodShift * 40;
      break;
    case 'btts_no': {
      const yesEst =
        36 + profile.attack * 22 + (1 - profile.defense) * 18 + periodShift * 40 + homeAdvantage * 20;
      base = 100 - yesEst + rnd(fixtureSalt, 5, 2);
      break;
    }
    case 'cs':
      base = 22 + profile.defense * 48 - profile.attack * 12 + (isHome ? 8 : -4);
      break;
    case 'w':
      base = 28 + profile.attack * 22 + profile.defense * 12 + homeAdvantage * 70 + form * 35;
      if (split === 'home' && isHome) base += 14;
      if (split === 'away' && !isHome) base += 14;
      break;
    case 'd':
      base = 18 + rnd(fixtureSalt, 8, 5);
      break;
    case 'l':
      base = clamp(14 + (1 - profile.attack) * 28 + (1 - profile.defense) * 8 + rnd(fixtureSalt, 9, 5), 8, 42);
      break;
    case 'over_25':
      base = 32 + profile.attack * 28 + (1 - profile.defense) * 15 + periodShift * 35;
      break;
    case 'over_15': {
      const o25 = 32 + profile.attack * 28 + (1 - profile.defense) * 15 + periodShift * 35;
      base = o25 + 18 + rnd(fixtureSalt, 5, 3);
      break;
    }
    case 'over_35': {
      const o25b = 32 + profile.attack * 28 + (1 - profile.defense) * 15 + periodShift * 35;
      base = o25b - 14 + rnd(fixtureSalt, 8, 4);
      break;
    }
    case 'over_45': {
      const o35 = 32 + profile.attack * 28 - 14 + rnd(fixtureSalt, 8, 4);
      base = o35 - 12 + rnd(fixtureSalt, 6, 6);
      break;
    }
    case 'under_25': {
      const o25c = 32 + profile.attack * 28 + (1 - profile.defense) * 15 + periodShift * 35;
      base = 100 - o25c + rnd(fixtureSalt, 5, 7);
      break;
    }
    case 'under_15': {
      const o15 = 32 + profile.attack * 28 + 18 + rnd(fixtureSalt, 5, 3);
      base = 100 - o15 + rnd(fixtureSalt, 4, 8);
      break;
    }
    case 'under_35': {
      const o35b = 32 + profile.attack * 28 - 14 + rnd(fixtureSalt, 8, 4);
      base = 100 - o35b + rnd(fixtureSalt, 4, 9);
      break;
    }
    case 'under_45':
      base = 88 + rnd(fixtureSalt, 6, 10);
      break;
    case 'over_05':
      base = 78 + profile.attack * 15 + rnd(fixtureSalt, 4, 11);
      break;
    case 'under_05': {
      const o05 = 78 + profile.attack * 15 + rnd(fixtureSalt, 4, 11);
      base = 100 - o05 + rnd(fixtureSalt, 3, 14);
      break;
    }
    case 'fts':
      base = 18 + (1 - profile.attack) * 35 + profile.defense * 10;
      break;
    case 'scored_first':
      base = 38 + profile.attack * 28 + homeAdvantage * 50 + form * 20;
      break;
    case 'early_1h':
      base = 28 + profile.attack * 20 + (ctx.period === 'firsthalf' ? 12 : -4);
      break;
    case 'early_2h_sc':
      base = 32 + profile.attack * 18 + (ctx.period === 'secondhalf' ? 10 : 0);
      break;
    case 'early_conc':
      base = 26 + (1 - profile.defense) * 22 + rnd(fixtureSalt, 8, 12);
      break;
    case 'late_goals':
      base = 35 + profile.attack * 15 + rnd(fixtureSalt, 10, 13);
      break;
    case 'handicap':
      base = 40 + profile.attack * 25 - profile.defense * 10 + homeAdvantage * 40;
      break;
    case 'score_05':
    case 'score_15':
    case 'score_25': {
      const sc = 38 + profile.attack * 42 + homeAdvantage * 80 + form * 30;
      base = sc - (statKey === 'score_25' ? 22 : statKey === 'score_15' ? 10 : 0);
      break;
    }
    case 'conc_05':
    case 'conc_15':
    case 'conc_25': {
      const conc = 42 + (1 - profile.defense) * 38 + (isHome ? -4 : 6) + form * 15;
      base = conc - (statKey === 'conc_25' ? 18 : statKey === 'conc_15' ? 8 : 0);
      break;
    }
    default:
      base = 45 + rnd(fixtureSalt, 20, hash(statKey));
  }

  const adjusted = base + salt + recencyShift * (rnd(fixtureSalt, 12, 20) > 0 ? 1 : -1) * 15;
  return Math.round(clamp(adjusted, 9, 91));
}

function complianceFromValue(val: number, unit: StatReading['unit'] = 'percent'): ComplianceLevel {
  if (unit === 'goals') return level(Math.round(val * 33));
  return level(val);
}

function makeReading(
  key: string,
  label: string,
  homeVal: number,
  awayVal: number,
  unit: StatReading['unit'] = 'percent',
): StatReading {
  return {
    key,
    label,
    home: homeVal,
    away: awayVal,
    homeLevel: complianceFromValue(homeVal, unit),
    awayLevel: complianceFromValue(awayVal, unit),
    unit,
  };
}

function buildOrdinary(fixture: Fixture, ctx: TableCtx): StatReading[] {
  const homeP = teamProfile(fixture.homeTeam.name);
  const awayP = teamProfile(fixture.awayTeam.name);
  const salt = hash(fixture.id + ctx.id);

  return ORDINARY_STATS.map((st) => {
    const unit: StatReading['unit'] =
      st.key === 'sc_avg' || st.key === 'conc_avg' ? 'goals' : 'percent';
    const homeRaw = teamPct(homeP, st.key, true, ctx, salt);
    const awayRaw = teamPct(awayP, st.key, false, ctx, salt + 7);
    const home = unit === 'goals' ? +(homeRaw / 28).toFixed(2) : homeRaw;
    const away = unit === 'goals' ? +(awayRaw / 28).toFixed(2) : awayRaw;
    return makeReading(st.key, st.label, home, away, unit);
  });
}

function buildLabeledStats(
  labels: readonly string[],
  fixture: Fixture,
  ctx: TableCtx,
  offset: number,
): StatReading[] {
  const homeP = teamProfile(fixture.homeTeam.name);
  const awayP = teamProfile(fixture.awayTeam.name);
  const salt = hash(fixture.id + ctx.id) + offset;

  return labels.map((label, i) => {
    const key = label.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const related =
      label.includes('BTTS')
        ? 'btts_yes'
        : label.includes('Over')
          ? 'over_25'
          : label.includes('Win')
            ? 'w'
            : 'cs';
    const home = teamPct(homeP, related, true, ctx, salt + i * 3);
    const away = teamPct(awayP, related, false, ctx, salt + i * 5 + 1);
    const jitter = rnd(salt, 9, i);
    return makeReading(
      key,
      label,
      Math.round(clamp(home + jitter, 8, 92)),
      Math.round(clamp(away - jitter * 0.7, 8, 92)),
    );
  });
}

function buildPpg(fixture: Fixture, ctx: TableCtx): PpgReading[] {
  const homeP = teamProfile(fixture.homeTeam.name);
  const awayP = teamProfile(fixture.awayTeam.name);
  const salt = hash(fixture.id + ctx.id + 'ppg');

  return PPG_SCOPES.map((scope, i) => {
    const isHomeScope = scope.includes('Home');
    const isAwayScope = scope.includes('Away');
    const is1H = scope.startsWith('1H');
    const is2H = scope.startsWith('2H');
    const profile = isHomeScope ? homeP : isAwayScope ? awayP : homeP;
    const blend = isHomeScope || isAwayScope ? 1 : 0.55;
    const periodMod = is1H ? 0.45 : is2H ? 0.52 : 1;
    const recencyMod = ctx.group === 'lastN' ? 1.08 + rnd(salt, 0.08, i) : 1;
    const ppg = +(
      (1.0 + profile.attack * 0.9 + profile.defense * 0.35 + profile.form * 0.4) *
      periodMod *
      recencyMod *
      blend
    ).toFixed(2);
    const green = +(ppg * (0.55 + profile.defense * 0.15)).toFixed(2);
    const yellow = +(ppg * 0.22 + rnd(salt, 0.08, i + 2)).toFixed(2);
    const red = +(Math.max(0.05, ppg - green - yellow)).toFixed(2);
    return { scope, ppg, greenPpg: green, yellowPpg: yellow, redPpg: red };
  });
}

function pickTopSignal(ordinary: StatReading[]): {
  market: string;
  selection: string;
  compliance: number;
  level: ComplianceLevel;
} {
  const candidates = [
    { key: 'over_25', market: 'Goals', selection: 'Over 2.5' },
    { key: 'btts_yes', market: 'BTTS', selection: 'BTTS Yes' },
    { key: 'w', market: '1X2', selection: 'Home Win' },
    { key: 'under_25', market: 'Goals', selection: 'Under 2.5' },
    { key: 'btts_no', market: 'BTTS', selection: 'BTTS No' },
    { key: 'cs', market: 'Clean Sheet', selection: 'Home CS' },
  ];
  let best = { market: 'Goals', selection: 'Over 2.5', compliance: 50, level: 'yellow' as ComplianceLevel };

  for (const c of candidates) {
    const row = ordinary.find((r) => r.key === c.key);
    if (!row) continue;
    const avg = Math.round((row.home + row.away) / 2);
    if (avg > best.compliance) {
      best = { ...c, compliance: avg, level: level(avg) };
    }
  }
  return best;
}

export function getTableContexts() {
  return TABLE_CONTEXTS;
}

export function getFixturePreviewStats(fixture: Fixture, count = 8): StatReading[] {
  const stats = buildFixtureStats(fixture, 'ft-overall');
  const keys = ['over_25', 'btts_yes', 'sc_pct', 'w', 'scored_first', 'over_15', 'cs', 'early_1h'];
  const picked = keys
    .map((k) => stats.ordinary.find((r) => r.key === k))
    .filter((r): r is StatReading => !!r);
  return picked.length >= count ? picked.slice(0, count) : stats.ordinary.slice(0, count);
}

export function buildFixtureStats(
  fixture: Fixture,
  tableContextId = 'ft-overall',
): FixtureStatsBundle {
  const ctx = TABLE_CONTEXTS.find((t) => t.id === tableContextId) ?? TABLE_CONTEXTS[0];
  const salt = hash(fixture.id + ctx.id);

  const ordinary = buildOrdinary(fixture, ctx);
  const ppg = buildPpg(fixture, ctx);
  const fulltimeOnly = buildLabeledStats(FULLTIME_ONLY_STATS, fixture, ctx, 100);
  const firstHalf = buildLabeledStats(FIRST_HALF_STATS, fixture, ctx, 200);
  const secondHalf = buildLabeledStats(SECOND_HALF_STATS, fixture, ctx, 300);
  const series = buildLabeledStats(SERIES_STATS, fixture, ctx, 400);
  const leagueAverages = buildLabeledStats(LEAGUE_AVG_STATS, fixture, ctx, 500).map((r) => ({
    ...r,
    home: Math.round((r.home + r.away) / 2 + rnd(salt, 5, 1)),
    away: Math.round((r.home + r.away) / 2 - rnd(salt, 4, 2)),
  }));

  const supportOverall = ordinary.filter((r) =>
    ['over_25', 'btts_yes', 'sc_pct', 'w', 'scored_first', 'over_15', 'cs', 'conc_pct'].includes(r.key),
  );
  const supportHome = ordinary
    .filter((r) => ['over_25', 'btts_yes', 'w', 'scored_first', 'over_15', 'cs'].includes(r.key))
    .map((r) => ({
      ...r,
      home: Math.round(clamp(r.home + 6 + rnd(salt, 4, 3), 10, 94)),
      homeLevel: level(clamp(r.home + 6, 10, 94)),
    }));
  const supportAway = ordinary
    .filter((r) => ['over_25', 'btts_yes', 'w', 'scored_first', 'over_15', 'fts'].includes(r.key))
    .map((r) => ({
      ...r,
      away: Math.round(clamp(r.away + 5 + rnd(salt, 4, 4), 10, 94)),
      awayLevel: level(clamp(r.away + 5, 10, 94)),
    }));

  const topPick = pickTopSignal(ordinary);
  const over25 = ordinary.find((r) => r.key === 'over_25');
  const btts = ordinary.find((r) => r.key === 'btts_yes');
  const win = ordinary.find((r) => r.key === 'w');

  const oddsFusion = [
    {
      market: 'Total Goals',
      selection: topPick.selection.includes('Over') ? 'Over 2.5' : topPick.selection,
      ourCompliance: topPick.compliance,
      bookOdds: 1.55 + rnd(salt, 0.45, 10),
      impliedProb: Math.round(100 / (1.55 + rnd(salt, 0.35, 11))),
      edge: Math.round(topPick.compliance - 100 / (1.72 + rnd(salt, 0.2, 12))),
      level: topPick.level,
    },
    {
      market: 'BTTS',
      selection: 'Yes',
      ourCompliance: btts ? Math.round((btts.home + btts.away) / 2) : 58,
      bookOdds: 1.58 + rnd(salt, 0.25, 13),
      impliedProb: 60,
      edge: btts ? Math.round((btts.home + btts.away) / 2 - 60) : 2,
      level: btts ? level((btts.home + btts.away) / 2) : 'yellow',
    },
    {
      market: 'Match Result',
      selection: fixture.homeTeam.shortName,
      ourCompliance: win ? Math.round(win.home) : 52,
      bookOdds: parseFloat(fixture.odds.home) || 2.1,
      impliedProb: Math.round(100 / (parseFloat(fixture.odds.home) || 2.1)),
      edge: win ? Math.round(win.home - 100 / (parseFloat(fixture.odds.home) || 2.1)) : 0,
      level: win ? level(win.home) : 'yellow',
    },
    {
      market: 'Asian Handicap',
      selection: `${fixture.homeTeam.shortName} -0.5`,
      ourCompliance: ordinary.find((r) => r.key === 'handicap')
        ? Math.round(
            (ordinary.find((r) => r.key === 'handicap')!.home +
              ordinary.find((r) => r.key === 'handicap')!.away) /
              2,
          )
        : 54,
      bookOdds: 1.9 + rnd(salt, 0.2, 14),
      impliedProb: 52,
      edge: 3,
      level: 'yellow' as ComplianceLevel,
    },
    {
      market: '1st Half Goals',
      selection: 'Over 0.5 HT',
      ourCompliance: ordinary.find((r) => r.key === 'early_1h')
        ? Math.round(
            (ordinary.find((r) => r.key === 'early_1h')!.home +
              ordinary.find((r) => r.key === 'early_1h')!.away) /
              2,
          )
        : 48,
      bookOdds: 1.38 + rnd(salt, 0.12, 15),
      impliedProb: 72,
      edge: -8,
      level: 'red' as ComplianceLevel,
    },
  ];

  const rfsOrdinary = [
    {
      label: 'Ordinary + RFS',
      team: fixture.homeTeam.name,
      failedStat: RFS_FAILURES[salt % RFS_FAILURES.length],
    },
    {
      label: 'Ordinary + RFS',
      team: fixture.awayTeam.name,
      failedStat: RFS_FAILURES[(salt + 3) % RFS_FAILURES.length],
    },
  ];

  const rfsSeries = [
    {
      label: 'Series + RFS',
      team: fixture.homeTeam.name,
      streakBroken: RFS_STREAKS[salt % RFS_STREAKS.length],
    },
    {
      label: 'Series + RFS',
      team: fixture.awayTeam.name,
      streakBroken: RFS_STREAKS[(salt + 2) % RFS_STREAKS.length],
    },
  ];

  const scHome = ordinary.find((r) => r.key === 'sc_pct');
  const motives = [
    `${fixture.homeTeam.name}: ${topPick.selection} aligns at ${topPick.compliance}% (${ctx.label})`,
    over25
      ? `Over 2.5 — Home ${over25.home}% · Away ${over25.away}% in this table`
      : null,
    btts ? `BTTS Yes — ${btts.home}% / ${btts.away}% split` : null,
    scHome ? `SC% home ${scHome.home}% vs away ${scHome.away}%` : null,
    win ? `Home win rate ${win.home}% in ${ctx.split} context` : null,
    ctx.group === 'lastN'
      ? `Last-N window (${ctx.recency}) — form weighted heavier`
      : `Season ${ctx.period} ${ctx.split} baseline`,
    `HT/FT patterns: ${HTFT_COMBOS[salt % HTFT_COMBOS.length]} among tracked combos`,
  ].filter((m): m is string => !!m);

  return {
    fixtureId: fixture.id,
    homeTeam: fixture.homeTeam.name,
    awayTeam: fixture.awayTeam.name,
    kickoff: fixture.kickoff,
    date: fixture.date,
    tableLabel: ctx.label,
    ordinary,
    ppg,
    fulltimeOnly,
    firstHalf,
    secondHalf,
    series,
    leagueAverages,
    rfsOrdinary,
    rfsSeries,
    oddsFusion,
    supportOverall,
    supportHome,
    supportAway,
    topPick: {
      market: topPick.market,
      selection: topPick.selection,
      compliance: topPick.compliance,
      level: topPick.level,
    },
    motives,
  };
}

export function getUpcomingFixtures(leagueId: string, date?: string) {
  return getFixturesForLeague(leagueId).filter(
    (f) => f.status === 'NS' && (!date || f.date === date),
  );
}
