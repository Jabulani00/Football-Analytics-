import { useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import BhozomaView from '@/components/standings/BhozomaView';
import ImbangiView from '@/components/standings/ImbangiView';
import FixtureMotivationPanel from '@/components/standings/FixtureMotivationPanel';
import { HiddenLayersView } from '@/components/standings/FixtureHiddenLayersPanel';
import FixtureCoreStatsPanel from '@/components/match-detail/FixtureCoreStatsPanel';
import H2HPanel from '@/components/match-detail/H2HPanel';
import {
  BaselineCards,
  Callout,
  CharacterCards,
  ChildBeaterCards,
  ColourCards,
  CompetitionCards,
  ContestedCards,
  IndlelaCards,
  Last5Cards,
  MiddleGuysCards,
  PointsDiffCards,
  SectorIntro,
  StreakCards,
  StruggleCards,
  SwingCards,
  VenueCards,
} from '@/components/match-detail/PowerDynamicsSectors';
import SubTabBar from '@/components/shared/SubTabBar';
import { useFixtureFormAnalysis } from '@/hooks/useFixtureFormAnalysis';
import { useSeasonFixtures } from '@/hooks/useSeasonFixtures';
import type { Competition, H2HMatch, StandingRow } from '@/services/oddAlerts';
import { evaluatePowerDynamics, sideLabel } from '@/utils/powerDynamicsEngine';
import type { StandingLike } from '@/utils/motivationEngine';
import { fonts, spacing, theme } from '@/styles/theme';

/** Power dynamics checklist order (SKM notes; #24 odds omitted). */
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
    won: r.won,
    drawn: r.drawn,
    lost: r.lost,
  }));
}

