/** Offline test for oddsVerdict. Run: npx tsx scripts/test-odds-verdict.ts */
import { oddsVerdict } from '../utils/matchDetailDisplay';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.log(`  FAIL ${n}`); } };

// Values are 0–100 percentages.
ok('null when no result prob', oddsVerdict(undefined, 'A', 'B') === null);
ok('null when home_win missing', oddsVerdict({ draw: 30 } as any, 'A', 'B') === null);

const strong = oddsVerdict({ home_win: 68, draw: 20, away_win: 12, o25: 65, btts: 62 }, 'Arsenal', 'Spurs')!;
ok('strong home favoured', strong.startsWith('Arsenal strongly fancied'));
ok('mentions goals', strong.includes('goals expected'));
ok('mentions btts', strong.includes('both to score'));

const edge = oddsVerdict({ home_win: 40, draw: 33, away_win: 27, o25: 35 }, 'A', 'B')!;
ok('slight edge home', edge.includes('slight edge to A'));
ok('low scoring lean', edge.includes('low-scoring lean'));

const away = oddsVerdict({ home_win: 20, draw: 25, away_win: 55 }, 'A', 'B')!;
ok('away favoured', away.startsWith('B favoured'));

const evenDraw = oddsVerdict({ home_win: 25, draw: 45, away_win: 30 }, 'A', 'B')!;
ok('draw in play', evenDraw.includes('draw in play'));

console.log(`\n${pass}/${pass + fail} checks passed`);
process.exit(fail === 0 ? 0 : 1);
