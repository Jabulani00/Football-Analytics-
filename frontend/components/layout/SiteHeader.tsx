import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useScoresFilter, type StatusFilter } from '@/components/layout/ScoresFilterContext';
import { fonts, layout, spacing, theme } from '@/styles/theme';
import { formatTopBarDate, parseDateKey } from '@/utils/dates';

const FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'live', label: 'LIVE' },
  { id: 'ft', label: 'Finished' },
  { id: 'ns', label: 'Scheduled' },
];

type SiteHeaderProps = {
  showFilters?: boolean;
};

export default function SiteHeader({ showFilters = true }: SiteHeaderProps) {
  const router = useRouter();
  const { selectedDate, statusFilter, setStatusFilter } = useScoresFilter();

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Pressable onPress={() => router.push('/')} style={styles.logoWrap}>
          <View style={styles.logoDot} />
          <Text style={styles.logo}>SCORELINE</Text>
        </Pressable>
        <Text style={styles.date}>{formatTopBarDate(parseDateKey(selectedDate))}</Text>
        <Pressable onPress={() => router.push('/analytics')} style={styles.analyticsLink}>
          <Text style={styles.analyticsText}>Analytics</Text>
        </Pressable>
      </View>
      {showFilters ? (
        <View style={styles.filters}>
          {FILTERS.map((f) => {
            const active = statusFilter === f.id;
            return (
              <Pressable
                key={f.id}
                onPress={() => setStatusFilter(f.id)}
                style={[styles.filterChip, active && styles.filterActive]}>
                <Text style={[styles.filterText, active && styles.filterTextActive, f.id === 'live' && styles.liveText]}>
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
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
    height: layout.headerHeight,
    gap: spacing.md,
  },
  logoWrap: {
    flexDirection: 'row',
    alignItems: 'center',
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
  analyticsLink: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  analyticsText: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: theme.textFaint,
  },
  filters: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    flexWrap: 'wrap',
  },
  filterChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 4,
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
});
