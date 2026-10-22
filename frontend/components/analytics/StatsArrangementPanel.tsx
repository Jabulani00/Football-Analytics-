import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useQueries } from '@tanstack/react-query';

import StatsArrangementReference from '@/components/analytics/StatsArrangementReference';
import FilterDropdown from '@/components/shared/FilterDropdown';
import { useLiveCompetitionFeed } from '@/hooks/useLiveCompetitions';
import { useLiveFixtures } from '@/hooks/useLiveFixtures';
import { fetchAllFixturesBetween, seasonWindowUnix } from '@/services/oddAlerts';
import { clientStaleTime } from '@/services/oddAlertsCachePolicy';
import { buildLeagueStatsLive } from '@/services/statsBuilder';
import {
  gradeCompetition,
  rankTeams,
  rankMatches,
  nextFixtureForTeam,
  MIN_SAMPLE,
  type ArrangementGrade,
  type GradedStat,
  type RankedTeam,
  type UpcomingFixtureLite,
} from '@/utils/statsArrangement';
import { fonts, layout, spacing, theme } from '@/styles/theme';

type Mode = 'teams' | 'matches';

const LIMIT_OPTIONS = [
  { value: '6', label: 'Top 6 leagues' },
  { value: '10', label: 'Top 10 leagues' },
  { value: '16', label: 'Top 16 leagues' },
  { value: '24', label: 'All (up to 24)' },
];

function gradeColor(grade: ArrangementGrade): string {
  if (grade === 'A' || grade === 'B') return theme.accentGreen;
  if (grade === 'C') return theme.yellow;
  return theme.loss;
}

function GradeBadge({ stat }: { stat: GradedStat }) {
  return (
    <View style={[styles.statChip, { borderColor: gradeColor(stat.grade) }]}>
      <Text style={[styles.statChipGrade, { color: gradeColor(stat.grade) }]}>{stat.grade}</Text>
      <Text style={styles.statChipLabel}>{stat.label}</Text>
      <Text style={styles.statChipVal}>{Math.round(stat.overallValue)}%</Text>
      {stat.da ? <Text style={styles.statChipDa}>DA</Text> : null}
    </View>
  );
}

function kickoffLabel(unix: number, fallback: string): string {
  if (!Number.isFinite(unix) || unix <= 0) return fallback;
  try {
    return new Date(unix * 1000).toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return fallback;
  }
}

