import { useEffect } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { usePathname } from 'expo-router';

import LeagueSidebar from '@/components/layout/LeagueSidebar';
import { ScoresFilterProvider } from '@/components/layout/ScoresFilterContext';
import SiteHeader from '@/components/layout/SiteHeader';
import { useAppFonts } from '@/hooks/use-app-fonts';
import { fetchCountries } from '@/services/oddAlerts';
import { layout, theme } from '@/styles/theme';

type FlashscoreShellProps = {
  children: React.ReactNode;
};

const WEB_SHELL_HEIGHT =
  Platform.OS === 'web' ? ({ height: '100%', minHeight: '100vh' } as object) : {};

export default function FlashscoreShell({ children }: FlashscoreShellProps) {
  const [fontsLoaded] = useAppFonts();
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const isHome = pathname === '/' || pathname === '';

  // Warm the country code cache so flag images resolve by name anywhere.
  useEffect(() => {
    fetchCountries().catch(() => {});
  }, []);

  if (!fontsLoaded) {
    return (
      <View style={[styles.loading, WEB_SHELL_HEIGHT]}>
        <ActivityIndicator color={theme.accentGreen} size="large" />
      </View>
    );
  }

  return (
    <ScoresFilterProvider>
      <View style={[styles.root, WEB_SHELL_HEIGHT]}>
        <SiteHeader showFilters={isHome} />
        <View style={[styles.body, !isDesktop && styles.bodyMobile]}>
          {/* On mobile the sidebar only makes sense on the scores/home screen;
              detail pages (match, team) get the full width. */}
          {isDesktop || isHome ? <LeagueSidebar /> : null}
          <View style={[styles.main, isDesktop && styles.mainDesktop]}>
            <View style={styles.mainInner}>
              <View style={styles.stack}>{children}</View>
            </View>
          </View>
        </View>
      </View>
    </ScoresFilterProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.bg,
    width: '100%',
    ...(Platform.OS === 'web' ? ({ display: 'flex', flexDirection: 'column' } as object) : {}),
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.bg,
    width: '100%',
  },
  body: {
    flex: 1,
    flexDirection: 'row',
    width: '100%',
    minHeight: 0,
  },
  /** Mobile: league strip on top, scores below (not side-by-side). */
  bodyMobile: {
    flexDirection: 'column',
  },
  main: {
    flex: 1,
    width: '100%',
    minHeight: 0,
  },
  mainDesktop: {
    alignItems: 'center',
  },
  mainInner: {
    width: '100%',
    maxWidth: layout.contentMaxWidth,
    flex: 1,
    minHeight: 0,
  },
  stack: {
    flex: 1,
    width: '100%',
    minHeight: 0,
  },
});
