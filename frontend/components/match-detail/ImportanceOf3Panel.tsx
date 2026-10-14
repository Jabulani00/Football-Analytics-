import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { SectorIntro } from '@/components/match-detail/PowerDynamicsSectors';
import type { SeasonMatch } from '@/utils/bhozomaEngine';
import {
  evaluateImportanceOf3,
  formatPositionList,
  PULL_FACTOR_LABEL,
  PULL_ROWS,
  type ImportanceOf3,
  type ImbangiFit,
  type PullFactorKind,
  type SingayeRead,
  type TargetBand,
  type TargetKind,
} from '@/utils/importanceOf3Engine';
import type { ImbangiScheduleMatch } from '@/utils/imbangiEngine';
import type { StandingLike } from '@/utils/motivationEngine';
import { fonts, layout, spacing, theme } from '@/styles/theme';

type Props = {
  standings: StandingLike[];
  t1Id: number | null | undefined;
  t2Id: number | null | undefined;
  t1Label: string;
  t2Label: string;
  competitionId?: number | string | null;
  seasonProgress?: number | null;
  matches?: SeasonMatch[];
  schedule?: ImbangiScheduleMatch[];
  imbangiLoading?: boolean;
};

type LedgerRow =
  | { kind: 'section'; label: string }
  | { kind: 'row'; label: string; a: string; b: string; aColor?: string; bColor?: string };

function signed(n: number): string {
  if (n > 0) return `+${n}`;
  return String(n);
}

function rate(points: number, played: number): string {
  if (played <= 0) return '—';
  return (points / played).toFixed(2);
}

function pullColor(kind: PullFactorKind): string {
  if (kind === 'take_over') return theme.accentGreen;
  if (kind === 'chaser') return theme.accentOrange;
  return theme.accentBlue;
}

function diffColor(diff: number | null): string | undefined {
  if (diff == null) return undefined;
  if (diff <= 0) return theme.accentGreen;
  if (diff <= 4) return theme.accentBlue;
  return theme.accentOrange;
}

function escapeColor(score: number): string {
  if (score === 10) return theme.accentGreen;
  if (score === 5) return theme.accentBlue;
  if (score === 4) return theme.yellow;
  return theme.textMuted;
}

function pick(read: SingayeRead | null, value: (row: SingayeRead) => string): string {
  return read ? value(read) : '—';
}

function verdictLabel(read: SingayeRead): string {
  if (read.takeover.verdict === 'take_over') return 'Take over';
  if (read.takeover.verdict === 'chaser') return 'Chaser';
  return 'Gebe widening';
}

function dethroneLabel(read: SingayeRead): string {
  if (read.dethrone.verdict === 'dethrone') return 'Dethrone';
  if (read.dethrone.verdict === 'comes_short') return 'Comes short';
  return '—';
}

const TARGET_TYPE: Record<TargetKind, string> = {
  number_1: 'Number 1',
  top_3: 'Top 3',
  cup: 'Cup qualification',
  relegation: 'Relegation',
};

const ESCAPE_TYPE: Record<0 | 4 | 5 | 10, string> = {
  0: 'Comes short, no target',
  5: 'Comes short, target motivation',
  4: 'Dethrone, no target',
  10: 'Dethrone, with target',
};

function specifyTarget(label: string, bands: TargetBand[] | null | undefined): string {
  const band = (bands ?? []).find((item) => item.label === label);
  if (!band) return label;
  const type = TARGET_TYPE[band.kind];
  return band.label === type ? type : `${type} · ${band.label}`;
}

function formatTargets(labels: string[] | null | undefined, bands: TargetBand[] | null | undefined): string {
  if (!labels || labels.length === 0) return '—';
  const list = bands ?? [];
  const seen = new Set<string>();
  const named = labels.map((label) => specifyTarget(label, list)).filter((label) => {
    if (seen.has(label)) return false;
    seen.add(label);
    return true;
  });
  return named.join(', ');
}

function relegationLabel(read: SingayeRead): string {
  if (read.escape.relegation === 'escaping') return 'Escaping relegation';
  if (read.escape.relegation === 'safety') return 'Relegation safety';
  if (read.escape.relegation === 'unknown') return 'Relegation unmapped';
  return 'Clear of relegation';
}

function escapeTypeLabel(read: SingayeRead): string {
  if (read.escape.score == null) return '—';
  return `${ESCAPE_TYPE[read.escape.score]} · ${read.escape.score}`;
}

