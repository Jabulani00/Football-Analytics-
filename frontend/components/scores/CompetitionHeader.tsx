import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import type { CompetitionGroup } from '@/services/oddAlerts';
import { fonts, layout, spacing, theme } from '@/styles/theme';
import { countryFlag } from '@/utils/countryFlags';

type CompetitionHeaderProps = {
  group: CompetitionGroup;
  onPress?: () => void;
};

export default function CompetitionHeader({ group, onPress }: CompetitionHeaderProps) {
  const { competition } = group;

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ hovered }) => [
        styles.wrap,
        Platform.OS === 'web' && hovered && onPress ? styles.hover : null,
      ]}>
      <Text style={styles.flag}>{countryFlag(competition.country)}</Text>
      <View style={styles.text}>
        <Text style={styles.country} numberOfLines={1}>
          {competition.country}
        </Text>
        <Text style={styles.name} numberOfLines={1}>
          {competition.name}
        </Text>
      </View>
      {competition.isCup ? <Text style={styles.tag}>CUP</Text> : null}
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
    ...(Platform.OS === 'web' ? ({ cursor: 'default' } as object) : {}),
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
  tag: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 9,
    color: theme.textMuted,
    letterSpacing: 0.5,
    backgroundColor: theme.surface,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
});
