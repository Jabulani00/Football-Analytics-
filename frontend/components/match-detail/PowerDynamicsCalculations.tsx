import { useMemo, useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { H2HMatch } from '@/services/oddAlerts';
import type { SeasonMatch } from '@/utils/bhozomaEngine';
import type { ImbangiScheduleMatch } from '@/utils/imbangiEngine';
import type { FixtureInitialState } from '@/utils/last5Analysis';
import type { StandingLike } from '@/utils/motivationEngine';
import { scoreCalculationRead } from '@/utils/powerDynamicCalculationCalls';
import {
  buildPowerDynamicsCalculations,
  SECTOR_HIT,
  type CalculationSector,
  type CalculationTick,
  type ComparedSector,
  type MarginBandId,
  type MarginBands,
  type PowerDynamicsCalculation,
  type SectorGroup,
  type SideMarginRead,
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
  /** The calculation option and in-option opened from a call. */
  focus?: { functionId: string; aspectId?: string };
};

const GROUP_COPY: Record<SectorGroup, { title: string; note: string }> = {
  core: {
    title: 'Core sectors',
    note: 'Baseline, escape, last 5, form, H2H, problem causer, and imbangi. Each row names its separation from those two values.',
  },
  semi: {
    title: 'Semi-core',
    note: 'Home/Away strong uses the baseline scores. A Strong label on T2 is highlighted next to gap analysis.',
  },
  y: {
    title: 'Y applications',
    note: 'Each application is 2 when it is on, otherwise 0. A sudden drop gives that 2 to the opponent. A yellow side counts these inside Core.',
  },
};

function fmt(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—';
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

const SECTOR_PREVIEW = 5;

const WIN_BANDS: { id: MarginBandId; title: string; chip: string }[] = [
  { id: 'high', title: 'Won by 6 or more', chip: '6+' },
  { id: 'mid', title: 'Won by 4 to 5.9', chip: '4–5.9' },
  { id: 'low', title: 'Won by less than 4', chip: 'Under 4' },
];

function takePreview(bands: MarginBands, limit: number): MarginBands {
  const next: MarginBands = { high: [], mid: [], low: [] };
  let left = limit;
  for (const band of WIN_BANDS) {
    if (left <= 0) break;
    next[band.id] = bands[band.id].slice(0, left);
    left -= next[band.id].length;
  }
  return next;
}

function ownScore(row: ComparedSector, side: 't1' | 't2'): { own: number; other: number } {
  return side === 't1' ? { own: row.t1, other: row.t2 } : { own: row.t2, other: row.t1 };
}

function wonCall(t1Name: string, t2Name: string, t1: SideMarginRead, t2: SideMarginRead): string {
  if (t1.count === t2.count) {
    return `${t1Name} and ${t2Name} won the same number of sectors (${t1.count}).`;
  }
  const leader = t1.count > t2.count ? t1Name : t2Name;
  const high = Math.max(t1.count, t2.count);
  const low = Math.min(t1.count, t2.count);
  return `${leader} won more sectors (${high}–${low}).`;
}

function bandPaint(id: MarginBandId) {
  if (id === 'high') {
    return { text: styles.bandHigh, fill: styles.bandFillHigh, pill: styles.pillHigh, mark: styles.markHigh };
  }
  if (id === 'mid') {
    return { text: styles.bandMid, fill: styles.bandFillMid, pill: styles.pillMid, mark: styles.markMid };
  }
  return { text: styles.bandLow, fill: styles.bandFillLow, pill: styles.pillLow, mark: styles.markLow };
}

function SectorFact({
  label,
  aside,
  note,
  band,
  picked,
}: {
  label: string;
  aside: string;
  note?: string;
  band: MarginBandId;
  picked?: boolean;
}) {
  const paint = bandPaint(band);
  return (
    <View style={[styles.fact, paint.fill, picked && styles.factPicked]}>
      <View style={styles.factTop}>
        <Text style={styles.factName}>{label}</Text>
        <Text style={[styles.factAside, paint.text]}>{aside}</Text>
      </View>
      {note ? <Text style={styles.factNote}>{note}</Text> : null}
    </View>
  );
}

function SectorModal({
  visible,
  title,
  subtitle,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  subtitle: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close sectors" />
        <View style={styles.modalSheet}>
          <View style={styles.modalHead}>
            <View style={styles.modalTitles}>
              <Text style={styles.modalTitle}>{title}</Text>
              <Text style={styles.modalSub}>{subtitle}</Text>
            </View>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
              <Text style={styles.modalClose}>Close</Text>
            </Pressable>
          </View>
          <ScrollView style={styles.modalList}>{children}</ScrollView>
        </View>
      </View>
    </Modal>
  );
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
  const [open, setOpen] = useState(false);
  const shown = rows.slice(0, SECTOR_PREVIEW);
  const overflow = rows.length > SECTOR_PREVIEW;
  return (
    <View style={styles.hitCol}>
      <Text style={styles.hitLabel}>{label}</Text>
      <Text style={styles.hitCount}>{rows.length}</Text>
      {rows.length === 0 ? (
        <Text style={styles.muted}>None at {SECTOR_HIT} or more</Text>
      ) : (
        shown.map((row) => (
          <SectorFact key={row.label} label={row.label} aside={fmt(row.value)} band="high" />
        ))
      )}
      {overflow ? (
        <Pressable
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`Show more sectors for ${label}`}
          style={styles.moreBtn}>
          <Text style={styles.showMore}>Show more</Text>
        </Pressable>
      ) : null}
      <SectorModal
        visible={open}
        title={label}
        subtitle={`${rows.length} sectors of ${SECTOR_HIT} or more`}
        onClose={() => setOpen(false)}>
        {rows.map((row) => (
          <SectorFact key={row.label} label={row.label} aside={fmt(row.value)} band="high" />
        ))}
      </SectorModal>
    </View>
  );
}

function SideWon({
  name,
  read,
  side,
  emphasize,
}: {
  name: string;
  read: SideMarginRead;
  side: 't1' | 't2';
  emphasize?: MarginBandId;
}) {
  const [open, setOpen] = useState(false);
  const preview = takePreview(read.bands, SECTOR_PREVIEW);
  const overflow = read.count > SECTOR_PREVIEW;
  return (
    <View style={styles.winBox}>
      <Text style={styles.hitLabel}>{name}</Text>
      <Text style={styles.hitCount}>{read.count}</Text>
      <Text style={styles.winCaption}>sectors won</Text>
      <View style={styles.pillRow}>
        {WIN_BANDS.map((band) => {
          const paint = bandPaint(band.id);
          return (
            <View key={band.id} style={[styles.pill, paint.pill]}>
              <Text style={[styles.pillCount, paint.text]}>{read.bands[band.id].length}</Text>
              <Text style={[styles.pillLabel, paint.text]} numberOfLines={1}>
                {band.chip}
              </Text>
            </View>
          );
        })}
      </View>
      {read.count === 0 ? (
        <Text style={styles.muted}>No sectors won</Text>
      ) : (
        WIN_BANDS.map((band) => {
          const rows = emphasize === band.id ? read.bands[band.id] : preview[band.id];
          if (rows.length === 0) return null;
          return (
            <View key={band.id} style={styles.bandBlock}>
              <View style={styles.bandHead}>
                <View style={[styles.bandMark, bandPaint(band.id).mark]} />
                <Text style={styles.bandTitle}>{band.title}</Text>
              </View>
              {rows.map((row) => {
                const scores = ownScore(row, side);
                return (
                  <SectorFact
                    key={row.id}
                    label={row.label}
                    aside={`+${fmt(row.margin)}`}
                    note={`${fmt(scores.own)} over ${fmt(scores.other)}`}
                    band={band.id}
                    picked={emphasize === band.id}
                  />
                );
              })}
            </View>
          );
        })
      )}
      {overflow ? (
        <Pressable
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`Show more sectors won by ${name}`}
          style={styles.moreBtn}>
          <Text style={styles.showMore}>Show more</Text>
        </Pressable>
      ) : null}
      <SectorModal
        visible={open}
        title={name}
        subtitle={`${read.count} sectors won`}
        onClose={() => setOpen(false)}>
        {WIN_BANDS.map((band) => (
          <View key={band.id} style={styles.modalBand}>
            <View style={styles.bandHead}>
              <View style={[styles.bandMark, bandPaint(band.id).mark]} />
              <Text style={styles.bandTitle}>{band.title}</Text>
              <Text style={[styles.bandCount, bandPaint(band.id).text]}>{read.bands[band.id].length}</Text>
            </View>
            {read.bands[band.id].length === 0 ? (
              <Text style={styles.muted}>None</Text>
            ) : (
              read.bands[band.id].map((row) => {
                const scores = ownScore(row, side);
                return (
                  <SectorFact
                    key={row.id}
                    label={row.label}
                    aside={`+${fmt(row.margin)}`}
                    note={`${fmt(scores.own)} over ${fmt(scores.other)}`}
                    band={band.id}
                  />
                );
              })
            )}
          </View>
        ))}
      </SectorModal>
    </View>
  );
}

