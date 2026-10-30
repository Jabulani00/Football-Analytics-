import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useQuery } from '@tanstack/react-query';

import DragScroll from '@/components/shared/DragScroll';
import FilterDropdown from '@/components/shared/FilterDropdown';
import PageControls, { PAGE_SIZE } from '@/components/shared/PageControls';
import { useAllGradingLeagues } from '@/hooks/useLiveCompetitions';
import { fetchAllFixturesBetween, fetchAllUpcomingFixtures, seasonWindowUnix, type RawFixture } from '@/services/oddAlerts';
import { clientStaleTime } from '@/services/oddAlertsCachePolicy';
import { analyzeTeamGames, type GapPeriod, type GapRate } from '@/utils/gapAnalytics';
import {
  bttsBandBackground, bttsBandTint, bttsMix, characterByNumber, characterFor, colourBackground, colourTint, COLOUR_MEANINGS,
  dominatorMix, levelForPercentM1, levelForRankM2, levelGlyph, MIN_GAMES_OVERALL, MIN_GAMES_PER_VENUE,
  STATS_CHARACTERS, STRATEGY_COLOUR, STRATEGY_INFO, strategyBackground, strategyFor,
  type BttsMix, type CharColour, type CharLevel, type CharMethod, type DominatorMix, type StatsCharacter, type StrategyLetter,
} from '@/utils/statsCharacters';
import { fonts, layout, spacing, theme } from '@/styles/theme';

/** Monospace keeps the Sc / Conc crosshair aligned like the hand-drawn notes. */
const MONO = Platform.select({ ios: 'Courier', android: 'monospace', default: 'monospace' });

type ResultMode = 'teams' | 'fixtures' | 'key';
type Scope = 'overall' | 'home' | 'away';
/** How fixtures are grouped/filtered (notes Pages 3, 7, 8). */
type FixtureLens = 'matching' | 'dominator' | 'btts';

const LENSES: { value: FixtureLens; label: string }[] = [
  { value: 'matching', label: 'Matching · A–F' },
  { value: 'dominator', label: 'Dorminator mix' },
  { value: 'btts', label: 'BTTS mix' },
];

const MODES: { value: ResultMode; label: string }[] = [
  { value: 'teams', label: 'Teams' },
  { value: 'fixtures', label: 'Fixtures' },
  { value: 'key', label: 'Characters key' },
];
const METHODS: { value: CharMethod; label: string }[] = [
  { value: 'method1', label: 'Method 1 · fixed bands' },
  { value: 'method2', label: 'Method 2 · on league' },
];
const SCOPES: { value: Scope; label: string }[] = [
  { value: 'overall', label: 'Overall' }, { value: 'home', label: 'Home' }, { value: 'away', label: 'Away' },
];
const PERIODS: { value: GapPeriod; label: string }[] = [
  { value: 'fulltime', label: 'Full time' }, { value: 'firsthalf', label: '1st half' }, { value: 'secondhalf', label: '2nd half' },
];
const STRATEGY_LETTERS: StrategyLetter[] = ['A', 'B', 'C', 'D', 'E', 'F'];

type TeamChar = {
  team: string;
  teamId: number | null;
  scPercent: number | null;
  concPercent: number | null;
  scLevel: CharLevel | null;
  concLevel: CharLevel | null;
  character: StatsCharacter | null;
  margin: number | null;
  games: number;
};

type FixtureRow = {
  id: number;
  kickoff: string;
  unix: number;
  home: string;
  away: string;
  homeChar: StatsCharacter | null;
  awayChar: StatsCharacter | null;
  homeMargin: number | null;
  awayMargin: number | null;
  strategy: StrategyLetter | null;
  topDog: string | null;
  dom: DominatorMix | null;
  btts: BttsMix | null;
};

const teamKey = (id: number | null, name: string) => (id == null ? `name:${name.trim().toLowerCase()}` : `id:${id}`);
function rateForScope(rate: { home: GapRate; away: GapRate; overall: GapRate }, scope: Scope): GapRate {
  return scope === 'home' ? rate.home : scope === 'away' ? rate.away : rate.overall;
}
function pctText(pct: number | null): string { return pct == null ? '—' : `${pct.toFixed(0)}%`; }
function marginText(m: number | null): string { return m == null ? '—' : m > 0 ? `+${m.toFixed(0)}` : m.toFixed(0); }

/** Build a full fixture result row (characters, strategy, mixes, top dog) from a raw fixture. */
function buildFixtureRow(f: RawFixture, charByKey: Map<string, TeamChar>): FixtureRow {
  const h = charByKey.get(teamKey(f.home_id, f.home_name)) ?? null;
  const a = charByKey.get(teamKey(f.away_id, f.away_name)) ?? null;
  const hc = h?.character ?? null;
  const ac = a?.character ?? null;
  const strategy = hc && ac ? strategyFor(hc.colour, ac.colour) : null;
  const topDog = h?.margin != null && a?.margin != null ? (h.margin === a.margin ? 'Even' : h.margin > a.margin ? f.home_name : f.away_name) : null;
  return {
    id: f.id, kickoff: f.ko_human ?? f.date, unix: f.unix,
    home: f.home_name, away: f.away_name,
    homeChar: hc, awayChar: ac,
    homeMargin: h?.margin ?? null, awayMargin: a?.margin ?? null,
    strategy, topDog,
    dom: hc && ac ? dominatorMix(hc.n, ac.n) : null,
    btts: hc && ac ? bttsMix(hc.n, ac.n) : null,
  };
}

