import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import DragScroll from '@/components/shared/DragScroll';
import { fonts, layout, spacing, theme } from '@/styles/theme';

/**
 * Query Skeleton — the backbone a strategy query is assembled from, transcribed
 * from the strategy notes. It is a scaffold, not a live computation: it lays out
 * the dimensions, the stat-direction logic and the grading/ranking methods that
 * the data panels (Grading, Dominance, Opposite, DA Unity) plug into, plus the
 * open items still to wire in. Nothing here is fabricated beyond the notes.
 */

type Period = 'ft' | '1h' | '2h';
const PERIODS: { id: Period; label: string; long: string }[] = [
  { id: 'ft', label: 'FT', long: 'Fulltime' },
  { id: '1h', label: '1H', long: '1st half' },
  { id: '2h', label: '2H', long: '2nd half' },
];

const SCOPES = ['Overall', 'Home', 'Away'] as const;

type DirectionKind = 'goals' | 'none' | 'conditional';
const DIRECTION_ROWS: { pattern: string; reading: string; kind: DirectionKind }[] = [
  { pattern: 'SC ↑  vs  Conc ↑', reading: 'Goals direction', kind: 'goals' },
  { pattern: 'Conc ↑  vs  Conc ↑', reading: 'No direction', kind: 'none' },
  { pattern: 'SC  vs  SC', reading: 'Depends on opponent character', kind: 'conditional' },
];

const OPPONENT_FACTORS: { head: string; body: string }[] = [
  { head: 'Stronger opponent', body: 'Facing a stronger opponent subdues the team.' },
  { head: 'Clean-sheet opponent', body: 'Facing a clean-sheet team limits the goals they concede.' },
  { head: 'Medium scorer, but strong', body: 'Influences the decision of fewer goals in a match.' },
  { head: 'Character with the power', body: 'Influences the outcomes of the match.' },
];

const GRADING_TIERS = ['Top tier', 'Middle tier', 'Bottom tier'] as const;
const GRADING_METHODS: string[] = [
  'Amongst the league',
  'Amongst other leagues',
  'Ranked by difference, by the unit of that league',
  'DA ranking by difference',
  '3rd method — usually ~30% or less',
  'End points in mind',
];

const OPEN_ITEMS: { text: string; warn?: boolean }[] = [
  { text: 'Count the cup competitions' },
  { text: 'Difference between Footystats & our machine stats list (similar)' },
  { text: 'Odds page missing on the Skeleton', warn: true },
];

function dirColor(kind: DirectionKind): string {
  if (kind === 'goals') return theme.accentGreen;
  if (kind === 'conditional') return theme.yellow;
  return theme.textMuted;
}

