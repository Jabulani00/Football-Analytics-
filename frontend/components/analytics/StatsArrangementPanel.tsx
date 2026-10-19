import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import SectionLabel from '@/components/shared/SectionLabel';
import { fonts, layout, spacing, theme } from '@/styles/theme';

/**
 * Stats Arrangement — a read-only call-out of the strategy already built into
 * the app. Nothing here computes a new stat; every section names the engine or
 * util in the codebase that produces the numbers, so the handwritten strategy
 * ("stats_notes") can be read straight off the screen and traced to its source.
 *
 * DA = Double Agent: a stat that reads one way on one split (e.g. Home) and
 * sits in the middle on the other (e.g. Overall) — strong enough to use, but it
 * needs a confirmer before it is trusted.
 */

type Tone = 'strong' | 'weak' | 'da' | 'neutral';

/** ↑ above the league mean · (m) middle / average · ↓ below the league mean. */
function Dir({ value }: { value: '↑' | '↓' | '(m)' }) {
  const color = value === '↑' ? theme.accentGreen : value === '↓' ? theme.loss : theme.textMuted;
  return <Text style={[styles.dir, { color }]}>{value}</Text>;
}

function DAChip() {
  return (
    <View style={styles.daChip}>
      <Text style={styles.daChipText}>DA</Text>
    </View>
  );
}

function CodeRef({ children }: { children: string }) {
  return (
    <View style={styles.codeRef}>
      <Text style={styles.codeRefLabel}>In code</Text>
      <Text style={styles.codeRefText}>{children}</Text>
    </View>
  );
}

function Chip({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  return (
    <View style={[styles.chip, toneStyle(tone).box]}>
      <Text style={[styles.chipText, toneStyle(tone).text]}>{label}</Text>
    </View>
  );
}

function Section({
  id,
  title,
  caption,
  open,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  caption: string;
  open: boolean;
  onToggle: (id: string) => void;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => onToggle(id)}
        style={({ pressed }) => [styles.sectionHeader, pressed && styles.pressed]}>
        <View style={styles.sectionHeaderText}>
          <Text style={styles.sectionTitle}>{title}</Text>
          <Text style={styles.sectionCaption}>{caption}</Text>
        </View>
        <Text style={styles.chevron}>{open ? '▴' : '▾'}</Text>
      </Pressable>
      {open ? <View style={styles.sectionBody}>{children}</View> : null}
    </View>
  );
}

