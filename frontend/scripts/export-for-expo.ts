/**
 * Export mock fixtures + stats evidence to assets/data/ (no Python required).
 * Run: npm run export-data
 */
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

import { mockFixtures } from '../mock/fixturesData';

const ROOT = process.cwd();
const DATA_DIR = join(ROOT, 'assets', 'data');
const MODEL_DIR = join(ROOT, 'assets', 'models', 'btts');

const HISTORICAL = [
  { home: 'Man City', away: 'Liverpool', score: '2-1', btts: true, over25: true, vector: [62, 58, 32, 2.1, 2.8, 60, 55, 28, 1.9, 2.6] },
  { home: 'Arsenal', away: 'Chelsea', score: '1-1', btts: true, over25: false, vector: [58, 48, 38, 2.0, 2.2, 56, 50, 30, 1.8, 2.3] },
  { home: 'Bayern Munich', away: 'Dortmund', score: '3-2', btts: true, over25: true, vector: [65, 62, 25, 2.3, 3.1, 63, 58, 22, 2.0, 2.9] },
  { home: 'Real Madrid', away: 'Barcelona', score: '2-0', btts: false, over25: false, vector: [55, 45, 42, 2.2, 2.4, 54, 48, 35, 2.1, 2.5] },
  { home: 'Celtic', away: 'Rangers', score: '2-2', btts: true, over25: true, vector: [60, 52, 30, 1.9, 2.7, 58, 54, 32, 1.7, 2.6] },
  { home: 'PSG', away: 'Monaco', score: '1-0', btts: false, over25: false, vector: [52, 40, 45, 2.0, 2.0, 50, 46, 38, 1.6, 2.1] },
  { home: 'Inter Milan', away: 'Napoli', score: '3-1', btts: true, over25: true, vector: [57, 55, 33, 2.1, 2.9, 59, 53, 29, 1.9, 2.7] },
  { home: 'Newcastle', away: 'Tottenham', score: '0-0', btts: false, over25: false, vector: [48, 42, 40, 1.5, 1.8, 50, 44, 36, 1.7, 2.0] },
  { home: 'Lyon', away: 'Marseille', score: '2-1', btts: true, over25: true, vector: [54, 50, 34, 1.8, 2.5, 53, 49, 31, 1.8, 2.4] },
  { home: 'Ajax', away: 'PSV', score: '1-2', btts: true, over25: true, vector: [61, 56, 28, 2.0, 2.8, 64, 60, 26, 2.2, 3.0] },
];

function cosine(a: number[], b: number[]) {
  const dot = a.reduce((s, v, i) => s + v * b[i], 0);
  const na = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
  const nb = Math.sqrt(b.reduce((s, v) => s + v * v, 0));
  return na && nb ? dot / (na * nb) : 0;
}

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function statValue(stat: string, team: string, league: string, table: string) {
  const base = 50 + (hash(team + league + stat) % 30) - 15;
  const mod = table.includes('last10') ? 4 : table.includes('last8') ? 7 : table.includes('last6') ? 11 : 0;
  return Math.min(95, Math.max(5, base + mod));
}

function signal(v: number) {
  if (v >= 65) return 'green';
  if (v >= 45) return 'yellow';
  return 'red';
}

const ORDINARY_STATS = [
  'sc_pct', 'conc_pct', 'sc_avg', 'conc_avg', 'btts_yes', 'btts_no', 'cs_pct', 'avg_goals',
  'fts_pct', 'w_pct', 'd_pct', 'l_pct', 'over05', 'over15', 'over25', 'over35', 'over45',
  'under05', 'under15', 'under25', 'under35', 'under45', 'scoring_05', 'conceding_05',
  'scoring_15', 'conceding_15', 'scoring_25', 'conceding_25', 'scored_first', 'handicap',
  'early_goals_1h', 'early_goals_2h', 'early_goals_conceded', 'late_goals',
];

const PERIODS = ['ft', 'ht', '2h'];
const SPLITS = ['overall', 'home', 'away'];
const FAMILIES = ['ordinary', 'ppg', 'series', 'ft_only', 'league_avg'];
const LAST_N = ['last10', 'last8', 'last6'];

/** Tables bundled with the app (keeps JSON small; full 72 export via backend db:export). */
const BUNDLE_TABLES = [
  'ordinary_ft_overall',
  'ordinary_ft_home',
  'ordinary_ft_away',
  'ppg_ft_overall',
  'last10_ft_overall',
  'last8_ft_away',
  'last6_ft_home',
];

function allTables() {
  const base = FAMILIES.flatMap((f) => PERIODS.flatMap((p) => SPLITS.map((s) => `${f}_${p}_${s}`)));
  const last = LAST_N.flatMap((w) => PERIODS.flatMap((p) => SPLITS.map((s) => `${w}_${p}_${s}`)));
  return [...base, ...last];
}

