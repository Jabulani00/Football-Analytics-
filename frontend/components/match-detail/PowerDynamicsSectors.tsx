/**
 * Presentational T1 vs T2 blocks used by Power dynamics tabs.
 */

import { type ReactNode, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  PPG_BAND_LABEL,
  BATETEME_KIND_LABEL,
  BATETEME_KIND_ROLE,
  STREAM_LABEL,
  STREAM_ROLE,
  ZIDANE_PPG_ODDS_RULE,
  baselineGapFor,
  colourWord,
  evaluatePositionGap,
  fmtGapScore,
  fmtPct,
  fmtPpg,
  venuePpgSplit,
  type VenueLeagueRead,
  type VenueSplitLabel,
  positionGapScale,
  wdl,
  type BaselineGap,
  type ChildBeaterSide,
  type ColourSideRead,
  type LastGameFlag,
  type PowerDynamicsBundle,
  type ShowRead,
  type SideSnapshot,
  type BatetemeKind,
  type StreamName,
  type StreakSide,
  type SwingScope,
  type Tone,
} from '@/utils/powerDynamicsEngine';
import {
  CHANGE_LABEL,
  OPTION_LABEL,
  bandFromTablePoints,
  statusFromOutcome,
  type FormBand,
  type InitialStateSide,
  type InitialStatus,
  type TeamLast5,
} from '@/utils/last5Analysis';
import {
  LAST6_BAND_LABEL,
  LAST6_TREND_SHORT,
  compareLast6Form,
  last5FormLeagueTable,
  last6FormFixtureLensRows,
  last6FormFixtureRows,
  last6FormLeagueTable,
  last6FormStandings,
  resultsFromSeasonMatches,
  type Last6FixtureLens,
  type Last6FormBand,
  type Last6LeagueRow,
  type Last6Period,
  type Last6Venue,
} from '@/utils/last6Form';
import { lastN } from '@/utils/teamResults';
import type { SeasonMatch } from '@/utils/bhozomaEngine';
import { GRADE_LABEL, STANCE_LABEL, type StandingLike } from '@/utils/motivationEngine';
import SubTabBar from '@/components/shared/SubTabBar';
import { fonts, layout, spacing, theme } from '@/styles/theme';

function toneColor(t: Tone): string {
  if (t === 'good') return theme.accentGreen;
  if (t === 'warn') return theme.yellow;
  if (t === 'bad') return theme.loss;
  return theme.textMuted;
}

export function SectorIntro({
  title,
  note,
  preserveCase,
}: {
  title: string;
  note?: string;
  preserveCase?: boolean;
}) {
  return (
    <View style={styles.intro}>
      <Text style={[styles.sectorTitle, preserveCase ? styles.sectorTitleAsWritten : null]}>{title}</Text>
      {note ? <Text style={styles.note}>{note}</Text> : null}
    </View>
  );
}

export function Callout({ text, tone = 'info' }: { text: string; tone?: Tone }) {
  return (
    <View style={[styles.callout, { borderColor: toneColor(tone) }]}>
      <Text style={[styles.calloutText, { color: toneColor(tone) }]}>{text}</Text>
    </View>
  );
}

export function SideCard({
  label,
  meta,
  children,
}: {
  label: string;
  meta?: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.sideLabel}>{label}</Text>
      {meta ? <Text style={styles.meta}>{meta}</Text> : null}
      {children}
    </View>
  );
}

function Line({ text, tone }: { text: string; tone?: Tone }) {
  return (
    <Text style={[styles.line, tone ? { color: toneColor(tone) } : null]}>{text}</Text>
  );
}

function GapScoreRow({
  s,
  g,
}: {
  s: SideSnapshot;
  g: BaselineGap['t1'];
}) {
  return (
    <View style={styles.gapRow}>
      <View style={styles.gapScoreBox}>
        <Text style={styles.gapScore}>{fmtGapScore(g.score)}</Text>
        <Text style={styles.gapScoreCap}>gap / 10</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Line
          text={
            g.letter
              ? `Type ${g.letter} (${fmtGapScore(g.received)}/10)`
              : g.meaning
          }
        />
        <View style={styles.meterTrack}>
          <View
            style={[
              styles.meterFill,
              { width: `${((g.score ?? 0) / 10) * 100}%` },
            ]}
          />
        </View>
      </View>
    </View>
  );
}

