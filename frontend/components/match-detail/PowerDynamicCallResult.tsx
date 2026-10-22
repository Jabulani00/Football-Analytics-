import { useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import ColourVerificationPanel from '@/components/match-detail/ColourVerificationPanel';
import FormChildBeaterPanel from '@/components/match-detail/FormChildBeaterPanel';
import H2HPanel from '@/components/match-detail/H2HPanel';
import ImportanceOf3Panel from '@/components/match-detail/ImportanceOf3Panel';
import {
  BaselineCards,
  Callout,
  CharacterCards,
  ChildBeaterCards,
  ColourCards,
  CompetitionCards,
  ContestedCards,
  DeathTrapCards,
  FormCards,
  GapAnalysisCards,
  IndlelaCards,
  InitialStateCards,
  LabelChangeCards,
  Last5Cards,
  Last5DiffCards,
  Last5LeagueCards,
  MiddleGuysCards,
  PointsDiffCards,
  ReverseEngineeringCards,
  SectorIntro,
  StreakCards,
  StreamlineCards,
  StruggleCards,
  SwingCards,
  TwoGoalBandCards,
  VenueCards,
} from '@/components/match-detail/PowerDynamicsSectors';
import ProblemCauserView from '@/components/match-detail/ProblemCauserView';
import SubTabBar from '@/components/shared/SubTabBar';
import BhozomaView from '@/components/standings/BhozomaView';
import ImbangiView from '@/components/standings/ImbangiView';
import type { useFixtureFormAnalysis } from '@/hooks/useFixtureFormAnalysis';
import type { H2HMatch, StandingRow } from '@/services/oddAlerts';
import { fonts, spacing, theme } from '@/styles/theme';
import type { SeasonMatch } from '@/utils/bhozomaEngine';
import type { FormChildGroup } from '@/utils/formChildBeater';
import type { H2HSplit } from '@/utils/h2hDisplay';
import type { ImbangiScheduleMatch } from '@/utils/imbangiEngine';
import { findUkulumbana, type FixtureInitialState } from '@/utils/last5Analysis';
import type { StandingLike } from '@/utils/motivationEngine';
import { ALL_POWER_FUNCTIONS } from '@/utils/powerDynamicCalls';
import {
  indlelaLetter,
  type BatetemeKind,
  type IndlelaPath,
  type PowerDynamicsBundle,
  type PpgSwing,
  type StreamName,
  type StreakSide,
} from '@/utils/powerDynamicsEngine';
import type { ProblemCauserRead } from '@/utils/problemCauser';

type FormAnalysis = ReturnType<typeof useFixtureFormAnalysis>;

export type PowerDynamicCallContext = {
  pd: PowerDynamicsBundle;
  like: StandingLike[];
  standings: StandingRow[];
  matches: SeasonMatch[];
  schedule: ImbangiScheduleMatch[];
  matchesLoading: boolean;
  matchesError: string | null;
  seasonId: number | null;
  seasonProgress?: number | null;
  competitionId: number;
  competitionName: string;
  h2hMatches: H2HMatch[];
  homeName: string;
  awayName: string;
  form: FormAnalysis;
  initial: FixtureInitialState;
  history: {
    fromSeason: boolean;
    loss: { t1: StreakSide; t2: StreakSide };
    win: { t1: StreakSide; t2: StreakSide };
    swing: { t1: PpgSwing; t2: PpgSwing };
  };
  indlela: { t1: IndlelaPath; t2: IndlelaPath };
  problem: ProblemCauserRead;
  t1Label: string;
  t2Label: string;
  homePdLabel: string;
  awayPdLabel: string;
  highlightIds: number[];
  teamLabels: Record<number, string>;
  fixtureId?: number | null;
  kickoffUnix?: number;
  homeId: number | null;
  awayId: number | null;
};

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

const STREAM_FOCUS: Record<string, { focus: StreamName; bateteme?: BatetemeKind }> = {
  bateteme_1: { focus: 'bateteme', bateteme: 1 },
  bateteme_2: { focus: 'bateteme', bateteme: 2 },
  compliant: { focus: 'compliant' },
  zidane_law: { focus: 'zidane_law' },
  bookie: { focus: 'bookie' },
  bookie2: { focus: 'bookie2' },
};

type Props = {
  ctx: PowerDynamicCallContext;
  tabId: string;
  functionId: string;
};

export default function PowerDynamicCallResult({ ctx, tabId, functionId }: Props) {
  const sampleNote = ctx.history.fromSeason
    ? 'Counted across every finished league game this season, excluding this fixture.'
    : 'Counted from the recent finished games on file.';
  const seasonWaiting = ctx.seasonId != null && ctx.matchesLoading && ctx.matches.length === 0;

  const formGate = (node: ReactNode) => {
    if (ctx.form.loading) {
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
    if (seasonWaiting) {
      return (
        <View style={styles.center}>
          <ActivityIndicator color={theme.accentGreen} />
          <Text style={styles.muted}>Loading previous matches…</Text>
        </View>
      );
    }
    return formGate(node);
  };

  if (tabId === 'baseline') return <BaselineCall ctx={ctx} functionId={functionId} />;
  if (tabId === 'last5') return formGate(<Last5Call ctx={ctx} functionId={functionId} />);
  if (tabId === 'importance_3pts') return <ImportanceCall ctx={ctx} />;
  if (tabId === 'form') return <FormCall ctx={ctx} />;
  if (tabId === 'h2h') return <H2HCall ctx={ctx} functionId={functionId} />;
  if (tabId === 'form_child_beater') return <ChildCall ctx={ctx} functionId={functionId} />;
  if (tabId === 'home_away_strong') return formGate(<VenueCards pd={ctx.pd} />);
  if (tabId === 'colour_verification') return formGate(<ColourCall ctx={ctx} functionId={functionId} seasonWaiting={seasonWaiting} />);
  if (tabId === 'character') return formGate(<CharacterCards pd={ctx.pd} />);
  if (tabId === 'middle_guys') return formGate(<MiddleGuysCards pd={ctx.pd} />);
  if (tabId === 'bhozoma') return <BhozomaCall ctx={ctx} />;
  if (tabId === 'problem_causer') {
    return formGate(<ProblemCauserView t1Label={ctx.t1Label} t2Label={ctx.t2Label} read={ctx.problem} />);
  }
  if (tabId === 'imbangi') return <ImbangiCall ctx={ctx} />;
  if (tabId === 'indlela') {
    return historyGate(
      <IndlelaCards
        t1={{ label: ctx.t1Label, path: ctx.indlela.t1, teamLetter: indlelaLetter(ctx.pd.t1.colour), teamRank: ctx.pd.t1.rank }}
        t2={{ label: ctx.t2Label, path: ctx.indlela.t2, teamLetter: indlelaLetter(ctx.pd.t2.colour), teamRank: ctx.pd.t2.rank }}
      />,
    );
  }
  if (tabId === 'competition_status') return <CompetitionCards pd={ctx.pd} />;
  if (tabId === 'lost_twice') {
    return historyGate(
      <StreakCards
        title="Never lost twice in a row"
        note={`YES means they have never lost two matches back to back. ${sampleNote}`}
        kind="loss"
        mode="never"
        t1={{ label: ctx.t1Label, streak: ctx.history.loss.t1 }}
        t2={{ label: ctx.t2Label, streak: ctx.history.loss.t2 }}
      />,
    );
  }
  if (tabId === 'won_twice') {
    return historyGate(
      <StreakCards
        title="Never won twice in a row"
        note={`YES means they have never won two matches back to back. ${sampleNote}`}
        kind="win"
        mode="never"
        t1={{ label: ctx.t1Label, streak: ctx.history.win.t1 }}
        t2={{ label: ctx.t2Label, streak: ctx.history.win.t2 }}
      />,
    );
  }
  if (tabId === 'won_6') {
    return historyGate(
      <StreakCards
        title="Won 6 matches in a row"
        note={`YES means the current run is 6 wins or more. Otherwise the recent results are shown. ${sampleNote}`}
        kind="win"
        mode="streak"
        threshold={6}
        t1={{ label: ctx.t1Label, streak: ctx.history.win.t1 }}
        t2={{ label: ctx.t2Label, streak: ctx.history.win.t2 }}
      />,
    );
  }
  if (tabId === 'lost_6') {
    return historyGate(
      <StreakCards
        title="Lost 6 matches in a row"
        note={`YES means the current run is 6 losses or more. Otherwise the recent results are shown. ${sampleNote}`}
        kind="loss"
        mode="streak"
        threshold={6}
        t1={{ label: ctx.t1Label, streak: ctx.history.loss.t1 }}
        t2={{ label: ctx.t2Label, streak: ctx.history.loss.t2 }}
      />,
    );
  }
  if (tabId === 'points_diff') return <PointsDiffCards pd={ctx.pd} />;
  if (tabId === 'child_beater_2') {
    return formGate(
      <ChildBeaterCards
        title="Child beater (method 2)"
        note="Yellow-band application. Top/mid sides regularly thrashing bottom-third opponents (2+ in last 6)."
        pd={ctx.pd}
        method={2}
      />,
    );
  }
  if (tabId === 'sudden_drop' || tabId === 'sudden_pickup') {
    const drop = tabId === 'sudden_drop';
    return historyGate(
      <SwingCards
        title={drop ? 'Sudden drop' : 'Sudden pick up'}
        want={drop ? 'drop' : 'rise'}
        note={
          drop
            ? `Earlier PPG higher than the last 5. Otherwise NO SUDDEN DROP. ${sampleNote}`
            : `Earlier PPG lower than the last 5. Otherwise NO SUDDEN PICKUP. ${sampleNote}`
        }
        t1={{ label: ctx.t1Label, swing: ctx.history.swing.t1 }}
        t2={{ label: ctx.t2Label, swing: ctx.history.swing.t2 }}
      />,
    );
  }
  if (tabId === 'contested_leagues') return <ContestedCards pd={ctx.pd} standings={ctx.like} />;
  if (tabId === 'struggle') return formGate(<StruggleCards pd={ctx.pd} />);
  return <Text style={styles.muted}>This power dynamic has no callable result yet.</Text>;
}

function BaselineCall({ ctx, functionId }: { ctx: PowerDynamicCallContext; functionId: string }) {
  const [baselineSub, setBaselineSub] = useState<(typeof BASELINE_SUBS)[number]['id']>('original');
  const [streamlineSub, setStreamlineSub] = useState<(typeof STREAMLINE_SUBS)[number]['id']>('bateteme');
  const [batetemeSub, setBatetemeSub] = useState<(typeof BATETEME_SUBS)[number]['id']>('1');
  const focused = STREAM_FOCUS[functionId];
  if (focused) {
    return (
      <StreamlineCards
        pd={ctx.pd}
        focus={focused.focus}
        batetemeFocus={focused.bateteme}
      />
    );
  }
  if (functionId === 'original') return <BaselineCards pd={ctx.pd} />;
  if (functionId === 'gap') return <GapAnalysisCards pd={ctx.pd} />;
  return (
    <View>
      <SubTabBar tabs={[...BASELINE_SUBS]} active={baselineSub} onChange={setBaselineSub} />
      {baselineSub === 'gap' ? (
        <GapAnalysisCards pd={ctx.pd} />
      ) : baselineSub === 'streamline' ? (
        <View>
          <SubTabBar
            tabs={[...STREAMLINE_SUBS]}
            active={streamlineSub}
            highlighted={ctx.pd.streamline.t1Stream}
            onChange={setStreamlineSub}
          />
          {streamlineSub === 'bateteme' ? (
            <SubTabBar
              tabs={[...BATETEME_SUBS]}
              active={batetemeSub}
              highlighted={
                ctx.pd.streamline.batetemeKind === 1 || ctx.pd.streamline.batetemeKind === 2
                  ? String(ctx.pd.streamline.batetemeKind) as '1' | '2'
                  : null
              }
              onChange={setBatetemeSub}
            />
          ) : null}
          <StreamlineCards
            pd={ctx.pd}
            focus={streamlineSub}
            batetemeFocus={streamlineSub === 'bateteme' ? Number(batetemeSub) as BatetemeKind : undefined}
          />
        </View>
      ) : (
        <BaselineCards pd={ctx.pd} />
      )}
    </View>
  );
}

function wants(functionId: string, id: string): boolean {
  return functionId === ALL_POWER_FUNCTIONS || functionId === id;
}

function Last5Call({ ctx, functionId }: { ctx: PowerDynamicCallContext; functionId: string }) {
  const t1Results = ctx.pd.t1.venue === 'home' ? ctx.form.homeResults : ctx.form.awayResults;
  const t2Results = ctx.pd.t2.venue === 'home' ? ctx.form.homeResults : ctx.form.awayResults;
  const blocks: ReactNode[] = [];
  if (wants(functionId, 'initial_state')) {
    blocks.push(
      <View key="initial_state">
        <SectorIntro
          title="Section 1: INITIAL STATE"
          preserveCase
          note="Overall is the last 5 in any venue. Home/Away keeps the home side at home and the away side on the road."
        />
        <InitialStateCards
          pd={ctx.pd}
          home={ctx.initial.home}
          away={ctx.initial.away}
          overallHome={ctx.initial.overallHome}
          overallAway={ctx.initial.overallAway}
          standings={ctx.like}
          matches={ctx.matches}
          tableLoading={ctx.matchesLoading}
        />
      </View>,
    );
  }
  if (wants(functionId, 'league')) {
    blocks.push(
      <Last5LeagueCards
        key="league"
        pd={ctx.pd}
        standings={ctx.like}
        matches={ctx.matches}
        loading={ctx.matchesLoading}
        error={ctx.matchesError}
        highlightIds={ctx.highlightIds}
        teamLabels={ctx.teamLabels}
      />,
    );
  }
  if (wants(functionId, 'form_matchup')) {
    const t1L5 = ctx.pd.t1.venue === 'home' ? ctx.form.last5?.home : ctx.form.last5?.away;
    const t2L5 = ctx.pd.t2.venue === 'home' ? ctx.form.last5?.home : ctx.form.last5?.away;
    const pair = t1L5 && t2L5 ? findUkulumbana(t1L5.option, t2L5.option) : null;
    const label = pair?.label ?? ctx.form.last5?.ukulumbanaLabel;
    blocks.push(
      <View key="form_matchup">
        {label ? (
          <Callout
            text={`${label}${ctx.form.last5?.significantSplit ? ' — sides look different right now' : ' — similar recent form'}`}
            tone={ctx.form.last5?.significantSplit ? 'warn' : 'info'}
          />
        ) : null}
        <Last5Cards pd={ctx.pd} home={ctx.form.last5?.home} away={ctx.form.last5?.away} />
        {ctx.form.last5?.lenses.map((lens) => (
          <Text key={lens.id} style={styles.lens}>
            {lens.id}. {lens.label}: {ctx.homePdLabel} {lens.homeScore} vs {ctx.awayPdLabel} {lens.awayScore}
            {lens.sameStrength ? ' · same strength' : ' · split'}
          </Text>
        ))}
      </View>,
    );
  }
  if (wants(functionId, 'diff')) {
    blocks.push(
      <Last5DiffCards
        key="diff"
        pd={ctx.pd}
        standings={ctx.like}
        matches={ctx.matches}
        loading={ctx.matchesLoading}
        error={ctx.matchesError}
      />,
    );
  }
  if (wants(functionId, 'two_goal')) {
    blocks.push(
      <TwoGoalBandCards
        key="two_goal"
        pd={ctx.pd}
        standings={ctx.like}
        t1Results={t1Results}
        t2Results={t2Results}
        excludeFixtureId={ctx.fixtureId}
        loading={ctx.form.loading}
        error={ctx.form.error}
      />,
    );
  }
  if (wants(functionId, 'label_change')) {
    blocks.push(
      <LabelChangeCards
        key="label_change"
        pd={ctx.pd}
        standings={ctx.like}
        t1Results={t1Results}
        t2Results={t2Results}
        excludeFixtureId={ctx.fixtureId}
      />,
    );
  }
  if (wants(functionId, 'death_trap')) {
    blocks.push(
      <DeathTrapCards
        key="death_trap"
        pd={ctx.pd}
        t1Results={t1Results}
        t2Results={t2Results}
        excludeFixtureId={ctx.fixtureId}
      />,
    );
  }
  if (wants(functionId, 'reverse')) {
    blocks.push(
      <ReverseEngineeringCards
        key="reverse"
        pd={ctx.pd}
        standings={ctx.like}
        matches={ctx.matches}
        loading={ctx.matchesLoading}
        error={ctx.matchesError}
      />,
    );
  }
  if (blocks.length === 0) return <Text style={styles.muted}>That function is not part of Last 5.</Text>;
  return <View>{blocks}</View>;
}

function ImportanceCall({ ctx }: { ctx: PowerDynamicCallContext }) {
  return (
    <ImportanceOf3Panel
      standings={ctx.like}
      t1Id={ctx.pd.t1.teamId}
      t2Id={ctx.pd.t2.teamId}
      t1Label={ctx.t1Label}
      t2Label={ctx.t2Label}
      competitionId={ctx.competitionId}
      seasonProgress={ctx.seasonProgress}
      matches={ctx.matches}
      schedule={ctx.schedule}
      imbangiLoading={ctx.seasonId != null && ctx.matchesLoading && ctx.matches.length === 0}
    />
  );
}

function FormCall({ ctx }: { ctx: PowerDynamicCallContext }) {
  if (ctx.standings.length === 0) return <Text style={styles.muted}>Need a league table for form.</Text>;
  if (!ctx.seasonId) return <Text style={styles.muted}>No season linked to this fixture.</Text>;
  return (
    <FormCards
      pd={ctx.pd}
      standings={ctx.like}
      matches={ctx.matches}
      loading={ctx.matchesLoading}
      error={ctx.matchesError}
      highlightIds={ctx.highlightIds}
      teamLabels={ctx.teamLabels}
    />
  );
}

function H2HCall({ ctx, functionId }: { ctx: PowerDynamicCallContext; functionId: string }) {
  const split: H2HSplit = functionId === 'home' || functionId === 'away' ? functionId : 'overall';
  return (
    <View>
      <SectorIntro
        title="H2H"
        note={`${ctx.t1Label} vs ${ctx.t2Label} — numbered reads from the last 5 meetings (15 points).`}
      />
      <H2HPanel
        key={functionId}
        matches={ctx.h2hMatches}
        homeName={ctx.homeName}
        awayName={ctx.awayName}
        t1Name={ctx.pd.t1.name}
        t2Name={ctx.pd.t2.name}
        competitionName={ctx.competitionName}
        initialSplit={split}
      />
    </View>
  );
}

function ChildCall({ ctx, functionId }: { ctx: PowerDynamicCallContext; functionId: string }) {
  const group: FormChildGroup =
    functionId === 'ft' || functionId === '1h' || functionId === '2h' ? functionId : 'table';
  return (
    <FormChildBeaterPanel
      key={group}
      pd={ctx.pd}
      standings={ctx.like}
      matches={ctx.matches}
      loading={ctx.seasonId != null && ctx.matchesLoading && ctx.matches.length === 0}
      error={ctx.matchesError}
      competitionId={ctx.competitionId}
      seasonLinked={ctx.seasonId != null}
      initialGroup={functionId === ALL_POWER_FUNCTIONS ? undefined : group}
      exclude={
        ctx.kickoffUnix != null && ctx.homeId != null && ctx.awayId != null
          ? { unix: ctx.kickoffUnix, homeId: ctx.homeId, awayId: ctx.awayId }
          : null
      }
    />
  );
}

function ColourCall({
  ctx,
  functionId,
  seasonWaiting,
}: {
  ctx: PowerDynamicCallContext;
  functionId: string;
  seasonWaiting: boolean;
}) {
  return (
    <View>
      {wants(functionId, 'verify') ? (
        <ColourVerificationPanel
          pd={ctx.pd}
          standings={ctx.standings}
          matches={ctx.matches}
          matchesLoading={seasonWaiting}
          matchesError={ctx.matchesError}
          seasonLinked={ctx.seasonId != null}
        />
      ) : null}
      {wants(functionId, 'ppg_colour') ? <ColourCards pd={ctx.pd} /> : null}
    </View>
  );
}

function BhozomaCall({ ctx }: { ctx: PowerDynamicCallContext }) {
  if (ctx.standings.length === 0) return <Text style={styles.muted}>Need a league table for Bhozoma.</Text>;
  if (!ctx.seasonId) return <Text style={styles.muted}>No season linked to this fixture.</Text>;
  return (
    <BhozomaView
      standings={ctx.like}
      matches={ctx.matches}
      loading={ctx.matchesLoading}
      error={ctx.matchesError}
      competitionId={ctx.competitionId}
      highlightIds={ctx.highlightIds}
      teamLabels={ctx.teamLabels}
    />
  );
}

function ImbangiCall({ ctx }: { ctx: PowerDynamicCallContext }) {
  if (ctx.standings.length === 0) return <Text style={styles.muted}>Need a league table for Imbangi.</Text>;
  if (!ctx.seasonId) return <Text style={styles.muted}>No season linked to this fixture.</Text>;
  return (
    <ImbangiView
      standings={ctx.like}
      matches={ctx.matches}
      schedule={ctx.schedule}
      loading={ctx.matchesLoading}
      error={ctx.matchesError}
      seasonProgress={ctx.seasonProgress}
      competitionName={ctx.competitionName}
      highlightIds={ctx.highlightIds}
      teamLabels={ctx.teamLabels}
    />
  );
}

const styles = StyleSheet.create({
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
