import { StyleSheet, Text, View } from 'react-native';

import TeamMotivationCard from '@/components/standings/TeamMotivationCard';
import {
  evaluateTableStances,
  type StandingLike,
} from '@/utils/motivationEngine';
import { contestedLeagueTop } from '@/utils/separatorTools';
import { fonts, spacing, theme } from '@/styles/theme';

type StandingsStakesViewProps = {
  standings: StandingLike[];
  competitionId?: number | string | null;
  seasonProgress?: number | null;
};

/**
 * Full-table Chase / Escape / Motivation list for the standings browser.
 * Separate view — does not alter the existing league / tier tables.
 */
export default function StandingsStakesView({
  standings,
  competitionId,
  seasonProgress,
}: StandingsStakesViewProps) {
  if (standings.length === 0) {
    return <Text style={styles.muted}>No standings available.</Text>;
  }

  const rows = evaluateTableStances(standings, { competitionId, seasonProgress });
  const chase = rows.filter((r) => r.stance === 'chase').length;
  const escape = rows.filter((r) => r.stance === 'escape').length;
  const motivated = rows.filter((r) => r.grade !== 'none').length;
  const contested = contestedLeagueTop(standings);

  return (
    <View>
      <Text style={styles.blurb}>
        Who gains the most from three points? Tags show teams chasing a place up the
        table or fighting to stay clear of trouble.
      </Text>
      <Text style={styles.summary}>
        {chase} chasing · {escape} escaping · {motivated} with a clear need for points
      </Text>
      {contested.active ? (
        <Text style={styles.contested}>⚠ {contested.detail}</Text>
      ) : null}
      {rows.map((m) => (
        <TeamMotivationCard key={m.teamId} motivation={m} compact />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  blurb: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textMuted,
    marginBottom: spacing.sm,
    lineHeight: 17,
  },
  summary: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    color: theme.textPrimary,
    marginBottom: spacing.sm,
  },
  contested: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: theme.accentOrange,
    marginBottom: spacing.sm,
  },
  muted: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: theme.textMuted,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
});