/** Compact character tag used in table rows and fixture cards. */
function CharTag({ character }: { character: StatsCharacter | null }) {
  if (!character) return <Text style={styles.charNone}>— not enough games</Text>;
  const tint = colourTint(character.colour);
  return (
    <View style={styles.charTag}>
      <View style={[styles.charNum, { backgroundColor: tint }]}><Text style={styles.charNumText}>{character.n}</Text></View>
      <Text style={styles.charTagName} numberOfLines={1}>{character.name}</Text>
      <Text style={[styles.charTagLvl, { color: tint }]}>Sc{levelGlyph(character.sc)} · Conc{levelGlyph(character.conc)}</Text>
    </View>
  );
}

function CharacterDiagram({ character }: { character: StatsCharacter }) {
  const tint = colourTint(character.colour);
  return (
    <View style={styles.diagram}>
      <Text style={[styles.diagramLine, { color: tint }]}>Sc{levelGlyph(character.sc)} |</Text>
      <Text style={styles.diagramLine}>-----+------</Text>
      <Text style={[styles.diagramLine, styles.diagramConc, { color: tint }]}>| Conc{levelGlyph(character.conc)}</Text>
    </View>
  );
}

export default function StatsCharactersPanel() {
  const { width } = useWindowDimensions();
  const narrow = width < 720;

  const [mode, setMode] = useState<ResultMode>('teams');
  const [method, setMethod] = useState<CharMethod>('method1');
  const [scope, setScope] = useState<Scope>('overall');
  const [period, setPeriod] = useState<GapPeriod>('fulltime');
  const [colourFilter, setColourFilter] = useState<'all' | CharColour>('all');
  const [charFilter, setCharFilter] = useState<'all' | number>('all');
  const [strategyFilter, setStrategyFilter] = useState<'all' | StrategyLetter>('all');
  const [lens, setLens] = useState<FixtureLens>('matching');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  /** Character picked from the Characters key, to show its teams + fixtures. */
  const [selectedChar, setSelectedChar] = useState<number | null>(null);
  const [leagueId, setLeagueId] = useState<number | null>(null);
  const [page, setPage] = useState(1);

  const leagueFeed = useAllGradingLeagues();
  const leagues = useMemo(() => [...leagueFeed.leagues]
    .sort((a, b) => (b.seasonPlayed ?? -1) - (a.seasonPlayed ?? -1) || a.country.localeCompare(b.country) || a.name.localeCompare(b.name)), [leagueFeed.leagues]);

  useEffect(() => { if (leagueId == null && leagues.length) setLeagueId(leagues[0].id); }, [leagueId, leagues]);
  const league = leagues.find((l) => l.id === leagueId) ?? null;

  const season = useQuery({
    queryKey: ['stats-characters-season', leagueId, league?.season],
    enabled: leagueId != null,
    queryFn: ({ signal }) => {
      const { fromUnix, toUnix } = seasonWindowUnix(league?.season ?? '');
      return fetchAllFixturesBetween({ fromUnix, toUnix, competitions: String(leagueId), perPage: 250, maxPages: 12 }, signal);
    },
    staleTime: clientStaleTime('stats/season'),
  });
  const upcoming = useQuery({
    queryKey: ['stats-characters-upcoming', leagueId],
    enabled: leagueId != null && (mode === 'fixtures' || (mode === 'key' && selectedChar != null)),
    queryFn: ({ signal }) => fetchAllUpcomingFixtures({ competitions: String(leagueId), days: 10, maxPages: 4 }, signal),
    staleTime: clientStaleTime('fixtures/upcoming'),
  });

  const fixtures: RawFixture[] = season.data ?? [];

  /** Classify every team in the selected league into its character. */
  const teamChars = useMemo<TeamChar[]>(() => {
    if (!fixtures.length) return [];
    const scored = analyzeTeamGames(fixtures, period, 'scored');
    const conceded = analyzeTeamGames(fixtures, period, 'conceded');
    const concByKey = new Map(conceded.map((t) => [teamKey(t.teamId, t.team), t]));

    const base = scored.map((s) => {
      const c = concByKey.get(teamKey(s.teamId, s.team));
      const scRate = rateForScope(s, scope);
      const concRate = c ? rateForScope(c, scope) : { games: 0, hits: 0, percent: null };
      const qualifies = s.overall.games >= MIN_GAMES_OVERALL
        && s.home.games >= MIN_GAMES_PER_VENUE && s.away.games >= MIN_GAMES_PER_VENUE
        && scRate.percent != null && concRate.percent != null;
      return {
        team: s.team, teamId: s.teamId,
        scPercent: scRate.percent, concPercent: concRate.percent,
        games: rateForScope(s, scope).games,
        margin: scRate.percent != null && concRate.percent != null ? scRate.percent - concRate.percent : null,
        qualifies,
      };
    });

    // Method 2 bands relative to this league's spread.
    const scSorted = base.filter((t) => t.qualifies).map((t) => t.scPercent!).sort((a, b) => b - a);
    const concSorted = base.filter((t) => t.qualifies).map((t) => t.concPercent!).sort((a, b) => b - a);

    return base.map((t) => {
      if (!t.qualifies) return { ...t, scLevel: null, concLevel: null, character: null };
      const scLevel = method === 'method1' ? levelForPercentM1(t.scPercent) : levelForRankM2(t.scPercent, scSorted);
      const concLevel = method === 'method1' ? levelForPercentM1(t.concPercent) : levelForRankM2(t.concPercent, concSorted);
      const character = scLevel && concLevel ? characterFor(scLevel, concLevel) : null;
      return { ...t, scLevel, concLevel, character };
    });
  }, [fixtures, period, scope, method]);

  const charByKey = useMemo(() => new Map(teamChars.filter((t) => t.character).map((t) => [teamKey(t.teamId, t.team), t])), [teamChars]);

  const teamRows = useMemo(() => {
    let rows = teamChars.filter((t) => t.character != null);
    if (colourFilter !== 'all') rows = rows.filter((t) => t.character!.colour === colourFilter);
    if (charFilter !== 'all') rows = rows.filter((t) => t.character!.n === charFilter);
    return rows.sort((a, b) => (b.margin ?? -999) - (a.margin ?? -999) || a.team.localeCompare(b.team));
  }, [teamChars, colourFilter, charFilter]);

  /** Every upcoming fixture in the league with both teams' results, deduped. */
  const allFixtures = useMemo<FixtureRow[]>(() => {
    const seen = new Set<number>();
    const rows: FixtureRow[] = [];
    for (const f of upcoming.data ?? []) {
      if (f.competition_id !== leagueId || seen.has(f.id)) continue;
      seen.add(f.id);
      rows.push(buildFixtureRow(f, charByKey));
    }
    return rows.sort((x, y) => x.unix - y.unix);
  }, [upcoming.data, charByKey, leagueId]);

  const fixtureRows = useMemo<FixtureRow[]>(() => {
    let out = allFixtures;
    if (lens === 'matching') {
      if (strategyFilter !== 'all') out = out.filter((r) => r.strategy === strategyFilter);
    } else if (lens === 'dominator') {
      out = out.filter((r) => r.dom != null).sort((x, y) => (x.dom!.grade - y.dom!.grade) || x.unix - y.unix);
    } else {
      out = out.filter((r) => r.btts != null).sort((x, y) => (x.btts!.grade - y.btts!.grade) || x.unix - y.unix);
    }
    return out;
  }, [allFixtures, strategyFilter, lens]);

  /** Teams and fixtures belonging to the character picked from the Characters key. */
  const charTeams = useMemo(() => selectedChar == null ? []
    : teamChars.filter((t) => t.character?.n === selectedChar).sort((a, b) => (b.margin ?? -999) - (a.margin ?? -999) || a.team.localeCompare(b.team)),
    [teamChars, selectedChar]);
  const charFixtures = useMemo(() => selectedChar == null ? []
    : allFixtures.filter((r) => r.homeChar?.n === selectedChar || r.awayChar?.n === selectedChar),
    [allFixtures, selectedChar]);

  useEffect(() => { setPage(1); setExpandedId(null); }, [mode, method, scope, period, colourFilter, charFilter, strategyFilter, leagueId, lens, selectedChar]);
  useEffect(() => { if (mode !== 'key') setSelectedChar(null); }, [mode]);

  const loadingSeason = leagueFeed.loading || season.isPending;
  const list = mode === 'fixtures' ? fixtureRows : teamRows;
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const safe = Math.min(page, pages);
  const start = (safe - 1) * PAGE_SIZE;
  const visibleTeams = teamRows.slice(start, start + PAGE_SIZE);
  const visibleFixtures = fixtureRows.slice(start, start + PAGE_SIZE);

  const leagueOptions = leagues.map((l) => ({ value: String(l.id), label: `${l.name} · ${l.country}` }));

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Stats Characters</Text>
        <Text style={styles.subtitle}>
          Teams and fixtures are the results. Each team's true character is read from sc (scoring per match) and Conc (conceding per match) — ↑ (high) / (M) (middle) / ↓ (low) — giving 9 characters. Filters below set the method, scope, period and league; fixtures are called out by the strategy the two characters blend into.
        </Text>
      </View>

      {/* Result mode */}
      <View style={styles.viewRow}>
        {MODES.map((m) => {
          const on = mode === m.value;
          return <Pressable key={m.value} onPress={() => setMode(m.value)} style={[styles.viewBtn, on && styles.viewBtnOn]}><Text style={[styles.viewBtnText, on && styles.viewBtnTextOn]}>{m.label}</Text></Pressable>;
        })}
      </View>

      {mode === 'key' ? (
        selectedChar == null ? (
          <CharactersKey onSelect={setSelectedChar} />
        ) : (
          <CharacterDetail
            character={characterByNumber(selectedChar)!}
            league={league?.name ?? ''}
            teams={charTeams}
            fixtures={charFixtures}
            loading={loadingSeason}
            fixturesLoading={upcoming.isPending}
            expandedId={expandedId}
            onToggleExpand={(id) => setExpandedId((x) => (x === id ? null : id))}
            onBack={() => setSelectedChar(null)}
          />
        )
      ) : (
        <>
          {/* Filters */}
          <View style={styles.filterCard}>
            <FilterDropdown label="League" value={String(leagueId ?? '')} options={leagueOptions} onChange={(v) => setLeagueId(Number(v))} style={narrow ? styles.full : styles.flex} />

            <Text style={styles.topListNote}>Method (how ↑ / (M) / ↓ is decided)</Text>
            <View style={styles.choiceRow}>{METHODS.map((m) => <Pressable key={m.value} onPress={() => setMethod(m.value)} style={[styles.choice, method === m.value && styles.choiceOn]}><Text style={[styles.choiceText, method === m.value && styles.choiceTextOn]}>{m.label}</Text></Pressable>)}</View>

            <Text style={styles.topListNote}>Scope</Text>
            <View style={styles.choiceRow}>{SCOPES.map((s) => <Pressable key={s.value} onPress={() => setScope(s.value)} style={[styles.choice, scope === s.value && styles.choiceOn]}><Text style={[styles.choiceText, scope === s.value && styles.choiceTextOn]}>{s.label}</Text></Pressable>)}</View>

            <Text style={styles.topListNote}>Period</Text>
            <View style={styles.choiceRow}>{PERIODS.map((p) => <Pressable key={p.value} onPress={() => setPeriod(p.value)} style={[styles.choice, period === p.value && styles.choiceOn]}><Text style={[styles.choiceText, period === p.value && styles.choiceTextOn]}>{p.label}</Text></Pressable>)}</View>

            {mode === 'teams' ? (
              <>
                <Text style={styles.topListNote}>Colour (goals abundance)</Text>
                <View style={styles.choiceRow}>{(['all', 'red', 'green', 'middle'] as const).map((c) => {
                  const on = colourFilter === c;
                  const tint = c === 'all' ? theme.accentGreen : colourTint(c);
                  return <Pressable key={c} onPress={() => setColourFilter(c)} style={[styles.choice, on && { borderColor: tint, backgroundColor: c === 'all' ? 'rgba(5,150,105,0.08)' : colourBackground(c) }]}><Text style={[styles.choiceText, on && { fontFamily: fonts.bodySemiBold, color: tint }]}>{c === 'all' ? 'All colours' : c}</Text></Pressable>;
                })}</View>
                <Text style={styles.topListNote}>Character</Text>
                <View style={styles.choiceRow}>
                  <Pressable onPress={() => setCharFilter('all')} style={[styles.choice, charFilter === 'all' && styles.choiceOn]}><Text style={[styles.choiceText, charFilter === 'all' && styles.choiceTextOn]}>All 9</Text></Pressable>
                  {STATS_CHARACTERS.map((c) => <Pressable key={c.n} onPress={() => setCharFilter(c.n)} style={[styles.choice, charFilter === c.n && { borderColor: colourTint(c.colour), backgroundColor: colourBackground(c.colour) }]}><Text style={[styles.choiceText, charFilter === c.n && { fontFamily: fonts.bodySemiBold, color: colourTint(c.colour) }]}>{c.n} {c.name}</Text></Pressable>)}
                </View>
              </>
            ) : (
              <>
                <Text style={styles.topListNote}>Fixture lens (how results are grouped)</Text>
                <View style={styles.choiceRow}>{LENSES.map((l) => <Pressable key={l.value} onPress={() => setLens(l.value)} style={[styles.choice, lens === l.value && styles.choiceOn]}><Text style={[styles.choiceText, lens === l.value && styles.choiceTextOn]}>{l.label}</Text></Pressable>)}</View>
                {lens === 'matching' ? (
                  <>
                    <Text style={styles.topListNote}>Matching characters on teams · T1 vs T2 → strategy (Page 3)</Text>
                    <View style={styles.choiceRow}>
                      <Pressable onPress={() => setStrategyFilter('all')} style={[styles.choice, strategyFilter === 'all' && styles.choiceOn]}><Text style={[styles.choiceText, strategyFilter === 'all' && styles.choiceTextOn]}>All</Text></Pressable>
                      {STRATEGY_LETTERS.map((s) => {
                        const on = strategyFilter === s;
                        return <Pressable key={s} onPress={() => setStrategyFilter(s)} style={[styles.choice, on && { borderColor: STRATEGY_COLOUR[s], backgroundColor: strategyBackground(s) }]}><Text style={[styles.choiceText, on && { fontFamily: fonts.bodySemiBold, color: STRATEGY_COLOUR[s] }]}>{s} · {STRATEGY_INFO[s].pair}</Text></Pressable>;
                      })}
                    </View>
                  </>
                ) : lens === 'dominator' ? (
                  <Text style={styles.topListNote}>Dorminator mix grading (Page 7) · strong Sc↑ vs weak Conc side, graded by desirability. Lower grade = more desirable.</Text>
                ) : (
                  <Text style={styles.topListNote}>BTTS character mixes (Page 8) · graded 1–20 from safes to riskies. Lower grade = safer.</Text>
                )}
              </>
            )}
            <Text style={styles.topListNote}>
              {method === 'method1' ? 'Method 1: Sc / Conc graded ↑ 60–100% · (M) 40–59% · ↓ 0–39%.' : 'Method 2: graded against this league — top third ↑, middle third (M), bottom third ↓.'} A character needs {MIN_GAMES_OVERALL}+ games overall, with {MIN_GAMES_PER_VENUE}+ home and {MIN_GAMES_PER_VENUE}+ away.
            </Text>
          </View>

          {/* Status */}
          <View style={styles.statusRow}>
            {loadingSeason ? <><ActivityIndicator size="small" color={theme.accentGreen} /><Text style={styles.statusMuted}>{leagueFeed.loading ? 'Loading leagues…' : 'Loading season results…'}</Text></>
              : season.isError ? <Text style={styles.statusMuted}>Could not load results for this league.</Text>
              : mode === 'teams' ? <Text style={styles.statusLive}>● {teamRows.length} teams with a character · {league?.name ?? ''}</Text>
              : upcoming.isPending ? <><ActivityIndicator size="small" color={theme.accentGreen} /><Text style={styles.statusMuted}>Loading upcoming fixtures…</Text></>
              : <Text style={styles.statusLive}>● {fixtureRows.length} upcoming fixtures called out · {league?.name ?? ''}</Text>}
          </View>

          {/* Teams result */}
          {mode === 'teams' && !loadingSeason && !season.isError ? (
            teamRows.length === 0 ? <Text style={styles.empty}>No team in this league has enough games for a character yet with these filters.</Text> : <>
              <PageControls page={safe} pages={pages} total={teamRows.length} from={start + 1} to={start + visibleTeams.length} onChange={setPage} />
              <DragScroll horizontal style={styles.scroll} contentContainerStyle={styles.scrollContent}>
                <View style={[styles.table, { minWidth: 920 }]}>
                  <View style={[styles.row, styles.headRow]}>
                    <Text style={[styles.cRank, styles.headText, styles.right]}>#</Text>
                    <Text style={[styles.cTeam, styles.headText]}>Team</Text>
                    <Text style={[styles.cNum, styles.headText, styles.right]}>Sc %</Text>
                    <Text style={[styles.cNum, styles.headText, styles.right]}>Conc %</Text>
                    <Text style={[styles.cNum, styles.headText, styles.right]}>Margin</Text>
                    <Text style={[styles.cNum, styles.headText, styles.right]}>Games</Text>
                    <Text style={[styles.cChar, styles.headText]}>Character</Text>
                    <Text style={[styles.cRole, styles.headText]}>Role</Text>
                  </View>
                  {(['green', 'middle', 'red'] as CharColour[]).map((colour) => {
                    const group = visibleTeams.filter((t) => t.character!.colour === colour);
                    if (!group.length) return null;
                    return <View key={colour}>
                      <View style={[styles.sectionRow, { backgroundColor: colourBackground(colour) }]}><Text style={[styles.sectionTitle, { color: colourTint(colour) }]}>{colour} · {COLOUR_MEANINGS.find((c) => c.value === colour)!.meaning}</Text></View>
                      {group.map((t) => {
                        const rank = teamRows.findIndex((r) => teamKey(r.teamId, r.team) === teamKey(t.teamId, t.team)) + 1;
                        return <View key={teamKey(t.teamId, t.team)} style={[styles.row, { backgroundColor: colourBackground(colour) }]}>
                          <Text style={[styles.cRank, styles.numDa]}>{rank}</Text>
                          <Text style={[styles.cTeam, styles.team]} numberOfLines={1}>{t.team}</Text>
                          <Text style={[styles.cNum, styles.num]}>{pctText(t.scPercent)}</Text>
                          <Text style={[styles.cNum, styles.num]}>{pctText(t.concPercent)}</Text>
                          <Text style={[styles.cNum, styles.numStrong, { color: (t.margin ?? 0) >= 0 ? theme.accentGreen : theme.loss }]}>{marginText(t.margin)}</Text>
                          <Text style={[styles.cNum, styles.num]}>{t.games}</Text>
                          <View style={styles.cChar}><CharTag character={t.character} /></View>
                          <Text style={[styles.cRole, styles.roleText]} numberOfLines={1}>{t.character!.role || '—'}</Text>
                        </View>;
                      })}
                    </View>;
                  })}
                </View>
              </DragScroll>
              <Text style={styles.hint}>Sorted by margin (Sc % − Conc %) within each colour. Margin is the difference between scoring and conceding — the dominator / goal-abundance read.</Text>
            </>
          ) : null}

          {/* Fixtures result */}
          {mode === 'fixtures' && !loadingSeason && !season.isError && !upcoming.isPending ? (
            fixtureRows.length === 0 ? <Text style={styles.empty}>No upcoming fixtures in this league have two characters to blend yet. Try Full time / Overall, or a league in season.</Text> : <>
              <PageControls page={safe} pages={pages} total={fixtureRows.length} from={start + 1} to={start + visibleFixtures.length} onChange={setPage} />
              <View style={styles.fixtureList}>
                {visibleFixtures.map((f) => (
                  <FixtureCard key={f.id} f={f} lens={lens} expanded={expandedId === f.id} onToggle={() => setExpandedId((id) => (id === f.id ? null : f.id))} />
                ))}
              </View>
              <Text style={styles.hint}>Tap a fixture to open its calculated result. {lens === 'matching' ? 'Matching blends the two characters into a strategy letter (Page 3).' : lens === 'dominator' ? 'Dorminator mix grades a strong-vs-weak pairing by desirability (Page 7).' : 'BTTS mix grades the pairing 1–20, safes to riskies (Page 8).'} Top dog is the higher margin (Sc % − Conc %).</Text>
            </>
          ) : null}
        </>
      )}
    </View>
  );
}

