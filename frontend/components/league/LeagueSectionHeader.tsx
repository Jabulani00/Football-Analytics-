import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import type { League } from '@/mock/leaguesData';
import { fonts, layout, spacing, theme } from '@/styles/theme';

type LeagueSectionHeaderProps = {
  league: League;
  onPress: () => void;
};

export default function LeagueSectionHeader({ league, onPress }: LeagueSectionHeaderProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ hovered }) => [
        styles.wrap,
        Platform.OS === 'web' && hovered && styles.hover,
      ]}>
      <Text style={styles.flag}>{league.flag}</Text>
      <View style={styles.text}>
        <Text style={styles.country}>{league.country}</Text>
        <Text style={styles.name}>{league.name}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    backgroundColor: theme.surfaceMuted,
    borderTopWidth: layout.borderWidth,
    borderTopColor: theme.border,
    borderBottomWidth: layout.borderWidth,
    borderBottomColor: theme.border,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : {}),
  },
  hover: {
    backgroundColor: theme.surfaceHover,
  },
  flag: {
    fontSize: 16,
  },
  text: {
    flex: 1,
  },
  country: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: theme.textMuted,
    textTransform: 'uppercase',
  },
  name: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: theme.textPrimary,
  },
  chevron: {
    fontFamily: fonts.body,
    fontSize: 18,
    color: theme.textFaint,
  },
});
