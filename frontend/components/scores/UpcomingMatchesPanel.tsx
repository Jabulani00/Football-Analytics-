import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import CompetitionHeader from '@/components/scores/CompetitionHeader';
import FeedFixtureRow from '@/components/scores/FeedFixtureRow';
import FilterDropdown from '@/components/shared/FilterDropdown';
import PageControls, { PAGE_SIZE } from '@/components/shared/PageControls';
import { useLiveFixtures } from '@/hooks/useLiveFixtures';
import { groupByCompetition, type Fixture } from '@/services/oddAlerts';
import { addDaysToKey, buildUpcomingDayKeys, formatUpcomingDayLabel, localDateKey, todayKey } from '@/utils/dates';
import type { MarketModule } from '@/utils/fixtureRecommendation';
import { fonts, layout, spacing, theme } from '@/styles/theme';

/** Same best-bet markets as the home fixtures feed. */
export type PredictFocus = 'all' | MarketModule;

const PREDICT: { value: PredictFocus; label: string }[] = [
  { value: 'all', label: 'All markets' },
  { value: 'result', label: 'Result (1X2)' },
  { value: 'goals', label: 'Goals' },
  { value: 'btts', label: 'Both teams to score' },
];

/** Pick the home-fixture market that matches a stat column. */
export function focusForStatKey(key: string): PredictFocus {
  const stat = key.toLowerCase();
  if (stat.includes('btts')) return 'btts';
  if (/over|under|avg_goals|sc_avg|conc_avg|scoring_|conceding_|half_avg|goals/.test(stat)) return 'goals';
  return 'result';
}

type UpcomingWindow = 'today' | 'tomorrow' | '3' | '7';

const WINDOWS: { id: UpcomingWindow; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'tomorrow', label: 'Tomorrow' },
  { id: '3', label: '3 days' },
  { id: '7', label: '7 days' },
];

function dayKey(fixture: Fixture): string {
  return localDateKey(fixture.kickoffUnix);
}

