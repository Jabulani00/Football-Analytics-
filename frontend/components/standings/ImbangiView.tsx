import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { SeasonMatch } from '@/utils/bhozomaEngine';
import {
  buildImbangiTable,
  IMBANGI_GRADE_PTS,
  IMBANGI_TIGHT_PTS,
  type ImbangiGrade,
  type ImbangiRow,
  type ImbangiScheduleMatch,
} from '@/utils/imbangiEngine';
import type { StandingLike } from '@/utils/motivationEngine';
import { fonts, layout, spacing, theme } from '@/styles/theme';

type Props = {
  standings: StandingLike[];
  matches: SeasonMatch[];
  schedule?: ImbangiScheduleMatch[];
  loading: boolean;
  error: string | null;
  seasonProgress?: number | null;
  /** Competition / league name for the table. */
  competitionName?: string;
  highlightIds?: number[];
  teamLabels?: Record<number, string>;
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

function gradeColor(g: ImbangiGrade | null): string {
  if (g === 'A') return theme.accentGreen;
  if (g === 'B') return theme.accentOrange;
  if (g === 'C') return theme.accentBlue;
  return theme.textMuted;
}

function resultColor(r: ImbangiRow['lastResult']): string {
  if (r === 'W') return theme.win;
  if (r === 'L') return theme.loss;
  if (r === 'D') return theme.yellow;
  return theme.textMuted;
}

function DataRow({
  row,
  competition,
  highlight,
  extraLabel,
  placeTone,
}: {
  row: ImbangiRow;
  competition: string;
  highlight?: boolean;
  extraLabel?: string;
  placeTone?: 1 | 2;
}) {
  return (
    <View
      style={[
        styles.row,
        row.tight && styles.rowTight,
        highlight && styles.rowFocus,
        placeTone === 1 && styles.rowFirst,
        placeTone === 2 && styles.rowSecond,
      ]}>
      <Cell style={styles.cPos} color={placeTone === 1 ? theme.yellow : placeTone === 2 ? theme.textMuted : undefined}>
        {String(row.position)}
      </Cell>
      <Cell style={styles.cTeam}>{extraLabel ?? row.teamName}</Cell>
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
      <Cell style={styles.cGrade} color={gradeColor(row.grade)}>
        {row.grade ?? '—'}
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
  schedule,
  loading,
  error,
  seasonProgress,
  competitionName,
  highlightIds,
  teamLabels,
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

  const table = buildImbangiTable(standings, matches, seasonProgress, schedule ?? []);
  const { progress } = table;
  const competition = competitionName?.trim() || 'League';
  const tightCount = table.closest.filter((r) => r.tight).length;
  const gradeA = table.closest.filter((r) => r.grade === 'A').length;
  const gradeB = table.closest.filter((r) => r.grade === 'B').length;
  const gradeC = table.closest.filter((r) => r.grade === 'C').length;
  const sortedTable = [...standings].sort((a, b) => a.rank - b.rank);
  const first = sortedTable.find((r) => r.rank === 1) ?? sortedTable[0] ?? null;
  const second = sortedTable.find((r) => r.rank === 2) ?? sortedTable[1] ?? null;
  const titleGap =
    first && second && first.points != null && second.points != null
      ? Math.abs(first.points - second.points)
      : null;
  const titlePair = table.rows.filter(
    (r) =>
      (r.position === 1 && r.opponentPosition === 2) ||
      (r.position === 2 && r.opponentPosition === 1),
  );
  const titleGrade: ImbangiGrade | null = titlePair.some((r) => r.grade === 'A')
    ? 'A'
    : titlePair.some((r) => r.grade === 'B')
      ? 'B'
      : titlePair.some((r) => r.grade === 'C')
        ? 'C'
        : null;
  const titleReason =
    titlePair.find((r) => r.grade === titleGrade)?.gradeReason ??
    (titleGap != null && titleGap > IMBANGI_GRADE_PTS ? `ΔP ${titleGap} — outside the grade band` : null);

  return (
    <View>
      <Text style={styles.blurb}>
        Imbangi compares each team to the neighbour one place above and one place below.
        Smaller ΔP means a tighter fight — {IMBANGI_TIGHT_PTS} pts or less is Tight.
        Grades: C when ΔP ≤ {IMBANGI_GRADE_PTS}; B if one side lost their last game; A if both
        play the same day, the first side already won, and this side still has to play.
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

      {first && second ? (
        <View style={[styles.titleCard, titleGrade === 'A' && styles.titleCardA]}>
          <View style={styles.titleHead}>
            <Text style={styles.titleEyebrow}>1st vs 2nd</Text>
            <View style={styles.titleGradeBox}>
              <Text style={[styles.titleGrade, { color: gradeColor(titleGrade) }]}>
                {titleGrade ?? '—'}
              </Text>
              <Text style={styles.titleGradeCap}>grade</Text>
            </View>
          </View>
          <View style={styles.titleRow}>
            <View style={styles.titleSide}>
              <Text style={styles.titlePlace}>#1</Text>
              <Text style={styles.titleName} numberOfLines={1}>
                {teamLabels?.[first.teamId] ?? first.name}
              </Text>
              <Text style={styles.titlePts}>{first.points} pts</Text>
            </View>
            <View style={styles.titleGapBox}>
              <Text style={styles.titleGap}>{titleGap != null ? titleGap : '—'}</Text>
              <Text style={styles.titleGapCap}>pts apart</Text>
            </View>
            <View style={[styles.titleSide, styles.titleSideRight]}>
              <Text style={styles.titlePlace}>#2</Text>
              <Text style={styles.titleName} numberOfLines={1}>
                {teamLabels?.[second.teamId] ?? second.name}
              </Text>
              <Text style={styles.titlePts}>{second.points} pts</Text>
            </View>
          </View>
          {titleReason ? <Text style={styles.titleReason}>{titleReason}</Text> : null}
        </View>
      ) : null}

      <Text style={styles.summary}>
        {table.closest.length} neighbour pairs · {tightCount} tight (ΔP ≤ {IMBANGI_TIGHT_PTS})
        {' · '}
        A {gradeA} · B {gradeB} · C {gradeC}
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
            <Text style={[styles.th, styles.cGrade]}>Grade</Text>
          </View>

          {table.closest.length === 0 ? (
            <Text style={styles.empty}>No neighbour pairs yet.</Text>
          ) : (
            table.closest.map((r) => (
              <DataRow
                key={`${r.teamId}-${r.opponentId}-${r.relation}`}
                row={r}
                competition={competition}
                highlight={Boolean(highlightIds?.includes(r.teamId))}
                extraLabel={teamLabels?.[r.teamId]}
                placeTone={r.position === 1 ? 1 : r.position === 2 ? 2 : undefined}
              />
            ))
          )}
        </View>
      </ScrollView>

      <Text style={styles.legend}>
        LP = points taken by the team in the last meeting (3 / 1 / 0). Sorted by closest ΔP first.
        Grade A is only on the side that still has to play after their neighbour won the same day.
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
    minWidth: 1024,
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
  rowFocus: { backgroundColor: 'rgba(37, 99, 235, 0.08)' },
  rowFirst: {
    backgroundColor: 'rgba(202, 138, 4, 0.16)',
    borderLeftWidth: 3,
    borderLeftColor: theme.yellow,
  },
  rowSecond: {
    backgroundColor: 'rgba(100, 116, 139, 0.14)',
    borderLeftWidth: 3,
    borderLeftColor: theme.textMuted,
  },
  titleCard: {
    backgroundColor: theme.surface,
    borderWidth: layout.borderWidth,
    borderColor: theme.yellow,
    borderRadius: layout.borderRadius,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  titleCardA: { borderColor: theme.accentGreen },
  titleHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  titleEyebrow: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    color: theme.yellow,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  titleGradeBox: {
    minWidth: 52,
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: layout.borderRadius,
    backgroundColor: theme.surfaceMuted,
  },
  titleGrade: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 18,
    lineHeight: 22,
  },
  titleGradeCap: {
    fontFamily: fonts.body,
    fontSize: 8,
    color: theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  titleReason: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: theme.textMuted,
    marginTop: spacing.xs,
    lineHeight: 15,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  titleSide: { flex: 1, minWidth: 0 },
  titleSideRight: { alignItems: 'flex-end' },
  titlePlace: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    color: theme.textMuted,
  },
  titleName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: theme.textPrimary,
    marginTop: 1,
  },
  titlePts: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textMuted,
    marginTop: 1,
  },
  titleGapBox: {
    minWidth: 72,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: layout.borderRadius,
    backgroundColor: theme.surfaceMuted,
  },
  titleGap: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 22,
    color: theme.textPrimary,
    lineHeight: 26,
  },
  titleGapCap: {
    fontFamily: fonts.body,
    fontSize: 9,
    color: theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
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
  cGrade: { width: 44, textAlign: 'center', fontFamily: fonts.bodySemiBold },
});
