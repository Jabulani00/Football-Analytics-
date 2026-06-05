import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  FormTable,
  LeagueOddsTable,
  SimpleTable,
  TopScorersTable,
} from '@/components/league/LeagueFeedTables';
import LeagueMainTabBar, { type LeagueTabId } from '@/components/league/LeagueMainTabBar';
import LeagueResultsPanel from '@/components/league/LeagueResultsPanel';
import LeagueStandingsPanel from '@/components/league/LeagueStandingsPanel';
import PageContainer from '@/components/shared/PageContainer';
import StickyBack from '@/components/shared/StickyBack';
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
  const [activeTab, setActiveTab] = useState<LeagueTabId>('results');

  const defaultDate = getReferenceDateKey();
  const [selectedDate, setSelectedDate] = useState(defaultDate);

  const filtered = useMemo(
    () => fixtures.filter((f) => f.date === selectedDate),
    [fixtures, selectedDate],
  );

  const sortedFixtures = useMemo(
    () =>
      [...filtered].sort((a, b) => {
        const order = { LIVE: 0, HT: 1, FT: 2, NS: 3 };
        if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
        return a.kickoff.localeCompare(b.kickoff);
      }),
    [filtered],
  );

  const oddsOverview = useMemo(
    () => getLeagueOddsOverview(league.id, fixtures.filter((f) => f.status === 'NS')),
    [league.id, fixtures],
  );

  return (
    <PageContainer noPadding contentContainerStyle={styles.scroll}>
      <StickyBack label="← ALL SCORES" onPress={onBack} />

      <View style={styles.header}>
        <Text style={styles.flag}>{league.flag}</Text>
        <View style={styles.headerText}>
          <Text style={styles.leagueName}>{league.name}</Text>
          <Text style={styles.country}>{league.country}</Text>
        </View>
      </View>

      <LeagueMainTabBar
        activeTab={activeTab}
        onPrimaryChange={setActiveTab}
        onSecondaryChange={setActiveTab}
      />

      {activeTab === 'results' ? (
        <LeagueResultsPanel
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          fixtures={sortedFixtures}
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
    </PageContainer>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  headerText: {
    flex: 1,
  },
  flag: {
    fontSize: 28,
  },
  leagueName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 18,
    color: theme.textPrimary,
  },
  country: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textMuted,
  },
});
