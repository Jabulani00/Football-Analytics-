import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { useFootyStats } from '@/hooks/useFootyStats';
import type { FootyFixture } from '@/services/footyMarketStats';
import { fonts, spacing, theme } from '@/styles/theme';

type Metric = 'over05' | 'over15' | 'over25' | 'over35' | 'btts' | 'firstHalfBtts' | 'secondHalfBtts';
type Scope = 'overall' | 'home' | 'away';
type WindowSize = 0 | 5 | 6 | 8 | 10;
type Row = { name: string; country: string; id: number; played: number; hits: number; pct: number; teams: TeamRow[] };
type TeamRow = { name: string; played: number; hits: number; pct: number };

const METRICS: { id: Metric; label: string }[] = [
  { id: 'over05', label: 'Over 0.5' }, { id: 'over15', label: 'Over 1.5' },
  { id: 'over25', label: 'Over 2.5' }, { id: 'over35', label: 'Over 3.5' },
  { id: 'btts', label: 'Both teams score' }, { id: 'firstHalfBtts', label: '1st half BTTS' },
  { id: 'secondHalfBtts', label: '2nd half BTTS' },
];
const SCOPES: { id: Scope; label: string }[] = [
  { id: 'overall', label: 'Overall' }, { id: 'home', label: 'Home' }, { id: 'away', label: 'Away' },
];
const WINDOWS: { id: WindowSize; label: string }[] = [
  { id: 0, label: 'Season' }, { id: 5, label: 'Last 5' }, { id: 6, label: 'Last 6' },
  { id: 8, label: 'Last 8' }, { id: 10, label: 'Last 10' },
];
const RATE_FILTERS = [
  { id: 0, label: 'Any rate' }, { id: 50, label: '≥ 50%' }, { id: 60, label: '≥ 60%' },
  { id: 70, label: '≥ 70%' }, { id: 80, label: '≥ 80%' }, { id: 90, label: '≥ 90%' },
];

function matchesMetric(fx: FootyFixture, metric: Metric): boolean | null {
  if (fx.homeGoals == null || fx.awayGoals == null) return null;
  const total = fx.homeGoals + fx.awayGoals;
  if (metric === 'over05') return total > 0;
  if (metric === 'over15') return total > 1;
  if (metric === 'over25') return total > 2;
  if (metric === 'over35') return total > 3;
  if (metric === 'btts') return fx.homeGoals > 0 && fx.awayGoals > 0;
  if (fx.htHome == null || fx.htAway == null || fx.regulation === false) return null;
  if (metric === 'firstHalfBtts') return fx.htHome > 0 && fx.htAway > 0;
  const homeSecond = fx.homeGoals - fx.htHome;
  const awaySecond = fx.awayGoals - fx.htAway;
  return homeSecond >= 0 && awaySecond >= 0 ? homeSecond > 0 && awaySecond > 0 : null;
}

function matchesFormula(fx: FootyFixture, metrics: Metric[], method: 'all' | 'any'): boolean | null {
  const values = metrics.map((metric) => matchesMetric(fx, metric));
  // A missing half-time score makes a formula containing a half-time stat
  // unknowable. Exclude it from the denominator instead of treating it as false.
  if (values.some((value) => value == null)) return null;
  const known = values as boolean[];
  return method === 'all' ? known.every(Boolean) : known.some(Boolean);
}

