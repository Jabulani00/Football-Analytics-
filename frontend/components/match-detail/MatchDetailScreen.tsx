import { useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import CountryFlag from '@/components/shared/CountryFlag';
import LivePulse from '@/components/shared/LivePulse';
import PageContainer from '@/components/shared/PageContainer';
import TeamLogo from '@/components/shared/TeamLogo';
import GroupStandingsView from '@/components/standings/GroupStandingsView';
import GoalScorersPanel from '@/components/match-detail/GoalScorersPanel';
import PitchLineup from '@/components/match-detail/PitchLineup';
import { useMatchDetail } from '@/hooks/useMatchDetail';
import {
  mapFixture,
  standingsMovement,
  type Competition,
  type Movement,
  type RawFixtureDetail,
  type SquadPlayer,
  type StandingRow,
} from '@/services/oddAlerts';
import type { MatchGoalEvent } from '@/services/apiFootball';
import { fonts, layout, spacing, theme } from '@/styles/theme';
import {
  formatOutcome,
  oddsMarkets,
  probabilityGroups,
  scoreBreakdown,
  statsByCategory,
} from '@/utils/matchDetailDisplay';
import { isGroupStageTournament } from '@/utils/groupStandings';

type MatchDetailScreenProps = {
  matchId: string;
  onBack: () => void;
};

type TabId = 'summary' | 'stats' | 'odds' | 'h2h' | 'lineups' | 'standings';

const TABS: { id: TabId; label: string }[] = [
  { id: 'summary', label: 'Summary' },
  { id: 'stats', label: 'Stats' },
  { id: 'odds', label: 'Odds' },
  { id: 'h2h', label: 'H2H' },
  { id: 'lineups', label: 'Lineups' },
  { id: 'standings', label: 'Table' },
];

export default function MatchDetailScreen({ matchId, onBack }: MatchDetailScreenProps) {
  const router = useRouter();
  const { detail, squads, standings, goals, goalsConfigured, goalsMatched, goalsLoading, loading, error, refresh } =
    useMatchDetail(matchId);
  const [tab, setTab] = useState<TabId>('summary');

  const fixture = useMemo(() => (detail ? mapFixture(detail) : null), [detail]);

  const openTeam = (teamId: number | null, name: string) => {
    if (!teamId) return;
    router.push({ pathname: '/team/[slug]', params: { slug: String(teamId), name } });
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.accentGreen} />
        <Text style={styles.muted}>Loading match…</Text>
      </View>
    );
  }

  if (error || !detail || !fixture) {
    return (
      <View style={styles.center}>
        <BackLink onPress={onBack} />
        <Text style={styles.errorText}>{error ?? 'Match not found.'}</Text>
        <Pressable onPress={refresh} style={styles.retryBtn}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const isLive = fixture.status === 'LIVE' || fixture.status === 'HT';
  const started = isLive || fixture.status === 'FT';

  const movement =
    started && standings.length > 0
      ? standingsMovement(standings, {
          homeId: fixture.home.id,
          awayId: fixture.away.id,
          homeGoals: fixture.home.goals,
          awayGoals: fixture.away.goals,
        })
      : null;
  const statusLabel =
    fixture.status === 'NS'
      ? fixture.kickoff
      : fixture.status === 'HT'
        ? 'Half-time'
        : fixture.status === 'FT'
          ? 'Full-time'
          : `${fixture.minute ?? 0}${fixture.addedTime ? `+${fixture.addedTime}` : ''}'`;

  const scores = scoreBreakdown(detail);

  const groupCompetition = useMemo((): Competition | null => {
    if (!isGroupStageTournament(detail.competition_name) || !detail.season_id) return null;
    return {
      id: detail.competition_id,
      name: detail.competition_name,
      slug: '',
      country: detail.competition_country,
      countryId: 0,
      type: detail.competition_type,
      isCup: true,
      currentSeason: detail.season_id,
      seasons: [
        {
          seasonId: detail.season_id,
          seasonName: detail.season,
          played: null,
          progress: detail.season_progress ?? null,
          isCurrent: true,
        },
      ],
    };
  }, [detail]);

  return (
    <PageContainer contentContainerStyle={styles.scroll}>
      <BackLink onPress={onBack} />

      {/* Competition */}
      <View style={styles.compRow}>
        <CountryFlag name={detail.competition_country} size={13} />
        <Text style={styles.compText} numberOfLines={1}>
          {detail.competition_country} · {detail.competition_name}
          {detail.season ? ` · ${detail.season}` : ''}
        </Text>
      </View>

      {/* Scoreboard */}
      <View style={styles.scoreboard}>
        <Pressable
          style={styles.teamCol}
          onPress={() => openTeam(fixture.home.id, fixture.home.name)}>
          {fixture.kind === 'country' ? (
            <CountryFlag name={fixture.home.name} size={26} />
          ) : (
            <TeamLogo name={fixture.home.name} size={34} />
          )}
          <Text style={styles.teamName}>{fixture.home.name}</Text>
          {fixture.home.position != null ? (
            <Text style={styles.posHint}>#{fixture.home.position}</Text>
          ) : null}
          <MovementBadge m={movement?.home} />
        </Pressable>
        <View style={styles.scoreCol}>
          {started ? (
            <Text style={[styles.score, isLive && styles.scoreLive]}>
              {fixture.home.goals ?? 0} - {fixture.away.goals ?? 0}
            </Text>
          ) : (
            <Text style={styles.koTime}>{fixture.kickoff}</Text>
          )}
          <View style={styles.statusWrap}>
            {isLive ? <LivePulse size={5} /> : null}
            <Text style={[styles.statusText, isLive && styles.statusLive]}>{statusLabel}</Text>
          </View>
          {scores.ht ? (
            <Text style={styles.htScore}>
              HT {scores.ht.home}-{scores.ht.away}
              {scores.secondHalf
                ? ` · 2H ${scores.secondHalf.home}-${scores.secondHalf.away}`
                : ''}
            </Text>
          ) : null}
        </View>
        <Pressable
          style={styles.teamCol}
          onPress={() => openTeam(fixture.away.id, fixture.away.name)}>
          {fixture.kind === 'country' ? (
            <CountryFlag name={fixture.away.name} size={26} />
          ) : (
            <TeamLogo name={fixture.away.name} size={34} />
          )}
          <Text style={styles.teamName}>{fixture.away.name}</Text>
          {fixture.away.position != null ? (
            <Text style={styles.posHint}>#{fixture.away.position}</Text>
          ) : null}
          <MovementBadge m={movement?.away} />
        </Pressable>
      </View>

      {detail.venue ? <Text style={styles.venue}>{detail.venue}</Text> : null}

      {/* Tabs — scroll on narrow screens */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll}>
        <View style={styles.tabBar}>
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <Pressable
                key={t.id}
                onPress={() => setTab(t.id)}
                style={[styles.tabBtn, active && styles.tabBtnActive]}>
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      {tab === 'summary' ? (
        <SummaryTab
          detail={detail}
          homeName={fixture.home.name}
          awayName={fixture.away.name}
          goals={goals}
          goalsConfigured={goalsConfigured}
          goalsMatched={goalsMatched}
          goalsLoading={goalsLoading}
        />
      ) : tab === 'stats' ? (
        <StatsTab detail={detail} homeName={fixture.home.name} awayName={fixture.away.name} />
      ) : tab === 'odds' ? (
        <OddsTab detail={detail} homeName={fixture.home.name} awayName={fixture.away.name} />
      ) : tab === 'lineups' ? (
        <LineupsTab
          squads={squads}
          homeId={fixture.home.id}
          awayId={fixture.away.id}
          homeName={fixture.home.name}
          awayName={fixture.away.name}
          homeFormation={detail.home_formation}
          awayFormation={detail.away_formation}
        />
      ) : tab === 'h2h' ? (
        <H2HTab detail={detail} />
      ) : (
        <StandingsTab
          standings={standings}
          groupCompetition={groupCompetition}
          homeId={fixture.home.id}
          awayId={fixture.away.id}
          homeName={fixture.home.name}
          awayName={fixture.away.name}
          movement={movement}
          onTeamPress={openTeam}
        />
      )}
    </PageContainer>
  );
}

function BackLink({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.back}>
      <Text style={styles.backText}>← BACK</Text>
    </Pressable>
  );
}

