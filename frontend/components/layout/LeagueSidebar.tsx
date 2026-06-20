import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';

import { useScoresFilter } from '@/components/layout/ScoresFilterContext';
import CountryFlag from '@/components/shared/CountryFlag';
import {
  clubCompetitionsByCountry,
  fetchAllCompetitions,
  fetchCountries,
  type Competition,
} from '@/services/oddAlerts';
import { fonts, layout, spacing, theme } from '@/styles/theme';
import { countryFlag } from '@/utils/countryFlags';

export default function LeagueSidebar() {
  const { kind } = useScoresFilter();
  // National-team tournaments keep the feed-driven list; club football gets the
  // Country -> Leagues/Cups -> standings browser.
  return kind === 'country' ? <FeedCompetitionList /> : <CountryBrowser />;
}

// ===== Country -> Leagues/Cups browser (Clubs) ============================

type CountryEntry = { id: number; country: string; leagues: Competition[]; cups: Competition[] };

function CountryBrowser() {
  const {
    expandedCountryId,
    setExpandedCountryId,
    selectedCompetition,
    openStandings,
  } = useScoresFilter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;

  const [comps, setComps] = useState<Competition[]>([]);
  const [codeById, setCodeById] = useState<Map<number, string | null>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let active = true;
    fetchAllCompetitions()
      .then((c) => {
        if (active) {
          setComps(c);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setError(true);
          setLoading(false);
        }
      });
    fetchCountries()
      .then((countries) => {
        if (active) setCodeById(new Map(countries.map((c) => [c.id, c.code])));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const countries = useMemo<CountryEntry[]>(() => {
    const map = clubCompetitionsByCountry(comps);
    return [...map.entries()]
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => a.country.localeCompare(b.country));
  }, [comps]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return countries;
    return countries.filter((c) => c.country.toLowerCase().includes(q));
  }, [countries, query]);

  const body = (
    <>
      <View style={styles.searchWrap}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search country…"
          placeholderTextColor={theme.textFaint}
          style={styles.search}
        />
      </View>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.accentGreen} />
        </View>
      ) : error ? (
        <Text style={styles.emptyHint}>Couldn&apos;t load competitions.</Text>
      ) : filtered.length === 0 ? (
        <Text style={styles.emptyHint}>No countries match.</Text>
      ) : (
        filtered.map((entry) => {
          const expanded = expandedCountryId === entry.id;
          const total = entry.leagues.length + entry.cups.length;
          return (
            <View key={entry.id}>
              <Pressable
                onPress={() => setExpandedCountryId(expanded ? null : entry.id)}
                style={({ hovered }) => [
                  styles.countryRow,
                  Platform.OS === 'web' && hovered && styles.itemHover,
                ]}>
                <CountryFlag code={codeById.get(entry.id)} name={entry.country} size={14} />
                <Text style={styles.countryName} numberOfLines={1}>
                  {entry.country}
                </Text>
                <Text style={styles.count}>{total}</Text>
                <Text style={styles.chevron}>{expanded ? '▾' : '▸'}</Text>
              </Pressable>
              {expanded ? (
                <View style={styles.compList}>
                  <CompGroup
                    label="Leagues"
                    comps={entry.leagues}
                    selectedId={selectedCompetition?.id ?? null}
                    onPick={openStandings}
                  />
                  <CompGroup
                    label="Cups"
                    comps={entry.cups}
                    selectedId={selectedCompetition?.id ?? null}
                    onPick={openStandings}
                  />
                </View>
              ) : null}
            </View>
          );
        })
      )}
    </>
  );

  if (!isDesktop) {
    return (
      <View style={styles.mobileWrap}>
        <ScrollView showsVerticalScrollIndicator={false}>{body}</ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.sidebar}>
      <Text style={styles.sidebarTitle}>COUNTRIES</Text>
      <ScrollView showsVerticalScrollIndicator={false}>{body}</ScrollView>
    </View>
  );
}

function CompGroup({
  label,
  comps,
  selectedId,
  onPick,
}: {
  label: string;
  comps: Competition[];
  selectedId: number | null;
  onPick: (c: Competition) => void;
}) {
  if (comps.length === 0) return null;
  return (
    <View style={styles.group}>
      <Text style={styles.groupLabel}>{label}</Text>
      {comps.map((c) => {
        const active = selectedId === c.id;
        return (
          <Pressable
            key={c.id}
            onPress={() => onPick(c)}
            style={({ hovered }) => [
              styles.compItem,
              active && styles.compItemActive,
              Platform.OS === 'web' && hovered && !active && styles.itemHover,
            ]}>
            <Text style={[styles.compName, active && styles.compNameActive]} numberOfLines={1}>
              {c.name}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ===== Feed-driven competition list (national teams) ======================

function FeedCompetitionList() {
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
  mobileWrap: {
    width: '100%',
    maxHeight: 260,
    backgroundColor: theme.surface,
    borderBottomWidth: layout.borderWidth,
    borderBottomColor: theme.border,
  },
  sidebarTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    color: theme.textFaint,
    letterSpacing: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  searchWrap: {
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
  },
  search: {
    backgroundColor: theme.surfaceMuted,
    borderRadius: layout.borderRadius,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textPrimary,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}),
  },
  center: { paddingVertical: spacing.lg, alignItems: 'center' },
  emptyHint: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: theme.textFaint,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  countryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  countryName: {
    flex: 1,
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: theme.textPrimary,
  },
  chevron: {
    fontSize: 11,
    color: theme.textFaint,
  },
  compList: {
    backgroundColor: theme.surfaceMuted,
    paddingBottom: spacing.xs,
  },
  group: {
    paddingTop: spacing.xs,
  },
  groupLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 9,
    color: theme.textFaint,
    letterSpacing: 1,
    textTransform: 'uppercase',
    paddingHorizontal: spacing.lg,
    paddingVertical: 4,
  },
  compItem: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 6,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
  },
  compItemActive: {
    borderLeftColor: theme.accentGreen,
    backgroundColor: theme.surfaceHover,
  },
  compName: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textMuted,
  },
  compNameActive: {
    fontFamily: fonts.bodySemiBold,
    color: theme.textPrimary,
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