function rankRows(fixtures: FootyFixture[], metrics: Metric[], method: 'all' | 'any', scope: Scope, windowSize: WindowSize, teamMetrics: Metric[], teamMethod: 'all' | 'any', minTeamPct: number): Row[] {
  const completed = fixtures.filter((fx) => fx.finished && !fx.isCup && !fx.isFriendly && fx.homeGoals != null && fx.awayGoals != null);
  const byLeague = new Map<number, FootyFixture[]>();
  for (const fx of completed) {
    const bucket = byLeague.get(fx.competitionId) ?? [];
    bucket.push(fx);
    byLeague.set(fx.competitionId, bucket);
  }
  const rows: Row[] = [];
  for (const [id, games] of byLeague) {
    const ordered = [...games].sort((a, b) => a.unix - b.unix);
    const selectedGames = windowSize ? ordered.slice(-windowSize) : ordered;
    const evaluated = selectedGames.map((fx) => matchesFormula(fx, metrics, method)).filter((value): value is boolean => value != null);
    const sample = evaluated;
    if (!sample.length) continue;
    const teamFixtures = new Map<string, FootyFixture[]>();
    for (const fx of ordered) {
      if (scope === 'overall' || scope === 'home') {
        const list = teamFixtures.get(fx.homeName) ?? [];
        list.push(fx);
        teamFixtures.set(fx.homeName, list);
      }
      if (scope === 'overall' || scope === 'away') {
        const list = teamFixtures.get(fx.awayName) ?? [];
        list.push(fx);
        teamFixtures.set(fx.awayName, list);
      }
    }
    const teams = [...teamFixtures].map(([name, appearances]) => {
      // Last-N is per team and venue, matching the team's form window rather than
      // taking N league-wide fixtures (which would give each club a different sample).
      const sample = windowSize ? appearances.slice(-windowSize) : appearances;
      let played = 0;
      let hits = 0;
      for (const fixture of sample) {
        const hit = matchesFormula(fixture, teamMetrics, teamMethod);
        if (hit == null) continue;
        played += 1;
        if (hit) hits += 1;
      }
      return { name, played, hits, pct: played ? hits * 100 / played : 0 };
    });
    const teamRows = teams.filter((row) => row.played > 0 && row.pct >= minTeamPct)
      .sort((a, b) => b.pct - a.pct || b.played - a.played || a.name.localeCompare(b.name));
    // League samples count fixtures once; home/away affects the club table scope.
    const scopedEval = selectedGames.map((fx) => matchesFormula(fx, metrics, method)).filter((v): v is boolean => v != null);
    const hits = scopedEval.filter(Boolean).length;
    if (!scopedEval.length) continue;
    rows.push({ name: games[0].competitionName, country: games[0].country, id, played: scopedEval.length, hits, pct: hits * 100 / scopedEval.length, teams: teamRows });
  }
  return rows.sort((a, b) => b.pct - a.pct || b.played - a.played || a.name.localeCompare(b.name));
}

