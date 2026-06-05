import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import BetSlip from '@/components/BetSlip';
import FixtureFusionSection from '@/components/fixture/FixtureFusionSection';
import StrategyWorkflow from '@/components/fixture/StrategyWorkflow';
import MatchDrawPanel from '@/components/match/MatchDrawPanel';
import MatchFootyPanel from '@/components/match/MatchFootyPanel';
import FlashscoreTabs from '@/components/shared/FlashscoreTabs';
import FixtureStatsDashboard from '@/components/stats/FixtureStatsDashboard';
import type { Fixture } from '@/mock/fixturesData';
import { spacing } from '@/styles/theme';

export type StatsHubTabId = 'ourStats' | 'footy' | 'draw' | 'fusion' | 'slip';

const TABS: { id: StatsHubTabId; label: string }[] = [
  { id: 'ourStats', label: 'Our Stats' },
  { id: 'footy', label: 'Footy Stats' },
  { id: 'draw', label: 'Draw' },
  { id: 'fusion', label: 'Fusion' },
  { id: 'slip', label: 'Bet Slip' },
];

type MatchStatsHubProps = {
  fixture: Fixture;
  matchId: string;
};

export default function MatchStatsHub({ fixture, matchId }: MatchStatsHubProps) {
  const [active, setActive] = useState<StatsHubTabId>('ourStats');

  return (
    <View style={styles.wrap}>
      <FlashscoreTabs tabs={TABS} active={active} onChange={setActive} />
      {active === 'ourStats' ? (
        <>
          <StrategyWorkflow activeStep={4} />
          <FixtureStatsDashboard fixtureId={matchId} />
        </>
      ) : null}
      {active === 'footy' ? <MatchFootyPanel fixture={fixture} /> : null}
      {active === 'draw' ? <MatchDrawPanel fixture={fixture} /> : null}
      {active === 'fusion' ? <FixtureFusionSection fixture={fixture} /> : null}
      {active === 'slip' ? <BetSlip fixture={fixture} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    marginTop: spacing.md,
  },
});
