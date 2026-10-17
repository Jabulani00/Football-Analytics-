import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';

import { useFootyStats } from '@/hooks/useFootyStats';
import { HALF_ONLY_STATS, PPG_STATS } from '@/services/statsBuilder';
import type { FootyFixture } from '@/services/footyMarketStats';
import { MIN_SERIES, SERIES_DEFS } from '@/utils/fixtureSeries';
import { fonts, spacing, theme } from '@/styles/theme';

type Metric = string;
type StatPeriod = 'overall' | 'firstHalf' | 'secondHalf' | 'fullTime' | 'unavailable';
type StatDef = { id: string; label: string; period: StatPeriod; reason?: string };
type Scope = 'overall' | 'home' | 'away';
type WindowSize = 0 | 5 | 6 | 8 | 10;
type Row = { name: string; country: string; id: number; played: number; hits: number; pct: number; teams: TeamRow[] };
type TeamRow = { name: string; played: number; hits: number; pct: number };
type BuilderConfig = { metrics: Metric[]; method: 'all' | 'any'; teamMetrics: Metric[]; teamMethod: 'all' | 'any'; minLeaguePct: number; minTeamPct: number; scope: Scope; windowSize: WindowSize; requireSeries: boolean; requireGoalWithin10: boolean };
type SavedBuilder = BuilderConfig & { id: string; name: string };
const SAVED_BUILDERS_KEY = 'scoreline.saved-league-builders.v1';

