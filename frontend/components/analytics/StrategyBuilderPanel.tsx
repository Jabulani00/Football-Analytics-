import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useQueries } from '@tanstack/react-query';

import DragScroll from '@/components/shared/DragScroll';
import FilterDropdown from '@/components/shared/FilterDropdown';
import PageControls, { PAGE_SIZE } from '@/components/shared/PageControls';
import RecommendationCard from '@/components/analytics/RecommendationCard';
import { useLiveCompetitionFeed } from '@/hooks/useLiveCompetitions';
import { useLiveFixtures } from '@/hooks/useLiveFixtures';
import { fetchAllFixturesBetween, seasonWindowUnix, type Fixture } from '@/services/oddAlerts';
import { clientStaleTime } from '@/services/oddAlertsCachePolicy';
import { buildLeagueStatsLive } from '@/services/statsBuilder';
import { MARKET_MODULES, type MarketModule, type RecCandidate, type RiskLevel } from '@/utils/fixtureRecommendation';
import { nextFixtureFor, type UpcomingLite } from '@/utils/statsGrading';
import {
  DIMENSIONS, MATCH_SCOPES, conditionLabel, evaluateStrategy, filterResults, getDimension, needsExport,
  needsFixtures, periodLabel, prepareLeague, recommendFixture, resultBackground, resultColour, resultsByTeam, summarize,
  teamKeyOf,
  type Condition, type FixtureRec, type LeagueBundle, type LeaguePrep, type MatchScope, type ResultColor,
  type StrategyLogic, type StrategyPeriod, type StrategyResult,
} from '@/utils/strategyBuilder';
import { fonts, layout, spacing, theme } from '@/styles/theme';

const ALL = 'all';
let CONDITION_SEQ = 0;

