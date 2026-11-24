import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import CallReasonBlocks from '@/components/match-detail/CallReasonBlocks';
import CountryFlag from '@/components/shared/CountryFlag';
import TeamLogo from '@/components/shared/TeamLogo';
import H2HPanel from '@/components/match-detail/H2HPanel';
import MatchPowerDynamicsPanel from '@/components/match-detail/MatchPowerDynamicsPanel';
import type { CallFixtureSummary, TableOddsTab } from '@/components/match-detail/MatchDetailScreen';
import { findPowerDynamicFixture } from '@/services/powerDynamicCallLibrary';
import { fetchFixtureDetail, type StandingRow } from '@/services/oddAlerts';
import { fonts, layout, spacing, theme } from '@/styles/theme';
import type { PowerDynamicHit } from '@/utils/powerDynamicLibraryScore';
import { CALCULATION_CALL } from '@/utils/powerDynamicCalculationCalls';
import { powerDynamicCall } from '@/utils/powerDynamicCalls';
import { callAspectById } from '@/utils/powerDynamicCallSearch';

type Peek = 'summary' | 'h2h' | 'table';

const PEEKS: { id: Peek; label: string }[] = [
  { id: 'summary', label: 'Summary' },
  { id: 'h2h', label: 'H2H' },
  { id: 'table', label: 'Table/Odds' },
];

const LIVE = new Set(['LIVE', 'HT', '1H', '2H', 'ET', 'BT', 'P', 'INT']);

type SummaryView = typeof CallFixtureSummary;
type TableView = typeof TableOddsTab;

function tableRank(rows: StandingRow[], teamId: number): number | null {
  const row = rows.find((item) => item.teamId === teamId);
  return row ? row.rank : null;
}

