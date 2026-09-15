import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { SeasonMatch } from '@/utils/bhozomaEngine';
import {
  buildImbangiTable,
  IMBANGI_TIGHT_PTS,
  type ImbangiRow,
} from '@/utils/imbangiEngine';
import type { StandingLike } from '@/utils/motivationEngine';
import { fonts, layout, spacing, theme } from '@/styles/theme';

type Props = {
  standings: StandingLike[];
  matches: SeasonMatch[];
  loading: boolean;
  error: string | null;
  seasonProgress?: number | null;
  /** Competition / league name for the table. */
  competitionName?: string;
};

function Cell({
  children,
  style,
  color,
}: {
  children: string;
  style?: object;
  color?: string;
}) {
  return (
    <Text style={[styles.td, style, color ? { color } : null]} numberOfLines={1}>
      {children}
    </Text>
  );
}

function resultColor(r: ImbangiRow['lastResult']): string {
  if (r === 'W') return theme.win;
  if (r === 'L') return theme.loss;
  if (r === 'D') return theme.yellow;
  return theme.textMuted;
}

function DataRow({ row, competition }: { row: ImbangiRow; competition: string }) {
  return (
    <View style={[styles.row, row.tight && styles.rowTight]}>
      <Cell style={styles.cPos}>{String(row.position)}</Cell>
      <Cell style={styles.cTeam}>{row.teamName}</Cell>
      <Cell style={styles.cNum}>{String(row.teamPoints)}</Cell>
      <Cell style={styles.cNum}>{String(row.teamPlayed)}</Cell>
      <Cell style={styles.cNum}>{String(row.remaining)}</Cell>
      <Cell style={styles.cComp} color={theme.textMuted}>
        {competition}
      </Cell>
      <Cell style={styles.cRel} color={row.relation === 'above' ? theme.accentBlue : theme.accentOrange}>
        {row.relation === 'above' ? 'Above' : 'Below'}
      </Cell>
      <Cell style={styles.cPos}>{String(row.opponentPosition)}</Cell>
      <Cell style={styles.cTeam}>{row.opponentName}</Cell>
      <Cell style={styles.cNum}>{String(row.opponentPoints)}</Cell>
      <Cell
        style={styles.cDiff}
        color={row.tight ? theme.accentOrange : theme.textPrimary}>
        {String(row.pointsDiff)}
      </Cell>
      <Cell style={styles.cDate} color={theme.textMuted}>
        {row.lastDate ?? '—'}
      </Cell>
      <Cell style={styles.cScore}>{row.lastScore ?? 'Not met yet'}</Cell>
      <Cell style={styles.cRes} color={resultColor(row.lastResult)}>
        {row.lastResult ?? '—'}
      </Cell>
      <Cell style={styles.cNum} color={theme.textMuted}>
        {row.lastPtsForTeam != null ? String(row.lastPtsForTeam) : '—'}
      </Cell>
      <Cell
        style={styles.cInterest}
        color={row.tight ? theme.accentOrange : theme.textMuted}>
        {row.tight ? 'Tight' : 'Wide'}
      </Cell>
    </View>
  );
}

/**
 * Section 9 — Imbangi neighbour table + league progress (clear columns).
 */
