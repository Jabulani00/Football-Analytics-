import { Platform, StyleSheet, View } from 'react-native';

const GRAIN_STYLE =
  Platform.OS === 'web'
    ? {
        ...StyleSheet.absoluteFillObject,
        opacity: 0.02,
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        zIndex: 1,
        pointerEvents: 'none' as const,
      }
    : null;

export default function GrainOverlay() {
  if (!GRAIN_STYLE) return null;
  return <View style={GRAIN_STYLE} />;
}