/**
 * Match Power dynamics — full SKM checklist as ordered tabs with live T1/T2 data.
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
  const t1Label = sideLabel('t1', homeName);
  const t2Label = sideLabel('t2', awayName);
  const highlightIds = [homeId, awayId].filter((id): id is number => id != null);
  const teamLabels: Record<number, string> = {};
  if (homeId != null) teamLabels[homeId] = t1Label;
  if (awayId != null) teamLabels[awayId] = t2Label;

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
  const needSeasonFx =
    view === 'bhozoma' ||
    view === 'imbangi' ||
    view === 'competition_status' ||
    view === 'middle_guys';
  const seasonFx = useSeasonFixtures(competition, season, needSeasonFx);

  const form = useFixtureFormAnalysis({
    homeId,
    awayId,
    standings: like,
    seasonProgress,
    enabled: true,
  });

  const pd = useMemo(
    () =>
      evaluatePowerDynamics({
        table: like,
        homeId,
        awayId,
        homeName,
        awayName,
        homeResults: form.homeResults,
        awayResults: form.awayResults,
        seasonProgress,
        competitionId,
      }),
    [
      like,
      homeId,
      awayId,
      homeName,
      awayName,
      form.homeResults,
      form.awayResults,
      seasonProgress,
      competitionId,
    ],
  );

  const loadingForm = form.loading;

  const formGate = (node: ReactNode) => {
    if (loadingForm) {
      return (
        <View style={styles.center}>
          <ActivityIndicator color={theme.accentGreen} />
          <Text style={styles.muted}>Loading T1 / T2 form…</Text>
        </View>
      );
    }
    return node;
  };

  const body = (() => {
    switch (view) {
      case 'baseline':
        return (
          <View>
            <BaselineCards pd={pd} />
            <FixtureCoreStatsPanel
              standings={standings}
              homeId={homeId}
              awayId={awayId}
              homeName={homeName}
              awayName={awayName}
              seasonProgress={seasonProgress}
              homeLabel={t1Label}
              awayLabel={t2Label}
            />
          </View>
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
            homeLabel={t1Label}
            awayLabel={t2Label}
          />
        );
      case 'last5':
        return formGate(
          <View>
            <SectorIntro
              title="Last 5"
              note="Graded last-5, Ukulumbana matchup, and last-game flags for T1 vs T2."
            />
            {form.last5?.ukulumbanaLabel ? (
              <Callout
                text={`${form.last5.ukulumbanaLabel}${
                  form.last5.significantSplit
                    ? ' — sides look different right now'
                    : ' — similar recent form'
                }`}
                tone={form.last5.significantSplit ? 'warn' : 'info'}
              />
            ) : null}
            <Last5Cards pd={pd} home={form.last5?.home} away={form.last5?.away} />
            {form.last5?.lenses.map((l) => (
              <Text key={l.id} style={styles.lens}>
                {l.id}. {l.label}: {t1Label} {l.homeScore} vs {t2Label} {l.awayScore}
                {l.sameStrength ? ' · same strength' : ' · split'}
              </Text>
            ))}
          </View>,
        );
      case 'h2h':
        return (
          <View>
            <SectorIntro
              title="H2H"
              note={`${t1Label} vs ${t2Label} — Polar, never-beaten, and points share sit above the meetings.`}
            />
            <H2HPanel
              matches={h2hMatches}
              homeName={homeName}
              awayName={awayName}
              competitionName={competitionName}
            />
          </View>
        );
      case 'form_child_beater':
        return formGate(
          <ChildBeaterCards
            title="Form + Child beater"
            note="In action with the opponent. Method 1 = recent thrashing of a lower side. Method 2 = regularly beating bottom-third sides."
            pd={pd}
            method="both"
          />,
        );
      case 'home_away_strong':
        return formGate(<VenueCards pd={pd} />);
      case 'colour_verification':
        return formGate(<ColourCards pd={pd} />);
      case 'character':
        return formGate(<CharacterCards pd={pd} />);
      case 'middle_guys':
        return formGate(<MiddleGuysCards pd={pd} />);
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
            highlightIds={highlightIds}
            teamLabels={teamLabels}
          />
        );
      case 'problem_causer':
        if (loadingForm) {
          return (
            <View style={styles.center}>
              <ActivityIndicator color={theme.accentGreen} />
            </View>
          );
        }
        if (!form.hidden) {
          return <Text style={styles.muted}>No hidden-layer / problem-causer read yet.</Text>;
        }
        return (
          <HiddenLayersView
            layers={form.hidden}
            homeName={homeName}
            awayName={awayName}
            homeLabel={t1Label}
            awayLabel={t2Label}
          />
        );
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
            highlightIds={highlightIds}
            teamLabels={teamLabels}
          />
        );
      case 'indlela':
        return formGate(<IndlelaCards pd={pd} />);
      case 'competition_status':
        return <CompetitionCards pd={pd} />;
      case 'lost_twice':
        return formGate(
          <StreakCards
            title="Lost twice in a row"
            note="Current losing streak plus whether they ever lose back-to-back in the last 10."
            kind="loss"
            t1={{ label: t1Label, streak: pd.streaks.loss.t1 }}
            t2={{ label: t2Label, streak: pd.streaks.loss.t2 }}
          />,
        );
      case 'won_twice':
        return formGate(
          <StreakCards
            title="Won twice in a row"
            note="Current winning streak plus whether they ever win back-to-back in the last 10."
            kind="win"
            t1={{ label: t1Label, streak: pd.streaks.win.t1 }}
            t2={{ label: t2Label, streak: pd.streaks.win.t2 }}
          />,
        );
      case 'won_6':
        return formGate(
          <StreakCards
            title="Won 6 matches in a row"
            note="Warning when a side is on a 6+ win run."
            kind="win"
            t1={{ label: t1Label, streak: pd.streaks.win.t1 }}
            t2={{ label: t2Label, streak: pd.streaks.win.t2 }}
          />,
        );
      case 'lost_6':
        return formGate(
          <StreakCards
            title="Lost 6 matches in a row"
            note="Warning when a side is on a 6+ loss run."
            kind="loss"
            t1={{ label: t1Label, streak: pd.streaks.loss.t1 }}
            t2={{ label: t2Label, streak: pd.streaks.loss.t2 }}
          />,
        );
      case 'points_diff':
        return <PointsDiffCards pd={pd} />;
      case 'child_beater_2':
        return formGate(
          <ChildBeaterCards
            title="Child beater (method 2)"
            note="Yellow-band application. Top/mid sides regularly thrashing bottom-third opponents (2+ in last 6)."
            pd={pd}
            method={2}
          />,
        );
      case 'sudden_drop':
        return formGate(<SwingCards title="Sudden drop" want="drop" pd={pd} />);
      case 'sudden_pickup':
        return formGate(<SwingCards title="Sudden pick up" want="rise" pd={pd} />);
      case 'contested_leagues':
        return <ContestedCards pd={pd} />;
      case 'struggle':
        return formGate(<StruggleCards pd={pd} />);
      default:
        return null;
    }
  })();

  return (
    <View>
      <Text style={styles.blurb}>
        Power dynamics for {t1Label} vs {t2Label} — open each sector in order. Numbers are live
        from the table and recent finished games.
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
  center: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
  lens: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: theme.textMuted,
    marginBottom: 2,
  },
});
