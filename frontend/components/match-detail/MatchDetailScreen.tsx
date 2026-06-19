import { useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import LivePulse from '@/components/shared/LivePulse';
import PageContainer from '@/components/shared/PageContainer';
import PitchLineup from '@/components/match-detail/PitchLineup';
import { useMatchDetail } from '@/hooks/useMatchDetail';
import { mapFixture, type SquadPlayer, type StandingRow } from '@/services/oddAlerts';
import { fonts, layout, spacing, theme } from '@/styles/theme';
import { countryFlag, hasCountryFlag } from '@/utils/countryFlags';

type MatchDetailScreenProps = {
  matchId: string;
  onBack: () => void;
};

type TabId = 'summary' | 'lineups' | 'h2h' | 'standings';

const TABS: { id: TabId; label: string }[] = [
  { id: 'summary', label: 'Summary' },
  { id: 'lineups', label: 'Lineups' },
  { id: 'h2h', label: 'H2H' },
  { id: 'standings', label: 'Standings' },
];

const STAT_ROWS: { label: string; home: string; away: string; pct?: boolean }[] = [
  { label: 'Possession', home: 'home_possession', away: 'away_possession', pct: true },
  { label: 'Shots', home: 'home_shots', away: 'away_shots' },
  { label: 'Shots on target', home: 'home_shots_on', away: 'away_shots_on' },
  { label: 'Corners', home: 'home_corners', away: 'away_corners' },
  { label: 'Yellow cards', home: 'home_yellow_cards', away: 'away_yellow_cards' },
  { label: 'Fouls', home: 'home_fouls', away: 'away_fouls' },
  { label: 'Dangerous attacks', home: 'home_dang_attacks', away: 'away_dang_attacks' },
  { label: 'xG', home: 'home_xg', away: 'away_xg' },
];

export default function MatchDetailScreen({ matchId, onBack }: MatchDetailScreenProps) {
  const router = useRouter();
  const { detail, squads, standings, loading, error, refresh } = useMatchDetail(matchId);
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
  const statusLabel =
    fixture.status === 'NS'
      ? fixture.kickoff
      : fixture.status === 'HT'
        ? 'Half-time'
        : fixture.status === 'FT'
          ? 'Full-time'
          : `${fixture.minute ?? 0}${fixture.addedTime ? `+${fixture.addedTime}` : ''}'`;

  return (
    <PageContainer contentContainerStyle={styles.scroll}>
      <BackLink onPress={onBack} />

      {/* Competition */}
      <View style={styles.compRow}>
        <Text style={styles.flag}>{countryFlag(detail.competition_country)}</Text>
        <Text style={styles.compText} numberOfLines={1}>
          {detail.competition_country} · {detail.competition_name}
        </Text>
      </View>

      {/* Scoreboard */}
      <View style={styles.scoreboard}>
        <Pressable
          style={styles.teamCol}
          onPress={() => openTeam(fixture.home.id, fixture.home.name)}>
          {hasCountryFlag(fixture.home.name) ? (
            <Text style={styles.teamFlag}>{countryFlag(fixture.home.name)}</Text>
          ) : null}
          <Text style={styles.teamName}>{fixture.home.name}</Text>
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
          {fixture.status !== 'NS' && detail.ht_score ? (
            <Text style={styles.htScore}>HT {detail.ht_score}</Text>
          ) : null}
        </View>
        <Pressable
          style={styles.teamCol}
          onPress={() => openTeam(fixture.away.id, fixture.away.name)}>
          {hasCountryFlag(fixture.away.name) ? (
            <Text style={styles.teamFlag}>{countryFlag(fixture.away.name)}</Text>
          ) : null}
          <Text style={styles.teamName}>{fixture.away.name}</Text>
        </Pressable>
      </View>

      {detail.venue ? <Text style={styles.venue}>{detail.venue}</Text> : null}

      {/* Tabs */}
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

      {tab === 'summary' ? (
        <SummaryTab detail={detail} homeName={fixture.home.name} awayName={fixture.away.name} />
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
          homeId={fixture.home.id}
          awayId={fixture.away.id}
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

// ----- Summary ------------------------------------------------------------

function SummaryTab({
  detail,
  homeName,
  awayName,
}: {
  detail: NonNullable<ReturnType<typeof useMatchDetail>['detail']>;
  homeName: string;
  awayName: string;
}) {
  const prob = detail.probability;
  const stats = detail.stats;
  const odds = detail.odds?.ft_result;

  const statRows = stats
    ? STAT_ROWS.map((r) => ({
        label: r.label,
        home: stats[r.home],
        away: stats[r.away],
        pct: r.pct,
      })).filter((r) => r.home != null || r.away != null)
    : [];

  return (
    <View>
      {prob ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Prediction</Text>
          <View style={styles.probRow}>
            <ProbCell label={homeName} value={prob.home_win} />
            <ProbCell label="Draw" value={prob.draw} />
            <ProbCell label={awayName} value={prob.away_win} />
          </View>
          {odds ? (
            <Text style={styles.oddsLine}>
              Odds · {homeName} {odds.home} | Draw {odds.draw} | {awayName} {odds.away}
            </Text>
          ) : null}
        </View>
      ) : null}

      {statRows.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Match stats</Text>
          {statRows.map((r) => (
            <StatComparison
              key={r.label}
              label={r.label}
              home={r.home}
              away={r.away}
              pct={r.pct}
            />
          ))}
        </View>
      ) : (
        <Text style={styles.muted}>Live match stats appear here once the game is underway.</Text>
      )}

      {detail.referee?.name ? (
        <Text style={styles.refLine}>Referee: {detail.referee.name}</Text>
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

function H2HTab({ detail }: { detail: NonNullable<ReturnType<typeof useMatchDetail>['detail']> }) {
  const h2h = detail.h2h ?? [];
  if (h2h.length === 0) {
    return <Text style={styles.muted}>No head-to-head history available.</Text>;
  }
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Head-to-head</Text>
      {h2h.map((m) => (
        <View key={m.id} style={styles.h2hRow}>
          <Text style={styles.h2hDate}>{m.date}</Text>
          <Text style={styles.h2hTeams} numberOfLines={1}>
            {m.home_name}
          </Text>
          <Text style={styles.h2hScore}>
            {m.home_goals ?? 0}-{m.away_goals ?? 0}
          </Text>
          <Text style={[styles.h2hTeams, styles.h2hAway]} numberOfLines={1}>
            {m.away_name}
          </Text>
        </View>
      ))}
    </View>
  );
}

// ----- Standings ----------------------------------------------------------

function StandingsTab({
  standings,
  homeId,
  awayId,
  onTeamPress,
}: {
  standings: StandingRow[];
  homeId: number | null;
  awayId: number | null;
  onTeamPress: (teamId: number | null, name: string) => void;
}) {
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
            <Text style={[styles.cTeam, styles.tdText, highlight && styles.tdBold]} numberOfLines={1}>
              {row.name}
            </Text>
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
  htScore: { fontFamily: fonts.body, fontSize: 10, color: theme.textFaint },
  venue: { fontFamily: fonts.body, fontSize: 11, color: theme.textFaint, textAlign: 'center', marginTop: spacing.sm },
  tabBar: { flexDirection: 'row', marginTop: spacing.md, marginBottom: spacing.md, borderBottomWidth: layout.borderWidth, borderBottomColor: theme.border },
  tabBtn: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: 2, borderBottomColor: 'transparent', ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : {}) },
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
  h2hRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 6, borderTopWidth: layout.borderWidth, borderTopColor: theme.border },
  h2hDate: { fontFamily: fonts.body, fontSize: 10, color: theme.textFaint, width: 70 },
  h2hTeams: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 12, color: theme.textPrimary, textAlign: 'right' },
  h2hAway: { textAlign: 'left' },
  h2hScore: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: theme.textPrimary, width: 44, textAlign: 'center' },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: spacing.xs },
  tableHead: { borderBottomWidth: layout.borderWidth, borderBottomColor: theme.border },
  tableRowActive: { backgroundColor: 'rgba(5, 150, 105, 0.08)' },
  tableRowHover: { backgroundColor: theme.surfaceHover },
  thText: { fontFamily: fonts.bodySemiBold, fontSize: 10, color: theme.textFaint, textTransform: 'uppercase' },
  tdText: { fontFamily: fonts.body, fontSize: 12, color: theme.textPrimary },
  tdBold: { fontFamily: fonts.bodySemiBold },
  cPos: { width: 26, textAlign: 'center' },
  cTeam: { flex: 1 },
  cNum: { width: 34, textAlign: 'center' },
});
