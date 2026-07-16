import { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import type { LiveCompetition } from '@/hooks/useLiveCompetitions';
import { fonts, layout, spacing, theme } from '@/styles/theme';

const MAX_SHOWN = 24;

type Props = {
  competitions: LiveCompetition[];
  selectedId: number | null;
  onSelect: (id: number) => void;
};

/**
 * Searchable competition selector. Competitions arrive sorted by activity
 * (see useLiveCompetitions), so with no query the most-active leagues show
 * first; typing filters by name or country across all of them.
 */
export default function CompetitionPicker({ competitions, selectedId, onSelect }: Props) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    const base = q
      ? competitions.filter(
          (c) => c.name.toLowerCase().includes(q) || c.country.toLowerCase().includes(q),
        )
      : competitions;
    return base.slice(0, MAX_SHOWN);
  }, [competitions, q]);

  // Keep the selected competition visible even when filtered out.
  const selected = competitions.find((c) => c.id === selectedId);
  const list =
    selected && !filtered.some((c) => c.id === selectedId) ? [selected, ...filtered] : filtered;

  const overflow = !q && competitions.length > MAX_SHOWN ? competitions.length - MAX_SHOWN : 0;

  return (
    <View style={styles.wrap}>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={`Search ${competitions.length} competitions…`}
        placeholderTextColor={theme.textMuted}
        style={styles.search}
        autoCorrect={false}
        autoCapitalize="none"
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={Platform.OS === 'web'}
        contentContainerStyle={styles.row}>
        {list.map((c) => {
          const active = c.id === selectedId;
          return (
            <Pressable
              key={c.id}
              onPress={() => onSelect(c.id)}
              style={({ pressed, hovered }) => [
                styles.chip,
                active && styles.chipActive,
                (pressed || (Platform.OS === 'web' && hovered)) && styles.chipHover,
              ]}>
              <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
                {c.name}
              </Text>
              <Text style={styles.chipSub} numberOfLines={1}>
                {c.country}
              </Text>
            </Pressable>
          );
        })}
        {overflow > 0 ? (
          <View style={styles.moreHint}>
            <Text style={styles.moreText}>+{overflow} more · search ↑</Text>
          </View>
        ) : null}
        {q && list.length === 0 ? (
          <View style={styles.moreHint}>
            <Text style={styles.moreText}>No match</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', maxWidth: 720, marginBottom: spacing.md },
  search: {
    width: '100%',
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    backgroundColor: theme.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
    fontFamily: fonts.body,
    fontSize: 13,
    color: theme.textPrimary,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' as unknown as undefined } : null),
  },
  row: { gap: spacing.sm, paddingBottom: spacing.sm, flexGrow: 1 },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    backgroundColor: theme.surface,
    minWidth: 96,
  },
  chipActive: { borderColor: theme.accentGreen },
  chipHover: { borderColor: theme.textMuted },
  chipText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: theme.textPrimary },
  chipTextActive: { color: theme.accentGreen },
  chipSub: { fontFamily: fonts.body, fontSize: 10, color: theme.textMuted, marginTop: 1 },
  moreHint: { justifyContent: 'center', paddingHorizontal: spacing.sm },
  moreText: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted },
});
