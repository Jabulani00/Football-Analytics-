import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Platform } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { useQueries } from '@tanstack/react-query';

import DragScroll from '@/components/shared/DragScroll';
import FilterDropdown from '@/components/shared/FilterDropdown';
import PageControls, { PAGE_SIZE } from '@/components/shared/PageControls';
import { useLiveCompetitionFeed } from '@/hooks/useLiveCompetitions';
import { useLiveFixtures } from '@/hooks/useLiveFixtures';
import { useSavedBuilderStrategies } from '@/hooks/useSavedBuilderStrategies';
import { fetchAllFixturesBetween, fetchSeasonStandings, seasonWindowUnix, type Fixture, type RawFixture } from '@/services/oddAlerts';
import { TARGET_MARKETS, backtestTeam, targetMarket, type BacktestResult, type BacktestScope, type TargetMarket } from '@/utils/strategyBacktest';
import { clientStaleTime } from '@/services/oddAlertsCachePolicy';
import { buildLeagueStatsLive } from '@/services/statsBuilder';
import { nextFixtureFor, type UpcomingLite } from '@/utils/statsGrading';
import { ordinaryRfsForStat, recentFormForStat, type RecentForm, type StatRfs } from '@/utils/fixtureRfs';
import { teamResultsFromFixtures } from '@/utils/teamResults';
import {
  COLUMN_LABEL, DIMENSIONS, FIXTURE_SIDES, QUAL_COLUMNS, STRATEGY_PRESETS, TIMING_STATE_OPTIONS, buildStrategyConfig, conditionLabel, conditionMembership,
  daLevelOf, evaluateFixtureSides, evaluateStrategy, filterResults, getDimension, gradeShareByLeague,
  matchStrength, needsExport, needsFixtures, periodFrom, periodLabel, rankTeamsForStat, resultBackground, resultColour,
  splitPeriod, summarize, teamHalfBreakdown,
  type CondMembership, type Condition, type Dimension, type FixtureSide, type GradeQualification, type HalfReading, type LeagueBundle, type LeagueGradeShare,
  type DominantVenue, type ResultColor, type SavedStrategy, type StatHalf, type StatRank, type StatScope, type StatTier, type StrategyLogic, type StrategyPeriod,
  type StrategyPreset, type StrategyResult, type TeamEval,
} from '@/utils/strategyBuilder';
import { fonts, layout, spacing, theme } from '@/styles/theme';

const ALL = 'all';
let CONDITION_SEQ = 0;

// Remember that the explainer has been shown, so it auto-opens only on a first visit.
const HELP_SEEN_KEY = 'scoreline.strategy-builder.help-seen.v1';
function helpSeen(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return true;
  try { return window.localStorage.getItem(HELP_SEEN_KEY) === '1'; } catch { return true; }
}
function markHelpSeen(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try { window.localStorage.setItem(HELP_SEEN_KEY, '1'); } catch { /* ignore */ }
}

function defaultOptions(dimensionId: string): Record<string, string> {
  const dim = getDimension(dimensionId);
  const out: Record<string, string> = {};
  for (const o of dim?.options ?? []) out[o.key] = o.default;
  return out;
}
/** Feature list for a dimension, honouring an options-driven list when present. */
function methodsOf(dim: Dimension, period: StrategyPeriod, options: Record<string, string>) {
  return dim.methodsFor ? dim.methodsFor(period, options) : dim.methods(period);
}

/**
 * Rule categories — chips that group the long stat list by family (Grading,
 * Mixed, Ordinary, PPG, Series, FT-only, Markets, Characters, Opposite, Omit…).
 * Tapping one filters the stat dropdown to just that family's options, so every
 * stat under it is one pick away instead of being hunted in one huge list.
 */
