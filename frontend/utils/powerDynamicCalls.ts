/**
 * Catalogue of power dynamics and the functions each one can be called for.
 * A screen can offer every function, or one function, without owning the tab list.
 */
export const ALL_POWER_FUNCTIONS = 'all';

export type PowerDynamicFunctionDef = {
  id: string;
  label: string;
  detail: string;
};

export type PowerDynamicCallDef = {
  id: string;
  index: string;
  name: string;
  detail: string;
  functions: PowerDynamicFunctionDef[];
};

const read = (detail: string): PowerDynamicFunctionDef[] => [
  { id: 'read', label: 'Full read', detail },
];

export const POWER_DYNAMIC_CALLS: PowerDynamicCallDef[] = [
  {
    id: 'baseline',
    index: '1',
    name: 'Baseline',
    detail: 'Original baseline, the gap board, and each streamline.',
    functions: [
      { id: 'original', label: 'Original', detail: 'The six-type baseline for both sides.' },
      { id: 'gap', label: 'Gap analysis', detail: 'Places between the two sides on the baseline.' },
      { id: 'bateteme_1', label: 'Bateteme 1', detail: 'First Bateteme stream.' },
      { id: 'bateteme_2', label: 'Bateteme 2', detail: 'Second Bateteme stream.' },
      { id: 'compliant', label: 'Compliant stream', detail: 'Compliant stream membership.' },
      { id: 'zidane_law', label: 'Zidane Law', detail: 'Zidane Law stream.' },
      { id: 'bookie', label: 'Bookie mistake', detail: 'Bookie mistake stream.' },
      { id: 'bookie2', label: 'Bookie mistake 2', detail: 'Second bookie-mistake stream.' },
    ],
  },
  {
    id: 'importance_3pts',
    index: '2',
    name: 'Importance of 3 pts',
    detail: 'How much the three points matter in the table.',
    functions: read('Who needs the win, and what a win changes.'),
  },
  {
    id: 'last5',
    index: '3',
    name: 'Last 5',
    detail: 'Initial state, league form, and the last-five reads.',
    functions: [
      { id: 'initial_state', label: 'Initial state', detail: 'Section 1 from the last five games.' },
      { id: 'league', label: 'League last 5', detail: 'Every side ranked by last-five form.' },
      { id: 'form_matchup', label: 'Form matchup', detail: 'The two sides’ last five, side by side.' },
      { id: 'diff', label: 'Last 5 difference', detail: 'How the last five compare across venues.' },
      { id: 'two_goal', label: 'Two-goal bands', detail: 'Wins and losses by two goals or more.' },
      { id: 'label_change', label: 'Label change', detail: 'Hidden strength and weakness from label moves.' },
      { id: 'death_trap', label: 'Death traps', detail: 'Runs of losses, wins, scoring, and conceding.' },
      { id: 'reverse', label: 'Reverse engineering', detail: 'What the recent results were building toward.' },
    ],
  },
  {
    id: 'form',
    index: 'F',
    name: 'Form',
    detail: 'Season form on the league table.',
    functions: read('Form table for this competition.'),
  },
  {
    id: 'h2h',
    index: '4',
    name: 'H2H',
    detail: 'Meetings between these two sides.',
    functions: [
      { id: 'overall', label: 'Overall', detail: 'Every recent meeting.' },
      { id: 'home', label: 'Home side at home', detail: 'Meetings at the home side’s ground.' },
      { id: 'away', label: 'Away side away', detail: 'Meetings with the away side on the road.' },
    ],
  },
  {
    id: 'form_child_beater',
    index: '5',
    name: 'Form + Child beater',
    detail: 'Form table with the child-beater mark.',
    functions: [
      { id: 'table', label: 'Overall', detail: 'Season table with child-beater marks.' },
      { id: 'ft', label: 'Full time', detail: 'Full-time form and child beater.' },
      { id: '1h', label: '1st half', detail: 'First-half form and child beater.' },
      { id: '2h', label: '2nd half', detail: 'Second-half form and child beater.' },
    ],
  },
  {
    id: 'home_away_strong',
    index: '6',
    name: 'Home/Away strong',
    detail: 'Which side is strong at home or away.',
    functions: read('Home and away strength for both sides.'),
  },
  {
    id: 'colour_verification',
    index: '7',
    name: 'Colour verification',
    detail: 'Rank a stat by colour, or read PPG against the colour plan.',
    functions: [
      { id: 'verify', label: 'Colour verification', detail: 'Pick a stat and test the opponent’s colour.' },
      { id: 'ppg_colour', label: 'PPG vs colour', detail: 'Whether PPG matches the green, yellow, or red plan.' },
    ],
  },
  {
    id: 'character',
    index: '8',
    name: 'Character',
    detail: 'How each side tends to play the game.',
    functions: read('Character read for both sides.'),
  },
  {
    id: 'middle_guys',
    index: '9',
    name: 'Middle guys',
    detail: 'Strong show and weak show through the middle of the table.',
    functions: read('Middle-of-the-table show for both sides.'),
  },
  {
    id: 'bhozoma',
    index: '10',
    name: 'Bhozoma',
    detail: 'Points taken against sides above and below.',
    functions: read('Bhozoma table for this season.'),
  },
  {
    id: 'problem_causer',
    index: '11',
    name: 'Problem causer',
    detail: 'Who has been the problem in this matchup.',
    functions: read('Problem-causer read from the head-to-head.'),
  },
  {
    id: 'imbangi',
    index: '12',
    name: 'Imbangi',
    detail: 'Level on the table and what is still left to play.',
    functions: read('Imbangi for the sides still in range.'),
  },
  {
    id: 'indlela',
    index: '13',
    name: 'Indlela',
    detail: 'The path of the last opponent, this one, and the next.',
    functions: read('Last, current, and next opponent on the path.'),
  },
  {
    id: 'competition_status',
    index: '14',
    name: 'Competition status',
    detail: 'Where the competition sits for each side.',
    functions: read('Competition status for both sides.'),
  },
  {
    id: 'lost_twice',
    index: '15',
    name: 'Never lost twice',
    detail: 'Whether a side has avoided back-to-back losses.',
    functions: read('Never lost two matches in a row.'),
  },
  {
    id: 'won_twice',
    index: '16',
    name: 'Never won twice',
    detail: 'Whether a side has avoided back-to-back wins.',
    functions: read('Never won two matches in a row.'),
  },
  {
    id: 'won_6',
    index: '17',
    name: 'Won 6 in a row',
    detail: 'A current run of six wins or more.',
    functions: read('Six wins in a row, or the recent results.'),
  },
  {
    id: 'lost_6',
    index: '18',
    name: 'Lost 6 in a row',
    detail: 'A current run of six losses or more.',
    functions: read('Six losses in a row, or the recent results.'),
  },
  {
    id: 'points_diff',
    index: '19',
    name: 'Points difference',
    detail: 'The gap in points between the two sides.',
    functions: read('Points between the two sides on the table.'),
  },
  {
    id: 'child_beater_2',
    index: '20',
    name: 'Child beater (2)',
    detail: 'Yellow-band sides beating bottom-third opponents.',
    functions: read('Child beater, method 2.'),
  },
  {
    id: 'sudden_drop',
    index: '21',
    name: 'Sudden drop',
    detail: 'Earlier PPG above the last five.',
    functions: read('A drop from the earlier PPG into the last five.'),
  },
  {
    id: 'sudden_pickup',
    index: '22',
    name: 'Sudden pick up',
    detail: 'Earlier PPG below the last five.',
    functions: read('A rise from the earlier PPG into the last five.'),
  },
  {
    id: 'contested_leagues',
    index: '23',
    name: 'Contested leagues',
    detail: 'How tight the league is around these sides.',
    functions: read('How contested this league is.'),
  },
  {
    id: 'struggle',
    index: '25',
    name: 'Struggle 2–3 games',
    detail: 'A short run of struggle in the recent games.',
    functions: read('Struggle across the last two or three games.'),
  },
];

const BY_ID = new Map(POWER_DYNAMIC_CALLS.map((item) => [item.id, item]));

export function powerDynamicCall(id: string): PowerDynamicCallDef | undefined {
  return BY_ID.get(id);
}

export function powerDynamicFunction(tabId: string, functionId: string): PowerDynamicFunctionDef | undefined {
  return powerDynamicCall(tabId)?.functions.find((item) => item.id === functionId);
}