function motivationLabel(read: SingayeRead, bands: TargetBand[]): string {
  if (!read.ahead || read.takeover.diff == null) return '—';
  if (read.takeover.motivated) return `Yes · ${formatTargets(read.takeover.aheadTargets, bands)}`;
  if (read.takeover.aheadTargets.length > 0) return `Gap ${signed(read.takeover.diff)} · ${formatTargets(read.takeover.aheadTargets, bands)}`;
  return 'No target above';
}

function imbangiLabel(fit: ImbangiFit | null): string {
  if (!fit) return '—';
  if (fit.pending) return `ΔP ${fit.pointsDiff}${fit.fits ? ' · in range' : ''}`;
  if (!fit.fits || fit.grade == null) return `ΔP ${fit.pointsDiff}`;
  return `${fit.grade} · ${fit.score ?? '—'} · ΔP ${fit.pointsDiff}`;
}

function reachLabel(read: SingayeRead): string {
  const offer = read.remaining * 3;
  if (!read.ahead) return `${offer} pts still available`;
  const need = Math.max(0, read.ahead.points - read.team.points);
  if (need === 0) return `${offer} pts still available`;
  return `Need ${need} · ${offer} still available`;
}

function reachColor(read: SingayeRead | null): string | undefined {
  if (!read?.ahead) return undefined;
  const need = read.ahead.points - read.team.points;
  if (need <= 0) return theme.accentGreen;
  return need <= read.remaining * 3 ? theme.accentBlue : theme.accentOrange;
}

function expressionTake(read: SingayeRead): string {
  if (!read.ahead || read.takeover.diff == null) return '—';
  return `${read.ahead.points} − (${read.team.points} + 3) = ${signed(read.takeover.diff)}`;
}

function expressionDeth(read: SingayeRead): string {
  if (!read.tail || read.dethrone.diff == null) return '—';
  return `${read.team.points} − (${read.tail.points} + 3) = ${signed(read.dethrone.diff)}`;
}

function neighbourName(team: StandingLike | null, otherId: number | null | undefined, otherSlot: 1 | 2): string {
  if (!team) return '—';
  return team.teamId === otherId ? `${team.name} · S${otherSlot}` : team.name;
}

