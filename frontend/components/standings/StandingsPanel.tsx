import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useScoresFilter } from '@/components/layout/ScoresFilterContext';
import ScoresMatchRow from '@/components/scores/ScoresMatchRow';
import CountryFlag from '@/components/shared/CountryFlag';
import PageContainer from '@/components/shared/PageContainer';
import StandingsTable from '@/components/standings/StandingsTable';
import { useStandings } from '@/hooks/useStandings';
import {
  fetchAllFixturesBetween,
  mapFixture,
  seasonWindowUnix,
  type Fixture,
} from '@/services/oddAlerts';
import { fonts, layout, spacing, theme } from '@/styles/theme';

export default function StandingsPanel() {
  const router = useRouter();
  const { selectedCompetition, selectedSeasonId, setSelectedSeasonId, setPanelMode } =
    useScoresFilter();

  const competition = selectedCompetition;
  const { standings, tier, loading, error } = useStandings(competition, selectedSeasonId);

  if (!competition) return null;

  const season = competition.seasons.find((s) => s.seasonId === selectedSeasonId);

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
            {competition.country} · {competition.isCup ? 'Cup' : 'League'}
          </Text>
        </View>
      </View>

      {/* Season selector */}
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

      {competition.isCup ? (
        <CupResults
          competitionId={competition.id}
          seasonId={selectedSeasonId}
          seasonName={season?.seasonName ?? ''}
          onMatchPress={(id) => router.push({ pathname: '/match/[id]', params: { id: String(id) } })}
        />
      ) : loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.accentGreen} />
          <Text style={styles.muted}>Loading standings…</Text>
        </View>
      ) : error ? (
        <Text style={styles.muted}>{error}</Text>
      ) : standings.length === 0 ? (
        <Text style={styles.muted}>No standings available for this season.</Text>
      ) : (
        <StandingsTable rows={standings} tier={tier} />
      )}
    </PageContainer>
  );
}

// ----- Cup results (no league table) --------------------------------------

function CupResults({
  competitionId,
  seasonId,
  seasonName,
  onMatchPress,
}: {
  competitionId: number;
  seasonId: number | null;
  seasonName: string;
  onMatchPress: (id: number) => void;
}) {
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (seasonId == null) return;
    let active = true;
    setLoading(true);
    const { fromUnix, toUnix } = seasonWindowUnix(seasonName);
    fetchAllFixturesBetween({ fromUnix, toUnix, competitions: String(competitionId), maxPages: 6 })
      .then((raw) => {
        if (!active) return;
        const mapped = raw
          .filter((f) => f.season_id == null || f.season_id === seasonId)
          .map(mapFixture)
          .sort((a, b) => b.kickoffUnix - a.kickoffUnix);
        setFixtures(mapped);
        setLoading(false);
      })
      .catch(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [competitionId, seasonId, seasonName]);

  const byDate = useMemo(() => {
    const groups = new Map<string, Fixture[]>();
    for (const f of fixtures) {
      const day = new Date(f.kickoffUnix * 1000).toLocaleDateString([], {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
      const list = groups.get(day) ?? [];
      list.push(f);
      groups.set(day, list);
    }
    return [...groups.entries()];
  }, [fixtures]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.accentGreen} />
        <Text style={styles.muted}>Loading fixtures…</Text>
      </View>
    );
  }
  if (fixtures.length === 0) {
    return <Text style={styles.muted}>No fixtures found for this season.</Text>;
  }

  return (
    <View>
      {byDate.map(([day, list]) => (
        <View key={day} style={styles.dateGroup}>
          <Text style={styles.dateLabel}>{day}</Text>
          <View style={styles.dateList}>
            {list.map((f) => (
              <ScoresMatchRow key={f.id} fixture={f} onPress={() => onMatchPress(f.id)} />
            ))}
          </View>
        </View>
      ))}
    </View>
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
  flag: { fontSize: 24 },
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
  dateGroup: { marginBottom: spacing.md },
  dateLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    color: theme.textMuted,
    paddingVertical: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dateList: { backgroundColor: theme.surface },
});
