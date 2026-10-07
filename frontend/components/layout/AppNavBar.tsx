import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { usePathname, useRouter, type Href } from 'expo-router';

import { fonts, layout, spacing, theme } from '@/styles/theme';
import { formatTopBarDate } from '@/utils/dates';

const NAV: { href: Href; label: string; match: string }[] = [
  { href: '/', label: 'Scores', match: '/' },
  { href: '/analytics', label: 'Analytics', match: '/analytics' },
  { href: '/sl-stats', label: 'SL-STATS', match: '/sl-stats' },
  { href: '/additional-stats', label: 'Additional', match: '/additional-stats' },
  { href: '/stats-ordinary', label: 'Ordinary', match: '/stats-ordinary' },
  { href: '/full-time-stats', label: 'FT-Only', match: '/full-time-stats' },
];

function navActive(pathname: string, match: string): boolean {
  if (match === '/') return pathname === '/' || pathname === '' || pathname === '/index';
  return pathname === match || pathname.startsWith(`${match}/`);
}

/** SCORELINE, the six pages, and the date. Stays put above the scrolling page. */
export default function AppNavBar({ bordered = true }: { bordered?: boolean }) {
  const stacked = useWindowDimensions().width < 1100;
  const pathname = usePathname();
  const router = useRouter();

  const links = (
    <View style={[styles.nav, stacked ? styles.navStacked : styles.navInline]}>
      {NAV.map((item) => {
        const active = navActive(pathname, item.match);
        return (
          <Pressable
            key={item.match}
            accessibilityRole="link"
            accessibilityState={{ selected: active }}
            onPress={() => router.push(item.href)}
            style={[styles.navLink, active && styles.navLinkOn]}>
            <Text style={[styles.navText, active && styles.navTextOn]} numberOfLines={1}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <View style={[styles.wrap, bordered && styles.bordered]}>
      <View style={styles.row}>
        <Pressable onPress={() => router.push('/')} style={styles.logoWrap} accessibilityRole="link" accessibilityLabel="Scoreline home">
          <View style={styles.logoDot} />
          <Text style={styles.logo}>SCORELINE</Text>
        </Pressable>
        {stacked ? null : links}
        <Text style={[styles.date, stacked && styles.dateEnd]} numberOfLines={1}>
          {formatTopBarDate(new Date())}
        </Text>
      </View>
      {stacked ? links : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: theme.surface,
    width: '100%',
    zIndex: 20,
  },
  bordered: {
    borderBottomWidth: layout.borderWidth,
    borderBottomColor: theme.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    minHeight: layout.headerHeight,
    gap: spacing.sm,
    width: '100%',
  },
  nav: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 4,
    minWidth: 0,
  },
  navInline: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  navStacked: {
    width: '100%',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    justifyContent: 'flex-start',
  },
  navLink: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : {}),
  },
  navLinkOn: {
    backgroundColor: theme.surfaceMuted,
  },
  navText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: theme.textMuted,
  },
  navTextOn: {
    fontFamily: fonts.bodySemiBold,
    color: theme.textPrimary,
  },
  logoWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: spacing.sm,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : {}),
  },
  logoDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.live,
  },
  logo: {
    fontFamily: fonts.display,
    fontSize: 18,
    color: theme.textPrimary,
    letterSpacing: 1,
  },
  date: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textMuted,
    flexShrink: 1,
  },
  dateEnd: {
    marginLeft: 'auto',
    fontSize: 11,
  },
});
