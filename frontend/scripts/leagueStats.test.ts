/**
 * Unit tests for the League Stats engine (spec §4.7).
 */
import { __internals, buildStatsTables } from '../services/statsBuilder';
import {
  buildLeagueStatTable,
  DEFAULT_LEAGUE_STAT,
  LEAGUE_STAT_DEFS,
  LEAGUE_STAT_EXCLUDED,
  LEAGUE_STAT_GROUPS,
  leagueStatDef,
  leagueStatsInGroup,
  MIN_LEAGUE_SAMPLE,
} from '../utils/leagueStats';
import type { TeamStatRow } from '../types/data';

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

/** Only the RawFixture fields the builder reads. */
function fixture(home: string, away: string, hg: number, ag: number, ht = '0-0'): any {
  seq += 1;
  return {
    id: seq,
    unix: 1_000_000 - seq,
    competition_id: 7,
    season: '2025/2026',
    status: 'FT',
    home_name: home,
    away_name: away,
    home_goals: hg,
    away_goals: ag,
    ht_score: ht,
  };
}

function tablesFor(fixtures: any[]) {
  const exp = buildStatsTables({ fixtures, season: '2025/2026' });
  return {
    teamRows: exp.tables['ordinary_ft_overall'] ?? [],
    leagueRow: exp.tables['league_avg_ft_overall']?.[0],
  };
}

console.log('\nLeague stats — the §4.7 stat set');
{
  const keys = LEAGUE_STAT_DEFS.map((d) => d.key);
  const ordinary = __internals.ORDINARY_STATS as readonly string[];
  const notDerivable = __internals.NOT_DERIVABLE as Set<string>;
  const expected = ordinary.filter(
    (k) => !(LEAGUE_STAT_EXCLUDED as readonly string[]).includes(k) && !notDerivable.has(k),
  );

  check('26 stats in the set', keys.length === 26, `got ${keys.length}`);
  check('keys are unique', new Set(keys).size === keys.length);
  check(
    'set is Ordinary minus SC%/Conc% minus the non-derivable six',
    expected.length === keys.length && expected.every((k) => keys.includes(k)),
    `expected ${expected.length} keys`,
  );
  check('SC% is excluded', !keys.includes('sc_pct'));
  check('Conc% is excluded', !keys.includes('conc_pct'));
  check('goal-timing stats are excluded', !keys.some((k) => notDerivable.has(k)));
  check(
    'the six the client listed are all present',
    ['btts_yes', 'btts_no', 'over25', 'over35', 'under25', 'under35'].every((k) => keys.includes(k)),
  );
  check(
    'every stat belongs to a declared group',
    LEAGUE_STAT_DEFS.every((d) => LEAGUE_STAT_GROUPS.some((g) => g.id === d.group)),
  );
  check(
    'every group has at least one stat',
    LEAGUE_STAT_GROUPS.every((g) => leagueStatsInGroup(g.id).length > 0),
  );
  check(
    'only the three goal averages are unbanded',
    LEAGUE_STAT_DEFS.filter((d) => d.avg).map((d) => d.key).join(',') ===
      'avg_goals,sc_avg,conc_avg',
  );
  check('the default stat exists', leagueStatDef(DEFAULT_LEAGUE_STAT) != null);
  check('an unknown key has no def', leagueStatDef('sc_pct') == null);
}

console.log('\nLeague stats — ranking against the league average');
{
  // A wins everything 3-0, B loses everything 0-3, C/D trade 1-1 draws.
  const fixtures = [
    fixture('A', 'B', 3, 0),
    fixture('A', 'C', 3, 0),
    fixture('A', 'D', 3, 0),
    fixture('B', 'C', 0, 3),
    fixture('B', 'D', 0, 3),
    fixture('C', 'D', 1, 1),
    fixture('D', 'C', 1, 1),
    fixture('D', 'B', 3, 0),
  ];
  const { teamRows, leagueRow } = tablesFor(fixtures);
  const table = buildLeagueStatTable({ statKey: 'w_pct', teamRows, leagueRow, minSample: 1 });

  check('a table is returned', table != null);
  check('one row per team', table?.rows.length === 4, `got ${table?.rows.length}`);
  check('ranks run 1..n', table!.rows.every((r, i) => r.rank === i + 1));
  check(
    'sorted highest first',
    table!.rows.every((r, i) => i === 0 || table!.rows[i - 1].value >= r.value),
  );
  check('A tops win%', table?.rows[0].team === 'A' && table?.rows[0].value === 100);
  check('B is last on win%', table?.rows[3].team === 'B' && table?.rows[3].value === 0);

  const avg = table?.average;
  check('the average row is present', avg != null);
  check(
    'the average reuses the builder league_avg value',
    avg?.value === leagueRow?.w_pct,
    `panel ${avg?.value} vs builder ${leagueRow?.w_pct}`,
  );
  check('the average counts every team', avg?.teams === 4, `got ${avg?.teams}`);
  check(
    'diffs are value minus the average',
    table!.rows.every((r) => Math.abs(r.value - (avg?.value ?? 0) - r.diff) < 0.051),
  );
  check('the leader reads above average', table?.rows[0].side === 'above');
  check('the tail reads below average', table?.rows[3].side === 'below');
  check(
    'the divider sits after the last above-average team',
    table?.divideAfter === table!.rows.filter((r) => r.side !== 'below').length,
  );
  check(
    'bands come from the builder signal',
    table?.rows[0].level === 'green' && table?.rows[3].level === 'red',
    `${table?.rows[0].level} / ${table?.rows[3].level}`,
  );
  check('percentage values are whole numbers', table!.rows.every((r) => Number.isInteger(r.value)));
}

