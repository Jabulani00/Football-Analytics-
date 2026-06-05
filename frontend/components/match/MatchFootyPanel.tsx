import { StyleSheet, Text, View } from 'react-native';

import SectionLabel from '@/components/shared/SectionLabel';
import type { Fixture } from '@/mock/fixturesData';
import { getFootyStats } from '@/mock/matchFeedData';
import { fonts, layout, spacing, theme } from '@/styles/theme';

type MatchFootyPanelProps = {
  fixture: Fixture;
};

function Last5({
  title,
  rows,
}: {
  title: string;
  rows: { opponent: string; score: string; venue: 'H' | 'A' }[];
}) {
  return (
    <View style={styles.last5Col}>
      <Text style={styles.last5Title}>{title}</Text>
      {rows.map((r, i) => (
        <View key={`${r.opponent}-${i}`} style={styles.last5Row}>
          <Text style={styles.venue}>{r.venue}</Text>
          <Text style={styles.opp}>{r.opponent}</Text>
          <Text style={styles.score}>{r.score}</Text>
        </View>
      ))}
    </View>
  );
}

export default function MatchFootyPanel({ fixture }: MatchFootyPanelProps) {
  const footy = getFootyStats(fixture);

  return (
    <View style={styles.wrap}>
      <Text style={styles.badge}>Footy Stats feed</Text>

      <View style={styles.xgRow}>
        <View style={styles.xgCard}>
          <Text style={styles.xgTeam}>{fixture.homeTeam.shortName}</Text>
          <Text style={styles.xgVal}>xG {footy.xg[0]}</Text>
          <Text style={styles.xgaVal}>xGA {footy.xga[0]}</Text>
        </View>
        <View style={styles.xgCard}>
          <Text style={styles.xgTeam}>{fixture.awayTeam.shortName}</Text>
          <Text style={styles.xgVal}>xG {footy.xg[1]}</Text>
          <Text style={styles.xgaVal}>xGA {footy.xga[1]}</Text>
        </View>
      </View>

      <SectionLabel>LAST 5 — HOME vs AWAY FORM</SectionLabel>
      <View style={styles.last5Grid}>
        <Last5 title={`${fixture.homeTeam.shortName} (home/away mix)`} rows={footy.last5Home} />
        <Last5 title={`${fixture.awayTeam.shortName} (home/away mix)`} rows={footy.last5Away} />
      </View>

      <SectionLabel style={styles.section}>REFEREE</SectionLabel>
      <View style={styles.refCard}>
        <Text style={styles.refName}>{footy.referee.name}</Text>
        <Text style={styles.refStat}>
          Yellows avg {footy.referee.yellowAvg.toFixed(1)} · Reds {footy.referee.redAvg.toFixed(2)} · Fouls{' '}
          {footy.referee.foulsAvg}
        </Text>
      </View>

      <SectionLabel style={styles.section}>CARDS (PER GAME AVG)</SectionLabel>
      <View style={styles.statRow}>
        <Text style={styles.statLine}>
          {fixture.homeTeam.shortName}: 🟨 {footy.cards.homeYellow} 🟥 {footy.cards.homeRed}
        </Text>
        <Text style={styles.statLine}>
          {fixture.awayTeam.shortName}: 🟨 {footy.cards.awayYellow} 🟥 {footy.cards.awayRed}
        </Text>
      </View>

      <SectionLabel style={styles.section}>CORNERS (FOR / AGAINST AVG)</SectionLabel>
      <View style={styles.statRow}>
        <Text style={styles.statLine}>
          {fixture.homeTeam.shortName}: {footy.corners.homeFor} for · {footy.corners.homeAgainst} against
        </Text>
        <Text style={styles.statLine}>
          {fixture.awayTeam.shortName}: {footy.corners.awayFor} for · {footy.corners.awayAgainst} against
        </Text>
      </View>

      <Text style={styles.more}>Show more — full fixture history expands in production API.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  badge: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    color: theme.accentBlue,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: spacing.md,
  },
  xgRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.xl,
    width: '100%',
  },
  xgCard: {
    flex: 1,
    backgroundColor: theme.surface,
    borderRadius: layout.borderRadius,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    padding: spacing.lg,
    alignItems: 'center',
  },
  xgTeam: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: theme.textMuted,
    marginBottom: spacing.sm,
  },
  xgVal: {
    fontFamily: fonts.display,
    fontSize: 28,
    color: theme.accentGreen,
  },
  xgaVal: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: theme.textMuted,
    marginTop: spacing.xs,
  },
  last5Grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  last5Col: {
    flex: 1,
    minWidth: 260,
    backgroundColor: theme.surface,
    borderRadius: layout.borderRadius,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    padding: spacing.md,
  },
  last5Title: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: theme.accentGreen,
    marginBottom: spacing.sm,
  },
  last5Row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  venue: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    color: theme.textMuted,
    width: 16,
  },
  opp: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: theme.textPrimary },
  score: { fontFamily: fonts.display, fontSize: 14, color: theme.textPrimary },
  section: { marginTop: spacing.md },
  refCard: {
    backgroundColor: theme.surfaceMuted,
    padding: spacing.md,
    borderRadius: layout.borderRadius,
    marginTop: spacing.sm,
  },
  refName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
    color: theme.textPrimary,
  },
  refStat: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textMuted,
    marginTop: spacing.xs,
  },
  statRow: {
    backgroundColor: theme.surface,
    padding: spacing.md,
    borderRadius: layout.borderRadius,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  statLine: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: theme.textPrimary,
  },
  more: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.accentBlue,
    marginTop: spacing.xl,
    fontStyle: 'italic',
  },
});
