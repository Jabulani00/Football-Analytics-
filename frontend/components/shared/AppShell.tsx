import { ActivityIndicator, Platform, StyleSheet, View, type ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import GrainOverlay from '@/components/shared/GrainOverlay';
import { useAppFonts } from '@/hooks/use-app-fonts';
import { theme } from '@/styles/theme';

type AppShellProps = ViewProps & {
  children: React.ReactNode;
};

/** Full-viewport shell — content spans full screen width. */
export default function AppShell({ children, style, ...rest }: AppShellProps) {
  const insets = useSafeAreaInsets();
  const [fontsLoaded] = useAppFonts();

  if (!fontsLoaded) {
    return (
      <View style={[styles.root, styles.loading, { paddingTop: insets.top }]}>
        <ActivityIndicator color={theme.accentGreen} size="large" />
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} {...rest}>
      <GrainOverlay />
      <View style={[styles.content, style]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.bg,
    width: '100%',
    minHeight: Platform.OS === 'web' ? ('100vh' as unknown as number) : undefined,
  },
  loading: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    width: '100%',
  },
});
