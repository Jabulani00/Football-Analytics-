import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import LeagueScreen from '@/components/league/LeagueScreen';
import AppShell from '@/components/shared/AppShell';
import StickyBack from '@/components/shared/StickyBack';
import { getLeagueById, mockLeagues } from '@/mock/leaguesData';
import { fonts, spacing, theme } from '@/styles/theme';

export function generateStaticParams() {
  return mockLeagues.map((league) => ({ id: league.id }));
}

export default function LeagueRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const league = getLeagueById(id ?? '');

  if (!league) {
    return (
      <AppShell>
        <View style={styles.error}>
          <StickyBack label="← LEAGUES" onPress={() => router.replace('/')} />
          <Text style={styles.errorText}>League not found.</Text>
        </View>
      </AppShell>
    );
  }

  return (
    <LeagueScreen
      league={league}
      onBack={() => router.replace('/')}
      onMatchPress={(matchId) => {
        router.push({
          pathname: '/match/[id]',
          params: { id: matchId, leagueId: league.id },
        });
      }}
    />
  );
}

const styles = StyleSheet.create({
  error: {
    padding: spacing.lg,
  },
  errorText: {
    fontFamily: fonts.body,
    fontSize: 16,
    color: theme.textMuted,
  },
});
