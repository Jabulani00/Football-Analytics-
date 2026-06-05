import { StyleSheet, Text, View } from 'react-native';

import SectionLabel from '@/components/shared/SectionLabel';
import type { Fixture } from '@/mock/fixturesData';
import { getDrawAnalysis } from '@/mock/matchFeedData';
import { fonts, layout, spacing, theme } from '@/styles/theme';

type MatchDrawPanelProps = {
  fixture: Fixture;
};

export default function MatchDrawPanel({ fixture }: MatchDrawPanelProps) {
  const draw = getDrawAnalysis(fixture);

  return (
    <View style={styles.wrap}>
      <View style={styles.hero}>
        <Text style={styles.likelihood}>{draw.likelihood}%</Text>
        <Text style={styles.heroLabel}>Draw likelihood</Text>
      </View>
      <Text style={styles.relevance}>{draw.relevance}</Text>

      <View style={styles.grid}>
        <StatTile label={`${fixture.homeTeam.shortName} draw %`} value={`${draw.homeDrawPct}%`} />
        <StatTile label={`${fixture.awayTeam.shortName} draw %`} value={`${draw.awayDrawPct}%`} />
        <StatTile label="H2H draws (last 5)" value={String(draw.h2hDraws)} />
      </View>

      <SectionLabel style={styles.section}>WHEN TO CONSIDER THE DRAW</SectionLabel>
      <Text style={styles.note}>
        Draw analysis links to relegation battles, European spots, and derby intensity flagged in match
        importance. Cross-check with Our Stats compliance before fusion.
      </Text>
    </View>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileLabel}>{label}</Text>
      <Text style={styles.tileValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  hero: {
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderRadius: layout.borderRadius,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    padding: spacing.xl,
    marginBottom: spacing.md,
  },
  likelihood: {
    fontFamily: fonts.display,
    fontSize: 48,
    color: theme.accentOrange,
  },
  heroLabel: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: theme.textMuted,
    marginTop: spacing.xs,
  },
  relevance: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: theme.textPrimary,
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  tile: {
    flex: 1,
    minWidth: 140,
    backgroundColor: theme.surfaceMuted,
    borderRadius: layout.borderRadius,
    padding: spacing.md,
  },
  tileLabel: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: theme.textMuted,
  },
  tileValue: {
    fontFamily: fonts.display,
    fontSize: 22,
    color: theme.textPrimary,
    marginTop: spacing.xs,
  },
  section: { marginTop: spacing.md },
  note: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: theme.textMuted,
    lineHeight: 20,
    marginTop: spacing.sm,
  },
});
