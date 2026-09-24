import { useMemo, useState } from 'react';
import { Platform, Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';

import SectionLabel from '@/components/shared/SectionLabel';
import { useHollywoodExport } from '@/hooks/useHollywoodExport';
import { buildBetSlipSummary } from '@/services/betSlipShare';
import type { BetSlipLeg } from '@/types/analytics';
import { fonts, layout, spacing, theme } from '@/styles/theme';

export default function BetSlipPanel({
  legs,
  onRemove,
  onClear,
}: {
  legs: BetSlipLeg[];
  onRemove: (id: string) => void;
  onClear: () => void;
}) {
  const [stakeInput, setStakeInput] = useState('50');
  const [mode, setMode] = useState<'accumulator' | 'singles'>('accumulator');
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const { state: exportState, exportSlip } = useHollywoodExport();

  // Only Hollywoodbets-sourced legs carry the metadata a booking code needs.
  const hbLegs = useMemo(() => legs.map((l) => l.hbLeg).filter((l): l is NonNullable<typeof l> => l != null), [legs]);
  const canExport = mode === 'accumulator' && legs.length > 0 && hbLegs.length === legs.length;

  const combinedOdds = useMemo(
    () => legs.reduce((acc, leg) => acc * leg.odds, 1),
    [legs],
  );

  const stake = Math.max(0, parseFloat(stakeInput) || 0);
  const totalStake = legs.length === 0 ? 0 : mode === 'accumulator' ? stake : stake * legs.length;

  const potentialReturn =
    mode === 'accumulator'
      ? legs.length > 0 ? stake * combinedOdds : 0
      : legs.reduce((sum, leg) => sum + stake * leg.odds, 0);

  const shareSlip = async () => {
    if (legs.length === 0) return;
    const message = buildBetSlipSummary(legs, { mode, stake });
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
        if (typeof navigator.share === 'function') {
          await navigator.share({ title: 'Scoreline Bet Slip', text: message });
          setShareMessage('Bet slip shared.');
        } else if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(message);
          setShareMessage('Bet slip copied to your clipboard.');
        } else {
          throw new Error('Sharing is not supported by this browser.');
        }
      } else {
        await Share.share({ title: 'Scoreline Bet Slip', message });
        setShareMessage('Bet slip shared.');
      }
    } catch (error) {
      setShareMessage(error instanceof Error ? error.message : 'Could not share this bet slip.');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.intro}>
        Selections added from Hollywoodbets, Odds Fusion, or qualified Strategies are saved on
        this device. Review the slip, share a bookmaker-aware text summary, or generate a
        Hollywoodbets booking code when every leg came from Hollywoodbets.
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
              {leg.bookmaker ? <Text style={styles.legBook}>{leg.bookmaker}</Text> : null}
            </View>
            <Pressable onPress={() => onRemove(leg.id)} style={styles.removeBtn}>
              <Text style={styles.removeText}>×</Text>
            </Pressable>
          </View>
        ))}

        {legs.length === 0 ? (
          <Text style={styles.empty}>Add selections from Strategies or Odds Fusion.</Text>
        ) : null}

        <View style={styles.modeRow}>
          {(['accumulator', 'singles'] as const).map((item) => (
            <Pressable key={item} onPress={() => setMode(item)} style={[styles.modeBtn, mode === item && styles.modeBtnActive]}>
              <Text style={[styles.modeText, mode === item && styles.modeTextActive]}>{item.toUpperCase()}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.stakeRow}>
          <Text style={styles.stakeLabel}>{mode === 'accumulator' ? 'Accumulator stake (R)' : 'Stake per single (R)'}</Text>
          <TextInput
            style={styles.stakeInput}
            value={stakeInput}
            onChangeText={setStakeInput}
            keyboardType="decimal-pad"
            placeholderTextColor={theme.textFaint}
          />
        </View>

        <View style={styles.totals}>
          <TotalRow label="Legs" value={String(legs.length)} />
          {mode === 'accumulator' ? (
            <TotalRow label="Combined odds" value={legs.length > 0 ? combinedOdds.toFixed(2) : '—'} highlight />
          ) : null}
          <TotalRow label="Total stake" value={`R ${totalStake.toFixed(2)}`} />
          <TotalRow label="Potential return" value={`R ${potentialReturn.toFixed(2)}`} highlight />
        </View>

        {legs.length > 0 ? (
          <View style={styles.slipActions}>
            <Pressable onPress={() => void shareSlip()} style={styles.shareBtn}>
              <Text style={styles.shareText}>SHARE / COPY SUMMARY</Text>
            </Pressable>
            <Pressable onPress={onClear} style={styles.clearBtn}>
              <Text style={styles.clearText}>CLEAR SLIP</Text>
            </Pressable>
          </View>
        ) : null}
        {shareMessage ? <Text style={styles.shareMessage}>{shareMessage}</Text> : null}

        <Pressable
          onPress={() => canExport && exportSlip(hbLegs)}
          style={({ pressed, hovered }) => [
            styles.generateBtn,
            (pressed || (Platform.OS === 'web' && hovered)) && styles.generateBtnHover,
            (!canExport || exportState.status === 'loading') && styles.generateBtnDisabled,
          ]}
          disabled={!canExport || exportState.status === 'loading'}>
          <Text style={styles.generateText}>
            {exportState.status === 'loading' ? 'GENERATING…' : 'EXPORT TO HOLLYWOODBETS'}
          </Text>
        </Pressable>

        {legs.length > 0 && !canExport ? (
          <Text style={styles.exportHint}>
            {mode === 'singles'
              ? 'Switch to Accumulator to generate one Hollywoodbets booking code.'
              : 'Every leg must come from live Hollywoodbets odds to generate a booking code.'}
          </Text>
        ) : null}
        {exportState.status === 'done' ? (
          <Text style={styles.exportOk}>
            Booking code {exportState.code} — opening Hollywoodbets…
          </Text>
        ) : null}
        {exportState.status === 'error' ? (
          <Text style={styles.exportErr}>{exportState.message}</Text>
        ) : null}
      </View>

      <View style={styles.tracking}>
        <SectionLabel style={styles.trackTitle}>Tracking Dashboard</SectionLabel>
        <View style={styles.trackGrid}>
          <TrackStat label="Open" value={String(legs.length)} />
          <TrackStat label="Won" value="—" />
          <TrackStat label="Lost" value="—" />
          <TrackStat label="ROI" value="—" />
        </View>
        <Text style={styles.trackingNote}>
          Settlement and ROI stay unreported until a verified results feed is joined; Scoreline does not guess outcomes.
        </Text>
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
  legBook: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 9,
    color: theme.accentBlue,
    marginTop: 2,
    textTransform: 'uppercase',
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
  modeRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  modeBtn: {
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : {}),
  },
  modeBtnActive: { borderColor: theme.accentGreen, backgroundColor: theme.surfaceMuted },
  modeText: { fontFamily: fonts.bodySemiBold, fontSize: 10, color: theme.textMuted },
  modeTextActive: { color: theme.accentGreen },
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
  clearBtn: { marginTop: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  clearText: { fontFamily: fonts.bodySemiBold, fontSize: 10, color: theme.textMuted, letterSpacing: 0.5 },
  slipActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  shareBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderWidth: layout.borderWidth,
    borderColor: theme.accentBlue,
    borderRadius: layout.borderRadius,
  },
  shareText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    color: theme.accentBlue,
    letterSpacing: 0.5,
  },
  shareMessage: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: theme.accentGreen,
    textAlign: 'center',
    marginTop: spacing.xs,
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
  exportHint: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  exportOk: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: theme.accentGreen,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  exportErr: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.loss,
    textAlign: 'center',
    marginTop: spacing.sm,
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
  trackingNote: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: theme.textFaint,
    textAlign: 'center',
    lineHeight: 15,
    marginTop: spacing.sm,
    maxWidth: 420,
  },
});
