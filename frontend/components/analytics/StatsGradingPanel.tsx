import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useQueries } from '@tanstack/react-query';

import DragScroll from '@/components/shared/DragScroll';
import FilterDropdown from '@/components/shared/FilterDropdown';
import { useLiveCompetitionFeed } from '@/hooks/useLiveCompetitions';
import { useLiveFixtures } from '@/hooks/useLiveFixtures';
import { useLiveStatsTables } from '@/hooks/useLiveStatsTables';
import { fetchAllFixturesBetween, seasonWindowUnix } from '@/services/oddAlerts';
import { clientStaleTime } from '@/services/oddAlertsCachePolicy';
import { buildLeagueStatsLive } from '@/services/statsBuilder';
import {
  gradeAllTeamsForStat,
  sortRows,
  gradeDistribution,
  nextFixtureFor,
  indexRowsByTeam,
  lookupRow,
  GRADABLE_STATS,
  SOURCE_LISTS,
  sourceListById,
  DA_GRADES,
  BAND_UP,
  BAND_MID,
  type Grade,
  type TeamGradeRow,
  type RomanGrade,
  type SourceListId,
  type UpcomingLite,
} from '@/utils/statsGrading';
import { fonts, layout, spacing, theme } from '@/styles/theme';

type DirectionFilter = 'all' | 'strong' | 'weak';
const ALL = 'all';
const ROMANS: RomanGrade[] = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
const GRADE_LETTERS: Grade[] = ['A', 'B', 'C', 'D', 'E', 'F'];

function gradeColor(grade: Grade): string {
  if (grade === 'A' || grade === 'B') return theme.accentGreen;
  if (grade === 'C') return theme.yellow;
  return theme.loss;
}

function dirWord(value: number | null): string {
  if (value == null) return '—';
  if (value >= BAND_UP) return '↑ Up';
  if (value >= BAND_MID) return '(m) Mid';
  return '↓ Down';
}

function pct(value: number | null): string {
  return value == null ? '—' : `${Math.round(value)}%`;
}