export default function StatsArrangementPanel() {
  const narrow = useWindowDimensions().width < 720;
  // Sources is open by default; the rest collapse so the page stays scannable.
  const [open, setOpen] = useState<Record<string, boolean>>({ sources: true });
  const toggle = (id: string) => setOpen((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <View style={styles.container}>
      <View style={styles.intro}>
        <Text style={styles.introTitle}>Stats Arrangement</Text>
        <Text style={styles.introText}>
          How the strategy is called out. Every stat below is already produced elsewhere in the
          app — this panel only names the arrangement and points at the engine that builds it. It
          changes nothing.
        </Text>
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendRow}>
          <Dir value="↑" />
          <Text style={styles.legendText}>above league mean</Text>
          <Dir value="(m)" />
          <Text style={styles.legendText}>middle / average</Text>
          <Dir value="↓" />
          <Text style={styles.legendText}>below league mean</Text>
        </View>
        <View style={styles.legendRow}>
          <DAChip />
          <Text style={styles.legendText}>
            Double Agent — strong on one split, middling on the other; needs a confirmer.
          </Text>
        </View>
      </View>

      {/* 1 — Sources & windows */}
      <Section
        id="sources"
        title="1 · Sources & windows"
        caption="Which games feed a stat, and the gate before it counts"
        open={!!open.sources}
        onToggle={toggle}>
        <View style={styles.cardRow}>
          <SourceCard title="All games" sub="Full season sample" />
          <SourceCard title="Last 10 & 8" sub="Recent form, two depths" />
          <SourceCard title="Last 6 & 5" sub="Short form, two depths" />
          <SourceCard title="Last game" sub="Limiting stat / RFS feed" />
        </View>
        <View style={styles.ruleBox}>
          <Text style={styles.ruleTitle}>First rule — minimum played (MP)</Text>
          <View style={styles.inlineChips}>
            <Chip label="Overall ≥ 8 or 10" />
            <Chip label="Home ≥ 4" />
            <Chip label="Away ≥ 4" />
          </View>
          <Text style={styles.ruleNote}>
            Omit test — a single 20% slice of games can flip a stat. Remove 20% and recalculate
            before trusting it.
          </Text>
        </View>
        <CodeRef>
          Windows: RecencyWindow in types/analytics.ts · per-game records in utils/countedGames.ts
          · minimum-sample gates in the stat builders (MIN_* constants).
        </CodeRef>
      </Section>

      {/* 2 — Grading A–F */}
      <Section
        id="grading"
        title="2 · Stat grading  A–F"
        caption="Strong A/B/C · Weak D/E/F · read Home against Overall"
        open={!!open.grading}
        onToggle={toggle}>
        <View style={styles.gradeTable}>
          <View style={[styles.gradeRow, styles.gradeHead]}>
            <Text style={[styles.gcGrade, styles.gradeHeadText]}>Grade</Text>
            <Text style={[styles.gcDir, styles.gradeHeadText]}>Home</Text>
            <Text style={[styles.gcDir, styles.gradeHeadText]}>Overall</Text>
            <Text style={[styles.gcNote, styles.gradeHeadText]}>Note</Text>
          </View>
          {GRADES.map((g) => (
            <View key={g.grade} style={styles.gradeRow}>
              <View style={styles.gcGrade}>
                <Chip label={g.grade} tone={g.tone} />
                {g.da ? <DAChip /> : null}
              </View>
              <View style={styles.gcDir}>
                <Dir value={g.home} />
              </View>
              <View style={styles.gcDir}>
                <Dir value={g.overall} />
              </View>
              <Text style={styles.gcNote}>{g.note}</Text>
            </View>
          ))}
        </View>
        <CodeRef>
          Directions come from the colour / mean reads in utils/compliance.ts and the
          above/level/below ranking in utils/leagueStats.ts (LeagueStatSide).
        </CodeRef>
      </Section>

      {/* 3 — Combined hierarchy I–VII */}
      <Section
        id="hierarchy"
        title="3 · Combined hierarchy  I–VII"
        caption="Grades ranked into the strategy call — bigger is better"
        open={!!open.hierarchy}
        onToggle={toggle}>
        <View style={[styles.twoCol, narrow && styles.oneCol]}>
          <View style={styles.col}>
            <SectionLabel>Strong</SectionLabel>
            {STRONG_ORDER.map((r) => (
              <HierRow key={r.roman} roman={r.roman} label={r.label} da={r.da} tone="strong" />
            ))}
          </View>
          <View style={styles.col}>
            <SectionLabel>Weak</SectionLabel>
            {WEAK_ORDER.map((r) => (
              <HierRow key={r.roman} roman={r.roman} label={r.label} da={r.da} tone="weak" />
            ))}
          </View>
        </View>
        <Text style={styles.ruleTitle}>Concoction counts — Series+RFS / Ordinary+RFS</Text>
        <View style={styles.inlineChips}>
          {CONCOCTION.map((c) => (
            <Chip key={c} label={c} />
          ))}
        </View>
        <CodeRef>
          The mixes themselves: Series in utils/fixtureSeries.ts, RFS in utils/fixtureRfs.ts, and
          the Ordinary+RFS / Series+RFS combinations in utils/mixedRfs.ts and utils/mixedStats.ts.
        </CodeRef>
      </Section>

      {/* 4 — Two reading methods */}
      <Section
        id="methods"
        title="4 · Two reading methods"
        caption="Apply both, then verify colour"
        open={!!open.methods}
        onToggle={toggle}>
        <View style={[styles.twoCol, narrow && styles.oneCol]}>
          <View style={styles.methodCard}>
            <Text style={styles.methodTitle}>Method 1 — % stats</Text>
            <View style={styles.methodBand}>
              <Dir value="↑" />
              <Text style={styles.methodBandText}>60 – 100%</Text>
            </View>
            <View style={styles.methodBand}>
              <Dir value="(m)" />
              <Text style={styles.methodBandText}>40 – 59%</Text>
            </View>
            <View style={styles.methodBand}>
              <Dir value="↓" />
              <Text style={styles.methodBandText}>0 – 39%</Text>
            </View>
          </View>
          <View style={styles.methodCard}>
            <Text style={styles.methodTitle}>Method 2 — non-% & AVG</Text>
            <Text style={styles.methodText}>
              Compare the raw value or average to the league mean, then read it as ↑ / (m) / ↓ the
              same way.
            </Text>
          </View>
        </View>
        <View style={styles.ruleBox}>
          <Text style={styles.ruleTitle}>Colour verification</Text>
          <View style={styles.inlineChips}>
            <Chip label="🟢 65%+ reliable" tone="strong" />
            <Chip label="🟡 45–64% moderate" />
            <Chip label="🔴 under 45% caution" tone="weak" />
          </View>
        </View>
        <CodeRef>
          Colour thresholds live in utils/compliance.ts (COMPLIANCE_THRESHOLDS 65 / 45); the league
          mean for Method 2 in utils/leagueStats.ts (buildLeagueStatTable).
        </CodeRef>
      </Section>

      {/* 5 — Stat families / strategy calls */}
      <Section
        id="families"
        title="5 · Stat families (strategy calls)"
        caption="The seven calls, 1–7"
        open={!!open.families}
        onToggle={toggle}>
        {FAMILIES.map((f) => (
          <View key={f.n} style={styles.familyRow}>
            <Text style={styles.familyNum}>{f.n}</Text>
            <View style={styles.familyBody}>
              <Text style={styles.familyName}>{f.name}</Text>
              <Text style={styles.familyRef}>{f.ref}</Text>
            </View>
          </View>
        ))}
      </Section>

      {/* 6 — Table matrix */}
      <Section
        id="matrix"
        title="6 · Table matrix"
        caption="Split × period × window, sliced into tiers"
        open={!!open.matrix}
        onToggle={toggle}>
        <View style={[styles.twoCol, narrow && styles.oneCol]}>
          <MatrixCol title="Split" items={['Overall', 'Home', 'Away']} />
          <MatrixCol title="Period" items={['Full time', '1st half', '2nd half']} />
          <MatrixCol title="Window" items={['Last 5', 'Last 6', 'Last 8', 'Last 10', 'All games', 'Last game']} />
        </View>
        <Text style={styles.ruleTitle}>Tiers (by league table position)</Text>
        <View style={styles.inlineChips}>
          <Chip label="Top 1/3 · 60–100%" tone="strong" />
          <Chip label="Middle 1/3 · 40–59%" />
          <Chip label="Bottom 1/3 · 0–39%" tone="weak" />
        </View>
        <CodeRef>
          Periods / scopes / minimums are defined in utils/statBoard.ts; the top-mid-bottom thirds
          in utils/tieredTables.ts (buildTieredTables).
        </CodeRef>
      </Section>

      {/* 7 — DA triggers & confirmers */}
      <Section
        id="da"
        title="7 · DA triggers & confirmers"
        caption="Home/Away · 1stH/2ndH · Colours · SC/m — confirm every DA"
        open={!!open.da}
        onToggle={toggle}>
        <View style={styles.daBlock}>
          <Text style={styles.daTitle}>Home / Away analysis</Text>
          <Text style={styles.daText}>
            Difference between the Home value and the Away value. Long difference (≥ 20%) is a
            dominance DA; short difference (0–15%) is non-DA. Take the top 1/3 of HD (drop zero /
            negative) and AD, combine, number them, and prefer DAs with the higher value across
            leagues.
          </Text>
          <CodeRef>Home/Away dominance & DA: utils/powerDynamicsCalculations.ts and powerDynamicsEngine.ts.</CodeRef>
        </View>

        <View style={styles.daBlock}>
          <Text style={styles.daTitle}>1st H / 2nd H analysis</Text>
          <Text style={styles.daText}>
            Difference between first-half and second-half value: + means 1st-half dominance, − means
            2nd-half dominance. The long difference is the one of interest. Stats: PPG, SC, Conc,
            AVG, and SC vs Conc.
          </Text>
          <CodeRef>Half splits: utils/mixedStats.ts (halfGoalShares, secondHalf* rates) and the half columns in utils/statBoard.ts.</CodeRef>
        </View>

        <View style={styles.daBlock}>
          <Text style={styles.daTitle}>Opposite stats analysis</Text>
          <Text style={styles.daText}>
            Pairs that should sit near 50 (45–55, ≤ 10% apart): SC% vs FTS%, Conc% vs CS%. Trigger
            when SC/m ≥ 1 and Conc/m ≥ 1 (something ↑ and something ↓). Arrange smallest difference
            to largest; a short difference is no DA. Confirm with a normal DA (Home/Away, Colours)
            and match it to the current fixture&apos;s side.
          </Text>
          <CodeRef>Separator / opposite-stat flags: utils/separatorTools.ts (evaluateFixtureSeparators).</CodeRef>
        </View>

        <View style={styles.daBlock}>
          <Text style={styles.daTitle}>Colours analysis</Text>
          <Text style={styles.daText}>
            Rates against each opponent colour (G 10% · Y 30% · R 60% share of the table), minimum 3
            matches. Rank biggest = (1), then (2), (3). Call ↑ when (1)−(2) &gt; 12%; call ↓ when
            (2)−(3) &gt; 12%. DA behaviour sits across (1) &amp; (3) — then pick the colour you face
            this fixture.
          </Text>
          <CodeRef>Colour catalogue & rates: utils/colourVerification.ts (COLOUR_STAT_CATALOGUE, ratesAgainstColours, MIN_COLOUR_OPPONENT_MATCHES = 3).</CodeRef>
        </View>
      </Section>

      {/* 8 — Call-out structure */}
      <Section
        id="callout"
        title="8 · Call-out structure"
        caption="The front-end selectors that assemble a call"
        open={!!open.callout}
        onToggle={toggle}>
        <View style={styles.cardRow}>
          <SelectorCard title="Stat" items={['From the tables']} />
          <SelectorCard title="Direction" items={['↑', '(m)', '↓']} />
          <SelectorCard title="Split" items={['Overall', 'Home', 'Away']} />
          <SelectorCard title="Period" items={['Full time', 'Half time', '2nd half']} />
          <SelectorCard title="Strength" items={['Strong A–C', 'Weak D–F']} />
          <SelectorCard title="Scope" items={['Current league', 'All leagues']} />
        </View>
        <Text style={styles.ruleNote}>Each call can Apply · Remove · Display against the selection.</Text>
        <CodeRef>
          These map onto the pickers already backing utils/statBoard.ts, utils/tieredTables.ts and
          utils/leagueStats.ts.
        </CodeRef>
      </Section>

      {/* 9 — Stats operation */}
      <Section
        id="operation"
        title="9 · Stats operation"
        caption="Compare like with like — apples vs apples"
        open={!!open.operation}
        onToggle={toggle}>
        <Text style={styles.daText}>
          Arrange stats top to bottom, choose the biggest as the unit (unit = top value ÷ 16), then
          read every stat against that unit so Home-vs-Away dominance differences are measured on
          the same scale — 6× no units, apples vs apples, for every stat.
        </Text>
        <CodeRef>Unit / sector scoring: utils/powerDynamicsCalculations.ts (summariseSectorScores, buildPowerDynamicsCalculations).</CodeRef>
      </Section>
    </View>
  );
}

