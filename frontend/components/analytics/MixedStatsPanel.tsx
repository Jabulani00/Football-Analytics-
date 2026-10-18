import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { columnsForFamily, sortByPrimary } from '@/utils/statsTableAdapter';
import type { StatFamily, TeamStatsRow, TimePeriod } from '@/types/analytics';
import { halfGoalShares, secondHalfLeagueRates, secondHalfTeamRates } from '@/utils/mixedStats';
import { buildMixedRfs, type TeamRfsRows } from '@/utils/mixedRfs';
import { fonts, spacing, theme } from '@/styles/theme';

type SourceKey = 'ordinary' | 'ppg' | 'series' | 'ft_only' | 'half_only';
type Sources = Record<SourceKey, TeamStatsRow[]> & { ordinaryByPeriod: Record<TimePeriod, TeamStatsRow[]>; ftOnly: TeamStatsRow[]; ppgFt: TeamStatsRow[] };
type MixedOption = { id: string; source: SourceKey; label: string; key: string };

const TRANSCRIBED_STATS = [
  ['sc_1h_share', 'SC* 1H%', '1H team goals ÷ FT team goals'], ['sc_2h_share', 'SC* 2H%', '2H team goals ÷ FT team goals'],
  ['avg_1h_share', 'AVG* 1H%', '1H match goals ÷ FT match goals'], ['conc_1h_share', 'Conc* 1H%', '1H conceded goals ÷ FT conceded goals'],
  ['conc_2h_share', 'Conc* 2H%', '2H conceded goals ÷ FT conceded goals'], ['avg_2h_share', 'AVG* 2H%', '2H match goals ÷ FT match goals'],
  ['shg_team_avg', '2H_T (AVG)', 'Team second-half goals ÷ valid matches'], ['shg_team_consistency', '2H_T (consistency)', 'Matches with team second-half goal ÷ valid matches'],
  ['shg_league_avg', '2H_L (AVG)', 'League second-half total goals ÷ fixtures'], ['shg_league_consistency', '2H_L (consistency)', 'Fixtures with second-half goal ÷ fixtures'],
  ['most_match_goals_half', 'Most goals · match', 'First half / second half / tie'], ['most_scored_half', 'Most goals scored', 'First half / second half / tie'],
  ['most_conceded_half', 'Most goals conceded', 'First half / second half / tie'], ['btts_win', 'BTTS · win', 'BTTS wins ÷ matches'],
  ['btts_draw', 'BTTS · draw', 'BTTS draws ÷ matches'], ['btts_loss', 'BTTS · loss', 'BTTS losses ÷ matches'],
  ['least_clean_sheet', 'Least clean sheets', 'Matches conceding ÷ matches'], ['best_form', 'Best form · high PPG', 'Full-time PPG'],
  ['worst_form', 'Worst form · low PPG', 'Full-time PPG'], ['best_performance', 'Best performance · high', 'FT goals scored avg − conceded avg'],
  ['worst_performance', 'Worst performance · low', 'FT goals scored avg − conceded avg'],
  ['scored_both_halves', 'Scores in both halves', 'Existing FT-Only calculation'], ['conceded_both_halves', 'Concedes in both halves', 'Existing FT-Only calculation'],
] as const;

