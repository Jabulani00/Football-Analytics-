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
import { usePathname, useRouter } from 'expo-router';

import { useScoresFilter } from '@/components/layout/ScoresFilterContext';
import CountryFlag from '@/components/shared/CountryFlag';
import {
  clubCompetitionsByCountry,
  detectKind,
  fetchAllCompetitions,
  fetchCountries,
  type Competition,
} from '@/services/oddAlerts';
import { fonts, layout, spacing, theme } from '@/styles/theme';
import { countryFlag } from '@/utils/countryFlags';
import { isGroupStageTournament } from '@/utils/groupStandings';
import {
  hasSeededPopularCountries,
  hasSeededPopularCups,
  hasSeededPopularIntl,
  markPopularCountriesSeeded,
  markPopularCupsSeeded,
  markPopularIntlSeeded,
} from '@/utils/favoritesStorage';
import {
  isPopularCountryName,
  resolvePopularCupIds,
  resolvePopularInternationalIds,
} from '@/utils/popularCompetitions';

export default function LeagueSidebar() {
  const { kind } = useScoresFilter();
  return kind === 'country' ? <FeedCompetitionList /> : <CountryBrowser />;
}

/** Standings live on `/`; leave match/team/stats routes so the table can show. */
function useOpenStandingsNav() {
  const router = useRouter();
  const pathname = usePathname();
  const { openStandings } = useScoresFilter();

  return (competition: Competition) => {
    openStandings(competition);
    const onHome = pathname === '/' || pathname === '' || pathname === '/index';
    if (!onHome) {
      router.replace('/');
    }
  };
}

// ===== Country -> Leagues/Cups browser (Clubs) ============================

type CountryEntry = { id: number; country: string; leagues: Competition[]; cups: Competition[] };

