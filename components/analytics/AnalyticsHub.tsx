import { useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import AnalyticsNav from '@/components/analytics/AnalyticsNav';
import BetSlipPanel from '@/components/analytics/BetSlipPanel';
import OddsFusionPanel from '@/components/analytics/OddsFusionPanel';
import OverviewPanel from '@/components/analytics/OverviewPanel';
import StatsTablesPanel from '@/components/analytics/StatsTablesPanel';
import StrategiesPanel from '@/components/analytics/StrategiesPanel';
import StreamsPanel from '@/components/analytics/StreamsPanel';
import AppShell from '@/components/shared/AppShell';
import StickyBack from '@/components/shared/StickyBack';
import type { AnalyticsTab } from '@/types/analytics';
import { fonts, layout, spacing, theme } from '@/styles/theme';
import { formatTopBarDate } from '@/utils/dates';

type AnalyticsHubProps = {
  onBack: () => void;
};

function PanelForTab({ tab }: { tab: AnalyticsTab }) {
  switch (tab) {
    case 'overview':
      return <OverviewPanel />;
    case 'tables':
      return <StatsTablesPanel />;
    case 'streams':
      return <StreamsPanel />;
    case 'strategies':
      return <StrategiesPanel />;
    case 'odds':
      return <OddsFusionPanel />;
    case 'betslip':
      return <BetSlipPanel />;
  }
}

export default function AnalyticsHub({ onBack }: AnalyticsHubProps) {
  const [activeTab, setActiveTab] = useState<AnalyticsTab>('overview');

  return (
    <AppShell>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={Platform.OS === 'web'}>
        <View style={styles.topBar}>
          <View style={styles.wordmark}>
            <View style={styles.logoDot} />
            <Text style={styles.logo}>SCORELINE</Text>
          </View>
          <Text style={styles.dateLabel}>{formatTopBarDate()}</Text>
        </View>

        <StickyBack label="← HOME" onPress={onBack} />

        <View style={styles.hero}>
          <Text style={styles.pageTitle}>BETTING INTELLIGENCE</Text>
          <Text style={styles.subtitle}>
            Football Analytics Platform — 72 tables · 100+ metrics · 5 phases
          </Text>
        </View>

        <AnalyticsNav active={activeTab} onChange={setActiveTab} />

        <View style={styles.panel}>
          <PanelForTab tab={activeTab} />
        </View>
      </ScrollView>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    alignItems: 'center',
    width: '100%',
    alignSelf: 'center',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.lg,
    width: '100%',
  },
  wordmark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  logoDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.accentOrange,
  },
  logo: {
    fontFamily: fonts.display,
    fontSize: 22,
    color: theme.textPrimary,
    letterSpacing: 2,
  },
  dateLabel: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: theme.textMuted,
  },
  hero: {
    alignItems: 'center',
    marginBottom: spacing.xl,
    width: '100%',
  },
  pageTitle: {
    fontFamily: fonts.display,
    fontSize: 36,
    color: theme.textPrimary,
    letterSpacing: 0.5,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: theme.textMuted,
    textAlign: 'center',
    maxWidth: 520,
    lineHeight: 22,
  },
  panel: {
    width: '100%',
    alignItems: 'center',
  },
});
