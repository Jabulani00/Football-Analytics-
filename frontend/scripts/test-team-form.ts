/** Offline test for services/teamForm.ts. Run: npx tsx scripts/test-team-form.ts */
import {
  awayVenue, baselineFromResults, chunk, computeTeamStrengths, homeVenue,
} from '../services/teamForm';

let pass = 0, fail = 0;
const approx = (n: string, got: number, want: number, tol = 1e-9) => {
  if (Math.abs(got - want) <= tol) pass++; else { fail++; console.log(`  FAIL ${n}: got ${got}, want ${want}`); }
};
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.log(`  FAIL ${n}`); } };

const fx = (o: Partial<any>): any => ({ status: 'FT', ...o });

// Team 1 across competitions: home 2-1, home 0-0, away (as away) 1-3, away 2-2, plus a non-finished.
const results = [
  fx({ id: 1, unix: 500, home_id: 1, away_id: 2, home_goals: 2, away_goals: 1 }),
  fx({ id: 2, unix: 400, home_id: 1, away_id: 3, home_goals: 0, away_goals: 0 }),
  fx({ id: 3, unix: 300, home_id: 4, away_id: 1, home_goals: 3, away_goals: 1 }),
  fx({ id: 4, unix: 200, home_id: 5, away_id: 1, home_goals: 2, away_goals: 2 }),
  fx({ id: 5, unix: 100, home_id: 1, away_id: 6, home_goals: null, away_goals: null, status: 'NS' }),
];

const s = computeTeamStrengths(results, 1);
ok('sample counts finished only', s.sample === 4);
// Home matches (id 1 & 2): scored 2,0 -> avg 1.0 ; conceded 1,0 -> avg 0.5
approx('home scAvg', s.home.scAvg, 1.0);
approx('home concAvg', s.home.concAvg, 0.5);
ok('home sample', s.home.sample === 2);
// Away matches (id 3 & 4): team1 scored 1,2 -> avg 1.5 ; conceded 3,2 -> avg 2.5
approx('away scAvg', s.away.scAvg, 1.5);
approx('away concAvg', s.away.concAvg, 2.5);
// overall scored 2+0+1+2=5 /4 = 1.25
approx('overall scAvg', s.overall.scAvg, 1.25);

// Venue fallback: a team with only away games falls back to overall for home.
const awayOnly = computeTeamStrengths(
  [fx({ id: 9, unix: 1, home_id: 7, away_id: 1, home_goals: 1, away_goals: 0 })],
  1,
);
ok('home falls back to overall', homeVenue(awayOnly).sample > 0);
ok('away venue present', awayVenue(awayOnly).sample === 1);

// Baseline: <20 finished -> fallback defaults
const b = baselineFromResults(results);
ok('baseline fallback when sparse', b.measured === false && b.homeAvg === 1.45);

// chunk
const c = chunk([1, 2, 3, 4, 5], 2);
ok('chunk sizes', c.length === 3 && c[0].length === 2 && c[2].length === 1);

console.log(`\n${pass}/${pass + fail} checks passed`);
process.exit(fail === 0 ? 0 : 1);