/** "#7 ▲1 / ▼2 / =" — current league position and movement from this result. */
function MovementBadge({ m }: { m?: Movement }) {
  if (!m || m.position == null) return null;
  const d = m.delta;
  const arrow = d == null || d === 0 ? '=' : d > 0 ? `▲${d}` : `▼${Math.abs(d)}`;
  const color = d == null || d === 0 ? theme.textFaint : d > 0 ? theme.win : theme.loss;
  return (
    <Text style={[styles.moveBadge, { color }]}>
      #{m.position} {arrow}
    </Text>
  );
}

// ----- Summary ------------------------------------------------------------

function SummaryTab({
  detail,
  homeName,
  awayName,
  goals,
  goalsConfigured,
  goalsMatched,
  goalsLoading,
}: {
  detail: RawFixtureDetail;
  homeName: string;
  awayName: string;
  goals: MatchGoalEvent[];
  goalsConfigured: boolean;
  goalsMatched: boolean;
  goalsLoading: boolean;
}) {
  const prob = detail.probability;
  const scores = scoreBreakdown(detail);

  return (
    <View>
      <MatchInfoCard detail={detail} homeName={homeName} awayName={awayName} />

      <GoalScorersPanel
        homeName={homeName}
        awayName={awayName}
        goals={goals}
        configured={goalsConfigured}
        matched={goalsMatched}
        loading={goalsLoading}
      />

      {scores.ft ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Score breakdown</Text>
          <ScorePeriodRow label="Full time" home={scores.ft.home} away={scores.ft.away} bold />
          {scores.ht ? (
            <ScorePeriodRow label="1st half" home={scores.ht.home} away={scores.ht.away} />
          ) : null}
          {scores.secondHalf ? (
            <ScorePeriodRow label="2nd half" home={scores.secondHalf.home} away={scores.secondHalf.away} />
          ) : null}
        </View>
      ) : null}

      {prob ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Win probability</Text>
          <View style={styles.probRow}>
            <ProbCell label={homeName} value={prob.home_win} />
            <ProbCell label="Draw" value={prob.draw} />
            <ProbCell label={awayName} value={prob.away_win} />
          </View>
          {(prob.btts != null || prob.o25 != null) && (
            <View style={styles.quickProb}>
              {prob.btts != null ? <Text style={styles.quickProbItem}>BTTS {Math.round(prob.btts)}%</Text> : null}
              {prob.o25 != null ? <Text style={styles.quickProbItem}>O2.5 {Math.round(prob.o25)}%</Text> : null}
              {prob.home_win_ht != null ? (
                <Text style={styles.quickProbItem}>Home HT {Math.round(prob.home_win_ht)}%</Text>
              ) : null}
            </View>
          )}
        </View>
      ) : null}

      {detail.referee?.name ? (
        <Text style={styles.refLine}>Referee: {detail.referee.name}</Text>
      ) : null}
    </View>
  );
}

