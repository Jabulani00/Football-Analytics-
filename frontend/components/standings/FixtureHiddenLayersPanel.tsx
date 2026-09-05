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
  const sideLabel = s.side === 'home' ? 'Home' : s.side === 'away' ? 'Away' : s.side;
  return (
    <Text style={[styles.signal, { color }]}>
      {sideLabel}: {s.naming} — {s.detail}
    </Text>
  );
}

function ProblemLine({ p }: { p: ProblemRow }) {
  const tone = p.polarity === 'strength' ? 'strength' : 'weakness';
  return (
    <View style={styles.problemRow}>
      <View style={styles.problemBody}>
        <Text style={styles.problemName}>{p.naming}</Text>
        <Text style={styles.problemDetail}>
          {tone} · {p.valueLabel}
          {p.canCallOut ? ' · clear enough to act on' : ' · early signal only'}
        </Text>
      </View>
    </View>
  );
}

/** Presentational hidden form block (fed by useFixtureFormAnalysis). */
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
      <Text style={styles.title}>Hidden strengths & weaknesses</Text>
      <Text style={styles.sub}>
        Patterns in recent results for {homeName} vs {awayName}
        {layers.pointsDiff != null ? ` · ${layers.pointsDiff} pts apart` : ''}
      </Text>

      <View style={styles.verdictBox}>
        <Text style={styles.verdictLabel}>{VERDICT_LABEL[layers.verdict]}</Text>
        <Text style={styles.verdictDetail}>{layers.verdictDetail}</Text>
      </View>

      {layers.homeSignals.length + layers.awaySignals.length > 0 ? (
        <View style={styles.block}>
          <Text style={styles.blockTitle}>What stands out</Text>
          {[...layers.homeSignals, ...layers.awaySignals].map((s) => (
            <SignalLine key={s.id} s={s} />
          ))}
        </View>
      ) : (
        <Text style={styles.muted}>Not enough recent form to spot a clear pattern yet.</Text>
      )}

      {layers.problems.length > 0 ? (
        <View style={styles.block}>
          <Text style={styles.blockTitle}>Watch-outs</Text>
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
  problemRow: { marginBottom: spacing.xs },
  problemBody: { flex: 1 },
  problemName: { fontFamily: fonts.bodySemiBold, fontSize: 11, color: theme.textPrimary },
  problemDetail: { fontFamily: fonts.body, fontSize: 10, color: theme.textMuted },
});
