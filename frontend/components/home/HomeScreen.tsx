import { Platform, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import LeagueCard from '@/components/home/LeagueCard';
import PageContainer from '@/components/shared/PageContainer';
import AppShell from '@/components/shared/AppShell';
import { PROJECT_META } from '@/constants/statsCatalogue';
import { mockLeagues } from '@/mock/leaguesData';
import { fonts, spacing, theme } from '@/styles/theme';
import { formatTopBarDate } from '@/utils/dates';

type HomeScreenProps = {
  onLeaguePress: (leagueId: string) => void;
};

export default function HomeScreen({ onLeaguePress }: HomeScreenProps) {
  const { width } = useWindowDimensions();
  const columns = width >= 1400 ? 4 : width >= 1100 ? 3 : width >= 700 ? 2 : 1;
  const gap = spacing.md;
  const pad = spacing.page * 2;
  const cardWidth = (width - pad - gap * (columns - 1)) / columns;

  return (
    <AppShell>
      <PageContainer contentContainerStyle={styles.scroll}>
        <View style={styles.topBar}>
          <View style={styles.wordmark}>
            <View style={styles.logoDot} />
            <View>
              <Text style={styles.logo}>SCORELINE</Text>
              <Text style={styles.tagline}>Football analytics & betting intelligence</Text>
            </View>
          </View>
          <Text style={styles.dateLabel}>{formatTopBarDate()}</Text>
        </View>

        <View style={styles.hero}>
          <Text style={styles.pageTitle}>TODAY&apos;S FOOTBALL</Text>
          <Text style={styles.subLabel}>
            Our stats engine — {PROJECT_META.totalTables} tables · {PROJECT_META.ordinaryCount} ordinary
            metrics · {PROJECT_META.metricsPerTable}+ stats per team · built for upcoming fixtures
          </Text>
        </View>

        <View style={styles.grid}>
          {mockLeagues.map((league) => (
            <View key={league.id} style={{ width: Math.max(280, cardWidth) }}>
              <LeagueCard league={league} onPress={() => onLeaguePress(league.id)} />
            </View>
          ))}
        </View>
      </PageContainer>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: spacing.page,
    width: '100%',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.lg,
    width: '100%',
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    marginBottom: spacing.xl,
  },
  wordmark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  logoDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: theme.accentGreen,
  },
  logo: {
    fontFamily: fonts.display,
    fontSize: 28,
    color: theme.textPrimary,
    letterSpacing: 2,
  },
  tagline: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textMuted,
    marginTop: 2,
  },
  dateLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    color: theme.textMuted,
  },
  hero: {
    marginBottom: spacing.xl,
    width: '100%',
  },
  pageTitle: {
    fontFamily: fonts.display,
    fontSize: 48,
    color: theme.textPrimary,
    marginBottom: spacing.sm,
    letterSpacing: 0.5,
  },
  subLabel: {
    fontFamily: fonts.body,
    fontSize: 16,
    color: theme.textMuted,
    lineHeight: 24,
    maxWidth: 720,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    width: '100%',
    justifyContent: 'flex-start',
  },
});