function MatchInfoCard({
  detail,
  homeName,
  awayName,
}: {
  detail: RawFixtureDetail;
  homeName: string;
  awayName: string;
}) {
  const rows: { label: string; value: string }[] = [];
  if (detail.date) rows.push({ label: 'Date', value: detail.date });
  if (detail.ko_human) rows.push({ label: 'Kick-off', value: detail.ko_human });
  if (detail.venue) rows.push({ label: 'Venue', value: detail.venue });
  if (detail.home_formation) rows.push({ label: `${homeName} formation`, value: detail.home_formation });
  if (detail.away_formation) rows.push({ label: `${awayName} formation`, value: detail.away_formation });
  if (detail.home_position != null) rows.push({ label: `${homeName} table`, value: `#${detail.home_position}` });
  if (detail.away_position != null) rows.push({ label: `${awayName} table`, value: `#${detail.away_position}` });
  if (detail.home_played != null) rows.push({ label: `${homeName} played`, value: String(detail.home_played) });
  if (detail.away_played != null) rows.push({ label: `${awayName} played`, value: String(detail.away_played) });
  if (detail.season_progress != null) rows.push({ label: 'Season progress', value: `${detail.season_progress}%` });
  if (detail.competition_predictability) {
    rows.push({ label: 'Predictability', value: detail.competition_predictability });
  }
  rows.push({ label: 'Competition type', value: detail.is_cup ? 'Cup' : 'League' });
  if (detail.is_friendly) rows.push({ label: 'Friendly', value: 'Yes' });
  if (detail.has_odds) rows.push({ label: 'Odds available', value: 'Yes' });
  if (detail.referee?.name) rows.push({ label: 'Referee', value: detail.referee.name });

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Match information</Text>
      {rows.map((r) => (
        <View key={r.label} style={styles.infoRow}>
          <Text style={styles.infoLabel}>{r.label}</Text>
          <Text style={styles.infoValue}>{r.value}</Text>
        </View>
      ))}
    </View>
  );
}

