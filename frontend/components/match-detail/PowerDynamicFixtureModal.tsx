import { useQuery } from '@tanstack/react-query';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import MatchPowerDynamicsPanel from '@/components/match-detail/MatchPowerDynamicsPanel';
import { findPowerDynamicFixture } from '@/services/powerDynamicCallLibrary';
import { fetchFixtureDetail, type StandingRow } from '@/services/oddAlerts';
import { fonts, layout, spacing, theme } from '@/styles/theme';
import type { PowerDynamicHit } from '@/utils/powerDynamicLibraryScore';
import { powerDynamicCall } from '@/utils/powerDynamicCalls';
import { callAspectById } from '@/utils/powerDynamicCallSearch';

function bandColor(percent: number): string {
  if (percent >= 80) return theme.accentGreen;
  if (percent >= 40) return theme.yellow;
  return theme.loss;
}

function kickoffLabel(unix: number): string {
  if (!unix) return '';
  return new Date(unix * 1000).toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function tablePlace(rows: StandingRow[], teamId: number): string {
  const row = rows.find((item) => item.teamId === teamId);
  if (!row) return '';
  return `#${row.rank} · ${row.points} pts`;
}

export default function PowerDynamicFixtureModal({
  hit,
  onClose,
}: {
  hit: PowerDynamicHit;
  onClose: () => void;
}) {
  const height = useWindowDimensions().height;
  const found = findPowerDynamicFixture(hit.fixtureId);
  const aspect = callAspectById(hit.aspectId);
  const sector = aspect ? powerDynamicCall(aspect.tabId) : undefined;
  const detail = useQuery({
    queryKey: ['power-dynamic-in-option', hit.fixtureId],
    queryFn: ({ signal }) => fetchFixtureDetail(hit.fixtureId, signal),
    staleTime: 5 * 60 * 1000,
    enabled: found != null,
  });

  const homePlace = found ? tablePlace(found.record.standings, found.fixture.homeId) : '';
  const awayPlace = found ? tablePlace(found.record.standings, found.fixture.awayId) : '';

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modal}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close fixture" />
        <View style={[styles.sheet, { maxHeight: Math.max(360, Math.round(height * 0.92)) }]}>
          <View style={styles.head}>
            <View style={styles.headCopy}>
              <Text style={styles.kicker}>
                {sector ? `${sector.index}. ${sector.name}` : 'Power dynamics'}
              </Text>
              <Text style={styles.aspect}>{hit.aspectLabel}</Text>
            </View>
            <View style={styles.headEnd}>
              <Text style={[styles.percent, { color: bandColor(hit.percent) }]}>{hit.percent}%</Text>
              <Pressable
                onPress={onClose}
                style={styles.close}
                accessibilityLabel="Close"
                {...(Platform.OS === 'web' ? { dataSet: { nodrag: '1' } } : {})}
              >
                <Text style={styles.closeText}>Close</Text>
              </Pressable>
            </View>
          </View>

          {found ? (
            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} nestedScrollEnabled>
              <View style={styles.fixture}>
                <View style={styles.side}>
                  <Text style={styles.team}>{found.fixture.homeName}</Text>
                  {homePlace ? <Text style={styles.place}>{homePlace}</Text> : null}
                </View>
                <Text style={styles.vs}>vs</Text>
                <View style={[styles.side, styles.sideAway]}>
                  <Text style={[styles.team, styles.teamAway]}>{found.fixture.awayName}</Text>
                  {awayPlace ? <Text style={[styles.place, styles.teamAway]}>{awayPlace}</Text> : null}
                </View>
              </View>
              <Text style={styles.meta}>
                {found.record.country} · {found.record.name} · {kickoffLabel(found.fixture.unix)}
              </Text>
              <Text style={styles.reason}>{hit.reason}</Text>
              {detail.isPending ? (
                <Text style={styles.note}>Loading this fixture’s meetings and odds. The table read is already here.</Text>
              ) : null}
              {detail.isError ? (
                <Text style={styles.note}>Meetings and odds could not be loaded. The table read is still here.</Text>
              ) : null}
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
                focus={aspect ? { tabId: aspect.tabId, functionId: aspect.functionId } : { tabId: 'baseline', functionId: 'original' }}
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
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.sm },
  headCopy: { flex: 1, minWidth: 0, gap: 2 },
  headEnd: { alignItems: 'flex-end', gap: spacing.xs },
  kicker: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: theme.textMuted,
  },
  aspect: { fontFamily: fonts.display, fontSize: 20, lineHeight: 24, color: theme.textPrimary },
  percent: { fontFamily: fonts.display, fontSize: 22, lineHeight: 24 },
  close: {
    minHeight: 36,
    paddingHorizontal: spacing.md,
    borderRadius: 8,
    borderWidth: layout.borderWidth,
    borderColor: theme.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.surface,
  },
  closeText: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.textPrimary },
  scroll: { flexGrow: 0 },
  scrollContent: { gap: spacing.sm, paddingBottom: spacing.xl },
  fixture: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: theme.surface,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: 12,
    padding: spacing.md,
  },
  side: { flex: 1, minWidth: 0 },
  sideAway: { alignItems: 'flex-end' },
  team: { fontFamily: fonts.bodySemiBold, fontSize: 16, color: theme.textPrimary },
  teamAway: { textAlign: 'right' },
  place: { fontFamily: fonts.body, fontSize: 12, color: theme.textMuted, marginTop: 2 },
  vs: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: theme.textFaint },
  meta: { fontFamily: fonts.body, fontSize: 13, color: theme.textMuted },
  reason: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: theme.textPrimary },
  note: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16, color: theme.textMuted },
  missing: { fontFamily: fonts.body, fontSize: 14, color: theme.textMuted, paddingVertical: spacing.md },
});
