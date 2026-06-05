import type { ComplianceLevel } from '@/types/analytics';
import { theme } from '@/styles/theme';

/** Traffic-light tier from percentage (spec §3.3). */
export function complianceFromPercent(value: number): ComplianceLevel {
  if (value >= 66) return 'green';
  if (value >= 33) return 'yellow';
  return 'red';
}

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