const RULE_CATEGORIES: { id: string; label: string }[] = [
  { id: 'all', label: 'All stats' },
  { id: 'grading', label: '⭐ Grading' },
  { id: 'mixed', label: '🧮 Mixed stats' },
  { id: 'ordinary', label: '📊 Ordinary' },
  { id: 'ppg', label: '📐 PPG' },
  { id: 'series', label: '🔥 Series' },
  { id: 'ftonly', label: '📈 FT-only' },
  { id: 'markets', label: '🎯 Markets' },
  { id: 'characters', label: '🎭 Characters' },
  { id: 'opposite', label: '🪞 Opposite' },
  { id: 'omit', label: '🧪 Omit' },
  { id: 'power', label: '⚡ Power Dynamics' },
];
/** Which category a Rule stat value belongs to (by its method-id prefix). */
function inCategory(id: string, value: string): boolean {
  switch (id) {
    case 'grading': return !value.includes(':') && !value.startsWith('mk_'); // plain gradable columns
    case 'markets': return value.startsWith('mk_');
    case 'mixed': return value.startsWith('mx:');
    case 'ordinary': return value.startsWith('sf:ordinary:');
    case 'ppg': return value.startsWith('sf:ppg:');
    case 'series': return value.startsWith('sf:series:');
    case 'ftonly': return value.startsWith('sf:ftonly:');
    case 'characters': return value.startsWith('ch:');
    case 'opposite': return value.startsWith('op:');
    case 'omit': return value.startsWith('om:');
    case 'power': return value.startsWith('pd:');
    default: return true; // 'all'
  }
}
function kickoffLabel(unix: number, fallback: string): string {
  if (!Number.isFinite(unix) || unix <= 0) return fallback;
  try {
    return new Date(unix * 1000).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch { return fallback; }
}
/** Gap/DA tier (top/mid/bottom third of the ranked list) → label + traffic-light colour. */
const TIER_LABEL: Record<StatTier, string> = { top: 'TOP', mid: 'MID', bottom: 'BOT' };
function tierColor(t: StatTier): string {
  return t === 'top' ? theme.accentGreen : t === 'mid' ? theme.yellow : theme.loss;
}
/** Short label for the venue the stat is stronger at. */
function domText(d: DominantVenue | null | undefined): string | null {
  return d === 'home' ? '🏠 Home' : d === 'away' ? '✈ Away' : null;
}

/** The Home vs Overall numbers that quantify a DA (Double Agent), when the grade carries one. */
function daQuantText(ev: TeamEval | null | undefined): string | null {
  if (!ev || !daLevelOf(ev.grade) || !ev.daInfo) return null;
  const { home, overall } = ev.daInfo;
  if (home == null || overall == null) return null;
  return `H ${Math.round(home)}% · O ${Math.round(overall)}% · Δ${Math.round(Math.abs(home - overall))}`;
}

const COLOR_GROUPS: { value: ResultColor; label: string }[] = [
  { value: 'green', label: 'Green · strongest' },
  { value: 'yellow', label: 'Yellow · middle' },
  { value: 'red', label: 'Red · weakest' },
  { value: 'none', label: 'Ungraded' },
];
/** Combined-list grade groups (I strongest → VII weakest) for the grading filter. */
const GRADE_GROUPS: { value: string; label: string }[] =
  (['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'] as const).map((r) => ({ value: r, label: `Group (${r})` }));
/** The A–F letter grades (document's grading list). */
const GRADE_LETTERS: { value: string; label: string }[] = [
  { value: 'A', label: 'A · Home↑ Overall↑' }, { value: 'B', label: 'B · Home↑ Overall mid · DA' }, { value: 'C', label: 'C · mid, above league · DA' },
  { value: 'D', label: 'D · mid, below league' }, { value: 'E', label: 'E · Home↓ Overall mid · DA' }, { value: 'F', label: 'F · Home↓ Overall↓' },
];
/** The source lists (game windows). */
const GRADE_SOURCES: { value: string; label: string }[] = [
  { value: '1', label: '1 · All games' }, { value: '2', label: '2 · Last 10 & 8' }, { value: '3', label: '3 · Last 6 & 5' },
];

/** A qualifying fixture: the conditions each team satisfied, and the strongest colour. */
type FxRow = { fx: Fixture; homeEvals: TeamEval[]; awayEvals: TeamEval[]; color: ResultColor; rank?: number };
const FX_COLOR_RANK: Record<ResultColor, number> = { green: 3, yellow: 2, red: 1, none: 0 };
/** The three-colour split for the results — by the matched side's strongest grade. */
const COLOR_SECTIONS: { color: ResultColor; label: string }[] = [
  { color: 'green', label: 'GREEN · strongest' },
  { color: 'yellow', label: 'YELLOW · middle' },
  { color: 'red', label: 'RED · weakest' },
  { color: 'none', label: 'UNGRADED' },
];

export default function StrategyBuilderPanel() {
  const { width } = useWindowDimensions();
  const narrow = width < 720;
  const wide = width >= 1024;

  const feed = useLiveCompetitionFeed(3);
  const liveLeagues = useMemo(() => feed.competitions.filter((c) => c.rank === 0), [feed.competitions]);

  // ---- explainer (auto-opens on a first visit, reopen any time) ----
  const [showHelp, setShowHelp] = useState<boolean>(() => !helpSeen());
  const closeHelp = () => { setShowHelp(false); markHelpSeen(); };
  const openHelp = () => setShowHelp(true);

  // ---- query: the strategy ----
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [logic, setLogic] = useState<StrategyLogic>('and');
  // How conditions are composed: one combined builder, or separate Home | Away panels.
  const [buildMode, setBuildMode] = useState<'combined' | 'split'>('combined');

  // ---- result mode + filters ----
  const [resultMode, setResultMode] = useState<'teams' | 'fixtures'>('teams');
  // Teams-mode historical success rate: the market to score qualifying teams against (ALL = off).
  const [target, setTarget] = useState<string>(ALL);

  // ---- saved strategies (the HOW only — recomputed live on load) ----
  const { saved, save, remove } = useSavedBuilderStrategies();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [draftName, setDraftName] = useState('');

  const wantExport = conditions.length > 0 && needsExport(conditions);
  const teamsNeedFixtures = conditions.length > 0 && needsFixtures(conditions);
  // The grading RFS overlay reads season fixtures; bounded to the capped leagues to limit load.
  const rfsNeedsFixtures = conditions.some((c) => c.dimensionId === 'grading1');
  // Goal-timing stats (first-15 / last-20) read stats/season per league — fetched
  // only when a timing Rule is in play, bounded to the capped leagues.
  const timingNeeded = conditions.some((c) => c.dimensionId === 'grading1' && c.methodId.startsWith('tm_'));
  // A chosen target market needs the season fixtures to backtest (bounded to the capped leagues).
  const wantBacktest = resultMode === 'teams' && target !== ALL && conditions.length > 0;
  const targetDef = useMemo(() => (target !== ALL ? targetMarket(target) : undefined), [target]);

  // ---- upcoming fixtures (each team's next match, and the fixtures shown in Fixtures mode) ----
  const up = useLiveFixtures('ns', { upcomingDays: 7, upcomingScope: 'all' });
  const upcoming: UpcomingLite[] = useMemo(
    () => up.fixtures.map((fx) => ({ id: fx.id, kickoffUnix: fx.kickoffUnix, kickoff: fx.kickoff, competition: fx.competition.name, homeId: fx.home.id, homeName: fx.home.name, awayId: fx.away.id, awayName: fx.away.name })),
    [up.fixtures],
  );

  // Fixtures mode builds season stats only for the most active ongoing leagues
  // that actually have upcoming fixtures — bounding the API load (Teams-mode
  // fixtures conditions still cover every league).
  const FIXTURE_LEAGUE_CAP = 24;
  const fixtureCompIds = useMemo(() => {
    const live = new Set(liveLeagues.map((l) => l.id));
    const counts = new Map<number, number>();
    for (const fx of up.fixtures) {
      if (!live.has(fx.competition.id) || fx.home.id == null || fx.away.id == null) continue;
      counts.set(fx.competition.id, (counts.get(fx.competition.id) ?? 0) + 1);
    }
    return new Set([...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, FIXTURE_LEAGUE_CAP).map(([id]) => id));
  }, [liveLeagues, up.fixtures]);
  // In Fixtures mode only the capped leagues are ever shown, so both exports and
  // season fixtures are fetched only for them — even for export/fixtures-based
  // conditions. Teams mode still spans every league.
  const needFixturesFor = (compId: number) => (resultMode === 'teams'
    ? (teamsNeedFixtures || ((wantBacktest || rfsNeedsFixtures) && fixtureCompIds.has(compId)))
    : ((teamsNeedFixtures || rfsNeedsFixtures) && fixtureCompIds.has(compId)));
  const needExportFor = (compId: number) => (resultMode === 'teams' ? wantExport : wantExport && fixtureCompIds.has(compId));
  const needTimingFor = (compId: number) => timingNeeded && fixtureCompIds.has(compId);

  // ---- per-league data (reused engines; built only when a condition/mode needs it) ----
  const exportResults = useQueries({
    queries: liveLeagues.map((comp) => {
      const { fromUnix, toUnix } = seasonWindowUnix(comp.season ?? '');
      return {
        queryKey: ['strategy-export', comp.id, comp.season] as const,
        enabled: needExportFor(comp.id),
        queryFn: () => buildLeagueStatsLive((o) => fetchAllFixturesBetween(o), { competitionId: comp.id, fromUnix, toUnix, season: comp.season }),
        staleTime: clientStaleTime('stats/season'),
      };
    }),
  });
  const fixtureResults = useQueries({
    queries: liveLeagues.map((comp) => {
      const { fromUnix, toUnix } = seasonWindowUnix(comp.season ?? '');
      return {
        queryKey: ['strategy-fixtures', comp.id, comp.season] as const,
        enabled: needFixturesFor(comp.id),
        queryFn: ({ signal }: { signal: AbortSignal }) => fetchAllFixturesBetween({ fromUnix, toUnix, competitions: String(comp.id), perPage: 250, maxPages: 8 }, signal),
        staleTime: clientStaleTime('stats/season'),
      };
    }),
  });

  const timingResults = useQueries({
    queries: liveLeagues.map((comp) => ({
      queryKey: ['strategy-timing', comp.id, comp.seasonId] as const,
      enabled: needTimingFor(comp.id) && comp.seasonId != null,
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        fetchSeasonStandings(comp.seasonId as number, signal).then((rows) =>
          rows.map((r) => ({ team: r.name, teamId: r.teamId, timing: r.timing })),
        ),
      staleTime: clientStaleTime('stats/season'),
    })),
  });

  const exportSig = exportResults.map((r, i) => (r.data ? `${liveLeagues[i]?.id}:${r.dataUpdatedAt}` : '')).join('|');
  const fixtureSig = fixtureResults.map((r, i) => (r.data ? `${liveLeagues[i]?.id}:${r.dataUpdatedAt}` : '')).join('|');
  const timingSig = timingResults.map((r, i) => (r.data ? `${liveLeagues[i]?.id}:${r.dataUpdatedAt}` : '')).join('|');

  const bundles = useMemo<LeagueBundle[]>(
    () => liveLeagues.map((comp, i) => ({ competition: comp.name, stats: exportResults[i]?.data, fixtures: fixtureResults[i]?.data, timing: timingResults[i]?.data })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [liveLeagues, exportSig, fixtureSig, timingSig],
  );

  // Season fixtures per league + a name→id map, for the Teams-mode backtest.
  const fixturesByComp = useMemo(() => {
    const m = new Map<number, RawFixture[]>();
    liveLeagues.forEach((comp, i) => { const fx = fixtureResults[i]?.data; if (fx) m.set(comp.id, fx); });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveLeagues, fixtureSig]);
  const compIdByName = useMemo(() => new Map(liveLeagues.map((l) => [l.name, l.id] as const)), [liveLeagues]);

  const exportEnabled = liveLeagues.filter((comp) => needExportFor(comp.id)).length;
  const exportSettled = exportResults.filter((r) => r.isSuccess || r.isError).length;
  const fixtureEnabled = liveLeagues.filter((comp) => needFixturesFor(comp.id)).length;
  const fixtureSettled = fixtureResults.filter((r) => r.isSuccess || r.isError).length;
  const timingEnabled = liveLeagues.filter((comp) => needTimingFor(comp.id) && comp.seasonId != null).length;
  const timingSettled = timingResults.filter((r) => r.isSuccess || r.isError).length;
  const loading = feed.loading
    || (exportEnabled > 0 && exportSettled < exportEnabled)
    || (fixtureEnabled > 0 && fixtureSettled < fixtureEnabled)
    || (timingEnabled > 0 && timingSettled < timingEnabled);

  // ---- results (Teams mode) — each condition at its own period ----
  const results = useMemo(() => evaluateStrategy(bundles, conditions, logic), [bundles, conditions, logic]);

  // Where each team sits on the grading stat — in its own league and across every
  // loaded league (Gap Analytics' Stat rank (L) / World #), so a DA team's standing
  // is visible. Computed for the first graded (non-timing/market) Rule.
  const statRanks = useMemo(() => {
    const rc = conditions.find((c) => c.dimensionId === 'grading1' && !c.methodId.startsWith('tm_') && !c.methodId.startsWith('mk_'));
    return rc ? rankTeamsForStat(bundles, rc) : null;
  }, [bundles, conditions]);
  const rankFor = useCallback((r: StrategyResult): StatRank | null => {
    if (!statRanks) return null;
    if (r.teamId != null) { const byId = statRanks.get(`${r.competition}::id:${r.teamId}`); if (byId) return byId; }
    return statRanks.get(`${r.competition}::name:${r.team.trim().toLowerCase()}`) ?? null;
  }, [statRanks]);

  // One team's FT / 1st-half / 2nd-half reading of the condition an eval proves —
  // computed lazily for the expanded row only (its own league), so it stays cheap.
  const breakdownFor = useCallback(
    (ev: TeamEval): HalfReading[] | null => {
      const cond = conditions.find((c) => c.id === ev.conditionId);
      if (!cond || cond.not) return null;
      return teamHalfBreakdown(bundles, cond, { competition: ev.competition, team: ev.team });
    },
    [bundles, conditions],
  );

  // Recency-failure signal for a graded stat: is the team's usual behaviour there,
  // but its last game went against it? Computed lazily for the expanded row only,
  // from that league's season fixtures (reuses the RFS engine). Null otherwise.
  const rfsFor = useCallback(
    (ev: TeamEval): StatRfs | null => {
      const cond = conditions.find((c) => c.id === ev.conditionId);
      if (!cond || cond.not || cond.dimensionId !== 'grading1' || ev.teamId == null) return null;
      const compId = compIdByName.get(ev.competition);
      const fixtures = bundles.find((b) => b.competition === ev.competition)?.fixtures;
      if (!fixtures) return null;
      const results = teamResultsFromFixtures(fixtures, ev.teamId, null, { competitionId: compId ?? null })
        .sort((a, b) => b.unix - a.unix);
      return ordinaryRfsForStat(results, cond.methodId);
    },
    [bundles, conditions, compIdByName],
  );

  // Recent form for the graded stat: how often the team has done it over the last
  // 5 / 10 / 15 games, plus the latest results. Lazy per expanded row (its league).
  const recentFormFor = useCallback(
    (ev: TeamEval): RecentForm | null => {
      const cond = conditions.find((c) => c.id === ev.conditionId);
      if (!cond || cond.not || cond.dimensionId !== 'grading1' || ev.teamId == null) return null;
      const compId = compIdByName.get(ev.competition);
      const fixtures = bundles.find((b) => b.competition === ev.competition)?.fixtures;
      if (!fixtures) return null;
      const results = teamResultsFromFixtures(fixtures, ev.teamId, null, { competitionId: compId ?? null })
        .sort((a, b) => b.unix - a.unix);
      return recentFormForStat(results, cond.methodId);
    },
    [bundles, conditions, compIdByName],
  );

  // ---- fixtures mode: per-condition side targeting (home-team vs away-team attributes) ----
  const membership = useMemo(
    () => (resultMode === 'fixtures' && conditions.length ? conditionMembership(bundles, conditions) : null),
    [resultMode, bundles, conditions],
  );
  const fixtureRows = useMemo(() => {
    if (resultMode !== 'fixtures' || !conditions.length || !membership) return [] as FxRow[];
    const leagueById = new Map(liveLeagues.map((l) => [l.id, l]));
    const rows: FxRow[] = [];
    for (const fx of up.fixtures) {
      const comp = leagueById.get(fx.competition.id);
      if (!comp) continue;
      const r = evaluateFixtureSides(membership, conditions, logic, comp.name, { id: fx.home.id, name: fx.home.name }, { id: fx.away.id, name: fx.away.name });
      if (!r) continue;
      rows.push({ fx, homeEvals: r.homeEvals, awayEvals: r.awayEvals, color: r.color, rank: r.rank });
    }
    // Strongest combination first: colour, then the combined-list rank, then kickoff.
    rows.sort((a, b) =>
      FX_COLOR_RANK[b.color] - FX_COLOR_RANK[a.color] ||
      (a.rank ?? Infinity) - (b.rank ?? Infinity) ||
      a.fx.kickoffUnix - b.fx.kickoffUnix,
    );
    return rows;
  }, [resultMode, up.fixtures, liveLeagues, membership, conditions, logic]);

  // ---- result filters ----
  const [fLeague, setFLeague] = useState(ALL);
  const [fDimension, setFDimension] = useState(ALL);
  const [fColor, setFColor] = useState(ALL);
  const [fMinGames, setFMinGames] = useState(0);
  const [fMinMatch, setFMinMatch] = useState(0);
  // Grade facets (doc "add group filter when data is displayed" · "filter by groups, grades and more").
  const [fGroup, setFGroup] = useState(ALL);
  const [fColumn, setFColumn] = useState(ALL);
  const [fLetter, setFLetter] = useState(ALL);
  const [fSource, setFSource] = useState(ALL);
  // Gap/DA dominance (Method 2): home-dominant vs away-dominant.
  const [fDominance, setFDominance] = useState(ALL);
  const hasGrading = conditions.some((c) => c.dimensionId === 'grading1');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const base = filterResults(results, { league: fLeague, dimension: fDimension, color: fColor, minGames: fMinGames, minMatch: fMinMatch, total: conditions.length, group: hasGrading ? fGroup : ALL, column: hasGrading ? fColumn : ALL, letter: hasGrading ? fLetter : ALL, source: hasGrading ? fSource : ALL });
    if (fDominance === ALL) return base;
    return base.filter((r) => rankFor(r)?.dominantVenue === fDominance);
  }, [results, fLeague, fDimension, fColor, fMinGames, fMinMatch, conditions.length, hasGrading, fGroup, fColumn, fLetter, fSource, fDominance, rankFor]);
  const summary = useMemo(() => summarize(filtered), [filtered]);
  // Per-league grade distribution across the qualifiers, so each row can show its grade's share.
  const leagueShare = useMemo(() => gradeShareByLeague(results), [results]);

  useEffect(() => setPage(1), [resultMode, conditions, logic, fLeague, fDimension, fColor, fMinGames, fMinMatch, fGroup, fColumn, fLetter, fSource, fDominance, target]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safe = Math.min(page, pages);
  const start = (safe - 1) * PAGE_SIZE;
  const visible = filtered.slice(start, start + PAGE_SIZE);

  // Fixtures mode: league-filter + paginate the recommendation rows.
  const fxFiltered = useMemo(() => (fLeague === ALL ? fixtureRows : fixtureRows.filter((r) => r.fx.competition.name === fLeague)), [fixtureRows, fLeague]);
  const fxPages = Math.max(1, Math.ceil(fxFiltered.length / PAGE_SIZE));
  const fxSafe = Math.min(page, fxPages);
  const fxStart = (fxSafe - 1) * PAGE_SIZE;
  const fxVisible = fxFiltered.slice(fxStart, fxStart + PAGE_SIZE);

  const leagueOptions = useMemo(() => {
    const names = resultMode === 'fixtures' ? fixtureRows.map((r) => r.fx.competition.name) : results.map((r) => r.competition);
    return [{ value: ALL, label: 'All leagues' }, ...[...new Set(names)].sort().map((c) => ({ value: c, label: c }))];
  }, [resultMode, fixtureRows, results]);
  const dimensionOptions = useMemo(() => [{ value: ALL, label: 'All categories' }, ...[...new Set(conditions.map((c) => c.dimensionId))].map((id) => ({ value: id, label: getDimension(id)?.label ?? id }))], [conditions]);

  const addCondition = (c: Condition) => { setConditions((cur) => [...cur, c]); setActiveId(null); };
  const removeCondition = (id: string) => { setConditions((cur) => cur.filter((c) => c.id !== id)); setActiveId(null); };
  const toggleNot = (id: string) => { setConditions((cur) => cur.map((c) => (c.id === id ? { ...c, not: !c.not } : c))); setActiveId(null); };
  const clearAll = () => { setConditions([]); setFLeague(ALL); setFDimension(ALL); setFColor(ALL); setFMinGames(0); setFMinMatch(0); setFGroup(ALL); setFColumn(ALL); setFLetter(ALL); setFSource(ALL); setFDominance(ALL); setActiveId(null); };

  // One-click preset: set logic + conditions (each with its own period), then recompute live.
  const applyPreset = (p: StrategyPreset) => {
    setBuildMode('combined');
    setLogic(p.logic);
    setConditions(p.conditions.map((c) => ({ id: `c${(CONDITION_SEQ += 1)}`, dimensionId: c.dimensionId, period: p.period, methodId: c.methodId, options: { ...c.options }, side: 'either' as FixtureSide })));
    setFLeague(ALL); setFDimension(ALL); setFColor(ALL); setFMinGames(0); setFMinMatch(0); setFGroup(ALL); setFColumn(ALL); setFLetter(ALL); setFSource(ALL); setFDominance(ALL);
    setActiveId(null);
  };

  // Save the current build (conditions + logic + global period + view), never its results.
  const commitSave = () => {
    if (!conditions.length) return;
    const entry = save(draftName, buildStrategyConfig({ conditions, logic, resultMode }));
    setActiveId(entry.id);
    setDraftName('');
    setSaving(false);
  };
  // Replay a saved strategy: restore the build and let the live engines recompute.
  const loadStrategy = (s: SavedStrategy) => {
    const cfg = s.config;
    setConditions(cfg.conditions.map((c) => ({ ...c, id: `c${(CONDITION_SEQ += 1)}`, options: { ...c.options } })));
    setLogic(cfg.logic);
    setBuildMode(cfg.conditions.some((c) => c.side === 'home' || c.side === 'away') ? 'split' : 'combined');
    setResultMode(cfg.resultMode);
    setFLeague(ALL); setFDimension(ALL); setFColor(ALL); setFMinGames(0); setFMinMatch(0); setFGroup(ALL); setFColumn(ALL); setFLetter(ALL); setFSource(ALL); setFDominance(ALL);
    setActiveId(s.id);
    setSaving(false);
  };
  const removeStrategy = (id: string) => { remove(id); setActiveId((cur) => (cur === id ? null : cur)); };

  const aside = (
    <SavedStrategiesPanel
      saved={saved}
      activeId={activeId}
      onLoad={loadStrategy}
      onRemove={removeStrategy}
      style={wide ? styles.asideWide : styles.asideStacked}
    />
  );

  return (
    <View style={[styles.layout, wide && styles.layoutRow]}>
      <HelpModal visible={showHelp} onClose={closeHelp} />
      {!wide ? aside : null}
      <View style={styles.main}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Strategy Builder</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="How the Strategy Builder works" onPress={openHelp} style={({ pressed }) => [styles.helpBtn, pressed && styles.helpBtnPressed]}>
            <Text style={styles.helpBtnText}>? How it works</Text>
          </Pressable>
        </View>
        <Text style={styles.subtitle}>
          Combine any conditions across every stat and grading method, at one global period and venue. View it as the qualifying teams — with an optional historical success rate — or as fixtures, each showing the exact grade every feature qualified with. Save a build to re-run it live anytime.
        </Text>
      </View>

      {/* Quick strategies — one-click presets */}
      <View style={styles.presetCard}>
        <Text style={styles.presetTitle}>⚡ Quick strategies</Text>
        <View style={styles.presetRow}>
          {STRATEGY_PRESETS.map((p) => (
            <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={`Apply ${p.label}`} onPress={() => applyPreset(p)} style={({ pressed }) => [styles.presetChip, pressed && styles.addBtnPressed]}>
              <Text style={styles.presetChipText}>{p.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Build mode: one combined builder, or separate Home | Away panels */}
      <View style={styles.modeRow}>
        {([['combined', 'Combined (either team)'], ['split', 'Home vs Away']] as const).map(([v, label]) => {
          const on = buildMode === v;
          return (
            <Pressable key={v} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setBuildMode(v)} style={[styles.modeBtn, on && styles.modeBtnOn]}>
              <Text style={[styles.modeBtnText, on && styles.modeBtnTextOn]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Result mode */}
      <View style={styles.modeRow}>
        {([['teams', 'Teams'], ['fixtures', 'Fixtures · grade qualification']] as const).map(([v, label]) => {
          const on = resultMode === v;
          return (
            <Pressable key={v} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setResultMode(v)} style={[styles.modeBtn, on && styles.modeBtnOn]}>
              <Text style={[styles.modeBtnText, on && styles.modeBtnTextOn]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* A. Strategy configuration */}
      {buildMode === 'combined' ? (
        <ConditionBuilder narrow={narrow} onAdd={addCondition} />
      ) : (
        <View style={[styles.splitRow, narrow && styles.filterCol]}>
          <View style={wide ? styles.flex : styles.full}>
            <ConditionBuilder narrow={narrow} fixedSide="home" title="🏠 Home team · Rule" onAdd={addCondition} />
          </View>
          <View style={wide ? styles.flex : styles.full}>
            <ConditionBuilder narrow={narrow} fixedSide="away" title="✈ Away team · Rule" onAdd={addCondition} />
          </View>
        </View>
      )}

      {/* B. Conditions + logic */}
      {conditions.length > 0 ? (
        <View style={styles.conditionsCard}>
          <View style={styles.conditionsHead}>
            <Text style={styles.sectionLabel}>Rules</Text>
            <View style={styles.logicRow}>
              {(['and', 'or'] as StrategyLogic[]).map((l) => (
                <Pressable key={l} onPress={() => setLogic(l)} style={[styles.logicBtn, logic === l && styles.logicBtnOn]}>
                  <Text style={[styles.logicBtnText, logic === l && styles.logicBtnTextOn]}>{l.toUpperCase()}</Text>
                </Pressable>
              ))}
              <Pressable onPress={() => { setSaving((s) => !s); setDraftName(''); }} style={[styles.saveBtn, saving && styles.saveBtnOn]}>
                <Text style={[styles.saveBtnText, saving && styles.saveBtnTextOn]}>{saving ? 'Cancel' : '★ Save'}</Text>
              </Pressable>
              <Pressable onPress={clearAll} style={styles.clearBtn}><Text style={styles.clearBtnText}>Clear</Text></Pressable>
            </View>
          </View>
          <Text style={styles.logicHint}>{logic === 'and' ? 'AND — a team must satisfy every condition.' : 'OR — a team must satisfy at least one condition.'} Tap NOT to exclude teams matching a condition.</Text>
          <View style={styles.chipGroups}>
            {([['home', '🏠 Home team'], ['away', '✈ Away team'], ['either', 'Either team']] as const).map(([sv, label]) => {
              const group = conditions.filter((c) => (c.side ?? 'either') === sv);
              if (!group.length) return null;
              return (
                <View key={sv} style={styles.chipGroup}>
                  <Text style={styles.chipGroupLabel}>{label} · {group.length}</Text>
                  <View style={styles.chips}>
                    {group.map((c) => (
                      <View key={c.id} style={[styles.chip, c.not && styles.chipNot]}>
                        <Pressable accessibilityRole="button" accessibilityLabel="Toggle NOT" accessibilityState={{ selected: !!c.not }} onPress={() => toggleNot(c.id)} style={[styles.chipNotBtn, c.not && styles.chipNotBtnOn]}>
                          <Text style={[styles.chipNotText, c.not && styles.chipNotTextOn]}>NOT</Text>
                        </Pressable>
                        <Text style={styles.chipText}>{conditionLabel({ ...c, not: false })}</Text>
                        <Pressable accessibilityRole="button" accessibilityLabel="Remove condition" onPress={() => removeCondition(c.id)} style={styles.chipX}><Text style={styles.chipXText}>×</Text></Pressable>
                      </View>
                    ))}
                  </View>
                </View>
              );
            })}
          </View>
          {saving ? (
            <View style={styles.saveRow}>
              <TextInput
                value={draftName}
                onChangeText={setDraftName}
                placeholder="Name this strategy — e.g. Away goal suppressors"
                placeholderTextColor={theme.textFaint}
                style={styles.saveInput}
                onSubmitEditing={commitSave}
                returnKeyType="done"
                autoFocus
              />
              <Pressable accessibilityRole="button" onPress={commitSave} style={({ pressed }) => [styles.saveConfirm, pressed && styles.addBtnPressed]}>
                <Text style={styles.saveConfirmText}>Save strategy</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : (
        <Text style={styles.empty}>Add a Rule above to build your strategy.</Text>
      )}

      {/* Status */}
      <View style={styles.statusRow}>
        {loading || (resultMode === 'fixtures' && up.loading) ? (
          <><ActivityIndicator size="small" color={theme.accentGreen} /><Text style={styles.statusMuted}>Querying {liveLeagues.length} ongoing leagues…</Text></>
        ) : resultMode === 'teams' ? (
          conditions.length > 0
            ? <Text style={styles.statusLive}>● {summary.teams} teams · {summary.leagues} leagues · {logic.toUpperCase()} of {conditions.length} rule{conditions.length > 1 ? 's' : ''}</Text>
            : <Text style={styles.statusMuted}>Add a Rule to see the qualifying teams.</Text>
        ) : (
          <Text style={styles.statusLive}>● {fxFiltered.length} qualifying fixtures{conditions.length > 0 ? ' · home/away attributes matched' : ''}</Text>
        )}
      </View>

      {/* ===== Teams mode ===== */}
      {resultMode === 'teams' && conditions.length > 0 && !loading ? (
        <>
          <View style={styles.summaryRow}>
            <SummaryTile label="Teams" value={summary.teams} color={theme.accentBlue} />
            <SummaryTile label="Leagues" value={summary.leagues} color={theme.textPrimary} />
            <SummaryTile label="Green" value={summary.green} color={theme.accentGreen} />
            <SummaryTile label="Yellow" value={summary.yellow} color={theme.yellow} />
            <SummaryTile label="Red" value={summary.red} color={theme.loss} />
          </View>
          {results.length > 0 ? (
            <View style={styles.filterCard}>
              <View style={[styles.filterRow, narrow && styles.filterCol]}>
                <FilterDropdown label="League" value={fLeague} options={leagueOptions} onChange={setFLeague} style={narrow ? styles.full : styles.flex} />
                <FilterDropdown label="Category" value={fDimension} options={dimensionOptions} onChange={setFDimension} style={narrow ? styles.full : styles.flex} />
                <FilterDropdown label="Colour" value={fColor} options={[{ value: ALL, label: 'All colours' }, ...COLOR_GROUPS.map((c) => ({ value: c.value, label: c.label }))]} onChange={setFColor} style={narrow ? styles.full : styles.flex} />
                <FilterDropdown label="Min games" value={String(fMinGames)} options={[{ value: '0', label: 'Any games' }, { value: '5', label: '5+ games' }, { value: '8', label: '8+ games' }]} onChange={(v) => setFMinGames(Number(v))} style={narrow ? styles.full : styles.flex} />
                <FilterDropdown label="Min match" value={String(fMinMatch)} options={[{ value: '0', label: 'Any match' }, { value: '50', label: '50%+ conditions' }, { value: '75', label: '75%+ conditions' }, { value: '100', label: 'All conditions' }]} onChange={(v) => setFMinMatch(Number(v))} style={narrow ? styles.full : styles.flex} />
                {hasGrading ? (
                  <>
                    <FilterDropdown label="Group" value={fGroup} options={[{ value: ALL, label: 'All groups (I–VII)' }, ...GRADE_GROUPS]} onChange={setFGroup} style={narrow ? styles.full : styles.flex} />
                    <FilterDropdown label="Grade" value={fLetter} options={[{ value: ALL, label: 'All grades (A–F)' }, ...GRADE_LETTERS]} onChange={setFLetter} style={narrow ? styles.full : styles.flex} />
                    <FilterDropdown label="Source" value={fSource} options={[{ value: ALL, label: 'All sources' }, ...GRADE_SOURCES]} onChange={setFSource} style={narrow ? styles.full : styles.flex} />
                    <FilterDropdown label="Column" value={fColumn} options={[{ value: ALL, label: 'All columns' }, ...QUAL_COLUMNS]} onChange={setFColumn} style={narrow ? styles.full : styles.flex} />
                    <FilterDropdown label="Dominance" value={fDominance} options={[{ value: ALL, label: 'Home & away' }, { value: 'home', label: '🏠 Home-dominant' }, { value: 'away', label: '✈ Away-dominant' }]} onChange={setFDominance} style={narrow ? styles.full : styles.flex} />
                  </>
                ) : null}
                <FilterDropdown label="Historical outcome" value={target} options={[{ value: ALL, label: 'Off · no backtest' }, ...TARGET_MARKETS.map((m) => ({ value: m.key, label: `${m.group} · ${m.label}` }))]} onChange={setTarget} style={narrow ? styles.full : styles.flex} />
              </View>
              {target !== ALL ? (
                <Text style={styles.backtestNote}>Historical success rate = how often “{targetDef?.label}” actually happened in each team’s completed matches this season (current-season form, not a point-in-time backtest). Shown only for the top {FIXTURE_LEAGUE_CAP} ongoing leagues; “—” where the sample is too small.</Text>
              ) : null}
            </View>
          ) : null}
          {filtered.length === 0 ? (
            <Text style={styles.empty}>No team satisfies this strategy. Try OR logic, a different method, or relax the filters.</Text>
          ) : (
            <>
              <PageControls page={safe} pages={pages} total={filtered.length} from={start + 1} to={start + visible.length} onChange={setPage} />
              <TeamsTable rows={visible} upcoming={upcoming} target={targetDef ?? null} fixturesByComp={fixturesByComp} compIdByName={compIdByName} total={conditions.length} share={leagueShare} breakdownFor={breakdownFor} rfsFor={rfsFor} recentFormFor={recentFormFor} rankFor={rankFor} />
              <PageControls page={safe} pages={pages} total={filtered.length} from={start + 1} to={start + visible.length} onChange={setPage} />
            </>
          )}
        </>
      ) : null}

      {/* ===== Fixtures mode · grade qualification ===== */}
      {resultMode === 'fixtures' && !loading && !up.loading ? (
        <>
          <View style={styles.filterCard}>
            <View style={[styles.filterRow, narrow && styles.filterCol]}>
              <FilterDropdown label="League" value={fLeague} options={leagueOptions} onChange={setFLeague} style={narrow ? styles.full : styles.flex} />
            </View>
            <Text style={styles.backtestNote}>Every upcoming fixture whose home team meets the home-side conditions and away team the away-side ones, showing the exact grade each feature qualified with.</Text>
          </View>
          {conditions.length === 0 ? (
            <Text style={styles.empty}>Add a Rule above to see the qualifying fixtures.</Text>
          ) : fxFiltered.length === 0 ? (
            <Text style={styles.empty}>No upcoming fixture matches this strategy. Try OR logic, relax a condition, or change which side it applies to.</Text>
          ) : (
            <>
              <PageControls page={fxSafe} pages={fxPages} total={fxFiltered.length} from={fxStart + 1} to={fxStart + fxVisible.length} onChange={setPage} />
              <GradeFixtureTable rows={fxVisible} breakdownFor={breakdownFor} rfsFor={rfsFor} recentFormFor={recentFormFor} />
              <PageControls page={fxSafe} pages={fxPages} total={fxFiltered.length} from={fxStart + 1} to={fxStart + fxVisible.length} onChange={setPage} />
            </>
          )}
        </>
      ) : null}
      </View>
      {wide ? aside : null}
    </View>
  );
}

/** Teams results as a table split into three colours, each row showing its
 *  qualifying grade and (when a target market is chosen) its historical success
 *  rate. Tap a row for the per-condition breakdown + the backtest detail. */
const TEAM_SECTIONS: { color: ResultColor; label: string }[] = [
  { color: 'green', label: 'GREEN · strongest' },
  { color: 'yellow', label: 'YELLOW · middle' },
  { color: 'red', label: 'RED · weakest' },
  { color: 'none', label: 'UNGRADED' },
];

type TeamRow = { result: StrategyResult; nf: ReturnType<typeof nextFixtureFor>; bt: BacktestResult | null };

function TeamsTable({ rows, upcoming, target, fixturesByComp, compIdByName, total, share, breakdownFor, rfsFor, recentFormFor, rankFor }: {
  rows: StrategyResult[];
  upcoming: UpcomingLite[];
  target: TargetMarket | null;
  fixturesByComp: Map<number, RawFixture[]>;
  compIdByName: Map<string, number>;
  total: number;
  share: Map<string, LeagueGradeShare>;
  breakdownFor: (ev: TeamEval) => HalfReading[] | null;
  rfsFor: (ev: TeamEval) => StatRfs | null;
  recentFormFor: (ev: TeamEval) => RecentForm | null;
  rankFor: (r: StrategyResult) => StatRank | null;
}) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const built: TeamRow[] = useMemo(() => rows.map((result) => {
    const nf = nextFixtureFor(result.teamId, result.team, upcoming);
    let bt: BacktestResult | null = null;
    if (target) {
      const compId = compIdByName.get(result.competition);
      const fixtures = compId != null ? fixturesByComp.get(compId) : undefined;
      if (fixtures) {
        const scope: BacktestScope = nf ? (nf.side === 'home' ? 'home' : 'away') : 'overall';
        bt = backtestTeam(fixtures, result.teamId, scope, target, compId);
      }
    }
    return { result, nf, bt };
  }), [rows, upcoming, target, fixturesByComp, compIdByName]);

  const keyOf = (r: StrategyResult) => `${r.competition}::${r.team}`;
  const minW = target ? 920 : 820;
  return (
    <View>
      <DragScroll horizontal style={styles.fxScroll} contentContainerStyle={styles.fxScrollContent}>
        <View style={[styles.fxTable, { minWidth: minW }]}>
          <View style={[styles.fxTRow, styles.fxTHeadRow]}>
            <Text style={[styles.tTeam, styles.fxTHead]}>Team</Text>
            <Text style={[styles.tNext, styles.fxTHead]}>Next fixture</Text>
            <Text style={[styles.tCond, styles.fxTHead]}>Rules</Text>
            <Text style={[styles.tGrade, styles.fxTHead]}>Grade</Text>
            <Text style={[styles.tRead, styles.fxTHead]}>Reading</Text>
            {target ? <Text style={[styles.tRate, styles.fxTHead]}>Hist. {target.label}</Text> : null}
          </View>
          {TEAM_SECTIONS.map((sec) => {
            const group = built.filter((b) => b.result.color === sec.color);
            if (!group.length) return null;
            const col = resultColour(sec.color);
            return (
              <View key={sec.color}>
                <View style={[styles.fxSectionRow, { backgroundColor: resultBackground(sec.color) }]}>
                  <Text style={[styles.fxSectionTitle, { color: col }]}>{sec.label} · {group.length}</Text>
                </View>
                {group.map((b) => {
                  const k = keyOf(b.result);
                  const isActive = expandedKey === k;
                  return (
                    <Fragment key={k}>
                      <TeamsTableRow row={b} hasTarget={!!target} active={isActive} rank={rankFor(b.result)} onPress={() => setExpandedKey((x) => (x === k ? null : k))} />
                      {isActive ? (
                        <View style={[styles.fxDetailInline, { minWidth: minW, borderColor: resultColour(b.result.color) }]}>
                          <ResultCard result={b.result} upcoming={upcoming} total={total} share={share.get(b.result.competition)} breakdownFor={breakdownFor} rfsFor={rfsFor} recentFormFor={recentFormFor} rank={rankFor(b.result)} />
                          {target ? <BacktestDetail bt={b.bt} target={target} /> : null}
                        </View>
                      ) : null}
                    </Fragment>
                  );
                })}
              </View>
            );
          })}
        </View>
      </DragScroll>
      <Text style={styles.hint}>Rows are grouped by the strongest qualifying colour. Tap a team to open its per-condition grades right below it{target ? ', with the matches behind its historical rate' : ''}.</Text>
    </View>
  );
}

function TeamsTableRow({ row, hasTarget, active, rank, onPress }: { row: TeamRow; hasTarget: boolean; active: boolean; rank: StatRank | null; onPress: () => void }) {
  const { result, nf, bt } = row;
  const tint = resultColour(result.color);
  const graded = result.conditions.find((c) => c.grade);
  const primary = result.conditions[0];
  // Every column this team qualifies in (Ordinary / + Series / Ordinary + RFS / …),
  // in rank order — so Series & RFS are visible on the row, not only on expand.
  const gradingEval = result.conditions.find((c) => c.dimensionId === 'grading1' && (c.qualifications?.length ?? 0) > 0);
  // Only the extra signals get a chip — every graded team is Ordinary by default,
  // so an "Ordinary" chip would just repeat the grade.
  const extraColumns = gradingEval ? [...new Set(gradingEval.qualifications!.map((q) => q.column))].filter((c) => c !== 'ordinary') : [];
  // DA (Double Agent) belongs on the outside too: the Home-vs-Overall divergence.
  const daQuant = daQuantText(graded);
  const rateCol = bt ? (bt.rate >= 60 ? theme.accentGreen : bt.rate >= 45 ? theme.yellow : theme.loss) : theme.textFaint;
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: active }} onPress={onPress} style={[styles.fxTRow, { backgroundColor: active ? theme.surfaceHover : resultBackground(result.color) }]}>
      <View style={styles.tTeam}>
        <View style={styles.teamNameRow}><View style={[styles.colorDot, { backgroundColor: tint }]} /><Text style={styles.fxHome} numberOfLines={1}>{result.team}</Text></View>
        <Text style={styles.fxAway} numberOfLines={1}>{result.competition}</Text>
      </View>
      <View style={styles.tNext}>
        {nf ? (
          <>
            <Text style={styles.fxCellMuted} numberOfLines={1}>{nf.side === 'home' ? 'vs ' : '@ '}{nf.opponentName}</Text>
            <Text style={styles.fxCellFaint} numberOfLines={1}>{nf.side === 'home' ? 'Home' : 'Away'} · {kickoffLabel(nf.fixture.kickoffUnix, nf.fixture.kickoff)}</Text>
          </>
        ) : <Text style={styles.fxNone}>No upcoming fixture</Text>}
      </View>
      <Text style={[styles.tCond, styles.fxCellMuted]}>{result.conditions.length}</Text>
      <View style={styles.tGrade}>
        {graded ? (
          <>
            <View style={styles.gradeLine}>
              {daLevelOf(graded.grade) ? <DaBadge grade={graded.grade} /> : null}
              <Text style={[styles.gradeTxt, { color: resultColour(graded.color) }]} numberOfLines={1}>{graded.grade}</Text>
            </View>
            {daQuant ? <Text style={styles.daQuant} numberOfLines={1}>{daQuant}</Text> : null}
            {extraColumns.length ? (
              <View style={styles.colChips}>
                {extraColumns.map((c) => (
                  <View key={c} style={[styles.colChip, c === 'series' && styles.colChipSeries, (c === 'ordinary_rfs' || c === 'series_rfs') && styles.colChipRfs]}>
                    <Text style={[styles.colChipText, c === 'series' && styles.colChipTextOn, (c === 'ordinary_rfs' || c === 'series_rfs') && styles.colChipTextOn]} numberOfLines={1}>{COLUMN_LABEL[c]}</Text>
                  </View>
                ))}
              </View>
            ) : (!daQuant ? <Text style={styles.fxCellFaint} numberOfLines={1}>{graded.dimensionLabel}</Text> : null)}
          </>
        ) : <Text style={styles.fxNone}>—</Text>}
      </View>
      <View style={styles.tRead}>
        <Text style={styles.fxCellMuted} numberOfLines={1}>{primary?.valueText ?? '—'}</Text>
        {rank ? <Text style={styles.rankLine} numberOfLines={1}>L #{rank.leagueRank}/{rank.leagueTotal} · W #{rank.worldRank}/{rank.worldTotal}</Text> : null}
        {rank && rank.leagueTier ? (
          <Text style={styles.gapLine} numberOfLines={1}>
            Gap <Text style={{ color: tierColor(rank.leagueTier) }}>L#{rank.gapLeagueRank} {TIER_LABEL[rank.leagueTier]}</Text>
            {rank.worldTier ? <Text> · <Text style={{ color: tierColor(rank.worldTier) }}>W#{rank.gapWorldRank} {TIER_LABEL[rank.worldTier]}</Text></Text> : null}
            {domText(rank.dominantVenue) ? <Text style={styles.domText}> · {domText(rank.dominantVenue)}</Text> : null}
          </Text>
        ) : null}
      </View>
      {hasTarget ? (
        <View style={styles.tRate}>
          {bt ? (
            <>
              <Text style={[styles.rateTxt, { color: rateCol }]}>{Math.round(bt.rate)}%</Text>
              <Text style={styles.fxCellFaint}>{bt.hits}/{bt.sample}</Text>
            </>
          ) : <Text style={styles.fxNone}>Insuff. data</Text>}
        </View>
      ) : null}
    </Pressable>
  );
}

function BacktestDetail({ bt, target }: { bt: BacktestResult | null; target: TargetMarket }) {
  if (!bt) {
    return <Text style={styles.btNote}>Historical “{target.label}” rate: insufficient completed matches this season (need a larger sample).</Text>;
  }
  return (
    <View style={styles.btWrap}>
      <Text style={styles.btTitle}>Historical “{target.label}” · {Math.round(bt.rate)}% ({bt.hits}/{bt.sample}) · {bt.scope} matches this season</Text>
      <View style={styles.btDots}>
        {bt.matches.slice(0, 20).map((m, i) => (
          <View key={i} style={[styles.btDot, { backgroundColor: m.hit ? theme.accentGreen : theme.loss }]} />
        ))}
      </View>
      <Text style={styles.btNote}>{bt.hits} hit · {bt.misses} missed. Current-season form on this market, not a point-in-time backtest.</Text>
    </View>
  );
}

/** Pop-up explainer for the whole page. Auto-opens on a first visit. */
function HelpModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.helpOverlay}>
        <Pressable style={styles.helpBackdrop} onPress={onClose} accessibilityLabel="Close explainer" />
        <View style={styles.helpCard}>
          <View style={styles.helpHead}>
            <Text style={styles.helpTitle}>How the Strategy Builder works</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={styles.helpClose}>
              <Text style={styles.helpCloseText}>×</Text>
            </Pressable>
          </View>
          <Text style={styles.helpLead}>
            One place to combine every analytics engine in the app into a single strategy, then see the teams and upcoming fixtures that fit it — recomputed live.
          </Text>
          <ScrollView style={styles.helpScroll} contentContainerStyle={styles.helpScrollBody}>
            <HelpStep n="1" title="Pick what to measure" accent={theme.accentBlue}>
              Choose a <Text style={styles.helpStrong}>Category</Text>. “Stat filter · all tables” reaches every metric across all 81 tables — pick a <Text style={styles.helpStrong}>Family</Text> (Ordinary, Series runs, FT-only patterns, Points), a <Text style={styles.helpStrong}>Window</Text> (season or last 10/8/6/5) and a stat. The named categories (Stats Characters, Grading, Dominance, Opposite, Gap) use their own engines and terminology unchanged.
            </HelpStep>
            <HelpStep n="2" title="Add conditions & combine" accent={theme.accentPurple}>
              Set the period, method and level, then <Text style={styles.helpStrong}>+ Add condition</Text>. Stack as many as you like and switch <Text style={styles.helpStrong}>AND</Text> (must satisfy all) / <Text style={styles.helpStrong}>OR</Text> (any one). Tap <Text style={styles.helpStrong}>NOT</Text> on a chip to exclude teams that match it.
            </HelpStep>
            <HelpStep n="3" title="Read the results" accent={theme.accentGreen}>
              <Text style={styles.helpStrong}>Teams</Text> lists every qualifying side, graded green / yellow / red with the exact reason per condition (and an optional historical success rate). <Text style={styles.helpStrong}>Fixtures</Text> turns the strategy onto upcoming matches — each one showing the matched side(s) and the exact grade every feature qualified with; tap a row for the full read.
            </HelpStep>
            <HelpStep n="4" title="Save & reuse" accent={theme.accentOrange}>
              Tap <Text style={styles.helpStrong}>★ Save</Text> and name it. Only the recipe is stored — never the teams or fixtures — so each time you open a saved strategy it recalculates against the latest data in the side panel.
            </HelpStep>
          </ScrollView>
          <Pressable accessibilityRole="button" onPress={onClose} style={({ pressed }) => [styles.helpCta, pressed && styles.addBtnPressed]}>
            <Text style={styles.helpCtaText}>Got it — start building</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function HelpStep({ n, title, accent, children }: { n: string; title: string; accent: string; children: ReactNode }) {
  return (
    <View style={styles.helpStep}>
      <View style={[styles.helpNum, { backgroundColor: accent }]}><Text style={styles.helpNumText}>{n}</Text></View>
      <View style={styles.helpStepBody}>
        <Text style={[styles.helpStepTitle, { color: accent }]}>{title}</Text>
        <Text style={styles.helpStepText}>{children}</Text>
      </View>
    </View>
  );
}

function SummaryTile({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.summaryTile}>
      <Text style={[styles.summaryValue, { color }]}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

/** A segmented control group (Period / Venue / Team). */
function SegGroup<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <View style={styles.periodGroup}>
      <Text style={styles.periodLabel}>{label}</Text>
      <View style={styles.segRow}>
        {options.map(([v, lab]) => {
          const on = value === v;
          return (
            <Pressable key={v} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => onChange(v)} style={[styles.segBtn, on && styles.segBtnOn]}>
              <Text style={[styles.segText, on && styles.segTextOn]}>{lab}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** A. Self-contained Rule builder: reads its own Period · Venue · Team, then
 *  picks the stat (always graded on the combined list) and its options. */
function ConditionBuilder({ narrow, fixedSide, title, onAdd }: { narrow: boolean; fixedSide?: FixtureSide; title?: string; onAdd: (c: Condition) => void }) {
  // A Rule is always the combined-list grading (Roman I·1·A … VII·3·F) with the
  // Ordinary / Series / RFS columns — the category is fixed, so there is no picker.
  const dimId = getDimension('grading1') ? 'grading1' : DIMENSIONS[0].id;
  const dim = getDimension(dimId)!;
  const [opts, setOpts] = useState<Record<string, string>>(defaultOptions(dimId));
  // The time axis: Full time / 1st / 2nd half, OR a goal-timing window (First 15′ /
  // Last 20′). Windows are measured 15-min buckets — overall only, Scored/Conceded.
  const [timeSel, setTimeSel] = useState<'ft' | 'ht' | '2h' | 'first15' | 'last20'>('ft');
  const isWin = timeSel === 'first15' || timeSel === 'last20';
  const [scope, setScope] = useState<StatScope>('overall');
  const [side, setSide] = useState<FixtureSide>('either');
  const period: StrategyPeriod = isWin ? timeSel : periodFrom(timeSel, scope);
  const normalMethods = methodsOf(dim, period, opts).filter((m) => !m.value.startsWith('tm_'));
  // The stat dropdown is narrowed to the chosen category (All = everything).
  const [category, setCategory] = useState<string>('all');
  const categoryMethods = category === 'all' ? normalMethods : normalMethods.filter((m) => inCategory(category, m.value));
  const methods = isWin ? TIMING_STATE_OPTIONS : (categoryMethods.length ? categoryMethods : normalMethods);
  const [methodId, setMethodId] = useState<string>(normalMethods[0]?.value ?? '');

  // Switching to/from a timing window swaps the stat list (Scored/Conceded vs the
  // graded stats), so keep the selected stat valid for the current list.
  const changeTime = (v: 'ft' | 'ht' | '2h' | 'first15' | 'last20') => {
    setTimeSel(v);
    const win = v === 'first15' || v === 'last20';
    if (win && methodId !== 'tm_sc' && methodId !== 'tm_cs') setMethodId('tm_sc');
    if (!win && (methodId === 'tm_sc' || methodId === 'tm_cs')) setMethodId((categoryMethods[0] ?? normalMethods[0])?.value ?? '');
  };

  const changeOpt = (key: string, v: string) => {
    const next = { ...opts, [key]: v };
    setOpts(next);
    if (dim.methodsFor) {
      const ms = dim.methodsFor(period, next);
      if (!ms.some((m) => m.value === methodId)) setMethodId(ms[0]?.value ?? '');
    }
  };

  // Pick a category: leave a goal-timing window first (those lists are
  // Scored/Conceded only), filter the dropdown to that family, and jump the
  // selected stat to the first one in it so the dropdown always shows a valid pick.
  const pickCategory = (id: string) => {
    if (isWin) setTimeSel('ft');
    setCategory(id);
    const list = id === 'all' ? normalMethods : normalMethods.filter((m) => inCategory(id, m.value));
    if (!list.some((m) => m.value === methodId)) setMethodId((list[0] ?? normalMethods[0])?.value ?? '');
  };

  const add = () => {
    onAdd({ id: `c${(CONDITION_SEQ += 1)}`, dimensionId: dimId, period, methodId, options: { ...opts }, side: fixedSide ?? side });
    // Advance to the next stat so a second "+ Add Rule" is a different Rule, not a
    // silent duplicate of the one just added (which would look like "nothing happened").
    const i = methods.findIndex((m) => m.value === methodId);
    if (i >= 0 && methods.length > 1) setMethodId(methods[(i + 1) % methods.length].value);
  };

  return (
    <View style={[styles.builderCard, fixedSide === 'home' && styles.builderHome, fixedSide === 'away' && styles.builderAway]}>
      <Text style={styles.sectionLabel}>{title ?? 'Rule'}</Text>
      <View style={styles.readRow}>
        <SegGroup label="Period" value={timeSel} options={[['ft', 'Full time'], ['ht', '1st half'], ['2h', '2nd half'], ['first15', 'First 15′'], ['last20', 'Last 20′']]} onChange={changeTime} />
        {!isWin ? <SegGroup label="Venue" value={scope} options={[['overall', 'Overall'], ['home', 'Home'], ['away', 'Away']]} onChange={setScope} /> : null}
        {!fixedSide ? <SegGroup label="Team (fixtures)" value={side} options={FIXTURE_SIDES.map((s) => [s.value, s.label] as [FixtureSide, string])} onChange={setSide} /> : null}
      </View>
      {!isWin ? (
        <View style={styles.featuredWrap}>
          <Text style={styles.featuredLabel}>Categories</Text>
          <View style={styles.featuredRow}>
            {RULE_CATEGORIES.map((c) => {
              const count = c.id === 'all' ? normalMethods.length : normalMethods.filter((m) => inCategory(c.id, m.value)).length;
              if (count === 0) return null;
              const active = category === c.id;
              return (
                <Pressable
                  key={c.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`Show ${c.label} stats`}
                  onPress={() => pickCategory(c.id)}
                  style={({ pressed }) => [styles.featuredChip, active && styles.featuredChipActive, pressed && styles.addBtnPressed]}>
                  <Text style={[styles.featuredChipText, active && styles.featuredChipTextActive]}>{c.label}{c.id === 'all' ? '' : ` · ${count}`}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
      <View style={[styles.filterRow, narrow && styles.filterCol]}>
        <FilterDropdown
          label={isWin ? 'State (scored / conceded)' : `Stat / feature${category === 'all' ? '' : ` · ${methods.length}`}`}
          value={methodId}
          options={methods}
          onChange={setMethodId}
          style={styles.full}
        />
      </View>
      {isWin ? <Text style={styles.readNote}>Goal-timing windows use the feed&apos;s measured 15-minute data — overall only, Scored or Conceded. (Per-minute data for an exact first-10′ isn&apos;t available.)</Text> : null}
      {methodId.startsWith('pd:') ? <Text style={styles.readNote}>⚡ Power Dynamics is a placeholder — those stats are added separately by someone else. This Rule won&apos;t surface teams yet.</Text> : null}
      {dim.options && dim.options.length > 0 ? (
        <View style={[styles.filterRow, narrow && styles.filterCol]}>
          {dim.options.filter((o) => (o.visible ? o.visible(opts) : true)).map((o) => (
            o.kind === 'number' ? (
              <View key={o.key} style={narrow ? styles.full : styles.flex}>
                <Text style={styles.numLabel}>{o.label}</Text>
                <TextInput
                  value={opts[o.key] ?? o.default}
                  onChangeText={(t) => changeOpt(o.key, t.replace(/[^0-9.]/g, ''))}
                  keyboardType="decimal-pad"
                  style={styles.numInput}
                  accessibilityLabel={o.label}
                />
              </View>
            ) : (
              <FilterDropdown key={o.key} label={o.label} value={opts[o.key] ?? o.default} options={o.options} onChange={(v) => changeOpt(o.key, v)} style={narrow ? styles.full : styles.flex} />
            )
          ))}
        </View>
      ) : null}
      <Pressable accessibilityRole="button" onPress={add} style={({ pressed }) => [styles.addBtn, pressed && styles.addBtnPressed]}>
        <Text style={styles.addBtnText}>+ Add Rule</Text>
      </Pressable>
    </View>
  );
}

/** A bold Difference-Alert flag, when the grade carries one. */
function DaBadge({ grade }: { grade: string | null }) {
  const lvl = daLevelOf(grade);
  if (!lvl) return null;
  return (
    <View style={[styles.daBadge, lvl === 'lean' && styles.daBadgeLean]}>
      <Text style={styles.daBadgeText}>{lvl === 'da' ? 'DA' : 'LEAN DA'}</Text>
    </View>
  );
}

/** One condition's reading: period/venue · feature · the stat % · grade · DA · why,
 *  then how the same stat reads on each half (FT / 1st / 2nd). */
function EvalRow({ ev, breakdown, rfs, recentForm }: { ev: TeamEval; breakdown?: HalfReading[] | null; rfs?: StatRfs | null; recentForm?: RecentForm | null }) {
  const col = resultColour(ev.color);
  const hasBreakdown = !!breakdown && breakdown.some((h) => h.value != null);
  const daQ = daQuantText(ev);
  return (
    <View style={[styles.evalRow, { backgroundColor: resultBackground(ev.color) }]}>
      <View style={styles.evalHead}>
        <Text style={[styles.evalFeature, { color: col }]} numberOfLines={1}>{periodLabel(ev.period)} · {ev.dimensionLabel} · {ev.feature}</Text>
        <View style={styles.evalGradeWrap}>
          <DaBadge grade={ev.grade} />
          {rfs ? <View style={styles.rfsBadge}><Text style={styles.rfsBadgeText}>RFS</Text></View> : null}
          {ev.grade ? <Text style={[styles.evalGrade, { color: col }]}>{ev.grade}</Text> : null}
        </View>
      </View>
      <Text style={styles.evalMeta}><Text style={[styles.gradeStat, { color: col }]}>{ev.valueText}</Text> · {ev.method}{ev.sample != null ? ` · ${ev.sample}g` : ''}</Text>
      <Text style={styles.evalReason} numberOfLines={2}>{ev.reason}</Text>
      {daQ ? <Text style={styles.daQuantRow} numberOfLines={1}>⚠ DA (Double Agent) · Home vs Overall diverge — {daQ}</Text> : null}
      {rfs ? (
        <Text style={styles.rfsNote} numberOfLines={2}>
          ⚠ Recently failed · usually {rfs.usual} ({rfs.rate}%), but last game {rfs.failed} ({rfs.lastScore} {rfs.lastHome ? 'vs' : '@'} {rfs.lastOpponent})
        </Text>
      ) : null}
      {ev.qualifications && ev.qualifications.length ? <QualList quals={ev.qualifications} /> : null}
      {recentForm ? <RecentFormStrip form={recentForm} /> : null}
      {hasBreakdown ? <HalfSplit readings={breakdown!} scope={splitPeriod(ev.period).scope} /> : null}
    </View>
  );
}

/** Recent form for the stat: the last 5 / 10 / 15 hit-rates plus the latest game
 *  cards (green = the team did the stat that game, muted = it didn't). */
function RecentFormStrip({ form }: { form: RecentForm }) {
  return (
    <View style={styles.formWrap}>
      <Text style={styles.formTitle} numberOfLines={1}>Recent form · {form.usual}</Text>
      <View style={styles.formWindows}>
        {form.windows.map((w) => {
          const c = w.rate >= 65 ? theme.accentGreen : w.rate >= 40 ? theme.yellow : theme.loss;
          return (
            <View key={w.window} style={styles.formWindow}>
              <Text style={styles.formWindowLabel} numberOfLines={1}>L{w.window}</Text>
              <Text style={[styles.formWindowRate, { color: c }]} numberOfLines={1}>{w.rate}%</Text>
              <Text style={styles.formWindowCount} numberOfLines={1}>{w.hits}/{w.games}</Text>
            </View>
          );
        })}
      </View>
      <Text style={styles.formGamesLabel} numberOfLines={1}>Last results (newest first)</Text>
      <View style={styles.formGames}>
        {form.games.map((g, i) => (
          <View key={i} style={[styles.formGame, { backgroundColor: g.hit ? 'rgba(5,150,105,0.14)' : 'rgba(148,163,184,0.12)', borderColor: g.hit ? theme.accentGreen : theme.border }]}>
            <Text style={[styles.formGameScore, { color: g.hit ? theme.accentGreen : theme.textMuted }]} numberOfLines={1}>{g.score}</Text>
            <Text style={styles.formGameOpp} numberOfLines={1}>{g.home ? 'vs' : '@'} {g.opponent}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Every grade-group · column this team qualified for, strongest first (doc:
 *  "show which groups qualified for too in rankings"). The headline is ringed. */
function QualList({ quals }: { quals: GradeQualification[] }) {
  return (
    <View style={styles.qualList}>
      <Text style={styles.qualTitle} numberOfLines={1}>Qualifications · strongest first</Text>
      {quals.map((q, i) => {
        const c = q.direction === 'strong' ? theme.accentGreen : theme.loss;
        return (
          <View key={`${q.source}-${q.column}-${i}`} style={[styles.qualItem, i === 0 && styles.qualItemHead]}>
            <Text style={styles.qualRank}>{i + 1}</Text>
            <Text style={[styles.qualGrade, { color: c }]} numberOfLines={1}>({q.roman}) {q.combined}{q.da ? ' · DA' : ''}</Text>
            <View style={styles.qualColBadge}><Text style={styles.qualColText} numberOfLines={1}>{COLUMN_LABEL[q.column]}</Text></View>
          </View>
        );
      })}
    </View>
  );
}

const SCOPE_LABEL: Record<StatScope, string> = { overall: 'Overall', home: 'Home', away: 'Away' };

/** How the condition's stat reads across the three halves, at its own venue. The
 *  half the condition filters for is ringed so you see what you targeted vs the rest. */
function HalfSplit({ readings, scope }: { readings: HalfReading[]; scope: StatScope }) {
  return (
    <View style={styles.halfSplit}>
      <Text style={styles.halfSplitLabel} numberOfLines={1}>Half split · {SCOPE_LABEL[scope]}</Text>
      <View style={styles.halfCells}>
        {readings.map((h) => {
          const c = resultColour(h.color);
          const hTag = h.half === 'ft' ? 'FT' : h.half === 'ht' ? '1H' : '2H';
          return (
            <View
              key={h.half}
              style={[
                styles.halfCell,
                { borderColor: h.isCurrent ? c : theme.border, backgroundColor: resultBackground(h.color) },
                h.isCurrent && styles.halfCellCurrent,
              ]}
            >
              <Text style={[styles.halfCellTag, h.isCurrent && { color: c }]}>{hTag}{h.isCurrent ? ' •' : ''}</Text>
              <Text style={[styles.halfCellVal, { color: h.value != null ? theme.textPrimary : theme.textFaint }]} numberOfLines={1}>{h.valueText}</Text>
              {h.band ? <Text style={[styles.halfCellBand, { color: c }]} numberOfLines={1}>{h.band}</Text> : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** C. One qualifying team with its per-condition breakdown. */
function ResultCard({ result, upcoming, total, share, breakdownFor, rfsFor, recentFormFor, rank }: { result: StrategyResult; upcoming: UpcomingLite[]; total?: number; share?: LeagueGradeShare; breakdownFor?: (ev: TeamEval) => HalfReading[] | null; rfsFor?: (ev: TeamEval) => StatRfs | null; recentFormFor?: (ev: TeamEval) => RecentForm | null; rank?: StatRank | null }) {
  const tint = resultColour(result.color);
  const nf = nextFixtureFor(result.teamId, result.team, upcoming);
  const ms = total ? matchStrength(result, total) : null;
  const colorLabel = result.color === 'green' ? 'GREEN' : result.color === 'yellow' ? 'YELLOW' : result.color === 'red' ? 'RED' : 'UNGRADED';
  const colorCount = share ? share.byColor[result.color] : 0;
  const colorPct = share && share.total > 0 ? Math.round((colorCount / share.total) * 100) : null;
  const primaryGrade = result.conditions.find((c) => c.grade)?.grade;
  const gradePct = share && share.total > 0 && primaryGrade ? Math.round(((share.byGrade[primaryGrade] ?? 0) / share.total) * 100) : null;
  return (
    <View style={[styles.resultCard, { borderLeftColor: tint }]}>
      <View style={styles.resultTop}>
        <View style={styles.resultTeamWrap}>
          <View style={[styles.colorDot, { backgroundColor: tint }]} />
          <Text style={styles.resultTeam} numberOfLines={1}>{result.team}</Text>
        </View>
        <Text style={styles.resultLeague} numberOfLines={1}>{result.competition}</Text>
      </View>
      {nf ? (
        <Text style={styles.resultNext} numberOfLines={1}>Next: {nf.side === 'home' ? 'vs ' : '@ '}{nf.opponentName} · {nf.side === 'home' ? 'Home' : 'Away'} · {kickoffLabel(nf.fixture.kickoffUnix, nf.fixture.kickoff)}</Text>
      ) : <Text style={styles.resultNextNone}>No upcoming fixture</Text>}
      {ms ? (
        <Text style={styles.resultStrength}>Passes {ms.matched} of {ms.total} rule{ms.total > 1 ? 's' : ''} ({ms.pct}%)</Text>
      ) : null}
      {colorPct != null && share ? (
        <Text style={styles.resultShare} numberOfLines={2}>
          <Text style={{ color: tint }}>{colorLabel}</Text> grade · {colorCount} of {share.total} {result.competition} qualifier{share.total > 1 ? 's' : ''} ({colorPct}%){gradePct != null && primaryGrade ? `  ·  “${primaryGrade}” = ${gradePct}%` : ''}
        </Text>
      ) : null}
      {rank ? (
        <Text style={styles.rankDetail} numberOfLines={2}>
          On this stat: <Text style={styles.rankStrong}>#{rank.leagueRank}</Text> of {rank.leagueTotal} in {result.competition} ({rank.value}%) · <Text style={styles.rankStrong}>#{rank.worldRank}</Text> of {rank.worldTotal} across all loaded leagues
        </Text>
      ) : null}
      {rank && rank.leagueTier ? (
        <Text style={styles.rankDetail} numberOfLines={2}>
          Gap/DA ({Math.round(rank.gap ?? 0)}pt{domText(rank.dominantVenue) ? ` · dominant ${rank.dominantVenue}` : ''}): <Text style={styles.rankStrong}>#{rank.gapLeagueRank}</Text> of {rank.gapLeagueTotal} in league · <Text style={[styles.rankStrong, { color: tierColor(rank.leagueTier) }]}>{TIER_LABEL[rank.leagueTier]} third</Text>
          {rank.worldTier ? <Text> · <Text style={styles.rankStrong}>#{rank.gapWorldRank}</Text> of {rank.gapWorldTotal} world · <Text style={[styles.rankStrong, { color: tierColor(rank.worldTier) }]}>{TIER_LABEL[rank.worldTier]} third</Text></Text> : null}
        </Text>
      ) : null}
      <View style={styles.evalList}>
        {result.conditions.map((ev, i) => (<EvalRow key={i} ev={ev} breakdown={breakdownFor?.(ev) ?? null} rfs={rfsFor?.(ev) ?? null} recentForm={recentFormFor?.(ev) ?? null} />))}
      </View>
    </View>
  );
}

/** Fixtures as a table split into three grade colours; each row shows the matched
 *  side(s) and the exact grade each feature qualified with. Tap for the breakdown. */
function GradeFixtureTable({ rows, breakdownFor, rfsFor, recentFormFor }: { rows: FxRow[]; breakdownFor: (ev: TeamEval) => HalfReading[] | null; rfsFor: (ev: TeamEval) => StatRfs | null; recentFormFor: (ev: TeamEval) => RecentForm | null }) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  return (
    <View>
      <DragScroll horizontal style={styles.fxScroll} contentContainerStyle={styles.fxScrollContent}>
        <View style={[styles.fxTable, { minWidth: 900 }]}>
          <View style={[styles.fxTRow, styles.fxTHeadRow]}>
            <Text style={[styles.cKick, styles.fxTHead]}>Kickoff</Text>
            <Text style={[styles.cFix, styles.fxTHead]}>Fixture</Text>
            <Text style={[styles.cLeague, styles.fxTHead]}>League</Text>
            <Text style={[styles.cApplies, styles.fxTHead]}>Applies</Text>
            <Text style={[styles.cGrades, styles.fxTHead]}>Qualified grades</Text>
          </View>
          {COLOR_SECTIONS.map((sec) => {
            const group = rows.filter((r) => r.color === sec.color);
            if (!group.length) return null;
            const col = resultColour(sec.color);
            return (
              <View key={sec.color}>
                <View style={[styles.fxSectionRow, { backgroundColor: resultBackground(sec.color) }]}>
                  <Text style={[styles.fxSectionTitle, { color: col }]}>{sec.label} · {group.length}</Text>
                </View>
                {group.map((r) => {
                  const isActive = expandedId === r.fx.id;
                  return (
                    <Fragment key={r.fx.id}>
                      <GradeFixtureRow r={r} active={isActive} onPress={() => setExpandedId((x) => (x === r.fx.id ? null : r.fx.id))} />
                      {isActive ? (
                        <View style={[styles.fxDetailInline, { minWidth: 900, borderColor: resultColour(r.color) }]}>
                          <Text style={styles.fxDetailTitle}>{r.fx.home.name} vs {r.fx.away.name} · {r.fx.competition.name}</Text>
                          <SideEvals title={`Home team ✓ · ${r.fx.home.name}`} tint={theme.accentGreen} evals={r.homeEvals} breakdownFor={breakdownFor} rfsFor={rfsFor} recentFormFor={recentFormFor} />
                          <SideEvals title={`Away team ✓ · ${r.fx.away.name}`} tint={theme.accentBlue} evals={r.awayEvals} breakdownFor={breakdownFor} rfsFor={rfsFor} recentFormFor={recentFormFor} />
                        </View>
                      ) : null}
                    </Fragment>
                  );
                })}
              </View>
            );
          })}
        </View>
      </DragScroll>
      <Text style={styles.hint}>Grouped by the matched side's strongest grade. Tap a fixture to open which feature each team qualified on, right below it.</Text>
    </View>
  );
}

function GradeFixtureRow({ r, active, onPress }: { r: FxRow; active: boolean; onPress: () => void }) {
  const { fx, homeEvals, awayEvals } = r;
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: active }} onPress={onPress} style={[styles.fxTRow, { backgroundColor: active ? theme.surfaceHover : resultBackground(r.color) }]}>
      <Text style={[styles.cKick, styles.fxCellMuted]} numberOfLines={2}>{kickoffLabel(fx.kickoffUnix, fx.kickoff)}</Text>
      <View style={styles.cFix}>
        <Text style={styles.fxHome} numberOfLines={1}>{fx.home.name}</Text>
        <Text style={styles.fxAway} numberOfLines={1}>{fx.away.name}</Text>
      </View>
      <Text style={[styles.cLeague, styles.fxCellFaint]} numberOfLines={2}>{fx.competition.name}</Text>
      <View style={styles.cApplies}>
        {homeEvals.length ? <Text style={[styles.matchTick, { color: theme.accentGreen }]} numberOfLines={1}>Home ✓</Text> : null}
        {awayEvals.length ? <Text style={[styles.matchTick, { color: theme.accentBlue }]} numberOfLines={1}>Away ✓</Text> : null}
        {!homeEvals.length && !awayEvals.length ? <Text style={styles.fxNone}>—</Text> : null}
      </View>
      <View style={styles.cGrades}>
        <GradeChips sideLabel="H" evals={homeEvals} />
        <GradeChips sideLabel="A" evals={awayEvals} />
      </View>
    </Pressable>
  );
}

function GradeChips({ sideLabel, evals }: { sideLabel: string; evals: TeamEval[] }) {
  if (!evals.length) return null;
  return (
    <View style={styles.gradeChipsRow}>
      {evals.map((ev, i) => (
        <View key={i} style={[styles.gradeChip, { borderColor: resultColour(ev.color), backgroundColor: resultBackground(ev.color) }]}>
          <Text style={[styles.gradeChipSide, { color: resultColour(ev.color) }]}>{sideLabel}</Text>
          <Text style={styles.gradeChipTxt} numberOfLines={1}>{periodLabel(ev.period)} · {ev.feature} · {ev.valueText}{ev.grade ? ` · ${ev.grade}` : ''}</Text>
          <DaBadge grade={ev.grade} />
        </View>
      ))}
    </View>
  );
}

/** The conditions one fixture side satisfied, with period/venue/grade/reason. */
function SideEvals({ title, tint, evals, breakdownFor, rfsFor, recentFormFor }: { title: string; tint: string; evals: TeamEval[]; breakdownFor?: (ev: TeamEval) => HalfReading[] | null; rfsFor?: (ev: TeamEval) => StatRfs | null; recentFormFor?: (ev: TeamEval) => RecentForm | null }) {
  if (!evals.length) return null;
  return (
    <View style={styles.sideEvalsWrap}>
      <Text style={[styles.sideEvalsTitle, { color: tint }]} numberOfLines={1}>{title}</Text>
      <View style={styles.evalList}>
        {evals.map((ev, i) => (<EvalRow key={i} ev={ev} breakdown={breakdownFor?.(ev) ?? null} rfs={rfsFor?.(ev) ?? null} recentForm={recentFormFor?.(ev) ?? null} />))}
      </View>
    </View>
  );
}

/** Side panel: the user's saved strategies. Each opens a build (not its results)
 *  and the live engines recompute the latest qualifying teams / fixtures. */
function SavedStrategiesPanel({ saved, activeId, onLoad, onRemove, style }: {
  saved: SavedStrategy[];
  activeId: string | null;
  onLoad: (s: SavedStrategy) => void;
  onRemove: (id: string) => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.aside, style]}>
      <View style={styles.asideHead}>
        <Text style={styles.asideTitle}>★ Saved strategies</Text>
        <View style={styles.asideCount}><Text style={styles.asideCountText}>{saved.length}</Text></View>
      </View>
      <Text style={styles.asideHint}>Only the build is saved — open one to recompute the latest teams & fixtures.</Text>
      {saved.length === 0 ? (
        <Text style={styles.asideEmpty}>No saved strategies yet. Build your conditions, then tap ★ Save to keep the recipe.</Text>
      ) : (
        <View style={styles.asideList}>
          {saved.map((s) => {
            const active = s.id === activeId;
            return (
              <View key={s.id} style={[styles.savedItem, active && styles.savedItemActive]}>
                <Pressable accessibilityRole="button" accessibilityLabel={`Open ${s.name}`} onPress={() => onLoad(s)} style={styles.savedMain}>
                  <View style={styles.savedNameRow}>
                    <View style={[styles.savedDot, { backgroundColor: active ? theme.accentGreen : theme.accentPurple }]} />
                    <Text style={styles.savedName} numberOfLines={1}>{s.name}</Text>
                  </View>
                  <Text style={styles.savedDesc} numberOfLines={4}>{s.description}</Text>
                </Pressable>
                <View style={styles.savedActions}>
                  <Pressable accessibilityRole="button" onPress={() => onLoad(s)} style={[styles.savedLoad, active && styles.savedLoadOn]}>
                    <Text style={[styles.savedLoadText, active && styles.savedLoadTextOn]}>{active ? '● Loaded' : 'Open'}</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel="Delete strategy" onPress={() => onRemove(s.id)} style={styles.savedDel}>
                    <Text style={styles.savedDelText}>Delete</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', alignSelf: 'stretch' },
  layout: { width: '100%', alignSelf: 'stretch', gap: spacing.md },
  layoutRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.lg },
  main: { flex: 1, minWidth: 0 },
  header: { marginBottom: spacing.md },
  title: { fontFamily: fonts.display, fontSize: 24, color: theme.textPrimary, marginBottom: spacing.xs },
  subtitle: { fontFamily: fonts.body, fontSize: 13, lineHeight: 20, color: theme.textMuted },

  sectionLabel: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.textPrimary, marginBottom: spacing.sm },

  builderCard: { borderWidth: layout.borderWidth, borderColor: theme.border, borderRadius: layout.borderRadius, backgroundColor: theme.surface, padding: spacing.md, gap: spacing.sm },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  filterCol: { flexDirection: 'column' },
  flex: { flexGrow: 1, flexBasis: 160, minWidth: 140 },
  full: { width: '100%', minWidth: 0, flexBasis: 'auto', flexGrow: 0 },
  numLabel: { fontFamily: fonts.bodySemiBold, fontSize: 11, color: theme.textMuted, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: spacing.xs },
  numInput: { borderWidth: layout.borderWidth, borderColor: theme.borderStrong, borderRadius: layout.borderRadius, paddingHorizontal: spacing.md, paddingVertical: 10, fontFamily: fonts.bodyMedium, fontSize: 14, color: theme.textPrimary, backgroundColor: theme.surface },
  addBtn: { alignSelf: 'flex-start', marginTop: spacing.xs, borderWidth: 1.5, borderColor: theme.accentGreen, borderRadius: 999, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, backgroundColor: 'rgba(5,150,105,0.08)' },
  addBtnPressed: { opacity: 0.7 },
  addBtnText: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.accentGreen },

  conditionsCard: { marginTop: spacing.md, borderWidth: layout.borderWidth, borderColor: theme.border, borderRadius: layout.borderRadius, backgroundColor: theme.surface, padding: spacing.md, gap: spacing.sm },
  conditionsHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, flexWrap: 'wrap' },
  logicRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  logicBtn: { borderWidth: 1.5, borderColor: theme.border, borderRadius: 999, paddingHorizontal: spacing.md, paddingVertical: 5, backgroundColor: theme.surface },
  logicBtnOn: { borderColor: theme.accentBlue, backgroundColor: 'rgba(37,99,235,0.10)' },
  logicBtnText: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: theme.textMuted },
  logicBtnTextOn: { color: theme.accentBlue },
  clearBtn: { borderWidth: 1.5, borderColor: theme.border, borderRadius: 999, paddingHorizontal: spacing.md, paddingVertical: 5, backgroundColor: theme.surface },
  clearBtnText: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: theme.loss },
  logicHint: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: layout.borderWidth, borderColor: theme.borderStrong, borderRadius: 999, paddingLeft: spacing.sm, paddingRight: 4, paddingVertical: 4, backgroundColor: theme.surfaceHover },
  chipText: { fontFamily: fonts.bodyMedium, fontSize: 11, color: theme.textPrimary, maxWidth: 320 },
  chipX: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.surfaceMuted },
  chipXText: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.textMuted, lineHeight: 15 },

  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 20, marginTop: spacing.md },
  statusLive: { fontFamily: fonts.bodyMedium, fontSize: 12, color: theme.accentGreen },
  statusMuted: { fontFamily: fonts.body, fontSize: 12, color: theme.textMuted },
  empty: { fontFamily: fonts.body, fontSize: 13, color: theme.textMuted, textAlign: 'center', paddingVertical: spacing.lg },

  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  summaryTile: { flexGrow: 1, flexBasis: 90, minWidth: 80, borderWidth: layout.borderWidth, borderColor: theme.border, borderRadius: layout.borderRadius, backgroundColor: theme.surface, paddingVertical: spacing.sm, alignItems: 'center' },
  summaryValue: { fontFamily: fonts.display, fontSize: 22 },
  summaryLabel: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted, marginTop: 2 },

  filterCard: { marginTop: spacing.md, borderWidth: layout.borderWidth, borderColor: theme.border, borderRadius: layout.borderRadius, backgroundColor: theme.surface, padding: spacing.md },

  resultList: { gap: spacing.sm, marginTop: spacing.sm },
  resultCard: { borderWidth: layout.borderWidth, borderColor: theme.border, borderLeftWidth: 4, borderRadius: layout.borderRadius, backgroundColor: theme.surface, padding: spacing.md, gap: 6 },
  resultTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  resultTeamWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  colorDot: { width: 10, height: 10, borderRadius: 5 },
  resultTeam: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: theme.textPrimary, flexShrink: 1 },
  resultLeague: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted, maxWidth: 160 },
  resultNext: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted },
  resultNextNone: { fontFamily: fonts.body, fontSize: 11, color: theme.textFaint },
  evalList: { gap: spacing.xs, marginTop: 2 },
  evalRow: { borderRadius: layout.borderRadius, padding: spacing.sm, gap: 2 },
  evalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  evalFeature: { fontFamily: fonts.bodySemiBold, fontSize: 12, flex: 1 },
  evalGrade: { fontFamily: fonts.bodySemiBold, fontSize: 12 },
  evalMeta: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted },
  evalReason: { fontFamily: fonts.body, fontSize: 11, lineHeight: 16, color: theme.textPrimary },

  halfSplit: { marginTop: 4, gap: 3 },
  halfSplitLabel: { fontFamily: fonts.bodySemiBold, fontSize: 10, letterSpacing: 0.4, textTransform: 'uppercase', color: theme.textFaint },
  halfCells: { flexDirection: 'row', gap: spacing.xs },
  halfCell: { flex: 1, borderWidth: 1, borderRadius: layout.borderRadius, paddingVertical: 4, paddingHorizontal: spacing.xs, alignItems: 'center', gap: 1 },
  halfCellCurrent: { borderWidth: 1.5 },
  halfCellTag: { fontFamily: fonts.bodySemiBold, fontSize: 10, color: theme.textMuted },
  halfCellVal: { fontFamily: fonts.bodySemiBold, fontSize: 13 },
  halfCellBand: { fontFamily: fonts.bodySemiBold, fontSize: 9, letterSpacing: 0.3 },

  modeRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  modeBtn: { flex: 1, borderWidth: 1.5, borderColor: theme.border, borderRadius: layout.borderRadius, paddingVertical: spacing.sm, alignItems: 'center', backgroundColor: theme.surface },
  modeBtnOn: { borderColor: theme.accentGreen, backgroundColor: 'rgba(5,150,105,0.08)' },
  modeBtnText: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.textMuted },
  modeBtnTextOn: { color: theme.accentGreen },

  topListNote: { fontFamily: fonts.body, fontSize: 12, lineHeight: 18, color: theme.textMuted, marginTop: spacing.sm },
  marketRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  marketPill: { borderWidth: layout.borderWidth, borderColor: theme.border, borderRadius: 999, paddingHorizontal: spacing.md, paddingVertical: 5, backgroundColor: theme.surfaceHover },
  marketPillOn: { borderColor: theme.accentBlue, backgroundColor: 'rgba(37,99,235,0.10)' },
  marketPillText: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted },
  marketPillTextOn: { fontFamily: fonts.bodySemiBold, color: theme.accentBlue },

  chipNot: { borderColor: theme.loss },
  chipNotBtn: { borderWidth: layout.borderWidth, borderColor: theme.border, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1, backgroundColor: theme.surface },
  chipNotBtnOn: { borderColor: theme.loss, backgroundColor: 'rgba(220,38,38,0.08)' },
  chipNotText: { fontFamily: fonts.bodySemiBold, fontSize: 9, color: theme.textFaint, letterSpacing: 0.5 },
  chipNotTextOn: { color: theme.loss },

  // Fixtures table (three colours by risk)
  fxScroll: { width: '100%', maxWidth: '100%', marginTop: spacing.sm },
  fxScrollContent: { minWidth: '100%' },
  fxTable: { width: '100%', backgroundColor: theme.surface, borderWidth: layout.borderWidth, borderColor: theme.border, borderRadius: layout.borderRadius, overflow: 'hidden' },
  fxTRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, paddingHorizontal: spacing.sm, borderTopWidth: layout.borderWidth, borderTopColor: theme.border },
  fxTHeadRow: { backgroundColor: theme.surfaceMuted, borderTopWidth: 0 },
  fxTHead: { fontFamily: fonts.bodySemiBold, fontSize: 10, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 4 },
  fxSectionRow: { width: '100%', paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderTopWidth: layout.borderWidth, borderTopColor: theme.border },
  fxSectionTitle: { fontFamily: fonts.bodySemiBold, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
  cKick: { width: 118, paddingHorizontal: 4 },
  cFix: { width: 180, paddingHorizontal: 4 },
  cLeague: { width: 120, paddingHorizontal: 4 },
  cBest: { width: 170, paddingHorizontal: 4 },
  cAlt: { width: 124, paddingHorizontal: 4 },
  cRisk: { width: 70, paddingHorizontal: 4, alignItems: 'flex-start' },
  cMatch: { width: 84, paddingHorizontal: 4 },
  fxCellMuted: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted },
  fxCellFaint: { fontFamily: fonts.body, fontSize: 11, color: theme.textFaint },
  fxHome: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.textPrimary },
  fxAway: { fontFamily: fonts.bodyMedium, fontSize: 13, color: theme.textMuted },
  fxMarket: { fontFamily: fonts.body, fontSize: 9, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
  fxSel: { fontFamily: fonts.bodySemiBold, fontSize: 12 },
  fxProb: { fontFamily: fonts.display, fontSize: 15 },
  fxEdge: { fontFamily: fonts.bodyMedium, fontSize: 10, color: theme.accentGreen },
  fxAltSel: { fontFamily: fonts.bodyMedium, fontSize: 11, color: theme.textPrimary },
  fxAltProb: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: theme.textMuted },
  fxNone: { fontFamily: fonts.body, fontSize: 11, color: theme.textFaint },
  riskChip: { alignSelf: 'flex-start', borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 1 },
  riskChipTxt: { fontFamily: fonts.bodySemiBold, fontSize: 10 },
  riskScore: { fontFamily: fonts.body, fontSize: 10, color: theme.textFaint, marginTop: 2 },
  matchTick: { fontFamily: fonts.bodySemiBold, fontSize: 11, marginBottom: 1 },
  fxDetail: { marginTop: spacing.sm, borderWidth: 1.5, borderRadius: layout.borderRadius, backgroundColor: theme.surface, padding: spacing.md, gap: spacing.xs },
  // Inline accordion: the detail opens directly under its row inside the table, not at the bottom.
  fxDetailInline: { borderTopWidth: 2, borderLeftWidth: 3, backgroundColor: theme.surfaceHover, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, gap: spacing.xs },
  fxDetailTitle: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: theme.textPrimary },
  matchedWrap: { gap: 2, marginTop: 2 },
  matchedLine: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted },
  matchedSide: { fontFamily: fonts.bodySemiBold, color: theme.accentGreen },
  hint: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted, textAlign: 'center', marginTop: spacing.sm },

  // Save control (in the conditions card)
  saveBtn: { borderWidth: 1.5, borderColor: theme.accentPurple, borderRadius: 999, paddingHorizontal: spacing.md, paddingVertical: 5, backgroundColor: 'rgba(124,58,237,0.08)' },
  saveBtnOn: { backgroundColor: 'rgba(124,58,237,0.16)' },
  saveBtnText: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: theme.accentPurple },
  saveBtnTextOn: { color: theme.accentPurple },
  saveRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs, flexWrap: 'wrap' },
  saveInput: { flexGrow: 1, flexBasis: 220, minWidth: 160, borderWidth: layout.borderWidth, borderColor: theme.borderStrong, borderRadius: layout.borderRadius, paddingHorizontal: spacing.sm, paddingVertical: 8, fontFamily: fonts.body, fontSize: 13, color: theme.textPrimary, backgroundColor: theme.surface },
  saveConfirm: { borderRadius: 999, paddingHorizontal: spacing.lg, paddingVertical: 9, backgroundColor: theme.accentPurple },
  saveConfirmText: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: '#FFFFFF' },

  // Saved-strategies side panel
  aside: { borderWidth: layout.borderWidth, borderColor: theme.border, borderRadius: layout.borderRadius, backgroundColor: theme.surface, padding: spacing.md, gap: spacing.sm },
  asideWide: { width: 320, flexShrink: 0, position: 'sticky' as 'relative', top: spacing.md },
  asideStacked: { width: '100%' },
  asideHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  asideTitle: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: theme.accentPurple },
  asideCount: { minWidth: 24, height: 22, paddingHorizontal: 7, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(124,58,237,0.12)' },
  asideCountText: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: theme.accentPurple },
  asideHint: { fontFamily: fonts.body, fontSize: 11, lineHeight: 16, color: theme.textMuted },
  asideEmpty: { fontFamily: fonts.body, fontSize: 12, lineHeight: 18, color: theme.textFaint, paddingVertical: spacing.md, textAlign: 'center' },
  asideList: { gap: spacing.sm },
  savedItem: { borderWidth: layout.borderWidth, borderColor: theme.border, borderLeftWidth: 3, borderLeftColor: theme.accentPurple, borderRadius: layout.borderRadius, backgroundColor: theme.surfaceHover, padding: spacing.sm, gap: 6 },
  savedItemActive: { borderColor: theme.accentGreen, borderLeftColor: theme.accentGreen, backgroundColor: 'rgba(5,150,105,0.06)' },
  savedMain: { gap: 4 },
  savedNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  savedDot: { width: 8, height: 8, borderRadius: 4 },
  savedName: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.textPrimary, flexShrink: 1 },
  savedDesc: { fontFamily: fonts.body, fontSize: 11, lineHeight: 16, color: theme.textMuted },
  savedActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: 2 },
  savedLoad: { flexGrow: 1, borderWidth: 1.5, borderColor: theme.accentBlue, borderRadius: 999, paddingVertical: 6, alignItems: 'center', backgroundColor: 'rgba(37,99,235,0.08)' },
  savedLoadOn: { borderColor: theme.accentGreen, backgroundColor: 'rgba(5,150,105,0.10)' },
  savedLoadText: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: theme.accentBlue },
  savedLoadTextOn: { color: theme.accentGreen },
  savedDel: { borderWidth: layout.borderWidth, borderColor: theme.border, borderRadius: 999, paddingHorizontal: spacing.md, paddingVertical: 6, backgroundColor: theme.surface },
  savedDelText: { fontFamily: fonts.bodyMedium, fontSize: 11, color: theme.loss },

  // Header title row + explainer trigger
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, flexWrap: 'wrap' },
  helpBtn: { borderWidth: 1.5, borderColor: theme.accentBlue, borderRadius: 999, paddingHorizontal: spacing.md, paddingVertical: 5, backgroundColor: 'rgba(37,99,235,0.08)' },
  helpBtnPressed: { opacity: 0.7 },
  helpBtnText: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: theme.accentBlue },

  // Explainer modal
  helpOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
  helpBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.45)' },
  helpCard: { width: '100%', maxWidth: 520, maxHeight: '86%', backgroundColor: theme.surface, borderRadius: 16, borderWidth: layout.borderWidth, borderColor: theme.border, padding: spacing.lg, zIndex: 1 },
  helpHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  helpTitle: { fontFamily: fonts.display, fontSize: 20, color: theme.textPrimary, flexShrink: 1 },
  helpClose: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.surfaceMuted },
  helpCloseText: { fontFamily: fonts.bodySemiBold, fontSize: 20, color: theme.textMuted, lineHeight: 22 },
  helpLead: { fontFamily: fonts.body, fontSize: 13, lineHeight: 20, color: theme.textMuted, marginTop: spacing.xs, marginBottom: spacing.sm },
  helpScroll: { flexGrow: 0 },
  helpScrollBody: { gap: spacing.md, paddingVertical: spacing.xs },
  helpStep: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  helpNum: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 },
  helpNumText: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: '#FFFFFF' },
  helpStepBody: { flex: 1, gap: 2 },
  helpStepTitle: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
  helpStepText: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: theme.textPrimary },
  helpStrong: { fontFamily: fonts.bodySemiBold, color: theme.textPrimary },
  helpCta: { marginTop: spacing.md, borderRadius: 999, paddingVertical: 11, alignItems: 'center', backgroundColor: theme.accentGreen },
  helpCtaText: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: '#FFFFFF' },

  // Teams results table
  backtestNote: { fontFamily: fonts.body, fontSize: 11, lineHeight: 16, color: theme.textMuted, marginTop: spacing.sm },
  tTeam: { width: 160, paddingHorizontal: 4 },
  tNext: { width: 160, paddingHorizontal: 4 },
  tCond: { width: 70, paddingHorizontal: 4 },
  tGrade: { width: 100, paddingHorizontal: 4 },
  tRead: { width: 120, paddingHorizontal: 4 },
  tRate: { width: 96, paddingHorizontal: 4, alignItems: 'flex-start' },
  teamNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  gradeTxt: { fontFamily: fonts.bodySemiBold, fontSize: 12 },
  rateTxt: { fontFamily: fonts.display, fontSize: 16 },
  btWrap: { marginTop: spacing.sm, borderTopWidth: layout.borderWidth, borderTopColor: theme.border, paddingTop: spacing.sm, gap: 6 },
  btTitle: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: theme.textPrimary },
  btDots: { flexDirection: 'row', flexWrap: 'wrap', gap: 3 },
  btDot: { width: 12, height: 12, borderRadius: 3 },
  btNote: { fontFamily: fonts.body, fontSize: 11, lineHeight: 16, color: theme.textMuted },

  // Global period + venue panel
  periodCard: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, borderWidth: layout.borderWidth, borderColor: theme.border, borderRadius: layout.borderRadius, backgroundColor: theme.surface, padding: spacing.md, marginBottom: spacing.sm },
  periodGroup: { gap: spacing.xs },
  periodLabel: { fontFamily: fonts.bodySemiBold, fontSize: 10, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  segRow: { flexDirection: 'row', gap: spacing.xs },
  segBtn: { borderWidth: 1.5, borderColor: theme.border, borderRadius: 999, paddingHorizontal: spacing.md, paddingVertical: 6, backgroundColor: theme.surface },
  segBtnOn: { borderColor: theme.accentGreen, backgroundColor: 'rgba(5,150,105,0.10)' },
  segText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: theme.textMuted },
  segTextOn: { fontFamily: fonts.bodySemiBold, color: theme.accentGreen },

  // Grade-qualification fixtures table
  cApplies: { width: 84, paddingHorizontal: 4 },
  cGrades: { flex: 1, minWidth: 260, paddingHorizontal: 4, gap: 3 },
  gradeChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  gradeChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: layout.borderWidth, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  gradeChipSide: { fontFamily: fonts.bodySemiBold, fontSize: 10 },
  gradeChipTxt: { fontFamily: fonts.bodyMedium, fontSize: 11, color: theme.textPrimary, maxWidth: 220 },

  // Quick-strategy presets
  presetCard: { borderWidth: layout.borderWidth, borderColor: theme.border, borderRadius: layout.borderRadius, backgroundColor: theme.surface, padding: spacing.md, marginBottom: spacing.sm, gap: spacing.sm },
  presetTitle: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.accentOrange },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  presetChip: { borderWidth: 1.5, borderColor: theme.accentOrange, borderRadius: 999, paddingHorizontal: spacing.md, paddingVertical: 6, backgroundColor: 'rgba(234,88,12,0.07)' },
  presetChipText: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: theme.accentOrange },
  // Featured rules — one-tap shortcuts to the high-value tests inside the builder.
  featuredWrap: { gap: 6, marginBottom: spacing.xs },
  featuredLabel: { fontFamily: fonts.bodySemiBold, fontSize: 10, letterSpacing: 0.6, color: theme.textMuted, textTransform: 'uppercase' },
  featuredRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  featuredChip: { borderWidth: 1, borderColor: theme.border, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: theme.bg },
  featuredChipActive: { borderColor: theme.accentGreen, backgroundColor: 'rgba(5,150,105,0.10)' },
  featuredChipText: { fontFamily: fonts.bodyMedium, fontSize: 11, color: theme.textMuted },
  featuredChipTextActive: { color: theme.accentGreen, fontFamily: fonts.bodySemiBold },

  // Self-explaining result lines
  resultStrength: { fontFamily: fonts.bodySemiBold, fontSize: 11, color: theme.accentBlue },
  resultShare: { fontFamily: fonts.body, fontSize: 11, lineHeight: 16, color: theme.textMuted },

  // Read-context note + per-side fixture detail
  readNote: { fontFamily: fonts.body, fontSize: 11, lineHeight: 16, color: theme.textMuted, marginBottom: spacing.sm },
  sideEvalsWrap: { marginTop: spacing.sm, gap: 4 },
  sideEvalsTitle: { fontFamily: fonts.bodySemiBold, fontSize: 13 },

  // Split Home | Away builders + per-builder read row
  splitRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start', width: '100%' },
  builderHome: { borderLeftWidth: 3, borderLeftColor: theme.accentGreen },
  builderAway: { borderLeftWidth: 3, borderLeftColor: theme.accentBlue },
  readRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.xs },

  // Condition chips grouped by side
  chipGroups: { gap: spacing.sm },
  chipGroup: { gap: spacing.xs },
  chipGroupLabel: { fontFamily: fonts.bodySemiBold, fontSize: 11, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },

  // Grade / DA emphasis
  evalGradeWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  gradeStat: { fontFamily: fonts.bodySemiBold, fontSize: 12 },
  daBadge: { borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, backgroundColor: theme.loss },
  daBadgeLean: { backgroundColor: theme.yellow },
  daBadgeText: { fontFamily: fonts.bodySemiBold, fontSize: 9, color: '#FFFFFF', letterSpacing: 0.5 },
  rfsBadge: { borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, backgroundColor: '#C2410C' },
  rfsBadgeText: { fontFamily: fonts.bodySemiBold, fontSize: 9, color: '#FFFFFF', letterSpacing: 0.5 },
  rfsNote: { fontFamily: fonts.body, fontSize: 11, lineHeight: 16, color: '#C2410C' },

  // Recent form (last 5/10/15 + latest results)
  formWrap: { marginTop: spacing.sm, gap: 4 },
  formTitle: { fontFamily: fonts.bodySemiBold, fontSize: 10, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  formWindows: { flexDirection: 'row', gap: spacing.xs },
  formWindow: { flex: 1, borderWidth: layout.borderWidth, borderColor: theme.border, borderRadius: layout.borderRadius, paddingVertical: 4, alignItems: 'center', backgroundColor: theme.surface },
  formWindowLabel: { fontFamily: fonts.bodySemiBold, fontSize: 10, color: theme.textMuted },
  formWindowRate: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
  formWindowCount: { fontFamily: fonts.body, fontSize: 9, color: theme.textFaint },
  formGamesLabel: { fontFamily: fonts.body, fontSize: 9, color: theme.textFaint, marginTop: 2 },
  formGames: { flexDirection: 'row', flexWrap: 'wrap', gap: 3 },
  formGame: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2, minWidth: 54 },
  formGameScore: { fontFamily: fonts.bodySemiBold, fontSize: 11 },
  formGameOpp: { fontFamily: fonts.body, fontSize: 8, color: theme.textFaint },

  // Grade-group · column qualifications (ranked)
  qualList: { marginTop: spacing.sm, gap: 3 },
  qualTitle: { fontFamily: fonts.bodySemiBold, fontSize: 10, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  qualItem: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2 },
  qualItemHead: { borderLeftWidth: 2, borderLeftColor: theme.accentBlue, paddingLeft: 5 },
  qualRank: { fontFamily: fonts.bodySemiBold, fontSize: 10, color: theme.textFaint, minWidth: 12, textAlign: 'center' },
  qualGrade: { fontFamily: fonts.bodySemiBold, fontSize: 12, flexShrink: 1 },
  qualColBadge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1, backgroundColor: theme.surfaceHover, borderWidth: 1, borderColor: theme.border },
  qualColText: { fontFamily: fonts.bodySemiBold, fontSize: 10, color: theme.textMuted },

  // Column chips on a team row (Ordinary / + Series / RFS)
  colChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 3, marginTop: 2 },
  colChip: { borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, backgroundColor: theme.surfaceHover, borderWidth: 1, borderColor: theme.border },
  colChipSeries: { backgroundColor: 'rgba(5,150,105,0.14)', borderColor: theme.accentGreen },
  colChipRfs: { backgroundColor: 'rgba(194,65,12,0.14)', borderColor: '#C2410C' },
  colChipText: { fontFamily: fonts.bodySemiBold, fontSize: 9, color: theme.textMuted, letterSpacing: 0.3 },
  colChipTextOn: { color: theme.textPrimary },

  // Stat rank — own league vs across leagues
  rankLine: { fontFamily: fonts.bodySemiBold, fontSize: 9, color: theme.accentBlue, marginTop: 1 },
  gapLine: { fontFamily: fonts.bodySemiBold, fontSize: 9, color: theme.textMuted, marginTop: 1 },
  domText: { color: theme.accentBlue },
  rankDetail: { fontFamily: fonts.body, fontSize: 11, lineHeight: 16, color: theme.textMuted },
  rankStrong: { fontFamily: fonts.bodySemiBold, color: theme.accentBlue },

  // DA (Double Agent) surfaced on the row + its quantifier
  gradeLine: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  daQuant: { fontFamily: fonts.bodySemiBold, fontSize: 9, color: theme.loss, marginTop: 1 },
  daQuantRow: { fontFamily: fonts.bodySemiBold, fontSize: 11, lineHeight: 16, color: theme.loss },
});
