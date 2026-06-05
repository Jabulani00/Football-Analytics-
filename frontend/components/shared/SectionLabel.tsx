import { StyleSheet, Text, type TextProps } from 'react-native';

import { fonts, layout, theme } from '@/styles/theme';

export default function SectionLabel({ style, ...props }: TextProps) {
  return <Text style={[styles.label, style]} {...props} />;
}

const styles = StyleSheet.create({
  label: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    color: theme.textMuted,
    letterSpacing: layout.sectionLabelSpacing,
    textTransform: 'uppercase',
  },
});