/* ---- small building blocks ---- */

function SourceCard({ title, sub }: { title: string; sub: string }) {
  return (
    <View style={styles.sourceCard}>
      <Text style={styles.sourceTitle}>{title}</Text>
      <Text style={styles.sourceSub}>{sub}</Text>
    </View>
  );
}

function HierRow({ roman, label, da, tone }: { roman: string; label: string; da?: boolean; tone: Tone }) {
  return (
    <View style={styles.hierRow}>
      <Text style={styles.hierRoman}>{roman}</Text>
      <Chip label={label} tone={tone} />
      {da ? <DAChip /> : null}
    </View>
  );
}

function MatrixCol({ title, items }: { title: string; items: string[] }) {
  return (
    <View style={styles.matrixCol}>
      <SectionLabel>{title}</SectionLabel>
      {items.map((i) => (
        <Text key={i} style={styles.matrixItem}>
          {i}
        </Text>
      ))}
    </View>
  );
}

function SelectorCard({ title, items }: { title: string; items: string[] }) {
  return (
    <View style={styles.selectorCard}>
      <Text style={styles.selectorTitle}>{title}</Text>
      {items.map((i) => (
        <Text key={i} style={styles.selectorItem}>
          {i}
        </Text>
      ))}
    </View>
  );
}

