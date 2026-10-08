import { useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import BhozomaView from '@/components/standings/BhozomaView';
import ImbangiView from '@/components/standings/ImbangiView';
import FixtureMotivationPanel from '@/components/standings/FixtureMotivationPanel';
import H2HPanel from '@/components/match-detail/H2HPanel';
import {
  BaselineCards,
  Callout,
  CharacterCards,
  ChildBeaterCards,
  ColourCards,
  CompetitionCards,
  ContestedCards,
  GapAnalysisCards,
  IndlelaCards,
  InitialStateCards,
  LabelChangeCards,
  Last5Cards,
  Last5DiffCards,
  Last5LeagueCards,
  FormCards,
  TwoGoalBandCards,
  MiddleGuysCards,
  PointsDiffCards,
  SectorIntro,
  StreakCards,
  StreamlineCards,
  StruggleCards,
  SwingCards,
  VenueCards,
} from '@/components/match-detail/PowerDynamicsSectors';
import SubTabBar from '@/components/shared/SubTabBar';
import { useFixtureFormAnalysis } from '@/hooks/useFixtureFormAnalysis';
import { useSeasonFixtures } from '@/hooks/useSeasonFixtures';
import { useFixtureBook1x2 } from '@/hooks/useFixtureBook1x2';
import type { Competition, H2HMatch, OddsByMarket, Probability, StandingRow } from '@/services/oddAlerts';
import ProblemCauserView from '@/components/match-detail/ProblemCauserView';
import { evaluatePowerDynamics, ftOdds, indlelaLetter, indlelaPath, ppgSwing, streakSide } from '@/utils/powerDynamicsEngine';
import { evaluateProblemCauser } from '@/utils/problemCauser';
import { resultsFromSeasonMatches } from '@/utils/last6Form';
import { buildInitialState, findUkulumbana } from '@/utils/last5Analysis';
import { excludeFixture, type TeamResult } from '@/utils/teamResults';
import type { StandingLike } from '@/utils/motivationEngine';
import { fonts, spacing, theme } from '@/styles/theme';

/** Power dynamics checklist order (SKM notes; #24 odds omitted). */
export const POWER_DYNAMICS_TABS = [
  { id: 'baseline', label: '1. Baseline' },
  { id: 'importance_3pts', label: '2. Importance of 3 pts' },
  { id: 'last5', label: '3. Last 5' },
  { id: 'form', label: 'Form' },
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
  { id: 'lost_twice', label: '15. Never lost twice' },
  { id: 'won_twice', label: '16. Never won twice' },
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

const BASELINE_SUBS = [
  { id: 'original', label: 'Original' },
  { id: 'gap', label: 'Gap analysis' },
  { id: 'streamline', label: 'Streamline' },
] as const;

const STREAMLINE_SUBS = [
  { id: 'bateteme', label: 'Bateteme stream' },
  { id: 'compliant', label: 'Compliant stream' },
  { id: 'zidane_law', label: 'Zidane Law' },
  { id: 'bookie', label: 'Bookie mistake' },
  { id: 'bookie2', label: 'Bookie mistake 2' },
] as const;

const BATETEME_SUBS = [
  { id: '1', label: 'Bateteme 1' },
  { id: '2', label: 'Bateteme 2' },
] as const;

type BaselineSubId = (typeof BASELINE_SUBS)[number]['id'];
type StreamlineSubId = (typeof STREAMLINE_SUBS)[number]['id'];
type BatetemeSubId = (typeof BATETEME_SUBS)[number]['id'];

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
  odds?: OddsByMarket;
  probability?: Probability;
  kickoffUnix?: number;
  fixtureId?: number | null;
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
    goalDiff: r.goalDiff,
    goalsFor: r.goalsFor,
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
  odds,
  probability,
  kickoffUnix,
  fixtureId,
}: Props) {
  const [view, setView] = useState<PowerDynamicsTabId>('baseline');
  const [baselineSub, setBaselineSub] = useState<BaselineSubId>('original');
  const [streamlineSub, setStreamlineSub] = useState<StreamlineSubId>('bateteme');
  const [batetemeSub, setBatetemeSub] = useState<BatetemeSubId>('1');

  const like = useMemo(() => toStandingLike(standings), [standings]);
  const oa1x2Ready = ftOdds(odds, 'home') != null && ftOdds(odds, 'away') != null;
  const book = useFixtureBook1x2({
    homeName,
    awayName,
    country: competitionCountry,
    competition: competitionName,
    enabled: !oa1x2Ready,
  });

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
    view === 'middle_guys' ||
    view === 'form' ||
    view === 'last5' ||
    view === 'indlela' ||
    view === 'lost_twice' ||
    view === 'won_twice' ||
    view === 'won_6' ||
    view === 'lost_6' ||
    view === 'sudden_drop' ||
    view === 'sudden_pickup';
  const seasonFx = useSeasonFixtures(competition, season, needSeasonFx);

  const form = useFixtureFormAnalysis({
    homeId,
    awayId,
    standings: like,
    seasonProgress,
    competitionId,
    seasonId,
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
        h2hMatches,
        odds,
        probability,
        book1x2: book.prices,
        oddsPending: !oa1x2Ready && book.loading,
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
      h2hMatches,
      odds,
      probability,
      book.prices,
      book.loading,
      oa1x2Ready,
    ],
  );

  const initialState = useMemo(
    () =>
      buildInitialState({
        homeId,
        awayId,
        homeResults: form.homeResults,
        awayResults: form.awayResults,
        excludeFixtureId: fixtureId,
      }),
    [homeId, awayId, form.homeResults, form.awayResults, fixtureId],
  );

  const history = useMemo(() => {
    const finished = seasonFx.matches.filter((m) => {
      if (kickoffUnix == null || homeId == null || awayId == null) return true;
      return !(m.unix === kickoffUnix && m.homeId === homeId && m.awayId === awayId);
    });
    const fromSeason = seasonFx.matches.length > 0;
    const forSide = (id: number | null, formRows: TeamResult[]): TeamResult[] => {
      if (id == null) return [];
      if (fromSeason) return resultsFromSeasonMatches(id, finished, like);
      return excludeFixture(formRows, fixtureId);
    };
    const home = forSide(homeId, form.homeResults);
    const away = forSide(awayId, form.awayResults);
    const t1Results = pd.t1.venue === 'home' ? home : away;
    const t2Results = pd.t2.venue === 'home' ? home : away;
    return {
      fromSeason,
      loss: { t1: streakSide(t1Results, 'L'), t2: streakSide(t2Results, 'L') },
      win: { t1: streakSide(t1Results, 'W'), t2: streakSide(t2Results, 'W') },
      swing: { t1: ppgSwing(t1Results), t2: ppgSwing(t2Results) },
    };
  }, [
    seasonFx.matches,
    kickoffUnix,
    homeId,
    awayId,
    like,
    fixtureId,
    form.homeResults,
    form.awayResults,
    pd.t1.venue,
    pd.t2.venue,
  ]);

  const indlela = useMemo(
    () => ({
      t1: indlelaPath({
        teamId: pd.t1.teamId,
        homeId,
        awayId,
        kickoffUnix: kickoffUnix ?? null,
        schedule: seasonFx.schedule,
        table: like,
      }),
      t2: indlelaPath({
        teamId: pd.t2.teamId,
        homeId,
        awayId,
        kickoffUnix: kickoffUnix ?? null,
        schedule: seasonFx.schedule,
        table: like,
      }),
    }),
    [pd.t1.teamId, pd.t2.teamId, homeId, awayId, kickoffUnix, seasonFx.schedule, like],
  );

  const problem = useMemo(
    () =>
      evaluateProblemCauser({
        matches: h2hMatches,
        t1Name: pd.t1.name,
        t2Name: pd.t2.name,
        excludeFixtureId: fixtureId,
      }),
    [h2hMatches, pd.t1.name, pd.t2.name, fixtureId],
  );

  const t1Label = pd.t1.label;
  const t2Label = pd.t2.label;
  const homePdLabel = pd.t1.venue === 'home' ? t1Label : t2Label;
  const awayPdLabel = pd.t1.venue === 'away' ? t1Label : t2Label;
  const highlightIds = [pd.t1.teamId, pd.t2.teamId].filter((id): id is number => id != null);
  const teamLabels: Record<number, string> = {};
  if (pd.t1.teamId != null) teamLabels[pd.t1.teamId] = t1Label;
  if (pd.t2.teamId != null) teamLabels[pd.t2.teamId] = t2Label;

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

  const historyGate = (node: ReactNode) => {
    if (seasonId != null && seasonFx.loading && seasonFx.matches.length === 0) {
      return (
        <View style={styles.center}>
          <ActivityIndicator color={theme.accentGreen} />
          <Text style={styles.muted}>Loading previous matches…</Text>
        </View>
      );
    }
    return formGate(node);
  };

  const sampleNote = history.fromSeason
    ? 'Counted across every finished league game this season, excluding this fixture.'
    : 'Counted from the recent finished games on file.';

  const body = (() => {
    switch (view) {
      case 'baseline':
        return (
          <View>
            <SubTabBar
              tabs={[...BASELINE_SUBS]}
              active={baselineSub}
              onChange={(id) => setBaselineSub(id)}
            />
            {baselineSub === 'gap' ? (
              <GapAnalysisCards pd={pd} />
            ) : baselineSub === 'streamline' ? (
              <View>
                <SubTabBar
                  tabs={[...STREAMLINE_SUBS]}
                  active={streamlineSub}
                  highlighted={pd.streamline.t1Stream}
                  onChange={(id) => setStreamlineSub(id)}
                />
                {streamlineSub === 'bateteme' ? (
                  <SubTabBar
                    tabs={[...BATETEME_SUBS]}
                    active={batetemeSub}
                    highlighted={
                      pd.streamline.batetemeKind != null
                        ? String(pd.streamline.batetemeKind)
                        : null
                    }
                    onChange={(id) => setBatetemeSub(id)}
                  />
                ) : null}
                <StreamlineCards
                  pd={pd}
                  focus={streamlineSub}
                  batetemeFocus={streamlineSub === 'bateteme' ? Number(batetemeSub) as 1 | 2 : undefined}
                />
              </View>
            ) : (
              <BaselineCards pd={pd} />
            )}
          </View>
        );
      case 'importance_3pts':
        return (
          <FixtureMotivationPanel
            standings={like}
            homeId={pd.t1.teamId}
            awayId={pd.t2.teamId}
            homeName={pd.t1.name}
            awayName={pd.t2.name}
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
              title="Section 1: INITIAL STATE"
              preserveCase
              note="Overall is the last 5 in any venue. Home/Away keeps the home side at home and the away side on the road."
            />
            <InitialStateCards
              pd={pd}
              home={initialState.home}
              away={initialState.away}
              overallHome={initialState.overallHome}
              overallAway={initialState.overallAway}
              standings={like}
              matches={seasonFx.matches}
              tableLoading={seasonFx.loading}
            />
            <Last5LeagueCards
              pd={pd}
              standings={like}
              matches={seasonFx.matches}
              loading={seasonFx.loading}
              error={seasonFx.error}
              highlightIds={highlightIds}
              teamLabels={teamLabels}
            />
            {(() => {
              const t1L5 = pd.t1.venue === 'home' ? form.last5?.home : form.last5?.away;
              const t2L5 = pd.t2.venue === 'home' ? form.last5?.home : form.last5?.away;
              const pair =
                t1L5 && t2L5 ? findUkulumbana(t1L5.option, t2L5.option) : null;
              const label = pair?.label ?? form.last5?.ukulumbanaLabel;
              if (!label) return null;
              return (
                <Callout
                  text={`${label}${
                    form.last5?.significantSplit
                      ? ' — sides look different right now'
                      : ' — similar recent form'
                  }`}
                  tone={form.last5?.significantSplit ? 'warn' : 'info'}
                />
              );
            })()}
            <Last5Cards pd={pd} home={form.last5?.home} away={form.last5?.away} />
            {form.last5?.lenses.map((l) => (
              <Text key={l.id} style={styles.lens}>
                {l.id}. {l.label}: {homePdLabel} {l.homeScore} vs {awayPdLabel} {l.awayScore}
                {l.sameStrength ? ' · same strength' : ' · split'}
              </Text>
            ))}
            <Last5DiffCards
              pd={pd}
              standings={like}
              matches={seasonFx.matches}
              loading={seasonFx.loading}
              error={seasonFx.error}
            />
            <TwoGoalBandCards
              pd={pd}
              standings={like}
              t1Results={pd.t1.venue === 'home' ? form.homeResults : form.awayResults}
              t2Results={pd.t2.venue === 'home' ? form.homeResults : form.awayResults}
              excludeFixtureId={fixtureId}
              loading={form.loading}
              error={form.error}
            />
            <LabelChangeCards
              pd={pd}
              standings={like}
              t1Results={pd.t1.venue === 'home' ? form.homeResults : form.awayResults}
              t2Results={pd.t2.venue === 'home' ? form.homeResults : form.awayResults}
              excludeFixtureId={fixtureId}
            />
          </View>,
        );
      case 'form':
        if (standings.length === 0) {
          return <Text style={styles.muted}>Need a league table for form.</Text>;
        }
        if (!seasonId) {
          return <Text style={styles.muted}>No season linked to this fixture.</Text>;
        }
        return (
          <FormCards
            pd={pd}
            standings={like}
            matches={seasonFx.matches}
            loading={seasonFx.loading}
            error={seasonFx.error}
            highlightIds={highlightIds}
            teamLabels={teamLabels}
          />
        );
      case 'h2h':
        return (
          <View>
            <SectorIntro
              title="H2H"
              note={`${t1Label} vs ${t2Label} — numbered reads from the last 5 meetings (15 points).`}
            />
            <H2HPanel
              matches={h2hMatches}
              homeName={homeName}
              awayName={awayName}
              t1Name={pd.t1.name}
              t2Name={pd.t2.name}
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
        return formGate(
          <ProblemCauserView t1Label={t1Label} t2Label={t2Label} read={problem} />,
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
            schedule={seasonFx.schedule}
            loading={seasonFx.loading}
            error={seasonFx.error}
            seasonProgress={seasonProgress}
            competitionName={competitionName}
            highlightIds={highlightIds}
            teamLabels={teamLabels}
          />
        );
      case 'indlela':
        return historyGate(
          <IndlelaCards
            t1={{ label: t1Label, path: indlela.t1, teamLetter: indlelaLetter(pd.t1.colour), teamRank: pd.t1.rank }}
            t2={{ label: t2Label, path: indlela.t2, teamLetter: indlelaLetter(pd.t2.colour), teamRank: pd.t2.rank }}
          />,
        );
      case 'competition_status':
        return <CompetitionCards pd={pd} />;
      case 'lost_twice':
        return historyGate(
          <StreakCards
            title="Never lost twice in a row"
            note={`YES means they have never lost two matches back to back. ${sampleNote}`}
            kind="loss"
            mode="never"
            t1={{ label: t1Label, streak: history.loss.t1 }}
            t2={{ label: t2Label, streak: history.loss.t2 }}
          />,
        );
      case 'won_twice':
        return historyGate(
          <StreakCards
            title="Never won twice in a row"
            note={`YES means they have never won two matches back to back. ${sampleNote}`}
            kind="win"
            mode="never"
            t1={{ label: t1Label, streak: history.win.t1 }}
            t2={{ label: t2Label, streak: history.win.t2 }}
          />,
        );
      case 'won_6':
        return historyGate(
          <StreakCards
            title="Won 6 matches in a row"
            note={`YES means the current run is 6 wins or more. Otherwise the recent results are shown. ${sampleNote}`}
            kind="win"
            mode="streak"
            threshold={6}
            t1={{ label: t1Label, streak: history.win.t1 }}
            t2={{ label: t2Label, streak: history.win.t2 }}
          />,
        );
      case 'lost_6':
        return historyGate(
          <StreakCards
            title="Lost 6 matches in a row"
            note={`YES means the current run is 6 losses or more. Otherwise the recent results are shown. ${sampleNote}`}
            kind="loss"
            mode="streak"
            threshold={6}
            t1={{ label: t1Label, streak: history.loss.t1 }}
            t2={{ label: t2Label, streak: history.loss.t2 }}
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
      case 'sudden_pickup':
        return historyGate(
          <SwingCards
            title={view === 'sudden_drop' ? 'Sudden drop' : 'Sudden pick up'}
            want={view === 'sudden_drop' ? 'drop' : 'rise'}
            note={
              view === 'sudden_drop'
                ? `Earlier PPG higher than the last 5. Otherwise NO SUDDEN DROP. ${sampleNote}`
                : `Earlier PPG lower than the last 5. Otherwise NO SUDDEN PICKUP. ${sampleNote}`
            }
            t1={{ label: t1Label, swing: history.swing.t1 }}
            t2={{ label: t2Label, swing: history.swing.t2 }}
          />,
        );
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
        Power dynamics for {t1Label} vs {t2Label} — T1 is the better table side (points, then GD, then goals scored). Open each sector in order.
        Numbers are live from the table and recent finished games.
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
