import { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import SectionLabel from '@/components/shared/SectionLabel';
import { DEFAULT_BET_SLIP } from '@/mock/analyticsData';
import type { BetSlipLeg } from '@/types/analytics';
import { fonts, layout, spacing, theme } from '@/styles/theme';

export default function BetSlipPanel() {
  const [legs, setLegs] = useState<BetSlipLeg[]>(DEFAULT_BET_SLIP);
  const [stakePerLeg, setStakePerLeg] = useState('50');

  const combinedOdds = useMemo(
    () => legs.reduce((acc, leg) => acc * leg.odds, 1),
    [legs],
  );

  const totalStake = useMemo(() => {
    const s = parseFloat(stakePerLeg) || 0;
    return s * legs.length;
  }, [legs.length, stakePerLeg]);

  const potentialReturn = totalStake * combinedOdds;

  const removeLeg = (id: string) => setLegs((prev) => prev.filter((l) => l.id !== id));

  return (
    <View style={styles.container}>
      <Text style={styles.intro}>
        Phase 5 — Auto-generate bet slips from strategy outputs. Track selections in the
        interactive dashboard with fixture coordination by date and kickoff.
      </Text>

      <View style={styles.slip}>
        <SectionLabel style={styles.slipTitle}>Generated Bet Slip</SectionLabel>

        {legs.map((leg, index) => (
          <View key={leg.id} style={styles.leg}>
            <Text style={styles.legIndex}>{index + 1}</Text>
            <View style={styles.legBody}>
              <Text style={styles.legFixture}>{leg.fixture}</Text>
              <Text style={styles.legMarket}>
                {leg.market} — {leg.selection}
              </Text>
              <Text style={styles.legOdds}>@ {leg.odds.toFixed(2)}</Text>
            </View>
            <Pressable onPress={() => removeLeg(leg.id)} style={styles.removeBtn}>
              <Text style={styles.removeText}>×</Text>
            </Pressable>
          </View>
        ))}

        {legs.length === 0 ? (
          <Text style={styles.empty}>Add selections from Strategies or Odds Fusion.</Text>
        ) : null}

        <View style={styles.stakeRow}>
          <Text style={styles.stakeLabel}>Stake per leg (R)</Text>
          <TextInput
            style={styles.stakeInput}
            value={stakePerLeg}
            onChangeText={setStakePerLeg}
            keyboardType="decimal-pad"
            placeholderTextColor={theme.textFaint}
          />
        </View>

        <View style={styles.totals}>
          <TotalRow label="Legs" value={String(legs.length)} />
          <TotalRow label="Combined odds" value={combinedOdds.toFixed(2)} highlight />
          <TotalRow label="Total stake" value={`R ${totalStake.toFixed(2)}`} />
          <TotalRow label="Potential return" value={`R ${potentialReturn.toFixed(2)}`} highlight />
        </View>

        <Pressable
          style={({ pressed, hovered }) => [
            styles.generateBtn,
            (pressed || (Platform.OS === 'web' && hovered)) && styles.generateBtnHover,
            legs.length === 0 && styles.generateBtnDisabled,
          ]}
          disabled={legs.length === 0}>
          <Text style={styles.generateText}>EXPORT TO HOLLYWOODBETS</Text>
        </Pressable>
      </View>

      <View style={styles.tracking}>
        <SectionLabel style={styles.trackTitle}>Tracking Dashboard</SectionLabel>
        <View style={styles.trackGrid}>
          <TrackStat label="Open" value="3" />
          <TrackStat label="Won" value="12" />
          <TrackStat label="Lost" value="5" />
          <TrackStat label="ROI" value="+8.4%" positive />
        </View>
      </View>
    </View>
  );
}

function TotalRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <View style={styles.totalRow}>
      <Text style={styles.totalLabel}>{label}</Text>
      <Text style={[styles.totalValue, highlight && styles.totalHighlight]}>{value}</Text>
    </View>
  );
}

function TrackStat({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <View style={styles.trackCard}>
      <Text style={[styles.trackValue, positive && styles.trackPositive]}>{value}</Text>
      <Text style={styles.trackLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
  },
  intro: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: theme.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 560,
    marginBottom: spacing.lg,
  },
  slip: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: theme.surface,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    padding: spacing.lg,
    alignItems: 'center',
  },
  slipTitle: {
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  leg: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    borderBottomWidth: layout.borderWidth,
    borderBottomColor: theme.border,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  legIndex: {
    fontFamily: fonts.display,
    fontSize: 18,
    color: theme.textFaint,
    width: 24,
    textAlign: 'center',
  },
  legBody: {
    flex: 1,
    alignItems: 'center',
  },
  legFixture: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: theme.textPrimary,
    marginBottom: 2,
    textAlign: 'center',
  },
  legMarket: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textMuted,
    textAlign: 'center',
  },
  legOdds: {
    fontFamily: fonts.display,
    fontSize: 16,
    color: theme.accentGreen,
    marginTop: spacing.xs,
  },
  removeBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: {
    fontFamily: fonts.body,
    fontSize: 20,
    color: theme.textMuted,
  },
  empty: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: theme.textMuted,
    paddingVertical: spacing.lg,
    textAlign: 'center',
  },
  stakeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    marginTop: spacing.lg,
    width: '100%',
  },
  stakeLabel: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: theme.textMuted,
  },
  stakeInput: {
    fontFamily: fonts.bodyMedium,
    fontSize: 16,
    color: theme.textPrimary,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minWidth: 80,
    textAlign: 'center',
    backgroundColor: theme.bg,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}),
  },
  totals: {
    width: '100%',
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: layout.borderWidth,
    borderTopColor: theme.border,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  totalLabel: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: theme.textMuted,
  },
  totalValue: {
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    color: theme.textPrimary,
  },
  totalHighlight: {
    fontFamily: fonts.display,
    fontSize: 18,
    color: theme.accentGreen,
  },
  generateBtn: {
    marginTop: spacing.lg,
    backgroundColor: theme.accentGreen,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: layout.borderRadius,
    width: '100%',
    alignItems: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : {}),
  },
  generateBtnHover: {
    opacity: 0.9,
  },
  generateBtnDisabled: {
    opacity: 0.4,
  },
  generateText: {
    fontFamily: fonts.display,
    fontSize: 14,
    color: theme.bg,
    letterSpacing: 1,
  },
  tracking: {
    marginTop: spacing.xl,
    width: '100%',
    maxWidth: 480,
    alignItems: 'center',
  },
  trackTitle: {
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  trackGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.md,
    width: '100%',
  },
  trackCard: {
    flex: 1,
    minWidth: 90,
    backgroundColor: theme.surface,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    padding: spacing.md,
    alignItems: 'center',
  },
  trackValue: {
    fontFamily: fonts.display,
    fontSize: 24,
    color: theme.textPrimary,
    marginBottom: spacing.xs,
  },
  trackPositive: {
    color: theme.accentGreen,
  },
  trackLabel: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
