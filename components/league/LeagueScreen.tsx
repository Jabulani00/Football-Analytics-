import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  FormTable,
  LeagueOddsTable,
  SimpleTable,
  TopScorersTable,
} from '@/components/league/LeagueFeedTables';
import LeagueIntelligencePanel from '@/components/league/LeagueIntelligencePanel';
import LeagueMainTabBar, { type LeagueMainTabId } from '@/components/league/LeagueMainTabBar';
import LeagueResultsPanel from '@/components/league/LeagueResultsPanel';
import LeagueStandingsPanel from '@/components/league/LeagueStandingsPanel';
import AppShell from '@/components/shared/AppShell';
import PageContainer from '@/components/shared/PageContainer';
import StickyBack from '@/components/shared/StickyBack';
import { PROJECT_META } from '@/constants/statsCatalogue';
import { getFixturesForLeague } from '@/mock/fixturesData';
import {
  getHtFtTrends,
  getLeagueForm,
  getLeagueOddsOverview,
  getOverUnderTrends,
  getTopScorers,
} from '@/mock/leagueFeedData';
import type { League } from '@/mock/leaguesData';
import { fonts, spacing, theme } from '@/styles/theme';
import { getReferenceDateKey } from '@/utils/dates';

type LeagueScreenProps = {
  league: League;
  onBack: () => void;
  onMatchPress: (matchId: string) => void;
};

export default function LeagueScreen({ league, onBack, onMatchPress }: LeagueScreenProps) {
  const fixtures = getFixturesForLeague(league.id);
  const [activeTab, setActiveTab] = useState<LeagueMainTabId>('results');

  const defaultDate = getReferenceDateKey();
  const [selectedDate, setSelectedDate] = useState(defaultDate);

  const filtered = useMemo(
    () => fixtures.filter((f) => f.date === selectedDate),
    [fixtures, selectedDate],
  );

  const upcoming = useMemo(() => filtered.filter((f) => f.status === 'NS'), [filtered]);
  const inPlay = useMemo(() => filtered.filter((f) => f.status !== 'NS'), [filtered]);

  const oddsOverview = useMemo(
    () => getLeagueOddsOverview(league.id, fixtures.filter((f) => f.status === 'NS')),
    [league.id, fixtures],
  );

  return (
    <AppShell>
      <PageContainer contentContainerStyle={styles.scroll}>
        <StickyBack label="← LEAGUES" onPress={onBack} />

        <View style={styles.header}>
          <Text style={styles.flag}>{league.flag}</Text>
          <View style={styles.headerText}>
            <Text style={styles.leagueName}>{league.name}</Text>
            <Text style={styles.country}>{league.country}</Text>
            <Text style={styles.engineLine}>
              Scoreline engine · {PROJECT_META.ordinaryCount} ordinary stats · {PROJECT_META.totalTables}{' '}
              tables
            </Text>
          </View>
        </View>

        <LeagueMainTabBar active={activeTab} onChange={setActiveTab} />

        {activeTab === 'results' ? (
          <LeagueResultsPanel
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            upcoming={upcoming}
            inPlay={inPlay}
            onMatchPress={onMatchPress}
          />
        ) : null}

        {activeTab === 'standings' ? (
          <LeagueStandingsPanel leagueId={league.id} leagueName={league.name} />
        ) : null}

        {activeTab === 'topScorers' ? <TopScorersTable rows={getTopScorers(league.id)} /> : null}

        {activeTab === 'form' ? <FormTable rows={getLeagueForm(league.id)} /> : null}

        {activeTab === 'overUnder' ? (
          <SimpleTable title="OVER / UNDER TRENDS" rows={getOverUnderTrends(league.id)} />
        ) : null}

        {activeTab === 'htft' ? (
          <SimpleTable title="HT / FT PATTERNS" rows={getHtFtTrends(league.id)} />
        ) : null}

        {activeTab === 'odds' ? <LeagueOddsTable rows={oddsOverview} /> : null}

        {activeTab === 'intelligence' ? <LeagueIntelligencePanel league={league} /> : null}
      </PageContainer>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: spacing.page,
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
    width: '100%',
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  headerText: {
    flex: 1,
  },
  flag: {
    fontSize: 48,
  },
  leagueName: {
    fontFamily: fonts.display,
    fontSize: 36,
    color: theme.textPrimary,
  },
  country: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: theme.textMuted,
    marginTop: spacing.xs,
  },
  engineLine: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: theme.accentGreen,
    marginTop: spacing.sm,
  },
});
