import { Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useRouter, type Href } from 'expo-router';

import AppNavMenu from '@/components/layout/AppNavMenu';

import {
  useScoresFilter,
  type StatusFilter,
  type UpcomingScope,
} from '@/components/layout/ScoresFilterContext';
import type { FixtureKind, Gender } from '@/services/oddAlerts';
import { fonts, layout, spacing, theme } from '@/styles/theme';
import { formatTopBarDate } from '@/utils/dates';

type HeaderFilter =
  | { id: 'favorites'; label: string; status: 'ns'; scope: UpcomingScope }
  | { id: 'ns'; label: string; status: 'ns'; scope: UpcomingScope }
  | { id: StatusFilter; label: string; status: StatusFilter; scope?: undefined };

const FILTERS: HeaderFilter[] = [
  { id: 'favorites', label: 'Favourites', status: 'ns', scope: 'popular' },
  { id: 'ns', label: 'Fixtures', status: 'ns', scope: 'all' },
  { id: 'live', label: 'LIVE', status: 'live' },
  { id: 'ft', label: 'Results', status: 'ft' },
  { id: 'all', label: 'All', status: 'all' },
];

const KINDS: { id: FixtureKind; label: string }[] = [
  { id: 'club', label: 'Clubs' },
  { id: 'country', label: 'Countries' },
];

const GENDERS: { id: Gender; label: string }[] = [
  { id: 'men', label: 'Men' },
  { id: 'women', label: 'Women' },
];

type SiteHeaderProps = {
  showFilters?: boolean;
};

export default function SiteHeader({ showFilters = true }: SiteHeaderProps) {
  const narrow = useWindowDimensions().width < 720;
  const router = useRouter();
  const {
    statusFilter,
    setStatusFilter,
    upcomingScope,
    setUpcomingScope,
    kind,
    setKind,
    gender,
    setGender,
    setCompetitionId,
    setPanelMode,
  } = useScoresFilter();

  const isFilterActive = (f: HeaderFilter) => {
    if (f.scope != null) {
      return statusFilter === 'ns' && upcomingScope === f.scope;
    }
    return statusFilter === f.status;
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Pressable onPress={() => router.push('/')} style={styles.logoWrap}>
          <View style={styles.logoDot} />
          <Text style={styles.logo}>SCORELINE</Text>
        </Pressable>
        <Text style={[styles.date, narrow && styles.dateNarrow]} numberOfLines={1}>
          {formatTopBarDate(new Date())}
        </Text>
        {narrow ? (
          <View style={styles.menuSlot}>
            <AppNavMenu />
          </View>
        ) : (
          <View style={styles.nav}>
            <Pressable onPress={() => router.push('/analytics')} style={styles.analyticsLink}>
              <Text style={styles.analyticsText}>Analytics</Text>
            </Pressable>
            <Pressable onPress={() => router.push('/sl-stats' as Href)} style={styles.analyticsLink}>
              <Text style={styles.analyticsText}>SL-STATS</Text>
            </Pressable>
            <Pressable onPress={() => router.push('/additional-stats' as Href)} style={styles.analyticsLink}>
              <Text style={styles.analyticsText}>Additional</Text>
            </Pressable>
          </View>
        )}
      </View>

      {showFilters ? (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filterScroll}
            contentContainerStyle={styles.filters}>
            {FILTERS.map((f) => {
              const active = isFilterActive(f);
              return (
                <Pressable
                  key={f.id}
                  onPress={() => {
                    setStatusFilter(f.status);
                    if (f.scope != null) setUpcomingScope(f.scope);
                    setPanelMode('scores');
                  }}
                  style={[styles.filterChip, active && styles.filterActive]}>
                  <Text
                    style={[
                      styles.filterText,
                      active && styles.filterTextActive,
                      f.id === 'live' && styles.liveText,
                    ]}>
                    {f.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={[styles.segments, narrow && styles.segmentsNarrow]}>
            <View style={[styles.segment, narrow && styles.segmentGrow]}>
              {KINDS.map((k) => {
                const active = kind === k.id;
                return (
                  <Pressable
                    key={k.id}
                    onPress={() => {
                      setKind(k.id);
                      setCompetitionId(null);
                      setPanelMode('scores');
                    }}
                    style={[styles.segBtn, narrow && styles.segBtnGrow, active && styles.segBtnActive]}>
                    <Text style={[styles.segText, active && styles.segTextActive]}>{k.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={[styles.segment, narrow && styles.segmentGrow]}>
              {GENDERS.map((g) => {
                const active = gender === g.id;
                return (
                  <Pressable
                    key={g.id}
                    onPress={() => {
                      setGender(g.id);
                      setCompetitionId(null);
                      setPanelMode('scores');
                    }}
                    style={[styles.segBtn, narrow && styles.segBtnGrow, active && styles.segBtnActive]}>
                    <Text style={[styles.segText, active && styles.segTextActive]}>{g.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: theme.surface,
    borderBottomWidth: layout.borderWidth,
    borderBottomColor: theme.border,
    width: '100%',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    minHeight: layout.headerHeight,
    gap: spacing.sm,
  },
  menuSlot: {
    flexShrink: 0,
  },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
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
    marginLeft: 'auto',
  },
  dateNarrow: {
    flexShrink: 1,
    fontSize: 11,
    marginRight: spacing.sm,
  },
  analyticsLink: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  analyticsText: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: theme.textFaint,
  },
  filterScroll: {
    flexGrow: 0,
  },
  filters: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  filterChip: {
    minHeight: 40,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    borderRadius: 999,
  },
  filterActive: {
    backgroundColor: theme.surfaceMuted,
  },
  filterText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: theme.textMuted,
  },
  filterTextActive: {
    color: theme.textPrimary,
    fontFamily: fonts.bodySemiBold,
  },
  liveText: {
    color: theme.live,
  },
  segments: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    flexWrap: 'wrap',
  },
  segmentsNarrow: {
    flexWrap: 'nowrap',
  },
  segment: {
    flexDirection: 'row',
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    overflow: 'hidden',
  },
  segmentGrow: {
    flex: 1,
  },
  segBtn: {
    minHeight: 40,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.surface,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : {}),
  },
  segBtnGrow: {
    flex: 1,
    paddingHorizontal: spacing.sm,
  },
  segBtnActive: {
    backgroundColor: theme.accentGreen,
  },
  segText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: theme.textMuted,
    textAlign: 'center',
  },
  segTextActive: {
    color: theme.surface,
    fontFamily: fonts.bodySemiBold,
  },
});
