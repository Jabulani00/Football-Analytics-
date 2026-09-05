import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import {
  buildBhozomaTable,
  type BhozomaSideStats,
  type BhozomaTeamRow,
} from '@/utils/bhozomaEngine';
import type { SeasonMatch } from '@/utils/bhozomaEngine';
import type { StandingLike } from '@/utils/motivationEngine';
import { fonts, layout, spacing, theme } from '@/styles/theme';

type Props = {
  standings: StandingLike[];
  matches: SeasonMatch[];
  loading: boolean;
  error: string | null;
  competitionId?: number | string | null;
};

function SideBlock({ title, side }: { title: string; side: BhozomaSideStats }) {
  const dust = side.dataDust;
  return (
    <View style={[styles.side, dust && styles.sideDust]}>
      <Text style={styles.sideTitle}>{title}</Text>
      <Text style={styles.sideMeta}>
        MP {side.mp} · pts {side.pointsAttained}/{side.pointsPossible} · lost {side.pointsLost}
        {side.pctAttained != null ? ` · ${side.pctAttained.toFixed(0)}%` : ''}
      </Text>
      <Text style={[styles.sideLabel, dust ? styles.dust : styles.labelOk]}>
        {side.label ?? '—'}
      </Text>
    </View>
  );
}

function TeamCard({ row }: { row: BhozomaTeamRow }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.rank}>#{row.rank}</Text>
        <View style={styles.cardText}>
          <Text style={styles.name} numberOfLines={1}>
            {row.name}
          </Text>
          <Text style={styles.meta}>
            {row.points} pts · {row.zone}
            {row.isMidTable ? ' · yellow focus' : ''}
          </Text>
        </View>
      </View>
      <SideBlock title="vs Above" side={row.above} />
      <SideBlock title="vs Below" side={row.below} />
    </View>
  );
}

/**
 * Section 8 — mid-table Bhozoma panel. Additive standings tab.
 */
export default function BhozomaView({
  standings,
  matches,
  loading,
  error,
  competitionId,
}: Props) {
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.accentGreen} />
        <Text style={styles.muted}>Building Bhozoma from season results…</Text>
      </View>
    );
  }
  if (error) return <Text style={styles.muted}>{error}</Text>;
  if (standings.length === 0) return <Text style={styles.muted}>No standings.</Text>;

  const table = buildBhozomaTable(standings, matches, competitionId);
  const focus = table.midRows.length > 0 ? table.midRows : table.rows;

  return (
    <View>
      <Text style={styles.blurb}>
        Mid-table power vs sides currently above / below. Needs MP ≥ 3 (else DATA
        DUST). Under 30% pts from above → Goliath hero; over 30% → Bhozoma classic.
      </Text>
      {table.midBand ? (
        <Text style={styles.summary}>
          Yellow band pos {table.midBand.from}–{table.midBand.to} · showing{' '}
          {focus.length} team{focus.length === 1 ? '' : 's'}
          {table.midRows.length === 0 ? ' (full table — no mid band hit)' : ''}
        </Text>
      ) : (
        <Text style={styles.summary}>Showing {focus.length} teams</Text>
      )}
      {matches.length === 0 ? (
        <Text style={styles.muted}>No finished season fixtures loaded yet.</Text>
      ) : null}
      {focus.map((r) => (
        <TeamCard key={r.teamId} row={r} />
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
  center: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
  muted: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: theme.textMuted,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  card: {
    backgroundColor: theme.surface,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  rank: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: theme.textFaint, width: 28 },
  cardText: { flex: 1, minWidth: 0 },
  name: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.textPrimary },
  meta: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted },
  side: {
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: layout.borderWidth,
    borderTopColor: theme.border,
  },
  sideDust: { opacity: 0.75 },
  sideTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    color: theme.textFaint,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sideMeta: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted, marginTop: 2 },
  sideLabel: { fontFamily: fonts.bodySemiBold, fontSize: 12, marginTop: 2 },
  dust: { color: theme.accentOrange },
  labelOk: { color: theme.accentBlue },
});
