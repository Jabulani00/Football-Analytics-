import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { SectorIntro, SideCard } from '@/components/match-detail/PowerDynamicsSectors';
import SubTabBar from '@/components/shared/SubTabBar';
import {
  type ProblemCauserRead,
  type ProblemCauserSide,
  type ProblemMark,
} from '@/utils/problemCauser';
import { fonts, spacing, theme } from '@/styles/theme';

type SideId = 't1' | 't2';

function Bit({ value }: { value: 0 | 1 }) {
  const hit = value === 1;
  return (
    <View style={[styles.bit, { backgroundColor: hit ? '#16A34A' : '#DC2626' }]}>
      <Text style={styles.bitText}>{value}</Text>
    </View>
  );
}

function MarkRow({ label, marks, showBtts }: { label: string; marks: ProblemMark[]; showBtts?: boolean }) {
  if (marks.length === 0) {
    return <Text style={styles.empty}>{label}: no head-to-head meetings yet</Text>;
  }
  return (
    <View style={styles.markBlock}>
      <Text style={styles.side}>{label}</Text>
      <View style={styles.markRow}>
        {marks.map((m, i) => (
          <View key={`${label}-${i}`} style={styles.markCol}>
            <Bit value={m.bit} />
            <Text style={styles.markScore}>{m.score}</Text>
            {showBtts ? <Text style={styles.markOpp}>{m.btts ? 'BTTS' : 'No BTTS'}</Text> : null}
            <Text style={styles.markOpp} numberOfLines={2}>
              {m.opponent}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function LevelCard({ label, side }: { label: string; side: ProblemCauserSide }) {
  return (
    <SideCard label={label}>
      <Text style={styles.total}>
        {side.ones} − {side.played} = {side.total}
      </Text>
      <Text style={styles.level}>
        {side.level.name} · {side.level.score}
      </Text>
      <Text style={styles.note}>
        1s include the shared win-ratio mark. Meetings used: {side.played} (last 5 between these sides, or fewer).
      </Text>
    </SideCard>
  );
}

export default function ProblemCauserView({
  t1Label,
  t2Label,
  read,
}: {
  t1Label: string;
  t2Label: string;
  read: ProblemCauserRead;
}) {
  const [side, setSide] = useState<SideId>('t1');
  const win = read.winRatio;
  const selected = side === 't1' ? read.t1 : read.t2;
  const label = side === 't1' ? t1Label : t2Label;
  const otherLabel = side === 't1' ? t2Label : t1Label;
  const wins = side === 't1' ? win.t1Wins : win.t2Wins;
  const played = side === 't1' ? win.t1Played : win.t2Played;
  const otherWins = side === 't1' ? win.t2Wins : win.t1Wins;
  const otherPlayed = side === 't1' ? win.t2Played : win.t1Played;

  return (
    <View>
      <SectorIntro
        title="Problem causer"
        note="Head-to-head only, when these two sides play each other. Pick T1 or T2. Each mark is 1 in green or 0 in red. The level uses every 1 minus the meetings in the sample."
      />
      <SubTabBar
        tabs={[
          { id: 't1', label: t1Label },
          { id: 't2', label: t2Label },
        ]}
        active={side}
        onChange={setSide}
      />

      <SideCard label="1. Win ratio">
        <Text style={styles.note}>
          Wins in their last 5 meetings. A gap of 0 or 1 is 1. A wider gap is 0. This mark is shared by both sides.
        </Text>
        <Text style={styles.line}>
          {label} {wins}/{played} · {otherLabel} {otherWins}/{otherPlayed} · difference {win.difference}
        </Text>
        <Bit value={win.bit} />
      </SideCard>

      <SideCard label="2. BTTS and goal difference">
        <Text style={styles.note}>1 when the goal difference is 2 or less. 0 when it is more than 2.</Text>
        <MarkRow label={label} marks={selected.goalDiff} showBtts />
      </SideCard>

      <SideCard label="3. Draws">
        <Text style={styles.note}>1 when that game was a draw. 0 when it was not.</Text>
        <MarkRow label={label} marks={selected.draws} />
      </SideCard>

      <SideCard label="4. One goal difference win">
        <Text style={styles.note}>1 when they won by exactly one goal. 0 otherwise.</Text>
        <MarkRow label={label} marks={selected.oneGoalWins} />
      </SideCard>

      <SectorIntro
        title="Level"
        note="Entry is 2 or less (3). Moderate is 2.1 to 5 (5). Major is 5.1 to 7 (7). Extreme is 7.1 to 20 (10)."
      />
      <LevelCard label={label} side={selected} />
    </View>
  );
}

const styles = StyleSheet.create({
  note: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: theme.textMuted,
    lineHeight: 16,
    marginBottom: spacing.xs,
  },
  line: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textPrimary,
    lineHeight: 17,
    marginBottom: spacing.xs,
  },
  bit: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bitText: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: '#FFFFFF' },
  markBlock: { marginTop: spacing.sm },
  side: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: theme.textPrimary, marginBottom: spacing.xs },
  markRow: { flexDirection: 'row', gap: spacing.xs },
  markCol: { flex: 1, alignItems: 'center', maxWidth: 72 },
  markScore: { fontFamily: fonts.bodySemiBold, fontSize: 11, color: theme.textPrimary, marginTop: 4 },
  markOpp: { fontFamily: fonts.body, fontSize: 10, color: theme.textMuted, textAlign: 'center', marginTop: 2 },
  empty: { fontFamily: fonts.body, fontSize: 12, color: theme.textMuted, marginTop: spacing.xs },
  total: { fontFamily: fonts.bodySemiBold, fontSize: 16, color: theme.textPrimary, marginTop: 2 },
  level: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: theme.textPrimary, marginTop: 2 },
});
