import { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import BhozomaView from '@/components/standings/BhozomaView';
import ImbangiView from '@/components/standings/ImbangiView';
import FixtureMotivationPanel from '@/components/standings/FixtureMotivationPanel';
import { HiddenLayersView } from '@/components/standings/FixtureHiddenLayersPanel';
import FixtureCoreStatsPanel from '@/components/match-detail/FixtureCoreStatsPanel';
import H2HPanel from '@/components/match-detail/H2HPanel';
import SubTabBar from '@/components/shared/SubTabBar';
import { useFixtureFormAnalysis } from '@/hooks/useFixtureFormAnalysis';
import { useSeasonFixtures } from '@/hooks/useSeasonFixtures';
import type { Competition, H2HMatch, StandingRow } from '@/services/oddAlerts';
import {
  CHANGE_LABEL,
  OPTION_LABEL,
  type FormGrade,
  type TeamLast5,
} from '@/utils/last5Analysis';
import { leagueProgressInfo } from '@/utils/imbangiEngine';
import type { StandingLike } from '@/utils/motivationEngine';
import type { SeparatorFlag, SeparatorGrade } from '@/utils/separatorTools';
import { fonts, layout, spacing, theme } from '@/styles/theme';

/** Power dynamics checklist order (SKM notes; #24 omitted). */
export const POWER_DYNAMICS_TABS = [
  { id: 'baseline', label: '1. Baseline' },
  { id: 'importance_3pts', label: '2. Importance of 3 pts' },
  { id: 'last5', label: '3. Last 5' },
  { id: 'h2h', label: '4. H2H' },
  { id: 'form_child_beater', label: '5. Form + Child beater' },
  { id: 'home_away_strong', label: '6. Home/Away strong' },
  { id: 'colour_verification', label: '7. Colour verification' },
  { id: 'character', label: '8. Character' },
  { id: 'middle_guys', label: '9. Middle guys' },
  { id: 'bhozoma', label: '10. Bhozoma' },
  { id: 'problem_causer', label: '11. Problem causer' },
  { id: 'imbangi', label: '12. Imbangi' },
  { id: 'indlela', label: '13. Indlela' },
  { id: 'competition_status', label: '14. Competition status' },
  { id: 'lost_twice', label: '15. Lost twice in a row' },
  { id: 'won_twice', label: '16. Won twice in a row' },
  { id: 'won_6', label: '17. Won 6 in a row' },
  { id: 'lost_6', label: '18. Lost 6 in a row' },
  { id: 'points_diff', label: '19. Points difference' },
  { id: 'child_beater_2', label: '20. Child beater (2)' },
  { id: 'sudden_drop', label: '21. Sudden drop' },
  { id: 'sudden_pickup', label: '22. Sudden pick up' },
  { id: 'contested_leagues', label: '23. Contested leagues' },
  { id: 'struggle', label: '25. Struggle 2–3 games' },
] as const;

export type PowerDynamicsTabId = (typeof POWER_DYNAMICS_TABS)[number]['id'];

type Props = {
  standings: StandingRow[];
  competitionId: number;
  competitionName: string;
  competitionCountry: string;
  competitionType?: string | null;
  seasonId: number | null;
  seasonName: string;
  seasonProgress?: number | null;
  homeId: number | null;
  awayId: number | null;
  homeName: string;
  awayName: string;
  h2hMatches: H2HMatch[];
};

function toStandingLike(rows: StandingRow[]): StandingLike[] {
  return rows.map((r) => ({
    rank: r.rank,
    teamId: r.teamId,
    name: r.name,
    points: r.points,
    played: r.played,
    zone: r.zone,
  }));
}

function gradeColor(g: SeparatorGrade | FormGrade): string {
  switch (g) {
    case 'good':
    case 'excellent':
      return theme.accentGreen;
    case 'mediocre':
    case 'warn':
      return theme.yellow;
    case 'bad':
      return theme.loss;
    default:
      return theme.textMuted;
  }
}

function FlagChip({ flag }: { flag: SeparatorFlag }) {
  const side = flag.side === 'home' ? 'Home' : flag.side === 'away' ? 'Away' : null;
  return (
    <View style={[styles.chip, { borderColor: gradeColor(flag.grade) }]}>
      <Text style={[styles.chipLabel, { color: gradeColor(flag.grade) }]}>{flag.label}</Text>
      <Text style={styles.chipDetail} numberOfLines={3}>
        {side ? `${side}: ` : ''}
        {flag.detail}
        {!flag.active ? ' · not active' : ''}
      </Text>
    </View>
  );
}

function Last5Block({ title, team }: { title: string; team: TeamLast5 }) {
  return (
    <View style={styles.last5Card}>
      <Text style={styles.last5Title}>{title}</Text>
      <Text style={styles.last5Meta}>
        Form: {OPTION_LABEL[team.option]} · {team.tablePoints} pts from last 5
      </Text>
      <Text style={styles.seq}>{team.sequence.join(' ')}</Text>
      <Text style={styles.last5Meta}>
        {CHANGE_LABEL[team.change]}
        {team.inhlambuluko ? ' · bounce-back stretch' : ''}
      </Text>
    </View>
  );
}

function ComingSoon({ title, note }: { title: string; note?: string }) {
  return (
    <View style={styles.soonCard}>
      <Text style={styles.soonTitle}>{title}</Text>
      <Text style={styles.muted}>
        {note ??
          'Listed in Power dynamics — engine/UI for this sector still to be wired in a later pass.'}
      </Text>
    </View>
  );
}

function SeparatorSector({
  title,
  flags,
  loading,
  emptyNote,
}: {
  title: string;
  flags: SeparatorFlag[];
  loading: boolean;
  emptyNote: string;
}) {
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.accentGreen} />
        <Text style={styles.muted}>Loading form signals…</Text>
      </View>
    );
  }
  const active = flags.filter((f) => f.active);
  const show = active.length > 0 ? active : flags;
  return (
    <View>
      <Text style={styles.sectorTitle}>{title}</Text>
      {show.length === 0 ? (
        <Text style={styles.muted}>{emptyNote}</Text>
      ) : (
        <View style={styles.chipList}>
          {show.map((f) => (
            <FlagChip key={`${f.id}-${f.side}`} flag={f} />
          ))}
        </View>
      )}
    </View>
  );
}

