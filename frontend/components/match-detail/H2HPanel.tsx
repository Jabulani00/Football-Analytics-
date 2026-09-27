import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import SubTabBar from '@/components/shared/SubTabBar';
import type { H2HMatch } from '@/services/oddAlerts';
import { fonts, layout, spacing, theme } from '@/styles/theme';
import {
  filterH2hBySplit,
  formatH2hScore,
  h2hFocusTeam,
  h2hOutcomeForTeam,
  h2hSummary,
  recentH2hMeetings,
  outcomeBg,
  outcomeColor,
  teamsMatch,
  type H2HOutcome,
  type H2HSplit,
} from '@/utils/h2hDisplay';
import {
  evaluateH2HOptions,
  h2hGradeGuide,
  type H2HGrade,
  type H2HGradeGuideKind,
  type H2HOptionTag,
  type H2HSayBlock,
} from '@/utils/h2hOptions';

type H2HPanelProps = {
  matches: H2HMatch[];
  homeName: string;
  awayName: string;
  t1Name?: string | null;
  t2Name?: string | null;
  /** Fixture competition — used for never-beaten W/D/L totals. */
  competitionName?: string | null;
};

function FormStrip({ outcomes }: { outcomes: H2HOutcome[] }) {
  return (
    <View style={styles.formStrip}>
      {outcomes.map((o, i) => (
        <View key={i} style={[styles.formDot, { backgroundColor: outcomeColor(o) }]}>
          <Text style={styles.formDotText}>{o}</Text>
        </View>
      ))}
    </View>
  );
}

function SummaryBar({
  wins,
  draws,
  losses,
  focusName,
  count,
}: {
  wins: number;
  draws: number;
  losses: number;
  focusName: string;
  count: number;
}) {
  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryTitle}>
        Last {count} meeting{count === 1 ? '' : 's'}
      </Text>
      <View style={styles.summaryRow}>
        <SummaryPill label="W" value={wins} color={theme.win} />
        <SummaryPill label="D" value={draws} color={theme.yellow} />
        <SummaryPill label="L" value={losses} color={theme.loss} />
      </View>
      <Text style={styles.summaryCaption}>
        {focusName} — green win · yellow draw · red loss
      </Text>
    </View>
  );
}

function SummaryPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={[styles.summaryPill, { borderColor: color }]}>
      <Text style={[styles.summaryPillVal, { color }]}>{value}</Text>
      <Text style={styles.summaryPillLabel}>{label}</Text>
    </View>
  );
}