/** The 9-character reference grid with full Sc / Conc diagrams (Page 1). */
function CharactersKey({ onSelect }: { onSelect: (n: number) => void }) {
  const narrow = useWindowDimensions().width < 720;
  return (
    <View>
      <Text style={styles.keyHint}>Tap a character to see the teams and fixtures that fall under it.</Text>
      <View style={styles.grid}>
        {STATS_CHARACTERS.map((c) => {
          const tint = colourTint(c.colour);
          return (
            <Pressable key={c.n} accessibilityRole="button" accessibilityLabel={`Show teams and fixtures for ${c.name}`} onPress={() => onSelect(c.n)} style={({ pressed }) => [styles.card, narrow ? styles.cardFull : styles.cardThird, { borderColor: tint, backgroundColor: colourBackground(c.colour) }, pressed && styles.cardPressed]}>
              <View style={styles.cardTop}>
                <View style={[styles.numberBadge, { backgroundColor: tint }]}><Text style={styles.numberBadgeText}>{c.n}</Text></View>
                <View style={[styles.colourTag, { borderColor: tint }]}><Text style={[styles.colourTagText, { color: tint }]}>{c.colour}</Text></View>
              </View>
              <CharacterDiagram character={c} />
              <Text style={styles.cardName}>{c.name}</Text>
              {c.role ? <Text style={styles.cardRole}>{c.role}</Text> : null}
              <Text style={styles.cardCallout}>{c.callout}</Text>
              <Text style={[styles.cardLink, { color: tint }]}>View teams & fixtures →</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.legendCard}>
        <Text style={styles.legendTitle}>Colours</Text>
        {COLOUR_MEANINGS.map((c) => (
          <View key={c.value} style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: colourTint(c.value) }]} />
            <Text style={styles.legendText}><Text style={{ color: colourTint(c.value), fontFamily: fonts.bodySemiBold }}>{c.label}</Text> — {c.meaning}</Text>
          </View>
        ))}
        <Text style={styles.legendFoot}>Possibilities = 9 characters. We aim to get the true character.</Text>
      </View>
    </View>
  );
}

