import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import AdditionalStatsPanel from '@/components/analytics/AdditionalStatsPanel';
import UpcomingMatchesPanel from '@/components/scores/UpcomingMatchesPanel';
import AppNavBar from '@/components/layout/AppNavBar';
import DragScroll from '@/components/shared/DragScroll';
import AppShell from '@/components/shared/AppShell';
import { fonts, spacing, theme } from '@/styles/theme';

export default function AdditionalStatsScreen(_props: { onBack: () => void }) {
  const narrow = useWindowDimensions().width < 720;
  return (
    <AppShell>
      <AppNavBar />
      <DragScroll contentContainerStyle={[styles.scroll, narrow && styles.scrollNarrow]}>
        <View style={styles.hero}>
          <Text style={styles.kicker}>Extra families</Text>
          <Text style={[styles.title, narrow && styles.titleNarrow]}>Additional stats</Text>
          <Text style={styles.blurb}>
            Points per game, series, full-time patterns, and league averages. Ordinary tables stay on Stats Tables.
          </Text>
        </View>
        <UpcomingMatchesPanel focus="result" />
        <AdditionalStatsPanel />
      </DragScroll>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    width: '100%',
  },
  scrollNarrow: {
    paddingHorizontal: spacing.md,
  },
  hero: {
    marginBottom: spacing.lg,
    gap: spacing.xs,
  },
  kicker: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    letterSpacing: 1,
    color: theme.textMuted,
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 32,
    color: theme.textPrimary,
  },
  titleNarrow: {
    fontSize: 26,
  },
  blurb: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: theme.textMuted,
    maxWidth: 640,
  },
});
