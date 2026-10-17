import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { columnsForFamily, sortByPrimary } from '@/utils/statsTableAdapter';
import type { StatFamily, TeamStatsRow, TimePeriod } from '@/types/analytics';
import { fonts, spacing, theme } from '@/styles/theme';

type SourceKey = 'ordinary' | 'ppg' | 'series' | 'ft_only' | 'half_only';
type Sources = Record<SourceKey, TeamStatsRow[]>;
type MixedOption = { id: string; source: SourceKey; label: string; key: string };

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
      <Text style={styles.title}>Mixed Stats (1–23) · build a combined table</Text>
      <Text style={styles.copy}>Select 1–23 existing statistics for this 72-table view. Each value comes from its existing calculation; stats that are unavailable for this period or lack source data remain blank.</Text>
      <Text style={styles.label}>SELECT STATS · {selected.length}/{MAX_MIXED_STATS}</Text>
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
      {!loading && selected.length === 0 ? <Text style={styles.empty}>Select statistics above to build your mixed table.</Text> : null}
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
  value: { fontFamily: fonts.bodyMedium },
  missing: { color: theme.textFaint },
});
