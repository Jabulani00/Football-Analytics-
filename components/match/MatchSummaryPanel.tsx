import { StyleSheet, Text, View } from 'react-native';

import SectionLabel from '@/components/shared/SectionLabel';
import type { Fixture } from '@/mock/fixturesData';
import { getMatchImportance, getMissingPlayers } from '@/mock/matchFeedData';
import { fonts, layout, spacing, theme } from '@/styles/theme';

type MatchSummaryPanelProps = {
  fixture: Fixture;
};

function PlayerList({
  title,
  players,
}: {
  title: string;
  players: { name: string; reason: string; status: 'out' | 'doubt' }[];
}) {
  return (
    <View style={styles.block}>
      <Text style={styles.teamTitle}>{title}</Text>
      {players.map((p) => (
        <View key={`${p.name}-${p.reason}`} style={styles.playerRow}>
          <Text style={styles.playerName}>{p.name}</Text>
          {p.name !== '—' ? (
            <Text style={[styles.status, p.status === 'out' ? styles.out : styles.doubt]}>
              {p.status === 'out' ? 'OUT' : 'DOUBT'}
            </Text>
          ) : null}
          <Text style={styles.reason}>{p.reason}</Text>
        </View>
      ))}
    </View>
  );
}

export default function MatchSummaryPanel({ fixture }: MatchSummaryPanelProps) {
  const missing = getMissingPlayers(fixture);
  const importance = getMatchImportance(fixture.id);

  return (
    <View style={styles.wrap}>
      <View style={styles.importanceCard}>
        <SectionLabel>MATCH IMPORTANCE</SectionLabel>
        <Text style={styles.importanceText}>{importance}</Text>
      </View>

      <SectionLabel style={styles.section}>MISSING & INJURED PLAYERS</SectionLabel>
      <PlayerList title={fixture.homeTeam.name} players={missing.home} />
      <PlayerList title={fixture.awayTeam.name} players={missing.away} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', gap: spacing.md },
  importanceCard: {
    backgroundColor: theme.surface,
    borderRadius: layout.borderRadius,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    padding: spacing.lg,
    width: '100%',
  },
  importanceText: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: theme.textPrimary,
    lineHeight: 22,
    marginTop: spacing.sm,
  },
  section: { marginTop: spacing.md },
  block: {
    backgroundColor: theme.surface,
    borderRadius: layout.borderRadius,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    width: '100%',
  },
  teamTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: theme.accentGreen,
    marginBottom: spacing.md,
  },
  playerRow: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  playerName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: theme.textPrimary,
  },
  status: {
    fontFamily: fonts.bodyMedium,
    fontSize: 10,
    letterSpacing: 1,
    marginTop: 2,
  },
  out: { color: theme.loss },
  doubt: { color: theme.accentOrange },
  reason: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textMuted,
    marginTop: 2,
  },
});
