import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { columnsForFamily, sortByPrimary } from '@/utils/statsTableAdapter';
import type { StatFamily, TeamStatsRow, TimePeriod } from '@/types/analytics';
import { fonts, spacing, theme } from '@/styles/theme';

type SourceKey = 'ordinary' | 'ppg' | 'series' | 'ft_only' | 'half_only';
type Sources = Record<SourceKey, TeamStatsRow[]> & { ordinaryByPeriod: Record<TimePeriod, TeamStatsRow[]>; ftOnly: TeamStatsRow[]; ppgFt: TeamStatsRow[] };
type MixedOption = { id: string; source: SourceKey; label: string; key: string };

const TRANSCRIBED_STATS = [
  ['sc_1h_share', 'SC* 1H%', '1H SC% ÷ FT SC%'], ['sc_2h_share', 'SC* 2H%', '2H SC% ÷ FT SC%'],
  ['avg_1h_share', 'AVG* 1H%', '1H AVG ÷ FT AVG'], ['conc_1h_share', 'Conc* 1H%', '1H Conc% ÷ FT Conc%'],
  ['conc_2h_share', 'Conc* 2H%', '2H Conc% ÷ Tsc (denominator unclear)'], ['avg_2h_share', 'AVG* 2H%', '2H AVG ÷ FT AVG'],
  ['fhg_team_avg', 'FHG_T (AVG)', 'First-half team goals ÷ matches'], ['fhg_team_consistency', 'FHG_T (consistency)', 'Matches with team first-half goal ÷ matches'],
  ['fhg_league_avg', 'FHG_L (AVG)', 'League first-half total goals ÷ matches'], ['fhg_league_consistency', 'FHG_L (consistent)', 'League matches with first-half goal ÷ matches'],
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
function ratio(numerator: number | null, denominator: number | null): number | null {
  return numerator == null || denominator == null || denominator === 0 ? null : Math.round(numerator / denominator * 1000) / 10;
}
function transcribedRows(sources: Sources): TeamStatsRow[] {
  const full = sources.ordinaryByPeriod.fulltime;
  const first = sources.ordinaryByPeriod.firsthalf;
  const second = sources.ordinaryByPeriod.secondhalf;
  const teams = [...new Set([...full, ...first, ...second].map((row) => row.team))];
  const leagueGames = new Map<number, NonNullable<TeamStatsRow['games']>[number]>();
  for (const row of first) for (const game of row.games ?? []) if (game.htFor != null && game.htAgainst != null) leagueGames.set(game.id, game);
  const aggregate = [...leagueGames.values()];
  const leagueFhgAvg = aggregate.length ? aggregate.reduce((sum, game) => sum + (game.htFor ?? 0) + (game.htAgainst ?? 0), 0) / aggregate.length : null;
  const leagueFhgRate = aggregate.length ? aggregate.filter((game) => (game.htFor ?? 0) + (game.htAgainst ?? 0) > 0).length / aggregate.length * 100 : null;
  const valueFor = (team: string, id: TranscribedId): { value: number | null; raw?: boolean } => {
    const ftSc = rowMetric(full, team, 'sc_pct'); const ftConc = rowMetric(full, team, 'conc_pct'); const ftAvg = rowMetric(full, team, 'avg_goals');
    const fhSc = rowMetric(first, team, 'sc_pct'); const shSc = rowMetric(second, team, 'sc_pct');
    const fhConc = rowMetric(first, team, 'conc_pct');
    const fhAvg = rowMetric(first, team, 'avg_goals'); const shAvg = rowMetric(second, team, 'avg_goals');
    const fhScAvg = rowMetric(first, team, 'sc_avg'); const fhScRate = rowMetric(first, team, 'scoring_05');
    const values: Record<TranscribedId, { value: number | null; raw?: boolean }> = {
      sc_1h_share: { value: ratio(fhSc, ftSc) }, sc_2h_share: { value: ratio(shSc, ftSc) },
      avg_1h_share: { value: ratio(fhAvg, ftAvg) }, conc_1h_share: { value: ratio(fhConc, ftConc) },
      conc_2h_share: { value: null }, avg_2h_share: { value: ratio(shAvg, ftAvg) },
      fhg_team_avg: { value: fhScAvg, raw: true }, fhg_team_consistency: { value: fhScRate },
      fhg_league_avg: { value: leagueFhgAvg, raw: true }, fhg_league_consistency: { value: leagueFhgRate },
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
      <Text style={styles.note}>“Conc* 2H%” is left blank because its transcribed denominator “Tsc” is unclear. FHG_T is read literally as team first-half goals and FHG_L as league first-half total goals; the note calling items 7–10 second-half features conflicts with their 1H formulas. RFS variants are not fabricated from this panel’s current fixture feed.</Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { width: '100%', marginTop: spacing.sm, padding: spacing.md, borderWidth: 1, borderColor: theme.border, borderRadius: 8, backgroundColor: theme.surface },
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
