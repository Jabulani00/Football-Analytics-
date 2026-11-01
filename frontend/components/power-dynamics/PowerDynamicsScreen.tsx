import { useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import AppNavBar from '@/components/layout/AppNavBar';
import PowerDynamicCallSearch from '@/components/match-detail/PowerDynamicCallSearch';
import AppShell from '@/components/shared/AppShell';
import DragScroll from '@/components/shared/DragScroll';
import SubTabBar from '@/components/shared/SubTabBar';
import { fonts, spacing, theme } from '@/styles/theme';

export default function PowerDynamicsScreen() {
  const narrow = useWindowDimensions().width < 720;
  const [source, setSource] = useState<'sectors' | 'calculations'>('sectors');
  return (
    <AppShell>
      <AppNavBar />
      <DragScroll contentContainerStyle={[styles.scroll, narrow && styles.scrollNarrow]}>
        <View style={styles.hero}>
          <Text style={styles.kicker}>All leagues</Text>
          <Text style={[styles.title, narrow && styles.titleNarrow]}>Power dynamics</Text>
          <SubTabBar
            tabs={[
              { id: 'sectors', label: 'Sectors' },
              { id: 'calculations', label: 'Power dynamic calculations' },
            ]}
            active={source}
            onChange={setSource}
          />
          <Text style={styles.blurb}>
            {source === 'calculations'
              ? 'Calls from the calculations, core sectors, Y sectors, and ticks. A tick means the call holds. A cross means it does not.'
              : 'Leagues, tables, and season games stay in this browser. Choose a sector, then an option and its in-options.'}
          </Text>
        </View>
        <PowerDynamicCallSearch key={source} heading={false} source={source} />
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