function buildTeamStats() {
  const teamsByLeague: Record<string, Set<string>> = {};
  for (const [leagueId, fixtures] of Object.entries(mockFixtures)) {
    teamsByLeague[leagueId] = new Set();
    for (const f of fixtures) {
      teamsByLeague[leagueId].add(f.homeTeam.name);
      teamsByLeague[leagueId].add(f.awayTeam.name);
    }
  }

  const tables: Record<string, object[]> = {};
  for (const table of BUNDLE_TABLES) {
    tables[table] = [];
    for (const [leagueId, teams] of Object.entries(teamsByLeague)) {
      for (const team of teams) {
        const row: Record<string, string | number> = {
          team_name: team,
          league_id: leagueId,
          season: '2024/25',
        };
        for (const stat of ORDINARY_STATS) {
          const v = statValue(stat, team, leagueId, table);
          row[stat] = v;
          row[`${stat}_signal`] = signal(v);
        }
        tables[table].push(row);
      }
    }
  }

  return {
    meta: {
      tables: BUNDLE_TABLES.length,
      statsPerTable: ORDINARY_STATS.length,
      exported_at: new Date().toISOString(),
      note: 'Bundled subset for app; run backend db:export for all 72 tables',
    },
    tables,
  };
}

function fixtureVector(home: string, away: string, league: string) {
  return [
    statValue('btts_yes', home, league, 'ordinary_ft_overall'),
    statValue('over25', home, league, 'ordinary_ft_overall'),
    statValue('cs_pct', home, league, 'ordinary_ft_overall'),
    1.6 + (hash(home) % 10) / 20,
    2.2 + (hash(home + away) % 10) / 15,
    statValue('btts_yes', away, league, 'ordinary_ft_overall'),
    statValue('over25', away, league, 'ordinary_ft_overall'),
    statValue('cs_pct', away, league, 'ordinary_ft_overall'),
    1.6 + (hash(away) % 10) / 20,
    2.2 + (hash(away + home) % 10) / 15,
  ];
}

function buildEvidence(label: string, vector: number[]) {
  const scored = HISTORICAL.map((m) => ({ ...m, similarity_score: Math.round(cosine(vector, m.vector) * 1000) / 1000 }))
    .sort((a, b) => b.similarity_score - a.similarity_score)
    .slice(0, 10);
  const n = scored.length || 1;
  return {
    fixture: label,
    similar_matches: scored.map(({ home, away, score, btts, over25, similarity_score }) => ({
      home, away, score, btts, over25, similarity_score,
    })),
    btts_hit_rate: Math.round((scored.filter((m) => m.btts).length / n) * 100) / 100,
    over25_hit_rate: Math.round((scored.filter((m) => m.over25).length / n) * 100) / 100,
  };
}

function buildSimilarMatches() {
  const fixtures: Record<string, ReturnType<typeof buildEvidence>> = {};
  for (const [leagueId, list] of Object.entries(mockFixtures)) {
    for (const f of list) {
      const label = `${f.homeTeam.name} vs ${f.awayTeam.name}`;
      fixtures[f.id] = buildEvidence(label, fixtureVector(f.homeTeam.name, f.awayTeam.name, leagueId));
    }
  }
  return {
    meta: { exported_at: new Date().toISOString(), method: 'cosine_similarity' },
    fixtures,
    default: buildEvidence('Generic fixture', [55, 52, 35, 1.8, 2.5, 55, 52, 35, 1.8, 2.5]),
  };
}

function buildFixturesExport() {
  const fixtures = Object.entries(mockFixtures).flatMap(([leagueId, list]) =>
    list.map((f) => ({
      id: f.id,
      leagueId,
      date: f.date,
      kickoff: f.kickoff,
      status: f.status,
      homeTeam: f.homeTeam,
      awayTeam: f.awayTeam,
    })),
  );
  return { meta: { exported_at: new Date().toISOString(), count: fixtures.length }, fixtures };
}

const scaler = {
  feature_names: [
    'home_btts_pct', 'home_over25_pct', 'home_cs_pct', 'home_ppg', 'home_avg_goals',
    'away_btts_pct', 'away_over25_pct', 'away_cs_pct', 'away_ppg', 'away_avg_goals',
  ],
  mean: [55, 52, 35, 1.6, 2.5, 55, 52, 35, 1.6, 2.5],
  std: [12, 14, 10, 0.4, 0.6, 12, 14, 10, 0.4, 0.6],
  weights: [0.08, 0.05, -0.03, 0.12, 0.06, 0.08, 0.05, -0.03, 0.12, 0.06],
  bias: -0.35,
  market: 'btts',
};

mkdirSync(DATA_DIR, { recursive: true });
mkdirSync(MODEL_DIR, { recursive: true });

writeFileSync(join(DATA_DIR, 'team_stats.json'), JSON.stringify(buildTeamStats(), null, 2));
writeFileSync(join(DATA_DIR, 'fixtures.json'), JSON.stringify(buildFixturesExport(), null, 2));
writeFileSync(join(DATA_DIR, 'similar_matches.json'), JSON.stringify(buildSimilarMatches(), null, 2));
writeFileSync(join(MODEL_DIR, 'scaler.json'), JSON.stringify(scaler, null, 2));

console.log('Exported assets/data/* and assets/models/btts/scaler.json');
