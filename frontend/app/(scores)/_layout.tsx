import { Stack } from 'expo-router';
import { StyleSheet } from 'react-native';

import FlashscoreShell from '@/components/layout/FlashscoreShell';

export default function ScoresLayout() {
  return (
    <FlashscoreShell>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: styles.screen,
          animation: 'fade',
        }}
      />
    </FlashscoreShell>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
