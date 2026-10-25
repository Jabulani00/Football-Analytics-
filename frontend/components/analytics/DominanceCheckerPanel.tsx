import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import DragScroll from '@/components/shared/DragScroll';
import FilterDropdown from '@/components/shared/FilterDropdown';
import { useAllGradingLeagues, useLiveCompetitionFeed } from '@/hooks/useLiveCompetitions';
import { useLiveStatsTables } from '@/hooks/useLiveStatsTables';
import {
  buildHomeAwayDominance,
  buildHalfDominance,
  dominanceTally,
  teamNamesIn,
  LONG_DIFF,
  EVEN_DIFF,
  type DominanceRow,
} from '@/utils/dominance';
import { fonts, layout, spacing, theme } from '@/styles/theme';

type SideStyle = { label: string; color: string };

function fmt(value: number | null, pctBased: boolean, decimals: number): string {
  if (value == null) return '—';
  return pctBased ? `${Math.round(value)}%` : value.toFixed(decimals);
}
function fmtDiff(r: DominanceRow): string {
  if (r.difference == null) return '—';
  const v = r.pctBased ? `${Math.round(Math.abs(r.difference))}%` : Math.abs(r.difference).toFixed(r.decimals);
  const sign = r.difference > 0 ? '+' : r.difference < 0 ? '−' : '';
  return `${sign}${v}`;
}

export default function DominanceCheckerPanel() {
  const narrow = useWindowDimensions().width < 720;

  const feed = useLiveCompetitionFeed(3);
  const liveLeagues = useMemo(() => feed.competitions.filter((c) => c.rank === 0), [feed.competitions]);
  const all = useAllGradingLeagues();
  const pickLeagues = all.leagues;
  const leaguesById = useMemo(() => new Map([...pickLeagues, ...liveLeagues].map((l) => [l.id, l])), [pickLeagues, liveLeagues]);

  const [selection, setSelection] = useState<string>('');
  useEffect(() => {
    if (selection !== '') return;
    const first = liveLeagues[0]?.id ?? pickLeagues[0]?.id;
    if (first != null) setSelection(String(first));
  }, [liveLeagues, pickLeagues, selection]);
  const competitionId = selection === '' ? null : Number(selection);
  const activeComp = competitionId != null ? leaguesById.get(competitionId) ?? null : null;

  const live = useLiveStatsTables({ competitionId: competitionId ?? undefined, seasonName: activeComp?.season });

  const teams = useMemo(() => (live.data ? teamNamesIn(live.data) : []), [live.data]);
  const [team, setTeam] = useState<string>('');
  useEffect(() => {
    if (teams.length === 0) return;
    if (!teams.includes(team)) setTeam(teams[0]);
  }, [teams, team]);

  const ha = useMemo(() => (live.data && team ? buildHomeAwayDominance(live.data, team) : []), [live.data, team]);
  const half = useMemo(() => (live.data && team ? buildHalfDominance(live.data, team) : []), [live.data, team]);

  const loading = selection === '' || (live.loading && !live.data);
  // The upcoming-fixtures feed only seeds the default league; its errors must not
  // block the panel, which reads the season stats (fixtures/between) separately.
  const err = live.error;

  const leagueOptions = pickLeagues.map((l) => ({ value: String(l.id), label: `${l.name} · ${l.country}` }));
  const teamOptions = teams.map((t) => ({ value: t, label: t }));

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Dominance Checker</Text>
        <Text style={styles.subtitle}>
          For one team, every stat compared Home vs Away and 1st half vs 2nd half. The dominant side
          is called when the difference is long (≥ {LONG_DIFF}%); a short difference (≤ {EVEN_DIFF}%)
          is even. % stats compare by points, PPG and AVG by relative size.
        </Text>
      </View>

      <View style={styles.toolbar}>
        <FilterDropdown label="League" value={selection} options={leagueOptions} onChange={setSelection} style={narrow ? styles.full : styles.flex} />
        <FilterDropdown label="Team" value={team} options={teamOptions} onChange={setTeam} style={narrow ? styles.full : styles.flex} />
      </View>

      <View style={styles.statusRow}>
        {loading ? (
          <>
            <ActivityIndicator size="small" color={theme.accentGreen} />
            <Text style={styles.statusMuted}>Building the dominance tables…</Text>
          </>
        ) : err ? (
          <Text style={styles.statusMuted}>Live data unavailable: {err}</Text>
        ) : (
          <Text style={styles.statusLive}>● {activeComp?.name ?? ''} · {team}</Text>
        )}
      </View>

      {!loading && !err && ha.length === 0 ? (
        <Text style={styles.empty}>No finished-match stats for this league yet. Try another league.</Text>
      ) : null}

      {!loading && !err && ha.length > 0 ? (
        <>
          <DominanceTable
            title="Home / Away Analysis"
            aLabel="Home"
            bLabel="Away"
            aSide={{ label: 'HOME', color: theme.accentGreen }}
            bSide={{ label: 'AWAY', color: theme.accentBlue }}
            rows={ha}
          />
          <DominanceTable
            title="1st H / 2nd H Analysis"
            aLabel="1st H"
            bLabel="2nd H"
            aSide={{ label: '1st H', color: theme.accentGreen }}
            bSide={{ label: '2nd H', color: theme.accentPurple }}
            rows={half}
            signed
          />
        </>
      ) : null}
    </View>
  );
}