const lineStats = (prefix: string, label: string, period: StatPeriod): StatDef[] => [
  ...[0.5, 1.5, 2.5, 3.5, 4.5].flatMap((line) => [
    { id: `${prefix}:over${String(line).replace('.', '')}`, label: `${label} · Over ${line}`, period },
    { id: `${prefix}:under${String(line).replace('.', '')}`, label: `${label} · Under ${line}`, period },
  ]),
  { id: `${prefix}:btts_yes`, label: `${label} BTTS — Yes`, period },
  { id: `${prefix}:btts_no`, label: `${label} BTTS — No`, period },
];
const outcomeStats = (prefix: string, label: string, period: StatPeriod): StatDef[] => [
  { id: `${prefix}:win`, label: `${label} Win`, period }, { id: `${prefix}:draw`, label: `${label} Draw`, period },
  { id: `${prefix}:loss`, label: `${label} Loss`, period }, { id: `${prefix}:scoring_05`, label: `${label} Scores 1+`, period },
  { id: `${prefix}:scoring_15`, label: `${label} Scores 2+`, period }, { id: `${prefix}:scoring_25`, label: `${label} Scores 3+`, period },
  { id: `${prefix}:conceding_05`, label: `${label} Concedes 1+`, period }, { id: `${prefix}:cs`, label: `${label} Clean sheet`, period },
  { id: `${prefix}:conceding_15`, label: `${label} Concedes 2+`, period }, { id: `${prefix}:conceding_25`, label: `${label} Concedes 3+`, period },
  { id: `${prefix}:fts`, label: `${label} Fails to score`, period },
];
const fullTimePatternStats: StatDef[] = [
  ...[
    ['btts_both_halves', 'BTTS both halves'], ['scored_both_halves', 'Team scores in both halves'],
    ['conceded_both_halves', 'Team concedes in both halves'], ['won_both_halves', 'Won both halves'],
    ['btts_over25', 'BTTS + over 2.5'], ['win_to_nil', 'Win to nil'], ['lost_to_nil', 'Lost to nil'],
    ['rescued_points', 'Rescued points (trailed HT, avoided loss)'], ['blown_points', 'Blown points (led HT, did not win)'],
    ['led_ht', 'Led at half-time'],
  ].map(([key, label]) => ({ id: `ft:${key}`, label, period: 'fullTime' as const })),
  ...(['ww', 'wd', 'wl', 'dw', 'dd', 'dl', 'lw', 'ld', 'll'] as const).map((result) => ({
    id: `ft:htft_${result}`, label: `HT/FT ${result.toUpperCase()}`, period: 'fullTime' as const,
  })),
];
const SERIES_ALIASES: Record<string, { key: string; invert?: boolean; label: string }> = {
  win_streak: { key: 'win', label: 'Win streak' }, unbeaten_streak: { key: 'loss', invert: true, label: 'Unbeaten streak' },
  loss_streak: { key: 'loss', label: 'Loss streak' }, btts_streak: { key: 'btts_yes', label: 'BTTS streak' },
  over25_streak: { key: 'over25', label: 'Over 2.5 streak' }, cs_streak: { key: 'cs', label: 'Clean-sheet streak' },
  fts_streak: { key: 'fts', label: 'Failed-to-score streak' }, scoring_streak: { key: 'scoring_05', label: 'Scoring streak' },
};
const SERIES_BASE_KEYS: Record<string, string> = {
  without_scoring_15: 'scoring_15', without_conceding_15: 'conceding_15',
  without_scoring_25: 'scoring_25', without_conceding_25: 'conceding_25',
  without_w: 'w', without_d: 'd', without_l: 'l',
};
const seriesStats = (prefix: string, period: StatPeriod): StatDef[] => SERIES_DEFS.map((def) => ({
  id: `series:${prefix}:${def.key}`, label: `${prefix === 'ht' ? '1st half' : prefix === '2h' ? '2nd half' : period === 'overall' ? 'Overall' : 'Full time'} series · ${def.label}`, period,
})).concat(Object.entries(SERIES_ALIASES).map(([key, alias]) => ({
  id: `series:${prefix}:${key}`, label: `${prefix === 'ht' ? '1st half' : prefix === '2h' ? '2nd half' : period === 'overall' ? 'Overall' : 'Full time'} series · ${alias.label}`, period,
})));
const STAT_PANELS: { id: StatPeriod; label: string; note: string; stats: StatDef[] }[] = [
  { id: 'overall', label: 'Overall', note: 'Full-match goal patterns and current form series', stats: [...lineStats('overall', 'Overall', 'overall'), ...seriesStats('ft', 'overall')] },
  { id: 'firstHalf', label: '1st Half', note: 'HT score-derived patterns; missing HT scores are excluded', stats: [...lineStats('ht', '1st-half', 'firstHalf'), ...outcomeStats('ht', '1st-half', 'firstHalf'), ...seriesStats('ht', 'firstHalf')] },
  { id: 'secondHalf', label: '2nd Half', note: 'Second half is FT minus HT', stats: [...lineStats('2h', '2nd-half', 'secondHalf'), ...outcomeStats('2h', '2nd-half', 'secondHalf'), ...seriesStats('2h', 'secondHalf')] },
  { id: 'fullTime', label: 'Full Time', note: 'Full-time team outcomes, scored-half patterns and HT/FT combinations', stats: [...lineStats('ft', 'Full-time', 'fullTime'), ...outcomeStats('ft', 'Full-time', 'fullTime'), ...fullTimePatternStats, ...seriesStats('ft', 'fullTime')] },
];
const METRICS = STAT_PANELS.flatMap((panel) => panel.stats);
const UNIQUE_METRICS = [...new Map(METRICS.map((item) => [item.id, item])).values()];
const UNAVAILABLE_STATS: StatDef[] = [
  { id: 'unavailable:scored_first', label: 'Scored first', period: 'unavailable', reason: 'Per-goal order is not supplied in the league results feed.' },
  { id: 'unavailable:conceded_first', label: 'Conceded first', period: 'unavailable', reason: 'Per-goal order is not supplied in the league results feed.' },
  { id: 'unavailable:goal_minute', label: 'Goal in first 10 minutes', period: 'unavailable', reason: 'Verified per-match goal minutes are not available in this feed.' },
  ...['sc_avg', 'conc_avg', 'avg_goals'].map((label) => ({ id: `unavailable:average:${label}`, label: `Average · ${label}`, period: 'unavailable' as const, reason: 'The available strategy formula compares per-match hit conditions; averages need a numeric comparison operator and threshold.' })),
  ...['handicap', 'early_goals_1h', 'early_goals_2h', 'early_goals_conceded', 'late_goals'].map((label) => ({ id: `unavailable:ordinary:${label}`, label: `Ordinary · ${label}`, period: 'unavailable' as const, reason: 'The league fixture feed does not provide the event-level fields needed to verify this statistic.' })),
  ...PPG_STATS.map((label) => ({ id: `unavailable:ppg:${label}`, label: `PPG · ${label}`, period: 'unavailable' as const, reason: label.includes('green') || label.includes('yellow') || label.includes('red') ? 'Opponent-tier PPG needs standings ranks; numeric PPG filters also need an aggregate comparison control.' : 'PPG is available from results but needs an aggregate comparison control in this formula builder.' })),
  ...HALF_ONLY_STATS.filter((key) => key === 'half_avg').map((label) => ({ id: `unavailable:half:${label}`, label: `Half stat · ${label}`, period: 'unavailable' as const, reason: 'Average-valued stats need a numeric threshold control; this formula currently uses hit conditions.' })),
  ...[
    'SC* 1H%', 'SC* 2H%', 'AVG* 1H%', 'Conc* 1H%', 'Conc* 2H%', 'AVG* 2H%',
    'FHG_T (AVG)', 'FHG_T (consistency)', 'FHG_L (AVG)', 'FHG_L (consistency)',
    'Most goals · match (1H/2H/tie)', 'Most goals scored (1H/2H/tie)', 'Most goals conceded (1H/2H/tie)',
    'BTTS · win', 'BTTS · draw', 'BTTS · loss', 'Least clean sheets', 'Best form', 'Worst form',
    'Best performance', 'Worst performance',
  ].map((label) => ({ id: `unavailable:mixed:${label}`, label: `Mixed · ${label}`, period: 'unavailable' as const, reason: 'This existing mixed statistic is visible in the Mixed Stats panel but needs cross-table aggregation or numeric comparison support here.' })),
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
const LEGACY_METRICS: Record<string, string> = {
  over05: 'ft:over05', over15: 'ft:over15', over25: 'ft:over25', over35: 'ft:over35', btts: 'ft:btts_yes',
  firstHalfOver05: 'ht:over05', firstHalfBtts: 'ht:btts_yes', secondHalfBtts: '2h:btts_yes',
};
const normalizeMetric = (metric: string) => LEGACY_METRICS[metric] ?? metric;

function matchesMetric(fx: FootyFixture, metric: Metric, teamName?: string): boolean | null {
  if (metric.startsWith('series:')) {
    const [, period, key] = metric.split(':');
    const alias = SERIES_ALIASES[key];
    if (alias) {
      const matched = matchesMetric(fx, `${period}:${alias.key}`, teamName);
      return matched == null ? null : alias.invert ? !matched : matched;
    }
    const definition = SERIES_DEFS.find((item) => item.key === key);
    if (!definition) return null;
    const matched = matchesMetric(fx, `${period}:${SERIES_BASE_KEYS[key] ?? key}`, teamName);
    return matched == null ? null : definition.invert ? !matched : matched;
  }
  if (fx.homeGoals == null || fx.awayGoals == null) return null;
  const normalized = normalizeMetric(metric);
  const [period, key] = normalized.split(':');
  if (period === 'unavailable') return null;
  let home = fx.homeGoals;
  let away = fx.awayGoals;
  const ftHome = fx.homeGoals;
  const ftAway = fx.awayGoals;
  if (period === 'ht' || period === '2h') {
    if (fx.htHome == null || fx.htAway == null || fx.regulation === false) return null;
    if (period === 'ht') { home = fx.htHome; away = fx.htAway; }
    else { home = fx.homeGoals - fx.htHome; away = fx.awayGoals - fx.htAway; }
  }
  if (home < 0 || away < 0) return null;
  if (teamName === fx.awayName) [home, away] = [away, home];
  const total = home + away;
  const hth = teamName === fx.awayName ? fx.htAway : fx.htHome;
  const hta = teamName === fx.awayName ? fx.htHome : fx.htAway;
  if (key.startsWith('htft_') || ['btts_both_halves', 'scored_both_halves', 'conceded_both_halves', 'won_both_halves', 'btts_over25', 'win_to_nil', 'lost_to_nil', 'rescued_points', 'blown_points', 'led_ht'].includes(key)) {
    if (fx.htHome == null || fx.htAway == null || fx.regulation === false) return null;
    const fh = teamName === fx.awayName ? ftAway : ftHome;
    const fa = teamName === fx.awayName ? ftHome : ftAway;
    const th = fh - hth!;
    const ta = fa - hta!;
    if (key.startsWith('htft_')) {
      const outcome = (gf: number, ga: number) => gf > ga ? 'w' : gf < ga ? 'l' : 'd';
      return `${outcome(hth!, hta!)}${outcome(fh, fa)}` === key.slice(5);
    }
    if (key === 'btts_both_halves') return hth! > 0 && hta! > 0 && th > 0 && ta > 0;
    if (key === 'scored_both_halves') return hth! > 0 && th > 0;
    if (key === 'conceded_both_halves') return hta! > 0 && ta > 0;
    if (key === 'won_both_halves') return hth! > hta! && th > ta;
    if (key === 'btts_over25') return fh > 0 && fa > 0 && fh + fa > 2.5;
    if (key === 'win_to_nil') return fh > fa && fa === 0;
    if (key === 'lost_to_nil') return fh < fa && fh === 0;
    if (key === 'rescued_points') return hth! < hta! && fh >= fa;
    if (key === 'blown_points') return hth! > hta! && fh <= fa;
    if (key === 'led_ht') return hth! > hta!;
  }
  const line = /^(over|under)(05|15|25|35|45)$/.exec(key);
  if (line) {
    const threshold = Number(line[2]) / 10;
    return line[1] === 'over' ? total > threshold : total < threshold;
  }
  if (key === 'btts_yes') return home > 0 && away > 0;
  if (key === 'btts_no') return !(home > 0 && away > 0);
  if (key === 'win') return home > away;
  if (key === 'draw') return home === away;
  if (key === 'loss') return home < away;
  if (key === 'scoring_05') return home > 0;
  if (key === 'scoring_15') return home >= 2;
  if (key === 'scoring_25') return home >= 3;
  if (key === 'conceding_05') return away > 0;
  if (key === 'conceding_15') return away >= 2;
  if (key === 'conceding_25') return away >= 3;
  if (key === 'cs') return away === 0;
  if (key === 'fts') return home === 0;
  return null;
}

function matchesFormula(fx: FootyFixture, metrics: Metric[], method: 'all' | 'any', teamName?: string): boolean | null {
  const values = metrics.map((metric) => matchesMetric(fx, metric, teamName));
  // Use three-valued logic for missing period data: a known false fails ALL,
  // and a known true satisfies ANY, even when another selected period is unknown.
  if (method === 'all') {
    if (values.includes(false)) return false;
    return values.includes(null) ? null : true;
  }
  if (values.includes(true)) return true;
  return values.includes(null) ? null : false;
}

function trailingHits(values: (boolean | null)[]): number {
  let length = 0;
  for (let i = values.length - 1; i >= 0; i -= 1) {
    if (values[i] !== true) break;
    length += 1;
  }
  return length;
}

function rankRows(fixtures: FootyFixture[], metrics: Metric[], method: 'all' | 'any', scope: Scope, windowSize: WindowSize, teamMetrics: Metric[], teamMethod: 'all' | 'any', minTeamPct: number, requireSeries: boolean): Row[] {
  const completed = fixtures.filter((fx) => fx.finished && !fx.isCup && !fx.isFriendly && fx.homeGoals != null && fx.awayGoals != null);
  const byLeague = new Map<number, FootyFixture[]>();
  for (const fx of completed) {
    const bucket = byLeague.get(fx.competitionId) ?? [];
    bucket.push(fx);
    byLeague.set(fx.competitionId, bucket);
  }
  const rows: Row[] = [];
  const teamRunRequired = requireSeries || teamMetrics.some((metric) => metric.startsWith('series:'));
  const leagueRunRequired = requireSeries || metrics.some((metric) => metric.startsWith('series:'));
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
      const seriesResults: (boolean | null)[] = [];
      for (const fixture of sample) {
        const hit = matchesFormula(fixture, teamMetrics, teamMethod, name);
        seriesResults.push(hit);
        if (hit == null) continue;
        played += 1;
        if (hit) hits += 1;
      }
      return { name, played, hits, pct: played ? hits * 100 / played : 0, series: trailingHits(seriesResults) >= MIN_SERIES };
    });
    const teamRows = teams.filter((row) => row.played > 0 && row.pct >= minTeamPct && (!teamRunRequired || row.series))
      .sort((a, b) => b.pct - a.pct || b.played - a.played || a.name.localeCompare(b.name));
    // League samples count fixtures once; home/away affects the club table scope.
    const scopedValues = selectedGames.map((fx) => matchesFormula(fx, metrics, method));
    const scopedEval = scopedValues.filter((v): v is boolean => v != null);
    const hits = scopedEval.filter(Boolean).length;
    if (!scopedEval.length || (leagueRunRequired && trailingHits(scopedValues) < MIN_SERIES)) continue;
    rows.push({ name: games[0].competitionName, country: games[0].country, id, played: scopedEval.length, hits, pct: hits * 100 / scopedEval.length, teams: teamRows });
  }
  return rows.sort((a, b) => b.pct - a.pct || b.played - a.played || a.name.localeCompare(b.name));
}

