/**
 * Unit tests for the API → recommendation-engine adapter.
 * Run: npx tsx scripts/apiRecommendationAdapter.test.ts
 */
import { oddsInputFromApi, predictionFromApiProbability } from '../utils/apiRecommendationAdapter';

let failures = 0;
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

// ---------------------------------------------------------------------------
console.log('Test A — probabilities convert from 0–100 to 0–1, missing lines bracketed');
// ---------------------------------------------------------------------------
{
  const p = predictionFromApiProbability({ home_win: 55, draw: 25, away_win: 20, o25: 60, btts: 45 });
  check('home/draw/away scaled to fractions', near(p.homeWin, 0.55) && near(p.draw, 0.25) && near(p.awayWin, 0.2));
  check('over 2.5 + btts scaled', near(p.over25, 0.6) && near(p.btts, 0.45));
  check('over 1.5 bracketed off 2.5 (+0.22)', near(p.over15, 0.82));
  check('over 3.5 bracketed off 2.5 (−0.22)', near(p.over35, 0.38));
  check('pick is home (highest)', p.pick === '1');
}

// ---------------------------------------------------------------------------
console.log('Test B — explicit o15/o35 are used verbatim; away pick');
// ---------------------------------------------------------------------------
{
  const p = predictionFromApiProbability({ home_win: 30, draw: 30, away_win: 40, o15: 75, o25: 50, o35: 25, btts: 55 });
  check('over 1.5 taken from o15', near(p.over15, 0.75));
  check('over 3.5 taken from o35', near(p.over35, 0.25));
  check('pick is away (highest)', p.pick === '2');
}

// ---------------------------------------------------------------------------
console.log('Test C — defaults + NaN guarding');
// ---------------------------------------------------------------------------
{
  const p = predictionFromApiProbability({});
  check('defaults to ~even result', near(p.homeWin, 0.34) && near(p.draw, 0.33) && near(p.awayWin, 0.33));
  check('default over 2.5 = 0.5, btts = 0.5', near(p.over25, 0.5) && near(p.btts, 0.5));

  const q = predictionFromApiProbability({ home_win: NaN, o25: NaN });
  check('NaN falls back to defaults', near(q.homeWin, 0.34) && near(q.over25, 0.5));
}

// ---------------------------------------------------------------------------
console.log('Test D — odds board maps to engine odds input');
// ---------------------------------------------------------------------------
{
  const o = oddsInputFromApi({
    ft_result: { home: 2.45, draw: 2.7, away: 3.0 },
    total_goals: { over_25: 1.4, under_25: 2.85, over_15: 1.57 },
    btts: { yes: 2.25, no: 1.57 },
  });
  check('1X2 prices mapped', o?.home === 2.45 && o?.draw === 2.7 && o?.away === 3.0);
  check('goal-line prices mapped', o?.over25 === 1.4 && o?.under25 === 2.85 && o?.over15 === 1.57);
  check('btts prices mapped', o?.bttsYes === 2.25 && o?.bttsNo === 1.57);

  check('undefined odds → null', oddsInputFromApi(undefined) === null);

  const partial = oddsInputFromApi({ ft_result: { home: 1.9, draw: 3.4, away: 4.2 } });
  check('missing markets leave fields undefined', partial?.home === 1.9 && partial?.over25 === undefined && partial?.bttsYes === undefined);
}

// ---------------------------------------------------------------------------
if (failures > 0) {
  console.error(`\n${failures} check(s) FAILED`);
  process.exit(1);
} else {
  console.log('\nAll checks passed ✅');
  process.exit(0);
}
