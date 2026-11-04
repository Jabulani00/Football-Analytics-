import { useEffect, useMemo, useState, type ReactNode } from 'react';
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
import { fetchAllFixturesBetween, seasonWindowUnix, type Fixture, type RawFixture } from '@/services/oddAlerts';
import { TARGET_MARKETS, backtestTeam, targetMarket, type BacktestResult, type BacktestScope, type TargetMarket } from '@/utils/strategyBacktest';
import { clientStaleTime } from '@/services/oddAlertsCachePolicy';
import { buildLeagueStatsLive } from '@/services/statsBuilder';
import { nextFixtureFor, type UpcomingLite } from '@/utils/statsGrading';
import {
  DIMENSIONS, FIXTURE_SIDES, STRATEGY_PRESETS, buildStrategyConfig, conditionLabel, conditionMembership,
  evaluateFixtureSides, evaluateStrategy, filterResults, fixtureSideLabel, getDimension, gradeShareByLeague,
  matchStrength, needsExport, needsFixtures, periodFrom, periodLabel, resultBackground, resultColour,
  splitPeriod, summarize,
  type CondMembership, type Condition, type Dimension, type FixtureSide, type LeagueBundle, type LeagueGradeShare,
  type ResultColor, type SavedStrategy, type StatHalf, type StatScope, type StrategyLogic, type StrategyPeriod,
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
function kickoffLabel(unix: number, fallback: string): string {
  if (!Number.isFinite(unix) || unix <= 0) return fallback;
  try {
    return new Date(unix * 1000).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch { return fallback; }
}
const COLOR_GROUPS: { value: ResultColor; label: string }[] = [
  { value: 'green', label: 'Green · strongest' },
  { value: 'yellow', label: 'Yellow · middle' },
  { value: 'red', label: 'Red · weakest' },
  { value: 'none', label: 'Ungraded' },
];

/** A qualifying fixture: the conditions each team satisfied, and the strongest colour. */
type FxRow = { fx: Fixture; homeEvals: TeamEval[]; awayEvals: TeamEval[]; color: ResultColor };
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
  // Read-context for NEW conditions: period (FT/1H/2H) × venue (Overall/Home/Away) × fixture side.
  // Each added condition captures these, so different conditions can read differently.
  const [gHalf, setGHalf] = useState<StatHalf>('ft');
  const [gScope, setGScope] = useState<StatScope>('overall');
  const [gSide, setGSide] = useState<FixtureSide>('either');
  const gPeriod = useMemo(() => periodFrom(gHalf, gScope), [gHalf, gScope]);

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
    ? (teamsNeedFixtures || (wantBacktest && fixtureCompIds.has(compId)))
    : (teamsNeedFixtures && fixtureCompIds.has(compId)));
  const needExportFor = (compId: number) => (resultMode === 'teams' ? wantExport : wantExport && fixtureCompIds.has(compId));

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

  const exportSig = exportResults.map((r, i) => (r.data ? `${liveLeagues[i]?.id}:${r.dataUpdatedAt}` : '')).join('|');
  const fixtureSig = fixtureResults.map((r, i) => (r.data ? `${liveLeagues[i]?.id}:${r.dataUpdatedAt}` : '')).join('|');

  const bundles = useMemo<LeagueBundle[]>(
    () => liveLeagues.map((comp, i) => ({ competition: comp.name, stats: exportResults[i]?.data, fixtures: fixtureResults[i]?.data })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [liveLeagues, exportSig, fixtureSig],
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
  const loading = feed.loading
    || (exportEnabled > 0 && exportSettled < exportEnabled)
    || (fixtureEnabled > 0 && fixtureSettled < fixtureEnabled);

  // ---- results (Teams mode) — each condition at its own period ----
  const results = useMemo(() => evaluateStrategy(bundles, conditions, logic), [bundles, conditions, logic]);

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
      rows.push({ fx, homeEvals: r.homeEvals, awayEvals: r.awayEvals, color: r.color });
    }
    rows.sort((a, b) => a.fx.kickoffUnix - b.fx.kickoffUnix);
    return rows;
  }, [resultMode, up.fixtures, liveLeagues, membership, conditions, logic]);

  // ---- result filters ----
  const [fLeague, setFLeague] = useState(ALL);
  const [fDimension, setFDimension] = useState(ALL);
  const [fColor, setFColor] = useState(ALL);
  const [fMinGames, setFMinGames] = useState(0);
  const [fMinMatch, setFMinMatch] = useState(0);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => filterResults(results, { league: fLeague, dimension: fDimension, color: fColor, minGames: fMinGames, minMatch: fMinMatch, total: conditions.length }), [results, fLeague, fDimension, fColor, fMinGames, fMinMatch, conditions.length]);
  const summary = useMemo(() => summarize(filtered), [filtered]);
  // Per-league grade distribution across the qualifiers, so each row can show its grade's share.
  const leagueShare = useMemo(() => gradeShareByLeague(results), [results]);

  useEffect(() => setPage(1), [resultMode, conditions, logic, fLeague, fDimension, fColor, fMinGames, fMinMatch, target]);

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

  const addCondition = (c: Condition) => { setConditions((cur) => [...cur, { ...c, period: gPeriod, side: gSide }]); setActiveId(null); };
  const removeCondition = (id: string) => { setConditions((cur) => cur.filter((c) => c.id !== id)); setActiveId(null); };
  const toggleNot = (id: string) => { setConditions((cur) => cur.map((c) => (c.id === id ? { ...c, not: !c.not } : c))); setActiveId(null); };
  const clearAll = () => { setConditions([]); setFLeague(ALL); setFDimension(ALL); setFColor(ALL); setFMinGames(0); setFMinMatch(0); setActiveId(null); };

  // One-click preset: set the global period/venue, logic and conditions, then recompute live.
  const applyPreset = (p: StrategyPreset) => {
    const sp = splitPeriod(p.period);
    setGHalf(sp.half); setGScope(sp.scope); setGSide('either');
    setLogic(p.logic);
    setConditions(p.conditions.map((c) => ({ id: `c${(CONDITION_SEQ += 1)}`, dimensionId: c.dimensionId, period: p.period, methodId: c.methodId, options: { ...c.options }, side: 'either' as FixtureSide })));
    setFLeague(ALL); setFDimension(ALL); setFColor(ALL); setFMinGames(0); setFMinMatch(0);
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
    const sp = splitPeriod(cfg.conditions[0]?.period ?? cfg.period ?? 'overall');
    setGHalf(sp.half); setGScope(sp.scope);
    setResultMode(cfg.resultMode);
    setFLeague(ALL); setFDimension(ALL); setFColor(ALL); setFMinGames(0); setFMinMatch(0);
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

      {/* Global period + venue panel — every condition is read here */}
      <View style={styles.periodCard}>
        <View style={styles.periodGroup}>
          <Text style={styles.periodLabel}>Period</Text>
          <View style={styles.segRow}>
            {([['ft', 'Full time'], ['ht', '1st half'], ['2h', '2nd half']] as const).map(([v, label]) => {
              const on = gHalf === v;
              return (
                <Pressable key={v} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setGHalf(v)} style={[styles.segBtn, on && styles.segBtnOn]}>
                  <Text style={[styles.segText, on && styles.segTextOn]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <View style={styles.periodGroup}>
          <Text style={styles.periodLabel}>Venue</Text>
          <View style={styles.segRow}>
            {([['overall', 'Overall'], ['home', 'Home'], ['away', 'Away']] as const).map(([v, label]) => {
              const on = gScope === v;
              return (
                <Pressable key={v} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setGScope(v)} style={[styles.segBtn, on && styles.segBtnOn]}>
                  <Text style={[styles.segText, on && styles.segTextOn]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <View style={styles.periodGroup}>
          <Text style={styles.periodLabel}>Team (fixtures)</Text>
          <View style={styles.segRow}>
            {FIXTURE_SIDES.map(({ value, label }) => {
              const on = gSide === value;
              return (
                <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setGSide(value)} style={[styles.segBtn, on && styles.segBtnOn]}>
                  <Text style={[styles.segText, on && styles.segTextOn]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
      <Text style={styles.readNote}>Each condition you add captures the Period · Venue · Team above, so set them per condition (e.g. Away team · 2nd half · Away games) before adding.</Text>

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
      <ConditionBuilder narrow={narrow} period={gPeriod} onAdd={addCondition} />

      {/* B. Conditions + logic */}
      {conditions.length > 0 ? (
        <View style={styles.conditionsCard}>
          <View style={styles.conditionsHead}>
            <Text style={styles.sectionLabel}>Query conditions</Text>
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
          <View style={styles.chips}>
            {conditions.map((c) => (
              <View key={c.id} style={[styles.chip, c.not && styles.chipNot]}>
                <Pressable accessibilityRole="button" accessibilityLabel="Toggle NOT" accessibilityState={{ selected: !!c.not }} onPress={() => toggleNot(c.id)} style={[styles.chipNotBtn, c.not && styles.chipNotBtnOn]}>
                  <Text style={[styles.chipNotText, c.not && styles.chipNotTextOn]}>NOT</Text>
                </Pressable>
                <Text style={styles.chipText}>{conditionLabel({ ...c, not: false })}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Remove condition" onPress={() => removeCondition(c.id)} style={styles.chipX}><Text style={styles.chipXText}>×</Text></Pressable>
              </View>
            ))}
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
        <Text style={styles.empty}>Add a condition above to build your strategy.</Text>
      )}

      {/* Status */}
      <View style={styles.statusRow}>
        {loading || (resultMode === 'fixtures' && up.loading) ? (
          <><ActivityIndicator size="small" color={theme.accentGreen} /><Text style={styles.statusMuted}>Querying {liveLeagues.length} ongoing leagues…</Text></>
        ) : resultMode === 'teams' ? (
          conditions.length > 0
            ? <Text style={styles.statusLive}>● {summary.teams} teams · {summary.leagues} leagues · {logic.toUpperCase()} of {conditions.length} condition{conditions.length > 1 ? 's' : ''}</Text>
            : <Text style={styles.statusMuted}>Add a condition to see the qualifying teams.</Text>
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
              <TeamsTable rows={visible} upcoming={upcoming} target={targetDef ?? null} fixturesByComp={fixturesByComp} compIdByName={compIdByName} total={conditions.length} share={leagueShare} />
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
            <Text style={styles.empty}>Add a condition above to see the qualifying fixtures.</Text>
          ) : fxFiltered.length === 0 ? (
            <Text style={styles.empty}>No upcoming fixture matches this strategy. Try OR logic, relax a condition, or change which side it applies to.</Text>
          ) : (
            <>
              <PageControls page={fxSafe} pages={fxPages} total={fxFiltered.length} from={fxStart + 1} to={fxStart + fxVisible.length} onChange={setPage} />
              <GradeFixtureTable rows={fxVisible} />
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

function TeamsTable({ rows, upcoming, target, fixturesByComp, compIdByName, total, share }: {
  rows: StrategyResult[];
  upcoming: UpcomingLite[];
  target: TargetMarket | null;
  fixturesByComp: Map<number, RawFixture[]>;
  compIdByName: Map<string, number>;
  total: number;
  share: Map<string, LeagueGradeShare>;
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
  const expanded = expandedKey != null ? built.find((b) => keyOf(b.result) === expandedKey) : undefined;
  const minW = target ? 920 : 820;
  return (
    <View>
      <DragScroll horizontal style={styles.fxScroll} contentContainerStyle={styles.fxScrollContent}>
        <View style={[styles.fxTable, { minWidth: minW }]}>
          <View style={[styles.fxTRow, styles.fxTHeadRow]}>
            <Text style={[styles.tTeam, styles.fxTHead]}>Team</Text>
            <Text style={[styles.tNext, styles.fxTHead]}>Next fixture</Text>
            <Text style={[styles.tCond, styles.fxTHead]}>Conditions</Text>
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
                {group.map((b) => (
                  <TeamsTableRow key={keyOf(b.result)} row={b} hasTarget={!!target} active={expandedKey === keyOf(b.result)} onPress={() => setExpandedKey((x) => (x === keyOf(b.result) ? null : keyOf(b.result)))} />
                ))}
              </View>
            );
          })}
        </View>
      </DragScroll>
      {expanded ? (
        <View style={[styles.fxDetail, { borderColor: resultColour(expanded.result.color) }]}>
          <ResultCard result={expanded.result} upcoming={upcoming} total={total} share={share.get(expanded.result.competition)} />
          {target ? <BacktestDetail bt={expanded.bt} target={target} /> : null}
        </View>
      ) : null}
      <Text style={styles.hint}>Rows are grouped by the strongest qualifying colour. Tap a team for its per-condition grades{target ? ' and the matches behind its historical rate' : ''}.</Text>
    </View>
  );
}

function TeamsTableRow({ row, hasTarget, active, onPress }: { row: TeamRow; hasTarget: boolean; active: boolean; onPress: () => void }) {
  const { result, nf, bt } = row;
  const tint = resultColour(result.color);
  const graded = result.conditions.find((c) => c.grade);
  const primary = result.conditions[0];
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
            <Text style={[styles.gradeTxt, { color: resultColour(graded.color) }]} numberOfLines={1}>{graded.grade}</Text>
            <Text style={styles.fxCellFaint} numberOfLines={1}>{graded.dimensionLabel}</Text>
          </>
        ) : <Text style={styles.fxNone}>—</Text>}
      </View>
      <Text style={[styles.tRead, styles.fxCellMuted]} numberOfLines={2}>{primary?.valueText ?? '—'}</Text>
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

/** A. Progressive selection: category → period → method → options → Add. */
function ConditionBuilder({ narrow, period, onAdd }: { narrow: boolean; period: StrategyPeriod; onAdd: (c: Condition) => void }) {
  const DEFAULT_DIM = DIMENSIONS[0].id; // Stat filter · all tables — the unified entry
  const first = getDimension(DEFAULT_DIM)!;
  const [dimId, setDimId] = useState(DEFAULT_DIM);
  const [opts, setOpts] = useState<Record<string, string>>(defaultOptions(DEFAULT_DIM));
  const [methodId, setMethodId] = useState<string>(methodsOf(first, period, defaultOptions(DEFAULT_DIM))[0]?.value ?? '');
  const dim = getDimension(dimId)!;
  const methods = methodsOf(dim, period, opts);

  // Period is global now; a new category resets method/options, an option that
  // drives the feature list keeps the method only if it is still offered.
  const changeDim = (v: string) => {
    const d = getDimension(v)!;
    const o = defaultOptions(v);
    setDimId(v);
    setOpts(o);
    setMethodId(methodsOf(d, period, o)[0]?.value ?? '');
  };
  const changeOpt = (key: string, v: string) => {
    const next = { ...opts, [key]: v };
    setOpts(next);
    if (dim.methodsFor) {
      const ms = dim.methodsFor(period, next);
      if (!ms.some((m) => m.value === methodId)) setMethodId(ms[0]?.value ?? '');
    }
  };

  const add = () => onAdd({ id: `c${(CONDITION_SEQ += 1)}`, dimensionId: dimId, period, methodId, options: { ...opts } });

  return (
    <View style={styles.builderCard}>
      <Text style={styles.sectionLabel}>Strategy configuration</Text>
      <View style={[styles.filterRow, narrow && styles.filterCol]}>
        <FilterDropdown label="Category" value={dimId} options={DIMENSIONS.map((d) => ({ value: d.id, label: d.label }))} onChange={changeDim} style={narrow ? styles.full : styles.flex} />
        <FilterDropdown label="Method / feature" value={methodId} options={methods} onChange={setMethodId} style={narrow ? styles.full : styles.flex} />
      </View>
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
        <Text style={styles.addBtnText}>+ Add condition</Text>
      </Pressable>
    </View>
  );
}

/** C. One qualifying team with its per-condition breakdown. */
function ResultCard({ result, upcoming, total, share }: { result: StrategyResult; upcoming: UpcomingLite[]; total?: number; share?: LeagueGradeShare }) {
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
        <Text style={styles.resultStrength}>Passes {ms.matched} of {ms.total} condition{ms.total > 1 ? 's' : ''} ({ms.pct}%)</Text>
      ) : null}
      {colorPct != null && share ? (
        <Text style={styles.resultShare} numberOfLines={2}>
          <Text style={{ color: tint }}>{colorLabel}</Text> grade · {colorCount} of {share.total} {result.competition} qualifier{share.total > 1 ? 's' : ''} ({colorPct}%){gradePct != null && primaryGrade ? `  ·  “${primaryGrade}” = ${gradePct}%` : ''}
        </Text>
      ) : null}
      <View style={styles.evalList}>
        {result.conditions.map((ev, i) => (
          <View key={i} style={[styles.evalRow, { backgroundColor: resultBackground(ev.color) }]}>
            <View style={styles.evalHead}>
              <Text style={[styles.evalFeature, { color: resultColour(ev.color) }]} numberOfLines={1}>{ev.dimensionLabel} · {ev.feature}</Text>
              {ev.grade ? <Text style={[styles.evalGrade, { color: resultColour(ev.color) }]}>{ev.grade}</Text> : null}
            </View>
            <Text style={styles.evalMeta}>{periodLabel(ev.period)} · {ev.method} · {ev.valueText}{ev.sample != null ? ` · ${ev.sample}g` : ''}</Text>
            <Text style={styles.evalReason} numberOfLines={2}>{ev.reason}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Fixtures as a table split into three grade colours; each row shows the matched
 *  side(s) and the exact grade each feature qualified with. Tap for the breakdown. */
function GradeFixtureTable({ rows }: { rows: FxRow[] }) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const expanded = expandedId != null ? rows.find((r) => r.fx.id === expandedId) : undefined;
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
                {group.map((r) => (
                  <GradeFixtureRow key={r.fx.id} r={r} active={expandedId === r.fx.id} onPress={() => setExpandedId((x) => (x === r.fx.id ? null : r.fx.id))} />
                ))}
              </View>
            );
          })}
        </View>
      </DragScroll>
      {expanded ? (
        <View style={[styles.fxDetail, { borderColor: resultColour(expanded.color) }]}>
          <Text style={styles.fxDetailTitle}>{expanded.fx.home.name} vs {expanded.fx.away.name} · {expanded.fx.competition.name}</Text>
          <SideEvals title={`Home team ✓ · ${expanded.fx.home.name}`} tint={theme.accentGreen} evals={expanded.homeEvals} />
          <SideEvals title={`Away team ✓ · ${expanded.fx.away.name}`} tint={theme.accentBlue} evals={expanded.awayEvals} />
        </View>
      ) : null}
      <Text style={styles.hint}>Grouped by the matched side's strongest grade. Tap a fixture to see which feature each team qualified on.</Text>
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
          <Text style={styles.gradeChipTxt} numberOfLines={1}>{periodLabel(ev.period)} · {ev.feature}{ev.grade ? ` · ${ev.grade}` : ''}</Text>
        </View>
      ))}
    </View>
  );
}

/** The conditions one fixture side satisfied, with period/venue/grade/reason. */
function SideEvals({ title, tint, evals }: { title: string; tint: string; evals: TeamEval[] }) {
  if (!evals.length) return null;
  return (
    <View style={styles.sideEvalsWrap}>
      <Text style={[styles.sideEvalsTitle, { color: tint }]} numberOfLines={1}>{title}</Text>
      <View style={styles.evalList}>
        {evals.map((ev, i) => (
          <View key={i} style={[styles.evalRow, { backgroundColor: resultBackground(ev.color) }]}>
            <View style={styles.evalHead}>
              <Text style={[styles.evalFeature, { color: resultColour(ev.color) }]} numberOfLines={1}>{periodLabel(ev.period)} · {ev.dimensionLabel} · {ev.feature}</Text>
              {ev.grade ? <Text style={[styles.evalGrade, { color: resultColour(ev.color) }]}>{ev.grade}</Text> : null}
            </View>
            <Text style={styles.evalMeta}>{ev.method} · {ev.valueText}{ev.sample != null ? ` · ${ev.sample}g` : ''}</Text>
            <Text style={styles.evalReason} numberOfLines={2}>{ev.reason}</Text>
          </View>
        ))}
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

  // Self-explaining result lines
  resultStrength: { fontFamily: fonts.bodySemiBold, fontSize: 11, color: theme.accentBlue },
  resultShare: { fontFamily: fonts.body, fontSize: 11, lineHeight: 16, color: theme.textMuted },

  // Read-context note + per-side fixture detail
  readNote: { fontFamily: fonts.body, fontSize: 11, lineHeight: 16, color: theme.textMuted, marginBottom: spacing.sm },
  sideEvalsWrap: { marginTop: spacing.sm, gap: 4 },
  sideEvalsTitle: { fontFamily: fonts.bodySemiBold, fontSize: 13 },
});