function buildLedger(
  a: SingayeRead | null,
  b: SingayeRead | null,
  aLabel: string,
  bLabel: string,
  aOther: number | null | undefined,
  bOther: number | null | undefined,
  bands: TargetBand[],
): LedgerRow[] {
  const line = (
    label: string,
    value: (read: SingayeRead) => string,
    color?: (read: SingayeRead) => string | undefined,
  ): LedgerRow => ({
    kind: 'row',
    label,
    a: pick(a, value),
    b: pick(b, value),
    aColor: a && color ? color(a) : undefined,
    bColor: b && color ? color(b) : undefined,
  });

  return [
    { kind: 'section', label: 'Side' },
    line('Name', (read) => (read.slot === 1 ? aLabel : bLabel)),
    line('Place', (read) => `#${read.team.rank}`),
    line('Played', (read) => String(read.team.played)),
    line('Points', (read) => String(read.team.points)),
    line('Points after a win', (read) => String(read.team.points + 3), () => theme.accentGreen),
    line('PPG', (read) => rate(read.team.points, read.team.played)),
    line('PPG after a win', (read) => rate(read.team.points + 3, read.team.played + 1)),
    line('Targets held', (read) => formatTargets(read.targetsHeld, bands)),
    line('Games remaining', (read) => String(read.remaining)),
    line('Points still available', (read) => String(read.remaining * 3)),
    line('Reach to Ahead', reachLabel, (read) => reachColor(read)),
    line('Pull factor', (read) => `${read.pull.type} · equals ${read.pull.equals}`, (read) => pullColor(read.pull.kind)),

    { kind: 'section', label: 'Ahead — take over' },
    line('Ahead', (read) => neighbourName(read.ahead, read.slot === 1 ? aOther : bOther, read.slot === 1 ? 2 : 1)),
    line('Ahead place / pts', (read) => (read.ahead ? `#${read.ahead.rank} · ${read.ahead.points}` : '—')),
    line('Ahead targets', (read) => formatTargets(read.takeover.aheadTargets, bands)),
    line('Gap now', (read) => (read.ahead ? signed(read.ahead.points - read.team.points) : '—'), (read) => diffColor(read.ahead ? read.ahead.points - read.team.points : null)),
    line('Sum', expressionTake),
    line('Difference', (read) => (read.takeover.diff == null ? '—' : signed(read.takeover.diff)), (read) => diffColor(read.takeover.diff)),
    line('Call', verdictLabel, (read) => pullColor(read.takeover.verdict === 'none' ? 'gebe_widening' : read.takeover.verdict)),
    line('Motivation ≤ 4', (read) => motivationLabel(read, bands), (read) => (read.takeover.motivated ? theme.accentGreen : undefined)),

    { kind: 'section', label: 'Tail — dethrone' },
    line('Tail', (read) => neighbourName(read.tail, read.slot === 1 ? aOther : bOther, read.slot === 1 ? 2 : 1)),
    line('Tail place / pts', (read) => (read.tail ? `#${read.tail.rank} · ${read.tail.points}` : '—')),
    line('Tail targets', (read) => formatTargets(read.dethrone.tailTargets, bands)),
    line('Gap now', (read) => (read.pull.gapNow == null ? '—' : signed(read.pull.gapNow))),
    line('Sum', expressionDeth),
    line('Difference', (read) => (read.dethrone.diff == null ? '—' : signed(read.dethrone.diff)), (read) => diffColor(read.dethrone.diff)),
    line('Call', dethroneLabel, (read) => (read.dethrone.verdict === 'dethrone' ? theme.loss : read.dethrone.verdict === 'comes_short' ? theme.accentOrange : undefined)),
    line('Target in the fight', (read) => (read.tail ? (read.dethrone.targetInFight ? 'Yes' : 'No') : '—'), (read) => (read.dethrone.targetInFight ? theme.accentBlue : undefined)),
    line('Motivation to dethrone', (read) => (read.tail ? (read.dethrone.motivated ? 'Yes' : 'No') : '—'), (read) => (read.dethrone.motivated ? theme.accentGreen : undefined)),

    { kind: 'section', label: 'Escape' },
    line('Escape type', escapeTypeLabel, (read) => (read.escape.score == null ? undefined : escapeColor(read.escape.score))),
    line('Relegation escape', relegationLabel, (read) => (read.escape.relegation === 'escaping' ? theme.loss : read.escape.relegation === 'safety' ? theme.accentBlue : undefined)),
    line('Drop line', (read) => (read.escape.relegationLine == null ? '—' : `#${read.escape.relegationLine}`)),

    { kind: 'section', label: 'Gebe widening' },
    line('Gap to Tail', (read) => (read.pull.gapNow == null ? '—' : String(read.pull.gapNow))),
    line('Gap after a win', (read) => (read.pull.gapAfterWin == null ? '—' : String(read.pull.gapAfterWin)), () => theme.accentBlue),
    line('Added by the win', (read) => (read.pull.gapNow == null ? '—' : '+3')),
    line('Protecting a place', (read) => (read.tail ? (read.pull.widenMotivation ? 'Yes' : 'No') : '—'), (read) => (read.pull.widenMotivation ? theme.accentBlue : undefined)),

    { kind: 'section', label: 'Imbangi' },
    line('Vs Ahead', (read) => imbangiLabel(read.imbangiAhead), (read) => (read.imbangiAhead?.fits ? theme.accentOrange : undefined)),
    line('Vs Tail', (read) => imbangiLabel(read.imbangiTail), (read) => (read.imbangiTail?.fits ? theme.accentOrange : undefined)),
  ];
}

function Ledger({ rows }: { rows: LedgerRow[] }) {
  return (
    <View style={styles.card}>
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View style={styles.ledgerSheet}>
      <View style={styles.ledgerHead}>
        <Text style={[styles.ledgerLabel, styles.ledgerHeadText]}>Figure</Text>
        <Text style={[styles.ledgerValue, styles.ledgerHeadText]}>Singaye 1</Text>
        <Text style={[styles.ledgerValue, styles.ledgerHeadText]}>Singaye 2</Text>
      </View>
      {rows.map((row, index) =>
        row.kind === 'section' ? (
          <View key={`s-${row.label}`} style={styles.sectionBar}>
            <Text style={styles.section}>{row.label}</Text>
          </View>
        ) : (
          <View key={`${row.label}-${index}`} style={styles.ledgerRow}>
            <Text style={styles.ledgerLabel}>{row.label}</Text>
            <Text style={[styles.ledgerValue, row.aColor ? { color: row.aColor } : null]}>{row.a}</Text>
            <Text style={[styles.ledgerValue, row.bColor ? { color: row.bColor } : null]}>{row.b}</Text>
          </View>
        ),
      )}
        </View>
      </ScrollView>
    </View>
  );
}

