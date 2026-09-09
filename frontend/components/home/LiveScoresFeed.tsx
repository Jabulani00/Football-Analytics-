import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';

import { useScoresFilter } from '@/components/layout/ScoresFilterContext';
import CompetitionHeader from '@/components/scores/CompetitionHeader';
import FeedFixtureRow from '@/components/scores/FeedFixtureRow';
import PageContainer from '@/components/shared/PageContainer';
import SubTabBar from '@/components/shared/SubTabBar';
import { useLiveFixtures } from '@/hooks/useLiveFixtures';
import { groupByCompetition, type CompetitionGroup, type Fixture } from '@/services/oddAlerts';
import type { MarketModule } from '@/utils/fixtureRecommendation';
import {
  addDaysToKey,
  buildUpcomingDayKeys,
  formatUpcomingDayLabel,
  localDateKey,
  todayKey,
} from '@/utils/dates';
import { fonts, layout, spacing, theme } from '@/styles/theme';

type ModuleFilter = 'all' | MarketModule;

/** Range windows for fixtures. `tomorrow` = tomorrow only. */
type UpcomingWindow = 'today' | 'tomorrow' | '3' | '7' | '14';

const MODULE_TABS: { id: ModuleFilter; label: string }[] = [
  { id: 'all', label: 'All markets' },
  { id: 'result', label: 'Result' },
  { id: 'goals', label: 'Goals' },
  { id: 'btts', label: 'BTTS' },
];

const VIEW_LABEL: Record<string, string> = {
  all: 'All matches',
  live: 'Live now',
  ft: 'Results',
  ns: 'Fixtures',
};

const RESULT_WINDOWS: { days: number; label: string }[] = [
  { days: 1, label: 'Today' },
  { days: 2, label: '2 days' },
  { days: 4, label: '4 days' },
  { days: 7, label: '7 days' },
];

const UPCOMING_WINDOWS: { id: UpcomingWindow; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'tomorrow', label: 'Tomorrow' },
  { id: '3', label: '3 days' },
  { id: '7', label: '7 days' },
  { id: '14', label: '14 days' },
];

function fetchDaysForWindow(w: UpcomingWindow): number {
  if (w === 'today') return 1;
  if (w === 'tomorrow') return 2;
  return Number(w);
}

function fixtureDayKey(f: Fixture): string {
  return localDateKey(f.kickoffUnix);
}

function groupByDateThenCompetition(
  fixtures: Fixture[],
  preferredIds?: number[],
): { dayKey: string; groups: CompetitionGroup[] }[] {
  const byDay = new Map<string, Fixture[]>();
  for (const f of fixtures) {
    const key = fixtureDayKey(f);
    const list = byDay.get(key) ?? [];
    list.push(f);
    byDay.set(key, list);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dayKey, list]) => ({
      dayKey,
      groups: groupByCompetition(list, preferredIds ? { preferredIds } : undefined),
    }));
}