function ScorePeriodRow({
  label,
  home,
  away,
  bold,
}: {
  label: string;
  home: number;
  away: number;
  bold?: boolean;
}) {
  return (
    <View style={styles.periodRow}>
      <Text style={[styles.periodLabel, bold && styles.periodBold]}>{label}</Text>
      <Text style={[styles.periodScore, bold && styles.periodBold]}>
        {home} - {away}
      </Text>
    </View>
  );
}

// ----- Stats (all API match stats) ----------------------------------------

function StatsTab({
  detail,
  homeName,
  awayName,
}: {
  detail: RawFixtureDetail;
  homeName: string;
  awayName: string;
}) {
  const byCat = statsByCategory(detail.stats);
  if (byCat.size === 0) {
    return (
      <Text style={styles.muted}>
        Match stats appear once the game is live or finished. OddAlerts does not split live stats
        into 1st / 2nd half — only the half-time score line is available.
      </Text>
    );
  }
  return (
    <View>
      <Text style={styles.statsHeader}>
        {homeName} vs {awayName} — full match
      </Text>
      {[...byCat.entries()].map(([category, rows]) => (
        <View key={category} style={styles.card}>
          <Text style={styles.cardTitle}>{category}</Text>
          {rows.map((r) => (
            <StatComparison
              key={r.home}
              label={r.label}
              home={detail.stats?.[r.home] ?? null}
              away={detail.stats?.[r.away] ?? null}
              pct={r.pct}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

// ----- Odds & model probabilities -----------------------------------------

function OddsTab({
  detail,
  homeName,
  awayName,
}: {
  detail: RawFixtureDetail;
  homeName: string;
  awayName: string;
}) {
  const probGroups = probabilityGroups(detail.probability);
  const markets = oddsMarkets(detail.odds);

  if (probGroups.length === 0 && markets.length === 0) {
    return <Text style={styles.muted}>No odds or model probabilities for this fixture.</Text>;
  }

  return (
    <View>
      {probGroups.map((g) => (
        <View key={g.title} style={styles.card}>
          <Text style={styles.cardTitle}>{g.title}</Text>
          {g.rows.map((r) => (
            <View key={r.label} style={styles.oddsProbRow}>
              <Text style={styles.oddsProbLabel}>{r.label}</Text>
              <Text style={styles.oddsProbVal}>{Math.round(r.value)}%</Text>
            </View>
          ))}
        </View>
      ))}

      {markets.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Bookmaker odds</Text>
          <Text style={styles.apiNote}>
            All markets returned by the API for this fixture ({homeName} vs {awayName}).
          </Text>
          {markets.map((m) => (
            <View key={m.market} style={styles.oddsMarket}>
              <Text style={styles.oddsMarketTitle}>{m.label}</Text>
              <View style={styles.oddsOutcomes}>
                {m.outcomes.map((o) => (
                  <View key={o.key} style={styles.oddsChip}>
                    <Text style={styles.oddsChipKey}>{formatOutcome(o.key)}</Text>
                    <Text style={styles.oddsChipVal}>{o.value}</Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function ProbCell({ label, value }: { label: string; value?: number }) {
  return (
    <View style={styles.probCell}>
      <Text style={styles.probValue}>{value != null ? `${Math.round(value)}%` : '—'}</Text>
      <View style={styles.probBarTrack}>
        <View style={[styles.probBarFill, { width: `${Math.min(100, value ?? 0)}%` }]} />
      </View>
      <Text style={styles.probLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function StatComparison({
  label,
  home,
  away,
  pct,
}: {
  label: string;
  home: number | null;
  away: number | null;
  pct?: boolean;
}) {
  const h = home ?? 0;
  const a = away ?? 0;
  const total = h + a || 1;
  const suffix = pct ? '%' : '';
  return (
    <View style={styles.statRow}>
      <Text style={styles.statVal}>
        {home ?? '–'}
        {home != null ? suffix : ''}
      </Text>
      <View style={styles.statMid}>
        <Text style={styles.statLabel}>{label}</Text>
        <View style={styles.statBarTrack}>
          <View style={[styles.statBarHome, { flex: h / total }]} />
          <View style={[styles.statBarAway, { flex: a / total }]} />
        </View>
      </View>
      <Text style={[styles.statVal, styles.statValRight]}>
        {away ?? '–'}
        {away != null ? suffix : ''}
      </Text>
    </View>
  );
}

// ----- Lineups (pitch) ----------------------------------------------------

function LineupsTab({
  squads,
  homeId,
  awayId,
  homeName,
  awayName,
  homeFormation,
  awayFormation,
}: {
  squads: SquadPlayer[];
  homeId: number | null;
  awayId: number | null;
  homeName: string;
  awayName: string;
  homeFormation?: string | null;
  awayFormation?: string | null;
}) {
  if (squads.length === 0) {
    return <Text style={styles.muted}>Squad data isn&apos;t available for this match.</Text>;
  }
  return (
    <View style={styles.card}>
      <Text style={styles.lineupNote}>
        Players placed by position. The data feed doesn&apos;t publish a confirmed starting XI, so
        the pitch shows the most likely line by role with the rest of the squad below.
      </Text>
      <PitchLineup
        teamName={homeName}
        players={squads.filter((p) => p.teamId === homeId)}
        accent={theme.accentGreen}
        formation={homeFormation}
      />
      <PitchLineup
        teamName={awayName}
        players={squads.filter((p) => p.teamId === awayId)}
        accent={theme.accentBlue}
        formation={awayFormation}
      />
    </View>
  );
}

// ----- H2H ----------------------------------------------------------------

function H2HTab({ detail }: { detail: RawFixtureDetail }) {
  const h2h = detail.h2h ?? [];
  if (h2h.length === 0) {
    return <Text style={styles.muted}>No head-to-head history available.</Text>;
  }
  return (
    <View>
      <Text style={styles.statsHeader}>{h2h.length} previous meetings</Text>
      {h2h.map((m) => (
        <View key={m.id} style={styles.card}>
          <View style={styles.h2hHead}>
            <Text style={styles.h2hDate}>{m.date}</Text>
            <Text style={styles.h2hLeague}>{m.league}</Text>
          </View>
          <View style={styles.h2hMain}>
            <Text style={styles.h2hTeams} numberOfLines={2}>
              {m.home_name}
            </Text>
            <View style={styles.h2hScoreCol}>
              <Text style={styles.h2hScore}>
                {m.home_goals ?? 0} - {m.away_goals ?? 0}
              </Text>
              {m.ht_score ? <Text style={styles.h2hHt}>HT {m.ht_score}</Text> : null}
            </View>
            <Text style={[styles.h2hTeams, styles.h2hAway]} numberOfLines={2}>
              {m.away_name}
            </Text>
          </View>
          <View style={styles.h2hTags}>
            {m.btts ? <H2HTag label="BTTS" /> : <H2HTag label="No BTTS" muted />}
            {m.over_25 ? <H2HTag label="O2.5" /> : null}
            {m.home_win ? <H2HTag label="Home win" /> : null}
            {m.away_win ? <H2HTag label="Away win" /> : null}
            {m.draw ? <H2HTag label="Draw" /> : null}
            <H2HTag label={`${m.total_goals} goals`} muted />
          </View>
          {m.stats ? (
            <View style={styles.h2hMiniStats}>
              {m.stats.possession ? (
                <Text style={styles.h2hMiniLine}>
                  Possession {m.stats.possession.home}% - {m.stats.possession.away}%
                </Text>
              ) : null}
              {m.stats.corners ? (
                <Text style={styles.h2hMiniLine}>
                  Corners {m.stats.corners.home} - {m.stats.corners.away}
                </Text>
              ) : null}
              {m.stats.cards ? (
                <Text style={styles.h2hMiniLine}>
                  Cards {m.stats.cards.home} - {m.stats.cards.away}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}

function H2HTag({ label, muted }: { label: string; muted?: boolean }) {
  return (
    <View style={[styles.h2hTag, muted && styles.h2hTagMuted]}>
      <Text style={styles.h2hTagText}>{label}</Text>
    </View>
  );
}

// ----- Standings ----------------------------------------------------------

function StandingsTab({
  standings,
  groupCompetition,
  homeId,
  awayId,
  homeName,
  awayName,
  movement,
  onTeamPress,
}: {
  standings: StandingRow[];
  groupCompetition: Competition | null;
  homeId: number | null;
  awayId: number | null;
  homeName: string;
  awayName: string;
  movement: { home: Movement; away: Movement } | null;
  onTeamPress: (teamId: number | null, name: string) => void;
}) {
  if (groupCompetition) {
    return (
      <GroupStandingsView
        competition={groupCompetition}
        seasonId={groupCompetition.currentSeason}
        highlightTeamIds={[homeId, awayId].filter((id): id is number => id != null)}
        highlightNames={[homeName, awayName]}
        onTeamPress={(row) => onTeamPress(row.teamId, row.name)}
      />
    );
  }

  if (standings.length === 0) {
    return <Text style={styles.muted}>No standings available for this competition.</Text>;
  }
  return (
    <View style={styles.card}>
      <View style={[styles.tableRow, styles.tableHead]}>
        <Text style={[styles.cPos, styles.thText]}>#</Text>
        <Text style={[styles.cTeam, styles.thText]}>Team</Text>
        <Text style={[styles.cNum, styles.thText]}>P</Text>
        <Text style={[styles.cNum, styles.thText]}>GD</Text>
        <Text style={[styles.cNum, styles.thText]}>Pts</Text>
      </View>
      {standings.map((row) => {
        const highlight = row.teamId === homeId || row.teamId === awayId;
        const m =
          row.teamId === homeId ? movement?.home : row.teamId === awayId ? movement?.away : undefined;
        return (
          <Pressable
            key={row.teamId}
            onPress={() => onTeamPress(row.teamId, row.name)}
            style={({ hovered }) => [
              styles.tableRow,
              highlight && styles.tableRowActive,
              Platform.OS === 'web' && hovered ? styles.tableRowHover : null,
            ]}>
            <Text style={[styles.cPos, styles.tdText]}>{row.rank}</Text>
            <View style={styles.cTeam}>
              <TeamLogo name={row.name} size={16} />
              <Text style={[styles.tdText, highlight && styles.tdBold]} numberOfLines={1}>
                {row.name}
              </Text>
              {m && m.delta != null && m.delta !== 0 ? (
                <Text
                  style={[
                    styles.rowMove,
                    { color: m.delta > 0 ? theme.win : theme.loss },
                  ]}>
                  {m.delta > 0 ? `▲${m.delta}` : `▼${Math.abs(m.delta)}`}
                </Text>
              ) : null}
            </View>
            <Text style={[styles.cNum, styles.tdText]}>{row.played}</Text>
            <Text style={[styles.cNum, styles.tdText]}>
              {row.goalDiff > 0 ? `+${row.goalDiff}` : row.goalDiff}
            </Text>
            <Text style={[styles.cNum, styles.tdText, styles.tdBold]}>{row.points}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingTop: spacing.sm, paddingBottom: spacing.xxl, width: '100%' },
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxl, gap: spacing.sm },
  muted: { fontFamily: fonts.body, fontSize: 13, color: theme.textMuted, textAlign: 'center', paddingVertical: spacing.lg },
  errorText: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: theme.loss },
  retryBtn: { marginTop: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: layout.borderRadius, backgroundColor: theme.accentGreen },
  retryText: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.surface },
  back: { alignSelf: 'flex-start', paddingVertical: spacing.sm },
  backText: { fontFamily: fonts.bodyMedium, fontSize: 11, color: theme.textMuted, letterSpacing: 1, textTransform: 'uppercase' },
  compRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  flag: { fontSize: 16 },
  compText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: theme.textMuted, flex: 1 },
  scoreboard: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surface, borderRadius: layout.borderRadius, borderWidth: layout.borderWidth, borderColor: theme.border, paddingVertical: spacing.md, paddingHorizontal: spacing.sm },
  teamCol: { flex: 1, alignItems: 'center', gap: 4, ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : {}) },
  teamFlag: { fontSize: 22 },
  teamName: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: theme.textPrimary, textAlign: 'center' },
  lineupNote: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted, marginBottom: spacing.md, lineHeight: 16 },
  scoreCol: { width: 96, alignItems: 'center', gap: 3 },
  score: { fontFamily: fonts.display, fontSize: 26, color: theme.textPrimary },
  scoreLive: { color: theme.live },
  koTime: { fontFamily: fonts.display, fontSize: 20, color: theme.textPrimary },
  statusWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusText: { fontFamily: fonts.bodyMedium, fontSize: 11, color: theme.textMuted },
  statusLive: { color: theme.live, fontFamily: fonts.bodySemiBold },
  htScore: { fontFamily: fonts.body, fontSize: 10, color: theme.textFaint, textAlign: 'center' },
  posHint: { fontFamily: fonts.body, fontSize: 10, color: theme.textFaint },
  venue: { fontFamily: fonts.body, fontSize: 11, color: theme.textFaint, textAlign: 'center', marginTop: spacing.sm },
  tabScroll: { marginTop: spacing.md, flexGrow: 0 },
  tabBar: { flexDirection: 'row', marginBottom: spacing.md, borderBottomWidth: layout.borderWidth, borderBottomColor: theme.border },
  tabBtn: { alignItems: 'center', paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderBottomWidth: 2, borderBottomColor: 'transparent', ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : {}) },
  tabBtnActive: { borderBottomColor: theme.accentGreen },
  tabText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: theme.textMuted },
  tabTextActive: { color: theme.textPrimary, fontFamily: fonts.bodySemiBold },
  card: { backgroundColor: theme.surface, borderRadius: layout.borderRadius, borderWidth: layout.borderWidth, borderColor: theme.border, padding: spacing.md, marginBottom: spacing.md },
  cardTitle: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: theme.textPrimary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.sm },
  probRow: { flexDirection: 'row', gap: spacing.sm },
  probCell: { flex: 1, alignItems: 'center', gap: 4 },
  probValue: { fontFamily: fonts.display, fontSize: 16, color: theme.textPrimary },
  probBarTrack: { width: '100%', height: 4, borderRadius: 2, backgroundColor: theme.surfaceMuted, overflow: 'hidden' },
  probBarFill: { height: 4, backgroundColor: theme.accentGreen },
  probLabel: { fontFamily: fonts.body, fontSize: 10, color: theme.textMuted, textAlign: 'center' },
  oddsLine: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted, marginTop: spacing.sm, textAlign: 'center' },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 5 },
  statVal: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: theme.textPrimary, width: 40 },
  statValRight: { textAlign: 'right' },
  statMid: { flex: 1, alignItems: 'center', gap: 3 },
  statLabel: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted },
  statBarTrack: { flexDirection: 'row', width: '100%', height: 4, borderRadius: 2, backgroundColor: theme.surfaceMuted, overflow: 'hidden' },
  statBarHome: { backgroundColor: theme.accentGreen },
  statBarAway: { backgroundColor: theme.accentBlue },
  refLine: { fontFamily: fonts.body, fontSize: 11, color: theme.textFaint, textAlign: 'center' },
  statsHeader: { fontFamily: fonts.bodyMedium, fontSize: 12, color: theme.textMuted, marginBottom: spacing.sm },
  apiNote: { fontFamily: fonts.body, fontSize: 10, color: theme.textFaint, marginTop: spacing.sm, lineHeight: 15 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, gap: spacing.md },
  infoLabel: { fontFamily: fonts.body, fontSize: 12, color: theme.textMuted, flex: 1 },
  infoValue: { fontFamily: fonts.bodyMedium, fontSize: 12, color: theme.textPrimary, textAlign: 'right', flex: 1 },
  periodRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  periodLabel: { fontFamily: fonts.body, fontSize: 13, color: theme.textMuted },
  periodScore: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.textPrimary },
  periodBold: { fontFamily: fonts.bodySemiBold, color: theme.textPrimary },
  quickProb: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm, justifyContent: 'center' },
  quickProbItem: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted, backgroundColor: theme.surfaceMuted, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  oddsProbRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  oddsProbLabel: { fontFamily: fonts.body, fontSize: 12, color: theme.textMuted, flex: 1 },
  oddsProbVal: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: theme.textPrimary },
  oddsMarket: { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: layout.borderWidth, borderTopColor: theme.border },
  oddsMarketTitle: { fontFamily: fonts.bodySemiBold, fontSize: 11, color: theme.textPrimary, marginBottom: spacing.xs, textTransform: 'uppercase' },
  oddsOutcomes: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  oddsChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.surfaceMuted, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  oddsChipKey: { fontFamily: fonts.body, fontSize: 10, color: theme.textMuted },
  oddsChipVal: { fontFamily: fonts.bodySemiBold, fontSize: 11, color: theme.textPrimary },
  h2hHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs },
  h2hLeague: { fontFamily: fonts.body, fontSize: 10, color: theme.textFaint },
  h2hMain: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  h2hScoreCol: { alignItems: 'center', minWidth: 56 },
  h2hHt: { fontFamily: fonts.body, fontSize: 10, color: theme.textFaint },
  h2hTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: spacing.sm },
  h2hTag: { backgroundColor: 'rgba(5, 150, 105, 0.12)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3 },
  h2hTagMuted: { backgroundColor: theme.surfaceMuted },
  h2hTagText: { fontFamily: fonts.body, fontSize: 10, color: theme.textMuted },
  h2hMiniStats: { marginTop: spacing.sm, gap: 2 },
  h2hMiniLine: { fontFamily: fonts.body, fontSize: 10, color: theme.textFaint },
  h2hDate: { fontFamily: fonts.body, fontSize: 10, color: theme.textFaint },
  h2hTeams: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 12, color: theme.textPrimary, textAlign: 'right' },
  h2hAway: { textAlign: 'left' },
  h2hScore: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: theme.textPrimary, textAlign: 'center' },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: spacing.xs },
  tableHead: { borderBottomWidth: layout.borderWidth, borderBottomColor: theme.border },
  tableRowActive: { backgroundColor: 'rgba(5, 150, 105, 0.08)' },
  tableRowHover: { backgroundColor: theme.surfaceHover },
  thText: { fontFamily: fonts.bodySemiBold, fontSize: 10, color: theme.textFaint, textTransform: 'uppercase' },
  tdText: { fontFamily: fonts.body, fontSize: 12, color: theme.textPrimary },
  tdBold: { fontFamily: fonts.bodySemiBold },
  cPos: { width: 26, textAlign: 'center' },
  cTeam: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minWidth: 0 },
  cNum: { width: 34, textAlign: 'center' },
  moveBadge: { fontFamily: fonts.bodySemiBold, fontSize: 10, marginTop: 1 },
  rowMove: { fontFamily: fonts.bodySemiBold, fontSize: 10 },
});
