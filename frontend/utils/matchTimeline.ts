import type { MatchGoalEvent } from '@/services/apiFootball';
import type { GoalPeriodEvent } from '@/services/oddAlerts';

export type TimelineMarkerKind = 'goal' | 'yellow' | 'red' | 'sub' | 'corner';

export type TimelineMarker = {
  kind: TimelineMarkerKind;
  side: 'home' | 'away';
  minute: number;
  extra: number | null;
  label: string;
  sortKey: number;
};

export type EventFilters = {
  goals: boolean;
  bookings: boolean;
  subs: boolean;
  corners: boolean;
};

export const DEFAULT_EVENT_FILTERS: EventFilters = {
  goals: true,
  bookings: true,
  subs: true,
  corners: false,
};

export function eventSortKey(minute: number, extra: number | null): number {
  return minute + (extra ?? 0) * 0.01;
}

export function formatEventMinute(minute: number, extra: number | null): string {
  if (extra != null && extra > 0) return `${minute}+${extra}'`;
  return `${minute}'`;
}

export function eventIcon(kind: TimelineMarkerKind): string {
  switch (kind) {
    case 'goal':
      return '⚽';
    case 'yellow':
      return '🟨';
    case 'red':
      return '🟥';
    case 'sub':
      return '↕';
    case 'corner':
      return '⎌';
    default:
      return '·';
  }
}

export function filterMarkers(markers: TimelineMarker[], filters: EventFilters): TimelineMarker[] {
  return markers.filter((m) => {
    if (m.kind === 'goal') return filters.goals;
    if (m.kind === 'yellow' || m.kind === 'red') return filters.bookings;
    if (m.kind === 'sub') return filters.subs;
    if (m.kind === 'corner') return filters.corners;
    return true;
  });
}

export function goalsToMarkers(goals: MatchGoalEvent[]): TimelineMarker[] {
  return goals.map((g) => ({
    kind: 'goal' as const,
    side: g.side,
    minute: g.minute,
    extra: g.extra,
    label: g.player,
    sortKey: eventSortKey(g.minute, g.extra),
  }));
}

/** OddAlerts 15-min buckets → approximate minute for the event map. */
export function periodGoalsToMarkers(periodGoals: GoalPeriodEvent[]): TimelineMarker[] {
  return periodGoals.map((g, i) => ({
    kind: 'goal' as const,
    side: g.side,
    minute: Math.round(g.sortMinute),
    extra: null,
    label: 'Goal',
    sortKey: g.sortMinute + i * 0.001,
  }));
}

export function mergeTimelineMarkers(...groups: TimelineMarker[][]): TimelineMarker[] {
  const map = new Map<string, TimelineMarker>();
  for (const group of groups) {
    for (const m of group) {
      const key = `${m.kind}-${m.side}-${m.minute}-${m.extra ?? 0}-${m.label}`;
      if (!map.has(key)) map.set(key, m);
    }
  }
  return [...map.values()].sort((a, b) => a.sortKey - b.sortKey);
}
