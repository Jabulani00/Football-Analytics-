import { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { SectorIntro } from '@/components/match-detail/PowerDynamicsSectors';
import SubTabBar from '@/components/shared/SubTabBar';
import type { SeasonMatch } from '@/utils/bhozomaEngine';
import {
  formChildTable,
  halfTimeCoverage,
  type FixtureExclude,
  type FormChildGroup,
  type FormChildRow,
  type FormChildSide,
  type FormChildVenue,
} from '@/utils/formChildBeater';
import type { StandingLike } from '@/utils/motivationEngine';
import type { PowerDynamicsBundle, TableColour, Tone } from '@/utils/powerDynamicsEngine';
import { fonts, layout, spacing, theme } from '@/styles/theme';

const GROUP_TABS: { id: FormChildGroup; label: string }[] = [
  { id: 'table', label: 'Overall' },
  { id: 'ft', label: 'Full time' },
  { id: '1h', label: '1st half' },
  { id: '2h', label: '2nd half' },
];

const VENUE_TABS: { id: FormChildVenue; label: string }[] = [
  { id: 'overall', label: 'Overall' },
  { id: 'home', label: 'Home' },
  { id: 'away', label: 'Away' },
];

type Props = {
  pd: PowerDynamicsBundle;
  standings: StandingLike[];
  matches: SeasonMatch[];
  loading: boolean;
  error: string | null;
  competitionId?: number | string | null;
  exclude?: FixtureExclude | null;
  seasonLinked: boolean;
  /** Opens on this period. The caller remounts the panel when the function changes. */
  initialGroup?: FormChildGroup;
};

function toSide(snap: PowerDynamicsBundle['t1']): FormChildSide {
  return {
    label: snap.label,
    teamId: snap.teamId,
    colour: snap.colour,
    rank: snap.rank,
    table: {
      mp: snap.overall.mp,
      won: snap.overall.won,
      drawn: snap.overall.drawn,
      lost: snap.overall.lost,
      points: snap.overall.points,
      ppg: snap.overall.ppg,
    },
  };
}

function toneColor(t: Tone): string {
  if (t === 'good') return theme.accentGreen;
  if (t === 'warn') return theme.yellow;
  if (t === 'bad') return theme.loss;
  return theme.textMuted;
}

function tierColor(colour: TableColour | null): string {
  if (colour === 'green') return theme.accentGreen;
  if (colour === 'yellow') return theme.yellow;
  if (colour === 'red') return theme.loss;
  return theme.textMuted;
}

function bandTone(row: FormChildRow): Tone | undefined {
  if (row.band === 'bad') return 'bad';
  if (row.band === 'mild') return 'warn';
  if (row.band === 'good' || row.band === 'great') return 'good';
  return undefined;
}

function Cell({
  children,
  style,
  tone,
  color,
}: {
  children: string;
  style?: object;
  tone?: Tone;
  color?: string;
}) {
  return (
    <Text
      style={[styles.td, style, color ? { color } : tone ? { color: toneColor(tone) } : null]}
      numberOfLines={2}>
      {children}
    </Text>
  );
}

function DataRow({ row }: { row: FormChildRow }) {
  return (
    <View style={styles.row}>
      <View style={styles.team}>
        <Text style={styles.teamName} numberOfLines={2}>
          {row.label}
        </Text>
        <Text style={styles.rank}>{row.rank != null ? `#${row.rank}` : '—'}</Text>
      </View>
      <Cell style={styles.tier} color={tierColor(row.colour)}>
        {row.tier}
      </Cell>
      <Cell style={styles.num}>{row.mp > 0 ? String(row.mp) : '—'}</Cell>
      <Cell style={styles.wdl}>
        {row.mp > 0 ? `${row.won}-${row.drawn}-${row.lost}` : '—'}
      </Cell>
      <Cell style={styles.num}>{row.mp > 0 ? String(row.points) : '—'}</Cell>
      <Cell style={styles.num}>{row.ppg != null ? row.ppg.toFixed(2) : '—'}</Cell>
      <Cell style={styles.read} tone={bandTone(row)}>
        {row.bandLabel}
      </Cell>
      <Cell
        style={styles.flag}
        tone={row.childBeater ? 'warn' : undefined}
        color={row.colour === 'red' && !row.childBeater ? theme.textMuted : undefined}>
        {row.umshayi ?? '—'}
      </Cell>
      <Cell style={styles.bhozoma} color={row.bhozoma ? theme.accentPurple : theme.textMuted}>
        {row.bhozoma ?? '—'}
      </Cell>
    </View>
  );
}

export default function FormChildBeaterPanel({
  pd,
  standings,
  matches,
  loading,
  error,
  competitionId,
  exclude,
  seasonLinked,
  initialGroup,
}: Props) {
  const [group, setGroup] = useState<FormChildGroup>(initialGroup ?? 'table');
  const [venue, setVenue] = useState<FormChildVenue>('overall');
  const needsGames = group !== 'table';
  const ht = halfTimeCoverage(matches);

  const rows = useMemo(
    () =>
      formChildTable({
        t1: toSide(pd.t1),
        t2: toSide(pd.t2),
        standings,
        matches,
        competitionId,
        group,
        venue,
        exclude,
      }),
    [pd.t1, pd.t2, standings, matches, competitionId, group, venue, exclude],
  );

  return (
    <View>
      <SectorIntro
        title="Form + Child beater"
        note="Green: 0–0.7 Bad, 0.8–1.2 Good, 1.3–3 Great. Yellow: 0–0.9 Bad, 1.0–1.4 Mild/ok, 1.5–1.7 Good, 1.8–3 Great. Red: 0–1 Bad, 1.1–1.4 Mild/ok, 1.5–1.7 Good, 1.8–3 Great. A red side on 1.5–1.7 is Umshayi wezingane. Any other red PPG is not a child beater. A yellow side who takes more than half the points from teams below them is Umnqumi wehlathi."
      />
      <SubTabBar tabs={GROUP_TABS} active={group} onChange={setGroup} />
      {group !== 'table' ? (
        <SubTabBar tabs={VENUE_TABS} active={venue} onChange={setVenue} />
      ) : null}
      <Text style={styles.scope}>
        {group === 'table'
          ? 'League table PPG — points divided by games played.'
          : group === '1h'
            ? '1st-half points from finished league games, excluding this fixture.'
            : group === '2h'
              ? '2nd-half points from finished league games, excluding this fixture.'
              : 'Full-time points from finished league games, excluding this fixture.'}
      </Text>
      {standings.length === 0 ? (
        <Text style={styles.muted}>Need a league table for these labels.</Text>
      ) : needsGames && !seasonLinked ? (
        <Text style={styles.muted}>No season linked to this fixture.</Text>
      ) : needsGames && loading && matches.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.accentGreen} />
          <Text style={styles.muted}>Loading season games…</Text>
        </View>
      ) : needsGames && error ? (
        <Text style={styles.muted}>{error}</Text>
      ) : (
        <View>
          {group === 'table' && loading && matches.length === 0 ? (
            <Text style={styles.scope}>Checking Bhozoma from season games…</Text>
          ) : null}
          {group === 'table' && error ? <Text style={styles.muted}>{error}</Text> : null}
          {group === '1h' || group === '2h' ? (
            <Text style={styles.scope}>
              {ht.covered} of {ht.total} finished games have a half-time score
              {ht.covered === 0 ? ' — half tables stay empty until that data lands' : ''}.
            </Text>
          ) : null}
          {needsGames && matches.length === 0 ? (
            <Text style={styles.muted}>No finished season fixtures loaded yet.</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator>
              <View style={styles.table}>
                <View style={[styles.row, styles.head]}>
                  <Text style={[styles.th, styles.team]}>Team</Text>
                  <Text style={[styles.th, styles.tier]}>Tier</Text>
                  <Text style={[styles.th, styles.num]}>MP</Text>
                  <Text style={[styles.th, styles.wdl]}>W-D-L</Text>
                  <Text style={[styles.th, styles.num]}>Pts</Text>
                  <Text style={[styles.th, styles.num]}>PPG</Text>
                  <Text style={[styles.th, styles.read]}>Label</Text>
                  <Text style={[styles.th, styles.flag]}>Umshayi wezingane</Text>
                  <Text style={[styles.th, styles.bhozoma]}>Bhozoma</Text>
                </View>
                {rows.map((row) => (
                  <DataRow key={row.label} row={row} />
                ))}
              </View>
            </ScrollView>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  scope: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textMuted,
    lineHeight: 17,
    marginBottom: spacing.sm,
  },
  muted: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: theme.textMuted,
    paddingVertical: spacing.sm,
    lineHeight: 18,
  },
  center: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
  table: {
    backgroundColor: theme.surface,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    overflow: 'hidden',
    minWidth: 168 + 72 + 40 + 64 + 44 + 52 + 88 + 156 + 150,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    borderBottomWidth: layout.borderWidth,
    borderBottomColor: theme.border,
    paddingHorizontal: spacing.xs,
  },
  head: { backgroundColor: theme.surfaceMuted, minHeight: 32 },
  th: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    color: theme.textPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    opacity: 0.7,
  },
  td: { fontFamily: fonts.bodyMedium, fontSize: 13, color: theme.textPrimary },
  team: { width: 168, paddingRight: spacing.xs },
  teamName: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.textPrimary },
  rank: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted, marginTop: 1 },
  tier: { width: 72, fontFamily: fonts.bodySemiBold },
  num: { width: 44, textAlign: 'center' },
  wdl: { width: 64, textAlign: 'center' },
  read: { width: 88, fontFamily: fonts.bodySemiBold },
  flag: { width: 156, fontFamily: fonts.bodySemiBold },
  bhozoma: { width: 150, fontFamily: fonts.bodySemiBold },
});
