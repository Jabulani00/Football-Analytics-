import { StyleSheet, Text, View } from 'react-native';

import {
  VERDICT_LABEL,
  type FixtureHiddenLayers,
  type HiddenSignal,
  type ProblemRow,
} from '@/utils/hiddenLayers';
import { fonts, layout, spacing, theme } from '@/styles/theme';

function SignalLine({ s }: { s: HiddenSignal }) {
  const color = s.polarity === 'strength' ? theme.accentGreen : theme.loss;
  return (
    <Text style={[styles.signal, { color }]}>
      [{s.side}] {s.naming} · {s.detail}
      {s.canCallOut ? ' · call-out' : ''}
    </Text>
  );
}

function ProblemLine({ p }: { p: ProblemRow }) {
  return (
    <View style={styles.problemRow}>
      <Text style={styles.problemCode}>{p.code}</Text>
      <View style={styles.problemBody}>
        <Text style={styles.problemName}>{p.naming}</Text>
        <Text style={styles.problemDetail}>
          {p.polarity} · {p.valueLabel} · level {p.level}
          {p.canCallOut ? ' · can call out' : ' · no call-out'}
        </Text>
      </View>
    </View>
  );
}

/** Presentational Section 6 block (fed by useFixtureFormAnalysis). */
export function HiddenLayersView({
  layers,
  homeName,
  awayName,
}: {
  layers: FixtureHiddenLayers;
  homeName: string;
  awayName: string;
}) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Hidden layers</Text>
      <Text style={styles.sub}>
        Section 6 · {homeName} vs {awayName} · mode {layers.mode}
        {layers.pointsDiff != null ? ` · ΔP ${layers.pointsDiff}` : ''}
      </Text>

      <View style={styles.verdictBox}>
        <Text style={styles.verdictLabel}>{VERDICT_LABEL[layers.verdict]}</Text>
        <Text style={styles.verdictDetail}>{layers.verdictDetail}</Text>
      </View>

      {layers.homeSignals.length + layers.awaySignals.length > 0 ? (
        <View style={styles.block}>
          <Text style={styles.blockTitle}>Strengths & weaknesses</Text>
          {[...layers.homeSignals, ...layers.awaySignals].map((s) => (
            <SignalLine key={s.id} s={s} />
          ))}
        </View>
      ) : (
        <Text style={styles.muted}>No hidden signals from recent form yet.</Text>
      )}

      {layers.problems.length > 0 ? (
        <View style={styles.block}>
          <Text style={styles.blockTitle}>Problem address</Text>
          {layers.problems.map((p) => (
            <ProblemLine key={`${p.code}-${p.naming}`} p={p} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: layout.borderWidth,
    borderTopColor: theme.border,
  },
  title: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: theme.textPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  sub: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: theme.textMuted,
    marginBottom: spacing.sm,
  },
  muted: { fontFamily: fonts.body, fontSize: 12, color: theme.textMuted },
  verdictBox: {
    backgroundColor: theme.surface,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  verdictLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: theme.accentBlue,
    marginBottom: 2,
  },
  verdictDetail: { fontFamily: fonts.body, fontSize: 12, color: theme.textMuted, lineHeight: 17 },
  block: { marginBottom: spacing.sm },
  blockTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    color: theme.textPrimary,
    marginBottom: 4,
  },
  signal: { fontFamily: fonts.body, fontSize: 11, marginBottom: 3, lineHeight: 15 },
  problemRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xs },
  problemCode: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    color: theme.accentOrange,
    width: 52,
  },
  problemBody: { flex: 1 },
  problemName: { fontFamily: fonts.bodySemiBold, fontSize: 11, color: theme.textPrimary },
  problemDetail: { fontFamily: fonts.body, fontSize: 10, color: theme.textMuted },
});