function matchFlag(flags: SeparatorFlag[], ...needles: string[]): SeparatorFlag[] {
  return flags.filter((f) => needles.some((n) => f.id.includes(n)));
}

/**
 * Match Power dynamics — full SKM checklist as ordered tabs.
 */
export default function MatchPowerDynamicsPanel({
  standings,
  competitionId,
  competitionName,
  competitionCountry,
  competitionType,
  seasonId,
  seasonName,
  seasonProgress,
  homeId,
  awayId,
  homeName,
  awayName,
  h2hMatches,
}: Props) {
  const [view, setView] = useState<PowerDynamicsTabId>('baseline');

  const like = useMemo(() => toStandingLike(standings), [standings]);

  const competition = useMemo((): Competition | null => {
    if (!seasonId) return null;
    return {
      id: competitionId,
      name: competitionName,
      slug: '',
      country: competitionCountry,
      countryId: 0,
      type: competitionType ?? 'League',
      isCup: false,
      currentSeason: seasonId,
      seasons: [
        {
          seasonId,
          seasonName: seasonName || String(seasonId),
          played: null,
          progress: seasonProgress ?? null,
          isCurrent: true,
        },
      ],
    };
  }, [
    competitionId,
    competitionName,
    competitionCountry,
    competitionType,
    seasonId,
    seasonName,
    seasonProgress,
  ]);

  const season = competition?.seasons[0] ?? null;
  const needSeasonFx = view === 'bhozoma' || view === 'imbangi' || view === 'competition_status';
  const seasonFx = useSeasonFixtures(competition, season, needSeasonFx);

  const form = useFixtureFormAnalysis({
    homeId,
    awayId,
    standings: like,
    seasonProgress,
    enabled: true,
  });

  const allFlags = useMemo(() => {
    if (!form.separators) return [] as SeparatorFlag[];
    return form.separators.flags;
  }, [form.separators]);

  const progress = useMemo(
    () => leagueProgressInfo(like, seasonProgress),
    [like, seasonProgress],
  );

  const body = (() => {
    switch (view) {
      case 'baseline':
        return (
          <FixtureCoreStatsPanel
            standings={standings}
            homeId={homeId}
            awayId={awayId}
            homeName={homeName}
            awayName={awayName}
            seasonProgress={seasonProgress}
          />
        );
      case 'importance_3pts':
        return (
          <FixtureMotivationPanel
            standings={like}
            homeId={homeId}
            awayId={awayId}
            homeName={homeName}
            awayName={awayName}
            competitionId={competitionId}
            seasonProgress={seasonProgress}
          />
        );
      case 'last5':
        if (form.loading) {
          return (
            <View style={styles.center}>
              <ActivityIndicator color={theme.accentGreen} />
              <Text style={styles.muted}>Loading last 5…</Text>
            </View>
          );
        }
        if (!form.last5?.home && !form.last5?.away) {
          return <Text style={styles.muted}>No last-5 sample for these sides yet.</Text>;
        }
        return (
          <View>
            <Text style={styles.sectorTitle}>Last 5</Text>
            {form.last5?.ukulumbanaLabel ? (
              <Text style={styles.meta}>
                Form matchup: {form.last5.ukulumbanaLabel}
                {form.last5.significantSplit
                  ? ' — sides look different right now'
                  : ' — similar recent form'}
              </Text>
            ) : null}
            {form.last5?.home ? <Last5Block title={homeName} team={form.last5.home} /> : null}
            {form.last5?.away ? <Last5Block title={awayName} team={form.last5.away} /> : null}
          </View>
        );
      case 'h2h':
        return <H2HPanel matches={h2hMatches} homeName={homeName} awayName={awayName} />;
      case 'form_child_beater':
        return (
          <SeparatorSector
            title="Form + Child beater"
            loading={form.loading}
            flags={[
              ...matchFlag(allFlags, 'child_beater'),
              ...matchFlag(allFlags, 'sudden_'),
              ...matchFlag(allFlags, 'struggle'),
            ]}
            emptyNote="No form / child-beater signals active for this fixture."
          />
        );
      case 'home_away_strong':
        return (
          <ComingSoon
            title="Home / Away strong → underdog strength"
            note="PPG home/away underdog strength sector — listed for call-outs; dedicated panel still to land."
          />
        );
      case 'colour_verification':
        return (
          <ComingSoon
            title="Colour verification (PPG evaluation)"
            note="Checks that every stat aligns with the PPG / colour plan — dedicated verifier still to land."
          />
        );
      case 'character':
        return (
          <ComingSoon
            title="Character (original + Home vs Away stats)"
            note="Marked optional in the notes (crossed). Placeholder kept so the checklist order stays complete."
          />
        );
      case 'middle_guys':
        return (
          <ComingSoon
            title="Middle guys (strong show / weak show)"
            note="Marked optional in the notes (crossed). Use Bhozoma for mid-table reads for now."
          />
        );
      case 'bhozoma':
        if (standings.length === 0) {
          return <Text style={styles.muted}>Need a league table for Bhozoma.</Text>;
        }
        if (!seasonId) {
          return <Text style={styles.muted}>No season linked to this fixture.</Text>;
        }
        return (
          <BhozomaView
            standings={like}
            matches={seasonFx.matches}
            loading={seasonFx.loading}
            error={seasonFx.error}
            competitionId={competitionId}
          />
        );
      case 'problem_causer':
        if (form.loading) {
          return (
            <View style={styles.center}>
              <ActivityIndicator color={theme.accentGreen} />
            </View>
          );
        }
        if (!form.hidden) {
          return <Text style={styles.muted}>No hidden-layer / problem-causer read yet.</Text>;
        }
        return <HiddenLayersView layers={form.hidden} homeName={homeName} awayName={awayName} />;
      case 'imbangi':
        if (standings.length === 0) {
          return <Text style={styles.muted}>Need a league table for Imbangi.</Text>;
        }
        if (!seasonId) {
          return <Text style={styles.muted}>No season linked to this fixture.</Text>;
        }
        return (
          <ImbangiView
            standings={like}
            matches={seasonFx.matches}
            loading={seasonFx.loading}
            error={seasonFx.error}
            seasonProgress={seasonProgress}
            competitionName={competitionName}
          />
        );
      case 'indlela':
        return (
          <SeparatorSector
            title="Indlela"
            loading={form.loading}
            flags={matchFlag(allFlags, 'indlela')}
            emptyNote="No Indlela path pattern for this fixture."
          />
        );
      case 'competition_status':
        return (
          <View style={[styles.progressCard, progress.lateStretch && styles.progressLate]}>
            <Text style={styles.sectorTitle}>Competition status</Text>
            <Text style={styles.meta}>
              Season played:{' '}
              {progress.seasonProgress != null ? `${progress.seasonProgress}%` : 'n/a'}
              {' · '}
              most games played: {progress.maxPlayed}
              {progress.avgRemaining != null ? ` · about ${progress.avgRemaining} left` : ''}
              {progress.lateStretch ? ' · late stretch' : ''}
            </Text>
            <Text style={styles.muted}>{progress.note}</Text>
          </View>
        );
      case 'lost_twice':
        return (
          <SeparatorSector
            title="Lost twice in a row"
            loading={form.loading}
            flags={matchFlag(allFlags, 'never_lost_twice')}
            emptyNote="No ‘never lost twice’ / lost-twice signal flagged."
          />
        );
      case 'won_twice':
        return (
          <SeparatorSector
            title="Won twice in a row"
            loading={form.loading}
            flags={matchFlag(allFlags, 'never_won_twice')}
            emptyNote="No ‘never won twice’ / won-twice signal flagged."
          />
        );
      case 'won_6':
        return (
          <SeparatorSector
            title="Won 6 matches in a row"
            loading={form.loading}
            flags={matchFlag(allFlags, 'won6')}
            emptyNote="Neither side is on a 6-win run."
          />
        );
      case 'lost_6':
        return (
          <SeparatorSector
            title="Lost 6 matches in a row"
            loading={form.loading}
            flags={matchFlag(allFlags, 'lost6')}
            emptyNote="Neither side is on a 6-loss run."
          />
        );
      case 'points_diff':
        return (
          <SeparatorSector
            title="Points difference"
            loading={form.loading}
            flags={matchFlag(allFlags, 'points_diff', 'imbangi')}
            emptyNote="Points difference not available yet."
          />
        );
      case 'child_beater_2':
        return (
          <SeparatorSector
            title="Child beater (2 methods)"
            loading={form.loading}
            flags={matchFlag(allFlags, 'child_beater')}
            emptyNote="No child-beater signals for this fixture."
          />
        );
      case 'sudden_drop':
        return (
          <SeparatorSector
            title="Sudden drop"
            loading={form.loading}
            flags={matchFlag(allFlags, 'sudden_drop')}
            emptyNote="No sudden drop flagged."
          />
        );
      case 'sudden_pickup':
        return (
          <SeparatorSector
            title="Sudden pick up"
            loading={form.loading}
            flags={matchFlag(allFlags, 'sudden_rise')}
            emptyNote="No sudden pick-up flagged."
          />
        );
      case 'contested_leagues':
        return (
          <SeparatorSector
            title="Highly contested leagues"
            loading={form.loading}
            flags={matchFlag(allFlags, 'contested_top')}
            emptyNote="Top of the table is not tightly contested right now."
          />
        );
      case 'struggle':
        return (
          <SeparatorSector
            title="Struggle for 2 or 3 games"
            loading={form.loading}
            flags={matchFlag(allFlags, 'struggle')}
            emptyNote="No 2–3 game struggle flagged."
          />
        );
      default:
        return null;
    }
  })();

  return (
    <View>
      <Text style={styles.blurb}>
        Power dynamics checklist for {homeName} vs {awayName} — open each sector in order. Built
        sectors show live reads; others stay listed until their engines are finished.
      </Text>
      <SubTabBar
        tabs={[...POWER_DYNAMICS_TABS]}
        active={view}
        onChange={(id) => setView(id)}
      />
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  blurb: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textMuted,
    marginBottom: spacing.sm,
    lineHeight: 17,
  },
  muted: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: theme.textMuted,
    paddingVertical: spacing.sm,
    lineHeight: 18,
  },
  meta: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textPrimary,
    marginBottom: spacing.sm,
    lineHeight: 17,
  },
  center: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
  sectorTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: theme.textPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  chipList: { gap: spacing.xs },
  chip: {
    borderWidth: layout.borderWidth,
    borderRadius: layout.borderRadius,
    padding: spacing.sm,
    backgroundColor: theme.surface,
    marginBottom: spacing.xs,
  },
  chipLabel: { fontFamily: fonts.bodySemiBold, fontSize: 12 },
  chipDetail: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted, marginTop: 2 },
  last5Card: {
    backgroundColor: theme.surface,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  last5Title: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.textPrimary },
  last5Meta: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted, marginTop: 2 },
  seq: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: theme.textPrimary, marginTop: 4 },
  soonCard: {
    backgroundColor: theme.surface,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    padding: spacing.md,
  },
  soonTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: theme.textPrimary,
    marginBottom: spacing.xs,
  },
  progressCard: {
    backgroundColor: theme.surface,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    padding: spacing.md,
  },
  progressLate: { borderColor: theme.accentOrange },
});
