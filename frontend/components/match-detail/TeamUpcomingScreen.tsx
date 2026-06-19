import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import CompetitionHeader from '@/components/scores/CompetitionHeader';
import ScoresMatchRow from '@/components/scores/ScoresMatchRow';
import PageContainer from '@/components/shared/PageContainer';
import { useTeamUpcoming } from '@/hooks/useTeamUpcoming';
import { groupByCompetition } from '@/services/oddAlerts';
import { fonts, layout, spacing, theme } from '@/styles/theme';

type TeamUpcomingScreenProps = {
  teamId: string;
  teamName: string;
  onBack: () => void;
};

export default function TeamUpcomingScreen({ teamId, teamName, onBack }: TeamUpcomingScreenProps) {
  const router = useRouter();
  const { fixtures, loading, error, refresh } = useTeamUpcoming(teamId);
  const groups = groupByCompetition(fixtures);

  return (
    <PageContainer contentContainerStyle={styles.scroll}>
      <Pressable onPress={onBack} style={styles.back}>
        <Text style={styles.backText}>← BACK</Text>
      </Pressable>

      <Text style={styles.title}>{teamName}</Text>
      <Text style={styles.subtitle}>Upcoming fixtures</Text>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.accentGreen} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={refresh} style={styles.retryBtn}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : groups.length === 0 ? (
        <Text style={styles.empty}>No upcoming fixtures scheduled.</Text>
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
  scroll: { paddingTop: spacing.sm, paddingBottom: spacing.xxl, width: '100%' },
  back: { alignSelf: 'flex-start', paddingVertical: spacing.sm },
  backText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    color: theme.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: { fontFamily: fonts.display, fontSize: 20, color: theme.textPrimary },
  subtitle: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: theme.textMuted,
    marginBottom: spacing.md,
  },
  center: { alignItems: 'center', paddingVertical: spacing.xxl, gap: spacing.sm },
  errorText: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.loss },
  retryBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: layout.borderRadius,
    backgroundColor: theme.accentGreen,
  },
  retryText: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.surface },
  empty: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: theme.textMuted,
    textAlign: 'center',
    paddingVertical: spacing.xl,
  },
  section: { marginBottom: spacing.md, width: '100%' },
  list: { backgroundColor: theme.surface, width: '100%' },
});
