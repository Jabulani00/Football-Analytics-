import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useScoresFilter } from '@/components/layout/ScoresFilterContext';
import CountryFlag from '@/components/shared/CountryFlag';
import PageContainer from '@/components/shared/PageContainer';
import GroupStandingsView from '@/components/standings/GroupStandingsView';
import TieredStandingsView from '@/components/standings/TieredStandingsView';
import StandingsStakesView from '@/components/standings/StandingsStakesView';
import BhozomaView from '@/components/standings/BhozomaView';
import ImbanpiView from '@/components/standings/ImbanpiView';
import SeasonFixturesList from '@/components/standings/SeasonFixturesList';
import StandingsAnalyticsView from '@/components/league/StandingsAnalyticsView';
import SubTabBar from '@/components/shared/SubTabBar';
import { useStandings } from '@/hooks/useStandings';
import { useSeasonFixtures } from '@/hooks/useSeasonFixtures';
import { apiStandingsToBase, teamIdByName, timingByName } from '@/utils/standingsAdapter';
import { isGroupStageTournament } from '@/utils/groupStandings';
import { fonts, layout, spacing, theme } from '@/styles/theme';

type StandingsView =
  | 'upcoming'
  | 'previous'
  | 'league'
  | 'tiers'
  | 'stakes'
  | 'bhozoma'
  | 'imbanpi'
  | 'groups';

function defaultView(opts: { isGroups: boolean; isCup: boolean }): StandingsView {
  if (opts.isGroups) return 'groups';
  if (opts.isCup) return 'upcoming';
  return 'league';
}

