/** Shared difference bands used by Home/Away, halves, Colors and Opposites. */
export const NONE_DA_MAX = 15;
export const LEAN_DA_MIN = 16;
export const LEAN_DA_MAX = 24;
export const DA_MIN = 25;

export type DifferenceDaBand = 'none' | 'lean' | 'da' | 'na';

/** Classify a difference magnitude, inclusive at each stated boundary. */
export function differenceDaBand(value: number | null): DifferenceDaBand {
  if (value == null || !Number.isFinite(value)) return 'na';
  const difference = Math.abs(value);
  if (difference >= DA_MIN) return 'da';
  if (difference >= LEAN_DA_MIN) return 'lean';
  return 'none';
}