const ESCAPE_CELLS: { verdict: 'comes_short' | 'dethrone'; related: boolean; score: 0 | 4 | 5 | 10; row: string }[] = [
  { verdict: 'comes_short', related: false, score: 0, row: 'Comes short' },
  { verdict: 'comes_short', related: true, score: 5, row: 'Comes short' },
  { verdict: 'dethrone', related: false, score: 4, row: 'Dethrone' },
  { verdict: 'dethrone', related: true, score: 10, row: 'Dethrone' },
];

function hitsCell(read: SingayeRead | null, cell: (typeof ESCAPE_CELLS)[number]): boolean {
  if (!read || read.dethrone.verdict === 'none') return false;
  return read.dethrone.verdict === cell.verdict && read.dethrone.motivated === cell.related;
}

function EscapeMatrix({ a, b }: { a: SingayeRead | null; b: SingayeRead | null }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Escape element</Text>
      <View style={styles.matrixHead}>
        <Text style={styles.matrixCorner} />
        <Text style={styles.matrixCol}>No target</Text>
        <Text style={styles.matrixCol}>Target in play</Text>
      </View>
      {['Comes short', 'Dethrone'].map((rowName) => (
        <View key={rowName} style={styles.matrixRow}>
          <Text style={styles.matrixCorner}>{rowName}</Text>
          {ESCAPE_CELLS.filter((cell) => cell.row === rowName).map((cell) => {
            const marks = [hitsCell(a, cell) ? 'S1' : null, hitsCell(b, cell) ? 'S2' : null].filter(Boolean);
            const live = marks.length > 0;
            return (
              <View key={cell.score} style={[styles.matrixCell, live && { borderColor: escapeColor(cell.score) }]}>
                <Text style={[styles.matrixScore, { color: escapeColor(cell.score) }]}>{cell.score}</Text>
                <Text style={styles.matrixType}>{ESCAPE_TYPE[cell.score]}</Text>
                <Text style={styles.matrixMark}>{marks.length > 0 ? marks.join(' · ') : ' '}</Text>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function PullSide({ read, mark }: { read: SingayeRead | null; mark: string }) {
  if (!read?.pull) {
    return (
      <View style={styles.pullSide}>
        <Text style={styles.pullName}>{mark}</Text>
        <Text style={styles.muted}>Not on this table.</Text>
      </View>
    );
  }
  return (
    <View style={[styles.pullSide, { borderColor: pullColor(read.pull.kind) }]}>
      <Text style={styles.pullName}>{mark}</Text>
      <Text style={[styles.pullKind, { color: pullColor(read.pull.kind) }]}>{read.pull.type}</Text>
      <Text style={styles.pullEquals}>{read.pull.equals}</Text>
      <Text style={styles.pullDetail}>Equals {read.pull.equals}</Text>
      <Text style={styles.pullDetail}>{read.pull.detail}</Text>
    </View>
  );
}

function pullPoints(read: SingayeRead | null) {
  const points = read?.pull?.points;
  return Array.isArray(points) ? points : [];
}

function PullScale({
  kind,
  a,
  b,
}: {
  kind: PullFactorKind;
  a: SingayeRead | null;
  b: SingayeRead | null;
}) {
  const rows = Array.isArray(PULL_ROWS) ? PULL_ROWS : [];
  return (
    <View style={styles.scaleBlock}>
      <Text style={styles.scaleTitle}>{PULL_FACTOR_LABEL[kind]}</Text>
      <View style={styles.scaleHead}>
        <Text style={[styles.scaleKind, styles.scaleHeadText]}>Kind</Text>
        <Text style={[styles.scaleDetail, styles.scaleHeadText]}>Points</Text>
        <Text style={[styles.scaleEquals, styles.scaleHeadText]}>Equals</Text>
        <Text style={[styles.scaleWho, styles.scaleHeadText]}>Side</Text>
      </View>
      {rows.map((row) => {
        const marks = [
          a?.pull?.kind === kind && a.pull.index === row.index ? 'S1' : null,
          b?.pull?.kind === kind && b.pull.index === row.index ? 'S2' : null,
        ].filter(Boolean);
        const live = marks.length > 0;
        return (
          <View key={`${kind}-${row.index}`} style={[styles.scaleRow, live && styles.scaleRowLive]}>
            <Text style={styles.scaleKind}>
              {PULL_FACTOR_LABEL[kind]} {row.index}
            </Text>
            <Text style={styles.scaleDetail}>{row.detail}</Text>
            <Text style={[styles.scaleEquals, live && { color: pullColor(kind) }]}>{row.equals}</Text>
            <Text style={styles.scaleWho}>{marks.length > 0 ? marks.join(' · ') : ''}</Text>
          </View>
        );
      })}
    </View>
  );
}

function PullBoard({ a, b }: { a: SingayeRead | null; b: SingayeRead | null }) {
  const kinds = (['take_over', 'chaser', 'gebe_widening'] as const).filter(
    (kind) => a?.pull?.kind === kind || b?.pull?.kind === kind,
  );
  const leftPoints = pullPoints(a);
  const rightPoints = pullPoints(b);
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Pull factor</Text>
      <View style={styles.kindRow}>
        <PullSide read={a} mark="Singaye 1" />
        <PullSide read={b} mark="Singaye 2" />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator>
      <View style={styles.pullSheet}>
      <View style={styles.scaleHead}>
        <Text style={[styles.pointName, styles.scaleHeadText]}>Point</Text>
        <Text style={[styles.pointNum, styles.scaleHeadText]}>S1 number</Text>
        <Text style={[styles.pointRead, styles.scaleHeadText]}>S1 reading</Text>
        <Text style={[styles.pointEq, styles.scaleHeadText]}>Equals</Text>
        <Text style={[styles.pointNum, styles.scaleHeadText]}>S2 number</Text>
        <Text style={[styles.pointRead, styles.scaleHeadText]}>S2 reading</Text>
        <Text style={[styles.pointEq, styles.scaleHeadText]}>Equals</Text>
      </View>
      {['target', 'imbangi', 'games'].map((id) => {
        const left = leftPoints.find((point) => point.id === id);
        const right = rightPoints.find((point) => point.id === id);
        return (
          <View key={id} style={styles.scaleRow}>
            <Text style={styles.pointName}>{left?.point ?? right?.point ?? id}</Text>
            <Text style={styles.pointNum}>{left?.numberText ?? '—'}</Text>
            <Text style={styles.pointRead}>{left?.reading ?? '—'}</Text>
            <Text style={styles.pointEq}>{left?.equalsText ?? '—'}</Text>
            <Text style={styles.pointNum}>{right?.numberText ?? '—'}</Text>
            <Text style={styles.pointRead}>{right?.reading ?? '—'}</Text>
            <Text style={styles.pointEq}>{right?.equalsText ?? '—'}</Text>
          </View>
        );
      })}
      {kinds.map((kind) => (
        <PullScale key={kind} kind={kind} a={a} b={b} />
      ))}
      </View>
      </ScrollView>
    </View>
  );
}

function Ladder({ read, title }: { read: SingayeRead | null; title: string }) {
  if (!read) {
    return (
      <View style={styles.ladderCard}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.muted}>Not on this league table.</Text>
      </View>
    );
  }
  const rows = [
    read.ahead ? { role: `Ahead ${read.slot}`, team: read.ahead, projected: read.ahead.points, tone: theme.accentBlue } : null,
    { role: `Singaye ${read.slot}`, team: read.team, projected: read.team.points + 3, tone: theme.accentGreen },
    read.tail ? { role: `Tail ${read.slot}`, team: read.tail, projected: read.tail.points, tone: theme.accentOrange } : null,
  ].filter((row): row is { role: string; team: StandingLike; projected: number; tone: string } => row != null);
  const max = Math.max(...rows.map((row) => Math.max(row.team.points, row.projected)), 1);

  return (
    <View style={styles.ladderCard}>
      <Text style={styles.cardTitle}>{title}</Text>
      {rows.map((row) => (
        <View key={row.role} style={styles.ladderRow}>
          <View style={styles.ladderMeta}>
            <Text style={styles.ladderRole}>{row.role}</Text>
            <Text style={styles.ladderTeam} numberOfLines={1}>
              #{row.team.rank} {row.team.name}
            </Text>
          </View>
          <View style={styles.ladderBars}>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${(row.team.points / max) * 100}%`, backgroundColor: row.tone }]} />
            </View>
            {row.projected !== row.team.points ? (
              <View style={styles.track}>
                <View style={[styles.fill, styles.fillGhost, { width: `${(row.projected / max) * 100}%` }]} />
              </View>
            ) : null}
          </View>
          <Text style={styles.ladderPts}>
            {row.team.points}
            {row.projected !== row.team.points ? ` → ${row.projected}` : ''}
          </Text>
        </View>
      ))}
      <Text style={styles.legend}>Solid bar is points now. Pale bar is Singaye after +3.</Text>
    </View>
  );
}

function kindRank(kind: TargetKind): number {
  if (kind === 'relegation') return 4;
  if (kind === 'cup') return 3;
  if (kind === 'top_3') return 2;
  return 1;
}

function bandAt(report: ImportanceOf3, rank: number): TargetKind | 'safety' | null {
  if (report.relegationLine != null && rank === report.relegationLine - 1) {
    const prize = report.targets.some((band) => band.kind !== 'relegation' && band.positions.includes(rank));
    if (!prize) return 'safety';
  }
  let best: TargetKind | null = null;
  for (const band of report.targets) {
    if (!band.positions.includes(rank)) continue;
    if (best == null || kindRank(band.kind) > kindRank(best)) best = band.kind;
  }
  return best;
}

function railTint(kind: TargetKind | 'safety' | null): string | undefined {
  if (kind === 'relegation') return 'rgba(234, 88, 12, 0.16)';
  if (kind === 'safety') return 'rgba(37, 99, 235, 0.12)';
  if (kind === 'cup' || kind === 'top_3' || kind === 'number_1') return 'rgba(5, 150, 105, 0.12)';
  return undefined;
}

function PositionRail({
  standings,
  report,
}: {
  standings: StandingLike[];
  report: ImportanceOf3;
}) {
  const tags = new Map<number, string[]>();
  const add = (team: StandingLike | null | undefined, code: string) => {
    if (!team) return;
    const list = tags.get(team.rank) ?? [];
    if (!list.includes(code)) list.push(code);
    tags.set(team.rank, list);
  };
  add(report.singaye1?.team, 'S1');
  add(report.singaye1?.ahead, 'A1');
  add(report.singaye1?.tail, 'T1');
  add(report.singaye2?.team, 'S2');
  add(report.singaye2?.ahead, 'A2');
  add(report.singaye2?.tail, 'T2');

  const sorted = [...standings].sort((a, b) => a.rank - b.rank);
  const cols = sorted.length < 10 ? Math.max(sorted.length, 1) : 10;

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Table positions</Text>
      <View style={styles.rail}>
        {sorted.map((team) => {
          const kind = bandAt(report, team.rank);
          const mark = tags.get(team.rank) ?? [];
          return (
            <View key={team.teamId} style={[styles.railCell, { width: `${100 / cols}%` }]}>
              <View style={[styles.railBox, { backgroundColor: railTint(kind) ?? theme.surface }, mark.length > 0 && styles.railBoxLive]}>
                <Text style={styles.railPos}>{team.rank}</Text>
                <Text style={styles.railTag} numberOfLines={1}>
                  {mark.join(' ')}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
      <Text style={styles.legend}>S Singaye · A Ahead · T Tail. Green: number 1, top 3, cup qualification. Orange: relegation. Blue: relegation safety.</Text>
      <View style={styles.targetHead}>
        <Text style={[styles.targetType, styles.targetHeadText]}>Type</Text>
        <Text style={[styles.targetName, styles.targetHeadText]}>Target</Text>
        <Text style={[styles.targetPlaces, styles.targetHeadText]}>Places</Text>
        <Text style={[styles.targetTeams, styles.targetHeadText]}>Teams</Text>
      </View>
      {(report.targets ?? []).map((band) => {
        const names = sorted
          .filter((team) => band.positions.includes(team.rank))
          .map((team) => {
            const mark = tags.get(team.rank);
            return mark && mark.length > 0 ? `${team.name} (${mark.join(', ')})` : team.name;
          });
        return (
          <View key={`${band.kind}-${band.label}`} style={styles.targetRow}>
            <Text style={styles.targetType}>{TARGET_TYPE[band.kind]}</Text>
            <Text style={styles.targetName}>{band.label}</Text>
            <Text style={styles.targetPlaces}>{formatPositionList(band.positions)}</Text>
            <Text style={styles.targetTeams}>{names.length > 0 ? names.join(' · ') : '—'}</Text>
          </View>
        );
      })}
    </View>
  );
}

const RULES: { rule: string; line: string }[] = [
  { rule: 'Take over', line: 'Ahead − (Singaye + 3) ≤ 0' },
  { rule: 'Chaser', line: 'Ahead − (Singaye + 3) > 0' },
  { rule: 'Dethrone', line: 'Singaye − (Tail + 3) ≤ 0' },
  { rule: 'Comes short', line: 'Singaye − (Tail + 3) > 0' },
  { rule: 'Motivation', line: 'Difference ≤ 4, and a target position is in the fight' },
  { rule: 'Comes short, no target', line: 'Escape element 0' },
  { rule: 'Comes short, target motivation', line: 'Escape element 5' },
  { rule: 'Dethrone, no target', line: 'Escape element 4' },
  { rule: 'Dethrone, with target', line: 'Escape element 10' },
  { rule: 'Escaping relegation', line: 'Singaye is in a relegation spot' },
  { rule: 'Relegation safety', line: 'One place above the relegation line' },
  { rule: 'Gebe widening', line: 'Gap to Tail, then the same gap after +3' },
  { rule: 'Imbangi', line: 'ΔP ≤ 4 · A 10 · B 8 · C 6' },
];

function RuleTable() {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Rules</Text>
      {RULES.map((rule) => (
        <View key={rule.rule} style={styles.ruleRow}>
          <Text style={styles.ruleName}>{rule.rule}</Text>
          <Text style={styles.ruleLine}>{rule.line}</Text>
        </View>
      ))}
    </View>
  );
}

export default function ImportanceOf3Panel({
  standings,
  t1Id,
  t2Id,
  t1Label,
  t2Label,
  competitionId,
  seasonProgress,
  matches,
  schedule,
  imbangiLoading,
}: Props) {
  if (standings.length === 0 || (t1Id == null && t2Id == null)) {
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Importance of 3 points</Text>
        <Text style={styles.muted}>The league table is needed before Singaye, Ahead, and Tail can be read.</Text>
      </View>
    );
  }

  const report = evaluateImportanceOf3({
    table: standings,
    t1Id,
    t2Id,
    competitionId,
    seasonProgress,
    matches,
    schedule,
    formReady: !imbangiLoading,
  });

  const rows = buildLedger(report.singaye1, report.singaye2, t1Label, t2Label, t2Id, t1Id, report.targets);

  return (
    <View>
      <SectorIntro
        title="Importance of 3 points"
        preserveCase
        note="Singaye 1 is T1. Singaye 2 is T2. Ahead is the row above. Tail is the row below. The win is +3."
      />
      <Ledger rows={rows} />
      <View style={styles.split}>
        <Ladder read={report.singaye1} title="Ladder · Singaye 1" />
        <Ladder read={report.singaye2} title="Ladder · Singaye 2" />
      </View>
      <EscapeMatrix a={report.singaye1} b={report.singaye2} />
      <PullBoard a={report.singaye1} b={report.singaye2} />
      <PositionRail standings={standings} report={report} />
      <RuleTable />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.surface,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  cardTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 16,
    color: theme.textPrimary,
    marginBottom: spacing.xs,
  },
  muted: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: theme.textMuted,
    lineHeight: 18,
  },
  legend: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: theme.textPrimary,
    lineHeight: 16,
    marginTop: spacing.xs,
  },
  ledgerSheet: {
    minWidth: 560,
  },
  ledgerHead: {
    flexDirection: 'row',
    borderBottomWidth: layout.borderWidth,
    borderBottomColor: theme.border,
    paddingBottom: 4,
  },
  ledgerHeadText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: theme.textPrimary,
  },
  ledgerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 4,
    borderBottomWidth: layout.borderWidth,
    borderBottomColor: theme.border,
  },
  ledgerLabel: {
    flex: 1.15,
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: theme.textPrimary,
    lineHeight: 16,
    paddingRight: 6,
  },
  ledgerValue: {
    flex: 1,
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: theme.textPrimary,
    lineHeight: 16,
    paddingRight: 4,
  },
  sectionBar: {
    backgroundColor: theme.surfaceMuted,
    borderLeftWidth: 3,
    borderLeftColor: theme.textPrimary,
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginTop: spacing.sm,
  },
  section: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: theme.textPrimary,
  },
  matrixHead: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  matrixRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  matrixCorner: {
    width: 92,
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: theme.textPrimary,
    paddingTop: 8,
    paddingRight: 6,
  },
  matrixCol: {
    flex: 1,
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: theme.textPrimary,
  },
  matrixCell: {
    flex: 1,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginRight: 4,
    backgroundColor: theme.surfaceHover,
  },
  matrixScore: {
    fontFamily: fonts.displaySemi,
    fontSize: 22,
    lineHeight: 24,
  },
  matrixType: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: theme.textPrimary,
    lineHeight: 16,
    marginTop: 2,
  },
  matrixMark: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    color: theme.textPrimary,
    marginTop: 2,
  },
  pullSheet: {
    minWidth: 720,
  },
  kindRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  pullSide: {
    flex: 1,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    padding: spacing.sm,
    backgroundColor: theme.surfaceHover,
  },
  pullName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: theme.textPrimary,
  },
  pullKind: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 16,
    marginTop: 2,
  },
  pullEquals: {
    fontFamily: fonts.displaySemi,
    fontSize: 28,
    lineHeight: 32,
    color: theme.textPrimary,
    marginTop: 2,
  },
  pullDetail: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: theme.textPrimary,
    lineHeight: 16,
    marginTop: 2,
  },
  scaleBlock: {
    marginTop: spacing.sm,
  },
  scaleTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: theme.textPrimary,
    marginBottom: 4,
  },
  scaleHead: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 4,
    borderBottomWidth: layout.borderWidth,
    borderBottomColor: theme.borderStrong,
  },
  scaleHeadText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: theme.textPrimary,
  },
  scaleRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'flex-start',
    paddingVertical: 5,
    borderBottomWidth: layout.borderWidth,
    borderBottomColor: theme.border,
  },
  scaleRowLive: {
    backgroundColor: theme.surfaceMuted,
  },
  scaleKind: {
    width: 118,
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: theme.textPrimary,
    lineHeight: 16,
  },
  scaleDetail: {
    flex: 1,
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: theme.textPrimary,
    lineHeight: 16,
  },
  scaleEquals: {
    width: 36,
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: theme.textPrimary,
  },
  scaleWho: {
    width: 36,
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: theme.textPrimary,
  },
  pointName: {
    width: 118,
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: theme.textPrimary,
    lineHeight: 16,
  },
  pointNum: {
    width: 64,
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: theme.textPrimary,
    lineHeight: 16,
  },
  pointRead: {
    flex: 1,
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: theme.textPrimary,
    lineHeight: 16,
  },
  pointEq: {
    width: 42,
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: theme.textPrimary,
    lineHeight: 16,
  },
  split: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  ladderCard: {
    flexGrow: 1,
    flexBasis: 280,
    backgroundColor: theme.surface,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    padding: spacing.sm,
  },
  ladderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  ladderMeta: { width: 108 },
  ladderRole: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: theme.textPrimary,
  },
  ladderTeam: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: theme.textPrimary,
  },
  ladderBars: { flex: 1, gap: 3 },
  ladderPts: {
    width: 52,
    textAlign: 'right',
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: theme.textPrimary,
  },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.surfaceMuted,
    overflow: 'hidden',
  },
  fill: {
    height: 6,
    borderRadius: 3,
  },
  fillGhost: {
    backgroundColor: 'rgba(5, 150, 105, 0.45)',
  },
  rail: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  railCell: {
    padding: 2,
  },
  railBox: {
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: 4,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
  },
  railBoxLive: {
    borderColor: theme.textPrimary,
  },
  railPos: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: theme.textPrimary,
  },
  railTag: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 8,
    color: theme.accentBlue,
    letterSpacing: 0.2,
  },
  targetHead: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: 6,
    marginTop: spacing.sm,
    borderBottomWidth: layout.borderWidth,
    borderBottomColor: theme.borderStrong,
  },
  targetHeadText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: theme.textPrimary,
  },
  targetRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: 6,
    borderBottomWidth: layout.borderWidth,
    borderBottomColor: theme.border,
  },
  targetType: {
    width: 130,
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: theme.textPrimary,
    lineHeight: 16,
  },
  targetName: {
    width: 140,
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: theme.textPrimary,
    lineHeight: 16,
  },
  targetPlaces: {
    width: 72,
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: theme.textPrimary,
    lineHeight: 16,
  },
  targetTeams: {
    flex: 1,
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: theme.textPrimary,
    lineHeight: 16,
  },
  ruleRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: 4,
    borderBottomWidth: layout.borderWidth,
    borderBottomColor: theme.border,
  },
  ruleName: {
    width: 108,
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: theme.textPrimary,
  },
  ruleLine: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textMuted,
    lineHeight: 16,
  },
});
