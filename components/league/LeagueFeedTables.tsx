import { StyleSheet, Text, View } from 'react-native';

import SectionLabel from '@/components/shared/SectionLabel';
import { fonts, layout, spacing, theme } from '@/styles/theme';

type Row = { label: string; pct?: number; extra?: string };

export function SimpleTable({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <View style={styles.card}>
      <SectionLabel>{title}</SectionLabel>
      {rows.map((r) => (
        <View key={r.label} style={styles.row}>
          <Text style={styles.label}>{r.label}</Text>
          <Text style={styles.value}>
            {r.pct !== undefined ? `${r.pct}%` : ''}
            {r.extra ?? ''}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function TopScorersTable({
  rows,
}: {
  rows: { rank: number; player: string; team: string; goals: number; assists: number }[];
}) {
  return (
    <View style={styles.card}>
      <SectionLabel>TOP SCORERS</SectionLabel>
      <View style={styles.header}>
        <Text style={[styles.h, styles.rank]}>#</Text>
        <Text style={[styles.h, styles.name]}>Player</Text>
        <Text style={styles.h}>G</Text>
        <Text style={styles.h}>A</Text>
      </View>
      {rows.map((r) => (
        <View key={r.rank} style={styles.row}>
          <Text style={[styles.label, styles.rank]}>{r.rank}</Text>
          <View style={styles.nameCol}>
            <Text style={styles.player}>{r.player}</Text>
            <Text style={styles.team}>{r.team}</Text>
          </View>
          <Text style={styles.value}>{r.goals}</Text>
          <Text style={styles.value}>{r.assists}</Text>
        </View>
      ))}
    </View>
  );
}

export function FormTable({ rows }: { rows: { team: string; last5: string[]; points: number }[] }) {
  return (
    <View style={styles.card}>
      <SectionLabel>LEAGUE FORM — LAST 5</SectionLabel>
      {rows.map((r) => (
        <View key={r.team} style={styles.formRow}>
          <Text style={styles.team} numberOfLines={1}>
            {r.team}
          </Text>
          <Text style={styles.formSeq}>{r.last5.join(' ')}</Text>
          <Text style={styles.pts}>{r.points} pts</Text>
        </View>
      ))}
    </View>
  );
}

export function LeagueOddsTable({
  rows,
}: {
  rows: { fixture: string; kickoff: string; home: string; draw: string; away: string }[];
}) {
  return (
    <View style={styles.card}>
      <SectionLabel>LEAGUE ODDS OVERVIEW</SectionLabel>
      <Text style={styles.source}>Hollywoodbets · Odds Alert API</Text>
      {rows.map((r) => (
        <View key={r.fixture} style={styles.oddsRow}>
          <Text style={styles.fixture}>{r.fixture}</Text>
          <Text style={styles.kick}>{r.kickoff}</Text>
          <View style={styles.oddsChips}>
            <Text style={styles.chip}>1 {r.home}</Text>
            <Text style={styles.chip}>X {r.draw}</Text>
            <Text style={styles.chip}>2 {r.away}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    backgroundColor: theme.surface,
    borderRadius: layout.borderRadius,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  header: { flexDirection: 'row', marginTop: spacing.md, marginBottom: spacing.sm },
  h: { flex: 1, fontFamily: fonts.bodySemiBold, fontSize: 10, color: theme.textMuted, textAlign: 'center' },
  rank: { width: 28, flex: 0 },
  name: { flex: 2, textAlign: 'left' },
  nameCol: { flex: 2 },
  label: { fontFamily: fonts.body, fontSize: 13, color: theme.textMuted },
  value: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.textPrimary },
  player: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: theme.textPrimary },
  team: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted },
  formRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  formSeq: { fontFamily: fonts.display, fontSize: 14, color: theme.accentGreen, letterSpacing: 2 },
  pts: { fontFamily: fonts.bodyMedium, fontSize: 12, color: theme.textMuted, marginLeft: 'auto' },
  source: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted, marginBottom: spacing.md },
  oddsRow: { paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: theme.border },
  fixture: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: theme.textPrimary },
  kick: { fontFamily: fonts.body, fontSize: 12, color: theme.textMuted, marginBottom: spacing.sm },
  oddsChips: { flexDirection: 'row', gap: spacing.sm },
  chip: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: theme.accentBlue,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 6,
  },
});
