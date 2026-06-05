import { StyleSheet, Text, View } from 'react-native';

import SectionLabel from '@/components/shared/SectionLabel';
import type { Fixture } from '@/mock/fixturesData';
import { getLineups } from '@/mock/matchFeedData';
import { fonts, layout, spacing, theme } from '@/styles/theme';

type MatchLineupsPanelProps = {
  fixture: Fixture;
};

function XI({ name, players }: { name: string; players: { name: string; number: number; position: string }[] }) {
  return (
    <View style={styles.col}>
      <Text style={styles.team}>{name}</Text>
      {players.map((p) => (
        <View key={p.number} style={styles.row}>
          <Text style={styles.num}>{p.number}</Text>
          <Text style={styles.pos}>{p.position}</Text>
          <Text style={styles.player}>{p.name}</Text>
        </View>
      ))}
    </View>
  );
}

export default function MatchLineupsPanel({ fixture }: MatchLineupsPanelProps) {
  const lineups = getLineups(fixture);

  return (
    <View style={styles.wrap}>
      <Text style={styles.status}>
        {lineups.confirmed ? 'Confirmed starting XI' : 'Predicted lineups — not yet confirmed'}
      </Text>
      <View style={styles.grid}>
        <XI name={fixture.homeTeam.name} players={lineups.home} />
        <XI name={fixture.awayTeam.name} players={lineups.away} />
      </View>
      <SectionLabel style={styles.bench}>BENCH (PLACEHOLDER)</SectionLabel>
      <Text style={styles.benchNote}>Full bench list available when lineups are confirmed.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  status: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: theme.accentBlue,
    marginBottom: spacing.lg,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    width: '100%',
  },
  col: {
    flex: 1,
    minWidth: 280,
    backgroundColor: theme.surface,
    borderRadius: layout.borderRadius,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    padding: spacing.lg,
  },
  team: {
    fontFamily: fonts.display,
    fontSize: 16,
    color: theme.textPrimary,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  num: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: theme.textMuted,
    width: 24,
  },
  pos: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: theme.accentGreen,
    width: 28,
  },
  player: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: theme.textPrimary,
    flex: 1,
  },
  bench: { marginTop: spacing.xl },
  benchNote: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textMuted,
    fontStyle: 'italic',
  },
});
