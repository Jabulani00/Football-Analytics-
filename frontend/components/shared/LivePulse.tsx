import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { theme } from '@/styles/theme';

type LivePulseProps = {
  size?: number;
};

export default function LivePulse({ size = 8 }: LivePulseProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale, { toValue: 1.3, duration: 700, useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1, duration: 700, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        ]),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [opacity, scale]);

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Animated.View
        style={[
          styles.ring,
          {
            width: size * 2.2,
            height: size * 2.2,
            borderRadius: size * 1.1,
            opacity,
            transform: [{ scale }],
          },
        ]}
      />
      <View style={[styles.dot, { width: size, height: size, borderRadius: size / 2 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    backgroundColor: theme.live,
    position: 'absolute',
  },
  ring: {
    position: 'absolute',
    backgroundColor: theme.live,
  },
});