/** A fixture result with an expandable, calculated-result dropdown (txt notation). */
function FixtureCard({ f, lens, expanded, onToggle }: { f: FixtureRow; lens: FixtureLens; expanded: boolean; onToggle: () => void }) {
  const both = f.homeChar && f.awayChar;
  // Lens badge: strategy letter, dominator grade or BTTS grade — each coloured.
  let badge: ReactNode = <Text style={styles.charNone}>— needs both characters</Text>;
  if (lens === 'matching' && f.strategy) {
    badge = <View style={[styles.lensBadge, { borderColor: STRATEGY_COLOUR[f.strategy], backgroundColor: strategyBackground(f.strategy) }]}><Text style={[styles.lensBadgeText, { color: STRATEGY_COLOUR[f.strategy] }]}>Strategy {f.strategy}</Text><Text style={styles.lensBadgePair}>{STRATEGY_INFO[f.strategy].pair}</Text></View>;
  } else if (lens === 'dominator' && f.dom) {
    const tint = f.dom.bad ? theme.loss : theme.accentBlue;
    badge = <View style={[styles.lensBadge, { borderColor: tint, backgroundColor: f.dom.bad ? 'rgba(220,38,38,0.08)' : 'rgba(37,99,235,0.10)' }]}><Text style={[styles.lensBadgeText, { color: tint }]}>Dorminator #{f.dom.grade}/{f.dom.total}</Text><Text style={styles.lensBadgePair}>{f.dom.bad ? 'bad already' : 'desirable'}</Text></View>;
  } else if (lens === 'btts' && f.btts) {
    const tint = bttsBandTint(f.btts.band);
    badge = <View style={[styles.lensBadge, { borderColor: tint, backgroundColor: bttsBandBackground(f.btts.band) }]}><Text style={[styles.lensBadgeText, { color: tint }]}>BTTS #{f.btts.grade}/{f.btts.total}</Text><Text style={styles.lensBadgePair}>{f.btts.band}</Text></View>;
  }

  return (
    <View style={styles.fixtureCard}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={onToggle} style={styles.fixtureHeader}>
        <View style={styles.fixtureTop}>
          <Text style={styles.fixtureKick}>{f.kickoff}</Text>
          <View style={styles.fixtureTopRight}>{badge}<Text style={styles.chevron}>{expanded ? '▴' : '▾'}</Text></View>
        </View>
        <View style={styles.fixtureTeams}>
          <View style={styles.fixtureSide}>
            <Text style={styles.fixtureTeam} numberOfLines={1}>{f.home}{f.topDog === f.home ? ' · Top dog' : ''}</Text>
            <CharTag character={f.homeChar} />
          </View>
          <Text style={styles.fixtureVs}>vs</Text>
          <View style={styles.fixtureSide}>
            <Text style={styles.fixtureTeam} numberOfLines={1}>{f.away}{f.topDog === f.away ? ' · Top dog' : ''}</Text>
            <CharTag character={f.awayChar} />
          </View>
        </View>
      </Pressable>

      {expanded ? (
        <View style={styles.fixtureDetail}>
          {!both ? <Text style={styles.charNone}>Both teams need {MIN_GAMES_OVERALL}+ games to blend a result.</Text> : <>
            <Text style={styles.detailNotation}>({f.homeChar!.n}) {f.homeChar!.name}  +  ({f.awayChar!.n}) {f.awayChar!.name}</Text>
            <View style={styles.diagramPair}>
              <View style={styles.diagramCol}><Text style={styles.diagramTeam} numberOfLines={1}>{f.home}</Text><CharacterDiagram character={f.homeChar!} /></View>
              <Text style={styles.diagramPlus}>+</Text>
              <View style={styles.diagramCol}><Text style={styles.diagramTeam} numberOfLines={1}>{f.away}</Text><CharacterDiagram character={f.awayChar!} /></View>
            </View>
            {f.strategy ? <Text style={styles.detailLine}><Text style={styles.detailKey}>Matching (Page 3): </Text>Strategy {f.strategy} · {STRATEGY_INFO[f.strategy].pair}. {STRATEGY_INFO[f.strategy].note}</Text> : null}
            {f.dom ? <Text style={styles.detailLine}><Text style={styles.detailKey}>Dorminator mix (Page 7): </Text>grade #{f.dom.grade} of {f.dom.total}{f.dom.bad ? ' · marked bad already' : ' · desirable'}.</Text> : null}
            {f.btts ? <Text style={styles.detailLine}><Text style={styles.detailKey}>BTTS mix (Page 8): </Text>#{f.btts.grade} of {f.btts.total} · {f.btts.band}{f.btts.note ? ` · ${f.btts.note}` : ''}.</Text> : null}
            <Text style={styles.detailLine}><Text style={styles.detailKey}>Top dog: </Text>{f.topDog === 'Even' ? 'even margins' : f.topDog ?? '—'} · margins {f.home} {marginText(f.homeMargin)} / {f.away} {marginText(f.awayMargin)}.</Text>
          </>}
        </View>
      ) : null}
    </View>
  );
}

/** Teams and fixtures that fall under one character, opened from the Characters key. */
function CharacterDetail({ character, league, teams, fixtures, loading, fixturesLoading, expandedId, onToggleExpand, onBack }: {
  character: StatsCharacter; league: string; teams: TeamChar[]; fixtures: FixtureRow[];
  loading: boolean; fixturesLoading: boolean; expandedId: number | null; onToggleExpand: (id: number) => void; onBack: () => void;
}) {
  const tint = colourTint(character.colour);
  return (
    <View>
      <Pressable accessibilityRole="button" onPress={onBack} style={styles.backBtn}><Text style={styles.backText}>← All characters</Text></Pressable>

      <View style={[styles.detailHeader, { borderColor: tint, backgroundColor: colourBackground(character.colour) }]}>
        <View style={styles.detailHeaderTop}>
          <View style={[styles.numberBadge, { backgroundColor: tint }]}><Text style={styles.numberBadgeText}>{character.n}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardName}>{character.name}</Text>
            <Text style={styles.cardRole}>{[character.role, character.colour].filter(Boolean).join(' · ')}</Text>
          </View>
          <CharacterDiagram character={character} />
        </View>
        <Text style={styles.cardCallout}>{character.callout}</Text>
      </View>

      {/* Teams of this character */}
      <Text style={styles.detailSection}>Teams · {character.name}{league ? ` · ${league}` : ''}</Text>
      {loading ? <View style={styles.statusRow}><ActivityIndicator size="small" color={theme.accentGreen} /><Text style={styles.statusMuted}>Loading results…</Text></View>
        : teams.length === 0 ? <Text style={styles.empty}>No team in this league is character {character.n} with these filters.</Text>
        : <View style={styles.detailTeams}>
            {teams.map((t) => (
              <View key={teamKey(t.teamId, t.team)} style={styles.detailTeamRow}>
                <Text style={styles.detailTeamName} numberOfLines={1}>{t.team}</Text>
                <Text style={styles.detailTeamStat}>Sc {pctText(t.scPercent)} · Conc {pctText(t.concPercent)} · <Text style={{ color: (t.margin ?? 0) >= 0 ? theme.accentGreen : theme.loss, fontFamily: fonts.bodySemiBold }}>margin {marginText(t.margin)}</Text> · {t.games} games</Text>
              </View>
            ))}
          </View>}

      {/* Fixtures involving this character */}
      <Text style={styles.detailSection}>Fixtures involving {character.name}</Text>
      {fixturesLoading ? <View style={styles.statusRow}><ActivityIndicator size="small" color={theme.accentGreen} /><Text style={styles.statusMuted}>Loading upcoming fixtures…</Text></View>
        : fixtures.length === 0 ? <Text style={styles.empty}>No upcoming fixtures in this league involve a character-{character.n} team yet.</Text>
        : <View style={styles.fixtureList}>
            {fixtures.map((f) => <FixtureCard key={f.id} f={f} lens="matching" expanded={expandedId === f.id} onToggle={() => onToggleExpand(f.id)} />)}
          </View>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', alignSelf: 'stretch' },
  header: { marginBottom: spacing.md },
  title: { fontFamily: fonts.display, fontSize: 24, color: theme.textPrimary, marginBottom: spacing.xs },
  subtitle: { fontFamily: fonts.body, fontSize: 13, lineHeight: 20, color: theme.textMuted },

  viewRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  viewBtn: { flex: 1, minWidth: 100, borderWidth: 1.5, borderColor: theme.border, borderRadius: layout.borderRadius, paddingVertical: spacing.sm, alignItems: 'center', backgroundColor: theme.surface },
  viewBtnOn: { borderColor: theme.accentGreen, backgroundColor: 'rgba(5,150,105,0.08)' },
  viewBtnText: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.textMuted },
  viewBtnTextOn: { color: theme.accentGreen },

  filterCard: {
    marginTop: spacing.md, borderWidth: layout.borderWidth, borderColor: theme.border, borderRadius: layout.borderRadius,
    backgroundColor: theme.surface, padding: spacing.md, gap: spacing.sm,
  },
  flex: { flexGrow: 1, flexBasis: 180, minWidth: 150 },
  full: { width: '100%', minWidth: 0, flexBasis: 'auto', flexGrow: 0 },
  topListNote: { fontFamily: fonts.body, fontSize: 12, lineHeight: 18, color: theme.textMuted },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  choice: { borderWidth: layout.borderWidth, borderColor: theme.border, borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 6, backgroundColor: theme.surfaceHover },
  choiceOn: { borderColor: theme.accentGreen, backgroundColor: 'rgba(5,150,105,0.08)' },
  choiceText: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted },
  choiceTextOn: { fontFamily: fonts.bodySemiBold, color: theme.accentGreen },

  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 20, marginTop: spacing.md },
  statusLive: { fontFamily: fonts.bodyMedium, fontSize: 12, color: theme.accentGreen },
  statusMuted: { fontFamily: fonts.body, fontSize: 12, color: theme.textMuted },
  empty: { fontFamily: fonts.body, fontSize: 13, color: theme.textMuted, textAlign: 'center', paddingVertical: spacing.lg },

  scroll: { width: '100%', maxWidth: '100%', marginTop: spacing.sm },
  scrollContent: { minWidth: '100%' },
  table: { width: '100%', backgroundColor: theme.surface, borderWidth: layout.borderWidth, borderColor: theme.border, borderRadius: layout.borderRadius, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, paddingHorizontal: spacing.sm },
  headRow: { backgroundColor: theme.surfaceMuted, borderBottomWidth: layout.borderWidth, borderBottomColor: theme.border },
  sectionRow: { width: '100%', backgroundColor: theme.surfaceMuted, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderTopWidth: layout.borderWidth, borderTopColor: theme.border },
  sectionTitle: { fontFamily: fonts.bodySemiBold, fontSize: 11, color: theme.accentGreen, textTransform: 'uppercase', letterSpacing: 0.5 },
  headText: { fontFamily: fonts.bodySemiBold, fontSize: 10, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 4 },
  right: { textAlign: 'right' },
  cRank: { width: 34, paddingHorizontal: 4, textAlign: 'right' },
  cTeam: { width: 150, paddingHorizontal: 4 },
  cNum: { width: 66, paddingHorizontal: 4 },
  cChar: { width: 230, paddingHorizontal: 4 },
  cRole: { width: 150, paddingHorizontal: 4 },
  team: { fontFamily: fonts.bodyMedium, fontSize: 13, color: theme.textPrimary },
  roleText: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted },
  num: { fontFamily: fonts.body, fontSize: 12, color: theme.textPrimary, textAlign: 'right' },
  numStrong: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.textPrimary, textAlign: 'right' },
  numDa: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.accentGreen, textAlign: 'right' },

  charTag: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  charNum: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  charNumText: { fontFamily: fonts.bodySemiBold, fontSize: 11, color: '#fff' },
  charTagName: { fontFamily: fonts.bodyMedium, fontSize: 12, color: theme.textPrimary, maxWidth: 120 },
  charTagLvl: { fontFamily: fonts.body, fontSize: 11 },
  charNone: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted, fontStyle: 'italic' },

  fixtureList: { marginTop: spacing.sm, gap: spacing.sm },
  fixtureCard: { borderWidth: layout.borderWidth, borderColor: theme.border, borderRadius: layout.borderRadius, backgroundColor: theme.surface, overflow: 'hidden' },
  fixtureHeader: { padding: spacing.md, gap: spacing.sm },
  fixtureTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  fixtureTopRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  fixtureKick: { fontFamily: fonts.bodyMedium, fontSize: 12, color: theme.textMuted },
  chevron: { fontFamily: fonts.bodySemiBold, fontSize: 16, color: theme.accentGreen },
  lensBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: layout.borderWidth, borderColor: theme.accentGreen, borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 3, backgroundColor: 'rgba(5,150,105,0.08)' },
  lensBadgeText: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: theme.accentGreen },
  lensBadgePair: { fontFamily: fonts.body, fontSize: 10, color: theme.textMuted },
  fixtureTeams: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  fixtureSide: { flex: 1, gap: 3 },
  fixtureTeam: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.textPrimary },
  fixtureVs: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted },
  fixtureDetail: { borderTopWidth: layout.borderWidth, borderTopColor: theme.border, backgroundColor: theme.surfaceHover, padding: spacing.md, gap: spacing.sm },
  detailNotation: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.textPrimary },
  diagramPair: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  diagramCol: { gap: 2 },
  diagramPlus: { fontFamily: MONO, fontSize: 16, color: theme.textMuted, alignSelf: 'center' },
  diagramTeam: { fontFamily: fonts.bodyMedium, fontSize: 11, color: theme.textMuted, maxWidth: 140 },
  detailLine: { fontFamily: fonts.body, fontSize: 12, lineHeight: 18, color: theme.textPrimary },
  detailKey: { fontFamily: fonts.bodySemiBold, color: theme.textPrimary },

  keyHint: { fontFamily: fonts.bodyMedium, fontSize: 12, color: theme.accentGreen, marginTop: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  card: { borderWidth: 1.5, borderRadius: layout.borderRadius, padding: spacing.md, gap: spacing.xs },
  cardPressed: { opacity: 0.72 },
  cardLink: { fontFamily: fonts.bodySemiBold, fontSize: 11, marginTop: spacing.xs },
  cardThird: { flexGrow: 1, flexBasis: '30%', minWidth: 180 },
  cardFull: { width: '100%' },

  backBtn: { alignSelf: 'flex-start', marginTop: spacing.md, borderWidth: layout.borderWidth, borderColor: theme.border, borderRadius: 999, paddingHorizontal: spacing.md, paddingVertical: 6, backgroundColor: theme.surfaceHover },
  backText: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: theme.textPrimary },
  detailHeader: { marginTop: spacing.md, borderWidth: 1.5, borderRadius: layout.borderRadius, padding: spacing.md, gap: spacing.sm },
  detailHeaderTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  detailSection: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: theme.textPrimary, marginTop: spacing.lg, marginBottom: spacing.xs },
  detailTeams: { borderWidth: layout.borderWidth, borderColor: theme.border, borderRadius: layout.borderRadius, backgroundColor: theme.surface, overflow: 'hidden' },
  detailTeamRow: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderBottomWidth: layout.borderWidth, borderBottomColor: theme.border, gap: 2 },
  detailTeamName: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.textPrimary },
  detailTeamStat: { fontFamily: fonts.body, fontSize: 12, color: theme.textMuted },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  numberBadge: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  numberBadgeText: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: '#fff' },
  colourTag: { borderWidth: layout.borderWidth, borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  colourTagText: { fontFamily: fonts.bodySemiBold, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  diagram: { marginTop: spacing.xs, marginBottom: spacing.xs },
  diagramLine: { fontFamily: MONO, fontSize: 13, lineHeight: 17, color: theme.textMuted },
  diagramConc: { textAlign: 'left', marginLeft: 24 },
  cardName: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: theme.textPrimary },
  cardRole: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted },
  cardCallout: { fontFamily: fonts.body, fontSize: 11, lineHeight: 16, color: theme.textPrimary, marginTop: 2 },

  legendCard: { marginTop: spacing.md, borderWidth: layout.borderWidth, borderColor: theme.border, borderRadius: layout.borderRadius, backgroundColor: theme.surface, padding: spacing.md, gap: spacing.xs },
  legendTitle: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: theme.accentGreen, marginBottom: spacing.xs },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontFamily: fonts.body, fontSize: 13, color: theme.textPrimary },
  legendFoot: { fontFamily: fonts.body, fontSize: 12, color: theme.textMuted, marginTop: spacing.sm, fontStyle: 'italic' },

  hint: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted, textAlign: 'center', marginTop: spacing.sm },
});
