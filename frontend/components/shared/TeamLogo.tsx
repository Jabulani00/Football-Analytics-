import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { fetchTeamBadge } from '@/services/logos';
import { fonts, theme } from '@/styles/theme';

type TeamLogoProps = {
  name: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
};

function initials(name: string): string {
  const parts = name
    .replace(/\s+W$/, '')
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Club badge from TheSportsDB, with an initials monogram fallback. */
export default function TeamLogo({ name, size = 20, style }: TeamLogoProps) {
  const [badge, setBadge] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setBadge(null);
    fetchTeamBadge(name).then((url) => {
      if (active) setBadge(url);
    });
    return () => {
      active = false;
    };
  }, [name]);

  if (badge) {
    return (
      <Image
        source={{ uri: badge }}
        style={[{ width: size, height: size }, style] as never}
        contentFit="contain"
        transition={150}
        accessibilityLabel={`${name} logo`}
      />
    );
  }

  return (
    <View
      style={[styles.fallback, { width: size, height: size, borderRadius: size / 2 }, style]}
      accessibilityLabel={`${name} logo`}>
      <Text style={[styles.initials, { fontSize: Math.max(8, size * 0.4) }]} numberOfLines={1}>
        {initials(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: theme.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.border,
  },
  initials: {
    fontFamily: fonts.bodySemiBold,
    color: theme.textMuted,
  },
});
