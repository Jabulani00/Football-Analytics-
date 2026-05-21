import { StyleSheet, Text, View } from 'react-native';

import SectionLabel from '@/components/shared/SectionLabel';
import type { Fixture } from '@/mock/fixturesData';
import { getMatchOddsMarkets } from '@/mock/matchFeedData';
import { fonts, layout, spacing, theme } from '@/styles/theme';

type MatchOddsPanelProps = {
  fixture: Fixture;
};

export default function MatchOddsPanel({ fixture }: MatchOddsPanelProps) {
  const markets = getMatchOddsMarkets(fixture);

  return (
    <View style={styles.wrap}>
      <Text style={styles.source}>Odds Alert API · Hollywoodbets — in fixture context</Text>
      <View style={styles.table}>
        <View style={styles.header}>
          <Text style={[styles.h, styles.wide]}>Market</Text>
          <Text style={[styles.h, styles.wide]}>Selection</Text>
          <Text style={styles.h}>Hollywood</Text>
          <Text style={styles.h}>Odds Alert</Text>
        </View>
        {markets.map((m) => (
          <View key={`${m.market}-${m.selection}`} style={styles.row}>
            <Text style={[styles.cell, styles.wide]}>{m.market}</Text>
            <Text style={[styles.cell, styles.wide, styles.sel]}>{m.selection}</Text>
            <Text style={styles.cell}>{m.hollywood.toFixed(2)}</Text>
            <Text style={[styles.cell, styles.alert]}>{m.oddsAlert.toFixed(2)}</Text>
          </View>
        ))}
      </View>
      <SectionLabel style={styles.section}>1X2 — QUICK VIEW</SectionLabel>
      <View style={styles.chips}>
        <Text style={styles.chip}>1 {fixture.odds.home}</Text>
        <Text style={styles.chip}>X {fixture.odds.draw}</Text>
        <Text style={styles.chip}>2 {fixture.odds.away}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  source: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textMuted,
    marginBottom: spacing.md,
  },
  table: {
    backgroundColor: theme.surface,
    borderRadius: layout.borderRadius,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    overflow: 'hidden',
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    backgroundColor: theme.surfaceMuted,
    padding: spacing.sm,
    borderBottomWidth: layout.borderWidth,
    borderBottomColor: theme.border,
  },
  h: {
    flex: 1,
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    color: theme.textMuted,
    textAlign: 'center',
  },
  wide: { flex: 1.5 },
  row: {
    flexDirection: 'row',
    padding: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    alignItems: 'center',
  },
  cell: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textMuted,
    textAlign: 'center',
  },
  sel: { color: theme.textPrimary, fontFamily: fonts.bodyMedium },
  alert: { color: theme.accentBlue, fontFamily: fonts.bodySemiBold },
  section: { marginTop: spacing.xl },
  chips: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  chip: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: theme.accentGreen,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: layout.borderRadius,
    backgroundColor: theme.surface,
  },
});
