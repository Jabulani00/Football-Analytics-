import { useMemo, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { H2HMatch } from '@/services/oddAlerts';
import type { SeasonMatch } from '@/utils/bhozomaEngine';
import type { ImbangiScheduleMatch } from '@/utils/imbangiEngine';
import type { FixtureInitialState } from '@/utils/last5Analysis';
import type { StandingLike } from '@/utils/motivationEngine';
import {
  buildPowerDynamicsCalculations,
  SECTOR_HIT,
  type CalculationSector,
  type CalculationTick,
  type PowerDynamicsCalculation,
  type SectorGroup,
} from '@/utils/powerDynamicsCalculations';
import type { IndlelaPath, PowerDynamicsBundle, PpgSwing, StreakSide } from '@/utils/powerDynamicsEngine';
import type { ProblemCauserRead } from '@/utils/problemCauser';
import { fonts, layout, spacing, theme } from '@/styles/theme';

type Props = {
  pd: PowerDynamicsBundle;
  standings: StandingLike[];
  matches: SeasonMatch[];
  schedule: ImbangiScheduleMatch[];
  seasonProgress?: number | null;
  competitionId?: number | string | null;
  h2hMatches: H2HMatch[];
  homeName: string;
  awayName: string;
  competitionName?: string | null;
  initial: FixtureInitialState;
  indlela: { t1: IndlelaPath; t2: IndlelaPath };
  problem: ProblemCauserRead;
  swing: { t1: PpgSwing; t2: PpgSwing };
  loss: { t1: StreakSide; t2: StreakSide };
  win: { t1: StreakSide; t2: StreakSide };
};

const GROUP_COPY: Record<SectorGroup, { title: string; note: string }> = {
  core: {
    title: 'Core sectors',
    note: 'Baseline, escape, last 5, form, H2H grade, and problem-causer level.',
  },
  semi: {
    title: 'Semi-core',
    note: 'Imbangi is 6 when the side has a neighbour within 4 points, otherwise 0.',
  },
  y: {
    title: 'Y applications',
    note: 'Each application is 2 when it is on, otherwise 0. A yellow side counts these inside Core.',
  },
};

function fmt(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—';
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function leaderLine(calc: PowerDynamicsCalculation, t1: string, t2: string): string {
  if (calc.calc1.leader === 'level') {
    return `${t1} and ${t2} have the same number of sectors at ${SECTOR_HIT} or more (${calc.calc1.t1.length}).`;
  }
  const winner = calc.calc1.leader === 't1' ? t1 : t2;
  const winnerCount = calc.calc1.leader === 't1' ? calc.calc1.t1.length : calc.calc1.t2.length;
  const otherCount = calc.calc1.leader === 't1' ? calc.calc1.t2.length : calc.calc1.t1.length;
  return `${winner} has more sectors at ${SECTOR_HIT} or more (${winnerCount}–${otherCount}).`;
}

function HitList({ label, rows }: { label: string; rows: { label: string; value: number }[] }) {
  return (
    <View style={styles.hitCol}>
      <Text style={styles.hitLabel}>{label}</Text>
      <Text style={styles.hitCount}>{rows.length}</Text>
      {rows.length === 0 ? (
        <Text style={styles.muted}>None at {SECTOR_HIT} or more</Text>
      ) : (
        rows.map((row) => (
          <Text key={row.label} style={styles.hitRow}>
            {row.label} · {fmt(row.value)}
          </Text>
        ))
      )}
    </View>
  );
}

function ValueCell({ value, hit }: { value: number | null; hit: boolean }) {
  return (
    <Text style={[styles.value, hit && styles.valueHit]}>{fmt(value)}</Text>
  );
}

function SectorRow({ row }: { row: CalculationSector }) {
  return (
    <View style={styles.sector}>
      <View style={styles.sectorHead}>
        <Text style={styles.sectorName}>{row.label}</Text>
        {row.coreFor.length > 0 ? (
          <Text style={styles.coreChip}>
            Core for {row.coreFor.map((side) => side.toUpperCase()).join(' · ')}
          </Text>
        ) : null}
      </View>
      <View style={styles.valueRow}>
        <View style={styles.valueCol}>
          <Text style={styles.valueTag}>T1</Text>
          <ValueCell value={row.t1} hit={(row.t1 ?? 0) >= SECTOR_HIT} />
        </View>
        <View style={styles.valueCol}>
          <Text style={styles.valueTag}>T2</Text>
          <ValueCell value={row.t2} hit={(row.t2 ?? 0) >= SECTOR_HIT} />
        </View>
      </View>
      {row.detail ? <Text style={styles.detail}>{row.detail}</Text> : null}
      {row.parts.length > 0 ? (
        <View style={styles.parts}>
          {row.parts.map((part) => (
            <View key={part.label} style={styles.partRow}>
              <Text style={styles.partLabel}>{part.label}</Text>
              <Text style={styles.partValue}>
                {fmt(part.t1)} · {fmt(part.t2)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function TickRow({ row }: { row: CalculationTick }) {
  return (
    <View style={styles.sector}>
      <Text style={styles.sectorName}>{row.label}</Text>
      <View style={styles.valueRow}>
        <View style={styles.valueCol}>
          <Text style={styles.valueTag}>T1</Text>
          <Text style={[styles.tick, row.t1 && styles.tickOn]}>{row.t1 ? '✓' : '—'}</Text>
        </View>
        <View style={styles.valueCol}>
          <Text style={styles.valueTag}>T2</Text>
          <Text style={[styles.tick, row.t2 && styles.tickOn]}>{row.t2 ? '✓' : '—'}</Text>
        </View>
      </View>
      <Text style={styles.detail}>{row.detail}</Text>
    </View>
  );
}

export default function PowerDynamicsCalculations(props: Props) {
  const calc = useMemo(
    () =>
      buildPowerDynamicsCalculations({
        pd: props.pd,
        standings: props.standings,
        matches: props.matches,
        schedule: props.schedule,
        seasonProgress: props.seasonProgress,
        competitionId: props.competitionId,
        h2hMatches: props.h2hMatches,
        homeName: props.homeName,
        awayName: props.awayName,
        competitionName: props.competitionName,
        initial: props.initial,
        indlela: props.indlela,
        problem: props.problem,
        swing: props.swing,
        loss: props.loss,
        win: props.win,
      }),
    [
      props.pd,
      props.standings,
      props.matches,
      props.schedule,
      props.seasonProgress,
      props.competitionId,
      props.h2hMatches,
      props.homeName,
      props.awayName,
      props.competitionName,
      props.initial,
      props.indlela,
      props.problem,
      props.swing,
      props.loss,
      props.win,
    ],
  );

  const t1 = props.pd.t1.label;
  const t2 = props.pd.t2.label;
  const core = calc.sectors.filter((row) => row.group === 'core');
  const yInCore = calc.sectors.filter((row) => row.group === 'y' && row.coreFor.length > 0);
  const semi = calc.sectors.filter((row) => row.group === 'semi');
  const yOnly = calc.sectors.filter((row) => row.group === 'y' && row.coreFor.length === 0);

  return (
    <View>
      <Text style={styles.intro}>
        {t1} against {t2}. A sector of {SECTOR_HIT} or more is listed in calculation 1. Totals add every numbered sector. Ticks stay out of the totals.
      </Text>
      {calc.t1Yellow || calc.t2Yellow ? (
        <Text style={styles.yellowNote}>
          {[calc.t1Yellow ? t1 : null, calc.t2Yellow ? t2 : null].filter(Boolean).join(' and ')}{' '}
          {calc.t1Yellow && calc.t2Yellow ? 'are' : 'is'} in the yellow tier, so Y applications sit inside Core for{' '}
          {calc.t1Yellow && calc.t2Yellow ? 'both sides' : 'that side'}.
        </Text>
      ) : null}

      <View style={styles.calcCard}>
        <Text style={styles.calcKicker}>Calculation 1</Text>
        <Text style={styles.calcTitle}>Sectors of {SECTOR_HIT} or more</Text>
        <Text style={styles.calcCall}>{leaderLine(calc, t1, t2)}</Text>
        <View style={styles.hitGrid}>
          <HitList label={t1} rows={calc.calc1.t1} />
          <HitList label={t2} rows={calc.calc1.t2} />
        </View>
      </View>

      <View style={styles.calcCard}>
        <Text style={styles.calcKicker}>Calculation 2 · Apples v apples</Text>
        <Text style={styles.calcTitle}>Totals</Text>
        <View style={styles.totalGrid}>
          <View style={styles.totalCol}>
            <Text style={styles.hitLabel}>{t1}</Text>
            <Text style={styles.total}>{fmt(calc.calc2.t1)}</Text>
          </View>
          <View style={styles.totalCol}>
            <Text style={styles.hitLabel}>{t2}</Text>
            <Text style={styles.total}>{fmt(calc.calc2.t2)}</Text>
          </View>
        </View>
        <Text style={styles.detail}>Core, semi-core, and Y applications. Additional sectors are ticks only.</Text>
      </View>

      <View style={styles.calcCard}>
        <Text style={styles.calcKicker}>Calculation 3 · Apples v oranges</Text>
        <Text style={styles.calcTitle}>Sectors T2 won against T1</Text>
        <Text style={styles.total}>{calc.calc3.count}</Text>
        {calc.calc3.sectors.length === 0 ? (
          <Text style={styles.muted}>T2 is not ahead in any numbered sector.</Text>
        ) : (
          calc.calc3.sectors.map((row) => (
            <Text key={row.id} style={styles.hitRow}>
              {row.label} · T2 {fmt(row.t2)} over T1 {fmt(row.t1)}
            </Text>
          ))
        )}
      </View>

      <Section title={GROUP_COPY.core.title} note={GROUP_COPY.core.note}>
        {core.map((row) => (
          <SectorRow key={row.id} row={row} />
        ))}
        {yInCore.length > 0 ? (
          <Text style={styles.subhead}>Y applications inside Core</Text>
        ) : null}
        {yInCore.map((row) => (
          <SectorRow key={row.id} row={row} />
        ))}
      </Section>

      <Section title={GROUP_COPY.semi.title} note={GROUP_COPY.semi.note}>
        {semi.map((row) => (
          <SectorRow key={row.id} row={row} />
        ))}
      </Section>

      {yOnly.length > 0 ? (
        <Section title={GROUP_COPY.y.title} note={GROUP_COPY.y.note}>
          {yOnly.map((row) => (
            <SectorRow key={row.id} row={row} />
          ))}
        </Section>
      ) : null}

      <Section
        title="Additional sectors"
        note="A tick means the side falls under that sector. Ticks are not added into the totals.">
        {calc.ticks.map((row) => (
          <TickRow key={row.id} row={row} />
        ))}
      </Section>
    </View>
  );
}

function Section({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionNote}>{note}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  intro: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: theme.textPrimary,
    lineHeight: 18,
    marginBottom: spacing.sm,
  },
  yellowNote: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: theme.yellow,
    lineHeight: 17,
    marginBottom: spacing.md,
  },
  calcCard: {
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    backgroundColor: theme.surface,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  calcKicker: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    color: theme.accentGreen,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  calcTitle: {
    fontFamily: fonts.displaySemi,
    fontSize: 18,
    color: theme.textPrimary,
    marginBottom: spacing.xs,
  },
  calcCall: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: theme.textPrimary,
    lineHeight: 18,
    marginBottom: spacing.sm,
  },
  hitGrid: { flexDirection: 'row', gap: spacing.md },
  hitCol: { flex: 1, gap: 2 },
  hitLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: theme.textMuted,
  },
  hitCount: {
    fontFamily: fonts.display,
    fontSize: 28,
    color: theme.textPrimary,
  },
  hitRow: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textPrimary,
    lineHeight: 17,
  },
  totalGrid: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.xs },
  totalCol: { flex: 1 },
  total: {
    fontFamily: fonts.display,
    fontSize: 32,
    color: theme.textPrimary,
  },
  section: { marginBottom: spacing.lg },
  sectionTitle: {
    fontFamily: fonts.displaySemi,
    fontSize: 16,
    color: theme.textPrimary,
  },
  sectionNote: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textMuted,
    lineHeight: 17,
    marginBottom: spacing.sm,
  },
  subhead: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: theme.yellow,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  sector: {
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    backgroundColor: theme.surface,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  sectorHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  sectorName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: theme.textPrimary,
    flexShrink: 1,
  },
  coreChip: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    color: theme.yellow,
  },
  valueRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xs },
  valueCol: { flex: 1 },
  valueTag: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: theme.textMuted,
  },
  value: {
    fontFamily: fonts.displaySemi,
    fontSize: 22,
    color: theme.textPrimary,
  },
  valueHit: { color: theme.accentGreen },
  detail: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textMuted,
    lineHeight: 17,
    marginTop: spacing.xs,
  },
  parts: {
    marginTop: spacing.sm,
    borderTopWidth: layout.borderWidth,
    borderTopColor: theme.border,
    paddingTop: spacing.xs,
    gap: 4,
  },
  partRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  partLabel: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted, flex: 1 },
  partValue: { fontFamily: fonts.bodyMedium, fontSize: 11, color: theme.textPrimary },
  tick: {
    fontFamily: fonts.display,
    fontSize: 22,
    color: theme.textFaint,
  },
  tickOn: { color: theme.accentGreen },
  muted: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textMuted,
    lineHeight: 17,
  },
});
