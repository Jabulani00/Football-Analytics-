import { Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { useScoresFilter } from '@/components/layout/ScoresFilterContext';
import { fonts, layout, spacing, theme } from '@/styles/theme';
import { countryFlag } from '@/utils/countryFlags';

export default function LeagueSidebar() {
  const { competitions, competitionId, setCompetitionId, kind } = useScoresFilter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;

  const liveCount = (id: number) =>
    competitions
      .find((g) => g.competition.id === id)
      ?.fixtures.filter((f) => f.status === 'LIVE' || f.status === 'HT').length ?? 0;

  if (!isDesktop) {
    if (competitions.length === 0) return null;
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.mobileScroll}
        contentContainerStyle={styles.mobileStrip}>
        {competitions.map((group) => {
          const active = competitionId === group.competition.id;
          return (
            <Pressable
              key={group.key}
              onPress={() => setCompetitionId(active ? null : group.competition.id)}
              style={[styles.mobileChip, active && styles.mobileChipActive]}>
              <Text style={styles.mobileFlag}>{countryFlag(group.competition.country)}</Text>
              <Text style={[styles.mobileLabel, active && styles.mobileLabelActive]} numberOfLines={1}>
                {group.competition.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    );
  }

  return (
    <View style={styles.sidebar}>
      <Text style={styles.sidebarTitle}>{kind === 'country' ? 'TOURNAMENTS' : 'COMPETITIONS'}</Text>
      <ScrollView showsVerticalScrollIndicator={false}>
        {competitions.length === 0 ? (
          <Text style={styles.emptyHint}>No competitions loaded.</Text>
        ) : (
          competitions.map((group) => {
            const active = competitionId === group.competition.id;
            const live = liveCount(group.competition.id);
            return (
              <Pressable
                key={group.key}
                onPress={() => setCompetitionId(active ? null : group.competition.id)}
                style={({ hovered }) => [
                  styles.item,
                  active && styles.itemActive,
                  Platform.OS === 'web' && hovered && !active && styles.itemHover,
                ]}>
                <Text style={styles.flag}>{countryFlag(group.competition.country)}</Text>
                <View style={styles.itemText}>
                  <Text style={[styles.name, active && styles.nameActive]} numberOfLines={1}>
                    {group.competition.name}
                  </Text>
                  <Text style={styles.country} numberOfLines={1}>
                    {group.competition.country}
                  </Text>
                </View>
                {live > 0 ? (
                  <View style={styles.liveBadge}>
                    <Text style={styles.liveBadgeText}>{live}</Text>
                  </View>
                ) : (
                  <Text style={styles.count}>{group.fixtures.length}</Text>
                )}
              </Pressable>
            );
          })
        )}
      </ScrollView>
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
  emptyHint: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: theme.textFaint,
    paddingHorizontal: spacing.md,
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
  count: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    color: theme.textFaint,
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
    maxWidth: 160,
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
