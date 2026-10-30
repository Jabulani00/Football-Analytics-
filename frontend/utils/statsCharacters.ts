import { theme } from '@/styles/theme';

/**
 * Stats Characters model (from notes_transcription.txt).
 *
 * A team's "character" is read from two per-match rates:
 *   Sc   = % of its matches in which it SCORED      (scoring per match)
 *   Conc = % of its matches in which it CONCEDED    (conceding per match)
 * Each rate is graded ↑ (high) / (M) (middle) / ↓ (low), giving 9 possible
 * characters — "the true character of a side". Page references below point at
 * the source notes.
 */

export type CharLevel = 'up' | 'mid' | 'down';
/** Goals-abundance colour (Page 2): red = less goals, green = goal abundance, middle = in between. */
export type CharColour = 'red' | 'green' | 'middle';
/** Classification method (Pages 14–16). */
export type CharMethod = 'method1' | 'method2';

export type StatsCharacter = {
  n: number;
  sc: CharLevel;
  conc: CharLevel;
  /** Name, kept exactly as written in the notes. */
  name: string;
  /** Top dog / Underdog designation (Page 4). */
  role: string;
  colour: CharColour;
  /** Short call-out describing how the character plays (Pages 4–6, 9). */
  callout: string;
};

/**
 * The 9 characters (Page 1 grid), named on Page 4 and coloured per Page 2 / 10.
 * Indexed by Sc level then Conc level.
 */
export const STATS_CHARACTERS: StatsCharacter[] = [
  { n: 1, sc: 'down', conc: 'down', name: 'goal Suppressor', role: 'Top dog', colour: 'red', callout: 'King of unders — forces the opponent not to score while failing to score itself.' },
  { n: 2, sc: 'up', conc: 'down', name: 'dominator', role: 'Top dog', colour: 'middle', callout: 'Sc > Conc with the difference ↑ — scores freely and concedes little.' },
  { n: 3, sc: 'mid', conc: 'down', name: 'Suppressor nkunzi', role: 'Underdog · almost Suppressor', colour: 'red', callout: 'Underdog suppressor — restricts goals, scores moderately.' },
  { n: 4, sc: 'down', conc: 'mid', name: 'Umdliwa, yeild unders', role: 'Underdog', colour: 'red', callout: 'Gets beaten but yields unders — low scoring, mid conceding.' },
  { n: 5, sc: 'up', conc: 'mid', name: 'BTTS & win', role: 'Top dog', colour: 'green', callout: 'Top dog that both-teams-score and still wins.' },
  { n: 6, sc: 'mid', conc: 'mid', name: 'amanzi behaviour (mabhutiza)', role: 'Top dog / underdog', colour: 'middle', callout: 'Enabler of goals — mid scoring, mid conceding, in between.' },
  { n: 7, sc: 'down', conc: 'up', name: 'Umdliwa (Pure Underdog)', role: 'Underdog', colour: 'middle', callout: 'Pure underdog — low scoring, high conceding.' },
  { n: 8, sc: 'up', conc: 'up', name: 'BTTS & goals up', role: '', colour: 'green', callout: 'Both teams score and goals go up — high scoring, high conceding.' },
  { n: 9, sc: 'mid', conc: 'up', name: 'Umdliwa BTTS', role: 'Underdog', colour: 'green', callout: 'Underdog BTTS — mid scoring, high conceding, loses with goals.' },
];

const BY_LEVELS = new Map(STATS_CHARACTERS.map((c) => [`${c.sc}-${c.conc}`, c]));

export function characterFor(sc: CharLevel, conc: CharLevel): StatsCharacter {
  return BY_LEVELS.get(`${sc}-${conc}`)!;
}
export function characterByNumber(n: number): StatsCharacter | undefined {
  return STATS_CHARACTERS.find((c) => c.n === n);
}

export function levelGlyph(level: CharLevel): string {
  return level === 'up' ? '↑' : level === 'down' ? '↓' : '(M)';
}

/** Method 1 fixed bands (Page 15): 60–100 = ↑, 40–59 = (M), 0–39 = ↓. */
export function levelForPercentM1(pct: number | null): CharLevel | null {
  if (pct == null) return null;
  return pct >= 60 ? 'up' : pct >= 40 ? 'mid' : 'down';
}

/**
 * Method 2 relative band (Page 16, "on a league"): rank the value against the
 * league's spread of that same rate and split into thirds — top third ↑,
 * middle third (M), bottom third ↓.
 */
export function levelForRankM2(pct: number | null, sortedDesc: number[]): CharLevel | null {
  if (pct == null || sortedDesc.length < 3) return null;
  const idx = sortedDesc.findIndex((v) => v <= pct);
  const rank = idx === -1 ? sortedDesc.length - 1 : idx;
  const third = sortedDesc.length / 3;
  return rank < third ? 'up' : rank < third * 2 ? 'mid' : 'down';
}

/** Strategy letters by colour pair (Pages 2–3). Order of the two teams does not matter. */
export type StrategyLetter = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
export const STRATEGY_INFO: Record<StrategyLetter, { pair: string; note: string }> = {
  A: { pair: 'green + green', note: 'Goal abundance both ways.' },
  B: { pair: 'green + middle', note: 'Abundance meets a balanced side.' },
  C: { pair: 'red + green', note: 'Less-goals side meets an abundance side.' },
  D: { pair: 'middle + middle', note: 'Two balanced sides.' },
  E: { pair: 'red + middle', note: 'Less-goals side meets a balanced side.' },
  F: { pair: 'red + red', note: 'Reduced goals both ways.' },
};
const STRATEGY_BY_PAIR: Record<string, StrategyLetter> = {
  'green|green': 'A', 'green|middle': 'B', 'green|red': 'C',
  'middle|middle': 'D', 'middle|red': 'E', 'red|red': 'F',
};
export function strategyFor(a: CharColour, b: CharColour): StrategyLetter {
  const key = [a, b].sort().join('|'); // alphabetical: green < middle < red
  return STRATEGY_BY_PAIR[key];
}

