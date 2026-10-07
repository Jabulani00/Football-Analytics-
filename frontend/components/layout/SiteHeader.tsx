import { Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import AppNavBar from '@/components/layout/AppNavBar';

import {
  useScoresFilter,
  type StatusFilter,
  type UpcomingScope,
} from '@/components/layout/ScoresFilterContext';
import type { FixtureKind, Gender } from '@/services/oddAlerts';
import { fonts, layout, spacing, theme } from '@/styles/theme';

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
      <AppNavBar bordered={false} />

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
