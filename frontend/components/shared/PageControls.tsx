import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { fonts, spacing, theme } from '@/styles/theme';

export const PAGE_SIZE = 20;

export default function PageControls({
  page,
  pages,
  total,
  from,
  to,
  onChange,
}: {
  page: number;
  pages: number;
  total: number;
  from: number;
  to: number;
  onChange: (page: number) => void;
}) {
  if (pages <= 1) return null;
  const label = total === 0 ? 'None' : `${from}–${to} of ${total} · Page ${page} of ${pages}`;
  return (
    <View style={styles.bar} {...(Platform.OS === 'web' ? { dataSet: { nodrag: '1' } } : {})}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Previous page"
        style={[styles.button, page <= 1 && styles.buttonOff]}
        onPress={() => page > 1 && onChange(page - 1)}>
        <Text style={styles.buttonText}>Previous</Text>
      </Pressable>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Next page"
        style={[styles.button, page >= pages && styles.buttonOff]}
        onPress={() => page < pages && onChange(page + 1)}>
        <Text style={styles.buttonText}>Next</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    width: '100%',
    maxWidth: 720,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  button: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: 8,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonOff: { opacity: 0.35 },
  buttonText: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: '#FFFFFF' },
  label: {
    flex: 1,
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: theme.textPrimary,
    textAlign: 'center',
  },
});