function WonSectors({
  t1Name,
  t2Name,
  wins,
  only,
  highlight,
}: {
  t1Name: string;
  t2Name: string;
  wins: PowerDynamicsCalculation['calc3'];
  only?: 't2';
  highlight?: { side: 't1' | 't2'; band: MarginBandId } | null;
}) {
  const lead = (
    <Text style={styles.detail}>
      The higher number wins the sector. The gap is 6 or more, 4 to 5.9, or less than 4.
    </Text>
  );
  if (only === 't2') {
    const count = wins.t2.count;
    return (
      <View>
        {lead}
        <Text style={styles.calcCall}>
          {t2Name} won {count} {count === 1 ? 'sector' : 'sectors'}.
        </Text>
        <SideWon name={t2Name} read={wins.t2} side="t2" emphasize={highlight?.side === 't2' ? highlight.band : undefined} />
      </View>
    );
  }
  return (
    <View>
      {lead}
      <Text style={styles.calcCall}>{wonCall(t1Name, t2Name, wins.t1, wins.t2)}</Text>
      <View style={styles.hitGrid}>
        <SideWon name={t1Name} read={wins.t1} side="t1" emphasize={highlight?.side === 't1' ? highlight.band : undefined} />
        <SideWon name={t2Name} read={wins.t2} side="t2" emphasize={highlight?.side === 't2' ? highlight.band : undefined} />
      </View>
    </View>
  );
}