/* ---- strategy data (straight from the notes) ---- */

const GRADES: { grade: string; home: '↑' | '↓' | '(m)'; overall: '↑' | '↓' | '(m)'; note: string; tone: Tone; da?: boolean }[] = [
  { grade: 'A', home: '↑', overall: '↑', note: 'Strong both ways', tone: 'strong' },
  { grade: 'B', home: '↑', overall: '(m)', note: 'Strong Home, middling Overall', tone: 'strong', da: true },
  { grade: 'C', home: '(m)', overall: '(m)', note: 'Middle but above league AVG', tone: 'strong' },
  { grade: 'D', home: '(m)', overall: '(m)', note: 'Middle but below league AVG', tone: 'weak' },
  { grade: 'E', home: '↓', overall: '(m)', note: 'Weak Home, middling Overall', tone: 'weak', da: true },
  { grade: 'F', home: '↓', overall: '↓', note: 'Weak both ways', tone: 'weak' },
];

const STRONG_ORDER: { roman: string; label: string; da?: boolean }[] = [
  { roman: 'I', label: '1 · A' },
  { roman: 'II', label: '1 · B' },
  { roman: 'III', label: '2 · A' },
  { roman: 'IV', label: '2 · B', da: true },
  { roman: 'V', label: '1 · C', da: true },
  { roman: 'VI', label: '2 · C', da: true },
  { roman: 'VII', label: '3 · A' },
];

