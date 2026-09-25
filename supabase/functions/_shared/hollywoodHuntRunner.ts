/** Pure scheduling guards shared by the Edge Function and Node test suite. */

export function rotatingWindow<T>(items: T[], size: number, cursor: number): T[] {
  if (items.length === 0 || size <= 0) return [];
  const take = Math.min(Math.floor(size), items.length);
  const start = ((Math.floor(cursor) % items.length) + items.length) % items.length;
  return Array.from({ length: take }, (_, offset) => items[(start + offset) % items.length]);
}

export function remainingBudgetMs(startedAtMs: number, nowMs: number, budgetMs: number): number {
  return Math.max(0, Math.floor(budgetMs - (nowMs - startedAtMs)));
}

export function canStartTournament(
  startedAtMs: number,
  nowMs: number,
  budgetMs: number,
  minimumRequestBudgetMs = 5_000,
): boolean {
  return remainingBudgetMs(startedAtMs, nowMs, budgetMs) >= minimumRequestBudgetMs;
}

export function completeEventsArray<T>(value: unknown): T[] | null {
  if (!value || typeof value !== 'object') return null;
  const events = (value as { events?: unknown }).events;
  return Array.isArray(events) ? (events as T[]) : null;
}

export function hollywoodRequestUrl(path: string, directBase: string, proxyUrl?: string): string {
  const cleanPath = path.replace(/^\/+/, '');
  if (!proxyUrl?.trim()) return `${directBase.replace(/\/+$/, '')}/${cleanPath}`;
  const url = new URL(proxyUrl);
  url.searchParams.set('host', 'events');
  url.searchParams.set('path', cleanPath);
  return url.toString();
}
