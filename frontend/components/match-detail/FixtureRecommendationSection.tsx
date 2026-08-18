import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import RecommendationCard from '@/components/analytics/RecommendationCard';
import SubTabBar from '@/components/shared/SubTabBar';
import type { OddsByMarket, Probability } from '@/services/oddAlerts';
import { oddsInputFromApi, predictionFromApiProbability } from '@/utils/apiRecommendationAdapter';
import { buildRecommendation, type MarketModule } from '@/utils/fixtureRecommendation';
import { fonts, spacing, theme } from '@/styles/theme';

type ModuleFilter = 'all' | MarketModule;

const MODULE_TABS: { id: ModuleFilter; label: string }[] = [
  { id: 'all', label: 'All markets' },
  { id: 'result', label: 'Result' },
  { id: 'goals', label: 'Goals' },
  { id: 'btts', label: 'BTTS' },
];

type Props = {
  probability: Probability | undefined;
  odds: OddsByMarket | undefined;
  homeName: string;
  awayName: string;
  homePosition?: number | null;
  awayPosition?: number | null;
  isLive?: boolean;
};

/**
 * The headline "best bet" for a single fixture, built from the fixture's REAL
 * model probabilities + bookmaker odds. A module filter re-targets which market
 * the recommendation is drawn from.
 */
export default function FixtureRecommendationSection({
  probability,
  odds,
  homeName,
  awayName,
  homePosition,
  awayPosition,
  isLive,
}: Props) {
  const [module, setModule] = useState<ModuleFilter>('all');

  const rec = useMemo(() => {
    if (!probability || probability.home_win == null) return null;
    return buildRecommendation({
      prediction: predictionFromApiProbability(probability),
      homeName,
      awayName,
      homePosition,
      awayPosition,
      odds: oddsInputFromApi(odds),
      modules: module === 'all' ? undefined : [module],
    });
  }, [probability, odds, homeName, awayName, homePosition, awayPosition, module]);

  // No model probabilities → nothing to recommend (e.g. obscure/early fixtures).
  if (!rec) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Recommendation</Text>
      <SubTabBar tabs={MODULE_TABS} active={module} onChange={setModule} />
      <RecommendationCard
        rec={rec}
        homePosition={homePosition}
        awayPosition={awayPosition}
        isLive={isLive}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  title: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: theme.textPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
});