export default function LeagueBuilderPanel() {
  const { width } = useWindowDimensions();
  const wide = width >= 1100;
  const narrow = width < 720;
  const data = useFootyStats({ country: null, competitionId: null, kind: 'domestic' }, { loadSupplementalStats: false });
  const [metrics, setMetrics] = useState<Metric[]>(['ft:over25']);
  const [method, setMethod] = useState<'all' | 'any'>('all');
  const [teamMetrics, setTeamMetrics] = useState<Metric[]>(['ft:over25']);
  const [teamMethod, setTeamMethod] = useState<'all' | 'any'>('all');
  const [minLeaguePct, setMinLeaguePct] = useState(0);
  const [minTeamPct, setMinTeamPct] = useState(60);
  const [scope, setScope] = useState<Scope>('overall');
  const [windowSize, setWindowSize] = useState<WindowSize>(0);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [requireSeries, setRequireSeries] = useState(false);
  const [requireGoalWithin10, setRequireGoalWithin10] = useState(false);
  const [strategyName, setStrategyName] = useState('');
  const [statSearch, setStatSearch] = useState('');
  const [openLibraryPanel, setOpenLibraryPanel] = useState<StatPeriod>('fullTime');
  const [savedBuilders, setSavedBuilders] = useState<SavedBuilder[]>(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return [];
    try { return JSON.parse(window.localStorage.getItem(SAVED_BUILDERS_KEY) ?? '[]') as SavedBuilder[]; } catch { return []; }
  });
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try { window.localStorage.setItem(SAVED_BUILDERS_KEY, JSON.stringify(savedBuilders)); } catch { /* storage may be unavailable */ }
    }
  }, [savedBuilders]);
  const config: BuilderConfig = { metrics, method, teamMetrics, teamMethod, minLeaguePct, minTeamPct, scope, windowSize, requireSeries, requireGoalWithin10 };
  const rows = useMemo(() => (requireGoalWithin10 ? [] : rankRows(data.finished, metrics, method, scope, windowSize, teamMetrics, teamMethod, minTeamPct, requireSeries))
    .filter((row) => row.pct >= minLeaguePct), [data.finished, metrics, method, scope, windowSize, teamMetrics, teamMethod, minLeaguePct, minTeamPct, requireSeries, requireGoalWithin10]);
  const toggleMetric = (id: Metric) => setMetrics((previous) => previous.includes(id)
    ? (previous.length === 1 ? previous : previous.filter((item) => item !== id))
    : [...previous, id]);
  const toggleTeamMetric = (id: Metric) => setTeamMetrics((previous) => previous.includes(id)
    ? (previous.length === 1 ? previous : previous.filter((item) => item !== id))
    : [...previous, id]);
  const futureCalls = useMemo(() => {
    if (requireGoalWithin10 || !metrics.length || !teamMetrics.length) return [];
    const homeTables = rankRows(data.finished, metrics, method, 'home', windowSize, teamMetrics, teamMethod, minTeamPct, requireSeries);
    const awayTables = rankRows(data.finished, metrics, method, 'away', windowSize, teamMetrics, teamMethod, minTeamPct, requireSeries);
    const homeByLeague = new Map(homeTables.map((row) => [row.id, row]));
    const awayByLeague = new Map(awayTables.map((row) => [row.id, row]));
    return data.upcoming.filter((fixture) => !fixture.isCup && !fixture.isFriendly).flatMap((fixture) => {
      const homeLeague = homeByLeague.get(fixture.competitionId);
      const awayLeague = awayByLeague.get(fixture.competitionId);
      const home = homeLeague?.teams.find((team) => team.name === fixture.homeName);
      const away = awayLeague?.teams.find((team) => team.name === fixture.awayName);
      // Keep the minimum of five historical matches before a future call can qualify.
      return homeLeague && awayLeague && home && away && home.pct >= minTeamPct && away.pct >= minTeamPct && homeLeague.pct >= minLeaguePct && awayLeague.pct >= minLeaguePct && home.played >= 5 && away.played >= 5
        ? [{ fixture, home, away, fit: Math.round((home.pct + away.pct + homeLeague.pct + awayLeague.pct) / 4), homeLeaguePct: homeLeague.pct, awayLeaguePct: awayLeague.pct }]
        : [];
    }).sort((a, b) => b.fit - a.fit || a.fixture.unix - b.fixture.unix);
  }, [data.finished, data.upcoming, metrics, method, windowSize, teamMetrics, teamMethod, minTeamPct, minLeaguePct, requireSeries, requireGoalWithin10]);
  const scenarioCount = Math.max(0, Math.pow(2, UNIQUE_METRICS.length) - 1);
  const applyBuilder = (builder: SavedBuilder) => {
    setMetrics([...new Set(builder.metrics.map(normalizeMetric))]); setMethod(builder.method); setTeamMetrics([...new Set(builder.teamMetrics.map(normalizeMetric))]); setTeamMethod(builder.teamMethod);
    setMinLeaguePct(builder.minLeaguePct); setMinTeamPct(builder.minTeamPct); setScope(builder.scope); setWindowSize(builder.windowSize);
    setRequireSeries(builder.requireSeries); setRequireGoalWithin10(builder.requireGoalWithin10);
  };
  const saveBuilder = () => {
    const name = strategyName.trim();
    if (!name) return;
    setSavedBuilders((items) => [...items, { ...config, id: `league-${Date.now()}`, name }]);
    setStrategyName('');
  };

  return <View style={[styles.container, wide && styles.containerWide]}>
    <View style={[styles.heading, !narrow && styles.headingWide]}>
      <View style={styles.headingCopy}>
        <Text style={styles.eyebrow}>STRATEGY BUILDER · LEAGUE EXPLORER</Text>
        <Text style={styles.title}>League rankings & custom stat builder</Text>
        <Text style={styles.copy}>Build and save flexible score-based formulas, compare domestic league and team history, then review matching teams in upcoming fixtures.</Text>
      </View>
      <View style={styles.headingBadge}><View style={styles.liveDot} /><Text style={styles.badgeText}>DOMESTIC LEAGUES</Text></View>
    </View>
    <View style={[styles.builderGrid, wide && styles.builderGridWide, narrow && styles.builderGridNarrow]}>
      <View style={[styles.builderCard, styles.formulaCard]}>
        <Text style={styles.cardTitle}>1. Build the league formula</Text>
        <Text style={styles.label}>STAT LIBRARY · drag into a period panel or select it</Text>
        <Text style={styles.helper}>The score feed supports goal totals, BTTS and score outcomes. Unsupported timing stats are listed separately and cannot enter a formula. {UNIQUE_METRICS.length} selectable conditions support about {scenarioCount.toExponential(1)} possible non-empty combinations.</Text>
        <TextInput accessibilityLabel="Search available stats" placeholder="Search stats (e.g. BTTS, 2nd half, streak)" placeholderTextColor={theme.textMuted} value={statSearch} onChangeText={setStatSearch} style={styles.nameInput} />
        <View style={styles.libraryGroups}>{STAT_PANELS.map((panel) => {
          const expanded = openLibraryPanel === panel.id || !!statSearch.trim();
          const matchingStats = panel.stats.filter((stat) => stat.label.toLowerCase().includes(statSearch.trim().toLowerCase()));
          return <View key={`library-${panel.id}`} style={styles.libraryGroup}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              onPress={() => setOpenLibraryPanel((current) => current === panel.id ? 'unavailable' : panel.id)}
              style={styles.libraryToggle}>
              <Text style={styles.label}>{panel.label.toUpperCase()} · {panel.stats.length} CONDITIONS</Text>
              <Text style={styles.libraryChevron}>{expanded ? '▴' : '▾'}</Text>
            </Pressable>
            {expanded ? <View style={styles.statLibrary}>{matchingStats.map((stat) => <StatChip key={stat.id} stat={stat} active={metrics.includes(stat.id)} onPress={() => toggleMetric(stat.id)} />)}</View> : null}
          </View>;
        })}</View>
        <View style={[styles.periodGrid, wide && styles.periodGridWide]}>
          {STAT_PANELS.map((panel) => {
            const selected = panel.stats.filter((stat) => metrics.includes(stat.id));
            const dropProps = Platform.OS === 'web' ? {
              onDragOver: (event: any) => event.preventDefault(),
              onDrop: (event: any) => {
                event.preventDefault();
                const id = event.dataTransfer?.getData('text/plain');
                if (id && panel.stats.some((stat) => stat.id === id)) setMetrics((current) => current.includes(id) ? current : [...current, id]);
              },
            } : {};
            return <View key={panel.id} {...(dropProps as any)} style={[styles.periodCard, wide && styles.periodCardWide, narrow && styles.periodCardNarrow]}>
              <Text style={styles.periodTitle}>{panel.label} · {selected.length} selected</Text>
              <Text style={styles.helper}>{panel.note}</Text>
              {selected.length ? <View style={styles.controls}>{selected.map((stat) => <Choice key={`selected-${panel.id}-${stat.id}`} label={`${stat.label} ×`} active onPress={() => toggleMetric(stat.id)} />)}</View> : <Text style={styles.dropHint}>Drop compatible stats here</Text>}
            </View>;
          })}
        </View>
        <View style={styles.unsupportedCard}>
          <Text style={styles.label}>OTHER SYSTEM STATS · VISIBLE, NOT YET FORMULA-ELIGIBLE</Text>
          <View style={styles.controls}>{UNAVAILABLE_STATS.map((stat) => <Text key={stat.id} style={styles.unavailable}>{stat.label} · {stat.reason}</Text>)}</View>
        </View>
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
        <Text style={styles.label}>SERIES CONDITION</Text>
        <View style={styles.controls}><Choice label="Rate across sample" active={!requireSeries} onPress={() => setRequireSeries(false)} /><Choice label={`Require an active ${MIN_SERIES}+ game run`} active={requireSeries} onPress={() => setRequireSeries(true)} /></View>
        <Text style={styles.label}>GOAL TIMING</Text>
        <View style={styles.controls}><Choice label="No timing filter" active={!requireGoalWithin10} onPress={() => setRequireGoalWithin10(false)} /><Choice label="Goal in first 10 minutes" active={requireGoalWithin10} onPress={() => setRequireGoalWithin10(true)} /></View>
        <Text style={styles.helper}>First-10-minute events are not present in the league feed; choosing this keeps the strategy but pauses rankings until match-level timing data is available.</Text>
      </View>
    </View>
    <View style={styles.saveCard}>
      <View><Text style={styles.cardTitle}>Save this strategy</Text><Text style={styles.helper}>Keep this formula in this browser and load it again later.</Text></View>
      <View style={styles.saveRow}>
        <TextInput accessibilityLabel="Strategy name" placeholder="Strategy name (e.g. Away early goal)" placeholderTextColor={theme.textMuted} value={strategyName} onChangeText={setStrategyName} style={styles.nameInput} />
        <Pressable accessibilityRole="button" disabled={!strategyName.trim()} onPress={saveBuilder} style={[styles.saveButton, !strategyName.trim() && styles.disabledButton]}><Text style={styles.saveButtonText}>Save strategy</Text></Pressable>
      </View>
      {savedBuilders.length ? <View style={styles.savedList}>{savedBuilders.map((builder) => <View key={builder.id} style={styles.savedItem}>
        <View style={styles.savedInfo}><Text style={styles.savedName}>{builder.name}</Text><Text style={styles.helper}>{builder.metrics.map((id) => METRICS.find((item) => item.id === normalizeMetric(id))?.label ?? id).join(' + ')} · {SCOPES.find((item) => item.id === builder.scope)?.label} · {WINDOWS.find((item) => item.id === builder.windowSize)?.label}{builder.requireSeries ? ' · streak' : ''}{builder.requireGoalWithin10 ? ' · first 10′' : ''}</Text></View>
        <View style={styles.savedActions}><Pressable accessibilityRole="button" onPress={() => applyBuilder(builder)}><Text style={styles.actionText}>Load</Text></Pressable><Pressable accessibilityRole="button" onPress={() => setSavedBuilders((items) => items.filter((item) => item.id !== builder.id))}><Text style={styles.deleteText}>Delete</Text></Pressable></View>
      </View>)}</View> : null}
    </View>
    {data.loading ? <View style={styles.loading}><ActivityIndicator color={theme.accentGreen} /><Text style={styles.copy}>Loading finished domestic league results…</Text></View> : null}
    {data.error ? <Text style={styles.error}>{data.error}</Text> : null}
    {requireGoalWithin10 ? <View style={styles.dataGap}><Text style={styles.dataGapTitle}>First-10-minute filter can’t be evaluated yet</Text><Text style={styles.copy}>The league data includes final and half-time scores, plus aggregated 15-minute timing data. It does not include per-match goal events precise enough to verify a goal by minute 10. Rankings are paused for this filter to avoid showing misleading results.</Text></View> : null}
    {!data.loading ? <View style={styles.resultsHeading}><View><Text style={styles.cardTitle}>League leaderboard</Text><Text style={styles.coverage}>Ranked {rows.length} leagues from {data.loadedLeagues} loaded active leagues · completed score data{data.capped ? ' · provider-load limit is active' : ''}</Text></View><Text style={styles.sortBadge}>RATE ↓</Text></View> : null}
    {!data.loading ? <View style={styles.futureCard}>
      <View><Text style={styles.cardTitle}>Upcoming team candidates</Text><Text style={styles.helper}>Fixtures in the next 48 hours whose home team’s home sample and away team’s away sample meet your formula. Minimum 5 historical matches each; these historical fit rates are not outcome probabilities.</Text></View>
      {futureCalls.slice(0, 30).map(({ fixture, home, away, fit, homeLeaguePct, awayLeaguePct }) => <View key={fixture.id} style={styles.futureRow}>
        <Text style={styles.futureMatch}>{fixture.homeName} vs {fixture.awayName}</Text>
        <Text style={styles.helper}>{fixture.competitionName} · {new Date(fixture.unix * 1000).toLocaleString()}</Text>
        <Text style={styles.rate}>{fit}% combined historical fit</Text>
        <Text style={styles.helper}>{fixture.homeName} home {home.pct.toFixed(1)}% (n={home.played}) · {fixture.awayName} away {away.pct.toFixed(1)}% (n={away.played}) · league rates {homeLeaguePct.toFixed(1)}% / {awayLeaguePct.toFixed(1)}%</Text>
      </View>)}
      {!futureCalls.length ? <Text style={styles.helper}>No upcoming fixture currently meets the selected filters and five-match sample minimum.</Text> : null}
    </View> : null}
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
            <View style={styles.controls}>{UNIQUE_METRICS.map((metric) => <StatChip key={`team-${metric.id}`} stat={metric} active={teamMetrics.includes(metric.id)} onPress={() => toggleTeamMetric(metric.id)} />)}</View>
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

