import type { ComplianceLevel } from '@/types/analytics';
import { theme } from '@/styles/theme';

/**
 * The traffic-light signal — the single definition for the whole app.
 *
 * It answers one question: **how often does this stat land?** A stat that
 * happens in 65% or more of matches is green, 45–64% is yellow, under 45% is
 * red. Nothing else is read into it: a high "Fails to score" is still green,
 * because green means "reliable", not "good".
 *
 * These cut-offs match `stat_signal` in `backend/schema.py`, the `_signal`
 * columns the stats builder emits and the thresholds in
 * `docs/SCORELINE_DEV_PROMPT.md`. Change them in one place only — several
 * screens used to carry their own copy and disagreed, so the same percentage
 * could be coloured two different ways.
 */
export const COMPLIANCE_THRESHOLDS = { green: 65, yellow: 45 } as const;

/** Traffic-light tier from a 0–100 percentage. */
export function complianceFromPercent(value: number): ComplianceLevel {
  if (value >= COMPLIANCE_THRESHOLDS.green) return 'green';
  if (value >= COMPLIANCE_THRESHOLDS.yellow) return 'yellow';
  return 'red';
}

/** The rule in words, for on-screen legends. */
export const COMPLIANCE_RULE_TEXT =
  `🟢 ${COMPLIANCE_THRESHOLDS.green}%+ · ` +
  `🟡 ${COMPLIANCE_THRESHOLDS.yellow}–${COMPLIANCE_THRESHOLDS.green - 1}% · ` +
  `🔴 under ${COMPLIANCE_THRESHOLDS.yellow}%`;

/**
 * Points per game is not a percentage — it runs 0–3, so the cut-offs above
 * would call every team red. 1.80 is roughly title form over a season, 1.20 is
 * mid-table. Unlike the percentage rule, green here does mean "good": PPG only
 * ever measures one thing.
 */
export const PPG_THRESHOLDS = { green: 1.8, yellow: 1.2 } as const;

/** Traffic-light tier from a points-per-game figure on the 0–3 scale. */
export function complianceFromPpg(ppg: number): ComplianceLevel {
  if (ppg >= PPG_THRESHOLDS.green) return 'green';
  if (ppg >= PPG_THRESHOLDS.yellow) return 'yellow';
  return 'red';
}

/** The PPG scale in words, for on-screen legends. */
export const PPG_RULE_TEXT =
  `🟢 ${PPG_THRESHOLDS.green.toFixed(2)}+ · ` +
  `🟡 ${PPG_THRESHOLDS.yellow.toFixed(2)}–${(PPG_THRESHOLDS.green - 0.01).toFixed(2)} · ` +
  `🔴 under ${PPG_THRESHOLDS.yellow.toFixed(2)}`;

export function complianceColor(level: ComplianceLevel): string {
  switch (level) {
    case 'green':
      return theme.accentGreen;
    case 'yellow':
      return theme.yellow;
    case 'red':
      return theme.loss;
  }
}

export function complianceLabel(level: ComplianceLevel): string {
  switch (level) {
    case 'green':
      return 'Strong';
    case 'yellow':
      return 'Moderate';
    case 'red':
      return 'Caution';
  }
}
