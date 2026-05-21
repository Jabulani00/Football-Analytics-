import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import FixtureBetSlipSection from '@/components/fixture/FixtureBetSlipSection';
import FixtureFusionSection from '@/components/fixture/FixtureFusionSection';
import FixtureJourneyBar, { type JourneyStep } from '@/components/fixture/FixtureJourneyBar';
import StrategyWorkflow from '@/components/fixture/StrategyWorkflow';
import H2HPanel from '@/components/match/H2HPanel';
import MatchDrawPanel from '@/components/match/MatchDrawPanel';
import MatchFootyPanel from '@/components/match/MatchFootyPanel';
import MatchHeader from '@/components/match/MatchHeader';
import MatchLineupsPanel from '@/components/match/MatchLineupsPanel';
import MatchOddsPanel from '@/components/match/MatchOddsPanel';
import MatchStats from '@/components/match/MatchStats';
import MatchSummaryPanel from '@/components/match/MatchSummaryPanel';
import MatchTabBar, { type MatchTabId } from '@/components/match/MatchTabBar';
import MatchTimeline from '@/components/match/MatchTimeline';
import StandingsTable from '@/components/match/StandingsTable';
import FixtureStatsDashboard from '@/components/stats/FixtureStatsDashboard';
import AppShell from '@/components/shared/AppShell';
import PageContainer from '@/components/shared/PageContainer';
import StickyBack from '@/components/shared/StickyBack';
import { getFixtureById, leagueCompetitions } from '@/mock/fixturesData';
import { getH2HForMatch } from '@/mock/h2hData';
import { getMatchDetail } from '@/mock/matchData';
import { getTeamSlug } from '@/mock/teamData';
import { getStandingsForLeague } from '@/mock/standingsData';
import { fonts, spacing, theme } from '@/styles/theme';

type MatchScreenProps = {
  matchId: string;
  leagueId: string;
  onBack: () => void;
};

const USE_NATIVE_DRIVER = Platform.OS !== 'web';

function TabPanel({
  visible,
  children,
}: {
  visible: boolean;
  children: ReactNode;
}) {
  const opacity = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: 150,
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start();
  }, [opacity, visible]);

  if (!visible) return null;

  return <Animated.View style={{ opacity, width: '100%' }}>{children}</Animated.View>;
}

export default function MatchScreen({ matchId, leagueId, onBack }: MatchScreenProps) {
  const router = useRouter();
  const fixture = getFixtureById(matchId);
  const match = getMatchDetail(matchId, fixture);
  const isUpcoming = fixture?.status === 'NS';
  const [activeTab, setActiveTab] = useState<MatchTabId>('summary');
  const [journeyStep, setJourneyStep] = useState<JourneyStep>('stats');
  const h2h = getH2HForMatch(matchId);
  const standings = getStandingsForLeague(leagueId);
  const leagueMeta = leagueCompetitions[leagueId];

  const handleTabChange = useCallback((tab: MatchTabId) => {
    setActiveTab(tab);
    if (tab !== 'stats') setJourneyStep('stats');
  }, []);

  const handleJourney = useCallback((step: JourneyStep, tab: MatchTabId) => {
    setJourneyStep(step);
    setActiveTab(tab);
  }, []);

  const openTeam = useCallback(
    (teamName: string) => {
      router.push({ pathname: '/team/[slug]', params: { slug: getTeamSlug(teamName) } });
    },
    [router],
  );

  if (!match || !fixture) {
    return (
      <AppShell>
        <PageContainer contentContainerStyle={styles.scrollContent}>
          <StickyBack label="← FIXTURES" onPress={onBack} />
          <Text style={styles.error}>Match not found.</Text>
        </PageContainer>
      </AppShell>
    );
  }

  const showJourneyExtras = activeTab === 'stats';

  return (
    <AppShell>
      <PageContainer contentContainerStyle={styles.scrollContent}>
        <StickyBack label="← FIXTURES" onPress={onBack} />

        <MatchHeader match={match} />

        <View style={styles.teamLinks}>
          <Pressable onPress={() => openTeam(match.homeTeam.name)}>
            <Text style={styles.teamLink}>{match.homeTeam.name} squad →</Text>
          </Pressable>
          <Pressable onPress={() => openTeam(match.awayTeam.name)}>
            <Text style={styles.teamLink}>{match.awayTeam.name} squad →</Text>
          </Pressable>
        </View>

        <FixtureJourneyBar active={journeyStep} onStep={handleJourney} />
        <MatchTabBar activeTab={activeTab} onTabChange={handleTabChange} isUpcoming={isUpcoming} />

        <TabPanel visible={activeTab === 'summary'}>
          <View style={styles.summaryGap}>
            {!isUpcoming ? <MatchTimeline match={match} /> : null}
            <MatchSummaryPanel fixture={fixture} />
            {!isUpcoming ? <MatchStats stats={match.stats} /> : null}
          </View>
        </TabPanel>
        <TabPanel visible={activeTab === 'h2h'}>
          <H2HPanel results={h2h} homeTeamName={match.homeTeam.name} awayTeamName={match.awayTeam.name} />
        </TabPanel>
        <TabPanel visible={activeTab === 'lineups'}>
          <MatchLineupsPanel fixture={fixture} />
        </TabPanel>
        <TabPanel visible={activeTab === 'odds'}>
          <MatchOddsPanel fixture={fixture} />
        </TabPanel>
        <TabPanel visible={activeTab === 'draw'}>
          <MatchDrawPanel fixture={fixture} />
        </TabPanel>
        <TabPanel visible={activeTab === 'footy'}>
          <MatchFootyPanel fixture={fixture} />
        </TabPanel>
        <TabPanel visible={activeTab === 'stats'}>
          {showJourneyExtras && journeyStep === 'stats' ? <StrategyWorkflow activeStep={4} /> : null}
          {showJourneyExtras && journeyStep === 'fusion' ? <FixtureFusionSection fixture={fixture} /> : null}
          {showJourneyExtras && journeyStep === 'slip' ? <FixtureBetSlipSection fixture={fixture} /> : null}
          {journeyStep === 'stats' ? <FixtureStatsDashboard fixtureId={matchId} /> : null}
        </TabPanel>
        <TabPanel visible={activeTab === 'table'}>
          {standings.length > 0 ? (
            <StandingsTable
              standings={standings}
              highlightTeams={[match.homeTeam.name, match.awayTeam.name]}
              seasonLabel={`${leagueMeta?.name ?? 'League'} — ${leagueMeta?.season ?? ''}`}
            />
          ) : (
            <Text style={styles.partialNote}>
              Knockout competitions do not have a league table.
            </Text>
          )}
        </TabPanel>
      </PageContainer>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: spacing.page,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
    width: '100%',
  },
  teamLinks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.lg,
    marginBottom: spacing.sm,
  },
  teamLink: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: theme.accentBlue,
  },
  summaryGap: {
    gap: spacing.md,
    width: '100%',
    marginTop: spacing.lg,
  },
  partialNote: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: theme.textMuted,
    fontStyle: 'italic',
    padding: spacing.lg,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    width: '100%',
    marginTop: spacing.lg,
  },
  error: {
    fontFamily: fonts.body,
    fontSize: 16,
    color: theme.textMuted,
    marginTop: spacing.lg,
  },
});