function CountryBrowser() {
  const {
    expandedCountryId,
    setExpandedCountryId,
    selectedCompetition,
    favoriteCompetitionIds,
    toggleFavoriteCompetition,
    isFavoriteCompetition,
    seedFavoriteCompetitions,
    favoriteCountryIds,
    toggleFavoriteCountry,
    isFavoriteCountry,
    seedFavoriteCountries,
  } = useScoresFilter();
  const openStandingsNav = useOpenStandingsNav();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;

  const [comps, setComps] = useState<Competition[]>([]);
  const [codeById, setCodeById] = useState<Map<number, string | null>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState('');
  const [mobileOpen, setMobileOpen] = useState(true);

  useEffect(() => {
    let active = true;
    fetchAllCompetitions()
      .then((c) => {
        if (!active) return;
        setComps(c);
        setLoading(false);
        if (!hasSeededPopularCups()) {
          const cupIds = resolvePopularCupIds(c);
          if (cupIds.length > 0) seedFavoriteCompetitions(cupIds);
          markPopularCupsSeeded();
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
        if (!active) return;
        setCodeById(new Map(countries.map((c) => [c.id, c.code])));
        if (!hasSeededPopularCountries()) {
          const popularCountryIds = countries
            .filter((c) => isPopularCountryName(c.name))
            .map((c) => c.id);
          if (popularCountryIds.length > 0) seedFavoriteCountries(popularCountryIds);
          markPopularCountriesSeeded();
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [seedFavoriteCompetitions, seedFavoriteCountries]);

  const countries = useMemo<CountryEntry[]>(() => {
    const map = clubCompetitionsByCountry(comps);
    return [...map.entries()].map(([id, v]) => ({ id, ...v }));
  }, [comps]);

  const sortedCountries = useMemo(() => {
    const favSet = new Set(favoriteCountryIds);
    return [...countries].sort((a, b) => {
      const fa = favSet.has(a.id) || isPopularCountryName(a.country) ? 0 : 1;
      const fb = favSet.has(b.id) || isPopularCountryName(b.country) ? 0 : 1;
      if (fa !== fb) return fa - fb;
      return a.country.localeCompare(b.country);
    });
  }, [countries, favoriteCountryIds]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sortedCountries;
    return sortedCountries.filter((c) => c.country.toLowerCase().includes(q));
  }, [sortedCountries, query]);

  const favoriteComps = useMemo(() => {
    const byId = new Map(comps.map((c) => [c.id, c]));
    return favoriteCompetitionIds.map((id) => byId.get(id)).filter((c): c is Competition => !!c);
  }, [comps, favoriteCompetitionIds]);

  const pickCompetition = (c: Competition) => {
    openStandingsNav(c);
    setMobileOpen(false);
  };

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

      {favoriteComps.length > 0 ? (
        <View style={styles.group}>
          <Text style={styles.groupLabel}>Favourites</Text>
          {favoriteComps.map((c) => (
            <View key={`fav-${c.id}`} style={styles.favRow}>
              <Pressable
                onPress={() => pickCompetition(c)}
                style={({ hovered }) => [
                  styles.compItem,
                  styles.compItemFlex,
                  selectedCompetition?.id === c.id && styles.compItemActive,
                  Platform.OS === 'web' && hovered && styles.itemHover,
                ]}>
                <Text
                  style={[
                    styles.compName,
                    selectedCompetition?.id === c.id && styles.compNameActive,
                  ]}
                  numberOfLines={1}>
                  {c.name}
                </Text>
                <Text style={styles.compMeta} numberOfLines={1}>
                  {c.country}
                  {c.isCup ? ' · Cup' : ''}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => toggleFavoriteCompetition(c.id)}
                hitSlop={8}
                style={styles.starBtn}
                accessibilityLabel="Remove from favourites">
                <Text style={styles.starOn}>★</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.emptyHint}>Star leagues below to pin them here.</Text>
      )}

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
          const favCountry = isFavoriteCountry(entry.id);
          return (
            <View key={entry.id}>
              <View style={styles.countryRowWrap}>
                <Pressable
                  onPress={() => setExpandedCountryId(expanded ? null : entry.id)}
                  style={({ hovered }) => [
                    styles.countryRow,
                    styles.countryRowFlex,
                    Platform.OS === 'web' && hovered && styles.itemHover,
                  ]}>
                  <CountryFlag code={codeById.get(entry.id)} name={entry.country} size={14} />
                  <Text style={styles.countryName} numberOfLines={1}>
                    {entry.country}
                  </Text>
                  <Text style={styles.count}>{total}</Text>
                  <Text style={styles.chevron}>{expanded ? '▾' : '▸'}</Text>
                </Pressable>
                <Pressable
                  onPress={() => toggleFavoriteCountry(entry.id)}
                  hitSlop={8}
                  style={styles.starBtn}
                  accessibilityLabel={favCountry ? 'Unpin country' : 'Pin country'}>
                  <Text style={favCountry ? styles.starOn : styles.starOff}>
                    {favCountry ? '★' : '☆'}
                  </Text>
                </Pressable>
              </View>
              {expanded ? (
                <View style={styles.compList}>
                  <CompGroup
                    label="Leagues"
                    comps={entry.leagues}
                    selectedId={selectedCompetition?.id ?? null}
                    onPick={pickCompetition}
                    isFavorite={isFavoriteCompetition}
                    onToggleFavorite={toggleFavoriteCompetition}
                  />
                  <CompGroup
                    label="Cups"
                    comps={entry.cups}
                    selectedId={selectedCompetition?.id ?? null}
                    onPick={pickCompetition}
                    isFavorite={isFavoriteCompetition}
                    onToggleFavorite={toggleFavoriteCompetition}
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
    const selectedLabel = selectedCompetition?.name;
    return (
      <View style={styles.mobileWrap}>
        <Pressable onPress={() => setMobileOpen((v) => !v)} style={styles.mobileToggle}>
          <Text style={styles.mobileToggleText} numberOfLines={1}>
            {mobileOpen
              ? 'Hide countries · show fixtures'
              : selectedLabel
                ? `Standings · ${selectedLabel}`
                : 'Browse countries & leagues'}
          </Text>
          <Text style={styles.chevron}>{mobileOpen ? '▾' : '▸'}</Text>
        </Pressable>
        {mobileOpen ? (
          <ScrollView style={styles.mobileScrollBox} showsVerticalScrollIndicator={false}>
            {body}
          </ScrollView>
        ) : null}
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
  isFavorite,
  onToggleFavorite,
}: {
  label: string;
  comps: Competition[];
  selectedId: number | null;
  onPick: (c: Competition) => void;
  isFavorite: (id: number) => boolean;
  onToggleFavorite: (id: number) => void;
}) {
  if (comps.length === 0) return null;
  return (
    <View style={styles.group}>
      <Text style={styles.groupLabel}>{label}</Text>
      {comps.map((c) => {
        const active = selectedId === c.id;
        const fav = isFavorite(c.id);
        return (
          <View key={c.id} style={styles.favRow}>
            <Pressable
              onPress={() => onPick(c)}
              style={({ hovered }) => [
                styles.compItem,
                styles.compItemFlex,
                active && styles.compItemActive,
                Platform.OS === 'web' && hovered && !active && styles.itemHover,
              ]}>
              <Text style={[styles.compName, active && styles.compNameActive]} numberOfLines={1}>
                {c.name}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => onToggleFavorite(c.id)}
              hitSlop={8}
              style={styles.starBtn}
              accessibilityLabel={fav ? 'Remove favourite' : 'Add favourite'}>
              <Text style={fav ? styles.starOn : styles.starOff}>{fav ? '★' : '☆'}</Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

// ===== Feed-driven competition list (national teams) ======================

function FeedCompetitionList() {
  const {
    competitions,
    competitionId,
    setCompetitionId,
    kind,
    favoriteCompetitionIds,
    toggleFavoriteCompetition,
    isFavoriteCompetition,
    seedFavoriteCompetitions,
  } = useScoresFilter();
  const openStandingsNav = useOpenStandingsNav();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;

  const [allComps, setAllComps] = useState<Competition[]>([]);
  useEffect(() => {
    if (kind !== 'country') return;
    fetchAllCompetitions()
      .then((c) => {
        setAllComps(c);
        if (!hasSeededPopularIntl()) {
          const ids = resolvePopularInternationalIds(c);
          if (ids.length > 0) seedFavoriteCompetitions(ids);
          markPopularIntlSeeded();
        }
      })
      .catch(() => {});
  }, [kind, seedFavoriteCompetitions]);

  const groupTournaments = useMemo(
    () =>
      allComps
        .filter((c) => isGroupStageTournament(c.name) && detectKind(c.name) === 'country')
        .sort((a, b) => a.name.localeCompare(b.name)),
    [allComps],
  );

  const orderedCompetitions = useMemo(() => {
    const fav = new Set(favoriteCompetitionIds);
    return [...competitions].sort((a, b) => {
      const fa = fav.has(a.competition.id) ? 0 : 1;
      const fb = fav.has(b.competition.id) ? 0 : 1;
      if (fa !== fb) return fa - fb;
      return a.competition.name.localeCompare(b.competition.name);
    });
  }, [competitions, favoriteCompetitionIds]);

  const favoriteIntl = useMemo(() => {
    const byId = new Map(allComps.map((c) => [c.id, c]));
    return favoriteCompetitionIds
      .map((id) => byId.get(id))
      .filter((c): c is Competition => !!c && detectKind(c.name) === 'country');
  }, [allComps, favoriteCompetitionIds]);

  const liveCount = (id: number) =>
    competitions
      .find((g) => g.competition.id === id)
      ?.fixtures.filter((f) => f.status === 'LIVE' || f.status === 'HT').length ?? 0;

  if (!isDesktop) {
    if (competitions.length === 0 && groupTournaments.length === 0) return null;
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.mobileScroll}
        contentContainerStyle={styles.mobileStrip}>
        {kind === 'country'
          ? groupTournaments.map((c) => (
              <Pressable
                key={`grp-${c.id}`}
                onPress={() => openStandingsNav(c)}
                style={[styles.mobileChip, styles.mobileChipGroups]}>
                <Text style={styles.mobileGrpTag}>TBL</Text>
                <Text style={styles.mobileLabel} numberOfLines={1}>
                  {c.name} groups
                </Text>
              </Pressable>
            ))
          : null}
        {orderedCompetitions.map((group) => {
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
        {favoriteIntl.length > 0 ? (
          <View style={styles.group}>
            <Text style={styles.groupLabel}>Favourites</Text>
            {favoriteIntl.map((c) => (
              <View key={`fav-intl-${c.id}`} style={styles.favRow}>
                <Pressable
                  onPress={() => openStandingsNav(c)}
                  style={({ hovered }) => [
                    styles.compItem,
                    styles.compItemFlex,
                    Platform.OS === 'web' && hovered && styles.itemHover,
                  ]}>
                  <Text style={styles.compName} numberOfLines={1}>
                    {c.name}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => toggleFavoriteCompetition(c.id)}
                  hitSlop={8}
                  style={styles.starBtn}>
                  <Text style={styles.starOn}>★</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        {kind === 'country' && groupTournaments.length > 0 ? (
          <View style={styles.group}>
            <Text style={styles.groupLabel}>GROUP TABLES</Text>
            {groupTournaments.map((c) => (
              <Pressable
                key={c.id}
                onPress={() => openStandingsNav(c)}
                style={({ hovered }) => [
                  styles.compItem,
                  Platform.OS === 'web' && hovered && styles.itemHover,
                ]}>
                <Text style={styles.compName} numberOfLines={1}>
                  {c.name}
                </Text>
                <Text style={styles.compMeta} numberOfLines={1}>
                  Group stage
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        {orderedCompetitions.length === 0 ? (
          <Text style={styles.emptyHint}>No competitions loaded.</Text>
        ) : (
          orderedCompetitions.map((group) => {
            const active = competitionId === group.competition.id;
            const live = liveCount(group.competition.id);
            const fav = isFavoriteCompetition(group.competition.id);
            return (
              <View key={group.key} style={styles.favRow}>
                <Pressable
                  onPress={() => setCompetitionId(active ? null : group.competition.id)}
                  style={({ hovered }) => [
                    styles.item,
                    styles.compItemFlex,
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
                <Pressable
                  onPress={() => toggleFavoriteCompetition(group.competition.id)}
                  hitSlop={8}
                  style={styles.starBtn}>
                  <Text style={fav ? styles.starOn : styles.starOff}>{fav ? '★' : '☆'}</Text>
                </Pressable>
              </View>
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
    backgroundColor: theme.surface,
    borderBottomWidth: layout.borderWidth,
    borderBottomColor: theme.border,
  },
  mobileToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  mobileToggleText: {
    flex: 1,
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: theme.textPrimary,
  },
  mobileScrollBox: {
    maxHeight: 460,
    borderTopWidth: layout.borderWidth,
    borderTopColor: theme.border,
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
  countryRowWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  countryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  countryRowFlex: { flex: 1, minWidth: 0 },
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
  favRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  starBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  starOn: {
    fontSize: 14,
    color: theme.yellow,
  },
  starOff: {
    fontSize: 14,
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
  compItemFlex: { flex: 1, minWidth: 0 },
  compItemActive: {
    borderLeftColor: theme.accentGreen,
    backgroundColor: theme.surfaceHover,
  },
  compName: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textMuted,
  },
  compMeta: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: theme.textFaint,
    marginTop: 1,
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
  mobileChipGroups: {
    borderColor: theme.accentGreen,
    backgroundColor: 'rgba(5, 150, 105, 0.08)',
  },
  mobileGrpTag: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 9,
    color: theme.accentGreen,
    letterSpacing: 0.5,
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