const WEAK_ORDER: { roman: string; label: string; da?: boolean }[] = [
  { roman: 'I', label: '1 · F' },
  { roman: 'II', label: '1 · E' },
  { roman: 'III', label: '2 · F' },
  { roman: 'IV', label: '2 · E', da: true },
  { roman: 'V', label: '1 · D', da: true },
  { roman: 'VI', label: '2 · D', da: true },
  { roman: 'VII', label: '3 · F' },
];

const CONCOCTION = ['II 6+1', 'III 7+1', 'IV 5+1', 'V 4+1', 'VI 8+1 (m)', 'VII 9+1'];

const FAMILIES: { n: string; name: string; ref: string }[] = [
  { n: '1', name: 'League stats', ref: 'utils/leagueStats.ts' },
  { n: '2', name: 'Ordinary stats', ref: 'utils/coreFixtureStats.ts' },
  { n: '3', name: 'Series', ref: 'utils/fixtureSeries.ts' },
  { n: '4', name: 'RFS — last game', ref: 'utils/fixtureRfs.ts' },
  { n: '5', name: 'Ordinary + RFS', ref: 'utils/mixedRfs.ts · utils/mixedStats.ts' },
  { n: '6', name: 'Series + RFS', ref: 'utils/mixedRfs.ts' },
  { n: '7', name: '1st H / 2nd H comparison (PPG · SC · Conc · AVG · SC vs Conc)', ref: 'utils/mixedStats.ts · utils/statBoard.ts' },
];

/* ---- tone helper ---- */

function toneStyle(tone: Tone) {
  switch (tone) {
    case 'strong':
      return { box: styles.toneStrongBox, text: styles.toneStrongText };
    case 'weak':
      return { box: styles.toneWeakBox, text: styles.toneWeakText };
    case 'da':
      return { box: styles.toneDaBox, text: styles.toneDaText };
    default:
      return { box: styles.toneNeutralBox, text: styles.toneNeutralText };
  }
}

