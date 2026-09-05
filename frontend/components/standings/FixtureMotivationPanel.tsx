import { StyleSheet, Text, View } from 'react-native';

import TeamMotivationCard from '@/components/standings/TeamMotivationCard';
import {
  evaluateFixtureMotivation,
  type StandingLike,
} from '@/utils/motivationEngine';
import { fonts, layout, spacing, theme } from '@/styles/theme';

type FixtureMotivationPanelProps = {
  standings: StandingLike[];
  homeId: number | null | undefined;
  awayId: number | null | undefined;
  homeName: string;
  awayName: string;
  competitionId?: number | string | null;
  seasonProgress?: number | null;
};

/**
 * Additive match-summary block: Chase / Escape + Importance of 3 points
 * for both sides. Renders nothing useful when standings are missing.
 */
export default function FixtureMotivationPanel({
  standings,
  homeId,
  awayId,
  homeName,
  awayName,
  competitionId,
  seasonProgress,
}: FixtureMotivationPanelProps) {
  if (standings.length === 0 || (homeId == null && awayId == null)) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Who needs the win?</Text>
        <Text style={styles.muted}>
          Open once the league table is available — it shows which side gains more from three points.
        </Text>
      </View>
    );
  }

  const { home, away } = evaluateFixtureMotivation(standings, homeId, awayId, {
    competitionId,
    seasonProgress,
  });

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Who needs the win?</Text>
      <Text style={styles.sub}>
        How much this result matters for {homeName} and {awayName} in the table
      </Text>
      {home ? <TeamMotivationCard motivation={home} /> : null}
      {away ? <TeamMotivationCard motivation={away} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  card: {
    backgroundColor: theme.surface,
    borderRadius: layout.borderRadius,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    padding: spacing.md,
    marginBottom: spacing.md,
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
  muted: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textMuted,
  },
});
