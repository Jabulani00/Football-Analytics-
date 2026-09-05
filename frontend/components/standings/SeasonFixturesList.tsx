import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import ScoresMatchRow from '@/components/scores/ScoresMatchRow';
import SubTabBar from '@/components/shared/SubTabBar';
import {
  fetchAllFixturesBetween,
  mapFixture,
  seasonWindowUnix,
  type Fixture,
} from '@/services/oddAlerts';
import { fonts, layout, spacing, theme } from '@/styles/theme';

export type SeasonFixturesMode = 'upcoming' | 'previous';

type SeasonFixturesListProps = {
  competitionId: number;
  seasonId: number | null;
  seasonName: string;
  onMatchPress: (id: number) => void;
  /** When set, hide the inner Upcoming/Previous tabs and show only this mode. */
  mode?: SeasonFixturesMode;
  /** Show Upcoming/Previous sub-tabs (default true when mode is omitted). */
  showModeTabs?: boolean;
};

function isFinished(f: Fixture): boolean {
  return f.status === 'FT' || f.rawStatus === 'AET' || f.rawStatus === 'PEN';
}

function isUpcoming(f: Fixture): boolean {
  return f.status === 'NS';
}

function isLiveish(f: Fixture): boolean {
  return f.status === 'LIVE' || f.status === 'HT';
}

function groupByDate(fixtures: Fixture[]): [string, Fixture[]][] {
  const groups = new Map<string, Fixture[]>();
  for (const f of fixtures) {
    const day = new Date(f.kickoffUnix * 1000).toLocaleDateString([], {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
    const list = groups.get(day) ?? [];
    list.push(f);
    groups.set(day, list);
  }
  // Preserve fixture sort order (upcoming ascending / previous descending).
  return [...groups.entries()];
}

/**
 * Season fixtures for a competition — Upcoming (NS + live) and Previous (FT),
 * rendered with the same ScoresMatchRow used on the home feed.
 */
export default function SeasonFixturesList({
  competitionId,
  seasonId,
  seasonName,
  onMatchPress,
  mode: controlledMode,
  showModeTabs,
}: SeasonFixturesListProps) {
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [innerMode, setInnerMode] = useState<SeasonFixturesMode>('upcoming');

  const mode = controlledMode ?? innerMode;
  const tabsVisible = showModeTabs ?? controlledMode == null;

  useEffect(() => {
    if (seasonId == null) {
      setFixtures([]);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);

    const { fromUnix, toUnix } = seasonWindowUnix(seasonName);
    // Extend the end a bit so near-future kickoffs still appear for current seasons.
    const now = Math.floor(Date.now() / 1000);
    const end = Math.max(toUnix, now + 45 * 86400);

    fetchAllFixturesBetween({
      fromUnix,
      toUnix: end,
      competitions: String(competitionId),
      maxPages: 8,
    })
      .then((raw) => {
        if (!active) return;
        const mapped = raw
          .filter((f) => f.season_id == null || f.season_id === seasonId)
          .map(mapFixture);
        setFixtures(mapped);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setError('Could not load fixtures for this season.');
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [competitionId, seasonId, seasonName]);

  const filtered = useMemo(() => {
    if (mode === 'upcoming') {
      return fixtures
        .filter((f) => isUpcoming(f) || isLiveish(f))
        .sort((a, b) => a.kickoffUnix - b.kickoffUnix);
    }
    return fixtures.filter(isFinished).sort((a, b) => b.kickoffUnix - a.kickoffUnix);
  }, [fixtures, mode]);

  const byDate = useMemo(() => groupByDate(filtered), [filtered]);

  const upcomingCount = useMemo(
    () => fixtures.filter((f) => isUpcoming(f) || isLiveish(f)).length,
    [fixtures],
  );
  const previousCount = useMemo(() => fixtures.filter(isFinished).length, [fixtures]);

  return (
    <View>
      {tabsVisible ? (
        <SubTabBar
          tabs={[
            { id: 'upcoming', label: `Upcoming${upcomingCount ? ` (${upcomingCount})` : ''}` },
            { id: 'previous', label: `Previous${previousCount ? ` (${previousCount})` : ''}` },
          ]}
          active={mode}
          onChange={(id) => setInnerMode(id as SeasonFixturesMode)}
        />
      ) : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.accentGreen} />
          <Text style={styles.muted}>Loading fixtures…</Text>
        </View>
      ) : error ? (
        <Text style={styles.muted}>{error}</Text>
      ) : filtered.length === 0 ? (
        <Text style={styles.muted}>
          {mode === 'upcoming'
            ? 'No upcoming matches for this season yet.'
            : 'No finished matches for this season yet.'}
        </Text>
      ) : (
        byDate.map(([day, list]) => (
          <View key={day} style={styles.dateGroup}>
            <Text style={styles.dateLabel}>{day}</Text>
            <View style={styles.dateList}>
              {list.map((f) => (
                <ScoresMatchRow key={f.id} fixture={f} onPress={() => onMatchPress(f.id)} />
              ))}
            </View>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', paddingVertical: spacing.xxl, gap: spacing.sm },
  muted: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: theme.textMuted,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
  dateGroup: { marginBottom: spacing.md },
  dateLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    color: theme.textMuted,
    paddingVertical: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dateList: {
    backgroundColor: theme.surface,
    borderRadius: layout.borderRadius,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    overflow: 'hidden',
  },
});
