import { StyleSheet, Text, View } from 'react-native';

import SectionLabel from '@/components/shared/SectionLabel';
import { useSimilarMatches } from '@/hooks/useSimilarMatches';
import { fonts, layout, spacing, theme } from '@/styles/theme';

type SimilarMatchesProps = {
  fixtureId: string;
};

export default function SimilarMatches({ fixtureId }: SimilarMatchesProps) {
  const evidence = useSimilarMatches(fixtureId);

  if (!evidence) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Similar match evidence not loaded. Run npm run export-data.</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <SectionLabel>EVIDENCE — SIMILAR MATCHES</SectionLabel>
      <Text style={styles.sub}>{evidence.fixture}</Text>

      <View style={styles.rates}>
        <RateChip label="BTTS hit rate" value={evidence.btts_hit_rate} />
        <RateChip label="Over 2.5 hit rate" value={evidence.over25_hit_rate} />
      </View>

      <View style={styles.table}>
        <View style={styles.headerRow}>
          <Text style={[styles.h, styles.wide]}>Match</Text>
          <Text style={styles.h}>Score</Text>
          <Text style={styles.h}>BTTS</Text>
          <Text style={styles.h}>O2.5</Text>
          <Text style={styles.h}>Sim</Text>
        </View>
        {evidence.similar_matches.map((m) => (
          <View key={`${m.home}-${m.away}-${m.score}`} style={styles.row}>
            <Text style={[styles.cell, styles.wide, styles.match]}>
              {m.home} v {m.away}
            </Text>
            <Text style={styles.cell}>{m.score}</Text>
            <Text style={[styles.cell, m.btts ? styles.yes : styles.no]}>{m.btts ? 'Y' : 'N'}</Text>
            <Text style={[styles.cell, m.over25 ? styles.yes : styles.no]}>{m.over25 ? 'Y' : 'N'}</Text>
            <Text style={styles.cell}>{Math.round(m.similarity_score * 100)}%</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function RateChip({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipLabel}>{label}</Text>
      <Text style={styles.chipValue}>{Math.round(value * 100)}%</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  sub: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textMuted,
    marginBottom: spacing.sm,
  },
  rates: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
    flexWrap: 'wrap',
  },
  chip: {
    backgroundColor: theme.surfaceMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: layout.borderRadius,
  },
  chipLabel: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: theme.textMuted,
  },
  chipValue: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 16,
    color: theme.textPrimary,
  },
  table: {
    backgroundColor: theme.surface,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    overflow: 'hidden',
    width: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    backgroundColor: theme.surfaceMuted,
    padding: spacing.sm,
  },
  h: {
    flex: 1,
    fontFamily: fonts.bodySemiBold,
    fontSize: 9,
    color: theme.textMuted,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  wide: { flex: 2.5, textAlign: 'left' },
  row: {
    flexDirection: 'row',
    padding: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.border,
    alignItems: 'center',
  },
  cell: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 11,
    color: theme.textMuted,
    textAlign: 'center',
  },
  match: {
    color: theme.textPrimary,
    fontFamily: fonts.bodyMedium,
    textAlign: 'left',
  },
  yes: { color: theme.accentGreen },
  no: { color: theme.textFaint },
  empty: {
    padding: spacing.lg,
    backgroundColor: theme.surfaceMuted,
    borderRadius: layout.borderRadius,
  },
  emptyText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: theme.textMuted,
    textAlign: 'center',
  },
});
