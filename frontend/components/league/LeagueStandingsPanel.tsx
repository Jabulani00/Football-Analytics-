import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import StandingsAnalyticsView from '@/components/league/StandingsAnalyticsView';
import StandingsTable from '@/components/match/StandingsTable';
import SubTabBar from '@/components/shared/SubTabBar';
import { getStandingsBundle } from '@/mock/leagueFeedData';
import { fonts, spacing, theme } from '@/styles/theme';

type LeagueStandingsPanelProps = {
  leagueId: string;
  leagueName: string;
};

type Era = 'current' | 'archived';

export default function LeagueStandingsPanel({ leagueId, leagueName }: LeagueStandingsPanelProps) {
  const bundle = getStandingsBundle(leagueId);
  const [era, setEra] = useState<Era>('current');

  if (bundle.currentOverall.length === 0) {
    return <Text style={styles.empty}>No standings for this competition.</Text>;
  }

  return (
    <View style={styles.wrap}>
      {/* Existing "year" tabs — the new analytics filter row sits below them. */}
      <SubTabBar
        tabs={[
          { id: 'current', label: 'Current' },
          { id: 'archived', label: 'Archived' },
        ]}
        active={era}
        onChange={setEra}
      />
      <Text style={styles.opta}>{bundle.optaNote}</Text>

      {era === 'current' ? (
        <StandingsAnalyticsView base={bundle.currentOverall} seasonLabel={`${leagueName} — Current`} />
      ) : (
        <StandingsTable
          standings={bundle.archivedOverall}
          highlightTeams={[]}
          seasonLabel={`${leagueName} — Archived`}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  opta: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.accentBlue,
    marginBottom: spacing.md,
    fontStyle: 'italic',
  },
  empty: {
    fontFamily: fonts.body,
    color: theme.textMuted,
    padding: spacing.lg,
  },
});
