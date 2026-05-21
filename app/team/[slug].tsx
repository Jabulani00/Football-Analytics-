import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import AppShell from '@/components/shared/AppShell';
import StickyBack from '@/components/shared/StickyBack';
import TeamScreen from '@/components/team/TeamScreen';
import { getAllTeamSlugs, getTeamBySlug } from '@/mock/teamData';
import { fonts, spacing, theme } from '@/styles/theme';

export function generateStaticParams() {
  return getAllTeamSlugs();
}

export default function TeamRoute() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const team = getTeamBySlug(slug ?? '');

  if (!team) {
    return (
      <AppShell>
        <View style={styles.error}>
          <StickyBack label="← BACK" onPress={() => router.back()} />
          <Text style={styles.errorText}>Team not found.</Text>
        </View>
      </AppShell>
    );
  }

  return <TeamScreen team={team} onBack={() => router.back()} />;
}

const styles = StyleSheet.create({
  error: { padding: spacing.lg },
  errorText: {
    fontFamily: fonts.body,
    fontSize: 16,
    color: theme.textMuted,
  },
});