export function colourTint(colour: CharColour): string {
  return colour === 'green' ? theme.accentGreen : colour === 'red' ? theme.loss : theme.yellow;
}
export function colourBackground(colour: CharColour): string {
  return colour === 'green' ? 'rgba(5,150,105,0.10)' : colour === 'red' ? 'rgba(220,38,38,0.08)' : 'rgba(234,179,8,0.12)';
}

/** A distinct colour per strategy letter, so each blend reads differently. */
export const STRATEGY_COLOUR: Record<StrategyLetter, string> = {
  A: theme.accentGreen, B: theme.accentBlue, C: theme.accentPurple,
  D: theme.yellow, E: theme.accentOrange, F: theme.loss,
};
export function strategyBackground(letter: StrategyLetter): string {
  const bg: Record<StrategyLetter, string> = {
    A: 'rgba(5,150,105,0.10)', B: 'rgba(37,99,235,0.10)', C: 'rgba(124,58,237,0.10)',
    D: 'rgba(202,138,4,0.12)', E: 'rgba(234,88,12,0.10)', F: 'rgba(220,38,38,0.08)',
  };
  return bg[letter];
}

/**
 * Dorminator character mixing grading (Page 7). A desirability listing of a
 * strong scoring character mixed with a weaker/conceding one — strategy is
 * Team A ↑ vs Team B ↓. Order is the grade (1 = most desirable). (2)+(1) is kept
 * but flagged "Bad already"; (2)+(6) and (2)+(8) are crossed out (excluded).
 */
const DOMINATOR_MIX: { pair: [number, number]; bad?: boolean }[] = [
  { pair: [2, 7] }, { pair: [2, 4] }, { pair: [2, 9] }, { pair: [2, 1], bad: true },
  { pair: [5, 7] }, { pair: [5, 4] }, { pair: [5, 9] },
  { pair: [3, 7] }, { pair: [3, 4] }, { pair: [3, 9] },
  { pair: [8, 7] }, { pair: [8, 4] }, { pair: [8, 9] },
];
export type DominatorMix = { grade: number; total: number; bad: boolean };
export function dominatorMix(a: number, b: number): DominatorMix | null {
  const idx = DOMINATOR_MIX.findIndex((m) => (m.pair[0] === a && m.pair[1] === b) || (m.pair[0] === b && m.pair[1] === a));
  if (idx === -1) return null;
  return { grade: idx + 1, total: DOMINATOR_MIX.length, bad: !!DOMINATOR_MIX[idx].bad };
}

/**
 * BTTS character mixes (Page 8), graded 1–20 from safes (top) to riskies
 * (bottom). Order is the likelihood grade (1 = safest).
 */
const BTTS_MIX: { pair: [number, number]; note?: string }[] = [
  { pair: [8, 8] }, { pair: [8, 5] }, { pair: [8, 9] }, { pair: [8, 7] }, { pair: [8, 2] }, { pair: [8, 6] },
  { pair: [5, 9] }, { pair: [5, 5] }, { pair: [5, 7] }, { pair: [5, 2] }, { pair: [5, 6] },
  { pair: [9, 9] }, { pair: [9, 7] }, { pair: [9, 2] }, { pair: [9, 6] },
  { pair: [7, 7] }, { pair: [7, 2], note: 'Best when (2) is away.' }, { pair: [7, 6] },
  { pair: [2, 2] }, { pair: [2, 6] },
];
export type BttsBand = 'safe' | 'mid' | 'risky';
export type BttsMix = { grade: number; total: number; band: BttsBand; note?: string };
export function bttsMix(a: number, b: number): BttsMix | null {
  const idx = BTTS_MIX.findIndex((m) => (m.pair[0] === a && m.pair[1] === b) || (m.pair[0] === b && m.pair[1] === a));
  if (idx === -1) return null;
  const grade = idx + 1;
  const band: BttsBand = grade <= 7 ? 'safe' : grade <= 14 ? 'mid' : 'risky';
  return { grade, total: BTTS_MIX.length, band, note: BTTS_MIX[idx].note };
}
export function bttsBandTint(band: BttsBand): string {
  return band === 'safe' ? theme.accentGreen : band === 'mid' ? theme.yellow : theme.loss;
}
export function bttsBandBackground(band: BttsBand): string {
  return band === 'safe' ? 'rgba(5,150,105,0.10)' : band === 'mid' ? 'rgba(202,138,4,0.12)' : 'rgba(220,38,38,0.08)';
}

export const COLOUR_MEANINGS: { value: CharColour; label: string; meaning: string }[] = [
  { value: 'red', label: 'red', meaning: 'agent of less goals' },
  { value: 'green', label: 'green', meaning: 'agent of goal abundance' },
  { value: 'middle', label: 'middle', meaning: 'in between (balance)' },
];

/** Minimum-games gate for a reliable character: 8+ games overall (Page 13), 4+ per venue. */
export const MIN_GAMES_OVERALL = 8;
export const MIN_GAMES_PER_VENUE = 4;
