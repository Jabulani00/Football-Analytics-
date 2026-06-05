import { Platform } from 'react-native';

import { theme } from '@/styles/theme';

type ElevationLevel = 1 | 2 | 3;

const PRESETS: Record<ElevationLevel, { y: number; blur: number; elevation: number }> = {
  1: { y: 1, blur: 4, elevation: 1 },
  2: { y: 2, blur: 8, elevation: 2 },
  3: { y: 4, blur: 12, elevation: 3 },
};

/** Cross-platform card shadow (boxShadow on web, shadow* on native). */
export function cardElevation(level: ElevationLevel = 1) {
  const { y, blur, elevation } = PRESETS[level];
  if (Platform.OS === 'web') {
    return {
      boxShadow: `0px ${y}px ${blur}px ${theme.shadow}`,
    } as const;
  }
  return {
    shadowColor: theme.shadow,
    shadowOffset: { width: 0, height: y },
    shadowOpacity: 1,
    shadowRadius: blur,
    elevation,
  };
}