function ValueCell({ value, hit }: { value: number | null; hit: boolean }) {
  return (
    <Text style={[styles.value, hit && styles.valueHit]}>{fmt(value)}</Text>
  );
}

function SectorRow({ row, picked }: { row: CalculationSector; picked?: boolean }) {
  return (
    <View style={[styles.sector, picked && styles.picked]}>
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

function TickRow({ row, picked }: { row: CalculationTick; picked?: boolean }) {
  return (
    <View style={[styles.sector, picked && styles.picked]}>
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

function aspectBase(aspectId: string | undefined): string {
  return (aspectId ?? '').replace(/::(tick|wrong)$/, '');
}

function sectorIdFromAspect(base: string): string | null {
  const match = base.match(/^sector-(.+)-(?:t1-hit|t2-hit|t1|t2|level)$/);
  return match?.[1] ?? null;
}

function tickIdFromAspect(base: string): string | null {
  const match = base.match(/^tick-(.+)-(?:t1|t2)$/);
  return match?.[1] ?? null;
}

function bandFromAspect(base: string): { side: 't1' | 't2'; band: MarginBandId } | null {
  const match = base.match(/^calc3-(t1|t2)-(high|mid|low)$/);
  if (!match) return null;
  return { side: match[1] as 't1' | 't2', band: match[2] as MarginBandId };
}

function CallVerdict({ aspectId, calc }: { aspectId: string; calc: PowerDynamicsCalculation }) {
  const verdict = scoreCalculationRead(aspectId, calc);
  if (!verdict) return null;
  const holds = verdict.percent > 0;
  return (
    <View style={[styles.callout, holds ? styles.calloutOn : styles.calloutOff]}>
      <Text style={styles.calloutTitle}>{holds ? 'This call holds' : 'This call does not hold'}</Text>
      <Text style={styles.calcCall}>{verdict.reason}</Text>
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
  const focusId = props.focus?.functionId;
  const base = aspectBase(props.focus?.aspectId);

  if (focusId) {
    const pickedSector = sectorIdFromAspect(base);
    const pickedTick = tickIdFromAspect(base);
    const pickedBand = bandFromAspect(base);
    const groupRows =
      focusId === 'core' ? [...core, ...yInCore] : focusId === 'semi' ? semi : focusId === 'y' ? calc.sectors.filter((row) => row.group === 'y') : [];
    const shownSectors = pickedSector ? groupRows.filter((row) => row.id === pickedSector) : groupRows;
    const shownTicks = pickedTick ? calc.ticks.filter((row) => row.id === pickedTick) : calc.ticks;
    const group = focusId === 'core' || focusId === 'semi' || focusId === 'y' ? GROUP_COPY[focusId] : null;
    return (
      <View>
        {props.focus?.aspectId ? <CallVerdict aspectId={props.focus.aspectId} calc={calc} /> : null}
        {focusId === 'calc1' ? (
          <View style={styles.calcCard}>
            <Text style={styles.calcKicker}>Calculation 1</Text>
            <Text style={styles.calcTitle}>Sectors of {SECTOR_HIT} or more</Text>
            <Text style={styles.calcCall}>{leaderLine(calc, t1, t2)}</Text>
            <View style={styles.hitGrid}>
              <HitList label={t1} rows={calc.calc1.t1} />
              <HitList label={t2} rows={calc.calc1.t2} />
            </View>
          </View>
        ) : null}
        {focusId === 'calc2' ? (
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
        ) : null}
        {focusId === 'calc3' ? (
          <View style={styles.calcCard}>
            <Text style={styles.calcKicker}>Calculation 3</Text>
            <Text style={styles.calcTitle}>Sectors won</Text>
            <WonSectors t1Name={t1} t2Name={t2} wins={calc.calc3} highlight={pickedBand} />
          </View>
        ) : null}
        {group ? (
          <Section title={group.title} note={group.note}>
            {shownSectors.map((row) => (
              <SectorRow key={row.id} row={row} picked={row.id === pickedSector} />
            ))}
          </Section>
        ) : null}
        {focusId === 'ticks' ? (
          <Section title="Ticks" note="A tick means the side falls under that sector. Ticks are not added into the totals.">
            {shownTicks.map((row) => (
              <TickRow key={row.id} row={row} picked={row.id === pickedTick} />
            ))}
          </Section>
        ) : null}
      </View>
    );
  }

  return (
    <View>
      <Text style={styles.intro}>
        {t1} against {t2}. Calculation 1 lists a sector of {SECTOR_HIT} or more. Totals add every numbered sector. Calculations 1 and 2 show the sectors each side won. Calculation 3 shows the sectors {t2} won. The gap is 6 or more, 4 to 5.9, or less than 4. Ticks stay out of the totals.
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
        <Text style={styles.blockLabel}>Sectors won</Text>
        <WonSectors t1Name={t1} t2Name={t2} wins={calc.calc3} />
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
        <Text style={styles.blockLabel}>Sectors won</Text>
        <WonSectors t1Name={t1} t2Name={t2} wins={calc.calc3} />
      </View>

      <View style={styles.calcCard}>
        <Text style={styles.calcKicker}>Calculation 3 · Apples v oranges</Text>
        <Text style={styles.calcTitle}>Sectors {t2} won</Text>
        <WonSectors t1Name={t1} t2Name={t2} wins={calc.calc3} only="t2" />
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
  callout: {
    borderWidth: layout.borderWidth,
    borderRadius: layout.borderRadius,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  calloutOn: {
    borderColor: theme.accentGreen,
    backgroundColor: 'rgba(5, 150, 105, 0.08)',
  },
  calloutOff: {
    borderColor: theme.loss,
    backgroundColor: 'rgba(220, 38, 38, 0.08)',
  },
  calloutTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: theme.textPrimary,
    marginBottom: 2,
  },
  picked: {
    borderColor: theme.accentGreen,
    backgroundColor: 'rgba(5, 150, 105, 0.08)',
  },
  factPicked: {
    borderWidth: layout.borderWidth,
    borderColor: theme.accentGreen,
  },
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
  hitGrid: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  hitCol: {
    flex: 1,
    minWidth: 0,
    gap: 6,
    backgroundColor: theme.surfaceHover,
    borderRadius: layout.borderRadius,
    padding: spacing.sm,
  },
  hitLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: theme.textMuted,
  },
  hitCount: {
    fontFamily: fonts.display,
    fontSize: 32,
    lineHeight: 36,
    color: theme.textPrimary,
  },
  fact: {
    borderLeftWidth: 3,
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginTop: 4,
  },
  factTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  factName: {
    flex: 1,
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    lineHeight: 17,
    color: theme.textPrimary,
  },
  factAside: {
    fontFamily: fonts.displaySemi,
    fontSize: 16,
    lineHeight: 18,
  },
  factNote: {
    fontFamily: fonts.body,
    fontSize: 11,
    lineHeight: 15,
    color: theme.textMuted,
    marginTop: 2,
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
  blockLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: theme.textPrimary,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  winBox: {
    flex: 1,
    minWidth: 0,
    backgroundColor: theme.surfaceHover,
    borderRadius: layout.borderRadius,
    padding: spacing.sm,
  },
  winCaption: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: theme.textMuted,
    marginTop: -2,
  },
  pillRow: {
    flexDirection: 'row',
    gap: 4,
    marginTop: spacing.sm,
  },
  pill: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 2,
  },
  pillCount: {
    fontFamily: fonts.displaySemi,
    fontSize: 16,
    lineHeight: 18,
  },
  pillLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    lineHeight: 13,
    textAlign: 'center',
  },
  pillHigh: { backgroundColor: '#D1FAE5' },
  pillMid: { backgroundColor: '#FEF3C7' },
  pillLow: { backgroundColor: '#E2E8F0' },
  bandHigh: { color: '#047857' },
  bandMid: { color: '#A16207' },
  bandLow: { color: '#475569' },
  bandFillHigh: { backgroundColor: '#ECFDF5', borderLeftColor: '#059669' },
  bandFillMid: { backgroundColor: '#FFFBEB', borderLeftColor: '#CA8A04' },
  bandFillLow: { backgroundColor: theme.surface, borderLeftColor: '#94A3B8' },
  markHigh: { backgroundColor: '#059669' },
  markMid: { backgroundColor: '#CA8A04' },
  markLow: { backgroundColor: '#94A3B8' },
  bandBlock: { marginTop: spacing.sm },
  bandHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bandMark: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  bandTitle: {
    flex: 1,
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    lineHeight: 15,
    color: theme.textPrimary,
  },
  bandCount: {
    fontFamily: fonts.displaySemi,
    fontSize: 14,
    lineHeight: 16,
  },
  moreBtn: {
    marginTop: spacing.sm,
    borderWidth: layout.borderWidth,
    borderColor: theme.borderStrong,
    borderRadius: layout.borderRadius,
    backgroundColor: theme.surface,
    alignItems: 'center',
    paddingVertical: 8,
  },
  showMore: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: theme.accentBlue,
  },
  modalRoot: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalSheet: {
    maxHeight: '80%',
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
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
  modalTitles: { flex: 1 },
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
  modalList: { maxHeight: 420 },
  modalBand: { marginBottom: spacing.sm },
});
