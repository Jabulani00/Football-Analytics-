import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import StandingsTable from '@/components/match/StandingsTable';
import SubTabBar from '@/components/shared/SubTabBar';
import { getStandingsBundle } from '@/mock/leagueFeedData';
import { fonts, spacing, theme } from '@/styles/theme';

type LeagueStandingsPanelProps = {
  leagueId: string;
  leagueName: string;
};

type Split = 'overall' | 'home' | 'away';
type Era = 'current' | 'archived';

export default function LeagueStandingsPanel({ leagueId, leagueName }: LeagueStandingsPanelProps) {
  const bundle = getStandingsBundle(leagueId);
  const [split, setSplit] = useState<Split>('overall');
  const [era, setEra] = useState<Era>('current');

  const rows =
    era === 'archived'
      ? bundle.archivedOverall
      : split === 'home'
        ? bundle.currentHome
        : split === 'away'
          ? bundle.currentAway
          : bundle.currentOverall;

  if (rows.length === 0) {
    return <Text style={styles.empty}>No standings for this competition.</Text>;
  }

  return (
    <View style={styles.wrap}>
      <SubTabBar tabs={[{ id: 'current', label: 'Current' }, { id: 'archived', label: 'Archived' }]} active={era} onChange={setEra} />
      {era === 'current' ? (
        <SubTabBar
          tabs={[
            { id: 'overall', label: 'Overall' },
            { id: 'home', label: 'Home' },
            { id: 'away', label: 'Away' },
          ]}
          active={split}
          onChange={setSplit}
        />
      ) : null}
      <Text style={styles.opta}>{bundle.optaNote}</Text>
      <StandingsTable
        standings={rows}
        highlightTeams={[]}
        seasonLabel={`${leagueName} — ${era} ${split}`}
      />
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