type TranscribedId = (typeof TRANSCRIBED_STATS)[number][0];
function rowMetric(rows: TeamStatsRow[], team: string, key: string): number | null {
  const value = rows.find((row) => row.team === team)?.metrics.find((metric) => metric.key === key)?.value;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
function transcribedRows(sources: Sources): TeamStatsRow[] {
  const full = sources.ordinaryByPeriod.fulltime;
  const first = sources.ordinaryByPeriod.firsthalf;
  const second = sources.ordinaryByPeriod.secondhalf;
  const teams = [...new Set([...full, ...first, ...second].map((row) => row.team))];
  const allGames = full.flatMap((row) => row.games ?? []);
  const leagueSecondHalf = secondHalfLeagueRates(allGames);
  const valueFor = (team: string, id: TranscribedId): { value: number | null; raw?: boolean } => {
    const fhAvg = rowMetric(first, team, 'avg_goals'); const shAvg = rowMetric(second, team, 'avg_goals');
    const fhScAvg = rowMetric(first, team, 'sc_avg');
    const ftConc = rowMetric(full, team, 'conc_pct');
    const games = full.find((row) => row.team === team)?.games ?? [];
    const shares = halfGoalShares(games);
    const secondHalf = secondHalfTeamRates(games);
    const values: Record<TranscribedId, { value: number | null; raw?: boolean }> = {
      sc_1h_share: { value: shares.scFirst }, sc_2h_share: { value: shares.scSecond },
      avg_1h_share: { value: shares.avgFirst }, conc_1h_share: { value: shares.concFirst },
      conc_2h_share: { value: shares.concSecond }, avg_2h_share: { value: shares.avgSecond },
      shg_team_avg: { value: secondHalf.teamAverage, raw: true }, shg_team_consistency: { value: secondHalf.teamConsistency },
      shg_league_avg: { value: leagueSecondHalf.leagueAverage, raw: true }, shg_league_consistency: { value: leagueSecondHalf.leagueConsistency },
      most_match_goals_half: { value: comparePeriods(fhAvg, shAvg) }, most_scored_half: { value: comparePeriods(fhScAvg, rowMetric(second, team, 'sc_avg')) },
      most_conceded_half: { value: comparePeriods(rowMetric(first, team, 'conc_avg'), rowMetric(second, team, 'conc_avg')) },
      btts_win: { value: bttsOutcomeRate(full.find((row) => row.team === team), 'win') },
      btts_draw: { value: bttsOutcomeRate(full.find((row) => row.team === team), 'draw') },
      btts_loss: { value: bttsOutcomeRate(full.find((row) => row.team === team), 'loss') },
      least_clean_sheet: { value: ftConc }, best_form: { value: rowMetric(sources.ppgFt, team, 'ppg'), raw: true },
      worst_form: { value: rowMetric(sources.ppgFt, team, 'ppg'), raw: true },
      best_performance: { value: goalDiffAverage(full.find((row) => row.team === team)), raw: true },
      worst_performance: { value: goalDiffAverage(full.find((row) => row.team === team)), raw: true },
      scored_both_halves: { value: rowMetric(sources.ftOnly, team, 'scored_both_halves') },
      conceded_both_halves: { value: rowMetric(sources.ftOnly, team, 'conceded_both_halves') },
    };
    return values[id];
  };
  return teams.map((team) => ({ team, metrics: TRANSCRIBED_STATS.map(([key, label]) => {
    const result = valueFor(team, key);
    return { key, label, value: result.value == null ? null : Math.round(result.value * 10) / 10, compliance: null, raw: result.raw };
  }) }));
}
function comparePeriods(first: number | null, second: number | null): number | null { return first == null || second == null ? null : first === second ? 0 : first > second ? 1 : -1; }
function goalDiffAverage(row: TeamStatsRow | undefined): number | null {
  if (!row?.games?.length) return null;
  const games = row.games.filter((game) => game.ftFor != null && game.ftAgainst != null);
  return games.length ? games.reduce((sum, game) => sum + (game.ftFor! - game.ftAgainst!), 0) / games.length : null;
}
function bttsOutcomeRate(row: TeamStatsRow | undefined, outcome: 'win' | 'draw' | 'loss'): number | null {
  const games = row?.games?.filter((game) => game.ftFor != null && game.ftAgainst != null) ?? [];
  if (!games.length) return null;
  const hits = games.filter((game) => game.ftFor! > 0 && game.ftAgainst! > 0 && (outcome === 'win' ? game.ftFor! > game.ftAgainst! : outcome === 'draw' ? game.ftFor === game.ftAgainst : game.ftFor! < game.ftAgainst!)).length;
  return hits / games.length * 100;
}
function renderMixedValue(key: string, value: number, raw: boolean): string {
  if (['most_match_goals_half', 'most_scored_half', 'most_conceded_half'].includes(key)) return value > 0 ? '1st Half' : value < 0 ? '2nd Half' : 'Tie';
  return `${value.toFixed(1)}${raw ? '' : '%'}`;
}

const FAMILIES: { source: SourceKey; family: StatFamily; label: string }[] = [
  { source: 'ordinary', family: 'ordinary', label: 'Ordinary' },
  { source: 'ppg', family: 'ppg', label: 'PPG' },
  { source: 'series', family: 'series', label: 'Series' },
  { source: 'ft_only', family: 'ft_only', label: 'FT-Only' },
  { source: 'half_only', family: 'half_only', label: 'Half stats' },
];
const MAX_MIXED_STATS = 23;
type RfsView = 'rfs_ordinary' | 'ordinary_rfs' | 'series_rfs';

function ordinaryRfsLabels(rfs?: TeamRfsRows): string {
  return (rfs?.ordinary ?? []).map((row) => [row.label, ...row.alsoLabels].join(' + ')).join(' · ') || 'No recent ordinary failure';
}

function seriesRfsLabels(rfs?: TeamRfsRows): string {
  return (rfs?.series ?? []).map((row) => `${row.label}${row.without ? ' without' : ''} · ${row.run}`).join(' · ') || 'No broken series';
}

export default function MixedStatsPanel({
  sources,
  period,
  loading,
  error,
}: {
  sources: Sources;
  period: TimePeriod;
  loading: boolean;
  error: string | null;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [rfsView, setRfsView] = useState<RfsView>('rfs_ordinary');
  const activeFamilies = FAMILIES.filter(({ source }) => source !== 'ft_only' || period === 'fulltime')
    .filter(({ source }) => source !== 'half_only' || period !== 'fulltime');
  const options: MixedOption[] = activeFamilies.flatMap(({ source, family, label }) =>
    columnsForFamily(family).map((column) => ({
      id: `${source}:${column.key}`,
      source,
      key: column.key,
      label: `${label} · ${column.label}`,
    })),
  );
  const selectedOptions = selected.map((id) => options.find((option) => option.id === id)).filter((option): option is MixedOption => option != null);
  const transcribed = useMemo(() => transcribedRows(sources), [sources]);
  const rfsRows = useMemo(
    () => buildMixedRfs(sources.ordinaryByPeriod[period], sources.series, period),
    [sources.ordinaryByPeriod, sources.series, period],
  );
  const rfsByTeam = useMemo(() => new Map(rfsRows.map((row) => [row.team, row])), [rfsRows]);
  const rows = useMemo(() => {
    const teams = new Map<string, TeamStatsRow>();
    for (const { source } of activeFamilies) {
      for (const sourceRow of sources[source]) {
        const row = teams.get(sourceRow.team) ?? { team: sourceRow.team, played: sourceRow.played, games: sourceRow.games, metrics: [] };
        row.played = source === 'ordinary' ? sourceRow.played : row.played;
        row.games = source === 'ordinary' ? sourceRow.games : row.games;
        for (const metric of sourceRow.metrics) {
          row.metrics.push({ ...metric, key: `${source}:${metric.key}`, label: `${source} · ${metric.label}` });
        }
        teams.set(sourceRow.team, row);
      }
    }
    const byTeam = new Map([...teams].map(([team, row]) => [team, new Map(row.metrics.map((metric) => [metric.key, metric]))]));
    return sortByPrimary([...teams.values()].map((row) => ({
      ...row,
      metrics: selectedOptions.map((option) => byTeam.get(row.team)?.get(option.id) ?? ({
        key: option.id,
        label: option.label,
        value: null,
        compliance: null,
      })),
    })));
  }, [activeFamilies, selectedOptions, sources]);

  const toggle = (id: string) => setSelected((previous) => {
    if (previous.includes(id)) return previous.filter((item) => item !== id);
    if (previous.length >= MAX_MIXED_STATS) return previous;
    return [...previous, id];
  });

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>Mixed Stats · Last left-over stats (1–23)</Text>
      <Text style={styles.copy}>These derived views follow the supplied transcription and use the same team, venue, competition, and Last-N fixture sample as the selected 72-table view.</Text>
      <Text style={styles.note}>First-half and second-half goal shares use the same matches with valid half-time scores, so each scored, conceded, and total-goals pair sums to 100%. Items 7–10 show team and league second-half goal averages and consistency.</Text>
      {!loading && transcribed.length > 0 ? <ScrollView horizontal showsHorizontalScrollIndicator style={styles.tableScroll}>
        <View><View style={styles.tableRow}><Text style={[styles.cell, styles.teamCell, styles.header]}>Team</Text>{TRANSCRIBED_STATS.map(([key, label, formula]) => <Text key={key} style={[styles.cell, styles.header]}>{label}{'\n'}<Text style={styles.formula}>{formula}</Text></Text>)}</View>
          {transcribed.map((row, index) => <View key={row.team} style={[styles.tableRow, index % 2 === 1 && styles.alt]}>
            <Text style={[styles.cell, styles.teamCell]}>{row.team}</Text>
            {row.metrics.map((metric) => <Text key={metric.key} style={[styles.cell, styles.value, metric.value == null && styles.missing]}>{metric.value == null ? '—' : renderMixedValue(metric.key, metric.value, metric.raw === true)}</Text>)}
          </View>)}
        </View>
      </ScrollView> : null}
      {loading ? <View style={styles.loading}><ActivityIndicator color={theme.accentGreen} /><Text style={styles.copy}>Loading mixed statistics…</Text></View> : null}
      <Text style={styles.label}>CUSTOM SOURCE COLUMNS · {selected.length}/{MAX_MIXED_STATS}</Text>
      <Text style={styles.copy}>Optionally combine up to 23 existing Ordinary, PPG, Series, FT-Only, or Half stats below.</Text>
      <View style={styles.options}>
        {options.map((option) => {
          const active = selected.includes(option.id);
          const disabled = !active && selected.length >= MAX_MIXED_STATS;
          return (
            <Pressable
              key={option.id}
              accessibilityRole="button"
              accessibilityState={{ selected: active, disabled }}
              onPress={() => toggle(option.id)}
              style={[styles.option, active && styles.optionActive, disabled && styles.optionDisabled]}>
              <Text style={[styles.optionText, active && styles.optionTextActive]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {selected.length >= MAX_MIXED_STATS ? <Text style={styles.note}>The mixed table is limited to 23 selected stats for readability. Remove a selected stat to choose another.</Text> : null}
      {loading ? <View style={styles.loading}><ActivityIndicator color={theme.accentGreen} /><Text style={styles.copy}>Loading live statistics…</Text></View> : null}
      {error ? <Text style={styles.error}>Live statistics unavailable: {error}</Text> : null}
      {!loading && selected.length === 0 ? <Text style={styles.empty}>Select source statistics above to add a custom table alongside the transcribed stats.</Text> : null}
      {!loading && selected.length > 0 && rows.length === 0 ? <Text style={styles.empty}>No team statistics are available for this table yet.</Text> : null}
      {selected.length > 0 && rows.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator style={styles.tableScroll}>
          <View>
            <View style={styles.tableRow}>
              <Text style={[styles.cell, styles.teamCell, styles.header]}>Team</Text>
              {selectedOptions.map((option) => <Text key={option.id} style={[styles.cell, styles.header]}>{option.label}</Text>)}
            </View>
            {rows.map((row, index) => (
              <View key={row.team} style={[styles.tableRow, index % 2 === 1 && styles.alt]}>
                <Text style={[styles.cell, styles.teamCell]}>{row.team}</Text>
                {row.metrics.map((metric) => <Text key={metric.key} style={[styles.cell, styles.value, metric.value == null && styles.missing]}>
                  {metric.value == null ? '—' : `${metric.value}${metric.raw ? '' : '%'}`}
                </Text>)}
              </View>
            ))}
          </View>
        </ScrollView>
      ) : null}

      <View style={styles.rfsPanel}>
        <Text style={styles.rfsTitle}>RFS · RECENT FAILURE SIGNAL</Text>
        <Text style={styles.copy}>An ordinary RFS appears when a stat normally lands in the green band (at least 65% over 5+ matches) but failed in the latest match. Series RFS marks a qualifying run broken by the latest match. Calculations follow this table’s period, venue and match window.</Text>
        <View style={styles.options}>
          {([
            ['rfs_ordinary', 'RFS · Ordinary'],
            ['ordinary_rfs', 'Ordinary + RFS'],
            ['series_rfs', 'Series + RFS'],
          ] as const).map(([id, label]) => (
            <Pressable key={id} onPress={() => setRfsView(id)} style={[styles.option, rfsView === id && styles.rfsOptionActive]}>
              <Text style={[styles.optionText, rfsView === id && styles.rfsOptionTextActive]}>{label}</Text>
            </Pressable>
          ))}
        </View>

        {loading ? <View style={styles.loading}><ActivityIndicator color={theme.accentGreen} /><Text style={styles.copy}>Checking recent failures…</Text></View> : null}
        {!loading && rfsView === 'rfs_ordinary' ? (
          <ScrollView horizontal showsHorizontalScrollIndicator style={styles.tableScroll}>
            <View style={styles.rfsTable}>
              <View style={styles.rfsRow}><RfsCell label="Team" head team /><RfsCell label="Ordinary stat failed" head /><RfsCell label="Usual rate" head /><RfsCell label="Latest result" head /><RfsCell label="Sample" head /></View>
              {rfsRows.flatMap((teamRow) => teamRow.ordinary.map((entry) => (
                <View key={`${teamRow.team}-${entry.key}`} style={styles.rfsRow}>
                  <RfsCell label={teamRow.team} team />
                  <RfsCell label={[entry.label, ...entry.alsoLabels].join(' + ')} />
                  <RfsCell label={`${entry.rate}%`} failure />
                  <RfsCell label={`${entry.last.score} · ${entry.failed}`} />
                  <RfsCell label={`${entry.hits}/${entry.sample}`} />
                </View>
              )))}
              {!rfsRows.some((row) => row.ordinary.length > 0) ? <RfsCell label="No ordinary stats failed their usual standard in the latest match." /> : null}
            </View>
          </ScrollView>
        ) : null}

        {!loading && rfsView === 'ordinary_rfs' ? (
          <ScrollView horizontal showsHorizontalScrollIndicator style={styles.tableScroll}>
            <View style={styles.rfsTable}>
              <View style={styles.rfsRow}><RfsCell label="Team" head team />{sources.ordinaryByPeriod[period][0]?.metrics.map((metric) => <RfsCell key={metric.key} label={metric.label} head />)}<RfsCell label="RFS · last game" head /></View>
              {sources.ordinaryByPeriod[period].map((teamRow, index) => (
                <View key={teamRow.team} style={[styles.rfsRow, index % 2 === 1 && styles.alt]}>
                  <RfsCell label={teamRow.team} team />
                  {teamRow.metrics.map((metric) => <RfsCell key={metric.key} label={metric.value == null ? '—' : `${metric.value.toFixed(1)}${metric.raw ? '' : '%'}`} failure={rfsByTeam.get(teamRow.team)?.ordinary.some((entry) => entry.key === metric.key)} />)}
                  <RfsCell label={ordinaryRfsLabels(rfsByTeam.get(teamRow.team))} failure={Boolean(rfsByTeam.get(teamRow.team)?.ordinary.length)} />
                </View>
              ))}
            </View>
          </ScrollView>
        ) : null}

        {!loading && rfsView === 'series_rfs' ? (
          <ScrollView horizontal showsHorizontalScrollIndicator style={styles.tableScroll}>
            <View style={styles.rfsTable}>
              <View style={styles.rfsRow}><RfsCell label="Team" head team />{sources.series[0]?.metrics.map((metric) => <RfsCell key={metric.key} label={metric.label} head />)}<RfsCell label="RFS · broken run" head /></View>
              {sources.series.map((teamRow, index) => (
                <View key={teamRow.team} style={[styles.rfsRow, index % 2 === 1 && styles.alt]}>
                  <RfsCell label={teamRow.team} team />
                  {teamRow.metrics.map((metric) => <RfsCell key={metric.key} label={metric.value == null ? '—' : `${metric.value}`} failure={rfsByTeam.get(teamRow.team)?.series.some((entry) => entry.key === metric.key)} />)}
                  <RfsCell label={seriesRfsLabels(rfsByTeam.get(teamRow.team))} failure={Boolean(rfsByTeam.get(teamRow.team)?.series.length)} />
                </View>
              ))}
            </View>
          </ScrollView>
        ) : null}
      </View>
    </View>
  );
}

function RfsCell({ label, head, team, failure }: { label: string; head?: boolean; team?: boolean; failure?: boolean }) {
  return <Text style={[styles.rfsCell, head && styles.rfsHead, team && styles.rfsTeam, failure && styles.rfsFailure]}>{label}</Text>;
}

const styles = StyleSheet.create({
  panel: { width: '100%', marginTop: spacing.sm, padding: spacing.md, borderWidth: 1, borderColor: theme.border, borderRadius: 8, backgroundColor: theme.surface },
  rfsPanel: { width: '100%', marginTop: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: theme.border, gap: spacing.xs },
  rfsTitle: { fontFamily: fonts.display, fontSize: 16, color: theme.textPrimary },
  rfsOptionActive: { borderColor: theme.loss, backgroundColor: 'rgba(239,68,68,0.08)' },
  rfsOptionTextActive: { color: theme.loss, fontFamily: fonts.bodySemiBold },
  rfsTable: { borderWidth: 1, borderColor: theme.border, borderRadius: 8, overflow: 'hidden', backgroundColor: theme.surface },
  rfsRow: { flexDirection: 'row', alignItems: 'stretch', borderBottomWidth: StyleSheet.hairlineWidth, borderColor: theme.border },
  rfsCell: { width: 110, paddingHorizontal: 7, paddingVertical: 7, fontFamily: fonts.body, fontSize: 10, color: theme.textPrimary, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: theme.border },
  rfsTeam: { width: 140, fontFamily: fonts.bodyMedium },
  rfsHead: { fontFamily: fonts.bodySemiBold, color: theme.textMuted, backgroundColor: theme.surfaceMuted },
  rfsFailure: { color: theme.loss, fontFamily: fonts.bodySemiBold, backgroundColor: 'rgba(239,68,68,0.06)' },
  title: { fontFamily: fonts.display, fontSize: 20, color: theme.textPrimary },
  copy: { fontFamily: fonts.body, fontSize: 12, lineHeight: 18, color: theme.textMuted, marginTop: spacing.xs },
  label: { fontFamily: fonts.bodySemiBold, fontSize: 10, letterSpacing: 0.8, color: theme.textMuted, marginTop: spacing.md, marginBottom: spacing.xs },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  option: { paddingHorizontal: 9, paddingVertical: 7, borderWidth: 1, borderColor: theme.border, borderRadius: 999, backgroundColor: theme.bg },
  optionActive: { borderColor: theme.accentGreen, backgroundColor: 'rgba(0,180,120,0.1)' },
  optionDisabled: { opacity: 0.45 },
  optionText: { fontFamily: fonts.body, fontSize: 10, color: theme.textMuted },
  optionTextActive: { color: theme.accentGreen, fontFamily: fonts.bodySemiBold },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: spacing.md },
  error: { marginTop: spacing.md, fontFamily: fonts.body, fontSize: 12, color: theme.loss },
  empty: { marginTop: spacing.md, fontFamily: fonts.body, fontSize: 12, color: theme.textMuted, textAlign: 'center' },
  note: { marginTop: spacing.xs, fontFamily: fonts.body, fontSize: 10, color: theme.textMuted },
  tableScroll: { width: '100%', marginTop: spacing.md },
  tableRow: { flexDirection: 'row', minHeight: 38, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: theme.border },
  alt: { backgroundColor: 'rgba(127,127,127,0.04)' },
  cell: { width: 88, paddingHorizontal: 6, paddingVertical: 8, textAlign: 'center', fontFamily: fonts.body, fontSize: 10, color: theme.textPrimary },
  teamCell: { width: 150, textAlign: 'left' },
  header: { fontFamily: fonts.bodySemiBold, color: theme.textMuted },
  formula: { fontFamily: fonts.body, fontSize: 8, color: theme.textFaint },
  value: { fontFamily: fonts.bodyMedium },
  missing: { color: theme.textFaint },
});
