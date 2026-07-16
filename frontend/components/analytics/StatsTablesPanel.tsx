import { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import SectionLabel from '@/components/shared/SectionLabel';
import { STATS_TABLES, getTeamStatsForTable } from '@/mock/analyticsData';
import type { StatsTableMeta } from '@/types/analytics';
import { complianceColor } from '@/utils/compliance';
import { fonts, layout, spacing, theme } from '@/styles/theme';

export default function StatsTablesPanel() {
  const [selectedId, setSelectedId] = useState(STATS_TABLES[0].id);
  const selected = STATS_TABLES.find((t) => t.id === selectedId) ?? STATS_TABLES[0];
  const teams = useMemo(() => getTeamStatsForTable(selectedId), [selectedId]);

  return (
    <View style={styles.container}>
      <Text style={styles.hint}>
        72 tables total (45 base + 27 last-N) · 100+ metrics · Overall / Home / Away
      </Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={Platform.OS === 'web'}
        contentContainerStyle={styles.tablePicker}>
        {STATS_TABLES.map((table) => (
          <TableChip
            key={table.id}
            table={table}
            active={table.id === selectedId}
            onPress={() => setSelectedId(table.id)}
          />
        ))}
      </ScrollView>

      <View style={styles.metaCard}>
        <Text style={styles.metaTitle}>{selected.name}</Text>
        <View style={styles.metaRow}>
          <MetaTag label={selected.group === 'base' ? 'Base' : 'Last-N'} />
          <MetaTag label={selected.split} />
          <MetaTag label={selected.period.replace('fulltime', 'FT').replace('firsthalf', '1H').replace('secondhalf', '2H')} />
          {selected.recency && selected.recency !== 'all' ? (
            <MetaTag label={selected.recency.replace('last', 'Last ')} />
          ) : null}
          <Text style={styles.statCount}>{selected.statCount}+ stats</Text>
        </View>
      </View>

      <SectionLabel style={styles.section}>Ordinary Team Stats (sample)</SectionLabel>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={Platform.OS === 'web'}
        style={styles.tableScroll}>
        <View style={styles.dataTable}>
          <View style={styles.tableHeader}>
            <Text style={[styles.cell, styles.cellTeam]}>Team</Text>
            {teams[0]?.metrics.map((m) => (
              <Text key={m.key} style={styles.cell}>
                {m.label}
              </Text>
            ))}
          </View>
          {teams.map((row) => (
            <View key={row.team} style={styles.tableRow}>
              <Text style={[styles.cell, styles.cellTeam, styles.teamName]}>{row.team}</Text>
              {row.metrics.map((m) => (
                <View key={m.key} style={styles.cell}>
                  <Text style={[styles.cellValue, { color: complianceColor(m.compliance) }]}>
                    {m.value}%
                  </Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={styles.categories}>
        <CategoryBlock title="Full-Time Only" items={['BTTS Both Halves', 'Win to Nil', 'HT/FT combos', 'Rescued Points']} />
        <CategoryBlock title="1st Half Only" items={['0-0 at 1H', 'HT Under 0.5', 'HT Over 1.5']} />
        <CategoryBlock title="2nd Half Only" items={['0-0 at 2H', '2H Under 0.5', '2H Over 1.5']} />
        <CategoryBlock title="Series Stats" items={['29 with opponent', '7 without opponent', 'RFS variants']} />
      </View>
    </View>
  );
}

function TableChip({
  table,
  active,
  onPress,
}: {
  table: StatsTableMeta;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed, hovered }) => [
        styles.chip,
        active && styles.chipActive,
        (pressed || (Platform.OS === 'web' && hovered)) && styles.chipHover,
      ]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{table.name}</Text>
    </Pressable>
  );
}

function MetaTag({ label }: { label: string }) {
  return (
    <View style={styles.tag}>
      <Text style={styles.tagText}>{label.toUpperCase()}</Text>
    </View>
  );
}

function CategoryBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <View style={styles.categoryCard}>
      <Text style={styles.categoryTitle}>{title}</Text>
      {items.map((item) => (
        <Text key={item} style={styles.categoryItem}>
          · {item}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
  },
  hint: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: theme.textMuted,
    textAlign: 'center',
    marginBottom: spacing.lg,
    maxWidth: 640,
  },
  tablePicker: {
    justifyContent: 'center',
    gap: spacing.sm,
    paddingBottom: spacing.md,
    flexGrow: 1,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    backgroundColor: theme.surface,
  },
  chipActive: {
    borderColor: theme.accentGreen,
  },
  chipHover: {
    borderColor: theme.textMuted,
  },
  chipText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textMuted,
  },
  chipTextActive: {
    color: theme.accentGreen,
    fontFamily: fonts.bodyMedium,
  },
  metaCard: {
    width: '100%',
    maxWidth: 720,
    backgroundColor: theme.surface,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    padding: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  metaTitle: {
    fontFamily: fonts.display,
    fontSize: 20,
    color: theme.textPrimary,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
    alignItems: 'center',
  },
  tag: {
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: layout.borderRadius,
  },
  tagText: {
    fontFamily: fonts.body,
    fontSize: 9,
    color: theme.textMuted,
    letterSpacing: 0.5,
  },
  statCount: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: theme.accentBlue,
  },
  section: {
    alignSelf: 'stretch',
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  tableScroll: {
    width: '100%',
    maxWidth: '100%',
  },
  dataTable: {
    backgroundColor: theme.surface,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    minWidth: 600,
  },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: layout.borderWidth,
    borderBottomColor: theme.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: layout.borderWidth,
    borderBottomColor: theme.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
  },
  cell: {
    width: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellTeam: {
    width: 120,
    alignItems: 'flex-start',
  },
  teamName: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: theme.textPrimary,
  },
  cellValue: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
  },
  categories: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.md,
    marginTop: spacing.xl,
    width: '100%',
  },
  categoryCard: {
    flex: 1,
    minWidth: 200,
    maxWidth: 280,
    backgroundColor: theme.surface,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    padding: spacing.md,
  },
  categoryTitle: {
    fontFamily: fonts.display,
    fontSize: 14,
    color: theme.textPrimary,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  categoryItem: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textMuted,
    lineHeight: 18,
  },
});