console.log('\nLeague stats — averages vs percentages');
{
  const { teamRows, leagueRow } = tablesFor([
    fixture('A', 'B', 3, 1),
    fixture('B', 'A', 0, 0),
    fixture('A', 'B', 2, 2),
  ]);
  const goals = buildLeagueStatTable({ statKey: 'avg_goals', teamRows, leagueRow, minSample: 1 });
  check('avg_goals is flagged as an average', goals?.stat.avg === true);
  check('both teams see the same total-goals average', goals?.rows[0].value === goals?.rows[1].value);
  check('the value keeps one decimal', goals?.rows[0].value === 2.7, `got ${goals?.rows[0].value}`);
  check('averages carry no traffic-light band', goals?.rows.every((r) => r.level === null) === true);
  check('everyone is level with the average', goals?.divideAfter === 2);

  const btts = buildLeagueStatTable({ statKey: 'btts_yes', teamRows, leagueRow, minSample: 1 });
  check('percentage stats do get a band', btts?.rows[0].level !== null);
}

console.log('\nLeague stats — sample-size guard');
{
  // A has 5 finished games, E only 1 — and E's single game is a 4-1 BTTS win.
  const fixtures = [
    fixture('A', 'B', 1, 0),
    fixture('A', 'C', 1, 0),
    fixture('A', 'D', 1, 0),
    fixture('B', 'A', 0, 1),
    fixture('C', 'A', 0, 1),
    fixture('E', 'B', 4, 1),
  ];
  const { teamRows, leagueRow } = tablesFor(fixtures);
  const table = buildLeagueStatTable({ statKey: 'btts_yes', teamRows, leagueRow })!;
  const e = table.rows.find((r) => r.team === 'E');
  const a = table.rows.find((r) => r.team === 'A');

  check('E tops the ranking on one game', e?.rank === 1 && e.value === 100);
  check('E is flagged as a thin sample', e?.thin === true);
  check('E carries its game count', e?.sample === 1, `got ${e?.sample}`);
  check('A clears the sample threshold', a?.thin === false && (a?.sample ?? 0) >= MIN_LEAGUE_SAMPLE);
  check('thin teams are counted', table.thinTeams >= 1, `got ${table.thinTeams}`);
  check('the smallest sample is surfaced', table.average?.minSample === 1);
}

console.log('\nLeague stats — fallbacks');
{
  const rows: TeamStatRow[] = [
    { team_name: 'A', league_id: '7', season: 's', over25: 80, sample_size: 10 },
    { team_name: 'B', league_id: '7', season: 's', over25: 40, sample_size: 10 },
    { team_name: 'C', league_id: '7', season: 's', over25: Number.NaN, sample_size: 0 },
  ];

  const table = buildLeagueStatTable({ statKey: 'over25', teamRows: rows, minSample: 1 })!;
  check('teams with no value are dropped', table.rows.length === 2);
  check('the mean stands in for a missing league row', table.average?.value === 60);
  check('the fallback average still bands', table.average?.level === 'yellow');
  check(
    'bands fall back to the shared percentage thresholds',
    table.rows[0].level === 'green' && table.rows[1].level === 'yellow',
  );

  check(
    'an unknown stat key returns null',
    buildLeagueStatTable({ statKey: 'scored_first', teamRows: rows }) === null,
  );
  check(
    'SC% is not rankable here',
    buildLeagueStatTable({ statKey: 'sc_pct', teamRows: rows }) === null,
  );
}

console.log('\nLeague stats — empty input');
{
  const empty = buildLeagueStatTable({ statKey: 'btts_yes', teamRows: [] })!;
  check('no rows from no teams', empty.rows.length === 0);
  check('no average from no teams', empty.average === null);
  check('the divider collapses', empty.divideAfter === 0);
  check('the stat def still comes back', empty.stat.key === 'btts_yes');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