export default function StatsArrangementPanel() {
  const narrow = useWindowDimensions().width < 720;
  const [mode, setMode] = useState<Mode>('teams');
  const [limit, setLimit] = useState('10');
  const [showReference, setShowReference] = useState(false);

  const feed = useLiveCompetitionFeed(7);
  const comps = useMemo(
    () => feed.competitions.slice(0, Number(limit)),
    [feed.competitions, limit],
  );

  const results = useQueries({
    queries: comps.map((comp) => {
      const { fromUnix, toUnix } = seasonWindowUnix(comp.season ?? '');
      return {
        queryKey: ['stats-arrangement', comp.id, comp.season] as const,
        queryFn: () =>
          buildLeagueStatsLive((o) => fetchAllFixturesBetween(o), {
            competitionId: comp.id,
            fromUnix,
            toUnix,
            season: comp.season,
          }),
        staleTime: clientStaleTime('stats/season'),
      };
    }),
  });

  // Stable signature so grading only re-runs when a competition's data lands.
  const dataSig = results
    .map((r, i) => (r.data ? `${comps[i]?.id}:${r.dataUpdatedAt}` : ''))
    .join('|');

  const rankedTeams = useMemo(() => {
    const groups = results.map((r, i) =>
      r.data && comps[i] ? gradeCompetition(r.data, comps[i].id, comps[i].name) : [],
    );
    return rankTeams(groups).filter((team) => team.strong > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataSig]);

  const up = useLiveFixtures('ns', { upcomingDays: 7, upcomingScope: 'all' });
  const upcoming: UpcomingFixtureLite[] = useMemo(
    () =>
      up.fixtures.map((fx) => ({
        id: fx.id,
        kickoffUnix: fx.kickoffUnix,
        kickoff: fx.kickoff,
        competition: fx.competition.name,
        homeId: fx.home.id,
        homeName: fx.home.name,
        awayId: fx.away.id,
        awayName: fx.away.name,
      })),
    [up.fixtures],
  );

  const rankedMatches = useMemo(
    () => rankMatches(rankedTeams, upcoming).filter((m) => m.combinedStrong > 0),
    [rankedTeams, upcoming],
  );

  const settled = results.filter((r) => r.isSuccess || r.isError).length;
  const scanning = feed.loading || settled < comps.length;
  const errored = results.filter((r) => r.isError).length;

  const topTeams = rankedTeams.slice(0, 40);
  const topMatches = rankedMatches.slice(0, 40);

  return (
    <View style={styles.container}>
      <View style={styles.intro}>
        <Text style={styles.introTitle}>Call-outs</Text>
        <Text style={styles.introText}>
          Teams graded strong across the stat catalogue (A/B/C), ranked over every live league, then
          tied to their next fixture. Nothing is recomputed — the grades read the live stat tables
          already built elsewhere in the app.
        </Text>
      </View>

      <View style={[styles.controls, narrow && styles.controlsNarrow]}>
        <FilterDropdown
          label="Show"
          value={mode}
          options={[
            { value: 'teams', label: 'Strong teams' },
            { value: 'matches', label: 'Upcoming matches' },
          ]}
          onChange={(value) => setMode(value as Mode)}
          style={narrow ? styles.controlFull : undefined}
        />
        <FilterDropdown
          label="League scope"
          value={limit}
          options={LIMIT_OPTIONS}
          onChange={setLimit}
          style={narrow ? styles.controlFull : undefined}
        />
      </View>

      <View style={styles.statusRow}>
        {scanning ? (
          <>
            <ActivityIndicator size="small" color={theme.accentGreen} />
            <Text style={styles.statusMuted}>
              {feed.loading
                ? 'Finding live leagues…'
                : `Grading ${settled}/${comps.length} leagues…`}
            </Text>
          </>
        ) : (
          <Text style={[styles.statusText, styles.statusLive]}>
            ● {comps.length} leagues graded · {rankedTeams.length} strong teams
            {errored > 0 ? ` · ${errored} league(s) unavailable` : ''}
          </Text>
        )}
      </View>

      <View style={styles.legendRow}>
        <Legend color={theme.accentGreen} text="A/B strong" />
        <Legend color={theme.yellow} text="C above-avg" />
        <Text style={styles.legendDa}>DA</Text>
        <Text style={styles.legendText}>Double Agent · strong Home, middling Overall</Text>
      </View>

      {mode === 'teams' ? (
        topTeams.length === 0 ? (
          <Text style={styles.empty}>
            {scanning ? 'Grading leagues…' : 'No teams graded strong yet in the scanned leagues.'}
          </Text>
        ) : (
          topTeams.map((team, i) => (
            <TeamCard key={`${team.competitionId}-${team.team}`} rank={i + 1} team={team} upcoming={upcoming} />
          ))
        )
      ) : topMatches.length === 0 ? (
        <Text style={styles.empty}>
          {scanning || up.loading
            ? 'Matching strong teams to fixtures…'
            : 'No upcoming fixtures feature a strong team yet.'}
        </Text>
      ) : (
        topMatches.map((m) => <MatchCard key={m.fixtureId} match={m} />)
      )}

      {up.error && mode === 'matches' ? (
        <Text style={styles.empty}>Upcoming fixtures unavailable: {up.error}</Text>
      ) : null}

      {/* Strategy reference — the framework the grades come from. */}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: showReference }}
        onPress={() => setShowReference((open) => !open)}
        style={({ pressed }) => [styles.refToggle, pressed && styles.pressed]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.refToggleTitle}>Strategy reference</Text>
          <Text style={styles.refToggleHint}>A–F grading, reading methods, DA triggers, and where each lives in code</Text>
        </View>
        <Text style={styles.chevron}>{showReference ? '▴' : '▾'}</Text>
      </Pressable>
      {showReference ? (
        <View style={styles.refBody}>
          <StatsArrangementReference />
        </View>
      ) : null}
    </View>
  );
}

