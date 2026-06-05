import { Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { usePathname, useRouter } from 'expo-router';

import { mockLeagues } from '@/mock/leaguesData';
import { fonts, layout, spacing, theme } from '@/styles/theme';

export default function LeagueSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;

  const activeLeagueId = pathname?.match(/\/league\/([^/]+)/)?.[1] ?? null;

  if (!isDesktop) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.mobileScroll}
        contentContainerStyle={styles.mobileStrip}>
        {mockLeagues.map((league) => {
          const active = activeLeagueId === league.id;
          return (
            <Pressable
              key={league.id}
              onPress={() => router.push({ pathname: '/league/[id]', params: { id: league.id } })}
              style={[styles.mobileChip, active && styles.mobileChipActive]}>
              <Text style={styles.mobileFlag}>{league.flag}</Text>
              <Text style={[styles.mobileLabel, active && styles.mobileLabelActive]} numberOfLines={1}>
                {league.regionCode}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    );
  }

  return (
    <View style={styles.sidebar}>
      <Text style={styles.sidebarTitle}>LEAGUES</Text>
      {mockLeagues.map((league) => {
        const active = activeLeagueId === league.id;
        return (
          <Pressable
            key={league.id}
            onPress={() => router.push({ pathname: '/league/[id]', params: { id: league.id } })}
            style={({ hovered }) => [
              styles.item,
              active && styles.itemActive,
              Platform.OS === 'web' && hovered && !active && styles.itemHover,
            ]}>
            <Text style={styles.flag}>{league.flag}</Text>
            <View style={styles.itemText}>
              <Text style={[styles.name, active && styles.nameActive]} numberOfLines={1}>
                {league.name}
              </Text>
              <Text style={styles.country}>{league.country}</Text>
            </View>
            {league.liveCount > 0 ? (
              <View style={styles.liveBadge}>
                <Text style={styles.liveBadgeText}>{league.liveCount}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    width: layout.sidebarWidth,
    backgroundColor: theme.surface,
    borderRightWidth: layout.borderWidth,
    borderRightColor: theme.border,
    paddingVertical: spacing.sm,
    flexShrink: 0,
  },
  sidebarTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    color: theme.textFaint,
    letterSpacing: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
  },
  itemActive: {
    backgroundColor: theme.surfaceMuted,
    borderLeftColor: theme.live,
  },
  itemHover: {
    backgroundColor: theme.surfaceHover,
  },
  flag: {
    fontSize: 18,
  },
  itemText: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: theme.textPrimary,
  },
  nameActive: {
    fontFamily: fonts.bodySemiBold,
  },
  country: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: theme.textMuted,
  },
  liveBadge: {
    backgroundColor: theme.live,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  liveBadgeText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    color: '#fff',
  },
  mobileScroll: {
    width: '100%',
    flexGrow: 0,
    flexShrink: 0,
    backgroundColor: theme.surface,
    borderBottomWidth: layout.borderWidth,
    borderBottomColor: theme.border,
  },
  mobileStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  mobileChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    backgroundColor: theme.bg,
    flexShrink: 0,
  },
  mobileChipActive: {
    borderColor: theme.live,
    backgroundColor: theme.surfaceMuted,
  },
  mobileFlag: {
    fontSize: 14,
  },
  mobileLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    color: theme.textMuted,
  },
  mobileLabelActive: {
    color: theme.textPrimary,
    fontFamily: fonts.bodySemiBold,
  },
});
