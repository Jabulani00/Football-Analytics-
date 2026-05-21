import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#F4F6FA' },
          animation: 'fade',
        }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="analytics/index" />
        <Stack.Screen name="league/[id]" />
        <Stack.Screen name="match/[id]" />
        <Stack.Screen name="team/[slug]" />
      </Stack>
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}