export default function QuerySkeletonPanel() {
  const narrow = useWindowDimensions().width < 720;
  const [period, setPeriod] = useState<Period>('ft');
  const periodLong = PERIODS.find((p) => p.id === period)?.long ?? '';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Query Skeleton</Text>
        <Text style={styles.subtitle}>
          The backbone a strategy is concocted from — the dimensions, the stat-direction logic and the
          grading methods the data panels plug into. A scaffold of the strategy notes, read at Fulltime,
          1st half and 2nd half.
        </Text>
      </View>

      {/* Period toggle */}
      <View style={styles.toolbar}>
        <Text style={styles.toolbarLabel}>Read at</Text>
        <View style={styles.segment}>
          {PERIODS.map((p) => {
            const on = p.id === period;
            return (
              <Pressable
                key={p.id}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => setPeriod(p.id)}
                style={[styles.segBtn, on && styles.segBtnOn]}>
                <Text style={[styles.segText, on && styles.segTextOn]}>{p.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.toolbarHint}>{periodLong}</Text>
      </View>

      {/* Stat-direction logic — the engine's reading */}
      <Section title="Stat-direction logic" caption={`How two stats read against each other · ${periodLong}`}>
        <DragScroll horizontal style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          <View style={styles.table}>
            <View style={[styles.row, styles.headRow]}>
              <Text style={[styles.cPattern, styles.headText]}>Pattern</Text>
              <Text style={[styles.cReading, styles.headText]}>Reading ({periodLong})</Text>
            </View>
            {DIRECTION_ROWS.map((r, i) => {
              const color = dirColor(r.kind);
              return (
                <View key={r.pattern} style={[styles.row, i % 2 === 1 && styles.rowAlt]}>
                  <Text style={[styles.cPattern, styles.pattern]}>{r.pattern}</Text>
                  <View style={styles.cReading}>
                    <View style={[styles.pill, { borderColor: color }]}>
                      <Text style={[styles.pillText, { color }]}>{r.reading}</Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        </DragScroll>
      </Section>

      {/* Stats ready for calling: scope × period grid */}
      <Section title="Stats ready for calling" caption="Every stat is held Overall / Home / Away, at each period. DA is the difference list of every stat.">
        <DragScroll horizontal style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          <View style={styles.table}>
            <View style={[styles.row, styles.headRow]}>
              <Text style={[styles.cScope, styles.headText]}>Scope</Text>
              {PERIODS.map((p) => (
                <Text key={p.id} style={[styles.cCell, styles.headText, styles.center, p.id === period && styles.headOn]}>{p.label}</Text>
              ))}
            </View>
            {SCOPES.map((scope, i) => (
              <View key={scope} style={[styles.row, i % 2 === 1 && styles.rowAlt]}>
                <Text style={[styles.cScope, styles.scope]}>{scope}</Text>
                {PERIODS.map((p) => (
                  <View key={p.id} style={[styles.cCell, p.id === period && styles.cellOn]}>
                    <Text style={[styles.ready, p.id === period && styles.readyOn]}>●</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        </DragScroll>
      </Section>

      <View style={[styles.cols, narrow && styles.colsNarrow]}>
        {/* Difference grading */}
        <Section title="Difference grading" caption="Rank DA by difference — the units of the league and beyond." style={styles.col}>
          <View style={styles.chipRow}>
            {GRADING_TIERS.map((t) => (
              <View key={t} style={styles.tierChip}><Text style={styles.tierText}>{t}</Text></View>
            ))}
          </View>
          <View style={styles.list}>
            {GRADING_METHODS.map((m) => (
              <View key={m} style={styles.listRow}>
                <Text style={styles.bullet}>▸</Text>
                <Text style={styles.listText}>{m}</Text>
              </View>
            ))}
          </View>
        </Section>

        {/* Opponent character */}
        <Section title="Opponent character" caption="What subdues a team on the current fixture." style={styles.col}>
          <View style={styles.list}>
            {OPPONENT_FACTORS.map((f) => (
              <View key={f.head} style={styles.factor}>
                <Text style={styles.factorHead}>{f.head}</Text>
                <Text style={styles.factorBody}>{f.body}</Text>
              </View>
            ))}
          </View>
        </Section>
      </View>

      <View style={[styles.cols, narrow && styles.colsNarrow]}>
        {/* Scarcity */}
        <Section title="Scarcity (hunger)" caption="How much they want it — comes in many forms, depends on the strategy or the call." style={styles.col}>
          <View style={styles.stateRow}>
            <View style={[styles.stateChip, styles.stateKnown]}><Text style={styles.stateKnownText}>Reason known</Text></View>
            <View style={[styles.stateChip, styles.stateUnknown]}><Text style={styles.stateUnknownText}>Reason unknown</Text></View>
          </View>
        </Section>

        {/* Threat */}
        <Section title="Threat" caption="Threat on the current fixture." style={styles.col}>
          <View style={styles.threat}>
            <Text style={styles.threatText}>On the current fixture: no threat here</Text>
            <View style={styles.threatChip}><Text style={styles.threatChipText}>✓ Threat removed</Text></View>
          </View>
        </Section>
      </View>

      {/* Open items / still to wire */}
      <Section title="Open items" caption="Still to reconcile on the skeleton.">
        <View style={styles.list}>
          {OPEN_ITEMS.map((it) => (
            <View key={it.text} style={styles.listRow}>
              <Text style={[styles.bullet, it.warn && styles.bulletWarn]}>{it.warn ? '⚠' : '☐'}</Text>
              <Text style={[styles.listText, it.warn && styles.listWarn]}>{it.text}</Text>
            </View>
          ))}
        </View>
      </Section>
    </View>
  );
}

function Section({
  title,
  caption,
  children,
  style,
}: {
  title: string;
  caption?: string;
  children: React.ReactNode;
  style?: object;
}) {
  return (
    <View style={[styles.section, style]}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {caption ? <Text style={styles.sectionCaption}>{caption}</Text> : null}
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', alignSelf: 'stretch' },
  header: { marginBottom: spacing.md },
  title: { fontFamily: fonts.display, fontSize: 24, color: theme.textPrimary, marginBottom: spacing.xs },
  subtitle: { fontFamily: fonts.body, fontSize: 13, lineHeight: 20, color: theme.textMuted },

  toolbar: {
    flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm,
    borderWidth: layout.borderWidth, borderColor: theme.border, borderRadius: layout.borderRadius,
    backgroundColor: theme.surface, padding: spacing.md,
  },
  toolbarLabel: { fontFamily: fonts.bodySemiBold, fontSize: 11, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  toolbarHint: { fontFamily: fonts.body, fontSize: 12, color: theme.textMuted },
  segment: { flexDirection: 'row', borderWidth: layout.borderWidth, borderColor: theme.border, borderRadius: 999, overflow: 'hidden', backgroundColor: theme.surfaceMuted },
  segBtn: { paddingHorizontal: spacing.md, paddingVertical: 6 },
  segBtnOn: { backgroundColor: theme.accentGreen },
  segText: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: theme.textMuted },
  segTextOn: { color: '#FFFFFF' },

  section: {
    marginTop: spacing.md, borderWidth: layout.borderWidth, borderColor: theme.border,
    borderRadius: layout.borderRadius, backgroundColor: theme.surface, padding: spacing.md,
  },
  sectionTitle: { fontFamily: fonts.display, fontSize: 16, color: theme.textPrimary },
  sectionCaption: { fontFamily: fonts.body, fontSize: 12, lineHeight: 18, color: theme.textMuted, marginTop: 2 },
  sectionBody: { marginTop: spacing.sm },

  cols: { flexDirection: 'row', gap: spacing.md },
  colsNarrow: { flexDirection: 'column' },
  col: { flex: 1, marginTop: spacing.md },

  scroll: { width: '100%', maxWidth: '100%' },
  scrollContent: { minWidth: '100%' },
  table: {
    width: '100%', minWidth: 420, borderWidth: layout.borderWidth, borderColor: theme.border,
    borderRadius: layout.borderRadius, overflow: 'hidden', backgroundColor: theme.surface,
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, paddingHorizontal: spacing.sm },
  headRow: { backgroundColor: theme.surfaceMuted, borderBottomWidth: layout.borderWidth, borderBottomColor: theme.border },
  rowAlt: { backgroundColor: theme.surfaceHover },
  headText: { fontFamily: fonts.bodySemiBold, fontSize: 10, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 4 },
  headOn: { color: theme.accentGreen },
  center: { textAlign: 'center' },

  cPattern: { flex: 1, minWidth: 180, paddingHorizontal: 4 },
  cReading: { width: 220, paddingHorizontal: 4 },
  pattern: { fontFamily: fonts.bodyMedium, fontSize: 13, color: theme.textPrimary },
  pill: { alignSelf: 'flex-start', borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 },
  pillText: { fontFamily: fonts.bodySemiBold, fontSize: 11 },

  cScope: { flex: 1, minWidth: 90, paddingHorizontal: 4 },
  cCell: { width: 70, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  cellOn: { backgroundColor: 'rgba(5,150,105,0.08)' },
  scope: { fontFamily: fonts.bodyMedium, fontSize: 13, color: theme.textPrimary },
  ready: { fontFamily: fonts.body, fontSize: 12, color: theme.textFaint },
  readyOn: { color: theme.accentGreen },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  tierChip: { borderWidth: 1.5, borderColor: theme.accentBlue, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  tierText: { fontFamily: fonts.bodySemiBold, fontSize: 11, color: theme.accentBlue },

  list: { gap: 6 },
  listRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  bullet: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: theme.accentGreen, marginTop: 1, width: 16 },
  bulletWarn: { color: theme.loss },
  listText: { flex: 1, fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: theme.textPrimary },
  listWarn: { color: theme.loss, fontFamily: fonts.bodyMedium },

  factor: { borderLeftWidth: 2, borderLeftColor: theme.accentPurple, paddingLeft: spacing.sm, paddingVertical: 2 },
  factorHead: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.textPrimary },
  factorBody: { fontFamily: fonts.body, fontSize: 12, lineHeight: 18, color: theme.textMuted },

  stateRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  stateChip: { borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  stateKnown: { borderColor: theme.accentGreen, backgroundColor: 'rgba(5,150,105,0.08)' },
  stateKnownText: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: theme.accentGreen },
  stateUnknown: { borderColor: theme.border, backgroundColor: theme.surfaceHover },
  stateUnknownText: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: theme.textMuted },

  threat: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  threatText: { fontFamily: fonts.body, fontSize: 13, color: theme.textPrimary },
  threatChip: { borderWidth: 1.5, borderColor: theme.accentGreen, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, backgroundColor: 'rgba(5,150,105,0.08)' },
  threatChipText: { fontFamily: fonts.bodySemiBold, fontSize: 11, color: theme.accentGreen },
});
