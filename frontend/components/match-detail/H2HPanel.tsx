import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import SubTabBar from '@/components/shared/SubTabBar';
import type { H2HMatch } from '@/services/oddAlerts';
import { fonts, layout, spacing, theme } from '@/styles/theme';
import {
  filterH2hBySplit,
  formatH2hScore,
  h2hFocusTeam,
  h2hOutcomeForTeam,
  h2hSummary,
  outcomeBg,
  outcomeColor,
  teamsMatch,
  type H2HOutcome,
  type H2HSplit,
} from '@/utils/h2hDisplay';
import { evaluateH2HOptions, type H2HOptionTag } from '@/utils/h2hOptions';

type H2HPanelProps = {
  matches: H2HMatch[];
  homeName: string;
  awayName: string;
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

export default function H2HPanel({ matches, homeName, awayName }: H2HPanelProps) {
  const [split, setSplit] = useState<H2HSplit>('overall');

  const filtered = useMemo(
    () => filterH2hBySplit(matches, split, homeName, awayName),
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
    () => evaluateH2HOptions({ matches, homeName, awayName }),
    [matches, homeName, awayName],
  );

  if (matches.length === 0) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.optionsTitle}>What the head-to-head says</Text>
        {options.tags.map((t) => (
          <OptionChip key={t.id} tag={t} />
        ))}
        <Text style={styles.empty}>No head-to-head history available.</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.optionsTitle}>What the head-to-head says</Text>
      <Text style={styles.optionsSub}>
        Quick reads from past meetings between these two
        {options.pointsShare
          ? ` · points from H2H: ${options.pointsShare.home}–${options.pointsShare.away} (of ${options.pointsShare.max} each)`
          : ''}
      </Text>
      <View style={styles.optionList}>
        {options.tags.map((t) => (
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