function H2HRow({
  match,
  focusTeam,
}: {
  match: H2HMatch;
  focusTeam: string;
}) {
  const outcome = h2hOutcomeForTeam(match, focusTeam);
  const color = outcomeColor(outcome);
  const bg = outcomeBg(outcome);
  const homeHighlight = teamsMatch(match.home_name, focusTeam);
  const awayHighlight = teamsMatch(match.away_name, focusTeam);

  return (
    <View style={styles.row}>
      <View style={styles.rowMeta}>
        <Text style={styles.date}>{match.date}</Text>
        <Text style={styles.league} numberOfLines={1}>
          {match.league}
        </Text>
      </View>

      <View style={styles.fixtureRow}>
        <Text
          style={[styles.team, homeHighlight && styles.teamHighlight]}
          numberOfLines={2}
        >
          {match.home_name}
        </Text>

        <View style={[styles.scoreBox, { backgroundColor: bg }]}>
          <Text style={[styles.score, { color }]}>{formatH2hScore(match)}</Text>
          {match.ht_score ? <Text style={styles.ht}>({match.ht_score} HT)</Text> : null}
        </View>

        <Text
          style={[styles.team, styles.teamRight, awayHighlight && styles.teamHighlight]}
          numberOfLines={2}
        >
          {match.away_name}
        </Text>

        <View style={[styles.resultBadge, { backgroundColor: color }]}>
          <Text style={styles.resultBadgeText}>{outcome}</Text>
        </View>
      </View>

      <View style={styles.tags}>
        {match.btts ? <Tag label="BTTS" /> : <Tag label="No BTTS" muted />}
        {match.over_25 ? <Tag label="O2.5" /> : null}
        {match.over_35 ? <Tag label="O3.5" /> : null}
        <Tag label={`${match.total_goals} goals`} muted />
      </View>

      {match.stats?.possession?.home != null || match.stats?.corners?.home != null ? (
        <View style={styles.miniStats}>
          {match.stats.possession?.home != null ? (
            <Text style={styles.miniLine}>
              Possession {match.stats.possession.home}% – {match.stats.possession.away}%
            </Text>
          ) : null}
          {match.stats.corners?.home != null ? (
            <Text style={styles.miniLine}>
              Corners {match.stats.corners.home} – {match.stats.corners.away}
            </Text>
          ) : null}
          {match.stats.cards && (match.stats.cards.home > 0 || match.stats.cards.away > 0) ? (
            <Text style={styles.miniLine}>
              Cards {match.stats.cards.home} – {match.stats.cards.away}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function Tag({ label, muted }: { label: string; muted?: boolean }) {
  return (
    <View style={[styles.tag, muted && styles.tagMuted]}>
      <Text style={styles.tagText}>{label}</Text>
    </View>
  );
}

function gradeColor(grade: H2HGrade): string {
  if (grade === 'A') return theme.accentGreen;
  if (grade === 'B') return theme.yellow;
  return theme.textMuted;
}

function SayBlock({
  block,
  onGradePress,
}: {
  block: H2HSayBlock;
  onGradePress?: (kind: H2HGradeGuideKind, grade: H2HGrade) => void;
}) {
  const color =
    block.kind === 'good'
      ? theme.accentGreen
      : block.kind === 'bad'
        ? theme.loss
        : block.kind === 'warn'
          ? theme.accentOrange
          : theme.textMuted;
  return (
    <View style={[styles.sayCard, { borderColor: color }]}>
      <View style={styles.sayHead}>
        <Text style={styles.sayNum}>{block.n}.</Text>
        <Text style={[styles.sayTitle, { color }]}>{block.title}</Text>
        {block.grade ? (
          <Pressable
            onPress={() => {
              if (block.grade && block.gradeKind) onGradePress?.(block.gradeKind, block.grade);
            }}
            disabled={!block.gradeKind}
            accessibilityRole="button"
            accessibilityLabel={`Grade ${block.grade} definition`}>
            <View style={[styles.gradePill, { borderColor: gradeColor(block.grade) }]}>
              <Text style={[styles.gradeText, { color: gradeColor(block.grade) }]}>Grade {block.grade}</Text>
            </View>
          </Pressable>
        ) : null}
      </View>
      <Text style={styles.sayDetail}>{block.detail}</Text>
    </View>
  );
}

function OptionChip({ tag }: { tag: H2HOptionTag }) {
  const color =
    tag.kind === 'good'
      ? theme.accentGreen
      : tag.kind === 'bad'
        ? theme.loss
        : tag.kind === 'warn'
          ? theme.accentOrange
          : theme.textMuted;
  return (
    <View style={[styles.optionChip, { borderColor: color }]}>
      <Text style={[styles.optionLabel, { color }]}>{tag.label}</Text>
      <Text style={styles.optionDetail} numberOfLines={2}>
        {tag.detail}
      </Text>
    </View>
  );
}

function GradeGuideModal({
  kind,
  current,
  games,
  onClose,
}: {
  kind: H2HGradeGuideKind | null;
  current: H2HGrade | null;
  games: number | null;
  onClose: () => void;
}) {
  if (kind == null) return null;
  const guide = h2hGradeGuide(kind);
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.modalSheet}>
          <View style={styles.modalHead}>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalTitle}>{guide.title}</Text>
              {games ? <Text style={styles.modalSub}>This fixture: {games} H2H</Text> : null}
            </View>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
              <Text style={styles.modalClose}>Close</Text>
            </Pressable>
          </View>
          <Text style={styles.modalLead}>{guide.note}</Text>
          <ScrollView style={styles.modalList}>
            {guide.windows.map((win) => (
              <View key={win.games} style={styles.modalWindow}>
                <Text style={[styles.modalWindowTitle, games === win.games && styles.modalWindowOn]}>
                  {win.games} H2H
                </Text>
                {win.grades.map((row) => {
                  const active = games === win.games && current === row.grade;
                  return (
                    <View key={row.grade} style={[styles.modalGrade, active && styles.modalGradeOn]}>
                      <Text style={[styles.modalGradeLabel, { color: gradeColor(row.grade) }]}>
                        Grade {row.grade}
                      </Text>
                      {row.lines.map((line) => (
                        <Text key={line} style={styles.modalLine}>
                          {line}
                        </Text>
                      ))}
                    </View>
                  );
                })}
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const HIDDEN_SAY_TAGS = new Set(['points_share', 'polar', 'nika_nika']);

export default function H2HPanel({
  matches,
  homeName,
  awayName,
  t1Name,
  t2Name,
  competitionName,
}: H2HPanelProps) {
  const [split, setSplit] = useState<H2HSplit>('overall');
  const [gradeModal, setGradeModal] = useState<{
    kind: H2HGradeGuideKind;
    grade: H2HGrade;
  } | null>(null);

  const filtered = useMemo(
    () => recentH2hMeetings(filterH2hBySplit(matches, split, homeName, awayName)),
    [matches, split, homeName, awayName],
  );

  const focusTeam = useMemo(
    () => h2hFocusTeam(split, homeName, awayName),
    [split, homeName, awayName],
  );

  const summary = useMemo(() => h2hSummary(filtered, focusTeam), [filtered, focusTeam]);
  const formOutcomes = useMemo(
    () => filtered.map((m) => h2hOutcomeForTeam(m, focusTeam)),
    [filtered, focusTeam],
  );

  // Section 7 — additive option tags; does not change the list below.
  const options = useMemo(
    () => evaluateH2HOptions({ matches, homeName, awayName, t1Name, t2Name, competitionName }),
    [matches, homeName, awayName, t1Name, t2Name, competitionName],
  );
  const extraTags = useMemo(
    () =>
      options.tags.filter(
        (t) => !HIDDEN_SAY_TAGS.has(t.id) && !t.id.endsWith('_overall'),
      ),
    [options.tags],
  );
  const h2hCount = options.pointsShare ? options.pointsShare.max / 3 : null;
  const openGrade = (kind: H2HGradeGuideKind, grade: H2HGrade) => setGradeModal({ kind, grade });
  const gradeModalEl = (
    <GradeGuideModal
      kind={gradeModal?.kind ?? null}
      current={gradeModal?.grade ?? null}
      games={h2hCount}
      onClose={() => setGradeModal(null)}
    />
  );

  if (matches.length === 0) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.optionsTitle}>What the head-to-head says</Text>
        {options.says.map((b) => (
          <SayBlock key={b.id} block={b} onGradePress={openGrade} />
        ))}
        {extraTags.map((t) => (
          <OptionChip key={t.id} tag={t} />
        ))}
        <Text style={styles.empty}>No head-to-head history available.</Text>
        {gradeModalEl}
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.optionsTitle}>What the head-to-head says</Text>
      <Text style={styles.optionsSub}>
        Quick reads from past meetings between these two
        {options.pointsShare
          ? ` · these ${options.pointsShare.max / 3} H2H games are ${options.pointsShare.max} points`
          : ''}
      </Text>
      <View style={styles.optionList}>
        {options.says.map((b) => (
          <SayBlock key={b.id} block={b} onGradePress={openGrade} />
        ))}
        {extraTags.map((t) => (
          <OptionChip key={t.id} tag={t} />
        ))}
      </View>

      <SubTabBar
        tabs={[
          { id: 'overall', label: 'Overall' },
          { id: 'home', label: `${homeName} at home` },
          { id: 'away', label: `${awayName} away` },
        ]}
        active={split}
        onChange={setSplit}
      />

      {filtered.length > 0 ? (
        <>
          <SummaryBar
            wins={summary.wins}
            draws={summary.draws}
            losses={summary.losses}
            focusName={focusTeam}
            count={filtered.length}
          />
          <FormStrip outcomes={formOutcomes} />
          <View style={styles.list}>
            {filtered.map((m) => (
              <H2HRow key={m.id} match={m} focusTeam={focusTeam} />
            ))}
          </View>
        </>
      ) : (
        <Text style={styles.empty}>No meetings in this split.</Text>
      )}
      {gradeModalEl}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  optionsTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: theme.textPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  optionsSub: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: theme.textMuted,
    marginBottom: spacing.sm,
  },
  optionList: { gap: spacing.xs, marginBottom: spacing.md },
  sayCard: {
    borderWidth: 1,
    borderRadius: layout.borderRadius,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    backgroundColor: theme.surface,
    gap: 4,
  },
  sayHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  sayNum: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: theme.textFaint,
    width: 18,
  },
  sayTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    flexShrink: 1,
  },
  sayDetail: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: theme.textMuted,
    marginLeft: 24,
    lineHeight: 16,
  },
  gradePill: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  gradeText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  modalRoot: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalSheet: {
    maxHeight: '80%',
    backgroundColor: theme.surface,
    borderRadius: layout.borderRadius,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    padding: spacing.md,
  },
  modalHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  modalTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 16,
    color: theme.textPrimary,
  },
  modalSub: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textMuted,
    marginTop: 2,
  },
  modalClose: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: theme.accentBlue,
    paddingVertical: 2,
  },
  modalLead: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textMuted,
    marginBottom: spacing.sm,
    lineHeight: 17,
  },
  modalList: { maxHeight: 420 },
  modalWindow: { marginBottom: spacing.md },
  modalWindowTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: theme.textFaint,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: spacing.xs,
  },
  modalWindowOn: { color: theme.textPrimary },
  modalGrade: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginBottom: spacing.xs,
    backgroundColor: theme.surfaceHover,
  },
  modalGradeOn: {
    borderColor: theme.accentGreen,
    backgroundColor: 'rgba(5, 150, 105, 0.08)',
  },
  modalGradeLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    marginBottom: 2,
  },
  modalLine: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textMuted,
    lineHeight: 17,
  },
  optionChip: {
    borderWidth: 1,
    borderRadius: layout.borderRadius,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: theme.surface,
  },
  optionLabel: { fontFamily: fonts.bodySemiBold, fontSize: 11 },
  optionDetail: { fontFamily: fonts.body, fontSize: 10, color: theme.textMuted, marginTop: 2 },
  empty: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: theme.textMuted,
    fontStyle: 'italic',
    padding: spacing.md,
  },
  summaryCard: {
    backgroundColor: theme.surface,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  summaryTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    color: theme.textFaint,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: spacing.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  summaryPill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: layout.borderRadius,
    borderWidth: 1,
    backgroundColor: theme.surfaceHover,
  },
  summaryPillVal: {
    fontFamily: fonts.displaySemi,
    fontSize: 22,
  },
  summaryPillLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    color: theme.textMuted,
    marginTop: 2,
  },
  summaryCaption: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: theme.textFaint,
    marginTop: spacing.sm,
  },
  formStrip: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: spacing.md,
    paddingHorizontal: 2,
  },
  formDot: {
    width: 26,
    height: 26,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formDotText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    color: '#fff',
  },
  list: {
    backgroundColor: theme.surface,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    overflow: 'hidden',
  },
  row: {
    padding: spacing.md,
    borderBottomWidth: layout.borderWidth,
    borderBottomColor: theme.border,
  },
  rowMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  date: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: theme.textMuted,
  },
  league: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 10,
    color: theme.textFaint,
    textAlign: 'right',
  },
  fixtureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  team: {
    flex: 1,
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: theme.textPrimary,
    lineHeight: 16,
  },
  teamRight: {
    textAlign: 'right',
  },
  teamHighlight: {
    fontFamily: fonts.bodySemiBold,
    color: theme.textPrimary,
  },
  scoreBox: {
    minWidth: 52,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    alignItems: 'center',
  },
  score: {
    fontFamily: fonts.displaySemi,
    fontSize: 16,
  },
  ht: {
    fontFamily: fonts.body,
    fontSize: 9,
    color: theme.textMuted,
    marginTop: 1,
  },
  resultBadge: {
    width: 24,
    height: 24,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultBadgeText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    color: '#fff',
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: spacing.sm,
  },
  tag: {
    backgroundColor: 'rgba(5, 150, 105, 0.1)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
  },
  tagMuted: {
    backgroundColor: theme.surfaceMuted,
  },
  tagText: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: theme.textMuted,
  },
  miniStats: {
    marginTop: spacing.sm,
    gap: 2,
  },
  miniLine: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: theme.textFaint,
  },
});
