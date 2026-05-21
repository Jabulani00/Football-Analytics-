const REFERENCE_DATE = new Date('2026-05-21T12:00:00');

export function formatTopBarDate(date: Date = REFERENCE_DATE): string {
  return date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function parseDateKey(key: string): Date {
  return new Date(`${key}T12:00:00`);
}

export function formatDatePill(date: Date): string {
  const today = toDateKey(REFERENCE_DATE);
  const key = toDateKey(date);
  if (key === today) return 'Today';
  const yesterday = new Date(REFERENCE_DATE);
  yesterday.setDate(yesterday.getDate() - 1);
  if (key === toDateKey(yesterday)) return 'Yesterday';
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
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

export function getReferenceDateKey(): string {
  return toDateKey(REFERENCE_DATE);
}
