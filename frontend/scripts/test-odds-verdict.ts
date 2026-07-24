/** Offline test for oddsVerdict + formatOutcome + groupOddsMarkets. */
import { formatOutcome, groupOddsMarkets, oddsVerdict } from '../utils/matchDetailDisplay';

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

// formatOutcome
ok('over_25 -> Over 2.5', formatOutcome('over_25') === 'Over 2.5');
ok('under_05 -> Under 0.5', formatOutcome('under_05') === 'Under 0.5');
ok('home_p1 -> Home +1', formatOutcome('home_p1') === 'Home +1');
ok('away_m025 -> Away −0.25', formatOutcome('away_m025') === 'Away −0.25');
ok('yes -> Yes', formatOutcome('yes') === 'Yes');

// groupOddsMarkets — categories + order
const mk = (market: string) => ({ market, label: market, outcomes: [{ key: 'a', value: 2 }] });
const groups = groupOddsMarkets([mk('total_corners'), mk('ft_result'), mk('total_goals'), mk('asian_handicap')]);
ok('4 categories', groups.length === 4);
ok('Match & BTTS first', groups[0].category === 'Match & BTTS');
ok('Goals second', groups[1].category === 'Goals');
ok('Handicap before Corners', groups[2].category === 'Handicap' && groups[3].category === 'Corners');

console.log(`\n${pass}/${pass + fail} checks passed`);
process.exit(fail === 0 ? 0 : 1);