function kickoffLabel(unix: number, fallback: string): string {
  if (!Number.isFinite(unix) || unix <= 0) return fallback;
  try {
    return new Date(unix * 1000).toLocaleString(undefined, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return fallback;
  }
}

export default function StatsGradingPanel() {
  const narrow = useWindowDimensions().width < 720;

  const feed = useLiveCompetitionFeed(3);
  // Leagues only — rank 0 is a domestic league; cups (1) and friendlies/youth (2) are excluded.
  const leagues = useMemo(() => feed.competitions.filter((c) => c.rank === 0), [feed.competitions]);

  // Selection: 'all' (every league combined) or a league id as a string. Default
  // to the first league so the page loads light; "All leagues" is one click away.
  const [selection, setSelection] = useState<string>('');
  useEffect(() => {
    if (leagues.length === 0) return;
    if (selection === '' || (selection !== ALL && !leagues.some((l) => String(l.id) === selection))) {
      setSelection(String(leagues[0].id));
    }
  }, [leagues, selection]);
  const allLeagues = selection === ALL;
  const singleId = allLeagues ? null : Number(selection);
  const activeComp = leagues.find((l) => l.id === singleId) ?? null;

  const [statKey, setStatKey] = useState('over25');
  const [sourceList, setSourceList] = useState<SourceListId>(1);
  const [direction, setDirection] = useState<DirectionFilter>('all');
  const [romanFilter, setRomanFilter] = useState<RomanGrade | 'all'>('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [showUngraded, setShowUngraded] = useState(false);

  // One league: the live export for that competition.
  const live = useLiveStatsTables({
    competitionId: allLeagues ? undefined : (singleId ?? undefined),
    seasonName: activeComp?.season,
  });

  // All leagues: one live build per league, combined.
  const allResults = useQueries({
    queries: (allLeagues ? leagues : []).map((comp) => {
      const { fromUnix, toUnix } = seasonWindowUnix(comp.season ?? '');
      return {
        queryKey: ['stats-grading-league', comp.id, comp.season] as const,
        queryFn: () =>
          buildLeagueStatsLive((o) => fetchAllFixturesBetween(o), {
            competitionId: comp.id,
            fromUnix,
            toUnix,
            season: comp.season,
          }),
        staleTime: clientStaleTime('stats/season'),
      };
    }),
  });
  const allSig = allResults.map((r, i) => (r.data ? `${leagues[i]?.id}:${r.dataUpdatedAt}` : '')).join('|');
  const settled = allResults.filter((r) => r.isSuccess || r.isError).length;

  const allRows = useMemo(() => {
    if (!allLeagues) {
      if (!live.data) return [];
      return sortRows(gradeAllTeamsForStat(live.data, sourceList, statKey, activeComp?.name ?? ''));
    }
    const combined: TeamGradeRow[] = [];
    allResults.forEach((r, i) => {
      const comp = leagues[i];
      if (r.data && comp) combined.push(...gradeAllTeamsForStat(r.data, sourceList, statKey, comp.name));
    });
    return sortRows(combined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allLeagues, live.data, allSig, sourceList, statKey, activeComp?.name]);

  // Upcoming fixtures (all leagues) → each team's next match + the opponent's grade.
  const up = useLiveFixtures('ns', { upcomingDays: 7, upcomingScope: 'all' });
  const upcoming: UpcomingLite[] = useMemo(
    () =>
      up.fixtures.map((fx) => ({
        id: fx.id,
        kickoffUnix: fx.kickoffUnix,
        kickoff: fx.kickoff,
        competition: fx.competition.name,
        homeId: fx.home.id,
        homeName: fx.home.name,
        awayId: fx.away.id,
        awayName: fx.away.name,
      })),
    [up.fixtures],
  );
  const rowIndex = useMemo(() => indexRowsByTeam(allRows), [allRows]);

  const gradedRows = useMemo(() => allRows.filter((r) => r.grade != null), [allRows]);
  const ungradedRows = useMemo(() => allRows.filter((r) => r.grade == null), [allRows]);
  const dist = useMemo(() => gradeDistribution(gradedRows), [gradedRows]);

  const tableRows = useMemo(
    () =>
      gradedRows.filter((r) => {
        if (direction !== 'all' && r.direction !== direction) return false;
        if (romanFilter !== 'all' && r.roman !== romanFilter) return false;
        return true;
      }),
    [gradedRows, direction, romanFilter],
  );

  const strongCount = gradedRows.filter((r) => r.direction === 'strong').length;
  const weakCount = gradedRows.filter((r) => r.direction === 'weak').length;
  const source = sourceListById(sourceList);
  const loading = feed.loading || (allLeagues ? settled < leagues.length : singleId != null && live.loading && !live.data);
  const err = feed.error ?? (allLeagues ? null : live.error);
  const selectedRow = tableRows.find((r) => rowId(r) === selected) ?? null;

  const leagueOptions = [
    { value: ALL, label: `All leagues combined (${leagues.length})` },
    ...leagues.map((l) => ({ value: String(l.id), label: `${l.name} · ${l.country}` })),
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Stats Grading</Text>
        <Text style={styles.subtitle}>
          Each team graded A–F for one statistic within a source list — Home read against Overall on
          the 60 / 40 bands, exactly as the grading document defines. Leagues only (no cups); grade a
          single league or all leagues combined.
        </Text>
      </View>

      {/* Toolbar */}
      <View style={styles.toolbar}>
        <FilterDropdown
          label="League"
          value={selection}
          options={leagueOptions}
          onChange={(v) => { setSelection(v); setSelected(null); }}
        />
        <View style={[styles.filterRow, narrow && styles.filterCol]}>
          <FilterDropdown
            label="Statistic"
            value={statKey}
            options={GRADABLE_STATS.map((s) => ({ value: s.key, label: s.label }))}
            onChange={(v) => { setStatKey(v); setSelected(null); }}
            style={narrow ? styles.full : styles.flex}
          />
          <FilterDropdown
            label="Source list (games)"
            value={String(sourceList)}
            options={SOURCE_LISTS.map((s) => ({ value: String(s.id), label: `${s.id}. ${s.label}` }))}
            onChange={(v) => { setSourceList(Number(v) as SourceListId); setSelected(null); }}
            style={narrow ? styles.full : styles.flex}
          />
          <FilterDropdown
            label="Direction"
            value={direction}
            options={[
              { value: 'all', label: 'Strong & Weak' },
              { value: 'strong', label: 'Strong ↑' },
              { value: 'weak', label: 'Weak ↓' },
            ]}
            onChange={(v) => setDirection(v as DirectionFilter)}
            style={narrow ? styles.full : styles.flex}
          />
          <FilterDropdown
            label="Grade"
            value={romanFilter}
            options={[{ value: 'all', label: 'All' }, ...ROMANS.map((r) => ({ value: r, label: `Grade ${r}` }))]}
            onChange={(v) => setRomanFilter(v as RomanGrade | 'all')}
            style={narrow ? styles.full : styles.flex}
          />
        </View>
      </View>

      {/* Status */}
      <View style={styles.statusRow}>
        {loading ? (
          <>
            <ActivityIndicator size="small" color={theme.accentGreen} />
            <Text style={styles.statusMuted}>
              {allLeagues ? `Grading ${settled}/${leagues.length} leagues…` : 'Grading teams live…'}
            </Text>
          </>
        ) : err ? (
          <Text style={styles.statusMuted}>Live data unavailable: {err}</Text>
        ) : (
          <Text style={styles.statusLive}>
            ● {allLeagues ? `${leagues.length} leagues` : activeComp?.name ?? ''} · {source.id}. {source.label}
          </Text>
        )}
      </View>

      {/* Summary tiles */}
      <View style={styles.tiles}>
        <Tile label="Teams" value={String(allRows.length)} accent={theme.textPrimary} />
        <Tile label="Strong ↑" value={String(strongCount)} accent={theme.accentGreen} />
        <Tile label="Weak ↓" value={String(weakCount)} accent={theme.loss} />
        <Tile label="Ungraded" value={String(ungradedRows.length)} accent={theme.textMuted} />
      </View>

      {/* Grade distribution */}
      <DistributionBar dist={dist} />

      {/* Table */}
      {!loading && !err ? (
        tableRows.length === 0 ? (
          <Text style={styles.empty}>No teams match this grade and direction. Try another selection.</Text>
        ) : (
          <View style={styles.tableWrap}>
            <DragScroll horizontal style={styles.tableScroll} contentContainerStyle={styles.tableScrollContent}>
              <View style={styles.table}>
                <View style={[styles.row, styles.headRow]}>
                  <Text style={[styles.cell, styles.cRank, styles.headText, styles.headRight]}>#</Text>
                  <Text style={[styles.cell, styles.cTeam, styles.headText]}>Team</Text>
                  {allLeagues ? <Text style={[styles.cell, styles.cComp, styles.headText]}>League</Text> : null}
                  <Text style={[styles.cell, styles.cGrade, styles.headText]}>Grade</Text>
                  <Text style={[styles.cell, styles.cNum, styles.headText, styles.headRight]}>Home</Text>
                  <Text style={[styles.cell, styles.cNum, styles.headText, styles.headRight]}>Overall</Text>
                  <Text style={[styles.cell, styles.cNum, styles.headText, styles.headRight]}>League</Text>
                  <Text style={[styles.cell, styles.cDir, styles.headText]}>Dir</Text>
                  <Text style={[styles.cell, styles.cNext, styles.headText]}>Next match</Text>
                  <Text style={[styles.cell, styles.cOpp, styles.headText]}>Opp</Text>
                </View>
                {tableRows.map((r, i) => {
                  const id = rowId(r);
                  const on = id === selected;
                  const color = r.grade ? gradeColor(r.grade) : theme.textMuted;
                  const nf = nextFixtureFor(r.teamId, r.team, upcoming);
                  const oppRow = nf ? lookupRow(rowIndex, nf.opponentId, nf.opponentName) : null;
                  const oppGrade = oppRow?.grade ?? null;
                  const oppColor = oppGrade ? gradeColor(oppGrade) : theme.textMuted;
                  return (
                    <Pressable
                      key={id}
                      onPress={() => setSelected(on ? null : id)}
                      style={[styles.row, i % 2 === 1 && styles.rowAlt, on && styles.rowOn]}>
                      <Text style={[styles.cell, styles.cRank, styles.muted]}>{i + 1}</Text>
                      <Text style={[styles.cell, styles.cTeam, styles.team]} numberOfLines={1}>
                        {r.team}
                        {(r.sample ?? 0) < 5 ? `  ·${r.sample ?? 0}` : ''}
                      </Text>
                      {allLeagues ? (
                        <Text style={[styles.cell, styles.cComp, styles.compText]} numberOfLines={1}>{r.competition}</Text>
                      ) : null}
                      <View style={[styles.cell, styles.cGrade]}>
                        <View style={[styles.chip, { borderColor: color }]}>
                          <Text style={[styles.chipLetter, { color }]}>{r.grade}</Text>
                          <Text style={[styles.chipArrow, { color }]}>{r.direction === 'strong' ? '↑' : '↓'}</Text>
                        </View>
                        {r.roman ? <Text style={styles.gradeRoman}>{r.roman}</Text> : null}
                        {r.da ? <View style={styles.daDot}><Text style={styles.daDotText}>DA</Text></View> : null}
                      </View>
                      <Text style={[styles.cell, styles.cNum, styles.num]}>{pct(r.homeValue)}</Text>
                      <Text style={[styles.cell, styles.cNum, styles.numStrong, { color }]}>{pct(r.overallValue)}</Text>
                      <Text style={[styles.cell, styles.cNum, styles.muted]}>{pct(r.leagueValue)}</Text>
                      <Text
                        style={[
                          styles.cell,
                          styles.cDir,
                          styles.dirTag,
                          { color: r.direction === 'strong' ? theme.accentGreen : theme.loss },
                        ]}>
                        {r.direction === 'strong' ? 'Strong ↑' : 'Weak ↓'}
                      </Text>
                      <View style={[styles.cell, styles.cNext]}>
                        {nf ? (
                          <>
                            <Text style={styles.nextOpp} numberOfLines={1}>
                              {nf.side === 'home' ? 'vs ' : '@ '}{nf.opponentName}
                            </Text>
                            <Text style={styles.nextKo} numberOfLines={1}>
                              {nf.side === 'home' ? 'Home' : 'Away'} · {kickoffLabel(nf.fixture.kickoffUnix, nf.fixture.kickoff)}
                            </Text>
                          </>
                        ) : (
                          <Text style={styles.nextNone}>no fixture</Text>
                        )}
                      </View>
                      <View style={[styles.cell, styles.cOpp]}>
                        {oppGrade ? (
                          <View style={[styles.chip, { borderColor: oppColor }]}>
                            <Text style={[styles.chipLetter, { color: oppColor }]}>{oppGrade}</Text>
                            <Text style={[styles.chipArrow, { color: oppColor }]}>{oppRow?.direction === 'strong' ? '↑' : '↓'}</Text>
                          </View>
                        ) : (
                          <Text style={styles.nextNone}>{nf ? 'n/g' : '—'}</Text>
                        )}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </DragScroll>
            <Text style={styles.tableHint}>
              {tableRows.length} team{tableRows.length === 1 ? '' : 's'} · tap a row for the full breakdown
            </Text>
          </View>
        )
      ) : null}

      {/* Selected-team detail */}
      {selectedRow ? <DetailCard row={selectedRow} showComp={allLeagues} onClose={() => setSelected(null)} /> : null}

      {/* Ungraded teams */}
      {ungradedRows.length > 0 ? (
        <View style={styles.ungraded}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showUngraded }}
            onPress={() => setShowUngraded((o) => !o)}
            style={styles.ungradedHead}>
            <Text style={styles.ungradedTitle}>Not graded for this combination · {ungradedRows.length}</Text>
            <Text style={styles.chevron}>{showUngraded ? '▴' : '▾'}</Text>
          </Pressable>
          {showUngraded ? (
            <View style={styles.ungradedBody}>
              <Text style={styles.ungradedNote}>
                The document names only six Home/Overall combinations. These teams fall outside them
                for this statistic — shown for completeness, never forced into a grade.
              </Text>
              {ungradedRows.map((r) => (
                <View key={rowId(r)} style={styles.ungradedRow}>
                  <Text style={styles.ungradedTeam} numberOfLines={1}>
                    {r.team}{allLeagues ? ` · ${r.competition}` : ''}
                  </Text>
                  <Text style={styles.ungradedVals}>
                    H {pct(r.homeValue)} ({dirWord(r.homeValue)}) · O {pct(r.overallValue)} ({dirWord(r.overallValue)})
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** Unique key per row — team names can repeat across leagues in combined mode. */
function rowId(r: TeamGradeRow): string {
  return `${r.competition}::${r.team}`;
}

function Tile({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <View style={styles.tile}>
      <Text style={[styles.tileValue, { color: accent }]}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

function DistributionBar({ dist }: { dist: Record<Grade, number> }) {
  const total = GRADE_LETTERS.reduce((s, g) => s + dist[g], 0);
  return (
    <View style={styles.distWrap}>
      <View style={styles.distBar}>
        {total === 0 ? (
          <View style={[styles.distSeg, { flex: 1, backgroundColor: theme.surfaceMuted }]} />
        ) : (
          GRADE_LETTERS.filter((g) => dist[g] > 0).map((g) => (
            <View key={g} style={[styles.distSeg, { flex: dist[g], backgroundColor: gradeColor(g) }]} />
          ))
        )}
      </View>
      <View style={styles.distLegend}>
        {GRADE_LETTERS.map((g) => (
          <View key={g} style={styles.distItem}>
            <View style={[styles.distDot, { backgroundColor: gradeColor(g) }]} />
            <Text style={styles.distItemText}>
              {g}
              {DA_GRADES.includes(g) ? '·DA' : ''} {dist[g]}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function DetailCard({ row, showComp, onClose }: { row: TeamGradeRow; showComp: boolean; onClose: () => void }) {
  const color = row.grade ? gradeColor(row.grade) : theme.textMuted;
  return (
    <View style={[styles.detail, { borderColor: color }]}>
      <View style={styles.detailHead}>
        <View style={[styles.chip, styles.chipLg, { borderColor: color }]}>
          <Text style={[styles.chipLetterLg, { color }]}>{row.grade}</Text>
          <Text style={[styles.chipArrowLg, { color }]}>{row.direction === 'strong' ? '↑' : '↓'}</Text>
        </View>
        {row.roman ? <Text style={styles.detailRoman}>{row.roman}</Text> : null}
        <View style={{ flex: 1 }}>
          <Text style={styles.detailTeam} numberOfLines={1}>{row.team}</Text>
          <Text style={styles.detailSub}>
            {showComp ? `${row.competition} · ` : ''}
            {row.direction === 'strong' ? 'Strong ↑' : 'Weak ↓'} · {row.statLabel}
            {row.da ? ' · Double Agent' : ''}
          </Text>
        </View>
        <Pressable accessibilityRole="button" onPress={onClose} style={styles.closeBtn}>
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
      </View>
      <View style={styles.detailGrid}>
        <Metric label="Home" value={pct(row.homeValue)} sub={dirWord(row.homeValue)} />
        <Metric label="Overall" value={pct(row.overallValue)} sub={dirWord(row.overallValue)} />
        <Metric label="League avg" value={pct(row.leagueValue)} sub="full season" />
        <Metric label="Sample" value={row.sample == null ? '—' : String(row.sample)} sub="games" />
      </View>
      <Text style={styles.detailRule}>{explain(row)}</Text>
      <Text style={styles.detailMeta}>
        Source {row.sourceList} · {sourceListById(row.sourceList).label} · Letter {row.letter}
        {row.roman ? ` · Grade ${row.roman}` : ''}
      </Text>
    </View>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricSub}>{sub}</Text>
    </View>
  );
}

function explain(r: TeamGradeRow): string {
  const h = dirWord(r.homeValue);
  const o = dirWord(r.overallValue);
  const base = `Home is ${h} and Overall is ${o}`;
  switch (r.grade) {
    case 'A': return `${base} → both up → Grade A.`;
    case 'B': return `${base} → Home up, Overall mid → Grade B (Double Agent).`;
    case 'C': return `${base}, and above the league average → Grade C.`;
    case 'D': return `${base}, and below the league average → Grade D.`;
    case 'E': return `${base} → Home down, Overall up → Grade E (Double Agent).`;
    case 'F': return `${base} → both down → Grade F.`;
    default: return `${base} — not one of the document's six combinations, so no grade.`;
  }
}

const styles = StyleSheet.create({
  container: { width: '100%', alignSelf: 'stretch' },

  header: { marginBottom: spacing.md },
  title: { fontFamily: fonts.display, fontSize: 24, color: theme.textPrimary, marginBottom: spacing.xs },
  subtitle: { fontFamily: fonts.body, fontSize: 13, lineHeight: 20, color: theme.textMuted },

  toolbar: {
    borderWidth: layout.borderWidth, borderColor: theme.border, borderRadius: layout.borderRadius,
    backgroundColor: theme.surface, padding: spacing.md, gap: spacing.sm,
  },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  filterCol: { flexDirection: 'column' },
  flex: { flexGrow: 1, flexBasis: 150, minWidth: 140 },
  full: { width: '100%', minWidth: 0, flexBasis: 'auto', flexGrow: 0 },

  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 20, marginTop: spacing.md },
  statusLive: { fontFamily: fonts.bodyMedium, fontSize: 12, color: theme.accentGreen },
  statusMuted: { fontFamily: fonts.body, fontSize: 12, color: theme.textMuted },

  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  tile: {
    flexGrow: 1, flexBasis: 90, minWidth: 80, alignItems: 'center',
    borderWidth: layout.borderWidth, borderColor: theme.border, borderRadius: layout.borderRadius,
    backgroundColor: theme.surface, paddingVertical: spacing.md, paddingHorizontal: spacing.sm,
  },
  tileValue: { fontFamily: fonts.display, fontSize: 26 },
  tileLabel: { fontFamily: fonts.bodyMedium, fontSize: 10, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },

  distWrap: { marginTop: spacing.md, gap: spacing.sm },
  distBar: { flexDirection: 'row', height: 10, borderRadius: 999, overflow: 'hidden', backgroundColor: theme.surfaceMuted },
  distSeg: { height: '100%' },
  distLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  distItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  distDot: { width: 8, height: 8, borderRadius: 4 },
  distItemText: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted },

  empty: { fontFamily: fonts.body, fontSize: 13, color: theme.textMuted, textAlign: 'center', paddingVertical: spacing.lg },

  tableWrap: { marginTop: spacing.md },
  tableScroll: { width: '100%', maxWidth: '100%' },
  tableScrollContent: { minWidth: '100%' },
  table: {
    width: '100%', minWidth: 860, backgroundColor: theme.surface, borderWidth: layout.borderWidth,
    borderColor: theme.border, borderRadius: layout.borderRadius, overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, paddingHorizontal: spacing.sm },
  headRow: { backgroundColor: theme.surfaceMuted, borderBottomWidth: layout.borderWidth, borderBottomColor: theme.border },
  rowAlt: { backgroundColor: theme.surfaceHover },
  rowOn: { backgroundColor: '#DBEAFE' },
  cell: { paddingHorizontal: 4, justifyContent: 'center' },
  headText: { fontFamily: fonts.bodySemiBold, fontSize: 10, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  headRight: { textAlign: 'right' },
  cRank: { width: 30 },
  cTeam: { flex: 1, minWidth: 150 },
  cComp: { width: 120 },
  cGrade: { width: 104, flexDirection: 'row', alignItems: 'center', gap: 6 },
  cNum: { width: 72, alignItems: 'flex-end' },
  cDir: { width: 84 },
  cNext: { width: 180, alignItems: 'flex-start' },
  cOpp: { width: 60, alignItems: 'center' },
  nextOpp: { fontFamily: fonts.bodyMedium, fontSize: 12, color: theme.textPrimary },
  nextKo: { fontFamily: fonts.body, fontSize: 10, color: theme.textMuted, marginTop: 1 },
  nextNone: { fontFamily: fonts.body, fontSize: 11, color: theme.textFaint },
  muted: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted, textAlign: 'right' },
  team: { fontFamily: fonts.bodyMedium, fontSize: 13, color: theme.textPrimary },
  compText: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted },
  num: { fontFamily: fonts.body, fontSize: 12, color: theme.textPrimary, textAlign: 'right' },
  numStrong: { fontFamily: fonts.bodySemiBold, fontSize: 13, textAlign: 'right' },
  dirTag: { fontFamily: fonts.bodySemiBold, fontSize: 12 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 2, borderWidth: 1.5, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 1 },
  chipLetter: { fontFamily: fonts.display, fontSize: 15 },
  chipArrow: { fontFamily: fonts.bodySemiBold, fontSize: 13 },
  chipArrowLg: { fontFamily: fonts.bodySemiBold, fontSize: 20 },
  gradeRoman: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: theme.textMuted, minWidth: 18 },
  detailRoman: { fontFamily: fonts.bodySemiBold, fontSize: 16, color: theme.textMuted },
  daDot: { backgroundColor: theme.accentPurple, borderRadius: 999, paddingHorizontal: 4, paddingVertical: 1 },
  daDotText: { fontFamily: fonts.bodySemiBold, fontSize: 8, color: '#FFFFFF' },
  tableHint: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted, textAlign: 'center', marginTop: spacing.sm },

  detail: {
    marginTop: spacing.md, borderWidth: 1.5, borderRadius: layout.borderRadius,
    backgroundColor: theme.surface, padding: spacing.md, gap: spacing.sm,
  },
  detailHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  chipLg: { paddingHorizontal: spacing.sm, paddingVertical: 3 },
  chipLetterLg: { fontFamily: fonts.display, fontSize: 24 },
  detailTeam: { fontFamily: fonts.bodySemiBold, fontSize: 16, color: theme.textPrimary },
  detailSub: { fontFamily: fonts.body, fontSize: 12, color: theme.textMuted, marginTop: 1 },
  closeBtn: { padding: spacing.xs },
  closeText: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: theme.textMuted },
  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  metric: {
    flexGrow: 1, flexBasis: 80, minWidth: 70, alignItems: 'center',
    backgroundColor: theme.surfaceHover, borderRadius: layout.borderRadius, paddingVertical: spacing.sm,
  },
  metricLabel: { fontFamily: fonts.bodyMedium, fontSize: 9, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  metricValue: { fontFamily: fonts.display, fontSize: 18, color: theme.textPrimary, marginTop: 2 },
  metricSub: { fontFamily: fonts.body, fontSize: 9, color: theme.textFaint },
  detailRule: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: theme.textPrimary },
  detailMeta: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted },

  ungraded: {
    marginTop: spacing.md, borderWidth: layout.borderWidth, borderColor: theme.border,
    borderRadius: layout.borderRadius, backgroundColor: theme.surface, overflow: 'hidden',
  },
  ungradedHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.md },
  ungradedTitle: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.textPrimary },
  chevron: { fontFamily: fonts.bodySemiBold, fontSize: 16, color: theme.accentGreen },
  ungradedBody: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, gap: 6, borderTopWidth: layout.borderWidth, borderTopColor: theme.border },
  ungradedNote: { fontFamily: fonts.body, fontSize: 11, lineHeight: 16, color: theme.textMuted, paddingTop: spacing.sm },
  ungradedRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, alignItems: 'center' },
  ungradedTeam: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 12, color: theme.textPrimary },
  ungradedVals: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted },
});
