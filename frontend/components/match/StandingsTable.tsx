import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import SectionLabel from '@/components/shared/SectionLabel';
import type { StandingRow } from '@/mock/matchData';
import { fonts, layout, spacing, theme } from '@/styles/theme';

type StandingsTableProps = {
  standings: StandingRow[];
  highlightTeams?: string[];
  seasonLabel?: string;
};

const ZONE_SEPARATORS: { afterPos: number; label: string }[] = [
  { afterPos: 3, label: '─── Champions League ───' },
  { afterPos: 6, label: '─── Europa League ───' },
  { afterPos: 9, label: '─── Relegation Play-off ───' },
  { afterPos: 11, label: '─── Relegation ───' },
];

function FormPills({ form }: { form: StandingRow['form'] | undefined }) {
  const results = form ?? [];
  return (
    <View style={styles.formRow}>
      {results.map((r, i) => (
        <View
          key={i}
          style={[
            styles.formPill,
            r === 'W' && styles.formWin,
            r === 'D' && styles.formDraw,
            r === 'L' && styles.formLoss,
          ]}>
          <Text
            style={[
              styles.formPillText,
              r === 'D' && styles.formPillTextDraw,
            ]}>
            {r}
          </Text>
        </View>
      ))}
    </View>
  );
}

function ZoneSeparator({ label }: { label: string }) {
  return (
    <View style={styles.zoneRow}>
      <Text style={styles.zoneLabel}>{label}</Text>
    </View>
  );
}

function TableRow({
  row,
  highlighted,
}: {
  row: StandingRow;
  highlighted: boolean;
}) {
  const separator = ZONE_SEPARATORS.find((z) => z.afterPos === row.pos);

  return (
    <>
      <Pressable
        style={({ pressed, hovered }) => [
          styles.row,
          highlighted && styles.rowHighlighted,
          (pressed || (Platform.OS === 'web' && hovered)) && styles.rowHover,
        ]}>
        <Text style={[styles.cell, styles.colPos]}>{row.pos}</Text>
        <Text style={[styles.cell, styles.colTeam]} numberOfLines={1}>
          {row.team}
        </Text>
        <Text style={styles.cell}>{row.played}</Text>
        <Text style={styles.cell}>{row.won}</Text>
        <Text style={styles.cell}>{row.drawn}</Text>
        <Text style={styles.cell}>{row.lost}</Text>
        <Text style={styles.cell}>{row.gf}</Text>
        <Text style={styles.cell}>{row.ga}</Text>
        <Text style={styles.cell}>{row.gd > 0 ? `+${row.gd}` : row.gd}</Text>
        <Text style={[styles.cell, styles.colPts]}>{row.points}</Text>
        <View style={styles.colForm}>
          <FormPills form={row.form} />
        </View>
      </Pressable>
      {separator ? <ZoneSeparator label={separator.label} /> : null}
    </>
  );
}

export default function StandingsTable({
  standings,
  highlightTeams = [],
  seasonLabel = 'SCOTTISH PREMIERSHIP — 2024/25',
}: StandingsTableProps) {
  const highlights = highlightTeams ?? [];

  return (
    <View style={styles.container}>
      <SectionLabel style={styles.heading}>{seasonLabel}</SectionLabel>
      <View style={styles.headerRow}>
        <Text style={[styles.headerCell, styles.colPos]}>#</Text>
        <Text style={[styles.headerCell, styles.colTeam]}>Team</Text>
        <Text style={styles.headerCell}>P</Text>
        <Text style={styles.headerCell}>W</Text>
        <Text style={styles.headerCell}>D</Text>
        <Text style={styles.headerCell}>L</Text>
        <Text style={styles.headerCell}>GF</Text>
        <Text style={styles.headerCell}>GA</Text>
        <Text style={styles.headerCell}>GD</Text>
        <Text style={[styles.headerCell, styles.colPts]}>Pts</Text>
        <Text style={[styles.headerCell, styles.colForm]}>Form</Text>
      </View>
      {standings.map((row) => (
        <TableRow key={row.team} row={row} highlighted={highlights.includes(row.team)} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
    backgroundColor: theme.surface,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
  },
  heading: {
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: layout.borderWidth,
    borderBottomColor: theme.border,
    paddingHorizontal: spacing.sm,
  },
  headerCell: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    color: theme.textMuted,
    width: 28,
    textAlign: 'center',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: layout.borderWidth,
    borderBottomColor: theme.border,
    borderLeftWidth: 2,
    borderLeftColor: 'transparent',
  },
  rowHighlighted: {
    borderLeftColor: theme.accentGreen,
    backgroundColor: 'rgba(0, 229, 160, 0.04)',
  },
  rowHover: {
    backgroundColor: theme.surfaceHover,
  },
  cell: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textPrimary,
    width: 28,
    textAlign: 'center',
  },
  colPos: {
    width: 24,
    textAlign: 'left',
  },
  colTeam: {
    flex: 1,
    minWidth: 72,
    textAlign: 'left',
    paddingRight: spacing.sm,
  },
  colPts: {
    fontFamily: fonts.bodySemiBold,
  },
  colForm: {
    width: 80,
    alignItems: 'flex-end',
  },
  formRow: {
    flexDirection: 'row',
    gap: 3,
  },
  formPill: {
    width: 14,
    height: 14,
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formWin: {
    backgroundColor: theme.win,
  },
  formDraw: {
    backgroundColor: 'transparent',
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
  },
  formLoss: {
    backgroundColor: theme.loss,
  },
  formPillText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 8,
    color: theme.bg,
  },
  formPillTextDraw: {
    color: theme.textMuted,
  },
  zoneRow: {
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: theme.textFaint,
    borderStyle: 'dashed',
    opacity: 0.6,
  },
  zoneLabel: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: theme.textMuted,
    letterSpacing: 0.5,
  },
});