export default function ImbangiView({
  standings,
  matches,
  loading,
  error,
  seasonProgress,
  competitionName,
}: Props) {
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.accentGreen} />
        <Text style={styles.muted}>Loading Imbangi neighbour meetings…</Text>
      </View>
    );
  }
  if (error) return <Text style={styles.muted}>{error}</Text>;
  if (standings.length === 0) return <Text style={styles.muted}>No standings.</Text>;

  const table = buildImbangiTable(standings, matches, seasonProgress);
  const { progress } = table;
  const competition = competitionName?.trim() || 'League';
  const tightCount = table.closest.filter((r) => r.tight).length;

  return (
    <View>
      <Text style={styles.blurb}>
        Imbangi compares each team to the neighbour one place above and one place below.
        Smaller ΔP (points difference) means a tighter fight — {IMBANGI_TIGHT_PTS} pts or less
        is marked Tight. Last meeting is from that team’s lens (score, W/D/L, points taken).
      </Text>

      <View style={[styles.progressCard, progress.lateStretch && styles.progressLate]}>
        <Text style={styles.progressTitle}>League progress</Text>
        <View style={styles.progressGrid}>
          <View style={styles.progressItem}>
            <Text style={styles.progressLabel}>Season played</Text>
            <Text style={styles.progressValue}>
              {progress.seasonProgress != null ? `${progress.seasonProgress}%` : 'n/a'}
            </Text>
          </View>
          <View style={styles.progressItem}>
            <Text style={styles.progressLabel}>Most games played</Text>
            <Text style={styles.progressValue}>{progress.maxPlayed}</Text>
          </View>
          <View style={styles.progressItem}>
            <Text style={styles.progressLabel}>Avg remaining</Text>
            <Text style={styles.progressValue}>
              {progress.avgRemaining != null ? String(progress.avgRemaining) : 'n/a'}
            </Text>
          </View>
          <View style={styles.progressItem}>
            <Text style={styles.progressLabel}>Stage</Text>
            <Text
              style={[
                styles.progressValue,
                progress.lateStretch && { color: theme.accentOrange },
              ]}>
              {progress.lateStretch ? 'Late stretch' : 'Open season'}
            </Text>
          </View>
        </View>
        <Text style={styles.progressNote}>{progress.note}</Text>
      </View>

      <Text style={styles.summary}>
        {table.closest.length} neighbour pairs · {tightCount} tight (ΔP ≤ {IMBANGI_TIGHT_PTS})
        {matches.length === 0 ? ' · no finished fixtures loaded yet for last meetings' : ''}
      </Text>

      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View style={styles.table}>
          <View style={[styles.row, styles.headRow]}>
            <Text style={[styles.th, styles.cPos]}>#</Text>
            <Text style={[styles.th, styles.cTeam]}>Team</Text>
            <Text style={[styles.th, styles.cNum]}>Pts</Text>
            <Text style={[styles.th, styles.cNum]}>P</Text>
            <Text style={[styles.th, styles.cNum]}>Left</Text>
            <Text style={[styles.th, styles.cComp]}>Competition</Text>
            <Text style={[styles.th, styles.cRel]}>Rival</Text>
            <Text style={[styles.th, styles.cPos]}>Opp #</Text>
            <Text style={[styles.th, styles.cTeam]}>Opponent</Text>
            <Text style={[styles.th, styles.cNum]}>Opp pts</Text>
            <Text style={[styles.th, styles.cDiff]}>ΔP</Text>
            <Text style={[styles.th, styles.cDate]}>Met</Text>
            <Text style={[styles.th, styles.cScore]}>Last score</Text>
            <Text style={[styles.th, styles.cRes]}>Res</Text>
            <Text style={[styles.th, styles.cNum]}>LP</Text>
            <Text style={[styles.th, styles.cInterest]}>Interest</Text>
          </View>

          {table.closest.length === 0 ? (
            <Text style={styles.empty}>No neighbour pairs yet.</Text>
          ) : (
            table.closest.map((r) => (
              <DataRow
                key={`${r.teamId}-${r.opponentId}-${r.relation}`}
                row={r}
                competition={competition}
              />
            ))
          )}
        </View>
      </ScrollView>

      <Text style={styles.legend}>
        LP = points taken by the team in the last meeting (3 / 1 / 0). Sorted by closest ΔP first.
      </Text>
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
  legend: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: theme.textMuted,
    marginTop: spacing.sm,
    lineHeight: 15,
  },
  center: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
  muted: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: theme.textMuted,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  empty: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textMuted,
    padding: spacing.md,
  },
  progressCard: {
    backgroundColor: theme.surface,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  progressLate: { borderColor: theme.accentOrange },
  progressTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    color: theme.textPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  progressGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  progressItem: { minWidth: 110, flexGrow: 1 },
  progressLabel: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: theme.textMuted,
  },
  progressValue: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: theme.textPrimary,
    marginTop: 2,
  },
  progressNote: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: theme.textMuted,
    marginTop: spacing.xs,
    lineHeight: 15,
  },
  table: {
    backgroundColor: theme.surface,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    overflow: 'hidden',
    minWidth: 980,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 36,
    borderBottomWidth: layout.borderWidth,
    borderBottomColor: theme.border,
    paddingHorizontal: spacing.xs,
  },
  headRow: { backgroundColor: theme.surfaceMuted },
  rowTight: { backgroundColor: 'rgba(234, 88, 12, 0.06)' },
  th: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    color: theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  td: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textPrimary,
  },
  cPos: { width: 36, textAlign: 'center', fontFamily: fonts.bodySemiBold },
  cTeam: { width: 120, paddingRight: 4, fontFamily: fonts.bodySemiBold },
  cNum: { width: 40, textAlign: 'center' },
  cComp: { width: 110, paddingHorizontal: 4 },
  cRel: { width: 52, textAlign: 'center', fontFamily: fonts.bodySemiBold },
  cDiff: { width: 40, textAlign: 'center', fontFamily: fonts.bodySemiBold },
  cDate: { width: 88, textAlign: 'center' },
  cScore: { width: 88, textAlign: 'center' },
  cRes: { width: 36, textAlign: 'center', fontFamily: fonts.bodySemiBold },
  cInterest: { width: 56, textAlign: 'center', fontFamily: fonts.bodySemiBold },
});
