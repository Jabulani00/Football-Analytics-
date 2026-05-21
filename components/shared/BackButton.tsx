import { Pressable, StyleSheet, Text } from 'react-native';

import { fonts, layout, spacing, theme } from '@/styles/theme';

type BackButtonProps = {
  label: string;
  onPress: () => void;
};

export default function BackButton({ label, onPress }: BackButtonProps) {
  return (
    <Pressable onPress={onPress} style={styles.btn} accessibilityRole="button">
      {({ pressed }) => (
        <Text style={[styles.text, pressed && styles.textHover]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  text: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    color: theme.textMuted,
    letterSpacing: layout.sectionLabelSpacing,
    textTransform: 'uppercase',
  },
  textHover: {
    color: theme.textPrimary,
  },
});
