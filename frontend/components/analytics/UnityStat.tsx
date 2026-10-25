import { StyleSheet, Text, View } from 'react-native';

import { fonts, layout, spacing, theme } from '@/styles/theme';

/** Unity as a whole-percent string (0–1 → "x%"). */
export function unityPct(v: number | null): string {
  return v == null ? '—' : `${Math.round(v * 100)}%`;
}

/**
 * A compact Unity readout embedded inside a panel: the share of a league's teams
 * that are DA on one stat, with the DA / total count and a progress bar. Used by
 * the Dominance, Opposite and both Grading panels so Unity reads the same
 * everywhere. `denom` names what the total counts (teams, graded teams, …).
 */
export default function UnityStat({
  label,
  unity,
  da,
  total,
  denom = 'teams',
}: {
  label: string;
  unity: number | null;
  da: number;
  total: number;
  denom?: string;
}) {
  const width = Math.max(0, Math.min(100, Math.round((unity ?? 0) * 100)));
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.label} numberOfLines={1}>Unity · {label}</Text>
        <Text style={styles.value}>{unityPct(unity)}</Text>
      </View>
      <View style={styles.bar}>
        <View style={[styles.fill, { width: `${width}%` }]} />
      </View>
      <Text style={styles.sub}>
        {total === 0 ? 'no data yet' : `${da} of ${total} ${denom} are DA`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexGrow: 1,
    flexBasis: 220,
    minWidth: 180,
    borderWidth: layout.borderWidth,
    borderColor: theme.accentGreen,
    borderRadius: layout.borderRadius,
    backgroundColor: 'rgba(5,150,105,0.06)',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: 6,
  },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.sm },
  label: {
    flex: 1,
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    color: theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  value: { fontFamily: fonts.display, fontSize: 22, color: theme.accentGreen },
  bar: { height: 8, borderRadius: 999, backgroundColor: theme.surfaceMuted, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: theme.accentGreen },
  sub: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted },
});