export default function LeagueBuilderPanel() {
  const { width } = useWindowDimensions();
  const wide = width >= 1100;
  const narrow = width < 720;
  const data = useFootyStats({ country: null, competitionId: null, kind: 'domestic' }, { loadSupplementalStats: false });
  const [metrics, setMetrics] = useState<Metric[]>(['over25']);
  const [method, setMethod] = useState<'all' | 'any'>('all');
  const [teamMetrics, setTeamMetrics] = useState<Metric[]>(['over25']);
  const [teamMethod, setTeamMethod] = useState<'all' | 'any'>('all');
  const [minLeaguePct, setMinLeaguePct] = useState(0);
  const [minTeamPct, setMinTeamPct] = useState(0);
  const [scope, setScope] = useState<Scope>('overall');
  const [windowSize, setWindowSize] = useState<WindowSize>(0);
  const [expanded, setExpanded] = useState<number | null>(null);
  const rows = useMemo(() => rankRows(data.finished, metrics, method, scope, windowSize, teamMetrics, teamMethod, minTeamPct)
    .filter((row) => row.pct >= minLeaguePct), [data.finished, metrics, method, scope, windowSize, teamMetrics, teamMethod, minLeaguePct, minTeamPct]);
  const toggleMetric = (id: Metric) => setMetrics((previous) => previous.includes(id)
    ? (previous.length === 1 ? previous : previous.filter((item) => item !== id))
    : [...previous, id]);
  const toggleTeamMetric = (id: Metric) => setTeamMetrics((previous) => previous.includes(id)
    ? (previous.length === 1 ? previous : previous.filter((item) => item !== id))
    : [...previous, id]);

  return <View style={[styles.container, wide && styles.containerWide]}>
    <View style={[styles.heading, !narrow && styles.headingWide]}>
      <View style={styles.headingCopy}>
        <Text style={styles.eyebrow}>LEAGUE EXPLORER</Text>
        <Text style={styles.title}>League rankings & custom stat builder</Text>
        <Text style={styles.copy}>Rank domestic leagues with a custom formula, then open any league to build an independent team ranking.</Text>
      </View>
      <View style={styles.headingBadge}><View style={styles.liveDot} /><Text style={styles.badgeText}>DOMESTIC LEAGUES</Text></View>
    </View>
    <View style={[styles.builderGrid, wide && styles.builderGridWide, narrow && styles.builderGridNarrow]}>
      <View style={[styles.builderCard, styles.formulaCard]}>
        <Text style={styles.cardTitle}>1. Build the league formula</Text>
        <Text style={styles.label}>MATCH STATS · select one or more</Text>
        <View style={styles.controls}>{METRICS.map((metric) => <Choice key={metric.id} label={metric.label} active={metrics.includes(metric.id)} onPress={() => toggleMetric(metric.id)} />)}</View>
        <Text style={styles.label}>MATCH METHOD</Text>
        <View style={styles.controls}><Choice label="ALL selected stats" active={method === 'all'} onPress={() => setMethod('all')} /><Choice label="ANY selected stat" active={method === 'any'} onPress={() => setMethod('any')} /></View>
      </View>
      <View style={[styles.builderCard, styles.refineCard]}>
        <Text style={styles.cardTitle}>2. Refine the ranking</Text>
        <Text style={styles.label}>MINIMUM LEAGUE RATE</Text>
        <View style={styles.controls}>{RATE_FILTERS.map((rate) => <Choice key={`league-rate-${rate.id}`} label={rate.label} active={minLeaguePct === rate.id} onPress={() => setMinLeaguePct(rate.id)} />)}</View>
        <View style={[styles.refineRow, narrow && styles.refineColumn]}>
          <View style={styles.refineGroup}><Text style={styles.label}>TEAM VENUE</Text><View style={styles.controls}>{SCOPES.map((item) => <Choice key={item.id} label={item.label} active={scope === item.id} onPress={() => setScope(item.id)} />)}</View></View>
          <View style={styles.refineGroup}><Text style={styles.label}>SAMPLE WINDOW</Text><View style={styles.controls}>{WINDOWS.map((item) => <Choice key={item.id} label={item.label} active={windowSize === item.id} onPress={() => setWindowSize(item.id)} />)}</View></View>
        </View>
      </View>
    </View>
    {data.loading ? <View style={styles.loading}><ActivityIndicator color={theme.accentGreen} /><Text style={styles.copy}>Loading finished domestic league results…</Text></View> : null}
    {data.error ? <Text style={styles.error}>{data.error}</Text> : null}
    {!data.loading ? <View style={styles.resultsHeading}><View><Text style={styles.cardTitle}>League leaderboard</Text><Text style={styles.coverage}>Ranked {rows.length} leagues from {data.loadedLeagues} loaded active leagues · completed score data{data.capped ? ' · provider-load limit is active' : ''}</Text></View><Text style={styles.sortBadge}>RATE ↓</Text></View> : null}
    <ScrollView horizontal showsHorizontalScrollIndicator style={styles.tableScroll}>
      <View style={[styles.table, wide && styles.tableWide, narrow && styles.tableNarrow]}>
        <View style={[styles.row, styles.header]}><Text style={[styles.cell, styles.name]}>League / team</Text><Text style={styles.cell}>Played</Text><Text style={styles.cell}>Hits</Text><Text style={styles.cell}>Rate</Text></View>
        {rows.map((row, index) => <View key={row.id}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: expanded === row.id }} onPress={() => setExpanded(expanded === row.id ? null : row.id)} style={[styles.row, index % 2 === 1 && styles.alt]}>
            <Text style={[styles.cell, styles.name, styles.leagueName]}>{expanded === row.id ? '▾ ' : '▸ '}{row.name} <Text style={styles.country}>{row.country}</Text></Text>
            <Text style={styles.cell}>{row.played}</Text><Text style={styles.cell}>{row.hits}</Text><Text style={[styles.cell, styles.rate]}>{row.pct.toFixed(1)}%</Text>
          </Pressable>
          {expanded === row.id ? <View style={styles.teamBuilder}>
            <Text style={styles.cardTitle}>Team ranking · {row.name}</Text>
            <Text style={styles.label}>TEAM FILTERS · applied inside this league</Text>
            <View style={styles.controls}>{METRICS.map((metric) => <Choice key={`team-${metric.id}`} label={metric.label} active={teamMetrics.includes(metric.id)} onPress={() => toggleTeamMetric(metric.id)} />)}</View>
            <View style={styles.controls}><Choice label="ALL team stats" active={teamMethod === 'all'} onPress={() => setTeamMethod('all')} /><Choice label="ANY team stat" active={teamMethod === 'any'} onPress={() => setTeamMethod('any')} /></View>
            <Text style={styles.label}>MINIMUM TEAM RATE</Text>
            <View style={styles.controls}>{RATE_FILTERS.map((rate) => <Choice key={`team-rate-${rate.id}`} label={rate.label} active={minTeamPct === rate.id} onPress={() => setMinTeamPct(rate.id)} />)}</View>
            {row.teams.map((team, teamIndex) => <View key={`${row.id}-${team.name}`} style={[styles.row, styles.teamRow, teamIndex % 2 === 0 && styles.alt]}>
              <Text style={[styles.cell, styles.name, styles.teamName]}>{teamIndex + 1}. {team.name}</Text><Text style={styles.cell}>{team.played}</Text><Text style={styles.cell}>{team.hits}</Text><Text style={[styles.cell, styles.rate]}>{team.pct.toFixed(1)}%</Text>
            </View>)}
          </View> : null}
        </View>)}
        {!data.loading && rows.length === 0 ? <Text style={styles.empty}>No scored domestic league matches are available for these filters yet.</Text> : null}
      </View>
    </ScrollView>
    {data.capped ? <Text style={styles.note}>The existing data loader intentionally limits the all-league feed to the 30 most active domestic leagues to protect API usage. This panel reflects that loaded set; it does not claim to rank leagues the API loader has not fetched.</Text> : null}
  </View>;
}