const styles = StyleSheet.create({
  container: { width: '100%', maxWidth: 920, alignSelf: 'center' },
  intro: { marginBottom: spacing.md },
  introTitle: { fontFamily: fonts.display, fontSize: 22, color: theme.textPrimary, marginBottom: spacing.xs },
  introText: { fontFamily: fonts.body, fontSize: 13, lineHeight: 20, color: theme.textMuted },

  legend: {
    backgroundColor: theme.surfaceMuted,
    borderRadius: layout.borderRadius,
    padding: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  legendText: { fontFamily: fonts.body, fontSize: 12, color: theme.textMuted },
  dir: { fontFamily: fonts.bodySemiBold, fontSize: 14 },

  section: {
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    backgroundColor: theme.surface,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    gap: spacing.md,
  },
  pressed: { opacity: 0.7 },
  sectionHeaderText: { flex: 1 },
  sectionTitle: { fontFamily: fonts.displaySemi, fontSize: 16, color: theme.textPrimary },
  sectionCaption: { fontFamily: fonts.body, fontSize: 12, color: theme.textMuted, marginTop: 2 },
  chevron: { fontFamily: fonts.bodySemiBold, fontSize: 18, color: theme.accentGreen },
  sectionBody: {
    padding: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: layout.borderWidth,
    borderTopColor: theme.border,
    gap: spacing.md,
  },

  cardRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  sourceCard: {
    flexGrow: 1,
    flexBasis: 140,
    minWidth: 140,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    padding: spacing.sm,
    backgroundColor: theme.surfaceHover,
  },
  sourceTitle: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.textPrimary },
  sourceSub: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted, marginTop: 2 },

  ruleBox: {
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    padding: spacing.md,
    backgroundColor: theme.surfaceHover,
    gap: spacing.sm,
  },
  ruleTitle: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.textPrimary },
  ruleNote: { fontFamily: fonts.body, fontSize: 12, lineHeight: 18, color: theme.textMuted },
  inlineChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },

  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: layout.borderWidth,
  },
  chipText: { fontFamily: fonts.bodySemiBold, fontSize: 11 },
  toneStrongBox: { backgroundColor: 'rgba(5,150,105,0.10)', borderColor: theme.accentGreen },
  toneStrongText: { color: theme.accentGreen },
  toneWeakBox: { backgroundColor: 'rgba(220,38,38,0.08)', borderColor: theme.loss },
  toneWeakText: { color: theme.loss },
  toneDaBox: { backgroundColor: 'rgba(124,58,237,0.10)', borderColor: theme.accentPurple },
  toneDaText: { color: theme.accentPurple },
  toneNeutralBox: { backgroundColor: theme.surfaceMuted, borderColor: theme.border },
  toneNeutralText: { color: theme.textPrimary },

  daChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: theme.accentPurple,
  },
  daChipText: { fontFamily: fonts.bodySemiBold, fontSize: 10, color: '#FFFFFF', letterSpacing: 0.5 },

  codeRef: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    backgroundColor: theme.surfaceMuted,
    borderRadius: layout.borderRadius,
    padding: spacing.sm,
  },
  codeRefLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 9,
    color: theme.accentBlue,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    paddingTop: 2,
  },
  codeRefText: { flex: 1, fontFamily: fonts.body, fontSize: 11, lineHeight: 16, color: theme.textMuted },

  gradeTable: { borderWidth: layout.borderWidth, borderColor: theme.border, borderRadius: layout.borderRadius, overflow: 'hidden' },
  gradeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: layout.borderWidth,
    borderBottomColor: theme.border,
    gap: spacing.xs,
  },
  gradeHead: { backgroundColor: theme.surfaceHover },
  gradeHeadText: { fontFamily: fonts.bodySemiBold, fontSize: 10, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  gcGrade: { width: 76, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  gcDir: { width: 56, alignItems: 'center' },
  gcNote: { flex: 1, fontFamily: fonts.body, fontSize: 12, color: theme.textPrimary },

  twoCol: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  oneCol: { flexDirection: 'column' },
  col: { flex: 1, minWidth: 240, gap: spacing.xs },
  hierRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 3 },
  hierRoman: { width: 34, fontFamily: fonts.bodySemiBold, fontSize: 12, color: theme.textMuted },

  methodCard: {
    flex: 1,
    minWidth: 240,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    padding: spacing.md,
    gap: spacing.sm,
  },
  methodTitle: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.textPrimary },
  methodText: { fontFamily: fonts.body, fontSize: 12, lineHeight: 18, color: theme.textMuted },
  methodBand: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  methodBandText: { fontFamily: fonts.body, fontSize: 13, color: theme.textPrimary },

  familyRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start', paddingVertical: 4 },
  familyNum: { fontFamily: fonts.display, fontSize: 16, color: theme.accentGreen, width: 22 },
  familyBody: { flex: 1 },
  familyName: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.textPrimary },
  familyRef: { fontFamily: fonts.body, fontSize: 11, color: theme.textFaint, marginTop: 1 },

  matrixCol: { flex: 1, minWidth: 140, gap: spacing.xs },
  matrixItem: { fontFamily: fonts.body, fontSize: 13, color: theme.textPrimary },

  daBlock: { gap: spacing.sm },
  daTitle: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: theme.textPrimary },
  daText: { fontFamily: fonts.body, fontSize: 12, lineHeight: 19, color: theme.textMuted },

  selectorCard: {
    flexGrow: 1,
    flexBasis: 130,
    minWidth: 130,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    padding: spacing.sm,
    gap: 2,
  },
  selectorTitle: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: theme.accentGreen, marginBottom: 2 },
  selectorItem: { fontFamily: fonts.body, fontSize: 12, color: theme.textPrimary },
});