export default function LiveScoresFeed() {
  const router = useRouter();
  const {
    statusFilter,
    gender,
    kind,
    competitionId,
    setCompetitionId,
    setCompetitions,
    upcomingScope,
    favoriteCompetitionIds,
  } = useScoresFilter();
  const [resultsDays, setResultsDays] = useState(2);
  const [upcomingWindow, setUpcomingWindow] = useState<UpcomingWindow>('today');
  /** null = show the full window; otherwise a single calendar day. */
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const [recModule, setRecModule] = useState<ModuleFilter>('all');

  const upcomingDays = fetchDaysForWindow(upcomingWindow);
  // Always load enough days for the day strip (up to 14) so picking a day is instant.
  const fetchDays = Math.max(upcomingDays, 14);

  const { fixtures, loading, refreshing, error, lastUpdated, refresh } = useLiveFixtures(
    statusFilter,
    {
      resultsDays,
      upcomingDays: statusFilter === 'ns' ? fetchDays : upcomingDays,
      upcomingScope,
      favoriteCompetitionIds,
      kind,
    },
  );

  const showRecommendations = statusFilter !== 'ft';
  const now = useMemo(() => new Date(), [lastUpdated]);
  const today = todayKey(now);
  const tomorrow = addDaysToKey(today, 1);

  const scoped = useMemo(
    () => fixtures.filter((f) => f.gender === gender && f.kind === kind),
    [fixtures, gender, kind],
  );

  const preferredIds = useMemo(() => {
    if (statusFilter !== 'ns' || upcomingScope !== 'popular') return undefined;
    return favoriteCompetitionIds;
  }, [statusFilter, upcomingScope, favoriteCompetitionIds]);

  // Day keys available in the current window (for the day picker).
  const windowDayKeys = useMemo(() => {
    if (upcomingWindow === 'today') return [today];
    if (upcomingWindow === 'tomorrow') return [tomorrow];
    return buildUpcomingDayKeys(Number(upcomingWindow), now);
  }, [upcomingWindow, today, tomorrow, now]);

  // Reset specific-day pick when the range window changes.
  useEffect(() => {
    setSelectedDayKey(null);
  }, [upcomingWindow]);

  const dateFiltered = useMemo(() => {
    if (statusFilter !== 'ns') return scoped;

    if (selectedDayKey) {
      return scoped.filter((f) => fixtureDayKey(f) === selectedDayKey);
    }

    if (upcomingWindow === 'today') {
      return scoped.filter((f) => fixtureDayKey(f) === today);
    }
    if (upcomingWindow === 'tomorrow') {
      return scoped.filter((f) => fixtureDayKey(f) === tomorrow);
    }
    const allowed = new Set(windowDayKeys);
    return scoped.filter((f) => allowed.has(fixtureDayKey(f)));
  }, [statusFilter, scoped, selectedDayKey, upcomingWindow, today, tomorrow, windowDayKeys]);

  const allGroups = useMemo(
    () => groupByCompetition(dateFiltered, preferredIds ? { preferredIds } : undefined),
    [dateFiltered, preferredIds],
  );

  // Sidebar sees competitions for the current day/window filter.
  useEffect(() => {
    setCompetitions(allGroups);
  }, [allGroups, setCompetitions]);

  const groups = useMemo(
    () => (competitionId ? allGroups.filter((g) => g.competition.id === competitionId) : allGroups),
    [allGroups, competitionId],
  );

  const datedSections = useMemo(() => {
    if (statusFilter !== 'ns') return null;
    const list =
      competitionId != null
        ? dateFiltered.filter((f) => f.competition.id === competitionId)
        : dateFiltered;
    return groupByDateThenCompetition(list, preferredIds);
  }, [statusFilter, dateFiltered, competitionId, preferredIds]);

  const activeCompetition =
    competitionId != null ? allGroups.find((g) => g.competition.id === competitionId) : null;

  const liveCount = useMemo(
    () => scoped.filter((f) => f.status === 'LIVE' || f.status === 'HT').length,
    [scoped],
  );

  const updatedLabel = lastUpdated
    ? new Date(lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  const dayCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of scoped) {
      const k = fixtureDayKey(f);
      if (!windowDayKeys.includes(k) && upcomingWindow !== 'today' && upcomingWindow !== 'tomorrow') {
        // still count for strip when window is multi-day
      }
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return map;
  }, [scoped, windowDayKeys, upcomingWindow]);

  return (
    <PageContainer
      contentContainerStyle={styles.scroll}
      refreshControl={
        Platform.OS !== 'web' ? (
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.accentGreen} />
        ) : undefined
      }>
      <View style={styles.statusBar}>
        <Text style={styles.heading}>
          {statusFilter === 'ns'
            ? upcomingScope === 'popular'
              ? 'Favourites'
              : 'Fixtures'
            : (VIEW_LABEL[statusFilter] ?? 'Matches')}
        </Text>
        <View style={styles.meta}>
          {liveCount > 0 ? <Text style={styles.liveBadge}>{liveCount} LIVE</Text> : null}
          {updatedLabel ? <Text style={styles.updated}>Updated {updatedLabel}</Text> : null}
          <Pressable
            onPress={refresh}
            style={({ hovered }) => [styles.refreshBtn, hovered ? styles.refreshHover : null]}>
            <Text style={styles.refreshText}>{refreshing ? '…' : '↻'}</Text>
          </Pressable>
        </View>
      </View>

      {activeCompetition ? (
        <Pressable onPress={() => setCompetitionId(null)} style={styles.activeComp}>
          <Text style={styles.activeCompText} numberOfLines={1}>
            {activeCompetition.competition.country} · {activeCompetition.competition.name}
          </Text>
          <Text style={styles.activeCompClear}>✕ clear</Text>
        </Pressable>
      ) : null}

      {statusFilter === 'ns' ? (
        <>
          <View style={styles.windowRow}>
            {UPCOMING_WINDOWS.map((w) => {
              const active = w.id === upcomingWindow && selectedDayKey == null;
              return (
                <Pressable
                  key={w.id}
                  onPress={() => {
                    setUpcomingWindow(w.id);
                    setSelectedDayKey(null);
                  }}
                  style={({ hovered }) => [
                    styles.windowPill,
                    active && styles.windowPillActive,
                    hovered && !active ? styles.windowPillHover : null,
                  ]}>
                  <Text style={[styles.windowText, active && styles.windowTextActive]}>
                    {w.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.dayStripLabel}>Pick a day</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.dayStrip}>
            <Pressable
              onPress={() => setSelectedDayKey(null)}
              style={[styles.dayChip, selectedDayKey == null && styles.dayChipActive]}>
              <Text
                style={[
                  styles.dayChipText,
                  selectedDayKey == null && styles.dayChipTextActive,
                ]}>
                Whole window
              </Text>
            </Pressable>
            {windowDayKeys.map((key) => {
              const active = selectedDayKey === key;
              const count = dayCounts.get(key) ?? 0;
              return (
                <Pressable
                  key={key}
                  onPress={() => setSelectedDayKey(key)}
                  style={[styles.dayChip, active && styles.dayChipActive]}>
                  <Text style={[styles.dayChipText, active && styles.dayChipTextActive]}>
                    {formatUpcomingDayLabel(key, now)}
                  </Text>
                  <Text style={[styles.dayChipCount, active && styles.dayChipTextActive]}>
                    {count}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </>
      ) : null}

      {statusFilter === 'ft' ? (
        <View style={styles.windowRow}>
          {RESULT_WINDOWS.map((w) => {
            const active = w.days === resultsDays;
            return (
              <Pressable
                key={w.days}
                onPress={() => setResultsDays(w.days)}
                style={({ hovered }) => [
                  styles.windowPill,
                  active && styles.windowPillActive,
                  hovered && !active ? styles.windowPillHover : null,
                ]}>
                <Text style={[styles.windowText, active && styles.windowTextActive]}>{w.label}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {showRecommendations && !loading && !error && groups.length > 0 ? (
        <View style={styles.recFilter}>
          <Text style={styles.recFilterLabel}>⚡ BEST BET MARKET</Text>
          <SubTabBar tabs={MODULE_TABS} active={recModule} onChange={setRecModule} />
        </View>
      ) : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.accentGreen} />
          <Text style={styles.centerText}>Loading fixtures…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>Couldn&apos;t load fixtures.</Text>
          <Text style={styles.centerText}>{error}</Text>
          <Pressable onPress={refresh} style={styles.retryBtn}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : statusFilter === 'ns' && (datedSections?.length ?? 0) === 0 ? (
        <Text style={styles.empty}>
          {selectedDayKey
            ? `No matches on ${formatUpcomingDayLabel(selectedDayKey, now)}.`
            : upcomingScope === 'popular'
              ? 'No upcoming matches in your favourites for this window. Try All upcoming, another day, or star more leagues.'
              : `No ${gender === 'women' ? "women's" : "men's"} ${kind === 'country' ? 'international' : 'club'} matches for this day window.`}
        </Text>
      ) : statusFilter !== 'ns' && groups.length === 0 ? (
        <Text style={styles.empty}>
          No {gender === 'women' ? "women's" : "men's"} {kind === 'country' ? 'international' : 'club'}{' '}
          matches for this view right now.
        </Text>
      ) : statusFilter === 'ns' && datedSections ? (
        datedSections.map(({ dayKey, groups: dayGroups }) => (
          <View key={dayKey} style={styles.daySection}>
            <Text style={styles.dayHeading}>{formatUpcomingDayLabel(dayKey, now)}</Text>
            {dayGroups.map((group) => (
              <View key={`${dayKey}-${group.key}`} style={styles.section}>
                <CompetitionHeader group={group} />
                <View style={styles.list}>
                  {group.fixtures.map((fixture) => (
                    <FeedFixtureRow
                      key={fixture.id}
                      fixture={fixture}
                      module={recModule}
                      onOpen={() =>
                        router.push({
                          pathname: '/match/[id]',
                          params: { id: String(fixture.id) },
                        })
                      }
                    />
                  ))}
                </View>
              </View>
            ))}
          </View>
        ))
      ) : (
        groups.map((group) => (
          <View key={group.key} style={styles.section}>
            <CompetitionHeader group={group} />
            <View style={styles.list}>
              {group.fixtures.map((fixture) => (
                <FeedFixtureRow
                  key={fixture.id}
                  fixture={fixture}
                  module={recModule}
                  onOpen={() =>
                    router.push({ pathname: '/match/[id]', params: { id: String(fixture.id) } })
                  }
                />
              ))}
            </View>
          </View>
        ))
      )}
    </PageContainer>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
    width: '100%',
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  heading: {
    fontFamily: fonts.displaySemi,
    fontSize: 16,
    color: theme.textPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  liveBadge: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    color: theme.surface,
    backgroundColor: theme.live,
    borderRadius: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  updated: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: theme.textFaint,
  },
  refreshBtn: {
    width: 26,
    height: 26,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : {}),
  },
  refreshHover: {
    backgroundColor: theme.surfaceHover,
  },
  refreshText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: theme.textMuted,
  },
  activeComp: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: layout.borderRadius,
    backgroundColor: 'rgba(5, 150, 105, 0.08)',
    borderWidth: layout.borderWidth,
    borderColor: theme.accentGreen,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : {}),
  },
  activeCompText: {
    flex: 1,
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: theme.textPrimary,
  },
  activeCompClear: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    color: theme.accentGreen,
  },
  windowRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.sm,
    flexWrap: 'wrap',
  },
  windowPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: layout.borderRadius,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : {}),
  },
  windowPillActive: {
    borderColor: theme.accentGreen,
    backgroundColor: 'rgba(5, 150, 105, 0.08)',
  },
  windowPillHover: {
    backgroundColor: theme.surfaceHover,
  },
  windowText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: theme.textMuted,
  },
  windowTextActive: {
    fontFamily: fonts.bodySemiBold,
    color: theme.textPrimary,
  },
  dayStripLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    letterSpacing: 0.8,
    color: theme.textFaint,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  dayStrip: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingBottom: spacing.md,
  },
  dayChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: layout.borderRadius,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : {}),
  },
  dayChipActive: {
    borderColor: theme.accentBlue,
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
  },
  dayChipText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: theme.textMuted,
  },
  dayChipTextActive: {
    fontFamily: fonts.bodySemiBold,
    color: theme.textPrimary,
  },
  dayChipCount: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: theme.textFaint,
  },
  daySection: {
    marginBottom: spacing.lg,
    width: '100%',
  },
  dayHeading: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: theme.textPrimary,
    marginBottom: spacing.sm,
    letterSpacing: 0.2,
  },
  recFilter: {
    marginBottom: spacing.md,
    width: '100%',
  },
  recFilterLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    letterSpacing: 1,
    color: theme.textMuted,
    marginBottom: spacing.xs,
  },
  section: {
    marginBottom: spacing.md,
    width: '100%',
  },
  list: {
    backgroundColor: theme.surface,
    width: '100%',
  },
  center: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  centerText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: theme.textMuted,
    textAlign: 'center',
  },
  errorText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: theme.loss,
  },
  retryBtn: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: layout.borderRadius,
    backgroundColor: theme.accentGreen,
  },
  retryText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: theme.surface,
  },
  empty: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: theme.textMuted,
    textAlign: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.md,
  },
});