function clockLabel(unix: number): string {
  if (!unix) return '';
  return new Date(unix * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export default function PowerDynamicFixtureModal({
  hit,
  onClose,
}: {
  hit: PowerDynamicHit;
  onClose: () => void;
}) {
  const height = useWindowDimensions().height;
  const router = useRouter();
  const [peek, setPeek] = useState<Peek | null>(null);
  const [SummaryView, setSummaryView] = useState<SummaryView | null>(null);
  const [TableView, setTableView] = useState<TableView | null>(null);
  const found = findPowerDynamicFixture(hit.fixtureId);
  const aspect = callAspectById(hit.aspectId);
  const sector = aspect?.tabId === 'calculations' ? CALCULATION_CALL : aspect ? powerDynamicCall(aspect.tabId) : undefined;
  const option = sector?.functions.find((item) => item.id === aspect?.functionId);
  const detail = useQuery({
    queryKey: ['power-dynamic-in-option', hit.fixtureId],
    queryFn: ({ signal }) => fetchFixtureDetail(hit.fixtureId, signal),
    staleTime: 5 * 60 * 1000,
    enabled: found != null,
  });

  const homeRank = detail.data?.home_position ?? (found ? tableRank(found.record.standings, found.fixture.homeId) : null);
  const awayRank = detail.data?.away_position ?? (found ? tableRank(found.record.standings, found.fixture.awayId) : null);
  const status = detail.data?.status ?? 'NS';
  const started = status === 'FT' || LIVE.has(status);
  const clock = found ? clockLabel(found.fixture.unix) : '';
  useEffect(() => {
    if (peek !== 'summary' && peek !== 'table') return;
    if (peek === 'summary' && SummaryView) return;
    if (peek === 'table' && TableView) return;
    let cancelled = false;
    import('@/components/match-detail/MatchDetailScreen').then((mod) => {
      if (cancelled) return;
      setSummaryView(() => mod.CallFixtureSummary);
      setTableView(() => mod.TableOddsTab);
    });
    return () => {
      cancelled = true;
    };
  }, [peek, SummaryView, TableView]);
  const openTeam = (teamId: number | null, name: string) => {
    if (teamId == null) return;
    onClose();
    router.push({ pathname: '/team/[slug]', params: { slug: String(teamId), name } });
  };
  const choosePeek = (id: Peek) => setPeek((current) => (current === id ? null : id));

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modal}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close fixture" />
        <View style={[styles.sheet, { height: Math.max(420, Math.round(height * 0.92)) }]}>
          <View style={styles.topBar}>
            <Pressable
              onPress={onClose}
              style={styles.close}
              accessibilityLabel="Close"
              {...(Platform.OS === 'web' ? { dataSet: { nodrag: '1' } } : {})}
            >
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>

          {found ? (
            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} nestedScrollEnabled>
              <View style={styles.compRow}>
                <CountryFlag name={found.record.country} size={13} />
                <Text style={styles.compText} numberOfLines={1}>
                  {found.record.country} · {found.record.name}
                  {found.record.seasonName ? ` · ${found.record.seasonName}` : ''}
                </Text>
              </View>
              <View style={styles.scoreboard}>
                <Pressable style={styles.teamCol} onPress={() => openTeam(found.fixture.homeId, found.fixture.homeName)}>
                  <TeamLogo name={found.fixture.homeName} size={34} />
                  <Text style={styles.teamName}>{found.fixture.homeName}</Text>
                  {homeRank != null ? <Text style={styles.posHint}>#{homeRank}</Text> : null}
                </Pressable>
                <View style={styles.scoreCol}>
                  {started && detail.data ? (
                    <Text style={[styles.score, LIVE.has(status) && styles.scoreLive]}>
                      {detail.data.home_goals ?? 0} - {detail.data.away_goals ?? 0}
                    </Text>
                  ) : (
                    <Text style={styles.koTime}>{clock}</Text>
                  )}
                  <Text style={[styles.statusText, LIVE.has(status) && styles.statusLive]}>
                    {status === 'FT' ? 'Full-time' : status === 'HT' ? 'Half-time' : clock}
                  </Text>
                </View>
                <Pressable style={styles.teamCol} onPress={() => openTeam(found.fixture.awayId, found.fixture.awayName)}>
                  <TeamLogo name={found.fixture.awayName} size={34} />
                  <Text style={styles.teamName}>{found.fixture.awayName}</Text>
                  {awayRank != null ? <Text style={styles.posHint}>#{awayRank}</Text> : null}
                </Pressable>
              </View>
              {detail.data?.venue ? <Text style={styles.venue}>{detail.data.venue}</Text> : null}

              <View style={styles.tabBar}>
                {PEEKS.map((tab) => {
                  const active = peek === tab.id;
                  return (
                    <Pressable
                      key={tab.id}
                      onPress={() => choosePeek(tab.id)}
                      style={[styles.tabBtn, active && styles.tabBtnActive]}
                      accessibilityLabel={active ? `Hide ${tab.label}` : `Show ${tab.label}`}
                    >
                      <Text style={[styles.tabText, active && styles.tabTextActive]}>{tab.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {peek === 'summary' ? (
                detail.data && SummaryView ? (
                  <SummaryView detail={detail.data} homeName={found.fixture.homeName} awayName={found.fixture.awayName} />
                ) : (
                  <Text style={styles.note}>{detail.isError ? 'The summary could not be loaded.' : 'Loading the summary.'}</Text>
                )
              ) : null}
              {peek === 'h2h' ? (
                detail.data ? (
                  <H2HPanel
                    matches={detail.data.h2h ?? []}
                    homeName={found.fixture.homeName}
                    awayName={found.fixture.awayName}
                    competitionName={found.record.name}
                  />
                ) : (
                  <Text style={styles.note}>{detail.isError ? 'Head to head could not be loaded.' : 'Loading head to head.'}</Text>
                )
              ) : null}
              {peek === 'table' ? (
                detail.data && TableView ? (
                  <TableView
                    detail={detail.data}
                    standings={found.record.standings}
                    groupCompetition={null}
                    homeId={found.fixture.homeId}
                    awayId={found.fixture.awayId}
                    homeName={found.fixture.homeName}
                    awayName={found.fixture.awayName}
                    movement={null}
                    onTeamPress={openTeam}
                  />
                ) : (
                  <Text style={styles.note}>{detail.isError ? 'The table could not be loaded.' : 'Loading the table.'}</Text>
                )
              ) : null}

              <View style={styles.callBlock}>
                <Text style={styles.kicker}>
                  {sector ? `${sector.index}. ${sector.name}${option ? ` · ${option.label}` : ''}` : 'Power dynamics'}
                </Text>
                <Text style={styles.aspect}>{hit.aspectLabel}</Text>
                <CallReasonBlocks
                  reason={hit.reason}
                  t1Name={hit.t1Name}
                  t2Name={hit.t2Name}
                  homeIsT1={hit.homeIsT1}
                />
              </View>
              <MatchPowerDynamicsPanel
                key={`${hit.fixtureId}-${hit.aspectId}`}
                standings={found.record.standings}
                competitionId={found.record.competitionId}
                competitionName={found.record.name}
                competitionCountry={found.record.country}
                competitionType={found.record.competitionType}
                seasonId={found.record.seasonId}
                seasonName={found.record.seasonName}
                seasonProgress={detail.data?.season_progress}
                homeId={found.fixture.homeId}
                awayId={found.fixture.awayId}
                homeName={found.fixture.homeName}
                awayName={found.fixture.awayName}
                h2hMatches={detail.data?.h2h ?? []}
                odds={detail.data?.odds}
                probability={detail.data?.probability}
                kickoffUnix={found.fixture.unix}
                fixtureId={found.fixture.id}
                focus={
                  aspect
                    ? { tabId: aspect.tabId, functionId: aspect.functionId, aspectId: hit.aspectId }
                    : { tabId: 'baseline', functionId: 'original' }
                }
                suppliedSeason={{ matches: found.record.matches, schedule: found.record.schedule }}
              />
            </ScrollView>
          ) : (
            <Text style={styles.missing}>This fixture is not in the saved leagues anymore.</Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modal: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15, 23, 42, 0.45)' },
  sheet: {
    backgroundColor: theme.bg,
    borderTopLeftRadius: layout.borderRadius,
    borderTopRightRadius: layout.borderRadius,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
  },
  topBar: { alignItems: 'flex-end', marginBottom: spacing.xs },
  compRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  compText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: theme.textMuted, flex: 1 },
  scoreboard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderRadius: layout.borderRadius,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  teamCol: { flex: 1, alignItems: 'center', gap: 4 },
  teamName: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: theme.textPrimary, textAlign: 'center' },
  scoreCol: { width: 96, alignItems: 'center', gap: 3 },
  score: { fontFamily: fonts.display, fontSize: 26, color: theme.textPrimary },
  scoreLive: { color: theme.live },
  koTime: { fontFamily: fonts.display, fontSize: 20, color: theme.textPrimary },
  statusText: { fontFamily: fonts.bodyMedium, fontSize: 11, color: theme.textMuted },
  statusLive: { color: theme.live, fontFamily: fonts.bodySemiBold },
  posHint: { fontFamily: fonts.body, fontSize: 10, color: theme.textFaint },
  venue: { fontFamily: fonts.body, fontSize: 11, color: theme.textFaint, textAlign: 'center', marginTop: spacing.sm },
  tabBar: {
    flexDirection: 'row',
    marginTop: spacing.md,
    borderBottomWidth: layout.borderWidth,
    borderBottomColor: theme.border,
  },
  tabBtn: { alignItems: 'center', paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabBtnActive: { borderBottomColor: theme.accentGreen },
  tabText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: theme.textMuted },
  tabTextActive: { color: theme.textPrimary, fontFamily: fonts.bodySemiBold },
  callBlock: { gap: spacing.xs, marginTop: spacing.md },
  kicker: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: theme.textMuted,
  },
  aspect: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 16,
    lineHeight: 20,
    color: theme.textPrimary,
  },
  close: {
    minHeight: 36,
    paddingHorizontal: spacing.md,
    borderRadius: layout.borderRadius,
    borderWidth: layout.borderWidth,
    borderColor: theme.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.surface,
  },
  closeText: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.textPrimary },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: spacing.xl },
  note: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16, color: theme.textMuted },
  missing: { fontFamily: fonts.body, fontSize: 14, color: theme.textMuted, paddingVertical: spacing.md },
});
