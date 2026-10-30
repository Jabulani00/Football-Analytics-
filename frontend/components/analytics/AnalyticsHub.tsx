import { useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import AdditionalStatsPanel from '@/components/analytics/AdditionalStatsPanel';
import AppNavBar from '@/components/layout/AppNavBar';
import AnalyticsNav from '@/components/analytics/AnalyticsNav';
import BetwayOddsPanel from '@/components/analytics/BetwayOddsPanel';
import BetSlipPanel from '@/components/analytics/BetSlipPanel';
import HollywoodOddsPanel from '@/components/analytics/HollywoodOddsPanel';
import OddsFusionPanel from '@/components/analytics/OddsFusionPanel';
import OverviewPanel from '@/components/analytics/OverviewPanel';
import StatsCharactersPanel from '@/components/analytics/StatsCharactersPanel';
import PredictionsPanel from '@/components/analytics/PredictionsPanel';
import SmartFinderPanel from '@/components/analytics/SmartFinderPanel';
import StatsGradingPanel from '@/components/analytics/StatsGradingPanel';
import StatsGradingMethod2Panel from '@/components/analytics/StatsGradingMethod2Panel';
import StatsGradingMethod3Panel from '@/components/analytics/StatsGradingMethod3Panel';
import OmitTestPanel from '@/components/analytics/OmitTestPanel';
import DominanceCheckerPanel from '@/components/analytics/DominanceCheckerPanel';
import OppositeStatsAnalysisPanel from '@/components/analytics/OppositeStatsAnalysisPanel';
import UnityFinderPanel from '@/components/analytics/UnityFinderPanel';
import QuerySkeletonPanel from '@/components/analytics/QuerySkeletonPanel';
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
  if (tab === 'tables' || tab === 'additional' || tab === 'streams' || tab === 'strategies' || tab === 'hollywood' || tab === 'betway') return 'result';
  return 'all';
}

type AnalyticsHubProps = {
  onBack: () => void;
};

function PanelForTab({
  tab,
  live,
  slip,
  showTableCatalogue,
}: {
  tab: AnalyticsTab;
  live: ReturnType<typeof useHollywoodPopularOdds>;
  slip: ReturnType<typeof useAnalyticsBetSlip>;
  showTableCatalogue: boolean;
}) {
  switch (tab) {
    case 'overview':
      return <OverviewPanel />;
    case 'characters':
      return <StatsCharactersPanel />;
    case 'grading':
      return <StatsGradingPanel />;
    case 'grading2':
      return <StatsGradingMethod2Panel />;
    case 'grading3':
      return <StatsGradingMethod3Panel />;
    case 'omit':
      return <OmitTestPanel />;
    case 'dominance':
      return <DominanceCheckerPanel />;
    case 'opposite':
      return <OppositeStatsAnalysisPanel />;
    case 'unity':
      return <UnityFinderPanel />;
    case 'skeleton':
      return <QuerySkeletonPanel />;
    case 'tables':
      return <StatsTablesPanel showCatalogue={showTableCatalogue} />;
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
    case 'betway':
      return <BetwayOddsPanel onAddLeg={slip.addLeg} />;
    case 'betslip':
      return <BetSlipPanel legs={slip.legs} onRemove={slip.removeLeg} onClear={slip.clear} />;
  }
}

export default function AnalyticsHub({ onBack: _onBack }: AnalyticsHubProps) {
  const narrow = useWindowDimensions().width < 720;
  const [activeTab, setActiveTab] = useState<AnalyticsTab>('overview');
  const [showTableCatalogue, setShowTableCatalogue] = useState(false);
  const [showUpcoming, setShowUpcoming] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const panelY = useRef(0);
  const needsPopularOdds = activeTab === 'strategies' || activeTab === 'odds';
  const live = useHollywoodPopularOdds(needsPopularOdds);
  const slip = useAnalyticsBetSlip();

  return (
    <AppShell>
      <AppNavBar />
      <ScrollView
        ref={scrollRef}
        style={styles.scroller}
        contentContainerStyle={[styles.scroll, narrow && styles.scrollNarrow]}
        showsVerticalScrollIndicator={Platform.OS === 'web'}>
        <View style={styles.hero}>
          <Text style={[styles.pageTitle, narrow && styles.pageTitleNarrow]}>BETTING INTELLIGENCE</Text>
          <Text style={styles.subtitle}>Football Analytics Platform · 100+ metrics · 5 phases</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open all 72 statistics tables"
            onPress={() => {
              setActiveTab('tables');
              setShowTableCatalogue(true);
              requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: panelY.current, animated: true }));
            }}
            style={({ pressed }) => [styles.tableLink, pressed && styles.tableLinkPressed]}>
            <Text style={styles.tableLinkText}>72 Tables · 36 all-games groups + 36 Last-N</Text>
            <Text style={styles.tableLinkHint}>Open full table catalogue ↓</Text>
          </Pressable>
        </View>

        <View style={styles.dropdownCard}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showUpcoming }}
            onPress={() => setShowUpcoming((open) => !open)}
            style={styles.dropdownHeader}>
            <View>
              <Text style={styles.dropdownTitle}>Upcoming matches</Text>
              <Text style={styles.dropdownHint}>Open the fixture feed when you need it</Text>
            </View>
            <Text style={styles.dropdownChevron}>{showUpcoming ? '▴' : '▾'}</Text>
          </Pressable>
          {showUpcoming ? <UpcomingMatchesPanel focus={focusForTab(activeTab)} /> : null}
        </View>

        <AnalyticsNav active={activeTab} onChange={setActiveTab} />

        <View onLayout={(event) => { panelY.current = event.nativeEvent.layout.y; }} style={styles.panel}>
          <PanelForTab tab={activeTab} live={live} slip={slip} showTableCatalogue={showTableCatalogue} />
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
  tableLink: {
    marginTop: spacing.sm,
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.accentGreen,
    backgroundColor: 'rgba(0,180,120,0.08)',
  },
  tableLinkPressed: { opacity: 0.72 },
  tableLinkText: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: theme.accentGreen },
  tableLinkHint: { fontFamily: fonts.body, fontSize: 10, color: theme.textMuted, marginTop: 2 },
  panel: {
    width: '100%',
    alignItems: 'stretch',
  },
  dropdownCard: {
    width: '100%', marginBottom: spacing.md, padding: spacing.md,
    borderWidth: 1, borderColor: theme.border, borderRadius: 12, backgroundColor: theme.surface,
  },
  dropdownHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  dropdownTitle: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: theme.textPrimary },
  dropdownHint: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted, marginTop: 2 },
  dropdownChevron: { fontFamily: fonts.bodySemiBold, fontSize: 18, color: theme.accentGreen, paddingHorizontal: spacing.sm },
});
