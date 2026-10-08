import { useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import AdditionalStatsPanel from '@/components/analytics/AdditionalStatsPanel';
import AppNavBar from '@/components/layout/AppNavBar';
import AnalyticsNav from '@/components/analytics/AnalyticsNav';
import BetSlipPanel from '@/components/analytics/BetSlipPanel';
import HollywoodOddsPanel from '@/components/analytics/HollywoodOddsPanel';
import OddsFusionPanel from '@/components/analytics/OddsFusionPanel';
import OverviewPanel from '@/components/analytics/OverviewPanel';
import PredictionsPanel from '@/components/analytics/PredictionsPanel';
import SmartFinderPanel from '@/components/analytics/SmartFinderPanel';
import FootyStatsPanel from '@/components/analytics/FootyStatsPanel';
import StatsTablesPanel from '@/components/analytics/StatsTablesPanel';
import StrategiesPanel from '@/components/analytics/StrategiesPanel';
import StreamsPanel from '@/components/analytics/StreamsPanel';
import UpcomingMatchesPanel, { type PredictFocus } from '@/components/scores/UpcomingMatchesPanel';
import AppShell from '@/components/shared/AppShell';
import { useAnalyticsBetSlip } from '@/hooks/useAnalyticsBetSlip';
import { useHollywoodPopularOdds } from '@/hooks/useHollywoodPopularOdds';
import type { AnalyticsTab } from '@/types/analytics';
import { fonts, spacing, theme } from '@/styles/theme';

function focusForTab(tab: AnalyticsTab): PredictFocus {
  if (tab === 'footy' || tab === 'odds') return 'goals';
  if (tab === 'tables' || tab === 'additional' || tab === 'streams' || tab === 'strategies' || tab === 'hollywood') return 'result';
  return 'all';
}

type AnalyticsHubProps = {
  onBack: () => void;
};

function PanelForTab({
  tab,
  live,
  slip,
}: {
  tab: AnalyticsTab;
  live: ReturnType<typeof useHollywoodPopularOdds>;
  slip: ReturnType<typeof useAnalyticsBetSlip>;
}) {
  switch (tab) {
    case 'overview':
      return <OverviewPanel />;
    case 'tables':
      return <StatsTablesPanel />;
    case 'additional':
      return <AdditionalStatsPanel />;
    case 'footy':
      return <FootyStatsPanel />;
    case 'predictions':
      return <PredictionsPanel />;
    case 'finder':
      return <SmartFinderPanel />;
    case 'streams':
      return <StreamsPanel />;
    case 'strategies':
      return <StrategiesPanel live={live} onAddLeg={slip.addLeg} />;
    case 'odds':
      return <OddsFusionPanel live={live} onAddLeg={slip.addLeg} />;
    case 'hollywood':
      return <HollywoodOddsPanel onAddLeg={slip.addLeg} />;
    case 'betslip':
      return <BetSlipPanel legs={slip.legs} onRemove={slip.removeLeg} onClear={slip.clear} />;
  }
}

export default function AnalyticsHub({ onBack: _onBack }: AnalyticsHubProps) {
  const narrow = useWindowDimensions().width < 720;
  const [activeTab, setActiveTab] = useState<AnalyticsTab>('overview');
  const needsPopularOdds = activeTab === 'strategies' || activeTab === 'odds';
  const live = useHollywoodPopularOdds(needsPopularOdds);
  const slip = useAnalyticsBetSlip();

  return (
    <AppShell>
      <AppNavBar />
      <ScrollView
        style={styles.scroller}
        contentContainerStyle={[styles.scroll, narrow && styles.scrollNarrow]}
        showsVerticalScrollIndicator={Platform.OS === 'web'}>
        <View style={styles.hero}>
          <Text style={[styles.pageTitle, narrow && styles.pageTitleNarrow]}>BETTING INTELLIGENCE</Text>
          <Text style={styles.subtitle}>
            Football Analytics Platform — 72 tables · 100+ metrics · 5 phases
          </Text>
        </View>

        <UpcomingMatchesPanel focus={focusForTab(activeTab)} />

        <AnalyticsNav active={activeTab} onChange={setActiveTab} />

        <View style={styles.panel}>
          <PanelForTab tab={activeTab} live={live} slip={slip} />
        </View>
      </ScrollView>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  scroller: { flex: 1, width: '100%' },
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    width: '100%',
  },
  scrollNarrow: {
    paddingHorizontal: spacing.md,
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
  pageTitleNarrow: {
    fontSize: 28,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: theme.textMuted,
    textAlign: 'center',
    width: '100%',
    lineHeight: 22,
  },
  panel: {
    width: '100%',
    alignItems: 'stretch',
  },
});