function DominanceTable({
  title,
  aLabel,
  bLabel,
  aSide,
  bSide,
  rows,
  signed,
}: {
  title: string;
  aLabel: string;
  bLabel: string;
  aSide: SideStyle;
  bSide: SideStyle;
  rows: DominanceRow[];
  signed?: boolean;
}) {
  const tally = dominanceTally(rows);
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <View style={styles.tallyRow}>
          <Tally color={aSide.color} label={aSide.label} n={tally.a} />
          <Tally color={bSide.color} label={bSide.label} n={tally.b} />
          <Tally color={theme.textMuted} label="EVEN" n={tally.even} />
        </View>
      </View>
      <DragScroll horizontal style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.table}>
          <View style={[styles.row, styles.headRow]}>
            <Text style={[styles.cStat, styles.headText]}>Stat</Text>
            <Text style={[styles.cNum, styles.headText, styles.right]}>{aLabel}</Text>
            <Text style={[styles.cNum, styles.headText, styles.right]}>{bLabel}</Text>
            <Text style={[styles.cNum, styles.headText, styles.right]}>Diff</Text>
            <Text style={[styles.cDom, styles.headText]}>Dominance</Text>
          </View>
          {rows.map((r, i) => {
            const side = r.side === 'a' ? aSide : r.side === 'b' ? bSide : null;
            const strong = r.magnitude === 'long';
            return (
              <View key={r.statKey} style={[styles.row, i % 2 === 1 && styles.rowAlt]}>
                <Text style={[styles.cStat, styles.stat]} numberOfLines={1}>{r.statLabel}</Text>
                <Text style={[styles.cNum, styles.num, r.side === 'a' && strong && { color: aSide.color, fontFamily: fonts.bodySemiBold }]}>
                  {fmt(r.a, r.pctBased, r.decimals)}
                </Text>
                <Text style={[styles.cNum, styles.num, r.side === 'b' && strong && { color: bSide.color, fontFamily: fonts.bodySemiBold }]}>
                  {fmt(r.b, r.pctBased, r.decimals)}
                </Text>
                <Text style={[styles.cNum, styles.num]}>{signed ? fmtDiff(r) : (r.difference == null ? '—' : fmt(Math.abs(r.difference), r.pctBased, r.decimals))}</Text>
                <View style={styles.cDom}>
                  {side ? (
                    <View style={[styles.badge, strong ? { backgroundColor: side.color, borderColor: side.color } : { borderColor: side.color }]}>
                      <Text style={[styles.badgeText, strong ? styles.badgeTextOn : { color: side.color }]}>
                        {side.label}{strong ? '' : r.magnitude === 'mid' ? ' · lean' : ''}
                      </Text>
                    </View>
                  ) : r.side === 'even' ? (
                    <Text style={styles.even}>Even</Text>
                  ) : (
                    <Text style={styles.even}>—</Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      </DragScroll>
    </View>
  );
}

function Tally({ color, label, n }: { color: string; label: string; n: number }) {
  return (
    <View style={styles.tally}>
      <View style={[styles.tallyDot, { backgroundColor: color }]} />
      <Text style={styles.tallyText}>{label} {n}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', alignSelf: 'stretch' },
  header: { marginBottom: spacing.md },
  title: { fontFamily: fonts.display, fontSize: 24, color: theme.textPrimary, marginBottom: spacing.xs },
  subtitle: { fontFamily: fonts.body, fontSize: 13, lineHeight: 20, color: theme.textMuted },

  toolbar: {
    flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm,
    borderWidth: layout.borderWidth, borderColor: theme.border, borderRadius: layout.borderRadius,
    backgroundColor: theme.surface, padding: spacing.md,
  },
  flex: { flexGrow: 1, flexBasis: 200, minWidth: 160 },
  full: { width: '100%', minWidth: 0, flexBasis: 'auto', flexGrow: 0 },

  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 20, marginTop: spacing.md },
  statusLive: { fontFamily: fonts.bodyMedium, fontSize: 12, color: theme.accentGreen },
  statusMuted: { fontFamily: fonts.body, fontSize: 12, color: theme.textMuted },
  empty: { fontFamily: fonts.body, fontSize: 13, color: theme.textMuted, textAlign: 'center', paddingVertical: spacing.lg },

  section: { marginTop: spacing.lg },
  sectionHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginBottom: spacing.sm },
  sectionTitle: { fontFamily: fonts.display, fontSize: 16, color: theme.textPrimary },
  tallyRow: { flexDirection: 'row', gap: spacing.md },
  tally: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tallyDot: { width: 9, height: 9, borderRadius: 5 },
  tallyText: { fontFamily: fonts.bodyMedium, fontSize: 11, color: theme.textMuted },

  scroll: { width: '100%', maxWidth: '100%' },
  scrollContent: { minWidth: '100%' },
  table: {
    width: '100%', minWidth: 520, backgroundColor: theme.surface, borderWidth: layout.borderWidth,
    borderColor: theme.border, borderRadius: layout.borderRadius, overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, paddingHorizontal: spacing.sm },
  headRow: { backgroundColor: theme.surfaceMuted, borderBottomWidth: layout.borderWidth, borderBottomColor: theme.border },
  rowAlt: { backgroundColor: theme.surfaceHover },
  headText: { fontFamily: fonts.bodySemiBold, fontSize: 10, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 4 },
  right: { textAlign: 'right' },
  cStat: { flex: 1, minWidth: 120, paddingHorizontal: 4 },
  cNum: { width: 76, paddingHorizontal: 4 },
  cDom: { width: 120, paddingHorizontal: 4 },
  stat: { fontFamily: fonts.bodyMedium, fontSize: 13, color: theme.textPrimary },
  num: { fontFamily: fonts.body, fontSize: 12, color: theme.textPrimary, textAlign: 'right' },
  badge: { alignSelf: 'flex-start', borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontFamily: fonts.bodySemiBold, fontSize: 10, letterSpacing: 0.3 },
  badgeTextOn: { color: '#FFFFFF' },
  even: { fontFamily: fonts.body, fontSize: 12, color: theme.textFaint },
});
