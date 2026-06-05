import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import LeagueScreen from '@/components/league/LeagueScreen';
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
      <View style={styles.error}>
        <StickyBack label="← ALL SCORES" onPress={() => router.replace('/')} />
        <Text style={styles.errorText}>League not found.</Text>
      </View>
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
    paddingVertical: spacing.md,
  },
  errorText: {
    fontFamily: fonts.body,
    fontSize: 16,
    color: theme.textMuted,
  },
});