function StatChip({ stat, active, onPress }: { stat: StatDef; active: boolean; onPress: () => void }) {
  const dragProps = Platform.OS === 'web' ? {
    draggable: true,
    onDragStart: (event: any) => event.dataTransfer?.setData('text/plain', stat.id),
  } : {};
  return <Pressable
    accessibilityRole="button"
    accessibilityState={{ selected: active }}
    onPress={onPress}
    {...(dragProps as any)}
    style={[styles.statChip, active && styles.statChipActive]}>
    <Text style={[styles.statChipText, active && styles.statChipTextActive]}>{active ? '✓ ' : '＋ '}{stat.label}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  container: { width: '100%', gap: spacing.md, padding: spacing.md, borderRadius: 16, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.bg },
  containerWide: { padding: spacing.xl, gap: spacing.lg },
  heading: { gap: spacing.sm }, headingWide: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, headingCopy: { flex: 1, gap: 4 },
  eyebrow: { fontFamily: fonts.bodySemiBold, fontSize: 10, letterSpacing: 1.4, color: theme.accentGreen },
  title: { fontFamily: fonts.display, fontSize: 26, color: theme.textPrimary },
  copy: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: theme.textMuted },
  headingBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: theme.border, borderRadius: 999, backgroundColor: theme.surface },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: theme.accentGreen }, badgeText: { fontFamily: fonts.bodySemiBold, fontSize: 10, letterSpacing: 0.6, color: theme.textMuted },
  builderGrid: { gap: spacing.md }, builderGridWide: { flexDirection: 'row', alignItems: 'stretch' }, builderGridNarrow: { flexDirection: 'column' },
  builderCard: { padding: spacing.md, borderRadius: 12, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface, gap: 4 },
  periodGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  periodGridWide: { gap: spacing.md },
  periodCard: { width: '100%', padding: spacing.sm, gap: 8, borderWidth: 1, borderColor: theme.border, borderRadius: 10, backgroundColor: theme.bg },
  periodCardWide: { width: '48%' },
  periodCardNarrow: { width: '100%' },
  periodTitle: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: theme.textPrimary },
  dropHint: { padding: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: theme.borderStrong, borderRadius: 8, color: theme.textFaint, fontFamily: fonts.body, fontSize: 11 },
  libraryGroups: { gap: spacing.sm, padding: spacing.sm, borderWidth: 1, borderColor: theme.border, borderRadius: 10, backgroundColor: theme.bg },
  libraryGroup: { gap: 5 },
  libraryToggle: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.sm, borderWidth: 1, borderColor: theme.border, borderRadius: 8, backgroundColor: theme.bg },
  libraryChevron: { color: theme.accentGreen, fontSize: 16, paddingHorizontal: spacing.xs },
  statLibrary: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  statChip: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface },
  statChipActive: { borderColor: theme.accentGreen, backgroundColor: 'rgba(0,180,120,0.12)' },
  statChipText: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted },
  statChipTextActive: { color: theme.accentGreen, fontFamily: fonts.bodySemiBold },
  unsupportedCard: { padding: spacing.sm, borderWidth: 1, borderColor: theme.border, borderRadius: 10, backgroundColor: theme.bg, gap: 6 },
  unavailable: { width: '100%', fontFamily: fonts.body, fontSize: 11, lineHeight: 16, color: theme.textFaint },
  saveCard: { padding: spacing.md, borderRadius: 12, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface, gap: spacing.sm },
  helper: { fontFamily: fonts.body, fontSize: 11, lineHeight: 16, color: theme.textMuted },
  saveRow: { flexDirection: 'row', gap: 8 }, nameInput: { flex: 1, minWidth: 140, borderWidth: 1, borderColor: theme.border, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 9, color: theme.textPrimary, backgroundColor: theme.bg, fontFamily: fonts.body, fontSize: 13 },
  saveButton: { justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 9, backgroundColor: theme.accentGreen }, disabledButton: { opacity: 0.45 }, saveButtonText: { color: theme.bg, fontFamily: fonts.bodySemiBold, fontSize: 12 },
  savedList: { gap: 6 }, savedItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, padding: 10, borderRadius: 9, backgroundColor: theme.bg }, savedInfo: { flex: 1, gap: 3 }, savedName: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.textPrimary }, savedActions: { flexDirection: 'row', gap: 14 }, actionText: { color: theme.accentGreen, fontFamily: fonts.bodySemiBold, fontSize: 12 }, deleteText: { color: theme.loss, fontFamily: fonts.body, fontSize: 12 },
  dataGap: { gap: 6, padding: spacing.md, borderRadius: 10, borderWidth: 1, borderColor: theme.loss, backgroundColor: 'rgba(220,70,70,0.07)' }, dataGapTitle: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: theme.loss },
  formulaCard: { flex: 1.25 }, refineCard: { flex: 1, minWidth: 300 }, cardTitle: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: theme.textPrimary },
  label: { fontFamily: fonts.bodySemiBold, fontSize: 10, color: theme.textMuted, letterSpacing: 0.8, marginTop: spacing.sm },
  controls: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, choice: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.bg },
  choiceActive: { borderColor: theme.accentGreen, backgroundColor: 'rgba(0,180,120,0.12)' }, choiceText: { fontFamily: fonts.body, fontSize: 12, color: theme.textMuted }, choiceTextActive: { color: theme.accentGreen, fontFamily: fonts.bodySemiBold },
  refineRow: { flexDirection: 'row', gap: spacing.md }, refineColumn: { flexDirection: 'column' }, refineGroup: { flex: 1 },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: spacing.md }, error: { color: theme.loss },
  resultsHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, marginTop: spacing.sm },
  coverage: { fontFamily: fonts.body, fontSize: 12, color: theme.textMuted, marginTop: 4 }, sortBadge: { fontFamily: fonts.bodySemiBold, fontSize: 10, color: theme.accentGreen, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: 'rgba(0,180,120,0.1)' },
  tableScroll: { width: '100%', marginTop: spacing.xs }, table: { width: '100%', minWidth: 580, borderWidth: 1, borderColor: theme.border, borderRadius: 10, overflow: 'hidden' }, tableWide: { minWidth: 0 }, tableNarrow: { minWidth: 520 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: theme.border }, header: { backgroundColor: theme.surface }, alt: { backgroundColor: 'rgba(255,255,255,0.025)' },
  teamBuilder: { padding: spacing.md, borderBottomWidth: 1, borderColor: theme.border, backgroundColor: 'rgba(255,255,255,0.015)' },
  futureCard: { gap: spacing.sm, padding: spacing.md, borderWidth: 1, borderColor: theme.border, borderRadius: 12, backgroundColor: theme.surface },
  futureRow: { gap: 3, paddingVertical: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderColor: theme.border },
  futureMatch: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.textPrimary },
  cell: { width: 96, paddingVertical: 10, fontFamily: fonts.body, fontSize: 12, color: theme.textMuted, textAlign: 'right' }, name: { flex: 1, minWidth: 220, textAlign: 'left' }, leagueName: { color: theme.textPrimary, fontFamily: fonts.bodySemiBold }, country: { color: theme.textMuted, fontFamily: fonts.body, fontSize: 10 }, rate: { color: theme.accentGreen, fontFamily: fonts.bodySemiBold }, teamRow: { paddingLeft: 30 }, teamName: { color: theme.textMuted }, empty: { padding: spacing.md, color: theme.textMuted }, note: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted, lineHeight: 17, marginTop: spacing.sm },
});