function Choice({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={[styles.choice, active && styles.choiceActive]}>
    <Text style={[styles.choiceText, active && styles.choiceTextActive]}>{label}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  container: { width: '100%', gap: spacing.md, padding: spacing.md, borderRadius: 16, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.background },
  containerWide: { padding: spacing.xl, gap: spacing.lg },
  heading: { gap: spacing.sm }, headingWide: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, headingCopy: { flex: 1, gap: 4 },
  eyebrow: { fontFamily: fonts.bodySemiBold, fontSize: 10, letterSpacing: 1.4, color: theme.accentGreen },
  title: { fontFamily: fonts.display, fontSize: 26, color: theme.textPrimary },
  copy: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: theme.textMuted },
  headingBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: theme.border, borderRadius: 999, backgroundColor: theme.surface },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: theme.accentGreen }, badgeText: { fontFamily: fonts.bodySemiBold, fontSize: 10, letterSpacing: 0.6, color: theme.textMuted },
  builderGrid: { gap: spacing.md }, builderGridWide: { flexDirection: 'row', alignItems: 'stretch' }, builderGridNarrow: { flexDirection: 'column' },
  builderCard: { padding: spacing.md, borderRadius: 12, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface, gap: 4 },
  formulaCard: { flex: 1.25 }, refineCard: { flex: 1, minWidth: 300 }, cardTitle: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: theme.textPrimary },
  label: { fontFamily: fonts.bodySemiBold, fontSize: 10, color: theme.textMuted, letterSpacing: 0.8, marginTop: spacing.sm },
  controls: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, choice: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.background },
  choiceActive: { borderColor: theme.accentGreen, backgroundColor: 'rgba(0,180,120,0.12)' }, choiceText: { fontFamily: fonts.body, fontSize: 12, color: theme.textMuted }, choiceTextActive: { color: theme.accentGreen, fontFamily: fonts.bodySemiBold },
  refineRow: { flexDirection: 'row', gap: spacing.md }, refineColumn: { flexDirection: 'column' }, refineGroup: { flex: 1 },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: spacing.md }, error: { color: theme.loss },
  resultsHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, marginTop: spacing.sm },
  coverage: { fontFamily: fonts.body, fontSize: 12, color: theme.textMuted, marginTop: 4 }, sortBadge: { fontFamily: fonts.bodySemiBold, fontSize: 10, color: theme.accentGreen, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: 'rgba(0,180,120,0.1)' },
  tableScroll: { width: '100%', marginTop: spacing.xs }, table: { width: '100%', minWidth: 580, borderWidth: 1, borderColor: theme.border, borderRadius: 10, overflow: 'hidden' }, tableWide: { minWidth: 0 }, tableNarrow: { minWidth: 520 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: theme.border }, header: { backgroundColor: theme.surface }, alt: { backgroundColor: 'rgba(255,255,255,0.025)' },
  teamBuilder: { padding: spacing.md, borderBottomWidth: 1, borderColor: theme.border, backgroundColor: 'rgba(255,255,255,0.015)' },
  cell: { width: 96, paddingVertical: 10, fontFamily: fonts.body, fontSize: 12, color: theme.textMuted, textAlign: 'right' }, name: { flex: 1, minWidth: 220, textAlign: 'left' }, leagueName: { color: theme.textPrimary, fontFamily: fonts.bodySemiBold }, country: { color: theme.textMuted, fontFamily: fonts.body, fontSize: 10 }, rate: { color: theme.accentGreen, fontFamily: fonts.bodySemiBold }, teamRow: { paddingLeft: 30 }, teamName: { color: theme.textMuted }, empty: { padding: spacing.md, color: theme.textMuted }, note: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted, lineHeight: 17, marginTop: spacing.sm },
});
