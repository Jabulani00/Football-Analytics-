import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import H2HPanel from '@/components/match/H2HPanel';
import MatchHeader, { MatchGoalScorers } from '@/components/match/MatchHeader';
import MatchLineupsPanel from '@/components/match/MatchLineupsPanel';
import MatchOddsPanel from '@/components/match/MatchOddsPanel';
import MatchStats from '@/components/match/MatchStats';
import MatchStatsHub from '@/components/match/MatchStatsHub';
import MatchSummaryPanel from '@/components/match/MatchSummaryPanel';
import MatchTabBar, { type MatchTabId } from '@/components/match/MatchTabBar';
import MatchTimeline from '@/components/match/MatchTimeline';
import StandingsTable from '@/components/match/StandingsTable';
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

function TabPanel({ visible, children }: { visible: boolean; children: ReactNode }) {
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
  const h2h = getH2HForMatch(matchId);
  const standings = getStandingsForLeague(leagueId);
  const leagueMeta = leagueCompetitions[leagueId];

  const handleTabChange = useCallback((tab: MatchTabId) => {
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
      <PageContainer noPadding contentContainerStyle={styles.scrollContent}>
        <StickyBack label="← FIXTURES" onPress={onBack} />
        <Text style={styles.error}>Match not found.</Text>
      </PageContainer>
    );
  }

  return (
    <PageContainer noPadding contentContainerStyle={styles.scrollContent}>
      <StickyBack label="← FIXTURES" onPress={onBack} />
      <MatchHeader match={match} />
      <MatchGoalScorers events={{ home: match.homeTeam.events ?? [], away: match.awayTeam.events ?? [] }} />
      <View style={styles.teamLinks}>
        <Pressable onPress={() => openTeam(match.homeTeam.name)}>
          <Text style={styles.teamLink}>{match.homeTeam.name}</Text>
        </Pressable>
        <Text style={styles.teamSep}>·</Text>
        <Pressable onPress={() => openTeam(match.awayTeam.name)}>
          <Text style={styles.teamLink}>{match.awayTeam.name}</Text>
        </Pressable>
      </View>
      <MatchTabBar activeTab={activeTab} onTabChange={handleTabChange} />
      <TabPanel visible={activeTab === 'summary'}>
        <View style={styles.panel}>
          {!isUpcoming ? <MatchTimeline match={match} /> : null}
          <MatchSummaryPanel fixture={fixture} fixtureId={matchId} />
          {!isUpcoming ? <MatchStats stats={match.stats} /> : null}
        </View>
      </TabPanel>
      <TabPanel visible={activeTab === 'h2h'}>
        <View style={styles.panel}>
          <H2HPanel results={h2h} homeTeamName={match.homeTeam.name} awayTeamName={match.awayTeam.name} />
        </View>
      </TabPanel>
      <TabPanel visible={activeTab === 'lineups'}>
        <View style={styles.panel}>
          <MatchLineupsPanel fixture={fixture} />
        </View>
      </TabPanel>
      <TabPanel visible={activeTab === 'odds'}>
        <View style={styles.panel}>
          <MatchOddsPanel fixture={fixture} />
        </View>
      </TabPanel>
      <TabPanel visible={activeTab === 'table'}>
        <View style={styles.panel}>
          {standings.length > 0 ? (
            <StandingsTable
              standings={standings}
              highlightTeams={[match.homeTeam.name, match.awayTeam.name]}
              seasonLabel={`${leagueMeta?.name ?? 'League'} — ${leagueMeta?.season ?? ''}`}
            />
          ) : (
            <Text style={styles.partialNote}>Knockout competitions do not have a league table.</Text>
          )}
        </View>
      </TabPanel>
      <TabPanel visible={activeTab === 'stats'}>
        <MatchStatsHub fixture={fixture} matchId={matchId} />
      </TabPanel>
    </PageContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
    width: '100%',
  },
  teamLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  teamLink: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: theme.accentBlue,
  },
  teamSep: {
    color: theme.textFaint,
  },
  panel: {
    gap: spacing.md,
    width: '100%',
  },
  partialNote: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: theme.textMuted,
    fontStyle: 'italic',
    padding: spacing.md,
  },
  error: {
    fontFamily: fonts.body,
    fontSize: 16,
    color: theme.textMuted,
    marginTop: spacing.lg,
  },
});