function PositionGapBoard({ pd }: { pd: PowerDynamicsBundle }) {
  const [open, setOpen] = useState(false);
  const g = pd.positionGap;
  const scale = positionGapScale(g.tableSize);
  const cols = g.tableSize > 0 && g.tableSize < 10 ? g.tableSize : 10;
  const inSpan = (pos: number) => g.from != null && g.to != null && pos >= g.from && pos <= g.to;
  const cellRole = (pos: number): 't1' | 't2' | 'span' | 'idle' => {
    if (g.t1Rank === pos) return 't1';
    if (g.t2Rank === pos) return 't2';
    if (inSpan(pos)) return 'span';
    return 'idle';
  };
  const canOpen = scale.length > 0;

  return (
    <View>
      <View style={styles.gapGradeRow}>
        <Pressable
          onPress={() => canOpen && setOpen(true)}
          disabled={!canOpen}
          accessibilityRole="button"
          accessibilityLabel={g.grade ? `Gap grade ${g.grade}` : 'Gap grade'}
          style={[styles.gapGradeBox, canOpen && styles.gapGradeBoxPress]}>
          <Text style={styles.gapGrade}>{g.grade ?? '—'}</Text>
        </Pressable>
        {g.grade == null ? (
          <View style={{ flex: 1 }}>
            <Callout text={g.call} tone="info" />
          </View>
        ) : null}
      </View>
      {g.tableSize >= 2 ? (
        <View style={styles.posGrid}>
          {Array.from({ length: g.tableSize }, (_, i) => i + 1).map((pos) => {
            const role = cellRole(pos);
            return (
              <View key={pos} style={[styles.posSlot, { width: `${100 / cols}%` }]}>
                <View
                  style={[
                    styles.posCell,
                    role === 't1' && styles.posCellT1,
                    role === 't2' && styles.posCellT2,
                    role === 'span' && styles.posCellSpan,
                  ]}>
                  <Text
                    style={[
                      styles.posNum,
                      (role === 't1' || role === 't2') && styles.posNumOn,
                    ]}>
                    {pos}
                  </Text>
                  {role === 't1' || role === 't2' ? (
                    <Text style={styles.posTag}>{role === 't1' ? 'T1' : 'T2'}</Text>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      ) : null}
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
          <View style={styles.modalSheet}>
            <View style={styles.modalHead}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Gap grades</Text>
                <Text style={styles.modalSub}>{g.tableSize} teams</Text>
              </View>
              <Pressable onPress={() => setOpen(false)} accessibilityRole="button" accessibilityLabel="Close">
                <Text style={styles.modalClose}>Close</Text>
              </Pressable>
            </View>
            <Text style={styles.modalLead}>G1 is the largest gap. Each next grade is one place closer.</Text>
            <View style={styles.modalRowHead}>
              <Text style={styles.modalHeadCol}>Grade</Text>
              <Text style={styles.modalHeadCol}>Gap</Text>
            </View>
            <ScrollView style={styles.modalList}>
              {scale.map((row) => {
                const current = row.grade === g.grade;
                return (
                  <View key={row.grade} style={[styles.modalRow, current && styles.modalRowCurrent]}>
                    <Text style={[styles.modalGrade, current && styles.modalGradeCurrent]}>{row.grade}</Text>
                    <Text style={[styles.modalGap, current && styles.modalGradeCurrent]}>{row.span}</Text>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

export function BaselineCards({
  pd,
  title = 'Baseline — original state',
  note = 'Natural table state before separators. T1 is the better table side (points, then GD, then goals scored); T2 is who they face. A–F types come from the G-grade: k/(N−1), then 100 minus that percentage, on the 0–10 gap scale.',
  hideHeading,
}: {
  pd: PowerDynamicsBundle;
  title?: string;
  note?: string;
  hideHeading?: boolean;
}) {
  const gap = pd.baselineGap;
  const row = (s: SideSnapshot, letter: typeof gap.t1) => (
    <SideCard
      key={s.side}
      label={s.label}
      meta={
        s.rank != null
          ? `${s.venue === 'home' ? 'Home' : 'Away'} · #${s.rank} · ${s.points} pts · ${colourWord(s.colour)}`
          : `${s.venue === 'home' ? 'Home' : 'Away'} · not on this table`
      }>
      <GapScoreRow s={s} g={letter} />
    </SideCard>
  );
  return (
    <View>
      {hideHeading ? null : <SectorIntro title={title} note={note} />}
      {gap.leagueAvgPpg != null ? (
        <Text style={styles.note}>League average PPG {gap.leagueAvgPpg.toFixed(2)}</Text>
      ) : null}
      <Callout
        text={gap.call}
        tone={gap.supports ? 'warn' : gap.stronger === 'level' ? 'info' : 'good'}
      />
      {row(pd.t1, gap.t1)}
      {row(pd.t2, gap.t2)}
      {pd.pointsDiff != null ? (
        <Callout
          text={`${pd.pointsDiff} pts apart${pd.closeOnTable ? ' — close enough that form matters more' : ' — clear gap on the table'}`}
          tone={pd.closeOnTable ? 'warn' : 'info'}
        />
      ) : null}
    </View>
  );
}

export function GapAnalysisCards({
  pd,
  title = 'Gap analysis',
  note,
}: {
  pd: PowerDynamicsBundle;
  title?: string;
  note?: string;
}) {
  const g = pd.positionGap;
  const one = (s: SideSnapshot, rank: number | null) => (
    <SideCard
      key={s.side}
      label={s.label}
      meta={
        rank != null
          ? `${s.venue === 'home' ? 'Home' : 'Away'} · #${rank} · ${s.points ?? '—'} pts`
          : `${s.venue === 'home' ? 'Home' : 'Away'} · not on this table`
      }>
      <Line
        text={
          rank != null
            ? `#${rank}`
            : 'No table place to plot'
        }
      />
    </SideCard>
  );

  return (
    <View>
      <SectorIntro title={title} note={note} />
      <PositionGapBoard pd={pd} />
      {one(pd.t1, g.t1Rank)}
      {one(pd.t2, g.t2Rank)}
    </View>
  );
}

function streamTone(name: StreamName | null): Tone {
  if (name === 'compliant' || name === 'zidane_law') return 'good';
  if (name === 'bookie' || name === 'bookie2') return 'bad';
  if (name === 'bateteme') return 'warn';
  return 'info';
}

export function StreamlineCards({
  pd,
  focus,
  batetemeFocus,
}: {
  pd: PowerDynamicsBundle;
  focus?: StreamName;
  batetemeFocus?: BatetemeKind;
}) {
  const s = pd.streamline;
  const batetemeKindFocus = focus === 'bateteme' ? batetemeFocus : undefined;
  const inBatetemeKind =
    batetemeKindFocus != null && s.close && s.batetemeKind === batetemeKindFocus;
  const belong = (sideLabel: string, points: number | null, stream: StreamName) => {
    const inIt = batetemeKindFocus != null ? inBatetemeKind : s.inStreams[stream];
    const streamName =
      batetemeKindFocus != null ? BATETEME_KIND_LABEL[batetemeKindFocus] : STREAM_LABEL[stream];
    return (
      <SideCard
        key={`${stream}-${batetemeKindFocus ?? ''}-${sideLabel}`}
        label={sideLabel}
        meta={`${points ?? '—'} pts`}>
        <Line
          text={inIt ? `Belongs here — ${streamName}` : `Does not belong in ${streamName}`}
          tone={inIt ? streamTone(stream) : 'info'}
        />
        <Line
          text={s.t1Stream ? `Primary stream: ${STREAM_LABEL[s.t1Stream]}` : 'Not assigned yet'}
        />
        {s.t1Stream === 'bateteme' && s.batetemeKind != null ? (
          <Line text={`Bateteme split: ${BATETEME_KIND_LABEL[s.batetemeKind]}`} />
        ) : null}
      </SideCard>
    );
  };

  const bucket = (name: StreamName, teams: string[]) => (
    <View
      key={name}
      style={[
        styles.streamBucket,
        { borderColor: toneColor(streamTone(name)) },
      ]}>
      <Text style={[styles.streamName, { color: toneColor(streamTone(name)) }]}>
        {STREAM_LABEL[name]}
      </Text>
      <Text style={styles.streamRole}>{STREAM_ROLE[name]}</Text>
      {teams.length > 0 ? (
        teams.map((t) => (
          <Text key={t} style={styles.streamTeam}>
            {t}
          </Text>
        ))
      ) : (
        <Text style={styles.streamEmpty}>No team in this stream</Text>
      )}
    </View>
  );

  const inStream = (name: StreamName): string[] => {
    const out: string[] = [];
    if (s.inStreams[name]) {
      out.push(`${pd.t1.label} · ${s.t1Points ?? '—'} pts`);
      out.push(`${pd.t2.label} · ${s.t2Points ?? '—'} pts`);
    }
    return out;
  };

  const inFocus =
    focus != null &&
    (batetemeKindFocus != null ? inBatetemeKind : s.inStreams[focus]);
  const introNote =
    focus == null
      ? 'One stream per fixture. Order: Bateteme, Compliant, Zidane Law, Bookie mistake, Bookie mistake 2.'
      : batetemeKindFocus != null
        ? BATETEME_KIND_ROLE[batetemeKindFocus]
        : focus === 'zidane_law' || focus === 'bookie' || focus === 'bookie2'
          ? focus === 'bookie2'
            ? `${ZIDANE_PPG_ODDS_RULE}. No H2H games were found.`
            : ZIDANE_PPG_ODDS_RULE
          : !inFocus
            ? undefined
            : focus === 'bateteme'
              ? 'ΔP ≤ 4. Both sides sit here when the points gap is close.'
              : 'T1 is the stronger table side, so T1’s bookmaker 1X2 odds should be lower than T2.';

  const h2hRec = `${s.h2hMeetings} H2H, T1 ${s.t1H2hWins}W / ${s.t1H2hDraws}D / ${s.t1H2hLosses}L`;
  const h2hNote =
    focus === 'bookie2'
      ? s.h2hMeetings === 0
        ? 'No H2H games were found.'
        : `H2H exists (${h2hRec}). Not Bookie mistake 2.`
      : focus === 'bookie'
        ? s.h2hMeetings === 0
          ? 'No H2H meetings — that is Bookie mistake 2, not Bookie mistake.'
          : s.t1DidBeatT2
            ? `${pd.t1.label} did beat ${pd.t2.label} (${h2hRec}).`
            : `${pd.t1.label} has never beaten ${pd.t2.label} (${h2hRec}). Not Bookie mistake.`
        : focus === 'zidane_law'
          ? s.h2hMeetings === 0
            ? 'No H2H meetings — that is Bookie mistake 2, not Zidane Law.'
            : s.t1NeverBeatenT2
              ? `${pd.t1.label} has never beaten ${pd.t2.label} (${h2hRec}).`
              : `${pd.t1.label} did beat ${pd.t2.label} (${h2hRec}). Not Zidane Law.`
          : null;

  const oddsTone: Tone =
    s.oddsOutcome === 'compliant' ? 'good' : s.oddsOutcome === 'non_compliant' ? 'bad' : 'info';
  const showDelta = focus == null || focus === 'bateteme';
  const showPpg =
    focus == null ||
    focus === 'bateteme' ||
    focus === 'zidane_law' ||
    focus === 'bookie' ||
    focus === 'bookie2';
  const showOdds =
    focus == null ||
    focus === 'bateteme' ||
    focus === 'compliant' ||
    focus === 'zidane_law' ||
    focus === 'bookie' ||
    focus === 'bookie2';
  const showCall =
    focus == null ||
    s.t1Stream === focus ||
    (focus === 'bateteme' && batetemeKindFocus != null && s.batetemeKind === batetemeKindFocus);

  return (
    <View>
      <SectorIntro
        title={
          batetemeKindFocus != null
            ? BATETEME_KIND_LABEL[batetemeKindFocus]
            : focus
              ? STREAM_LABEL[focus]
              : 'Streamline'
        }
        note={introNote}
      />
      {showDelta ? (
        <Callout
          text={
            s.delta != null
              ? `${pd.t1.label} ${s.t1Points} − ${pd.t2.label} ${s.t2Points} = ${s.delta}`
              : 'Need both sides\' points'
          }
          tone={s.close ? 'warn' : 'info'}
        />
      ) : null}
      {showPpg ? (
        <Callout
          text={`${pd.t1.label} PPG ${fmtPpg(s.t1Ppg)} (${s.t1Points ?? '—'} pts / ${s.t1Played ?? '—'} league games) · ${pd.t2.label} PPG ${fmtPpg(s.t2Ppg)} (${s.t2Points ?? '—'} pts / ${s.t2Played ?? '—'} league games)`}
          tone="info"
        />
      ) : null}
      {showOdds ? (
        <Callout text={s.oddsCall} tone={oddsTone} />
      ) : null}
      {h2hNote ? (
        <Callout
          text={h2hNote}
          tone={
            (focus === 'bookie' && s.inStreams.bookie) ||
            (focus === 'bookie2' && s.inStreams.bookie2) ||
            (focus === 'zidane_law' && s.inStreams.zidane_law)
              ? focus === 'bookie'
                ? 'bad'
                : 'good'
              : 'info'
          }
        />
      ) : null}
      {showCall ? (
        <Callout text={s.call} tone={s.close ? 'warn' : s.t1Stream === 'bookie' || s.t1Stream === 'bookie2' ? 'bad' : 'info'} />
      ) : null}
      {focus ? (
        <>
          {inFocus && batetemeKindFocus != null ? (
            <View
              style={[styles.streamBucket, { borderColor: toneColor(streamTone('bateteme')) }]}>
              <Text style={[styles.streamName, { color: toneColor(streamTone('bateteme')) }]}>
                {BATETEME_KIND_LABEL[batetemeKindFocus]}
              </Text>
              <Text style={styles.streamRole}>{BATETEME_KIND_ROLE[batetemeKindFocus]}</Text>
              {inStream('bateteme').map((t) => (
                <Text key={t} style={styles.streamTeam}>
                  {t}
                </Text>
              ))}
            </View>
          ) : inFocus ? (
            bucket(focus, inStream(focus))
          ) : null}
          {belong(pd.t1.label, s.t1Points, focus)}
          {belong(pd.t2.label, s.t2Points, focus)}
        </>
      ) : s.t1Stream ? (
        bucket(s.t1Stream, inStream(s.t1Stream))
      ) : null}
    </View>
  );
}

function statusTone(status: InitialStatus): Tone {
  if (status === 'Good') return 'good';
  if (status === 'Bad') return 'bad';
  return 'warn';
}

function tallyInitial(side: InitialStateSide | null | undefined) {
  const matches = side?.matches ?? [];
  let won = 0;
  let drawn = 0;
  let lost = 0;
  let gf = 0;
  let ga = 0;
  for (const m of matches) {
    if (m.outcome === 'W') won += 1;
    else if (m.outcome === 'D') drawn += 1;
    else lost += 1;
    gf += m.result.gf;
    ga += m.result.ga;
  }
  const mp = matches.length;
  const points = won * 3 + drawn;
  return { matches, won, drawn, lost, gf, ga, mp, points, gd: gf - ga, ppg: mp > 0 ? points / mp : null };
}

type InitialTally = ReturnType<typeof tallyInitial>;

type InitialLens = 'overall' | 'home_away';

const INITIAL_LENS_TABS: { id: InitialLens; label: string }[] = [
  { id: 'overall', label: 'Overall' },
  { id: 'home_away', label: 'Home/Away' },
];

/** Last-5 places. Fixture sides keep the sample already shown in the table. */
function venueLast5Rows(
  standings: StandingLike[],
  matches: SeasonMatch[],
  venue: 'home' | 'away' | 'overall',
  focus: { teamId: number | null; tally: InitialTally }[],
): StandingLike[] {
  const focusById = new Map(
    focus
      .filter((f): f is { teamId: number; tally: InitialTally } => f.teamId != null)
      .map((f) => [f.teamId, f.tally]),
  );
  const rows = standings.map((s) => {
    const kept = focusById.get(s.teamId);
    if (kept) {
      return { teamId: s.teamId, name: s.name, zone: s.zone, points: kept.points, gd: kept.gd, gf: kept.gf, played: kept.mp };
    }
    const window = lastN(resultsFromSeasonMatches(s.teamId, matches, standings, { venue }), 5);
    let points = 0;
    let gf = 0;
    let ga = 0;
    for (const r of window) {
      if (r.outcome === 'W') points += 3;
      else if (r.outcome === 'D') points += 1;
      gf += r.gf;
      ga += r.ga;
    }
    return { teamId: s.teamId, name: s.name, zone: s.zone, points, gd: gf - ga, gf, played: window.length };
  });
  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.gd !== a.gd) return b.gd - a.gd;
    if (b.gf !== a.gf) return b.gf - a.gf;
    return a.teamId - b.teamId;
  });
  return rows.map((r, i) => ({
    rank: i + 1,
    teamId: r.teamId,
    name: r.name,
    points: r.points,
    played: r.played,
    zone: r.zone,
    goalDiff: r.gd,
    goalsFor: r.gf,
  }));
}

function initialBaselineBundle(
  pd: PowerDynamicsBundle,
  home: InitialStateSide | null,
  away: InitialStateSide | null,
  overallHome: InitialStateSide | null,
  overallAway: InitialStateSide | null,
  standings: StandingLike[],
  matches: SeasonMatch[],
  lens: InitialLens,
): PowerDynamicsBundle {
  const homeId = pd.t1.venue === 'home' ? pd.t1.teamId : pd.t2.teamId;
  const awayId = pd.t1.venue === 'away' ? pd.t1.teamId : pd.t2.teamId;
  const homeTable =
    lens === 'overall'
      ? venueLast5Rows(standings, matches, 'overall', [
          { teamId: homeId, tally: tallyInitial(overallHome) },
          { teamId: awayId, tally: tallyInitial(overallAway) },
        ])
      : venueLast5Rows(standings, matches, 'home', [{ teamId: homeId, tally: tallyInitial(home) }]);
  const awayTable =
    lens === 'overall'
      ? homeTable
      : venueLast5Rows(standings, matches, 'away', [{ teamId: awayId, tally: tallyInitial(away) }]);
  const homeRank = homeId != null ? homeTable.find((r) => r.teamId === homeId) : undefined;
  const awayRank = awayId != null ? awayTable.find((r) => r.teamId === awayId) : undefined;
  const apply = (snap: SideSnapshot): SideSnapshot => {
    const row = snap.venue === 'home' ? homeRank : awayRank;
    return {
      ...snap,
      rank: row?.rank ?? null,
      points: row && row.played > 0 ? row.points : null,
      played: row && row.played > 0 ? row.played : null,
      goalDiff: row && row.played > 0 ? row.goalDiff ?? null : null,
      goalsFor: row && row.played > 0 ? row.goalsFor ?? null : null,
    };
  };
  const t1 = apply(pd.t1);
  const t2 = apply(pd.t2);
  const positionGap = evaluatePositionGap({
    tableSize: standings.length,
    t1Rank: t1.rank,
    t2Rank: t2.rank,
    t1Label: t1.label,
    t2Label: t2.label,
  });
  const baselineGap = baselineGapFor(
    t1,
    t2,
    lens === 'overall' ? homeTable : [...homeTable, ...awayTable],
    positionGap,
  );
  const pointsDiff = t1.points != null && t2.points != null ? Math.abs(t1.points - t2.points) : null;
  return {
    ...pd,
    t1,
    t2,
    positionGap,
    baselineGap,
    pointsDiff,
    closeOnTable: pointsDiff != null && pointsDiff <= 4,
  };
}

export function InitialStateCards({
  pd,
  home,
  away,
  overallHome,
  overallAway,
  standings,
  matches,
  tableLoading,
}: {
  pd: PowerDynamicsBundle;
  home: InitialStateSide | null;
  away: InitialStateSide | null;
  overallHome: InitialStateSide | null;
  overallAway: InitialStateSide | null;
  standings: StandingLike[];
  matches: SeasonMatch[];
  tableLoading?: boolean;
}) {
  const [lens, setLens] = useState<InitialLens>('overall');
  const sides = [pd.t1, pd.t2].map((snap) => {
    const sample =
      lens === 'home_away'
        ? snap.venue === 'home'
          ? home
          : away
        : snap.venue === 'home'
          ? overallHome
          : overallAway;
    return { snap, tally: tallyInitial(sample) };
  });
  const ranked = [...sides].sort((a, b) => {
    if (b.tally.points !== a.tally.points) return b.tally.points - a.tally.points;
    if (b.tally.gd !== a.tally.gd) return b.tally.gd - a.tally.gd;
    return b.tally.gf - a.tally.gf;
  });
  const rankBySide = new Map(ranked.map((row, i) => [row.snap.side, i + 1]));
  const [left, right] = sides;
  let call = 'Need finished games for the initial state.';
  let callTone: Tone = 'info';
  if (left && right && left.tally.mp > 0 && right.tally.mp > 0) {
    const gap = left.tally.points - right.tally.points;
    if (gap >= 3) {
      call = `${left.snap.label} is in better last-5 form (${left.tally.points}–${right.tally.points} pts).`;
      callTone = 'warn';
    } else if (gap <= -3) {
      call = `${right.snap.label} is in better last-5 form (${right.tally.points}–${left.tally.points} pts).`;
      callTone = 'warn';
    } else {
      call = `Similar last-5 form — ${left.snap.label} ${left.tally.points} pts, ${right.snap.label} ${right.tally.points} pts.`;
    }
  } else if ((left?.tally.mp ?? 0) > 0 || (right?.tally.mp ?? 0) > 0) {
    const only = (left?.tally.mp ?? 0) > 0 ? left : right;
    call = `Only ${only?.snap.label} has a last-5 sample so far.`;
  }

  return (
    <View>
      <SubTabBar tabs={INITIAL_LENS_TABS} active={lens} onChange={setLens} />
      <Text style={styles.note}>
        {lens === 'overall'
          ? 'Last 5 in any venue. W = Good · D = Med · L = Bad'
          : 'Home side at home, away side away. W = Good · D = Med · L = Bad'}
      </Text>
      <Callout text={call} tone={callTone} />
      <ScrollView horizontal showsHorizontalScrollIndicator style={styles.initialScroll}>
        <View style={[styles.formTable, styles.initialTable]}>
          <View style={[styles.formRow, styles.formHead]}>
            <Text style={[styles.formTh, styles.formPos]}>#</Text>
            <Text style={[styles.formTh, styles.formTeam]}>Team</Text>
            <Text style={[styles.formTh, styles.initialSeqHead]}>Last 5</Text>
            <Text style={[styles.formTh, styles.formNum]}>MP</Text>
            <Text style={[styles.formTh, styles.formWdl]}>W-D-L</Text>
            <Text style={[styles.formTh, styles.formNum]}>Pts</Text>
            <Text style={[styles.formTh, styles.formNum]}>PPG</Text>
            <Text style={[styles.formTh, styles.formNum]}>GD</Text>
          </View>
          {sides.map(({ snap, tally }) => (
            <View key={snap.side} style={[styles.formRow, styles.formRowFocus]}>
              <FormCell style={styles.formPos}>{String(rankBySide.get(snap.side) ?? '—')}</FormCell>
              <View style={styles.formTeam}>
                {lens === 'home_away' ? (
                  <Text
                    style={[
                      styles.formVenue,
                      snap.venue === 'home' ? styles.formVenueHome : styles.formVenueAway,
                    ]}
                    numberOfLines={1}>
                    {snap.venue === 'home' ? 'Home' : 'Away'}
                  </Text>
                ) : null}
                <Text style={styles.formTeamName} numberOfLines={1}>
                  {snap.label}
                </Text>
                {tally.matches.length > 0 ? (
                  <Text style={styles.formScores} numberOfLines={1}>
                    {tally.matches.map((m) => `${m.result.gf}-${m.result.ga}`).join(' · ')}
                  </Text>
                ) : null}
              </View>
              <View style={styles.initialSeq}>
                {tally.matches.length > 0 ? (
                  tally.matches.map((m, i) => (
                    <Text
                      key={`${m.result.fixtureId}-${i}`}
                      style={[styles.initialSeqTag, { color: toneColor(statusTone(m.status)) }]}>
                      {m.outcome} ({m.status})
                    </Text>
                  ))
                ) : (
                  <Text style={styles.formTd}>—</Text>
                )}
              </View>
              <FormCell style={styles.formNum}>{tally.mp > 0 ? String(tally.mp) : '—'}</FormCell>
              <FormCell style={styles.formWdl}>
                {tally.mp > 0 ? `${tally.won}-${tally.drawn}-${tally.lost}` : '—'}
              </FormCell>
              <FormCell style={styles.formNum}>{tally.mp > 0 ? String(tally.points) : '—'}</FormCell>
              <FormCell style={styles.formNum}>
                {tally.ppg != null ? tally.ppg.toFixed(2) : '—'}
              </FormCell>
              <FormCell style={styles.formNum}>
                {tally.mp > 0 ? `${tally.gd >= 0 ? '+' : ''}${tally.gd}` : '—'}
              </FormCell>
            </View>
          ))}
        </View>
      </ScrollView>
      {standings.length < 2 ? (
        <Text style={styles.note}>Need a league table for the initial-state baseline.</Text>
      ) : matches.length === 0 ? (
        <Text style={styles.note}>
          {tableLoading ? 'Building the last-5 baseline from season results…' : 'No season results for the initial-state baseline yet.'}
        </Text>
      ) : (
        <BaselineCards
          pd={initialBaselineBundle(pd, home, away, overallHome, overallAway, standings, matches, lens)}
          hideHeading
        />
      )}
    </View>
  );
}

export function Last5Cards({
  pd,
  home,
  away,
}: {
  pd: PowerDynamicsBundle;
  home: TeamLast5 | null | undefined;
  away: TeamLast5 | null | undefined;
}) {
  const t1Team = pd.t1.venue === 'home' ? home : away;
  const t2Team = pd.t2.venue === 'home' ? home : away;
  const block = (label: string, team: TeamLast5 | null | undefined, flags: LastGameFlag[]) => (
    <SideCard label={label}>
      {team ? (
        <>
          <Line text={`${OPTION_LABEL[team.option]} · ${team.tablePoints} pts from last 5`} />
          <Text style={styles.seq}>{team.sequence.join(' ')}</Text>
          <Line text={CHANGE_LABEL[team.change]} />
          {team.inhlambuluko ? <Line text="Bounce-back stretch (3+ draws)" tone="warn" /> : null}
        </>
      ) : (
        <Line text="No last-5 sample yet" />
      )}
      <Text style={styles.subHead}>Last game</Text>
      {flags
        .filter((f) => f.active && !f.blocked)
        .map((f) => (
          <Line key={f.id} text={`· ${f.label}`} />
        ))}
      {flags.some((f) => f.blocked) ? (
        <Line text="0–0 HT / 2nd half blocked — no half-time score on last game" />
      ) : null}
    </SideCard>
  );
  return (
    <View>
      {block(pd.t1.label, t1Team, pd.lastGame.t1)}
      {block(pd.t2.label, t2Team, pd.lastGame.t2)}
    </View>
  );
}

const LAST5_VENUE_TABS: { id: Last6Venue; label: string }[] = [
  { id: 'overall', label: 'Overall' },
  { id: 'home', label: 'Home' },
  { id: 'away', label: 'Away' },
];

function last5BandLabel(band: FormBand): string {
  if (band === 'good') return 'Good';
  if (band === 'bad') return 'Bad';
  return 'Med';
}

function last5BandTone(band: FormBand): Tone {
  if (band === 'good') return 'good';
  if (band === 'bad') return 'bad';
  return 'warn';
}

export function Last5LeagueCards({
  pd,
  standings,
  matches,
  loading,
  error,
  highlightIds,
  teamLabels,
}: {
  pd: PowerDynamicsBundle;
  standings: StandingLike[];
  matches: SeasonMatch[];
  loading?: boolean;
  error?: string | null;
  highlightIds?: number[];
  teamLabels?: Record<number, string>;
}) {
  const [venue, setVenue] = useState<Last6Venue>('overall');
  const [period, setPeriod] = useState<Last6Period>('ft');
  const table = last5FormLeagueTable(standings, matches, { venue, period });
  const rows = [...table].sort((a, b) => a.formRank - b.formRank);
  const fixtureIds = (highlightIds ?? [pd.t1.teamId, pd.t2.teamId]).filter(
    (id): id is number => id != null && Number.isFinite(id),
  );
  const highlightSet = new Set(fixtureIds);
  const formPd = overlayFormBaseline(pd, table);
  const typeById = new Map<number, { letter: string | null; score: number | null }>();
  if (pd.t1.teamId != null) {
    typeById.set(pd.t1.teamId, { letter: formPd.baselineGap.t1.letter, score: formPd.baselineGap.t1.score });
  }
  if (pd.t2.teamId != null) {
    typeById.set(pd.t2.teamId, { letter: formPd.baselineGap.t2.letter, score: formPd.baselineGap.t2.score });
  }
  const htCovered = matches.filter((m) => m.homeGoalsHt != null && m.awayGoalsHt != null).length;
  const venueNote =
    venue === 'home'
      ? 'Last 5 home matches for every side.'
      : venue === 'away'
        ? 'Last 5 away matches for every side.'
        : 'Last 5 matches in any venue for every side.';

  if (loading) {
    return (
      <View>
        <SectorIntro title="Section 2: LAST 5" preserveCase note="Ranking every side by last-5 form." />
        <Text style={styles.note}>Building last-5 ranking from season results…</Text>
      </View>
    );
  }
  if (error) {
    return (
      <View>
        <SectorIntro title="Section 2: LAST 5" preserveCase />
        <Text style={styles.note}>{error}</Text>
      </View>
    );
  }

  return (
    <View>
      <SectorIntro
        title="Section 2: LAST 5"
        preserveCase
        note="League ranking from last 5. Fixture sides are highlighted."
      />
      <SubTabBar tabs={LAST5_VENUE_TABS} active={venue} onChange={setVenue} />
      <SubTabBar tabs={FORM_PERIOD_TABS} active={period} onChange={setPeriod} />
      <Text style={styles.note}>{venueNote} W = Good · D = Med · L = Bad</Text>
      {period !== 'ft' ? (
        <Text style={styles.note}>
          {htCovered} of {matches.length} finished games have a half-time score
          {htCovered === 0 ? ' — half tables stay empty until that data lands' : ''}.
        </Text>
      ) : null}
      {standings.length < 2 ? (
        <Text style={styles.note}>Need a league table for this ranking.</Text>
      ) : matches.length === 0 ? (
        <Text style={styles.note}>No finished season fixtures loaded yet.</Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator style={styles.initialScroll}>
          <View style={[styles.formTable, styles.last5LeagueTable]}>
            <View style={[styles.formRow, styles.formHead]}>
              <Text style={[styles.formTh, styles.formPos]}>#</Text>
              <Text style={[styles.formTh, styles.formTeam]}>Team</Text>
              <Text style={[styles.formTh, styles.initialSeqHead]}>Last 5</Text>
              <Text style={[styles.formTh, styles.formNum]}>MP</Text>
              <Text style={[styles.formTh, styles.formWdl]}>W-D-L</Text>
              <Text style={[styles.formTh, styles.formNum]}>Pts</Text>
              <Text style={[styles.formTh, styles.formNum]}>PPG</Text>
              <Text style={[styles.formTh, styles.formNum]}>GD</Text>
              <Text style={[styles.formTh, styles.formType]}>Type</Text>
              <Text style={[styles.formTh, styles.formNum]}>Gap</Text>
              <Text style={[styles.formTh, styles.formRead]}>Read</Text>
            </View>
            {rows.map((r) => {
              const f = r.form;
              const typed = typeById.get(r.teamId);
              const band = f ? bandFromTablePoints(f.points) : null;
              return (
                <View
                  key={r.teamId}
                  style={[styles.formRow, highlightSet.has(r.teamId) && styles.formRowFocus]}>
                  <FormCell style={styles.formPos}>{String(r.formRank)}</FormCell>
                  <View style={styles.formTeam}>
                    <Text style={styles.formTeamName} numberOfLines={1}>
                      {teamLabels?.[r.teamId] ?? r.name}
                    </Text>
                    {f ? (
                      <Text style={styles.formScores} numberOfLines={1}>
                        {f.games.map((g) => `${g.gf}-${g.ga}`).join(' · ')}
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.initialSeq}>
                    {f && f.games.length > 0 ? (
                      f.games.map((g, i) => {
                        const status = statusFromOutcome(g.outcome);
                        return (
                          <Text
                            key={`${r.teamId}-${i}`}
                            style={[styles.initialSeqTag, { color: toneColor(statusTone(status)) }]}>
                            {g.outcome} ({status})
                          </Text>
                        );
                      })
                    ) : (
                      <Text style={styles.formTd}>—</Text>
                    )}
                  </View>
                  <FormCell style={styles.formNum}>{f ? String(f.mp) : '—'}</FormCell>
                  <FormCell style={styles.formWdl}>{f ? `${f.won}-${f.drawn}-${f.lost}` : '—'}</FormCell>
                  <FormCell style={styles.formNum}>{f ? String(f.points) : '—'}</FormCell>
                  <FormCell style={styles.formNum}>{f?.ppg != null ? f.ppg.toFixed(2) : '—'}</FormCell>
                  <FormCell style={styles.formNum}>{f ? `${f.gd >= 0 ? '+' : ''}${f.gd}` : '—'}</FormCell>
                  <FormCell style={styles.formType}>{typed?.letter ?? '—'}</FormCell>
                  <FormCell style={styles.formNum}>
                    {typed?.score != null ? fmtGapScore(typed.score) : '—'}
                  </FormCell>
                  <FormCell style={styles.formRead} tone={band ? last5BandTone(band) : undefined}>
                    {band ? last5BandLabel(band) : 'No sample'}
                  </FormCell>
                </View>
              );
            })}
          </View>
        </ScrollView>
      )}
      {standings.length >= 2 && matches.length > 0 ? (
        <BaselineCards pd={formPd} hideHeading />
      ) : null}
    </View>
  );
}

function last6Tone(band: Last6FormBand): Tone {
  if (band === 'strong') return 'good';
  if (band === 'poor') return 'bad';
  return 'warn';
}

const FORM_SUBS = [
  { id: 'table', label: 'Full table' },
  { id: 'fixture', label: 'This fixture' },
] as const;

const FIXTURE_LENS_TABS: { id: Last6FixtureLens; label: string }[] = [
  { id: 'overall', label: 'Overall' },
  { id: 'home', label: 'Home' },
  { id: 'away', label: 'Away' },
  { id: 'home_away', label: 'Home/Away' },
];

const FORM_PERIOD_TABS: { id: Last6Period; label: string }[] = [
  { id: 'ft', label: 'Full time' },
  { id: '1h', label: '1st half' },
  { id: '2h', label: '2nd half' },
];

type FormSubId = (typeof FORM_SUBS)[number]['id'];

function FormCell({
  children,
  style,
  tone,
}: {
  children: string;
  style?: object;
  tone?: Tone;
}) {
  return (
    <Text style={[styles.formTd, style, tone ? { color: toneColor(tone) } : null]} numberOfLines={1}>
      {children}
    </Text>
  );
}

function FormDataRow({
  row,
  highlight,
  extraLabel,
  typeLetter,
  gapScore,
  venueRole,
}: {
  row: Last6LeagueRow;
  highlight?: boolean;
  extraLabel?: string;
  typeLetter?: string | null;
  gapScore?: number | null;
  venueRole?: 'Home' | 'Away' | null;
}) {
  const f = row.form;
  return (
    <View style={[styles.formRow, highlight && styles.formRowFocus, row.zone === 'mid' && styles.formRowMid]}>
      <FormCell style={styles.formPos}>{String(row.formRank)}</FormCell>
      <View style={styles.formTeam}>
        {venueRole ? (
          <Text
            style={[
              styles.formVenue,
              venueRole === 'Home' ? styles.formVenueHome : styles.formVenueAway,
            ]}
            numberOfLines={1}>
            {venueRole}
          </Text>
        ) : null}
        <Text style={styles.formTeamName} numberOfLines={1}>
          {extraLabel ?? row.name}
        </Text>
        {f ? (
          <Text style={styles.formScores} numberOfLines={1}>
            {f.games.map((g) => `${g.gf}-${g.ga}`).join(' · ')}
          </Text>
        ) : null}
      </View>
      <FormCell style={styles.formSeq}>{f ? f.sequence.join(' ') : '—'}</FormCell>
      <FormCell style={styles.formNum}>{f ? String(f.mp) : '—'}</FormCell>
      <FormCell style={styles.formWdl}>{f ? `${f.won}-${f.drawn}-${f.lost}` : '—'}</FormCell>
      <FormCell style={styles.formNum}>{f ? String(f.points) : '—'}</FormCell>
      <FormCell style={styles.formNum}>{f?.ppg != null ? f.ppg.toFixed(2) : '—'}</FormCell>
      <FormCell style={styles.formNum}>
        {f ? `${f.gd >= 0 ? '+' : ''}${f.gd}` : '—'}
      </FormCell>
      <FormCell style={styles.formType}>{typeLetter ?? '—'}</FormCell>
      <FormCell style={styles.formNum}>{gapScore != null ? fmtGapScore(gapScore) : '—'}</FormCell>
      <FormCell style={styles.formRead} tone={f ? last6Tone(f.band) : undefined}>
        {f ? LAST6_BAND_LABEL[f.band] : 'No sample'}
      </FormCell>
      <FormCell
        style={styles.formTrend}
        tone={f?.trend === 'picking_up' ? 'good' : f?.trend === 'dropping' ? 'bad' : 'info'}>
        {f ? LAST6_TREND_SHORT[f.trend] : '—'}
      </FormCell>
    </View>
  );
}

function overlayFormBaseline(
  pd: PowerDynamicsBundle,
  table: Last6LeagueRow[],
): PowerDynamicsBundle {
  const formStandings = last6FormStandings(table);
  const t1Row = table.find((r) => r.teamId === pd.t1.teamId);
  const t2Row = table.find((r) => r.teamId === pd.t2.teamId);
  const t1: SideSnapshot = {
    ...pd.t1,
    rank: t1Row?.formRank ?? null,
    points: t1Row?.form?.points ?? null,
    played: t1Row?.form?.mp ?? null,
    goalDiff: t1Row?.form?.gd ?? null,
    goalsFor: t1Row?.form?.gf ?? null,
  };
  const t2: SideSnapshot = {
    ...pd.t2,
    rank: t2Row?.formRank ?? null,
    points: t2Row?.form?.points ?? null,
    played: t2Row?.form?.mp ?? null,
    goalDiff: t2Row?.form?.gd ?? null,
    goalsFor: t2Row?.form?.gf ?? null,
  };
  const positionGap = evaluatePositionGap({
    tableSize: table.length,
    t1Rank: t1.rank,
    t2Rank: t2.rank,
    t1Label: t1.label,
    t2Label: t2.label,
  });
  const baselineGap = baselineGapFor(t1, t2, formStandings, positionGap);
  const pointsDiff =
    t1.points != null && t2.points != null ? Math.abs(t1.points - t2.points) : null;
  return {
    ...pd,
    t1,
    t2,
    positionGap,
    baselineGap,
    pointsDiff,
    closeOnTable: pointsDiff != null && pointsDiff <= 4,
  };
}

export function FormCards({
  pd,
  standings,
  matches,
  loading,
  error,
  highlightIds,
  teamLabels,
}: {
  pd: PowerDynamicsBundle;
  standings: StandingLike[];
  matches: SeasonMatch[];
  loading?: boolean;
  error?: string | null;
  highlightIds?: number[];
  teamLabels?: Record<number, string>;
}) {
  const [sub, setSub] = useState<FormSubId>('fixture');
  const [lens, setLens] = useState<Last6FixtureLens>('overall');
  const [period, setPeriod] = useState<Last6Period>('ft');
  const table = last6FormLeagueTable(standings, matches);
  const fixtureIds = (highlightIds ?? [pd.t1.teamId, pd.t2.teamId]).filter(
    (id): id is number => id != null && Number.isFinite(id),
  );
  const fixtureHomeId = pd.t1.venue === 'home' ? pd.t1.teamId : pd.t2.teamId;
  const fixtureAwayId = pd.t1.venue === 'away' ? pd.t1.teamId : pd.t2.teamId;
  const homeLabel = pd.t1.venue === 'home' ? pd.t1.label : pd.t2.label;
  const awayLabel = pd.t1.venue === 'away' ? pd.t1.label : pd.t2.label;
  const fixtureRows = last6FormFixtureRows(table, fixtureIds);
  const scopedRows = last6FormFixtureLensRows({
    standings,
    matches,
    homeId: fixtureHomeId,
    awayId: fixtureAwayId,
    orderIds: fixtureIds,
    lens,
    period,
  });
  const highlightSet = new Set(fixtureIds);
  const t1Row = scopedRows.find((r) => r.teamId === pd.t1.teamId);
  const t2Row = scopedRows.find((r) => r.teamId === pd.t2.teamId);
  const pair = compareLast6Form(t1Row?.form ?? null, t2Row?.form ?? null, pd.t1.label, pd.t2.label);
  const rows = sub === 'table' ? [...table].sort((a, b) => a.formRank - b.formRank) : scopedRows;
  const formPd = overlayFormBaseline(pd, table);
  const typeById = new Map<number, { letter: string | null; score: number | null }>();
  if (pd.t1.teamId != null) {
    typeById.set(pd.t1.teamId, { letter: formPd.baselineGap.t1.letter, score: formPd.baselineGap.t1.score });
  }
  if (pd.t2.teamId != null) {
    typeById.set(pd.t2.teamId, { letter: formPd.baselineGap.t2.letter, score: formPd.baselineGap.t2.score });
  }
  const htCovered = matches.filter((m) => m.homeGoalsHt != null && m.awayGoalsHt != null).length;
  const lensNote =
    lens === 'home'
      ? `Home form for ${homeLabel} — last 6 at home.`
      : lens === 'away'
        ? `Away form for ${awayLabel} — last 6 on the road.`
        : lens === 'home_away'
          ? 'Home side’s last 6 at home and away side’s last 6 on the road.'
          : 'Both sides, last 6 in any venue.';

  if (loading) {
    return (
      <View>
        <SectorIntro title="Form" note="Last 6 finished league games." />
        <Text style={styles.note}>Building last-6 form from season results…</Text>
      </View>
    );
  }
  if (error) {
    return (
      <View>
        <SectorIntro title="Form" />
        <Text style={styles.note}>{error}</Text>
      </View>
    );
  }

  return (
    <View>
      <SectorIntro
        title="Form"
        note="Last 6 finished league games. Baseline types and gap grades use the same method as the Baseline tab, from last-6 form places."
      />
      <SubTabBar tabs={[...FORM_SUBS]} active={sub} onChange={setSub} />
      {sub === 'fixture' ? (
        <View>
          <SubTabBar tabs={FIXTURE_LENS_TABS} active={lens} onChange={setLens} />
          <SubTabBar tabs={FORM_PERIOD_TABS} active={period} onChange={setPeriod} />
          <Text style={styles.note}>{lensNote}</Text>
          {period !== 'ft' ? (
            <Text style={styles.note}>
              {htCovered} of {matches.length} finished games have a half-time score
              {htCovered === 0 ? ' — half tables stay empty until that data lands' : ''}.
            </Text>
          ) : null}
          <Callout text={pair.call} tone={pair.split ? 'warn' : 'info'} />
        </View>
      ) : null}
      {sub === 'table' && fixtureRows.length > 0 ? (
        <Text style={styles.note}>
          Fixture sides highlighted
          {fixtureRows
            .map(
              (r) =>
                ` · ${teamLabels?.[r.teamId] ?? r.name} (table #${r.rank} · form #${r.formRank})`,
            )
            .join('')}
        </Text>
      ) : null}
      {matches.length === 0 ? (
        <Text style={styles.note}>No finished season fixtures loaded yet.</Text>
      ) : rows.length === 0 ? (
        <Text style={styles.note}>No sides to show on this form table.</Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View style={styles.formTable}>
            <View style={[styles.formRow, styles.formHead]}>
              <Text style={[styles.formTh, styles.formPos]}>#</Text>
              <Text style={[styles.formTh, styles.formTeam]}>Team</Text>
              <Text style={[styles.formTh, styles.formSeq]}>Last 6</Text>
              <Text style={[styles.formTh, styles.formNum]}>MP</Text>
              <Text style={[styles.formTh, styles.formWdl]}>W-D-L</Text>
              <Text style={[styles.formTh, styles.formNum]}>Pts</Text>
              <Text style={[styles.formTh, styles.formNum]}>PPG</Text>
              <Text style={[styles.formTh, styles.formNum]}>GD</Text>
              <Text style={[styles.formTh, styles.formType]}>Type</Text>
              <Text style={[styles.formTh, styles.formNum]}>Gap</Text>
              <Text style={[styles.formTh, styles.formRead]}>Read</Text>
              <Text style={[styles.formTh, styles.formTrend]}>Trend</Text>
            </View>
            {rows.map((r) => {
              const typed = typeById.get(r.teamId);
              const venueRole =
                sub !== 'fixture'
                  ? null
                  : lens === 'home' || r.teamId === fixtureHomeId
                    ? 'Home'
                    : lens === 'away' || r.teamId === fixtureAwayId
                      ? 'Away'
                      : null;
              return (
                <FormDataRow
                  key={r.teamId}
                  row={r}
                  highlight={highlightSet.has(r.teamId)}
                  extraLabel={teamLabels?.[r.teamId]}
                  typeLetter={typed?.letter}
                  gapScore={typed?.score}
                  venueRole={lens === 'home_away' ? venueRole : null}
                />
              );
            })}
          </View>
        </ScrollView>
      )}
      <BaselineCards
        pd={formPd}
        title="Baseline — original state"
        note="Same A–F types and 0–10 gap scale as Baseline, calculated from last-6 form places (points, then GD, then goals scored)."
      />
      <GapAnalysisCards
        pd={formPd}
        title="Gap analysis"
        note="G-grades from the last-6 form table. G1 is the largest form gap; neighbours sit on the last grade."
      />
    </View>
  );
}

export function ColourCards({ pd }: { pd: PowerDynamicsBundle }) {
  const one = (label: string, read: ColourSideRead, snap: SideSnapshot) => (
    <SideCard label={label} meta={`${colourWord(read.colour)} band`}>
      <Line
        text={`PPG ${fmtPpg(read.ppg)}${read.band ? ` · ${PPG_BAND_LABEL[read.band]}` : ''}`}
        tone={read.aligns === false ? 'bad' : read.aligns ? 'good' : 'info'}
      />
      <Line
        text={
          read.aligns == null
            ? 'Need PPG + table colour'
            : read.aligns
              ? 'Aligns with the colour plan'
              : 'Does not align with the colour plan'
        }
        tone={read.aligns === false ? 'warn' : 'info'}
      />
      {read.mshayi ? <Line text={read.mshayi} tone="warn" /> : null}
      <Line text={wdl(snap.overall)} />
      <Line text={read.lossesVsPositive} />
      {read.types.map((t) => (
        <Line key={t.key} text={`${t.label}: ${fmtPpg(t.ppg)}`} />
      ))}
    </SideCard>
  );
  return (
    <View>
      <SectorIntro
        title="Colour verification"
        note="Does PPG match Green / Yellow / Red? Six PPG types: overall, home, away, against, vs top third, vs bottom third."
      />
      <Callout text={pd.colour.whoFacesWho} />
      {one(pd.t1.label, pd.colour.t1, pd.t1)}
      {one(pd.t2.label, pd.colour.t2, pd.t2)}
    </View>
  );
}

function splitTone(label: VenueSplitLabel | null): Tone | undefined {
  if (label === 'Strong') return 'good';
  if (label === 'Weak') return 'bad';
  if (label === 'Balanced') return 'info';
  return undefined;
}

function leagueTone(read: VenueLeagueRead | null): Tone | undefined {
  if (read === 'Above average') return 'good';
  if (read === 'Below average') return 'bad';
  if (read === 'Level') return 'info';
  return undefined;
}

export function VenueCards({ pd }: { pd: PowerDynamicsBundle }) {
  const leaguePpg = pd.baselineGap.leagueAvgPpg;
  const sides = [pd.t1.venue === 'home' ? pd.t1 : pd.t2, pd.t1.venue === 'away' ? pd.t1 : pd.t2];
  return (
    <View>
      <SectorIntro
        title="Home / Away strong"
        note="Home PPG minus away PPG. 4 or less is Balanced. 4.1 or more is Strong at home and Weak away. A negative diff on the away side means they are Strong. Venue PPG is then set against the league average."
      />
      <ScrollView horizontal showsHorizontalScrollIndicator style={styles.initialScroll}>
        <View style={[styles.formTable, styles.venueTable]}>
          <View style={[styles.formRow, styles.formHead]}>
            <Text style={[styles.formTh, styles.formTeam]}>Team</Text>
            <Text style={[styles.formTh, styles.formWdl]}>Playing</Text>
            <Text style={[styles.formTh, styles.venueNum]}>Home PPG</Text>
            <Text style={[styles.formTh, styles.venueNum]}>Away PPG</Text>
            <Text style={[styles.formTh, styles.venueNum]}>Diff</Text>
            <Text style={[styles.formTh, styles.formRead]}>Label</Text>
            <Text style={[styles.formTh, styles.venueNum]}>League</Text>
            <Text style={[styles.formTh, styles.venueNum]}>Venue PPG</Text>
            <Text style={[styles.formTh, styles.formRead]}>vs league</Text>
          </View>
          {sides.map((snap) => {
            const row = venuePpgSplit({
              homePpg: snap.home.ppg,
              awayPpg: snap.away.ppg,
              playing: snap.venue,
              leaguePpg,
            });
            return (
              <View key={snap.side} style={[styles.formRow, styles.formRowFocus]}>
                <View style={styles.formTeam}>
                  <Text style={styles.formTeamName} numberOfLines={1}>
                    {snap.label}
                  </Text>
                </View>
                <FormCell style={styles.formWdl}>{snap.venue === 'home' ? 'Home' : 'Away'}</FormCell>
                <FormCell style={styles.venueNum}>{fmtPpg(snap.home.ppg)}</FormCell>
                <FormCell style={styles.venueNum}>{fmtPpg(snap.away.ppg)}</FormCell>
                <FormCell style={styles.venueNum}>{row.diff != null ? fmtPpg(row.diff) : '—'}</FormCell>
                <FormCell style={styles.formRead} tone={splitTone(row.split)}>
                  {row.split ?? '—'}
                </FormCell>
                <FormCell style={styles.venueNum}>{fmtPpg(leaguePpg)}</FormCell>
                <FormCell style={styles.venueNum}>{fmtPpg(row.venuePpg)}</FormCell>
                <FormCell style={styles.formRead} tone={leagueTone(row.vsLeague)}>
                  {row.vsLeague ?? '—'}
                </FormCell>
              </View>
            );
          })}
        </View>
      </ScrollView>
      <BaselineCards pd={pd} hideHeading />
    </View>
  );
}

export function CharacterCards({ pd }: { pd: PowerDynamicsBundle }) {
  return (
    <View>
      <SectorIntro
        title="Character — original + home vs away"
        note="Crossed on the sheet but kept in the checklist. Split = home/away PPG gap ≥ 0.5."
      />
      <SideCard label={pd.t1.label}>
        <Line text={pd.character.t1.original} />
        <Line text={pd.character.t1.other} tone={pd.character.t1.split ? 'warn' : 'info'} />
      </SideCard>
      <SideCard label={pd.t2.label}>
        <Line text={pd.character.t2.original} />
        <Line text={pd.character.t2.other} tone={pd.character.t2.split ? 'warn' : 'info'} />
      </SideCard>
    </View>
  );
}

export function MiddleGuysCards({ pd }: { pd: PowerDynamicsBundle }) {
  const one = (label: string, show: ShowRead) => (
    <SideCard label={label} meta={show.yellow ? 'Yellow band — usage focus' : 'Not mid-table'}>
      <Line text={`vs above: ${show.vsAboveMp} MP · ${fmtPct(show.vsAbovePct)}`} />
      <Line text={`vs below: ${show.vsBelowMp} MP · ${fmtPct(show.vsBelowPct)}`} />
      <Line text={`Strong show: ${show.strongShow}`} tone="good" />
      <Line text={`Weak show: ${show.weakShow}`} tone="bad" />
    </SideCard>
  );
  return (
    <View>
      <SectorIntro
        title="Middle guys — strong show / weak show"
        note="Yellow-band focus. Strong show = taking points from sides above or dominating sides below. Use Bhozoma for the full table."
      />
      {one(pd.t1.label, pd.middle.t1)}
      {one(pd.t2.label, pd.middle.t2)}
    </View>
  );
}

export function IndlelaCards({ pd }: { pd: PowerDynamicsBundle }) {
  return (
    <View>
      <SectorIntro
        title="Indlela — path / method"
        note="Win/loss paths and never-twice patterns. Yellow-band fixtures get extra weight. T2 as the negative counterpart of T1."
      />
      {pd.indlela.yellow ? <Callout text="Yellow-band application — path matters more" tone="warn" /> : null}
      <Callout text={pd.indlela.counterpart} />
      <SideCard label={pd.t1.label}>
        {pd.indlela.t1.map((p) => (
          <Line key={p} text={`· ${p}`} />
        ))}
      </SideCard>
      <SideCard label={pd.t2.label}>
        {pd.indlela.t2.map((p) => (
          <Line key={p} text={`· ${p}`} />
        ))}
      </SideCard>
    </View>
  );
}

export function StreakCards({
  title,
  note,
  t1,
  t2,
  kind,
}: {
  title: string;
  note: string;
  t1: { label: string; streak: StreakSide };
  t2: { label: string; streak: StreakSide };
  kind: 'win' | 'loss';
}) {
  const threshold = title.includes('6') ? 6 : 2;
  const one = (label: string, s: StreakSide) => {
    const hit = s.current >= threshold;
    return (
      <SideCard label={label}>
        <Line
          text={`Current ${kind} streak: ${s.current}${hit ? ' — active' : ''}`}
          tone={hit ? 'warn' : 'info'}
        />
        <Line text={`Recent: ${s.sequence || '—'}`} />
        <Line
          text={
            s.neverTwice
              ? `Never ${kind === 'win' ? 'won' : 'lost'} twice in a row (last 10)`
              : `Has ${kind === 'win' ? 'won' : 'lost'} twice in a row in last 10`
          }
        />
        {s.last10 ? <Line text={`Last 10: ${s.last10}`} /> : null}
      </SideCard>
    );
  };
  return (
    <View>
      <SectorIntro title={title} note={note} />
      {one(t1.label, t1.streak)}
      {one(t2.label, t2.streak)}
    </View>
  );
}

export function SwingCards({
  title,
  want,
  pd,
}: {
  title: string;
  want: 'drop' | 'rise';
  pd: PowerDynamicsBundle;
}) {
  const one = (label: string, swings: SwingScope[]) => (
    <SideCard label={label}>
      {swings.map((s) => {
        const hit = want === 'drop' ? s.drop : s.rise;
        return (
          <Line
            key={s.scope}
            text={`${s.detail}${hit ? ' — flagged' : ''}`}
            tone={hit ? (want === 'drop' ? 'bad' : 'good') : 'info'}
          />
        );
      })}
    </SideCard>
  );
  return (
    <View>
      <SectorIntro
        title={title}
        note="Last 3 vs previous 3, overall / home / away. Flag when the swing is ≥ 5 points."
      />
      {one(pd.t1.label, pd.swing.t1)}
      {one(pd.t2.label, pd.swing.t2)}
    </View>
  );
}

export function ChildBeaterCards({
  title,
  note,
  pd,
  method,
}: {
  title: string;
  note: string;
  pd: PowerDynamicsBundle;
  method: 1 | 2 | 'both';
}) {
  const one = (label: string, yellow: boolean, cb: ChildBeaterSide) => (
    <SideCard label={label} meta={yellow ? 'Yellow-band application' : undefined}>
      {method !== 2 ? (
        <Line text={cb.method1 ? `Method 1: ${cb.method1}` : 'Method 1: no recent thrashing of a lower side'} />
      ) : null}
      {method !== 1 ? (
        <Line
          text={cb.method2 ? `Method 2: ${cb.method2}` : 'Method 2: not regularly thrashing bottom-third sides'}
          tone={cb.method2 ? 'warn' : 'info'}
        />
      ) : null}
    </SideCard>
  );
  return (
    <View>
      <SectorIntro title={title} note={note} />
      {one(pd.t1.label, pd.t1.zone === 'mid', pd.childBeater.t1)}
      {one(pd.t2.label, pd.t2.zone === 'mid', pd.childBeater.t2)}
    </View>
  );
}

export function PointsDiffCards({ pd }: { pd: PowerDynamicsBundle }) {
  const yellow = pd.t1.zone === 'mid' || pd.t2.zone === 'mid';
  return (
    <View>
      <SectorIntro
        title="Points difference"
        note="ΔP ≤ 4 is close (form matters). ≥ 4.1 is a clear table gap. Yellow-band fixtures should answer this first."
      />
      <Callout
        text={
          pd.pointsDiff == null
            ? 'Need both sides on the table'
            : `${pd.t1.label} ${pd.t1.points} pts (#${pd.t1.rank ?? '?'}) vs ${pd.t2.label} ${pd.t2.points} pts (#${pd.t2.rank ?? '?'}) · ΔP ${pd.pointsDiff}`
        }
        tone={pd.closeOnTable ? 'warn' : 'info'}
      />
      {yellow ? <Callout text="Yellow-band application — answer ΔP before other separators" tone="warn" /> : null}
      <Line
        text={
          pd.closeOnTable
            ? 'Close — hidden layers and last-5 should separate them'
            : 'Far apart — check risk on the favourite (problem causer)'
        }
      />
    </View>
  );
}

export function ContestedCards({ pd }: { pd: PowerDynamicsBundle }) {
  return (
    <View>
      <SectorIntro
        title="Highly contested leagues"
        note="Positions 1–5 within 3 points = dangerous to play. Check whether T1 or T2 sit in that pack."
      />
      <Callout
        text={pd.contested.flag.detail}
        tone={pd.contested.flag.active ? 'warn' : 'info'}
      />
      <Line
        text={`${pd.t1.label} ${pd.contested.t1InPack ? 'is in the top 5 pack' : 'is outside the top 5 pack'}`}
      />
      <Line
        text={`${pd.t2.label} ${pd.contested.t2InPack ? 'is in the top 5 pack' : 'is outside the top 5 pack'}`}
      />
    </View>
  );
}

export function StruggleCards({ pd }: { pd: PowerDynamicsBundle }) {
  return (
    <View>
      <SectorIntro
        title="Struggle for 2 or 3 games"
        note="2–3 recent losses / winless, plus whether a table position is still worth fighting for."
      />
      <SideCard label={pd.t1.label}>
        <Line text={pd.struggle.t1} tone={pd.struggle.t1Fight ? 'warn' : 'info'} />
      </SideCard>
      <SideCard label={pd.t2.label}>
        <Line text={pd.struggle.t2} tone={pd.struggle.t2Fight ? 'warn' : 'info'} />
      </SideCard>
    </View>
  );
}

export function CompetitionCards({ pd }: { pd: PowerDynamicsBundle }) {
  const p = pd.competition.progress;
  const mot = (label: string, m: PowerDynamicsBundle['competition']['t1']) => (
    <SideCard label={label}>
      {m ? (
        <>
          <Line text={`#${m.rank} · ${m.points} pts · ${STANCE_LABEL[m.stance]} · ${GRADE_LABEL[m.grade]}`} />
          <Line text={m.stanceReason} />
          {m.futileChase ? <Line text="Futile chase — remaining matches cannot close it" tone="bad" /> : null}
          {m.dethroned ? <Line text="Dethroned but still linked to the band" tone="warn" /> : null}
        </>
      ) : (
        <Line text="Need this side on the table" />
      )}
    </SideCard>
  );
  return (
    <View>
      <SectorIntro
        title="Competition status"
        note="League progress, remaining matches, late stretch, and chase / escape for T1 and T2."
      />
      <Callout
        text={`Season ${p.seasonProgress != null ? `${p.seasonProgress}%` : 'n/a'} · most games played ${p.maxPlayed}${
          p.avgRemaining != null ? ` · about ${p.avgRemaining} left` : ''
        }${p.lateStretch ? ' · late stretch' : ''}`}
        tone={p.lateStretch ? 'warn' : 'info'}
      />
      <Line text={p.note} />
      {mot(pd.t1.label, pd.competition.t1)}
      {mot(pd.t2.label, pd.competition.t2)}
    </View>
  );
}

const styles = StyleSheet.create({
  intro: { marginBottom: spacing.sm },
  sectorTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: theme.textPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  sectorTitleAsWritten: {
    textTransform: 'none',
    letterSpacing: 0,
  },
  note: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: theme.textMuted,
    lineHeight: 16,
    marginBottom: spacing.xs,
  },
  card: {
    backgroundColor: theme.surface,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  sideLabel: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.textPrimary },
  meta: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted, marginTop: 2, marginBottom: 4 },
  line: { fontFamily: fonts.body, fontSize: 12, color: theme.textPrimary, lineHeight: 17, marginTop: 2 },
  seq: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: theme.textPrimary, marginTop: 4 },
  subHead: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    color: theme.textMuted,
    marginTop: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  initialScroll: { marginBottom: spacing.sm },
  initialTable: { minWidth: 28 + 150 + 360 + 36 + 52 + 36 + 36 + 36 },
  last5LeagueTable: { minWidth: 28 + 150 + 360 + 36 + 52 + 36 + 36 + 36 + 36 + 36 + 110 },
  venueTable: { minWidth: 150 + 52 + 64 * 5 + 110 * 2 },
  venueNum: { width: 64, textAlign: 'center' },
  initialSeqHead: { width: 360 },
  initialSeq: {
    width: 360,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingVertical: 4,
  },
  initialSeqTag: { fontFamily: fonts.bodySemiBold, fontSize: 12 },
  callout: {
    borderWidth: layout.borderWidth,
    borderRadius: layout.borderRadius,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    backgroundColor: theme.surface,
  },
  calloutText: { fontFamily: fonts.bodySemiBold, fontSize: 12, lineHeight: 17 },
  gapRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  gapScoreBox: {
    width: 64,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    borderRadius: layout.borderRadius,
    backgroundColor: theme.surfaceMuted,
  },
  gapScore: { fontFamily: fonts.bodySemiBold, fontSize: 22, color: theme.textPrimary, lineHeight: 26 },
  gapScoreCap: { fontFamily: fonts.body, fontSize: 9, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
  meterTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.surfaceMuted,
    marginTop: spacing.xs,
    overflow: 'hidden',
  },
  meterFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.accentBlue,
  },
  gapGradeRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  gapGradeBox: {
    width: 72,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    borderRadius: layout.borderRadius,
    backgroundColor: theme.surfaceMuted,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
  },
  gapGradeBoxPress: {
    borderColor: theme.accentBlue,
  },
  gapGrade: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 22,
    color: theme.textPrimary,
    lineHeight: 26,
  },
  posGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: spacing.sm,
  },
  posSlot: { padding: 2 },
  posCell: {
    minHeight: 36,
    borderRadius: 4,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  posCellSpan: {
    backgroundColor: '#DBEAFE',
    borderColor: theme.accentBlue,
  },
  posCellT1: {
    backgroundColor: theme.accentBlue,
    borderColor: theme.accentBlue,
  },
  posCellT2: {
    backgroundColor: theme.accentOrange,
    borderColor: theme.accentOrange,
  },
  posNum: { fontFamily: fonts.bodySemiBold, fontSize: 11, color: theme.textMuted, lineHeight: 14 },
  posNumOn: { color: '#FFFFFF' },
  posTag: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 8,
    color: '#FFFFFF',
    letterSpacing: 0.3,
    lineHeight: 10,
  },
  streamBucket: {
    borderWidth: layout.borderWidth,
    borderRadius: layout.borderRadius,
    padding: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: theme.surface,
  },
  streamName: { fontFamily: fonts.bodySemiBold, fontSize: 15, marginBottom: 2 },
  streamRole: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted, marginBottom: spacing.sm },
  streamTeam: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.textPrimary, marginBottom: 2 },
  streamEmpty: { fontFamily: fonts.body, fontSize: 12, color: theme.textFaint },
  modalRoot: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalSheet: {
    maxHeight: '80%',
    backgroundColor: theme.surface,
    borderRadius: layout.borderRadius,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    padding: spacing.md,
  },
  modalHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  modalTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 16,
    color: theme.textPrimary,
  },
  modalSub: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textMuted,
    marginTop: 2,
  },
  modalClose: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: theme.accentBlue,
    paddingVertical: 2,
  },
  modalLead: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textMuted,
    lineHeight: 17,
    marginBottom: spacing.sm,
  },
  modalRowHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.xs,
  },
  modalHeadCol: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    color: theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  modalList: { maxHeight: 420 },
  modalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: layout.borderRadius,
  },
  modalRowCurrent: {
    backgroundColor: '#DBEAFE',
  },
  modalGrade: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: theme.textPrimary,
  },
  modalGap: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: theme.textPrimary,
  },
  modalGradeCurrent: {
    color: theme.accentBlue,
  },
  formTable: {
    backgroundColor: theme.surface,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    overflow: 'hidden',
    minWidth: 28 + 150 + 88 + 32 + 52 + 36 + 44 + 36 + 36 + 36 + 110 + 52,
  },
  formRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 40,
    borderBottomWidth: layout.borderWidth,
    borderBottomColor: theme.border,
    paddingHorizontal: spacing.xs,
  },
  formHead: { backgroundColor: theme.surfaceMuted, minHeight: 32 },
  formRowFocus: { backgroundColor: 'rgba(37, 99, 235, 0.08)' },
  formRowMid: { backgroundColor: 'rgba(217, 119, 6, 0.05)' },
  formTh: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    color: theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  formTd: { fontFamily: fonts.body, fontSize: 12, color: theme.textPrimary },
  formPos: { width: 28, textAlign: 'center', fontFamily: fonts.bodySemiBold },
  formTeam: { width: 150, paddingRight: spacing.xs },
  formTeamName: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: theme.textPrimary },
  formVenue: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 1,
  },
  formVenueHome: { color: theme.accentBlue },
  formVenueAway: { color: theme.accentOrange },
  formScores: { fontFamily: fonts.body, fontSize: 9, color: theme.textFaint, marginTop: 1 },
  formSeq: { width: 88, fontFamily: fonts.bodySemiBold },
  formNum: { width: 36, textAlign: 'center' },
  formWdl: { width: 52, textAlign: 'center' },
  formType: { width: 36, textAlign: 'center', fontFamily: fonts.bodySemiBold },
  formRead: { width: 110, paddingHorizontal: 4, fontFamily: fonts.bodySemiBold, fontSize: 11 },
  formTrend: { width: 52, textAlign: 'center', fontFamily: fonts.bodySemiBold },
});
