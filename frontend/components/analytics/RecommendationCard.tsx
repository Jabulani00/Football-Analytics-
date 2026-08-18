import { StyleSheet, Text, View } from 'react-native';

import type { FixtureRecommendation, RiskLevel } from '@/utils/fixtureRecommendation';
import { fonts, layout, spacing, theme } from '@/styles/theme';

type Props = {
  rec: FixtureRecommendation;
  homePosition?: number | null;
  awayPosition?: number | null;
  isLive?: boolean;
};

const RISK_COLOR: Record<RiskLevel, string> = {
  low: theme.accentGreen,
  medium: theme.yellow,
  high: theme.loss,
};
const RISK_LABEL: Record<RiskLevel, string> = { low: 'Low', medium: 'Medium', high: 'High' };

const pct = (n: number) => `${Math.round(n * 100)}%`;
const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};
const edgeText = (edge: number | null) =>
  edge == null ? null : `${edge >= 0 ? '+' : ''}${Math.round(edge * 100)}% value`;

export default function RecommendationCard({ rec, homePosition, awayPosition, isLive }: Props) {
  const color = RISK_COLOR[rec.riskLevel];
  const best = rec.best;
  const alternatives = rec.candidates.filter((c) => c !== best).slice(0, 3);
  const hasTable = homePosition != null && awayPosition != null && homePosition > 0 && awayPosition > 0;

  return (
    <View style={[styles.wrap, { borderColor: color }]}>
      <View style={styles.head}>
        <Text style={styles.headLabel}>
          {isLive ? '⚡ LIVE BEST BET' : '⚡ BEST BET'}
        </Text>
        <View style={[styles.riskPill, { borderColor: color }]}>
          <Text style={[styles.riskPillText, { color }]}>
            {RISK_LABEL[rec.riskLevel]} risk · {rec.riskScore}
          </Text>
        </View>
      </View>

      {best ? (
        <View style={styles.bestRow}>
          <View style={styles.bestText}>
            <Text style={styles.bestMarket}>{best.market}</Text>
            <Text style={styles.bestSelection} numberOfLines={1}>
              {best.selection}
            </Text>
          </View>
          <View style={styles.bestProbWrap}>
            <Text style={[styles.bestProb, { color }]}>{pct(best.probability)}</Text>
            {edgeText(best.edge) ? (
              <Text style={[styles.edge, { color: (best.edge ?? 0) >= 0 ? theme.accentGreen : theme.textMuted }]}>
                {edgeText(best.edge)}
              </Text>
            ) : null}
          </View>
        </View>
      ) : (
        <Text style={styles.noBet}>No qualifying recommendation.</Text>
      )}

      {/* Risk meter */}
      <View style={styles.meterTrack}>
        <View style={[styles.meterFill, { width: `${rec.riskScore}%`, backgroundColor: color }]} />
      </View>

      {/* Risk factors */}
      {rec.factors.length > 0 ? (
        <View style={styles.factors}>
          {rec.factors.slice(0, 3).map((f) => (
            <View key={f.label} style={styles.factorRow}>
              <View style={[styles.factorDot, { backgroundColor: RISK_COLOR[f.severity] }]} />
              <Text style={styles.factorLabel}>{f.label}</Text>
              <Text style={styles.factorDetail} numberOfLines={1}>
                {f.detail}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.clean}>No material risk flags — a clean read.</Text>
      )}

      {/* Alternatives + context */}
      {alternatives.length > 0 ? (
        <View style={styles.alts}>
          <Text style={styles.altsLabel}>ALSO</Text>
          {alternatives.map((c) => (
            <Text key={`${c.market}-${c.selection}`} style={styles.altItem} numberOfLines={1}>
              {c.selection} <Text style={styles.altProb}>{pct(c.probability)}</Text>
            </Text>
          ))}
        </View>
      ) : null}

      {hasTable ? (
        <Text style={styles.context}>
          Table · home {ordinal(homePosition as number)} vs away {ordinal(awayPosition as number)}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderRadius: layout.borderRadius,
    padding: spacing.sm,
    backgroundColor: theme.surfaceMuted ?? theme.surface,
    gap: spacing.xs,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    letterSpacing: 0.8,
    color: theme.textMuted,
  },
  riskPill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 1 },
  riskPillText: { fontFamily: fonts.bodySemiBold, fontSize: 10, letterSpacing: 0.3 },
  bestRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  bestText: { flex: 1, minWidth: 0 },
  bestMarket: { fontFamily: fonts.body, fontSize: 10, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  bestSelection: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: theme.textPrimary },
  bestProbWrap: { alignItems: 'flex-end' },
  bestProb: { fontFamily: fonts.display, fontSize: 20 },
  edge: { fontFamily: fonts.bodyMedium, fontSize: 10 },
  noBet: { fontFamily: fonts.body, fontSize: 12, color: theme.textMuted },
  meterTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: theme.surface,
    overflow: 'hidden',
    marginTop: 2,
  },
  meterFill: { height: 5, borderRadius: 3 },
  factors: { gap: 2, marginTop: 2 },
  factorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  factorDot: { width: 6, height: 6, borderRadius: 3 },
  factorLabel: { fontFamily: fonts.bodySemiBold, fontSize: 11, color: theme.textPrimary },
  factorDetail: { flex: 1, fontFamily: fonts.body, fontSize: 11, color: theme.textMuted },
  clean: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted, marginTop: 2 },
  alts: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm, marginTop: 2 },
  altsLabel: { fontFamily: fonts.bodySemiBold, fontSize: 9, letterSpacing: 0.5, color: theme.textFaint },
  altItem: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted },
  altProb: { fontFamily: fonts.bodySemiBold, color: theme.textPrimary },
  context: { fontFamily: fonts.body, fontSize: 10, color: theme.textFaint, marginTop: 2 },
});
