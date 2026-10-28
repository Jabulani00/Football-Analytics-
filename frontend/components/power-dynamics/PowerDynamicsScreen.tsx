import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import AppNavBar from '@/components/layout/AppNavBar';
import PowerDynamicCallSearch from '@/components/match-detail/PowerDynamicCallSearch';
import AppShell from '@/components/shared/AppShell';
import DragScroll from '@/components/shared/DragScroll';
import { fonts, spacing, theme } from '@/styles/theme';

export default function PowerDynamicsScreen() {
  const narrow = useWindowDimensions().width < 720;
  return (
    <AppShell>
      <AppNavBar />
      <DragScroll contentContainerStyle={[styles.scroll, narrow && styles.scrollNarrow]}>
        <View style={styles.hero}>
          <Text style={styles.kicker}>All leagues</Text>
          <Text style={[styles.title, narrow && styles.titleNarrow]}>Power dynamics</Text>
          <Text style={styles.blurb}>
            Leagues, tables, and season games are kept in this browser after the first load. A refresh opens that copy. Pick a sector, an option, and any number of in-options. Changing an in-option uses the saved copy.
          </Text>
        </View>
        <PowerDynamicCallSearch heading={false} />
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
    lineHeight: 20,
    color: theme.textMuted,
    maxWidth: 640,
  },
});
