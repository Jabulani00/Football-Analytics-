import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import TeamLogo from '@/components/shared/TeamLogo';
import SubTabBar from '@/components/shared/SubTabBar';
import {
  rankTierRows,
  type TargetZone,
  type TierRecord,
  type TierTeamRow,
  type TierZone,
  type TieredTables,
} from '@/utils/tieredTables';
import { fonts, layout, spacing, theme } from '@/styles/theme';

type Props = {
  tiered: TieredTables | null;
  loading: boolean;
  onTeamPress?: (row: TierTeamRow) => void;
};

const ZONE_COLOR: Record<TierZone, string> = {
  top: '#16A34A',
  mid: '#D97706',
  bottom: '#DC2626',
};

const SECTIONS: { zone: TierZone; emoji: string; title: string }[] = [
  { zone: 'top', emoji: '🟢', title: 'Green table' },
  { zone: 'mid', emoji: '🟡', title: 'Yellow table' },
  { zone: 'bottom', emoji: '🔴', title: 'Red table' },
];

const TARGET_TABS: { id: TargetZone; label: string }[] = [
  { id: 'top', label: '🟢 vs Green' },
  { id: 'mid', label: '🟡 vs Yellow' },
  { id: 'bottom', label: '🔴 vs Red' },
  { id: 'all', label: 'Overall' },
];

const ZONE_TITLE: Record<TierZone, string> = {
  top: 'Top tier',
  mid: 'Mid tier',
  bottom: 'Bottom tier',
};
const TARGET_TABLE: Record<TierZone, string> = {
  top: 'Green table',
  mid: 'Yellow table',
  bottom: 'Red table',
};

function ruleFor(zone: TierZone, target: TargetZone): string {
  if (target === 'all') return `${ZONE_TITLE[zone]} · ranked by overall league results`;
  if (zone === target) return `${ZONE_TITLE[zone]} · head-to-head among themselves`;
  return `${ZONE_TITLE[zone]} · ranked by results vs the ${TARGET_TABLE[target]}`;
}

export default function TieredStandingsView({ tiered, loading, onTeamPress }: Props) {
  const { width } = useWindowDimensions();
  const wide = width >= 760;
  const [target, setTarget] = useState<TargetZone>('top');

  if (!tiered) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>
          {loading ? 'Building tier tables from season results…' : 'Tier tables unavailable.'}
        </Text>
      </View>
    );
  }

  const rowsByZone: Record<TierZone, TierTeamRow[]> = {
    top: tiered.green,
    mid: tiered.yellow,
    bottom: tiered.red,
  };

  // Green is pre-sorted with its head-to-head tiebreak when measured vs Green;
  // every other combination re-ranks by the chosen target.
  const rankedFor = (zone: TierZone): TierTeamRow[] =>
    zone === 'top' && target === 'top' ? rowsByZone[zone] : rankTierRows(rowsByZone[zone], target);

  return (
    <View>
      <Text style={styles.filterLabel}>MEASURED VS</Text>
      <SubTabBar tabs={TARGET_TABS} active={target} onChange={setTarget} />

      {SECTIONS.map((s) => (
        <TierSection
          key={s.zone}
          color={ZONE_COLOR[s.zone]}
          emoji={s.emoji}
          title={s.title}
          rule={ruleFor(s.zone, target)}
          rows={rankedFor(s.zone)}
          target={target}
          wide={wide}
          onTeamPress={onTeamPress}
        />
      ))}
      <Text style={styles.footnote}>
        Tiers come from the current league table (this competition &amp; season only) and are
        re-evaluated live, so each result counts by the opponent&apos;s tier today — not the tier it
        held when the match was played.
      </Text>
    </View>
  );
}

