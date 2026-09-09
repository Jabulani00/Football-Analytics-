const REFERENCE_DATE = new Date('2026-05-21T12:00:00');

export function formatTopBarDate(date: Date = new Date()): string {
  return date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Local calendar key YYYY-MM-DD (avoids UTC day-shift for evening kick-offs). */
export function localDateKey(input: number | Date): string {
  const d = typeof input === 'number' ? new Date(input * 1000) : input;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function toDateKey(date: Date): string {
  return localDateKey(date);
}

export function parseDateKey(key: string): Date {
  return new Date(`${key}T12:00:00`);
}

export function todayKey(now: Date = new Date()): string {
  return localDateKey(now);
}

export function addDaysToKey(key: string, days: number): string {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + days);
  return localDateKey(d);
}

export function formatDatePill(date: Date, now: Date = new Date()): string {
  const today = todayKey(now);
  const key = localDateKey(date);
  if (key === today) return 'Today';
  if (key === addDaysToKey(today, 1)) return 'Tomorrow';
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (key === localDateKey(yesterday)) return 'Yesterday';
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function formatUpcomingDayLabel(key: string, now: Date = new Date()): string {
  const today = todayKey(now);
  if (key === today) return 'Today';
  if (key === addDaysToKey(today, 1)) return 'Tomorrow';
  return parseDateKey(key).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });
}

export function formatDateHeading(key: string): string {
  return parseDateKey(key).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function buildDateStrip(center: Date = REFERENCE_DATE, days = 7): Date[] {
  const start = new Date(center);
  start.setDate(start.getDate() - 1);
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

/** Forward-looking day keys from today (inclusive), length = count. */
export function buildUpcomingDayKeys(count: number, now: Date = new Date()): string[] {
  const today = todayKey(now);
  return Array.from({ length: count }, (_, i) => addDaysToKey(today, i));
}

export function getReferenceDateKey(): string {
  return toDateKey(REFERENCE_DATE);
}
