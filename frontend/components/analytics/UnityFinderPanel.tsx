import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useQueries } from '@tanstack/react-query';

import DragScroll from '@/components/shared/DragScroll';
import FilterDropdown from '@/components/shared/FilterDropdown';
import PageControls, { PAGE_SIZE } from '@/components/shared/PageControls';
import { useLiveCompetitionFeed } from '@/hooks/useLiveCompetitions';
import { fetchAllFixturesBetween, seasonWindowUnix } from '@/services/oddAlerts';
import { clientStaleTime } from '@/services/oddAlertsCachePolicy';
import { buildLeagueStatsLive } from '@/services/statsBuilder';
import {
  leagueUnityFor,
  superLeagueUnity,
  teamMeasuresForSection,
  buildSuperLeague,
  buildUniversalUnity,
  sectionStats,
  DA_MIN,
  type LeagueUnity,
  type LeagueTier,
  type SuperTeamRow,
  type TeamMeasure,
  type UniversalLeague,
  type UniversalTeamRow,
  type UnitySection,
} from '@/utils/unity';
import { fonts, layout, spacing, theme } from '@/styles/theme';

const SECTIONS: { value: UnitySection; label: string }[] = [
  { value: 'homeaway', label: 'Home / Away' },
  { value: 'halves', label: '1st / 2nd Half' },
  { value: 'opposites', label: 'Opposites' },
];

type UnityView = 'leagues' | 'teams';
type TierFilter = 'all' | LeagueTier;
const TEAM_LIMIT = 200;

/** A Super-League team row joined with its universal (range-based) Unity. */
type MergedTeam = SuperTeamRow & {
  aUnity: number | null;
  indivUnity: number | null;
  strength: number | null;
  strengthRank: number | null;
};
/** A universal league row joined with its DA-fraction Unity, for the Leagues view. */
type MergedLeague = UniversalLeague & { daUnity: number | null; daCount: number };

