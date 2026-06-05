import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import H2HList from '@/components/match/H2HList';
import SubTabBar from '@/components/shared/SubTabBar';
import { filterH2HBySplit, type H2HSplit } from '@/mock/h2hData';
import type { H2HResult } from '@/mock/matchData';
import { fonts, spacing, theme } from '@/styles/theme';

type H2HPanelProps = {
  results: H2HResult[];
  homeTeamName: string;
  awayTeamName: string;
};

export default function H2HPanel({ results, homeTeamName, awayTeamName }: H2HPanelProps) {
  const [split, setSplit] = useState<H2HSplit>('overall');

  const filtered = useMemo(
    () => filterH2HBySplit(results, split, homeTeamName, awayTeamName),
    [results, split, homeTeamName, awayTeamName],
  );

  if (results.length === 0) {
    return (
      <Text style={styles.empty}>Head-to-head history is not available for this fixture yet.</Text>
    );
  }

  return (
    <View style={styles.wrap}>
      <SubTabBar
        tabs={[
          { id: 'overall', label: 'Overall' },
          { id: 'home', label: 'Home' },
          { id: 'away', label: 'Away' },
        ]}
        active={split}
        onChange={setSplit}
      />
      {filtered.length > 0 ? (
        <H2HList results={filtered} homeTeamName={homeTeamName} awayTeamName={awayTeamName} />
      ) : (
        <Text style={styles.empty}>No meetings in this split.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  empty: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: theme.textMuted,
    fontStyle: 'italic',
    padding: spacing.lg,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    width: '100%',
  },
});