export default function StandingsPanel() {
  const router = useRouter();
  const { selectedCompetition, selectedSeasonId, setSelectedSeasonId, setPanelMode } =
    useScoresFilter();

  const competition = selectedCompetition;
  const isGroups = isGroupStageTournament(competition?.name ?? '');
  const isCup = !!competition?.isCup;
  const { standings, tiered, loading, error } = useStandings(
    isGroups || isCup ? null : competition,
    isGroups || isCup ? null : selectedSeasonId,
  );
  const [view, setView] = useState<StandingsView>(() =>
    defaultView({ isGroups, isCup }),
  );

  useEffect(() => {
    setView(defaultView({ isGroups, isCup }));
  }, [competition?.id, isGroups, isCup]);

  const season = competition?.seasons.find((s) => s.seasonId === selectedSeasonId);
  const needSeasonFixtures = view === 'bhozoma' || view === 'imbanpi';
  const seasonFx = useSeasonFixtures(
    needSeasonFixtures ? competition : null,
    needSeasonFixtures ? season : null,
    needSeasonFixtures,
  );

  const openMatch = (id: number) =>
    router.push({ pathname: '/match/[id]', params: { id: String(id) } });

  if (!competition) return null;

  const fixturesProps = {
    competitionId: competition.id,
    seasonId: selectedSeasonId,
    seasonName: season?.seasonName ?? '',
    onMatchPress: openMatch,
  };

  return (
    <PageContainer contentContainerStyle={styles.scroll}>
      <Pressable onPress={() => setPanelMode('scores')} style={styles.back}>
        <Text style={styles.backText}>← BACK TO SCORES</Text>
      </Pressable>

      <View style={styles.header}>
        <CountryFlag name={competition.country} size={20} />
        <View style={styles.headerText}>
          <Text style={styles.title}>{competition.name}</Text>
          <Text style={styles.subtitle}>
            {competition.country} · {isGroups ? 'Group stage' : competition.isCup ? 'Cup' : 'League'}
          </Text>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.seasonRow}>
        {competition.seasons.map((s) => {
          const active = s.seasonId === selectedSeasonId;
          return (
            <Pressable
              key={s.seasonId}
              onPress={() => setSelectedSeasonId(s.seasonId)}
              style={[styles.seasonChip, active && styles.seasonChipActive]}>
              <Text style={[styles.seasonText, active && styles.seasonTextActive]}>
                {s.seasonName}
                {s.isCurrent ? ' •' : ''}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {isGroups ? (
        <>
          <SubTabBar
            tabs={[
              { id: 'groups', label: 'Groups' },
              { id: 'upcoming', label: 'Upcoming' },
              { id: 'previous', label: 'Previous' },
            ]}
            active={view === 'upcoming' || view === 'previous' || view === 'groups' ? view : 'groups'}
            onChange={(id) => setView(id as StandingsView)}
          />
          {view === 'upcoming' ? (
            <SeasonFixturesList {...fixturesProps} mode="upcoming" showModeTabs={false} />
          ) : view === 'previous' ? (
            <SeasonFixturesList {...fixturesProps} mode="previous" showModeTabs={false} />
          ) : (
            <GroupStandingsView competition={competition} seasonId={selectedSeasonId} />
          )}
        </>
      ) : competition.isCup ? (
        <>
          <SubTabBar
            tabs={[
              { id: 'upcoming', label: 'Upcoming' },
              { id: 'previous', label: 'Previous' },
            ]}
            active={view === 'upcoming' || view === 'previous' ? view : 'previous'}
            onChange={(id) => setView(id as StandingsView)}
          />
          <SeasonFixturesList
            {...fixturesProps}
            mode={view === 'upcoming' ? 'upcoming' : 'previous'}
            showModeTabs={false}
          />
        </>
      ) : loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.accentGreen} />
          <Text style={styles.muted}>Loading standings…</Text>
        </View>
      ) : error ? (
        <Text style={styles.muted}>{error}</Text>
      ) : standings.length === 0 ? (
        <>
          <SubTabBar
            tabs={[
              { id: 'upcoming', label: 'Upcoming' },
              { id: 'previous', label: 'Previous' },
            ]}
            active={view === 'upcoming' || view === 'previous' ? view : 'upcoming'}
            onChange={(id) => setView(id as StandingsView)}
          />
          <SeasonFixturesList
            {...fixturesProps}
            mode={view === 'previous' ? 'previous' : 'upcoming'}
            showModeTabs={false}
          />
        </>
      ) : (
        <>
          <SubTabBar
            tabs={[
              { id: 'league', label: 'League table' },
              { id: 'upcoming', label: 'Upcoming' },
              { id: 'previous', label: 'Previous' },
              { id: 'tiers', label: 'Tier tables' },
              { id: 'stakes', label: 'Who needs points' },
              { id: 'bhozoma', label: 'Mid-table form' },
              { id: 'imbanpi', label: 'Closest rivals' },
            ]}
            active={view}
            onChange={(id) => setView(id as StandingsView)}
          />
          {view === 'upcoming' ? (
            <SeasonFixturesList {...fixturesProps} mode="upcoming" showModeTabs={false} />
          ) : view === 'previous' ? (
            <SeasonFixturesList {...fixturesProps} mode="previous" showModeTabs={false} />
          ) : view === 'league' ? (
            <StandingsAnalyticsView
              base={apiStandingsToBase(standings)}
              seasonLabel={competition.name}
              timing={timingByName(standings)}
              competitionId={competition.id}
              onTeamPress={(team) => {
                const id = teamIdByName(standings).get(team);
                if (id != null)
                  router.push({ pathname: '/team/[slug]', params: { slug: String(id), name: team } });
              }}
            />
          ) : view === 'tiers' ? (
            <TieredStandingsView
              tiered={tiered}
              loading={loading}
              onTeamPress={(row) =>
                router.push({
                  pathname: '/team/[slug]',
                  params: { slug: String(row.teamId), name: row.name },
                })
              }
            />
          ) : view === 'stakes' ? (
            <StandingsStakesView
              standings={standings}
              competitionId={competition.id}
              seasonProgress={season?.progress ?? null}
            />
          ) : view === 'bhozoma' ? (
            <BhozomaView
              standings={standings}
              matches={seasonFx.matches}
              loading={seasonFx.loading}
              error={seasonFx.error}
              competitionId={competition.id}
            />
          ) : (
            <ImbanpiView
              standings={standings}
              matches={seasonFx.matches}
              loading={seasonFx.loading}
              error={seasonFx.error}
              seasonProgress={season?.progress ?? null}
            />
          )}
        </>
      )}
    </PageContainer>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingTop: spacing.sm, paddingBottom: spacing.xxl, width: '100%' },
  back: { alignSelf: 'flex-start', paddingVertical: spacing.sm },
  backText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    color: theme.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  headerText: { flex: 1, minWidth: 0 },
  title: { fontFamily: fonts.display, fontSize: 20, color: theme.textPrimary },
  subtitle: { fontFamily: fonts.bodyMedium, fontSize: 12, color: theme.textMuted },
  seasonRow: { flexDirection: 'row', gap: spacing.xs, paddingVertical: spacing.sm },
  seasonChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: layout.borderRadius,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    backgroundColor: theme.surface,
  },
  seasonChipActive: { borderColor: theme.accentGreen, backgroundColor: theme.surfaceMuted },
  seasonText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: theme.textMuted },
  seasonTextActive: { color: theme.textPrimary, fontFamily: fonts.bodySemiBold },
  center: { alignItems: 'center', paddingVertical: spacing.xxl, gap: spacing.sm },
  muted: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: theme.textMuted,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
});