function Legend({ color, text }: { color: string; text: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{text}</Text>
    </View>
  );
}

function TeamCard({ rank, team, upcoming }: { rank: number; team: RankedTeam; upcoming: UpcomingFixtureLite[] }) {
  const next = nextFixtureForTeam(team, upcoming);
  const thin = (team.sample ?? 0) < MIN_SAMPLE;
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.rank}>{rank}</Text>
        <View style={styles.cardHeadText}>
          <Text style={styles.teamName} numberOfLines={1}>
            {team.team}
            {thin ? ` · ${team.sample ?? 0} games` : ''}
          </Text>
          <Text style={styles.compName} numberOfLines={1}>{team.competition}</Text>
        </View>
        <View style={styles.countBox}>
          <Text style={styles.countStrong}>{team.strong}</Text>
          <Text style={styles.countLabel}>strong</Text>
        </View>
      </View>

      <View style={styles.statChips}>
        {team.strongStats.slice(0, 8).map((stat) => (
          <GradeBadge key={stat.key} stat={stat} />
        ))}
        {team.strongStats.length > 8 ? (
          <Text style={styles.moreStats}>+{team.strongStats.length - 8} more</Text>
        ) : null}
      </View>

      {next ? (
        <View style={styles.fixtureRow}>
          <Text style={styles.fixtureSide}>{next.side === 'home' ? 'HOME' : 'AWAY'}</Text>
          <Text style={styles.fixtureText} numberOfLines={1}>
            vs {next.opponent} · {kickoffLabel(next.fixture.kickoffUnix, next.fixture.kickoff)}
          </Text>
        </View>
      ) : (
        <Text style={styles.fixtureNone}>No upcoming fixture in the next 7 days.</Text>
      )}
    </View>
  );
}

function MatchCard({ match }: { match: ReturnType<typeof rankMatches>[number] }) {
  return (
    <View style={styles.card}>
      <View style={styles.matchHead}>
        <Text style={styles.matchTitle} numberOfLines={1}>
          {match.homeName} vs {match.awayName}
        </Text>
        <Text style={styles.matchMeta}>{kickoffLabel(match.kickoffUnix, match.kickoff)}</Text>
      </View>
      <Text style={styles.compName}>{match.competition}</Text>
      <View style={styles.matchSides}>
        <MatchSide label="Home" team={match.home} />
        <MatchSide label="Away" team={match.away} />
      </View>
    </View>
  );
}

