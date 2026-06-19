import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';

import { useScoresFilter } from '@/components/layout/ScoresFilterContext';
import CompetitionHeader from '@/components/scores/CompetitionHeader';
import ScoresMatchRow from '@/components/scores/ScoresMatchRow';
import PageContainer from '@/components/shared/PageContainer';
import { useLiveFixtures } from '@/hooks/useLiveFixtures';
import { groupByCompetition } from '@/services/oddAlerts';
import { fonts, layout, spacing, theme } from '@/styles/theme';

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

export default function LiveScoresFeed() {
  const router = useRouter();
  const { statusFilter, gender, kind, competitionId, setCompetitionId, setCompetitions } =
    useScoresFilter();
  const [resultsDays, setResultsDays] = useState(2);
  const { fixtures, loading, refreshing, error, lastUpdated, refresh } = useLiveFixtures(
    statusFilter,
    { resultsDays },
  );

  const scoped = useMemo(
    () => fixtures.filter((f) => f.gender === gender && f.kind === kind),
    [fixtures, gender, kind],
  );

  const allGroups = useMemo(() => groupByCompetition(scoped), [scoped]);

  // Publish the loaded competitions so the sidebar can list them (API-driven).
  useEffect(() => {
    setCompetitions(allGroups);
  }, [allGroups, setCompetitions]);

  const groups = useMemo(
    () => (competitionId ? allGroups.filter((g) => g.competition.id === competitionId) : allGroups),
    [allGroups, competitionId],
  );

  const activeCompetition =
    competitionId != null ? allGroups.find((g) => g.competition.id === competitionId) : null;

  const liveCount = useMemo(
    () => scoped.filter((f) => f.status === 'LIVE' || f.status === 'HT').length,
    [scoped],
  );

  const updatedLabel = lastUpdated
    ? new Date(lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <PageContainer
      contentContainerStyle={styles.scroll}
      refreshControl={
        Platform.OS !== 'web' ? (
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.accentGreen} />
        ) : undefined
      }>
      <View style={styles.statusBar}>
        <Text style={styles.heading}>{VIEW_LABEL[statusFilter] ?? 'Matches'}</Text>
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
      ) : groups.length === 0 ? (
        <Text style={styles.empty}>
          No {gender === 'women' ? "women's" : "men's"} {kind === 'country' ? 'international' : 'club'}{' '}
          matches for this view right now.
        </Text>
      ) : (
        groups.map((group) => (
          <View key={group.key} style={styles.section}>
            <CompetitionHeader group={group} />
            <View style={styles.list}>
              {group.fixtures.map((fixture) => (
                <ScoresMatchRow
                  key={fixture.id}
                  fixture={fixture}
                  onPress={() =>
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
    marginBottom: spacing.md,
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
    fontSize: 14,
    color: theme.textMuted,
    textAlign: 'center',
    paddingVertical: spacing.xl,
  },
});