function pct(v: number | null): string {
  return v == null ? '—' : `${Math.round(v * 100)}%`;
}
function tierColor(t: LeagueTier | null): string {
  if (t === 'top') return theme.accentGreen;
  if (t === 'middle') return theme.yellow;
  return theme.textMuted; // bottom = white/neutral
}
function tierName(t: LeagueTier | null): string {
  if (t === 'top') return 'Top';
  if (t === 'middle') return 'Mid';
  if (t === 'bottom') return 'Bottom';
  return '—';
}
export default function UnityFinderPanel() {
  const { width, height } = useWindowDimensions();
  const narrow = width < 720;
  const [helpOpen, setHelpOpen] = useState(false);

  const feed = useLiveCompetitionFeed(3);
  const leagues = useMemo(() => feed.competitions.filter((c) => c.rank === 0), [feed.competitions]);

  const [section, setSection] = useState<UnitySection>('homeaway');
  const stats = useMemo(() => sectionStats(section), [section]);
  const [statKey, setStatKey] = useState<string>('sc_pct');
  useEffect(() => {
    if (!stats.some((s) => s.key === statKey)) setStatKey(stats[0]?.key ?? '');
  }, [stats, statKey]);

  const [view, setView] = useState<UnityView>('leagues');
  // Super League filters.
  const [leagueFilter, setLeagueFilter] = useState<string>('all');
  const [tierFilter, setTierFilter] = useState<TierFilter>('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  const results = useQueries({
    queries: leagues.map((comp) => {
      const { fromUnix, toUnix } = seasonWindowUnix(comp.season ?? '');
      return {
        queryKey: ['unity-league', comp.id, comp.season] as const,
        queryFn: () => buildLeagueStatsLive((o) => fetchAllFixturesBetween(o), { competitionId: comp.id, fromUnix, toUnix, season: comp.season }),
        staleTime: clientStaleTime('stats/season'),
      };
    }),
  });
  const sig = results.map((r, i) => (r.data ? `${leagues[i]?.id}:${r.dataUpdatedAt}` : '')).join('|');
  const settled = results.filter((r) => r.isSuccess || r.isError).length;

  // Per-team side values per league — shared by the gap table and universal Unity.
  // Labels must be unique: league names repeat across countries.
  const perLeagueTeams = useMemo(() => {
    const out: { competition: string; teams: TeamMeasure[] }[] = [];
    results.forEach((r, i) => {
      if (r.data && leagues[i]) out.push({ competition: `${leagues[i].name} · ${leagues[i].country}`, teams: teamMeasuresForSection(r.data, section, statKey) });
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, section, statKey]);

  // DA-fraction Unity (headline + the DA% column).
  const sl = useMemo(() => {
    const perLeague: LeagueUnity[] = [];
    results.forEach((r, i) => {
      if (r.data && leagues[i]) perLeague.push(leagueUnityFor(r.data, `${leagues[i].name} · ${leagues[i].country}`, section, statKey));
    });
    return superLeagueUnity(perLeague);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, section, statKey]);

  // League Unity = (highest team value − lowest team value) / eligible team count.
  const universal = useMemo(() => buildUniversalUnity(perLeagueTeams), [perLeagueTeams]);
  // Tiers now follow the chosen fairness basis (normalized strength).
  const tierMap = useMemo(
    () => new Map(universal.leagues.map((l) => [l.competition, (l.tier ?? 'bottom') as LeagueTier] as const)),
    [universal],
  );
  const uniLeagueByComp = useMemo(() => new Map(universal.leagues.map((l) => [l.competition, l] as const)), [universal]);
  const uniTeamByKey = useMemo(() => {
    const m = new Map<string, UniversalTeamRow>();
    for (const t of universal.teams) m.set(`${t.competition}::${t.team}`, t);
    return m;
  }, [universal]);

  const superRows = useMemo(() => buildSuperLeague(perLeagueTeams, tierMap), [perLeagueTeams, tierMap]);

  // Leagues view: universal leagues (ranked by strength) joined with DA-fraction Unity.
  const mergedLeagues = useMemo<MergedLeague[]>(() => {
    const slByComp = new Map(sl.leagues.map((l) => [l.competition, l] as const));
    return universal.leagues.map((ul) => {
      const su = slByComp.get(ul.competition);
      return { ...ul, daUnity: su?.unity ?? null, daCount: su?.da ?? 0 };
    });
  }, [universal, sl]);
  const selectedLeague = leagueFilter === 'all' ? null : mergedLeagues.find((l) => l.competition === leagueFilter) ?? null;

  // Teams view: gap rows joined with universal strength, then filtered + sorted.
  const teamRows = useMemo<MergedTeam[]>(() => {
    const rows: MergedTeam[] = superRows.map((r) => {
      const u = uniTeamByKey.get(`${r.competition}::${r.team}`);
      const aUnity = uniLeagueByComp.get(r.competition)?.aUnity ?? null;
      return { ...r, aUnity, multiple: aUnity == null || aUnity === 0 ? null : r.unity / aUnity, indivUnity: u?.indivUnity ?? null, strength: u?.strength ?? null, strengthRank: u?.strengthRank ?? null };
    });

    // Rank all teams by how many times their team gap represents league Unity.
    const ranked = [...rows].sort((a, b) => (b.multiple ?? -Infinity) - (a.multiple ?? -Infinity) || b.unity - a.unity || a.team.localeCompare(b.team));
    const leagueRanks = new Map<string, number>();
    const ranks = new Map<string, { overallRank: number; leagueRank: number }>();
    ranked.forEach((r, i) => {
      const key = `${r.competition}::${r.team}`;
      const leagueRank = (leagueRanks.get(r.competition) ?? 0) + 1;
      leagueRanks.set(r.competition, leagueRank);
      ranks.set(key, { overallRank: i + 1, leagueRank });
    });
    const rankedRows = rows.map((r) => ({ ...r, ...ranks.get(`${r.competition}::${r.team}`)! }));

    let filtered = rankedRows;
    if (leagueFilter !== 'all') filtered = filtered.filter((r) => r.competition === leagueFilter);
    if (tierFilter !== 'all') filtered = filtered.filter((r) => r.tier === tierFilter);
    const q = query.trim().toLowerCase();
    if (q) filtered = filtered.filter((r) => r.team.toLowerCase().includes(q) || r.competition.toLowerCase().includes(q));
    return filtered
      .sort((a, b) => (b.multiple ?? -Infinity) - (a.multiple ?? -Infinity) || b.unity - a.unity || a.team.localeCompare(b.team))
      .slice(0, TEAM_LIMIT);
  }, [superRows, uniTeamByKey, uniLeagueByComp, leagueFilter, tierFilter, query]);

  useEffect(() => setPage(1), [section, statKey, view, leagueFilter, tierFilter, query]);

  const loading = feed.loading || settled < leagues.length;
  const statLabel = stats.find((s) => s.key === statKey)?.label ?? statKey;

  const listLen = view === 'leagues' ? mergedLeagues.length : teamRows.length;
  const pages = Math.max(1, Math.ceil(listLen / PAGE_SIZE));
  const safe = Math.min(page, pages);
  const start = (safe - 1) * PAGE_SIZE;
  const visibleLeagues = mergedLeagues.slice(start, start + PAGE_SIZE);
  const visibleTeams = teamRows.slice(start, start + PAGE_SIZE);

  const leagueOptions = [{ value: 'all', label: `All leagues (${mergedLeagues.length})` }, ...mergedLeagues.map((l) => ({ value: l.competition, label: l.competition }))];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>DA Unity Finder</Text>
        </View>
        <Text style={styles.subtitle}>
          Compare teams and leagues for the selected stat. Unity is calculated for each league as
          (highest team value − lowest team value) ÷ number of teams with data. Team gaps, DA status,
          and each league&apos;s average team position within its range are shown alongside Unity.
        </Text>
      </View>

      <View style={styles.toolbar}>
        <FilterDropdown label="DA place" value={section} options={SECTIONS} onChange={(v) => setSection(v as UnitySection)} style={narrow ? styles.full : styles.flex} />
        <FilterDropdown label="Stat" value={statKey} options={stats.map((s) => ({ value: s.key, label: s.label }))} onChange={setStatKey} style={narrow ? styles.full : styles.flex} />
      </View>

      {/* View switch */}
      <View style={styles.viewRow}>
        {([['leagues', 'Leagues (LL)'], ['teams', 'League Amongst Leagues']] as [UnityView, string][]).map(([v, label]) => {
          const on = view === v;
          return (
            <Pressable key={v} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setView(v)} style={[styles.viewBtn, on && styles.viewBtnOn]}>
              <Text style={[styles.viewBtnText, on && styles.viewBtnTextOn]}>{label}</Text>
            </Pressable>
          );
        })}
        <Pressable accessibilityRole="button" accessibilityLabel="Explain the tables" onPress={() => setHelpOpen(true)} style={styles.helpButton}>
          <Text style={styles.helpButtonText}>ⓘ Table guide</Text>
        </Pressable>
      </View>

      <View style={styles.statusRow}>
        {loading ? (
          <>
            <ActivityIndicator size="small" color={theme.accentGreen} />
            <Text style={styles.statusMuted}>Building the league amongst leagues · {settled}/{leagues.length} leagues…</Text>
          </>
        ) : (
          <Text style={styles.statusLive}>● {sl.leagues.length} leagues · {sl.totalTeams} teams · {statLabel}</Text>
        )}
      </View>

      {!loading && sl.leagues.length === 0 ? <Text style={styles.empty}>No league data to measure Unity yet.</Text> : null}

      {!loading && sl.leagues.length > 0 && view === 'leagues' ? (
        <>
          <View style={styles.overall}>
            <Text style={styles.overallLabel}>League-amongst-leagues Unity · {statLabel}</Text>
            <Text style={styles.overallValue}>{pct(sl.overallUnity)}</Text>
            <Text style={styles.overallSub}>{sl.totalDa} of {sl.totalTeams} teams are DA</Text>
          </View>

          <PageControls page={safe} pages={pages} total={sl.leagues.length} from={start + 1} to={start + visibleLeagues.length} onChange={setPage} />
          <DragScroll horizontal style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            <View style={[styles.table, { minWidth: 720 }]}>
              <View style={[styles.row, styles.headRow]}>
                <Text style={[styles.cRank, styles.headText, styles.right]}>#</Text>
                <Text style={[styles.cLeague, styles.headText]}>League (LL)</Text>
                <Text style={[styles.cTier, styles.headText]}>Tier</Text>
                <Text style={[styles.cNum, styles.headText, styles.right]}>N</Text>
                <Text style={[styles.cNum, styles.headText, styles.right]}>Range</Text>
                <Text style={[styles.cNum, styles.headText, styles.right]}>Unity</Text>
                <Text style={[styles.cUnity, styles.headText]}>Strength</Text>
                <Text style={[styles.cNum, styles.headText, styles.right]}>DA%</Text>
              </View>
              {visibleLeagues.map((l, i) => {
                const tc = tierColor(l.tier);
                return (
                  <Pressable
                    key={l.competition}
                    accessibilityRole="button"
                    accessibilityLabel={`View ${l.competition} teams ranked by Unity multiple`}
                    onPress={() => { setLeagueFilter(l.competition); setView('teams'); setPage(1); }}
                    style={({ pressed }) => [styles.row, i % 2 === 1 && styles.rowAlt, pressed && styles.rowPressed]}>
                    <Text style={[styles.cRank, styles.numDa]}>{start + i + 1}</Text>
                    <Text style={[styles.cLeague, styles.league]} numberOfLines={1}>{l.competition}</Text>
                    <View style={styles.cTier}>
                      <View style={[styles.tierChip, { borderColor: tc }]}><Text style={[styles.tierChipText, { color: tc }]}>{tierName(l.tier)}</Text></View>
                    </View>
                    <Text style={[styles.cNum, styles.num]}>{l.n}</Text>
                    <Text style={[styles.cNum, styles.num]}>{Math.round(l.range)}</Text>
                    <Text style={[styles.cNum, styles.numStrong]}>{l.aUnity.toFixed(1)}</Text>
                    <View style={styles.cUnity}>
                      <View style={styles.bar}><View style={[styles.barFill, { width: `${Math.round(l.avgStrength * 100)}%` }]} /></View>
                      <Text style={styles.unityPct}>{Math.round(l.avgStrength * 100)}%</Text>
                    </View>
                    <Text style={[styles.cNum, styles.muted]}>{pct(l.daUnity)}</Text>
                  </Pressable>
                );
              })}
            </View>
          </DragScroll>
          <Text style={styles.hint}>
            Unity = (highest team value − lowest team value) ÷ number of teams with data. Strength is the
            league&apos;s average team position within its own range; it ranks leagues into three relative tiers.
            DA% is the share of eligible teams whose comparison difference is at least {DA_MIN}%.
          </Text>
        </>
      ) : null}

      {!loading && sl.leagues.length > 0 && view === 'teams' ? (
        <>
          {/* Filters */}
          <View style={styles.filterCard}>
            <FilterDropdown label="League" value={leagueFilter} options={leagueOptions} onChange={setLeagueFilter} style={narrow ? styles.full : styles.flex} />
            <Text style={styles.topListNote}>Ranked by team Gap ÷ league Unity, biggest first. Showing up to {TEAM_LIMIT} teams.</Text>
            <View style={styles.tierBtnRow}>
              {(['all', 'top', 'middle', 'bottom'] as TierFilter[]).map((t) => {
                const on = tierFilter === t;
                const c = t === 'all' ? theme.accentBlue : tierColor(t as LeagueTier);
                return (
                  <Pressable key={t} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setTierFilter(t)} style={[styles.tierBtn, on && { borderColor: c, backgroundColor: 'rgba(5,150,105,0.06)' }]}>
                    <Text style={[styles.tierBtnText, { color: on ? c : theme.textMuted }]}>{t === 'all' ? 'All tiers' : tierName(t as LeagueTier)}</Text>
                  </Pressable>
                );
              })}
            </View>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search team or league…"
              placeholderTextColor={theme.textFaint}
              style={styles.search}
            />
          </View>

          {selectedLeague ? (
            <View style={styles.selectedLeagueCard}>
              <Text style={styles.selectedLeagueTitle}>{selectedLeague.competition} · {tierName(selectedLeague.tier)} tier</Text>
              <Text style={styles.selectedLeagueText}>
                League Unity: {selectedLeague.aUnity.toFixed(2)} · Range: {selectedLeague.range.toFixed(1)} · {selectedLeague.n} teams with data · Average Strength: {Math.round(selectedLeague.avgStrength * 100)}%
              </Text>
              <Text style={styles.selectedLeagueText}>Teams below are ranked by × Unity within this league. The league Unity value is shared by every team in the league.</Text>
            </View>
          ) : null}

          <View style={styles.statusRow}>
              <Text style={styles.statusMuted}>Top {teamRows.length} teams by Gap ÷ league Unity{leagueFilter !== 'all' || tierFilter !== 'all' || query.trim() ? ' (filtered)' : ''} · overall ranks kept</Text>
          </View>

          {teamRows.length === 0 ? (
            <Text style={styles.empty}>No teams match these filters.</Text>
          ) : (
            <>
              <PageControls page={safe} pages={pages} total={teamRows.length} from={start + 1} to={start + visibleTeams.length} onChange={setPage} />
              <DragScroll horizontal style={styles.scroll} contentContainerStyle={styles.scrollContent}>
                <View style={[styles.table, { minWidth: 1060 }]}>
                  <View style={[styles.row, styles.headRow]}>
                    <Text style={[styles.cRank, styles.headText, styles.right]}>#</Text>
                    <Text style={[styles.cTeam, styles.headText]}>Team</Text>
                    <Text style={[styles.cLeagueT, styles.headText]}>League</Text>
                    <Text style={[styles.cTier, styles.headText]}>Tier</Text>
                    <Text style={[styles.cNum, styles.headText, styles.right]}>Peak</Text>
                    <Text style={[styles.cNum, styles.headText, styles.right]}>Gap</Text>
                    <Text style={[styles.cNum, styles.headText, styles.right]}>Unity</Text>
                    <Text style={[styles.cNum, styles.headText, styles.right]}>Indiv</Text>
                    <Text style={[styles.cNum, styles.headText, styles.right]}>Str</Text>
                    <Text style={[styles.cNum, styles.headText, styles.right]}>Str#</Text>
                    <Text style={[styles.cNum, styles.headText, styles.right]}>Lg #</Text>
                    <Text style={[styles.cMultiple, styles.headText]}>× Unity</Text>
                  </View>
                  {visibleTeams.map((r, i) => {
                    const tc = tierColor(r.tier);
                    const uc = r.band === 'da' ? theme.accentGreen : r.band === 'borderline' ? theme.yellow : theme.textMuted;
                    return (
                      <View key={`${r.competition}-${r.team}`} style={[styles.row, i % 2 === 1 && styles.rowAlt]}>
                        <Text style={[styles.cRank, styles.numDa]}>{r.overallRank}</Text>
                        <Text style={[styles.cTeam, styles.team]} numberOfLines={1}>{r.team}</Text>
                        <Text style={[styles.cLeagueT, styles.compText]} numberOfLines={1}>{r.competition}</Text>
                        <View style={styles.cTier}>
                          <View style={[styles.tierChip, { borderColor: tc }]}><Text style={[styles.tierChipText, { color: tc }]}>{tierName(r.tier)}</Text></View>
                        </View>
                        <Text style={[styles.cNum, styles.num]}>{r.da.toFixed(1)}</Text>
                        <Text style={[styles.cNum, { textAlign: 'right', fontFamily: fonts.bodySemiBold, fontSize: 12, color: uc }]}>{r.unity.toFixed(1)}</Text>
                        <Text style={[styles.cNum, styles.num]}>{r.aUnity == null ? '—' : r.aUnity.toFixed(1)}</Text>
                        <Text style={[styles.cNum, styles.num]}>{r.indivUnity == null ? '—' : r.indivUnity.toFixed(1)}</Text>
                        <Text style={[styles.cNum, styles.numStrong]}>{r.strength == null ? '—' : `${Math.round(r.strength * 100)}%`}</Text>
                        <Text style={[styles.cNum, styles.muted]}>{r.strengthRank ?? '—'}</Text>
                        <Text style={[styles.cNum, styles.muted]}>{r.leagueRank}</Text>
                        <View style={styles.multipleCell}>
                          <Text style={styles.multipleValue}>{r.multiple == null ? '—' : `${Number.isInteger(r.multiple) ? r.multiple : r.multiple.toFixed(2)}×`}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </DragScroll>
              <PageControls page={safe} pages={pages} total={teamRows.length} from={start + 1} to={start + visibleTeams.length} onChange={setPage} />
              <Text style={styles.hint}>
                Peak is this team&apos;s higher value for {statLabel}; Gap is the difference between its higher and lower values.
                Unity is the league-wide value: (league high − league low) ÷ teams with data. The final × Unity column shows Gap ÷ Unity; for example, 8× means the team&apos;s Gap is eight times its league Unity.
                Indiv is this team&apos;s position-based allocation within the league range; Str is its
                normalized position 0–100% within its league; Str# = its strength rank across all leagues.
                Overall # and Lg # rank teams by Gap ÷ Unity overall and within their league.
              </Text>
            </>
          )}
        </>
      ) : null}

      <Modal visible={helpOpen} transparent animationType="fade" onRequestClose={() => setHelpOpen(false)}>
        <View style={styles.helpModal}>
          <Pressable style={styles.helpBackdrop} onPress={() => setHelpOpen(false)} accessibilityLabel="Close explanation" />
          <View style={[styles.helpSheet, { maxHeight: Math.max(300, Math.round(height * 0.82)) }]}>
            <View style={styles.helpHeader}>
              <View style={styles.helpHeaderCopy}>
                <Text style={styles.helpTitle}>How to read these tables</Text>
                <Text style={styles.helpIntro}>What the tabs show, how the rankings work, and how to read each team’s numbers.</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Close explanation" onPress={() => setHelpOpen(false)} style={styles.helpClose}>
                <Text style={styles.helpCloseText}>Close</Text>
              </Pressable>
            </View>
            <ScrollView style={styles.helpScroll} contentContainerStyle={styles.helpContent}>
              <Text style={styles.helpSectionTitle}>Unity: the league formula</Text>
              <Text style={styles.helpText}>For the selected stat, find the highest team value and lowest team value in a league. Subtract the low from the high, then divide by the number of teams with data.</Text>
              <Text style={styles.helpFormula}>(Highest team stat − Lowest team stat) ÷ Number of teams = Unity</Text>
              <Text style={styles.helpText}>Example: highest is 80, lowest is 20, and 10 teams have data. The range is 60, so Unity is 60 ÷ 10 = 6. Unity is the same league-wide figure for every team in that league.</Text>

              <Text style={styles.helpSectionTitle}>What DA means</Text>
              <Text style={styles.helpText}>DA means “Double Agent” in this app. It marks a large difference between the two sides being compared. A difference of 25% or more counts as DA; 16–24% is borderline; 0–15% is treated as a small or even difference. Teams without enough figures for a comparison are left out of that count.</Text>

              <Text style={styles.helpSectionTitle}>Choose what to compare</Text>
              <Text style={styles.helpText}>DA place chooses the comparison: Home / Away looks at home versus away performance; 1st / 2nd Half compares first-half and second-half performance; Opposites compares paired measures such as scoring versus failing to score. Stat chooses the particular measure, such as wins, goals, or clean sheets.</Text>
              <Text style={styles.helpText}>Quick stat guide: PPG = points per game; SC% = scored; Conc% = conceded; AVG = average goals; BTTS Yes = both teams scored; CS% = clean sheets; FTS% = failed to score; Win, Draw, and Loss = match result; Over / Under 1.5, 2.5, or 3.5 = total goals above or below that number; Scoring 1.5+ / Conceding 1.5+ = scored or conceded at least two goals.</Text>

              <Text style={styles.helpSectionTitle}>Leagues view</Text>
              <Text style={styles.helpText}>The headline DA% is the share of teams with data across all listed leagues that meet the DA difference threshold. In each league row: N is teams with data; Range is highest minus lowest; Unity is Range ÷ N; Strength is the league’s average team position within its own range; DA% is that league’s DA share.</Text>
              <Text style={styles.helpText}>League rows are ordered by average Strength and split into roughly equal Top, Mid, and Bottom groups. Click any league row to open its teams. The league Unity, range, and team count then appear above that league’s team table.</Text>

              <Text style={styles.helpSectionTitle}>League Amongst Leagues view</Text>
              <Text style={styles.helpText}>The team table shows up to 200 teams, ranked by Gap ÷ league Unity, biggest first. Peak is the higher of the team’s two values; Gap is the difference between them. The final × Unity column is Gap ÷ Unity: 8× means the team’s Gap is eight times its league’s Unity.</Text>
              <Text style={styles.helpText}>A small Unity can still produce a high × Unity score because Unity is the number being divided by. For example, a Gap of 8 ÷ Unity of 1 gives 8×, while a Gap of 20 ÷ Unity of 10 gives 2×. Read both Gap and Unity alongside the ratio. Overall # ranks by this ratio across leagues; Lg # ranks by it within the league.</Text>
              <Text style={styles.helpText}>Indiv is the team’s allocated share of the league range: (number of teams − its rank by Peak) × Unity. The highest Peak gets the largest allocation and the lowest gets zero. This is separate from × Unity, which determines the table order. Str is the team’s position between its league’s lowest and highest value (0–100%); Str# ranks teams across leagues by Strength.</Text>
              <Text style={styles.helpText}>Choose a league or tier, search for a team, and use the page controls to narrow or browse the top list. The ratio order stays highest first.</Text>

              <Text style={styles.helpSectionTitle}>Reading the results</Text>
              <Text style={styles.helpText}>These figures summarize season patterns for comparison, not a prediction for a specific match. A dash means a value could not be calculated. Percentages describe a share; Unity, Range, Peak, and Gap use the selected stat’s scale.</Text>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', alignSelf: 'stretch' },
  header: { marginBottom: spacing.md },
  titleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginBottom: spacing.xs },
  title: { fontFamily: fonts.display, fontSize: 24, color: theme.textPrimary, marginBottom: spacing.xs },
  subtitle: { fontFamily: fonts.body, fontSize: 13, lineHeight: 20, color: theme.textMuted },
  helpButton: { borderWidth: layout.borderWidth, borderColor: theme.accentGreen, borderRadius: 999, paddingHorizontal: spacing.md, paddingVertical: 7, backgroundColor: 'rgba(5,150,105,0.06)' },
  helpButtonText: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: theme.accentGreen },
  helpModal: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.md },
  helpBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15, 23, 42, 0.55)' },
  helpSheet: { width: '100%', maxWidth: 680, borderWidth: layout.borderWidth, borderColor: theme.border, borderRadius: 16, backgroundColor: theme.surface, padding: spacing.md, gap: spacing.sm },
  helpHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  helpHeaderCopy: { flex: 1, gap: 3 },
  helpTitle: { fontFamily: fonts.display, fontSize: 20, color: theme.textPrimary },
  helpIntro: { fontFamily: fonts.body, fontSize: 12, lineHeight: 18, color: theme.textMuted },
  helpClose: { borderWidth: layout.borderWidth, borderColor: theme.border, borderRadius: layout.borderRadius, paddingHorizontal: spacing.md, paddingVertical: 7 },
  helpCloseText: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: theme.textPrimary },
  helpScroll: { flexGrow: 0 },
  helpContent: { gap: spacing.sm, paddingBottom: spacing.sm },
  helpSectionTitle: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: theme.accentGreen, marginTop: spacing.xs },
  helpText: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: theme.textPrimary },
  helpFormula: { fontFamily: fonts.bodySemiBold, fontSize: 14, lineHeight: 21, color: theme.textPrimary, backgroundColor: theme.surfaceMuted, borderRadius: layout.borderRadius, padding: spacing.md },
  selectedLeagueCard: { marginTop: spacing.md, gap: spacing.xs, borderWidth: layout.borderWidth, borderColor: theme.accentGreen, borderRadius: layout.borderRadius, padding: spacing.md, backgroundColor: 'rgba(5,150,105,0.06)' },
  selectedLeagueTitle: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: theme.textPrimary },
  selectedLeagueText: { fontFamily: fonts.body, fontSize: 12, lineHeight: 18, color: theme.textMuted },

  toolbar: {
    flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm,
    borderWidth: layout.borderWidth, borderColor: theme.border, borderRadius: layout.borderRadius,
    backgroundColor: theme.surface, padding: spacing.md,
  },
  flex: { flexGrow: 1, flexBasis: 180, minWidth: 150 },
  full: { width: '100%', minWidth: 0, flexBasis: 'auto', flexGrow: 0 },

  viewRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  viewBtn: { flex: 1, borderWidth: 1.5, borderColor: theme.border, borderRadius: layout.borderRadius, paddingVertical: spacing.sm, alignItems: 'center', backgroundColor: theme.surface },
  viewBtnOn: { borderColor: theme.accentGreen, backgroundColor: 'rgba(5,150,105,0.08)' },
  viewBtnText: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.textMuted },
  viewBtnTextOn: { color: theme.accentGreen },

  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 20, marginTop: spacing.md },
  statusLive: { fontFamily: fonts.bodyMedium, fontSize: 12, color: theme.accentGreen },
  statusMuted: { fontFamily: fonts.body, fontSize: 12, color: theme.textMuted },
  empty: { fontFamily: fonts.body, fontSize: 13, color: theme.textMuted, textAlign: 'center', paddingVertical: spacing.lg },

  overall: {
    marginTop: spacing.md, borderWidth: layout.borderWidth, borderColor: theme.accentGreen, borderRadius: layout.borderRadius,
    backgroundColor: 'rgba(5,150,105,0.06)', padding: spacing.md, alignItems: 'center',
  },
  overallLabel: { fontFamily: fonts.bodySemiBold, fontSize: 11, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  overallValue: { fontFamily: fonts.display, fontSize: 34, color: theme.accentGreen, marginVertical: 2 },
  overallSub: { fontFamily: fonts.body, fontSize: 12, color: theme.textMuted },

  filterCard: {
    marginTop: spacing.md, borderWidth: layout.borderWidth, borderColor: theme.border, borderRadius: layout.borderRadius,
    backgroundColor: theme.surface, padding: spacing.md, gap: spacing.sm,
  },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: spacing.sm },
  filterCol: { flexDirection: 'column', alignItems: 'stretch' },
  topListNote: { fontFamily: fonts.body, fontSize: 12, lineHeight: 18, color: theme.textMuted },
  dirBtn: { borderWidth: 1.5, borderColor: theme.border, borderRadius: layout.borderRadius, paddingHorizontal: spacing.md, paddingVertical: 10, backgroundColor: theme.surfaceHover },
  dirBtnText: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: theme.textPrimary },
  tierBtnRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tierBtn: { borderWidth: 1.5, borderColor: theme.border, borderRadius: 999, paddingHorizontal: spacing.md, paddingVertical: 5, backgroundColor: theme.surface },
  tierBtnText: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: theme.textMuted },
  search: {
    borderWidth: layout.borderWidth, borderColor: theme.border, borderRadius: layout.borderRadius,
    paddingHorizontal: spacing.md, paddingVertical: 9, fontFamily: fonts.body, fontSize: 13, color: theme.textPrimary, backgroundColor: theme.surfaceHover,
  },

  scroll: { width: '100%', maxWidth: '100%', marginTop: spacing.sm },
  scrollContent: { minWidth: '100%' },
  table: {
    width: '100%', backgroundColor: theme.surface, borderWidth: layout.borderWidth,
    borderColor: theme.border, borderRadius: layout.borderRadius, overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, paddingHorizontal: spacing.sm },
  headRow: { backgroundColor: theme.surfaceMuted, borderBottomWidth: layout.borderWidth, borderBottomColor: theme.border },
  rowAlt: { backgroundColor: theme.surfaceHover },
  rowPressed: { backgroundColor: 'rgba(5,150,105,0.10)' },
  headText: { fontFamily: fonts.bodySemiBold, fontSize: 10, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 4 },
  right: { textAlign: 'right' },
  cRank: { width: 38, paddingHorizontal: 4, textAlign: 'right' },
  cLeague: { flex: 1, minWidth: 150, paddingHorizontal: 4 },
  cLeagueT: { width: 150, paddingHorizontal: 4 },
  cTeam: { flex: 1, minWidth: 140, paddingHorizontal: 4 },
  cTier: { width: 64, paddingHorizontal: 4 },
  cNum: { width: 52, paddingHorizontal: 4 },
  cMultiple: { width: 92, paddingHorizontal: 8, textAlign: 'center', color: theme.accentGreen },
  multipleCell: { width: 92, alignItems: 'center', justifyContent: 'center', paddingVertical: 5, paddingHorizontal: 7, marginLeft: 4, borderRadius: layout.borderRadius, backgroundColor: 'rgba(5,150,105,0.12)' },
  multipleValue: { fontFamily: fonts.display, fontSize: 16, color: theme.accentGreen },
  cUnity: { width: 150, paddingHorizontal: 4, flexDirection: 'row', alignItems: 'center', gap: 6 },
  muted: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted, textAlign: 'right' },
  league: { fontFamily: fonts.bodyMedium, fontSize: 13, color: theme.textPrimary },
  team: { fontFamily: fonts.bodyMedium, fontSize: 13, color: theme.textPrimary },
  compText: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted },
  num: { fontFamily: fonts.body, fontSize: 12, color: theme.textPrimary, textAlign: 'right' },
  numStrong: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.textPrimary, textAlign: 'right' },
  numDa: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.accentGreen, textAlign: 'right' },
  tierChip: { alignSelf: 'flex-start', borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1 },
  tierChipText: { fontFamily: fonts.bodySemiBold, fontSize: 9 },
  bar: { flex: 1, height: 8, borderRadius: 999, backgroundColor: theme.surfaceMuted, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: theme.accentGreen },
  unityPct: { width: 40, fontFamily: fonts.bodySemiBold, fontSize: 12, color: theme.textPrimary, textAlign: 'right' },

  hint: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted, textAlign: 'center', marginTop: spacing.sm },
});
