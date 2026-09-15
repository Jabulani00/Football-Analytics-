import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

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

function pctText(side: BhozomaSideStats): string {
  if (side.pctAttained == null) return '—';
  return `${Math.round(side.pctAttained)}%`;
}

function resultsText(side: BhozomaSideStats): string {
  if (side.results.length === 0) return '—';
  const recent = side.results.slice(-4);
  return recent.map((r) => `${r.gf}-${r.ga}`).join(' · ');
}

function Cell({
  children,
  style,
  muted,
  accent,
}: {
  children: string;
  style?: object;
  muted?: boolean;
  accent?: 'warn' | 'ok' | null;
}) {
  const color =
    accent === 'warn'
      ? theme.accentOrange
      : accent === 'ok'
        ? theme.accentBlue
        : muted
          ? theme.textMuted
          : theme.textPrimary;
  return (
    <Text style={[styles.td, style, { color }]} numberOfLines={1}>
      {children}
    </Text>
  );
}

function SideCells({ side }: { side: BhozomaSideStats }) {
  const noSample = side.mp <= 0;
  const early = side.dataDust && side.mp > 0;
  return (
    <>
      <Cell style={styles.cMp}>{String(side.mp)}</Cell>
      <Cell style={styles.cScores} muted>
        {resultsText(side)}
      </Cell>
      <Cell style={styles.cNum} muted={noSample}>
        {noSample ? '—' : String(side.pointsPossible)}
      </Cell>
      <Cell style={styles.cNum} muted={noSample}>
        {noSample ? '—' : String(side.pointsAttained)}
      </Cell>
      <Cell style={styles.cNum} muted={noSample}>
        {noSample ? '—' : String(side.pointsLost)}
      </Cell>
      <Cell style={styles.cPct} muted={noSample || early}>
        {pctText(side)}
      </Cell>
      <Cell
        style={styles.cLabel}
        accent={noSample ? 'warn' : early ? 'warn' : 'ok'}
        muted={noSample}>
        {side.label ?? '—'}
      </Cell>
    </>
  );
}

function DataRow({ row }: { row: BhozomaTeamRow }) {
  return (
    <View style={[styles.row, row.isMidTable && styles.rowMid]}>
      <Text style={[styles.td, styles.cPos]}>{row.rank}</Text>
      <Text style={[styles.td, styles.cTeam]} numberOfLines={1}>
        {row.name}
      </Text>
      <Text style={[styles.td, styles.cPts]}>{row.points}</Text>
      <SideCells side={row.above} />
      <SideCells side={row.below} />
    </View>
  );
}

/**
 * Section 8 — Bhozoma as a table (MP / scores / max / attained / lost / % / read).
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
        Mid-table form vs sides currently above and below on the table (not all season games).
        Giant-killer = taking ≥50% of points from higher sides. vs lower sides: 60–74% =
        good, ≥75% = dominates. Under 3 meetings still shows a read marked “early”.
      </Text>
      {table.midBand ? (
        <Text style={styles.summary}>
          Mid-table places {table.midBand.from}–{table.midBand.to} · {focus.length} team
          {focus.length === 1 ? '' : 's'}
          {table.midRows.length === 0 ? ' (full table — no mid band hit)' : ''}
        </Text>
      ) : (
        <Text style={styles.summary}>Showing {focus.length} teams</Text>
      )}
      {matches.length === 0 ? (
        <Text style={styles.muted}>No finished season fixtures loaded yet.</Text>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View style={styles.table}>
          {/* Group header */}
          <View style={[styles.row, styles.groupRow]}>
            <View style={styles.cPos} />
            <View style={styles.cTeam} />
            <View style={styles.cPts} />
            <Text style={[styles.groupLabel, styles.cAboveBlock]}>vs Above</Text>
            <Text style={[styles.groupLabel, styles.cBelowBlock]}>vs Below</Text>
          </View>

          {/* Column header */}
          <View style={[styles.row, styles.headRow]}>
            <Text style={[styles.th, styles.cPos]}>#</Text>
            <Text style={[styles.th, styles.cTeam]}>Team</Text>
            <Text style={[styles.th, styles.cPts]}>Pts</Text>
            <Text style={[styles.th, styles.cMp]}>MP</Text>
            <Text style={[styles.th, styles.cScores]}>Scores</Text>
            <Text style={[styles.th, styles.cNum]}>Max</Text>
            <Text style={[styles.th, styles.cNum]}>Att</Text>
            <Text style={[styles.th, styles.cNum]}>Lost</Text>
            <Text style={[styles.th, styles.cPct]}>%</Text>
            <Text style={[styles.th, styles.cLabel]}>Read</Text>
            <Text style={[styles.th, styles.cMp]}>MP</Text>
            <Text style={[styles.th, styles.cScores]}>Scores</Text>
            <Text style={[styles.th, styles.cNum]}>Max</Text>
            <Text style={[styles.th, styles.cNum]}>Att</Text>
            <Text style={[styles.th, styles.cNum]}>Lost</Text>
            <Text style={[styles.th, styles.cPct]}>%</Text>
            <Text style={[styles.th, styles.cLabel]}>Read</Text>
          </View>

          {focus.map((r) => (
            <DataRow key={r.teamId} row={r} />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const SIDE_COLS = 36 + 120 + 40 + 40 + 40 + 44 + 150; // MP Scores Max Att Lost % Read

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
  table: {
    backgroundColor: theme.surface,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    overflow: 'hidden',
    minWidth: 28 + 140 + 40 + SIDE_COLS * 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 36,
    borderBottomWidth: layout.borderWidth,
    borderBottomColor: theme.border,
    paddingHorizontal: spacing.xs,
  },
  groupRow: {
    backgroundColor: theme.surfaceMuted,
    minHeight: 28,
    borderBottomWidth: 0,
  },
  headRow: { backgroundColor: theme.surfaceMuted },
  rowMid: { backgroundColor: 'rgba(217, 119, 6, 0.05)' },
  groupLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    color: theme.textPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    textAlign: 'center',
  },
  cAboveBlock: { width: SIDE_COLS },
  cBelowBlock: { width: SIDE_COLS },
  th: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    color: theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  td: {
    fontFamily: fonts.body,
    fontSize: 12,
  },
  cPos: { width: 28, textAlign: 'center', fontFamily: fonts.bodySemiBold },
  cTeam: { width: 140, paddingRight: spacing.xs, fontFamily: fonts.bodySemiBold },
  cPts: { width: 40, textAlign: 'center', fontFamily: fonts.bodySemiBold },
  cMp: { width: 36, textAlign: 'center' },
  cScores: { width: 120, paddingHorizontal: 4 },
  cNum: { width: 40, textAlign: 'center' },
  cPct: { width: 44, textAlign: 'center', fontFamily: fonts.bodySemiBold },
  cLabel: { width: 150, paddingHorizontal: 4, fontFamily: fonts.bodySemiBold, fontSize: 11 },
});
