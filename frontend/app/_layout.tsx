import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function RootLayout() {
  return (
    <SafeAreaProvider style={styles.provider}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: styles.stackContent,
          animation: 'fade',
        }}
      />
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  provider: {
    flex: 1,
    width: '100%',
  },
  stackContent: {
    flex: 1,
    backgroundColor: '#F1F5F9',
  },
});
