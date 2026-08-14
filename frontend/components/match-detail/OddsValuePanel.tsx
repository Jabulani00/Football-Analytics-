import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { OddsByMarket, Probability } from '@/services/oddAlerts';
import { fonts, layout, spacing, theme } from '@/styles/theme';

type OddsValuePanelProps = {
  odds: OddsByMarket | undefined;
  probability: Probability | undefined;
};

/** Book odds (decimal) → model probability, so value can be read at a glance. */
type MarketDef = { label: string; market: string; selection: string; probKey: string };

const MARKETS: MarketDef[] = [
  { label: 'Home win', market: 'ft_result', selection: 'home', probKey: 'home_win' },
  { label: 'Draw', market: 'ft_result', selection: 'draw', probKey: 'draw' },
  { label: 'Away win', market: 'ft_result', selection: 'away', probKey: 'away_win' },
  { label: 'Over 1.5', market: 'total_goals', selection: 'over_15', probKey: 'o15' },
  { label: 'Over 2.5', market: 'total_goals', selection: 'over_25', probKey: 'o25' },
  { label: 'Over 3.5', market: 'total_goals', selection: 'over_35', probKey: 'o35' },
  { label: 'Under 2.5', market: 'total_goals', selection: 'under_25', probKey: 'u25' },
  { label: 'BTTS Yes', market: 'btts', selection: 'yes', probKey: 'btts' },
  { label: 'BTTS No', market: 'btts', selection: 'no', probKey: 'btts_no' },
];

/** Edge at or above this (model% − implied%) is flagged as value. */
const VALUE_EDGE = 4;

type Row = { label: string; odds: number; implied: number; model: number; edge: number };

function edgeColor(edge: number): string {
  if (edge >= VALUE_EDGE) return theme.accentGreen;
  if (edge <= -VALUE_EDGE) return theme.loss;
  return theme.textMuted;
}

export default function OddsValuePanel({ odds, probability }: OddsValuePanelProps) {
  const rows = useMemo<Row[]>(() => {
    if (!odds || !probability) return [];
    const out: Row[] = [];
    for (const m of MARKETS) {
      const price = odds[m.market]?.[m.selection];
      const model = probability[m.probKey];
      if (price == null || price <= 1 || model == null || Number.isNaN(model)) continue;
      const implied = 100 / price;
      out.push({ label: m.label, odds: price, implied, model, edge: model - implied });
    }
    return out.sort((a, b) => b.edge - a.edge);
  }, [odds, probability]);

  if (rows.length === 0) return null;

  const best = rows[0];

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>ODDS vs MODEL</Text>
        <Text style={styles.subtitle}>book implied % vs our model — green = value</Text>
      </View>

      {best.edge >= VALUE_EDGE ? (
        <Text style={styles.best}>
          Best value: <Text style={styles.bestStrong}>{best.label}</Text> @ {best.odds.toFixed(2)} ·{' '}
          <Text style={{ color: theme.accentGreen }}>+{best.edge.toFixed(0)}%</Text> edge
        </Text>
      ) : (
        <Text style={styles.best}>No standout value — book and model broadly agree.</Text>
      )}

      <View style={styles.tableHead}>
        <Text style={[styles.cMarket, styles.th]}>Market</Text>
        <Text style={[styles.cNum, styles.th]}>Odds</Text>
        <Text style={[styles.cNum, styles.th]}>Book</Text>
        <Text style={[styles.cNum, styles.th]}>Model</Text>
        <Text style={[styles.cNum, styles.th]}>Edge</Text>
      </View>

      {rows.map((r) => (
        <View key={r.label} style={styles.row}>
          <Text style={[styles.cMarket, styles.td]} numberOfLines={1}>
            {r.label}
          </Text>
          <Text style={[styles.cNum, styles.tdStrong]}>{r.odds.toFixed(2)}</Text>
          <Text style={[styles.cNum, styles.tdMuted]}>{Math.round(r.implied)}%</Text>
          <Text style={[styles.cNum, styles.td]}>{Math.round(r.model)}%</Text>
          <Text style={[styles.cNum, styles.tdStrong, { color: edgeColor(r.edge) }]}>
            {r.edge > 0 ? '+' : ''}
            {r.edge.toFixed(0)}%
          </Text>
        </View>
      ))}

      <Text style={styles.foot}>
        Implied % = 100 ÷ odds. Edge = model − implied. Odds are indicative; always confirm at your book.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.surface,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  head: { marginBottom: spacing.xs },
  title: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    letterSpacing: 0.5,
    color: theme.textPrimary,
    textTransform: 'uppercase',
  },
  subtitle: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted },
  best: { fontFamily: fonts.bodyMedium, fontSize: 12, color: theme.textPrimary, marginBottom: spacing.sm },
  bestStrong: { fontFamily: fonts.bodySemiBold },
  tableHead: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: spacing.xs,
    borderBottomWidth: layout.borderWidth,
    borderBottomColor: theme.border,
  },
  th: { fontFamily: fonts.bodySemiBold, fontSize: 10, color: theme.textMuted, textTransform: 'uppercase' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    borderBottomWidth: layout.borderWidth,
    borderBottomColor: theme.border,
  },
  cMarket: { flex: 1, minWidth: 90 },
  cNum: { width: 56, textAlign: 'right' },
  td: { fontFamily: fonts.body, fontSize: 12, color: theme.textPrimary },
  tdStrong: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: theme.textPrimary },
  tdMuted: { fontFamily: fonts.body, fontSize: 12, color: theme.textMuted },
  foot: { fontFamily: fonts.body, fontSize: 10, color: theme.textFaint, marginTop: spacing.sm, lineHeight: 14 },
});
