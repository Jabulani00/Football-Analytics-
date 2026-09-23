/**
 * Presentational T1 vs T2 blocks used by Power dynamics tabs.
 */

import { type ReactNode, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  PPG_BAND_LABEL,
  STREAM_LABEL,
  STREAM_ROLE,
  ZIDANE_PPG_ODDS_RULE,
  positionGapScale,
  colourWord,
  fmtGapScore,
  fmtPct,
  fmtPpg,
  wdl,
  type BaselineGap,
  type ChildBeaterSide,
  type ColourSideRead,
  type LastGameFlag,
  type PowerDynamicsBundle,
  type ShowRead,
  type SideSnapshot,
  type StreamName,
  type StreakSide,
  type SwingScope,
  type Tone,
  type VenueRead,
} from '@/utils/powerDynamicsEngine';
import { CHANGE_LABEL, OPTION_LABEL, type TeamLast5 } from '@/utils/last5Analysis';
import { GRADE_LABEL, STANCE_LABEL } from '@/utils/motivationEngine';
import { fonts, layout, spacing, theme } from '@/styles/theme';

function toneColor(t: Tone): string {
  if (t === 'good') return theme.accentGreen;
  if (t === 'warn') return theme.yellow;
  if (t === 'bad') return theme.loss;
  return theme.textMuted;
}

export function SectorIntro({ title, note }: { title: string; note?: string }) {
  return (
    <View style={styles.intro}>
      <Text style={styles.sectorTitle}>{title}</Text>
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

export function BaselineCards({ pd }: { pd: PowerDynamicsBundle }) {
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
      <SectorIntro
        title="Baseline — original state"
        note="Natural table state before separators. T1 is the better table side (points, then GD, then goals scored); T2 is who they face. A–F types come from the G-grade: k/(N−1), then 100 minus that percentage, on the 0–10 gap scale."
      />
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

export function GapAnalysisCards({ pd }: { pd: PowerDynamicsBundle }) {
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
      <SectorIntro title="Gap analysis" />
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
}: {
  pd: PowerDynamicsBundle;
  focus?: StreamName;
}) {
  const s = pd.streamline;
  const belong = (sideLabel: string, points: number | null, stream: StreamName) => {
    const inIt = s.inStreams[stream];
    return (
      <SideCard
        key={`${stream}-${sideLabel}`}
        label={sideLabel}
        meta={`${points ?? '—'} pts`}>
        <Line
          text={inIt ? `Belongs here — ${STREAM_LABEL[stream]}` : `Does not belong in ${STREAM_LABEL[stream]}`}
          tone={inIt ? streamTone(stream) : 'info'}
        />
        <Line
          text={s.t1Stream ? `Primary stream: ${STREAM_LABEL[s.t1Stream]}` : 'Not assigned yet'}
        />
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

  const inFocus = focus != null && s.inStreams[focus];
  const introNote =
    focus == null
      ? 'Order: Bateteme stream, Compliant stream, Zidane Law, Bookie mistake, Bookie mistake 2.'
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
    focus === 'compliant' ||
    focus === 'zidane_law' ||
    focus === 'bookie' ||
    focus === 'bookie2';
  const showCall = focus == null || s.t1Stream === focus;

  return (
    <View>
      <SectorIntro title={focus ? STREAM_LABEL[focus] : 'Streamline'} note={introNote} />
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
          {inFocus ? bucket(focus, inStream(focus)) : null}
          {belong(pd.t1.label, s.t1Points, focus)}
          {belong(pd.t2.label, s.t2Points, focus)}
        </>
      ) : s.t1Stream ? (
        bucket(s.t1Stream, inStream(s.t1Stream))
      ) : null}
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

export function VenueCards({ pd }: { pd: PowerDynamicsBundle }) {
  const one = (snap: SideSnapshot, v: VenueRead) => {
    const atHome = snap.venue === 'home';
    return (
      <SideCard label={snap.label} meta={atHome ? 'Playing at home' : 'Playing away'}>
        <Line text={`Overall PPG ${fmtPpg(v.overallPpg)} · home ${fmtPpg(v.homePpg)} · away ${fmtPpg(v.awayPpg)}`} />
        <Line
          text={atHome ? (v.homeStrong ? 'Strong at home' : 'No home lift vs overall') : v.awayStrong ? 'Strong away' : 'No away lift vs overall'}
          tone={atHome ? (v.homeStrong ? 'good' : 'info') : v.awayStrong ? 'good' : 'info'}
        />
        <Line text={v.detail} />
      </SideCard>
    );
  };
  return (
    <View>
      <SectorIntro
        title="Home / Away strong → underdog strength"
        note="T1 is the better table side (points, then GD, then goals scored); T2 is the underdog. A venue lift of 0.3+ PPG vs overall counts as strength."
      />
      <Callout text={pd.venue.call} tone="warn" />
      {one(pd.t1, pd.venue.t1)}
      {one(pd.t2, pd.venue.t2)}
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
});
