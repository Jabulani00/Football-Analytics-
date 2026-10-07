import { useMemo, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';

import { fonts, layout, spacing, theme } from '@/styles/theme';

export type FilterOption = { value: string; label: string };

type Props = {
  label: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
  style?: StyleProp<ViewStyle>;
  /** Shown when `value` matches no option. Defaults to "All". */
  emptyLabel?: string;
};

export default function FilterDropdown({ label, value, options, onChange, style, emptyLabel = 'All' }: Props) {
  const narrow = useWindowDimensions().width < 720;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = options.find((opt) => opt.value === value);
  const searchable = options.length > 12;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((opt) => opt.label.toLowerCase().includes(q));
  }, [options, query]);

  return (
    <View style={[styles.field, style, narrow && styles.fieldNarrow]}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        onPress={() => {
          setQuery('');
          setOpen(true);
        }}
        style={({ pressed, hovered }) => [
          styles.control,
          narrow && styles.controlNarrow,
          (pressed || (Platform.OS === 'web' && hovered)) && styles.controlHover,
        ]}>
        <Text style={styles.value} numberOfLines={1}>
          {selected?.label ?? emptyLabel}
        </Text>
        <Text style={styles.chevron}>▾</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={[styles.modal, narrow && styles.modalNarrow]}>
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
          <View style={[styles.sheet, narrow && styles.sheetNarrow]}>
            {narrow ? <View style={styles.handle} /> : null}
            <Text style={styles.sheetTitle}>{label}</Text>
            {searchable ? (
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search…"
                placeholderTextColor={theme.textMuted}
                style={[styles.search, narrow && styles.searchNarrow]}
                autoCorrect={false}
                autoCapitalize="none"
              />
            ) : null}
            <ScrollView style={[styles.list, narrow && styles.listNarrow]} keyboardShouldPersistTaps="handled">
              {shown.length === 0 ? (
                <Text style={styles.empty}>No matches</Text>
              ) : (
                shown.map((opt) => {
                  const active = opt.value === value;
                  return (
                    <Pressable
                      key={opt.value || '__all'}
                      onPress={() => {
                        onChange(opt.value);
                        setOpen(false);
                      }}
                      style={({ pressed }) => [
                        styles.option,
                        narrow && styles.optionNarrow,
                        active && styles.optionActive,
                        pressed && styles.optionPressed,
                      ]}>
                      <Text style={[styles.optionText, active && styles.optionTextActive]} numberOfLines={2}>
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    minWidth: 160,
    flexGrow: 1,
    flexBasis: 160,
  },
  label: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    color: theme.textMuted,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  fieldNarrow: {
    width: '100%',
    minWidth: 0,
    maxWidth: '100%',
    flexBasis: 'auto',
    flexGrow: 0,
  },
  control: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    borderWidth: layout.borderWidth,
    borderColor: theme.borderStrong,
    borderRadius: layout.borderRadius,
    backgroundColor: theme.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : {}),
  },
  controlNarrow: {
    minHeight: 48,
  },
  controlHover: {
    borderColor: theme.accentGreen,
  },
  value: {
    flex: 1,
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    color: theme.textPrimary,
  },
  chevron: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textMuted,
  },
  modal: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalNarrow: {
    justifyContent: 'flex-end',
    padding: 0,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
  },
  sheet: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '70%',
    backgroundColor: theme.surface,
    borderRadius: layout.borderRadius,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    padding: spacing.md,
    zIndex: 1,
  },
  sheetNarrow: {
    maxWidth: '100%',
    maxHeight: '85%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    paddingBottom: spacing.xl,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.borderStrong,
    marginBottom: spacing.sm,
  },
  sheetTitle: {
    fontFamily: fonts.displaySemi,
    fontSize: 16,
    color: theme.textPrimary,
    marginBottom: spacing.sm,
  },
  search: {
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    fontFamily: fonts.body,
    fontSize: 14,
    color: theme.textPrimary,
    marginBottom: spacing.sm,
  },
  searchNarrow: {
    minHeight: 48,
    fontSize: 16,
  },
  list: {
    flexGrow: 0,
    maxHeight: 320,
  },
  listNarrow: {
    maxHeight: 520,
  },
  option: {
    paddingVertical: 10,
    paddingHorizontal: spacing.sm,
    borderRadius: layout.borderRadius,
  },
  optionNarrow: {
    minHeight: 48,
    justifyContent: 'center',
  },
  optionActive: {
    backgroundColor: '#ECFDF5',
  },
  optionPressed: {
    backgroundColor: theme.surfaceMuted,
  },
  optionText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: theme.textPrimary,
  },
  optionTextActive: {
    fontFamily: fonts.bodySemiBold,
    color: theme.accentGreen,
  },
  empty: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: theme.textMuted,
    padding: spacing.sm,
  },
});
