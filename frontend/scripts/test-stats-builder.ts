/**
 * Offline test for services/statsBuilder.ts — no network, no RN.
 * Run:  npx tsx scripts/test-stats-builder.ts
 */
import { buildStatsTables } from '../services/statsBuilder';

// Minimal RawFixture-shaped results (only the fields the builder reads).
const fx = (o: Partial<any>): any => ({
  competition_id: 100, status: 'FT', season: '2025/2026', ...o,
});

// Team A: 3 finished matches with known scores + HT scores.
const fixtures = [
  fx({ id: 1, unix: 300, home_name: 'A', away_name: 'B', home_id: 1, away_id: 2, home_goals: 2, away_goals: 1, ht_score: '1-0' }),
  fx({ id: 2, unix: 200, home_name: 'B', away_name: 'A', home_id: 2, away_id: 1, home_goals: 0, away_goals: 0, ht_score: '0-0' }),
  fx({ id: 3, unix: 100, home_name: 'A', away_name: 'C', home_id: 1, away_id: 3, home_goals: 3, away_goals: 3, ht_score: '2-1' }),
  fx({ id: 4, unix: 50, status: 'NS', home_name: 'A', away_name: 'B', home_goals: null, away_goals: null }), // ignored
];

let pass = 0, fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  if (got === want) { pass++; }
  else { fail++; console.log(`  FAIL ${name}: got ${got}, want ${want}`); }
};

const exp = buildStatsTables({ fixtures, season: '2025/2026' });

// 36 ordinary tables (4 windows × 3 periods × 3 scopes).
eq('table count', exp.meta.tables, 36);
eq('has ordinary_ft_overall', !!exp.tables['ordinary_ft_overall'], true);
eq('has last6_2h_away', !!exp.tables['last6_2h_away'], true);

const A = exp.tables['ordinary_ft_overall'].find((r) => r.team_name === 'A')!;
// FT overall for A over its 3 matches: (gf,ga) = (2,1),(0,0),(3,3)
eq('A sc_pct', A.sc_pct, 67);      // scored in 2/3
eq('A cs_pct', A.cs_pct, 33);      // clean sheet 1/3
eq('A fts_pct', A.fts_pct, 33);    // failed to score 1/3
eq('A w_pct', A.w_pct, 33);        // 1 win
eq('A d_pct', A.d_pct, 67);        // 2 draws
eq('A l_pct', A.l_pct, 0);
eq('A btts_yes', A.btts_yes, 67);
eq('A sc_avg', A.sc_avg, 1.7);     // (2+0+3)/3
eq('A conc_avg', A.conc_avg, 1.3); // (1+0+3)/3
eq('A avg_goals', A.avg_goals, 3); // (3+0+6)/3
eq('A over25', A.over25, 67);      // totals 3,0,6 -> 2 over 2.5
eq('A under25', A.under25, 33);
eq('A sc_pct signal', A.sc_pct_signal, 'green'); // 67 >= 65
eq('A w_pct signal', A.w_pct_signal, 'red');     // 33 < 45
eq('A sc_avg signal', A.sc_avg_signal, '');      // averages have no signal
eq('A scored_first is not-derivable', Number.isNaN(A.scored_first as number), true);

// HT period for A: HT (gf,ga) = (1,0),(0,0),(2,1)
const Aht = exp.tables['ordinary_ht_overall'].find((r) => r.team_name === 'A')!;
eq('A HT sc_avg', Aht.sc_avg, 1);  // (1+0+2)/3
eq('A HT cs_pct', Aht.cs_pct, 67); // conceded in HT only once

// 2H period for A: 2H = FT-HT = (1,1),(0,0),(1,2)
const A2h = exp.tables['ordinary_2h_overall'].find((r) => r.team_name === 'A')!;
eq('A 2H sc_avg', A2h.sc_avg, 0.7); // (1+0+1)/3

// Home scope: A was home in matches 1 and 3 only.
const Ahome = exp.tables['ordinary_ft_home'].find((r) => r.team_name === 'A')!;
eq('A home sample', (Ahome as any).sample_size, 2);
eq('A home w_pct', Ahome.w_pct, 50); // won 1 of 2 home (2-1 win, 3-3 draw)

// Away scope: A away in match 2 only (0-0).
const Aaway = exp.tables['ordinary_ft_away'].find((r) => r.team_name === 'A')!;
eq('A away sample', (Aaway as any).sample_size, 1);
eq('A away cs_pct', Aaway.cs_pct, 100);

console.log(`\n${pass}/${pass + fail} checks passed`);
if (fail === 0) {
  console.log('Sample row (ordinary_ft_overall / A):');
  console.log(JSON.stringify(
    { team_name: A.team_name, sc_pct: A.sc_pct, btts_yes: A.btts_yes, over25: A.over25, sc_avg: A.sc_avg, sample_size: (A as any).sample_size },
    null, 2,
  ));
}
process.exit(fail === 0 ? 0 : 1);