export default function UpcomingMatchesPanel({ focus = 'all' }: { focus?: PredictFocus }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [windowId, setWindowId] = useState<UpcomingWindow>('today');
  const [predict, setPredict] = useState<PredictFocus>(focus);
  const [page, setPage] = useState(1);
  const { fixtures, loading, error, refresh } = useLiveFixtures('ns', {
    upcomingDays: 7,
    upcomingScope: 'all',
  });

  useEffect(() => {
    setPredict(focus);
  }, [focus]);

  const now = useMemo(() => new Date(), [fixtures]);
  const today = todayKey(now);
  const tomorrow = addDaysToKey(today, 1);
  const predictLabel = PREDICT.find((item) => item.value === predict)?.label ?? 'All markets';

  const matches = useMemo(() => {
    const allowed =
      windowId === 'today'
        ? new Set([today])
        : windowId === 'tomorrow'
          ? new Set([tomorrow])
          : new Set(buildUpcomingDayKeys(Number(windowId), now));
    return fixtures
      .filter((fixture) => fixture.status === 'NS' && fixture.gender === 'men' && fixture.kind === 'club')
      .filter((fixture) => allowed.has(dayKey(fixture)))
      .sort((a, b) => a.kickoffUnix - b.kickoffUnix || a.competition.name.localeCompare(b.competition.name));
  }, [fixtures, windowId, today, tomorrow, now]);

  useEffect(() => {
    setPage(1);
  }, [windowId, predict]);

  const pages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const start = (safePage - 1) * PAGE_SIZE;
  const slice = matches.slice(start, start + PAGE_SIZE);
  const sections = useMemo(() => {
    const byDay = new Map<string, Fixture[]>();
    for (const fixture of slice) {
      const key = dayKey(fixture);
      const list = byDay.get(key) ?? [];
      list.push(fixture);
      byDay.set(key, list);
    }
    return [...byDay.entries()].map(([key, list]) => ({
      key,
      label: formatUpcomingDayLabel(key, now),
      groups: groupByCompetition(list),
    }));
  }, [slice, now]);

  const openMatch = (id: number) => {
    router.push({ pathname: '/match/[id]', params: { id: String(id) } });
  };

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        style={styles.head}
        {...(Platform.OS === 'web' ? { dataSet: { nodrag: '1' } } : {})}>
        <Text style={styles.chevron}>{open ? '▾' : '▸'}</Text>
        <View style={styles.headCopy}>
          <Text style={styles.title}>Upcoming matches</Text>
          <Text style={styles.meta} numberOfLines={1}>
            {loading && matches.length === 0 ? 'Loading…' : `${matches.length} fixtures`}
            {' · '}
            {predictLabel}
          </Text>
        </View>
      </Pressable>

      {open ? (
        <View style={styles.body}>
          <FilterDropdown
            label="Prediction"
            value={predict}
            options={PREDICT.map((item) => ({ value: item.value, label: item.label }))}
            onChange={(value) => setPredict(value as PredictFocus)}
            style={styles.predict}
          />
          <Text style={styles.note}>
            Same fixtures as Scores. The best bet on each row uses {predictLabel.toLowerCase()}.
          </Text>
          <View style={styles.windows} {...(Platform.OS === 'web' ? { dataSet: { nodrag: '1' } } : {})}>
            {WINDOWS.map((item) => {
              const active = item.id === windowId;
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => setWindowId(item.id)}
                  style={[styles.pill, active && styles.pillOn]}>
                  <Text style={[styles.pillText, active && styles.pillTextOn]}>{item.label}</Text>
                </Pressable>
              );
            })}
          </View>

          {loading && matches.length === 0 ? (
            <View style={styles.noteRow}>
              <ActivityIndicator color={theme.accentGreen} />
              <Text style={styles.note}>Loading upcoming matches…</Text>
            </View>
          ) : error && matches.length === 0 ? (
            <View style={styles.noteRow}>
              <Text style={styles.note}>Couldn’t load upcoming matches. {error}</Text>
              <Pressable onPress={refresh} style={styles.retry}>
                <Text style={styles.retryText}>Retry</Text>
              </Pressable>
            </View>
          ) : matches.length === 0 ? (
            <Text style={styles.note}>No upcoming men’s club matches in this window.</Text>
          ) : (
            <>
              <PageControls
                page={safePage}
                pages={pages}
                total={matches.length}
                from={start + 1}
                to={start + slice.length}
                onChange={setPage}
              />
              {sections.map((section) => (
                <View key={section.key} style={styles.day}>
                  {windowId === '3' || windowId === '7' ? <Text style={styles.dayLabel}>{section.label}</Text> : null}
                  {section.groups.map((group) => (
                    <View key={`${section.key}-${group.key}`} style={styles.group}>
                      <CompetitionHeader group={group} />
                      {group.fixtures.map((fixture) => (
                        <FeedFixtureRow
                          key={fixture.id}
                          fixture={fixture}
                          module={predict}
                          onOpen={() => openMatch(fixture.id)}
                        />
                      ))}
                    </View>
                  ))}
                </View>
              ))}
              <PageControls
                page={safePage}
                pages={pages}
                total={matches.length}
                from={start + 1}
                to={start + slice.length}
                onChange={setPage}
              />
            </>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    marginBottom: spacing.xl,
    backgroundColor: theme.surface,
    borderRadius: layout.borderRadius,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    overflow: 'hidden',
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : {}),
  },
  chevron: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: theme.textMuted,
    width: 16,
  },
  headCopy: { flex: 1, gap: 2 },
  title: {
    fontFamily: fonts.displaySemi,
    fontSize: 16,
    color: theme.textPrimary,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  meta: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textMuted,
  },
  body: {
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  predict: { maxWidth: 280 },
  windows: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  pill: {
    minHeight: 32,
    paddingHorizontal: spacing.md,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.bg,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : {}),
  },
  pillOn: {
    backgroundColor: theme.surfaceMuted,
    borderColor: theme.surfaceMuted,
  },
  pillText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: theme.textMuted,
  },
  pillTextOn: {
    fontFamily: fonts.bodySemiBold,
    color: theme.textPrimary,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  note: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: theme.textMuted,
  },
  retry: {
    minHeight: 32,
    paddingHorizontal: spacing.md,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.bg,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
  },
  retryText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: theme.textPrimary,
  },
  day: { gap: spacing.sm },
  dayLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  group: {
    backgroundColor: theme.bg,
    borderRadius: layout.borderRadius,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    overflow: 'hidden',
  },
});