function defaultOptions(dimensionId: string): Record<string, string> {
  const dim = getDimension(dimensionId);
  const out: Record<string, string> = {};
  for (const o of dim?.options ?? []) out[o.key] = o.default;
  return out;
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

type FxRow = { fx: Fixture; fr: FixtureRec; home?: StrategyResult; away?: StrategyResult };

/** The three-colour split for the fixtures table — by the recommendation's risk. */
const RISK_COLOR: Record<RiskLevel, string> = { low: theme.accentGreen, medium: theme.yellow, high: theme.loss };
const RISK_BG: Record<RiskLevel, string> = { low: 'rgba(5,150,105,0.10)', medium: 'rgba(202,138,4,0.12)', high: 'rgba(220,38,38,0.08)' };
const RISK_LABEL: Record<RiskLevel, string> = { low: 'Low', medium: 'Med', high: 'High' };
const RISK_SECTIONS: { level: RiskLevel; label: string }[] = [
  { level: 'low', label: 'LOW RISK · safest reads' },
  { level: 'medium', label: 'MEDIUM RISK · moderate edge' },
  { level: 'high', label: 'HIGH RISK · volatile' },
];
const pct = (n: number) => `${Math.round(n * 100)}%`;

export default function StrategyBuilderPanel() {
  const { width } = useWindowDimensions();
  const narrow = width < 720;

  const feed = useLiveCompetitionFeed(3);
  const liveLeagues = useMemo(() => feed.competitions.filter((c) => c.rank === 0), [feed.competitions]);

  // ---- query: the strategy ----
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [logic, setLogic] = useState<StrategyLogic>('and');

  // ---- result mode + fixtures controls ----
  const [resultMode, setResultMode] = useState<'teams' | 'fixtures'>('teams');
  const [matchScope, setMatchScope] = useState<MatchScope>('either');
  const [markets, setMarkets] = useState<MarketModule[]>([...MARKET_MODULES]);
  const [minConf, setMinConf] = useState(0);
  const [fxSort, setFxSort] = useState<'best' | 'kickoff'>('best');

  const wantExport = conditions.length > 0 && needsExport(conditions);
  const teamsNeedFixtures = conditions.length > 0 && needsFixtures(conditions);

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
  const needFixturesFor = (compId: number) => (resultMode === 'teams' ? teamsNeedFixtures : fixtureCompIds.has(compId));
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

  const exportEnabled = liveLeagues.filter((comp) => needExportFor(comp.id)).length;
  const exportSettled = exportResults.filter((r) => r.isSuccess || r.isError).length;
  const fixtureEnabled = liveLeagues.filter((comp) => needFixturesFor(comp.id)).length;
  const fixtureSettled = fixtureResults.filter((r) => r.isSuccess || r.isError).length;
  const loading = feed.loading
    || (exportEnabled > 0 && exportSettled < exportEnabled)
    || (fixtureEnabled > 0 && fixtureSettled < fixtureEnabled);

  // ---- results ----
  const results = useMemo(() => evaluateStrategy(bundles, conditions, logic), [bundles, conditions, logic]);

  // ---- fixtures mode: per-league prep + ranked recommendations ----
  const prepByComp = useMemo(() => {
    const m = new Map<number, LeaguePrep>();
    if (resultMode !== 'fixtures') return m;
    liveLeagues.forEach((comp, i) => {
      const fx = fixtureResults[i]?.data;
      if (fx && fx.length) m.set(comp.id, prepareLeague(fx));
    });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultMode, liveLeagues, fixtureSig]);

  const marketsKey = markets.join(',');
  const fixtureRows = useMemo(() => {
    if (resultMode !== 'fixtures') return [] as { fx: Fixture; fr: FixtureRec; home?: StrategyResult; away?: StrategyResult }[];
    const activeModules = markets.length ? markets : [...MARKET_MODULES];
    const leagueById = new Map(liveLeagues.map((l) => [l.id, l]));
    const idx = conditions.length ? resultsByTeam(results) : null;
    const rows: { fx: Fixture; fr: FixtureRec; home?: StrategyResult; away?: StrategyResult }[] = [];
    for (const fx of up.fixtures) {
      const comp = leagueById.get(fx.competition.id);
      if (!comp) continue;
      const prep = prepByComp.get(fx.competition.id);
      if (!prep) continue;
      const fr = recommendFixture(prep, { id: fx.home.id, name: fx.home.name }, { id: fx.away.id, name: fx.away.name }, activeModules);
      if (!fr) continue;
      let home: StrategyResult | undefined;
      let away: StrategyResult | undefined;
      if (idx) {
        home = idx.get(`${comp.name}::${teamKeyOf({ teamId: fx.home.id, team: fx.home.name })}`);
        away = idx.get(`${comp.name}::${teamKeyOf({ teamId: fx.away.id, team: fx.away.name })}`);
        const pass = matchScope === 'home' ? !!home : matchScope === 'away' ? !!away : matchScope === 'both' ? !!home && !!away : !!home || !!away;
        if (!pass) continue;
      }
      if (minConf > 0 && (fr.rec.best?.probability ?? 0) * 100 < minConf) continue;
      rows.push({ fx, fr, home, away });
    }
    rows.sort((a, b) => (fxSort === 'kickoff' ? a.fx.kickoffUnix - b.fx.kickoffUnix : (b.fr.rec.best?.probability ?? 0) - (a.fr.rec.best?.probability ?? 0)));
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultMode, up.fixtures, prepByComp, liveLeagues, results, conditions, matchScope, minConf, fxSort, marketsKey]);

  // ---- result filters ----
  const [fLeague, setFLeague] = useState(ALL);
  const [fDimension, setFDimension] = useState(ALL);
  const [fColor, setFColor] = useState(ALL);
  const [fMinGames, setFMinGames] = useState(0);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => filterResults(results, { league: fLeague, dimension: fDimension, color: fColor, minGames: fMinGames }), [results, fLeague, fDimension, fColor, fMinGames]);
  const summary = useMemo(() => summarize(filtered), [filtered]);

  useEffect(() => setPage(1), [resultMode, conditions, logic, fLeague, fDimension, fColor, fMinGames, matchScope, minConf, fxSort, marketsKey]);

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

  const addCondition = (c: Condition) => setConditions((cur) => [...cur, c]);
  const removeCondition = (id: string) => setConditions((cur) => cur.filter((c) => c.id !== id));
  const toggleNot = (id: string) => setConditions((cur) => cur.map((c) => (c.id === id ? { ...c, not: !c.not } : c)));
  const toggleMarket = (m: MarketModule) => setMarkets((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]));
  const clearAll = () => { setConditions([]); setFLeague(ALL); setFDimension(ALL); setFColor(ALL); setFMinGames(0); };

  const MARKET_LABEL: Record<MarketModule, string> = { result: 'Result', goals: 'Goals', btts: 'BTTS' };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Strategy Builder</Text>
        <Text style={styles.subtitle}>
          Build a strategy from the analytics you already have. Combine conditions with AND / OR across every ongoing league. View it as the qualifying teams, or as fixtures — each fixture carrying its best, 2nd-best and 3rd-best betting recommendation.
        </Text>
      </View>

      {/* Result mode */}
      <View style={styles.modeRow}>
        {([['teams', 'Teams'], ['fixtures', 'Fixtures · recommendations']] as const).map(([v, label]) => {
          const on = resultMode === v;
          return (
            <Pressable key={v} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setResultMode(v)} style={[styles.modeBtn, on && styles.modeBtnOn]}>
              <Text style={[styles.modeBtnText, on && styles.modeBtnTextOn]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* A. Strategy configuration */}
      <ConditionBuilder narrow={narrow} onAdd={addCondition} />

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
          <Text style={styles.statusLive}>● {fxFiltered.length} fixtures with a recommendation{conditions.length > 0 ? ` · ${MATCH_SCOPES.find((s) => s.value === matchScope)?.label.toLowerCase()} matches the strategy` : ''}</Text>
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
              </View>
            </View>
          ) : null}
          {filtered.length === 0 ? (
            <Text style={styles.empty}>No team satisfies this strategy. Try OR logic, a different method, or relax the filters.</Text>
          ) : (
            <>
              <PageControls page={safe} pages={pages} total={filtered.length} from={start + 1} to={start + visible.length} onChange={setPage} />
              <View style={styles.resultList}>
                {visible.map((r) => <ResultCard key={`${r.competition}-${r.team}`} result={r} upcoming={upcoming} />)}
              </View>
              <PageControls page={safe} pages={pages} total={filtered.length} from={start + 1} to={start + visible.length} onChange={setPage} />
            </>
          )}
        </>
      ) : null}

      {/* ===== Fixtures mode ===== */}
      {resultMode === 'fixtures' && !loading && !up.loading ? (
        <>
          <View style={styles.filterCard}>
            <View style={[styles.filterRow, narrow && styles.filterCol]}>
              <FilterDropdown label="League" value={fLeague} options={leagueOptions} onChange={setFLeague} style={narrow ? styles.full : styles.flex} />
              {conditions.length > 0 ? (
                <FilterDropdown label="Applies to" value={matchScope} options={MATCH_SCOPES.map((s) => ({ value: s.value, label: s.label }))} onChange={(v) => setMatchScope(v as MatchScope)} style={narrow ? styles.full : styles.flex} />
              ) : null}
              <FilterDropdown label="Min confidence" value={String(minConf)} options={[{ value: '0', label: 'Any' }, { value: '40', label: '40%+' }, { value: '60', label: '60%+' }]} onChange={(v) => setMinConf(Number(v))} style={narrow ? styles.full : styles.flex} />
              <FilterDropdown label="Sort" value={fxSort} options={[{ value: 'best', label: 'Best pick first' }, { value: 'kickoff', label: 'Kickoff' }]} onChange={(v) => setFxSort(v as 'best' | 'kickoff')} style={narrow ? styles.full : styles.flex} />
            </View>
            <Text style={styles.topListNote}>Markets</Text>
            <View style={styles.marketRow}>
              {MARKET_MODULES.map((m) => {
                const on = markets.includes(m);
                return (
                  <Pressable key={m} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => toggleMarket(m)} style={[styles.marketPill, on && styles.marketPillOn]}>
                    <Text style={[styles.marketPillText, on && styles.marketPillTextOn]}>{MARKET_LABEL[m]}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          {fxFiltered.length === 0 ? (
            <Text style={styles.empty}>No fixture with a recommendation{conditions.length > 0 ? ' matches the strategy' : ''} right now. Widen the markets, lower min confidence, or change the match scope.</Text>
          ) : (
            <>
              <PageControls page={fxSafe} pages={fxPages} total={fxFiltered.length} from={fxStart + 1} to={fxStart + fxVisible.length} onChange={setPage} />
              <FixtureTable rows={fxVisible} hasConditions={conditions.length > 0} />
              <PageControls page={fxSafe} pages={fxPages} total={fxFiltered.length} from={fxStart + 1} to={fxStart + fxVisible.length} onChange={setPage} />
            </>
          )}
        </>
      ) : null}
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
function ConditionBuilder({ narrow, onAdd }: { narrow: boolean; onAdd: (c: Condition) => void }) {
  const [dimId, setDimId] = useState(DIMENSIONS[1].id); // default: Stats Characters
  const first = getDimension(DIMENSIONS[1].id)!;
  const [period, setPeriod] = useState<StrategyPeriod>(first.periods[0]);
  const [methodId, setMethodId] = useState<string>(first.methods(first.periods[0])[0]?.value ?? '');
  const [opts, setOpts] = useState<Record<string, string>>(defaultOptions(DIMENSIONS[1].id));
  const dim = getDimension(dimId)!;
  const methods = dim.methods(period);

  // Reset downstream selections in the change handlers (never in an effect, to
  // avoid render-loop churn): a new category resets period/method/options; a new
  // period keeps the method only if it is still offered.
  const changeDim = (v: string) => {
    const d = getDimension(v)!;
    setDimId(v);
    setPeriod(d.periods[0]);
    setMethodId(d.methods(d.periods[0])[0]?.value ?? '');
    setOpts(defaultOptions(v));
  };
  const changePeriod = (v: string) => {
    const p = v as StrategyPeriod;
    setPeriod(p);
    const ms = dim.methods(p);
    if (!ms.some((m) => m.value === methodId)) setMethodId(ms[0]?.value ?? '');
  };

  const add = () => onAdd({ id: `c${(CONDITION_SEQ += 1)}`, dimensionId: dimId, period, methodId, options: { ...opts } });

  return (
    <View style={styles.builderCard}>
      <Text style={styles.sectionLabel}>Strategy configuration</Text>
      <View style={[styles.filterRow, narrow && styles.filterCol]}>
        <FilterDropdown label="Category" value={dimId} options={DIMENSIONS.map((d) => ({ value: d.id, label: d.label }))} onChange={changeDim} style={narrow ? styles.full : styles.flex} />
        {dim.periods.length > 1 ? (
          <FilterDropdown label="Period" value={period} options={dim.periods.map((p) => ({ value: p, label: periodLabel(p) }))} onChange={changePeriod} style={narrow ? styles.full : styles.flex} />
        ) : null}
        <FilterDropdown label="Method / feature" value={methodId} options={methods} onChange={setMethodId} style={narrow ? styles.full : styles.flex} />
      </View>
      {dim.options && dim.options.length > 0 ? (
        <View style={[styles.filterRow, narrow && styles.filterCol]}>
          {dim.options.map((o) => (
            <FilterDropdown key={o.key} label={o.label} value={opts[o.key] ?? o.default} options={o.options} onChange={(v) => setOpts((cur) => ({ ...cur, [o.key]: v }))} style={narrow ? styles.full : styles.flex} />
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
function ResultCard({ result, upcoming }: { result: StrategyResult; upcoming: UpcomingLite[] }) {
  const tint = resultColour(result.color);
  const nf = nextFixtureFor(result.teamId, result.team, upcoming);
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

/** Fixtures as a table split into three risk colours (green / yellow / red),
 *  each row showing its best / 2nd / 3rd betting pick; tap a row for the full card. */
function FixtureTable({ rows, hasConditions }: { rows: FxRow[]; hasConditions: boolean }) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const minW = hasConditions ? 1040 : 960;
  const expanded = expandedId != null ? rows.find((r) => r.fx.id === expandedId) : undefined;
  return (
    <View>
      <DragScroll horizontal style={styles.fxScroll} contentContainerStyle={styles.fxScrollContent}>
        <View style={[styles.fxTable, { minWidth: minW }]}>
          <View style={[styles.fxTRow, styles.fxTHeadRow]}>
            <Text style={[styles.cKick, styles.fxTHead]}>Kickoff</Text>
            <Text style={[styles.cFix, styles.fxTHead]}>Fixture</Text>
            <Text style={[styles.cLeague, styles.fxTHead]}>League</Text>
            <Text style={[styles.cBest, styles.fxTHead]}>Best bet</Text>
            <Text style={[styles.cAlt, styles.fxTHead]}>2nd best</Text>
            <Text style={[styles.cAlt, styles.fxTHead]}>3rd best</Text>
            <Text style={[styles.cRisk, styles.fxTHead]}>Risk</Text>
            {hasConditions ? <Text style={[styles.cMatch, styles.fxTHead]}>Strategy</Text> : null}
          </View>
          {RISK_SECTIONS.map((sec) => {
            const group = rows.filter((r) => r.fr.rec.riskLevel === sec.level);
            if (!group.length) return null;
            const col = RISK_COLOR[sec.level];
            return (
              <View key={sec.level}>
                <View style={[styles.fxSectionRow, { backgroundColor: RISK_BG[sec.level] }]}>
                  <Text style={[styles.fxSectionTitle, { color: col }]}>{sec.label} · {group.length}</Text>
                </View>
                {group.map((r) => (
                  <FixtureTableRow key={r.fx.id} r={r} hasConditions={hasConditions} active={expandedId === r.fx.id} onPress={() => setExpandedId((x) => (x === r.fx.id ? null : r.fx.id))} />
                ))}
              </View>
            );
          })}
        </View>
      </DragScroll>
      {expanded ? (
        <View style={[styles.fxDetail, { borderColor: RISK_COLOR[expanded.fr.rec.riskLevel] }]}>
          <Text style={styles.fxDetailTitle}>{expanded.fx.home.name} vs {expanded.fx.away.name} · {expanded.fx.competition.name}</Text>
          {hasConditions && (expanded.home || expanded.away) ? (
            <View style={styles.matchedWrap}>
              {expanded.home ? <Text style={styles.matchedLine} numberOfLines={1}><Text style={[styles.matchedSide, { color: theme.accentGreen }]}>Home ✓ </Text>{expanded.home.conditions.map((c) => c.feature).join(' · ')}</Text> : null}
              {expanded.away ? <Text style={styles.matchedLine} numberOfLines={1}><Text style={[styles.matchedSide, { color: theme.accentBlue }]}>Away ✓ </Text>{expanded.away.conditions.map((c) => c.feature).join(' · ')}</Text> : null}
            </View>
          ) : null}
          <RecommendationCard rec={expanded.fr.rec} homePosition={expanded.fx.home.position} awayPosition={expanded.fx.away.position} />
        </View>
      ) : null}
      <Text style={styles.hint}>Rows are grouped by the pick's risk — green safest, red most volatile. Tap a fixture for its full read.</Text>
    </View>
  );
}

function FixtureTableRow({ r, hasConditions, active, onPress }: { r: FxRow; hasConditions: boolean; active: boolean; onPress: () => void }) {
  const { fx, fr, home, away } = r;
  const level = fr.rec.riskLevel;
  const col = RISK_COLOR[level];
  const best = fr.rec.best;
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: active }} onPress={onPress} style={[styles.fxTRow, { backgroundColor: active ? theme.surfaceHover : RISK_BG[level] }]}>
      <Text style={[styles.cKick, styles.fxCellMuted]} numberOfLines={2}>{kickoffLabel(fx.kickoffUnix, fx.kickoff)}</Text>
      <View style={styles.cFix}>
        <Text style={styles.fxHome} numberOfLines={1}>{fx.home.name}</Text>
        <Text style={styles.fxAway} numberOfLines={1}>{fx.away.name}</Text>
      </View>
      <Text style={[styles.cLeague, styles.fxCellFaint]} numberOfLines={2}>{fx.competition.name}</Text>
      <View style={styles.cBest}>
        {best ? (
          <>
            <Text style={styles.fxMarket} numberOfLines={1}>{best.market}</Text>
            <Text style={[styles.fxSel, { color: col }]} numberOfLines={1}>{best.selection}</Text>
            <Text style={[styles.fxProb, { color: col }]}>{pct(best.probability)}{best.edge != null && best.edge > 0 ? <Text style={styles.fxEdge}>  +{Math.round(best.edge * 100)}%</Text> : null}</Text>
          </>
        ) : <Text style={styles.fxNone}>—</Text>}
      </View>
      <AltCell c={fr.rec.candidates[1]} />
      <AltCell c={fr.rec.candidates[2]} />
      <View style={styles.cRisk}>
        <View style={[styles.riskChip, { borderColor: col, backgroundColor: RISK_BG[level] }]}><Text style={[styles.riskChipTxt, { color: col }]}>{RISK_LABEL[level]}</Text></View>
        <Text style={styles.riskScore}>{fr.rec.riskScore}</Text>
      </View>
      {hasConditions ? (
        <View style={styles.cMatch}>
          {home ? <Text style={[styles.matchTick, { color: theme.accentGreen }]} numberOfLines={1}>Home ✓</Text> : null}
          {away ? <Text style={[styles.matchTick, { color: theme.accentBlue }]} numberOfLines={1}>Away ✓</Text> : null}
          {!home && !away ? <Text style={styles.fxNone}>—</Text> : null}
        </View>
      ) : null}
    </Pressable>
  );
}

function AltCell({ c }: { c?: RecCandidate }) {
  if (!c) return <View style={styles.cAlt}><Text style={styles.fxNone}>—</Text></View>;
  return (
    <View style={styles.cAlt}>
      <Text style={styles.fxAltSel} numberOfLines={1}>{c.selection}</Text>
      <Text style={styles.fxAltProb}>{pct(c.probability)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', alignSelf: 'stretch' },
  header: { marginBottom: spacing.md },
  title: { fontFamily: fonts.display, fontSize: 24, color: theme.textPrimary, marginBottom: spacing.xs },
  subtitle: { fontFamily: fonts.body, fontSize: 13, lineHeight: 20, color: theme.textMuted },

  sectionLabel: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.textPrimary, marginBottom: spacing.sm },

  builderCard: { borderWidth: layout.borderWidth, borderColor: theme.border, borderRadius: layout.borderRadius, backgroundColor: theme.surface, padding: spacing.md, gap: spacing.sm },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  filterCol: { flexDirection: 'column' },
  flex: { flexGrow: 1, flexBasis: 160, minWidth: 140 },
  full: { width: '100%', minWidth: 0, flexBasis: 'auto', flexGrow: 0 },
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
});