function TierSection({
  color,
  emoji,
  title,
  rule,
  rows,
  target,
  wide,
  onTeamPress,
}: {
  color: string;
  emoji: string;
  title: string;
  rule: string;
  rows: TierTeamRow[];
  target: TargetZone;
  wide: boolean;
  onTeamPress?: (row: TierTeamRow) => void;
}) {
  const hasResults = rows.some((r) => r.byZone[target].played > 0);

  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <View style={[styles.sectionBar, { backgroundColor: color }]} />
        <View style={styles.sectionTitleWrap}>
          <Text style={styles.sectionTitle}>
            {emoji} {title}
          </Text>
          <Text style={styles.sectionRule}>{rule}</Text>
        </View>
      </View>

      {rows.length === 0 ? (
        <Text style={styles.muted}>No teams in this tier.</Text>
      ) : (
        <View style={styles.table}>
          <View style={[styles.row, styles.headRow]}>
            <Text style={[styles.cPos, styles.th]}>#</Text>
            <Text style={[styles.cTeam, styles.th]}>Team</Text>
            <Text style={[styles.cNum, styles.th]}>P</Text>
            {wide ? (
              <>
                <Text style={[styles.cNum, styles.th]}>W</Text>
                <Text style={[styles.cNum, styles.th]}>D</Text>
                <Text style={[styles.cNum, styles.th]}>L</Text>
                <Text style={[styles.cNum, styles.th]}>GF</Text>
                <Text style={[styles.cNum, styles.th]}>GA</Text>
              </>
            ) : null}
            <Text style={[styles.cNum, styles.th]}>GD</Text>
            <Text style={[styles.cPts, styles.th]}>Pts</Text>
          </View>

          {rows.map((r, i) => {
            const rec: TierRecord = r.byZone[target];
            return (
              <Pressable
                key={r.teamId}
                onPress={onTeamPress ? () => onTeamPress(r) : undefined}
                style={({ hovered }) => [
                  styles.row,
                  Platform.OS === 'web' && hovered ? styles.rowHover : null,
                  onTeamPress && Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null,
                ]}>
                <Text style={[styles.cPos, styles.rankText]}>{i + 1}</Text>
                <View style={styles.cTeam}>
                  <TeamLogo name={r.name} size={18} />
                  <Text style={styles.teamName} numberOfLines={1}>
                    {r.name}
                  </Text>
                  <Text style={styles.overall}>#{r.overallRank}</Text>
                </View>
                <Text style={[styles.cNum, styles.td]}>{rec.played}</Text>
                {wide ? (
                  <>
                    <Text style={[styles.cNum, styles.td]}>{rec.won}</Text>
                    <Text style={[styles.cNum, styles.td]}>{rec.drawn}</Text>
                    <Text style={[styles.cNum, styles.td]}>{rec.lost}</Text>
                    <Text style={[styles.cNum, styles.td]}>{rec.goalsFor}</Text>
                    <Text style={[styles.cNum, styles.td]}>{rec.goalsAgainst}</Text>
                  </>
                ) : null}
                <Text style={[styles.cNum, styles.td]}>
                  {rec.goalDiff > 0 ? `+${rec.goalDiff}` : rec.goalDiff}
                </Text>
                <Text style={[styles.cPts, styles.pts]}>{rec.points}</Text>
              </Pressable>
            );
          })}

          {!hasResults ? (
            <Text style={styles.emptyNote}>No qualifying results yet this season.</Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', paddingVertical: spacing.xxl },
  muted: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: theme.textMuted,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
  filterLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    letterSpacing: 0.8,
    color: theme.textMuted,
    marginBottom: spacing.xs,
  },
  section: { marginBottom: spacing.lg },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  sectionBar: { width: 4, alignSelf: 'stretch', borderRadius: 2, minHeight: 34 },
  sectionTitleWrap: { flex: 1, minWidth: 0 },
  sectionTitle: { fontFamily: fonts.display, fontSize: 16, color: theme.textPrimary },
  sectionRule: { fontFamily: fonts.bodyMedium, fontSize: 11, color: theme.textMuted },

  table: {
    backgroundColor: theme.surface,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 38,
    borderBottomWidth: layout.borderWidth,
    borderBottomColor: theme.border,
    paddingRight: spacing.sm,
  },
  headRow: { backgroundColor: theme.surfaceMuted },
  rowHover: { backgroundColor: theme.surfaceHover },
  th: { fontFamily: fonts.bodySemiBold, fontSize: 10, color: theme.textFaint, textTransform: 'uppercase' },
  td: { fontFamily: fonts.body, fontSize: 12, color: theme.textPrimary },
  cPos: { width: 30, textAlign: 'center' },
  rankText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: theme.textPrimary },
  cTeam: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minWidth: 0, paddingLeft: 2 },
  teamName: { fontFamily: fonts.bodyMedium, fontSize: 13, color: theme.textPrimary, flexShrink: 1 },
  overall: { fontFamily: fonts.body, fontSize: 10, color: theme.textFaint },
  cNum: { width: 34, textAlign: 'center' },
  cPts: { width: 40, textAlign: 'center' },
  pts: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.textPrimary },
  emptyNote: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: theme.textFaint,
    textAlign: 'center',
    paddingVertical: spacing.sm,
  },
  footnote: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: theme.textMuted,
    fontStyle: 'italic',
    marginTop: spacing.xs,
  },
});
