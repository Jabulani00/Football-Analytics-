import { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import SectionLabel from '@/components/shared/SectionLabel';
import { DEFAULT_BET_SLIP } from '@/mock/analyticsData';
import type { Fixture } from '@/mock/fixturesData';
import { fonts, layout, spacing, theme } from '@/styles/theme';

type FixtureBetSlipSectionProps = {
  fixture: Fixture;
};

export default function FixtureBetSlipSection({ fixture }: FixtureBetSlipSectionProps) {
  const label = `${fixture.homeTeam.name} vs ${fixture.awayTeam.name}`;
  const legs = useMemo(
    () => {
      const token = fixture.homeTeam.name.split(' ')[0] ?? '';
      return DEFAULT_BET_SLIP.filter((l) => l.fixture === label || (token && l.fixture.includes(token)));
    },
    [fixture, label],
  );
  const displayLegs = legs.length > 0 ? legs : DEFAULT_BET_SLIP.slice(0, 1);
  const [stake, setStake] = useState('50');

  const combined = displayLegs.reduce((a, l) => a * l.odds, 1);
  const totalStake = (parseFloat(stake) || 0) * displayLegs.length;

  return (
    <View style={styles.wrap}>
      <SectionLabel>GENERATED BET SLIP</SectionLabel>
      {displayLegs.map((leg, i) => (
        <View key={leg.id} style={styles.leg}>
          <Text style={styles.idx}>{i + 1}</Text>
          <View style={styles.legBody}>
            <Text style={styles.fixture}>{leg.fixture}</Text>
            <Text style={styles.market}>
              {leg.market} — {leg.selection} @ {leg.odds.toFixed(2)}
            </Text>
          </View>
        </View>
      ))}
      <View style={styles.totals}>
        <Text style={styles.totalLine}>Combined odds: {combined.toFixed(2)}</Text>
        <View style={styles.stakeRow}>
          <Text style={styles.stakeLabel}>Stake per leg (R)</Text>
          <TextInput
            style={styles.stakeInput}
            value={stake}
            onChangeText={setStake}
            keyboardType="decimal-pad"
          />
        </View>
        <Text style={styles.return}>
          Potential return: R{(totalStake * combined).toFixed(2)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    backgroundColor: theme.surface,
    borderRadius: layout.borderRadius,
    borderWidth: layout.borderWidth,
    borderColor: theme.accentGreen,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  leg: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  idx: {
    fontFamily: fonts.display,
    fontSize: 18,
    color: theme.accentGreen,
    width: 24,
  },
  legBody: { flex: 1 },
  fixture: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: theme.textPrimary,
  },
  market: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textMuted,
    marginTop: 2,
  },
  totals: { marginTop: spacing.lg, gap: spacing.sm },
  totalLine: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: theme.textPrimary,
  },
  stakeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  stakeLabel: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textMuted,
  },
  stakeInput: {
    flex: 1,
    maxWidth: 120,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 8,
    padding: spacing.sm,
    fontFamily: fonts.body,
    fontSize: 14,
    color: theme.textPrimary,
    backgroundColor: theme.surfaceMuted,
  },
  return: {
    fontFamily: fonts.display,
    fontSize: 18,
    color: theme.accentGreen,
  },
});
