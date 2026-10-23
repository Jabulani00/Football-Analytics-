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
            Pick a power dynamic, a function, and an aspect. Teams from every club league are listed from the closest fit to the weakest.
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
