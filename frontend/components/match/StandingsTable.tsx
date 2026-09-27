import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import SectionLabel from '@/components/shared/SectionLabel';
import type { StandingRow } from '@/mock/matchData';
import { fonts, layout, spacing, theme } from '@/styles/theme';
import { bandOf, type Band } from '@/utils/leagueTables';
import type { MetricColumn } from '@/utils/standingsAnalytics';
import { zonesForCompetition, type ResolvedZone, type ZoneKind } from '@/utils/competitionZones';

const TIER_COLOR: Record<Band, string> = { green: '#16A34A', yellow: '#D97706', red: '#DC2626' };
const TIER_LABEL: Record<Band, string> = {
  green: 'Top third',
  yellow: 'Middle third',
  red: 'Bottom third',
};
const TIER_BANDS: Band[] = ['green', 'yellow', 'red'];

/** Divider tint per qualification / demotion band. */
const ZONE_COLOR: Record<ZoneKind, string> = {
  continentalTop: theme.accentBlue,
  continentalTopQual: theme.accentBlue,
  continentalSecond: theme.accentPurple,
  continentalThird: theme.accentGreen,
  relegationPlayoff: theme.yellow,
  relegation: theme.loss,
};

type StandingsTableProps = {
  standings: StandingRow[];
  highlightTeams?: string[];
  seasonLabel?: string;
  /**
   * Colour the rank by green / yellow / red tier (table thirds) and show the
   * matching legend. On by default; pass `false` for tables whose position
   * column is a metric rank rather than a league placing.
   */
  tierColor?: boolean;
  /**
   * Teams sitting inside the colour band a band table is measured against.
   * They get a band-coloured dot, so it is obvious which rows are the band
   * itself (measured head-to-head) and which are playing against it.
   */
  bandMembers?: Set<string>;
  /** The band those members belong to — picks the dot's colour. */
  band?: Band;
  /**
   * OddAlerts competition id. When it has curated rules, the table draws
   * labelled qualification / relegation dividers; otherwise none are shown.
   */
  competitionId?: number | string | null;
  /** Replace the Form column with a metric value column (probability tables). */
  metricColumn?: MetricColumn;
  /** Make rows tappable (e.g. open a team). Receives the row's team name. */
  onRowPress?: (team: string) => void;
};

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

function ZoneSeparator({ zone }: { zone: ResolvedZone }) {
  const color = ZONE_COLOR[zone.kind];
  return (
    <View style={[styles.zoneRow, { borderTopColor: color }]}>
      <View style={[styles.zoneDot, { backgroundColor: color }]} />
      <Text style={[styles.zoneLabel, { color }]}>{zone.label}</Text>
    </View>
  );
}

function TierLegend() {
  return (
    <View style={styles.legend}>
      {TIER_BANDS.map((b) => (
        <View key={b} style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: TIER_COLOR[b] }]} />
          <Text style={styles.legendText}>{TIER_LABEL[b]}</Text>
        </View>
      ))}
    </View>
  );
}

function TableRow({
  row,
  highlighted,
  tierColor,
  total,
  bandColor,
  metricCell,
  onPress,
}: {
  row: StandingRow;
  highlighted: boolean;
  tierColor: boolean;
  total: number;
  /** Set when this row is a member of the band the table measures against. */
  bandColor?: string;
  metricCell?: { display: string; sub: string };
  onPress?: () => void;
}) {
  const tierBand = tierColor ? bandOf(row.pos, total) : null;
  const posColor = tierBand ? TIER_COLOR[tierBand] : undefined;
  const edgeColor = tierBand ? TIER_COLOR[tierBand] : bandColor;

  return (
    <Pressable
        onPress={onPress}
        style={({ pressed, hovered }) => [
          styles.row,
          edgeColor ? { borderLeftColor: edgeColor } : null,
          highlighted && styles.rowHighlighted,
          (pressed || (Platform.OS === 'web' && hovered)) && styles.rowHover,
          onPress && Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null,
        ]}>
        <Text style={[styles.cell, styles.colPos, posColor ? { color: posColor, fontFamily: fonts.bodySemiBold } : null]}>
          {row.pos}
        </Text>
        <View style={styles.colTeam}>
          {bandColor ? <View style={[styles.bandDot, { backgroundColor: bandColor }]} /> : null}
          <Text style={styles.teamName} numberOfLines={1}>
            {row.team}
          </Text>
        </View>
        <Text style={styles.cell}>{row.played}</Text>
        <Text style={styles.cell}>{row.won}</Text>
        <Text style={styles.cell}>{row.drawn}</Text>
        <Text style={styles.cell}>{row.lost}</Text>
        <Text style={styles.cell}>{row.gf}</Text>
        <Text style={styles.cell}>{row.ga}</Text>
        <Text style={styles.cell}>{row.gd > 0 ? `+${row.gd}` : row.gd}</Text>
        <Text style={[styles.cell, styles.colPts]}>{row.points}</Text>
        <View style={styles.colForm}>
          {metricCell ? (
            <View style={styles.metricCell}>
              <Text style={styles.metricValue}>{metricCell.display}</Text>
              <Text style={styles.metricSub} numberOfLines={1}>
                {metricCell.sub}
              </Text>
            </View>
          ) : (
            <FormPills form={row.form} />
          )}
        </View>
    </Pressable>
  );
}

