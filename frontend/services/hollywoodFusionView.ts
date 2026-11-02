/** Paginate fixtures, keeping every selection for a fixture on the same page. */
export function paginateFusionRows<T extends { eventId: number; fixture: string; marketName: string }>(
  rows: T[], query: string, market: string, requestedPage: number, pageSize = 10,
) {
  const search = query.trim().toLowerCase();
  const filtered = rows.filter((row) => (!search || row.fixture.toLowerCase().includes(search)) &&
    (!market || row.marketName === market));
  const ids = [...new Set(filtered.map((row) => row.eventId))];
  const pageCount = Math.max(1, Math.ceil(ids.length / Math.max(1, pageSize)));
  const page = Math.min(Math.max(0, requestedPage), pageCount - 1);
  const visible = new Set(ids.slice(page * pageSize, (page + 1) * pageSize));
  return { rows: filtered.filter((row) => visible.has(row.eventId)), page, pageCount,
    fixtureCount: ids.length, selectionCount: filtered.length, visibleFixtureCount: visible.size };
}
/** Retain the provider's fixture order and merge market groups across listing responses. */
export function mergeCompetitionEvents<T extends { id: number; betTypes: { eventBetTypeMapID: number }[] }>(
  initial: T[], additional: T[],
): T[] {
  const events = new Map(initial.map((event) => [event.id, event]));
  for (const event of additional) {
    const previous = events.get(event.id);
    if (!previous) { events.set(event.id, event); continue; }
    const groups = new Map(previous.betTypes.map((group) => [group.eventBetTypeMapID, group]));
    for (const group of event.betTypes) groups.set(group.eventBetTypeMapID, group);
    events.set(event.id, { ...previous, ...event, betTypes: [...groups.values()] });
  }
  return [...events.values()];
}
