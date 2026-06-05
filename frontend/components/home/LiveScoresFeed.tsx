import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useScoresFilter } from '@/components/layout/ScoresFilterContext';
import LeagueSectionHeader from '@/components/league/LeagueSectionHeader';
import DateFilterStrip from '@/components/league/DateFilterStrip';
import MatchRow from '@/components/league/MatchRow';
import PageContainer from '@/components/shared/PageContainer';
import { getAllFixturesForDate } from '@/mock/fixturesData';
import { mockLeagues } from '@/mock/leaguesData';
import { fonts, spacing, theme } from '@/styles/theme';
import { filterFixturesByStatus, groupFixturesByLeague } from '@/utils/fixtureGrouping';
import { formatDateHeading } from '@/utils/dates';

type LiveScoresFeedProps = {
  onLeaguePress: (leagueId: string) => void;
  onMatchPress: (matchId: string, leagueId: string) => void;
};

export default function LiveScoresFeed({ onLeaguePress, onMatchPress }: LiveScoresFeedProps) {
  const { selectedDate, setSelectedDate, statusFilter } = useScoresFilter();

  const groups = useMemo(() => {
    const all = getAllFixturesForDate(selectedDate);
    const filtered = filterFixturesByStatus(all, statusFilter);
    return groupFixturesByLeague(filtered, mockLeagues);
  }, [selectedDate, statusFilter]);

  return (
    <PageContainer contentContainerStyle={styles.scroll}>
      <DateFilterStrip selectedDate={selectedDate} onSelect={setSelectedDate} />
      <Text style={styles.dateHeading}>{formatDateHeading(selectedDate)}</Text>

      {groups.length === 0 ? (
        <Text style={styles.empty}>No matches for this filter.</Text>
      ) : (
        groups.map((group) => (
          <View key={group.league.id} style={styles.section}>
            <LeagueSectionHeader league={group.league} onPress={() => onLeaguePress(group.league.id)} />
            <View style={styles.list}>
              {group.fixtures.map((f) => (
                <MatchRow
                  key={f.id}
                  fixture={f}
                  onPress={() => onMatchPress(f.id, f.leagueId)}
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
  dateHeading: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: theme.textMuted,
    marginBottom: spacing.md,
  },
  section: {
    marginBottom: spacing.md,
    width: '100%',
  },
  list: {
    backgroundColor: theme.surface,
    width: '100%',
  },
  empty: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: theme.textMuted,
    textAlign: 'center',
    paddingVertical: spacing.xl,
  },
});