export default function StandingsTable({
  standings,
  highlightTeams = [],
  seasonLabel = 'SCOTTISH PREMIERSHIP — 2024/25',
  tierColor = true,
  bandMembers,
  band,
  competitionId,
  metricColumn,
  onRowPress,
}: StandingsTableProps) {
  const highlights = highlightTeams ?? [];
  const bandColor = band ? TIER_COLOR[band] : undefined;
  // Empty for any competition without curated rules — no guessed zones.
  const zones = zonesForCompetition(competitionId, standings.length);
  const zoneByPos = new Map(zones.map((z) => [z.afterPos, z]));

  return (
    <View style={styles.container}>
      <SectionLabel style={styles.heading}>{seasonLabel}</SectionLabel>
      {tierColor ? <TierLegend /> : null}
      <View style={styles.headerRow}>
        <Text style={[styles.headerCell, styles.colPos]}>#</Text>
        <Text style={[styles.headerCell, styles.colTeamHead]}>Team</Text>
        <Text style={styles.headerCell}>P</Text>
        <Text style={styles.headerCell}>W</Text>
        <Text style={styles.headerCell}>D</Text>
        <Text style={styles.headerCell}>L</Text>
        <Text style={styles.headerCell}>GF</Text>
        <Text style={styles.headerCell}>GA</Text>
        <Text style={styles.headerCell}>GD</Text>
        <Text style={[styles.headerCell, styles.colPts]}>Pts</Text>
        <Text style={[styles.headerCell, styles.colForm]}>{metricColumn ? metricColumn.header : 'Form'}</Text>
      </View>
      {standings.map((row) => (
        <View key={row.team}>
          <TableRow
            row={row}
            highlighted={highlights.includes(row.team)}
            tierColor={tierColor}
            total={standings.length}
            bandColor={bandMembers?.has(row.team) ? bandColor : undefined}
            metricCell={metricColumn?.values.get(row.team)}
            onPress={onRowPress ? () => onRowPress(row.team) : undefined}
          />
          {zoneByPos.has(row.pos) ? <ZoneSeparator zone={zoneByPos.get(row.pos)!} /> : null}
        </View>
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingRight: spacing.sm,
  },
  colTeamHead: {
    flex: 1,
    minWidth: 72,
    textAlign: 'left',
    paddingRight: spacing.sm,
  },
  teamName: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textPrimary,
    flexShrink: 1,
  },
  bandDot: { width: 6, height: 6, borderRadius: 3 },
  colPts: {
    fontFamily: fonts.bodySemiBold,
  },
  colForm: {
    width: 80,
    alignItems: 'flex-end',
  },
  metricCell: {
    alignItems: 'flex-end',
  },
  metricValue: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: theme.textPrimary,
  },
  metricSub: {
    fontFamily: fonts.body,
    fontSize: 9,
    color: theme.textFaint,
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: 5,
    paddingHorizontal: spacing.sm,
    borderTopWidth: 2,
  },
  zoneDot: { width: 6, height: 6, borderRadius: 3 },
  zoneLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 9,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.md,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  legendSwatch: { width: 10, height: 10, borderRadius: 2 },
  legendText: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted },
});