function MatchSide({ label, team }: { label: string; team: RankedTeam | null }) {
  return (
    <View style={styles.matchSide}>
      <Text style={styles.matchSideLabel}>{label}</Text>
      {team ? (
        <>
          <Text style={styles.matchSideStrong}>{team.strong} strong · {team.aCount} A</Text>
          <View style={styles.statChips}>
            {team.strongStats.slice(0, 3).map((stat) => (
              <GradeBadge key={stat.key} stat={stat} />
            ))}
          </View>
        </>
      ) : (
        <Text style={styles.matchSideNone}>not graded strong</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', maxWidth: 920, alignSelf: 'center' },
  intro: { marginBottom: spacing.md },
  introTitle: { fontFamily: fonts.display, fontSize: 22, color: theme.textPrimary, marginBottom: spacing.xs },
  introText: { fontFamily: fonts.body, fontSize: 13, lineHeight: 20, color: theme.textMuted },

  controls: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  controlsNarrow: { flexDirection: 'column' },
  controlFull: { width: '100%', minWidth: 0, flexBasis: 'auto', flexGrow: 0 },

  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 20, marginBottom: spacing.sm },
  statusText: { fontFamily: fonts.bodyMedium, fontSize: 12 },
  statusLive: { color: theme.accentGreen },
  statusMuted: { fontFamily: fonts.body, fontSize: 12, color: theme.textMuted },

  legendRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted },
  legendDa: {
    fontFamily: fonts.bodySemiBold, fontSize: 10, color: '#FFFFFF', letterSpacing: 0.5,
    backgroundColor: theme.accentPurple, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, overflow: 'hidden',
  },

  empty: { fontFamily: fonts.body, fontSize: 13, color: theme.textMuted, textAlign: 'center', paddingVertical: spacing.lg },

  card: {
    borderWidth: layout.borderWidth, borderColor: theme.border, borderRadius: layout.borderRadius,
    backgroundColor: theme.surface, padding: spacing.md, marginBottom: spacing.sm, gap: spacing.sm,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rank: { fontFamily: fonts.display, fontSize: 18, color: theme.textFaint, width: 28 },
  cardHeadText: { flex: 1 },
  teamName: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: theme.textPrimary },
  compName: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted, marginTop: 1 },
  countBox: { alignItems: 'center', minWidth: 48 },
  countStrong: { fontFamily: fonts.display, fontSize: 22, color: theme.accentGreen },
  countLabel: { fontFamily: fonts.body, fontSize: 9, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },

  statChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  statChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: layout.borderWidth, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3,
    backgroundColor: theme.surfaceHover,
  },
  statChipGrade: { fontFamily: fonts.bodySemiBold, fontSize: 11 },
  statChipLabel: { fontFamily: fonts.body, fontSize: 11, color: theme.textPrimary },
  statChipVal: { fontFamily: fonts.bodyMedium, fontSize: 11, color: theme.textMuted },
  statChipDa: {
    fontFamily: fonts.bodySemiBold, fontSize: 8, color: '#FFFFFF',
    backgroundColor: theme.accentPurple, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 999, overflow: 'hidden',
  },
  moreStats: { fontFamily: fonts.body, fontSize: 11, color: theme.textFaint },

  fixtureRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    borderTopWidth: layout.borderWidth, borderTopColor: theme.border, paddingTop: spacing.sm,
  },
  fixtureSide: {
    fontFamily: fonts.bodySemiBold, fontSize: 10, color: theme.accentBlue, letterSpacing: 0.5,
    borderWidth: 1, borderColor: theme.accentBlue, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, overflow: 'hidden',
  },
  fixtureText: { flex: 1, fontFamily: fonts.body, fontSize: 12, color: theme.textPrimary },
  fixtureNone: {
    fontFamily: fonts.body, fontSize: 11, color: theme.textFaint,
    borderTopWidth: layout.borderWidth, borderTopColor: theme.border, paddingTop: spacing.sm,
  },

  matchHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  matchTitle: { flex: 1, fontFamily: fonts.bodySemiBold, fontSize: 15, color: theme.textPrimary },
  matchMeta: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted },
  matchSides: { flexDirection: 'row', gap: spacing.sm },
  matchSide: {
    flex: 1, borderWidth: layout.borderWidth, borderColor: theme.border, borderRadius: layout.borderRadius,
    padding: spacing.sm, gap: 4, backgroundColor: theme.surfaceHover,
  },
  matchSideLabel: { fontFamily: fonts.bodySemiBold, fontSize: 10, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  matchSideStrong: { fontFamily: fonts.bodyMedium, fontSize: 12, color: theme.accentGreen },
  matchSideNone: { fontFamily: fonts.body, fontSize: 11, color: theme.textFaint },

  refToggle: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    borderWidth: layout.borderWidth, borderColor: theme.border, borderRadius: layout.borderRadius,
    backgroundColor: theme.surfaceMuted, padding: spacing.md, marginTop: spacing.lg,
  },
  pressed: { opacity: 0.7 },
  refToggleTitle: { fontFamily: fonts.displaySemi, fontSize: 15, color: theme.textPrimary },
  refToggleHint: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted, marginTop: 2 },
  chevron: { fontFamily: fonts.bodySemiBold, fontSize: 18, color: theme.accentGreen },
  refBody: { marginTop: spacing.md },
});
