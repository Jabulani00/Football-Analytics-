import { StyleSheet, Text, View } from 'react-native';

import ComplianceBadge from '@/components/analytics/ComplianceBadge';
import SectionLabel from '@/components/shared/SectionLabel';
import { ODDS_FUSION_ROWS } from '@/mock/analyticsData';
import type { Fixture } from '@/mock/fixturesData';
import { complianceFromPercent } from '@/utils/compliance';
import { fonts, layout, spacing, theme } from '@/styles/theme';

type FixtureFusionSectionProps = {
  fixture: Fixture;
};

function fixtureLabel(f: Fixture): string {
  return `${f.homeTeam.name} vs ${f.awayTeam.name}`;
}

export default function FixtureFusionSection({ fixture }: FixtureFusionSectionProps) {
  const label = fixtureLabel(fixture);
  const homeToken = fixture.homeTeam.name.split(' ')[0]?.toLowerCase() ?? '';
  const rows = ODDS_FUSION_ROWS.filter(
    (r) => r.fixture === label || (homeToken && r.fixture.toLowerCase().includes(homeToken)),
  );
  const display = rows.length > 0 ? rows : ODDS_FUSION_ROWS.slice(0, 2);

  return (
    <View style={styles.wrap}>
      <SectionLabel>ODDS FUSION — THIS FIXTURE</SectionLabel>
      <Text style={styles.intro}>
        Hollywoodbets + Odds Alert aligned with stat compliance for {label}
      </Text>
      {display.map((row) => (
        <View key={row.id} style={styles.row}>
          <Text style={styles.signal}>{row.statSignal}</Text>
          <View style={styles.meta}>
            <Text style={styles.market}>
              {row.bookmaker} · {row.market} @ {row.odds.toFixed(2)}
            </Text>
            <ComplianceBadge level={complianceFromPercent(row.statCompliance)} value={row.statCompliance} compact />
            <Text style={[styles.edge, row.edge >= 0 ? styles.edgePos : styles.edgeNeg]}>
              Edge {row.edge >= 0 ? '+' : ''}
              {row.edge.toFixed(1)}%
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    backgroundColor: theme.surface,
    borderRadius: layout.borderRadius,
    borderWidth: layout.borderWidth,
    borderColor: theme.accentBlue,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  intro: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textMuted,
    marginBottom: spacing.md,
    marginTop: spacing.xs,
  },
  row: {
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  signal: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: theme.textPrimary,
  },
  meta: { marginTop: spacing.sm, gap: spacing.xs },
  market: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textMuted,
  },
  edge: { fontFamily: fonts.bodySemiBold, fontSize: 12 },
  edgePos: { color: theme.accentGreen },
  edgeNeg: { color: theme.loss },
});
