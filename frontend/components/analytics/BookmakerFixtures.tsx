import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import FilterDropdown from '@/components/shared/FilterDropdown';
import { assessPair, assessTeams, filterBookFixtures, opposingPairs, type BookFixture, type FixtureFilters } from '@/services/bookmakerClassification';
import { fonts, spacing, theme } from '@/styles/theme';

const EMPTY: FixtureFilters = { query: '', country: '', competition: '', group: '', orientation: '', category: '', preference: '', side: '' };
const price = (value: number | null) => value == null ? 'Unavailable' : String(value);
const time = (value: string) => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : value;
export function BookmakerAssessment({ fixture }: { fixture: BookFixture }) {
  const result = assessTeams(fixture.home, fixture.away);
  return <View style={styles.assessment}>
    <Text style={styles.heading}>HOME / AWAY CLASSIFICATION</Text>
    {result ? <>
      <Text style={styles.text}>Ratio: {price(Math.min(fixture.home.odds!, fixture.away.odds!))} / {price(Math.max(fixture.home.odds!, fixture.away.odds!))} = {result.ratio.toFixed(6)}</Text>
      <Text style={styles.heading}>Group {result.group} - {result.band}{result.category ? ` / ${result.category}` : ''}</Text>
      <Text style={styles.text}>{result.orientation === 'equal' ? 'Equal odds - neither A nor B' : result.orientation === 'A'
        ? 'A: Bigger home price / smaller away price' : 'B: Smaller home price / bigger away price'}</Text>
      <Text style={styles.text}>Gap: {price(Math.max(fixture.home.odds!, fixture.away.odds!))} - {price(Math.min(fixture.home.odds!, fixture.away.odds!))} = {result.gap}</Text>
      <Text style={styles.heading}>{result.preference === 'none' ? 'No clear choice' : `${fixture.bookmaker} Expected To Win: ${result.preference === 'first' ? fixture.home.name : fixture.away.name}`}</Text>
    </> : <Text style={styles.text}>Unavailable - both home and away prices must be open and valid.</Text>}
  </View>;
}
function FixtureCard({ fixture, loadMarkets }: { fixture: BookFixture; loadMarkets: (id: string) => Promise<BookFixture> }) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<BookFixture | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  useEffect(() => {
    generation.current += 1;
    setDetail(null); setError(null); setLoading(false); setExpanded(false);
    return () => { generation.current += 1; };
  }, [fixture]);
  const load = async () => {
    setExpanded(true); setLoading(true); setError(null);
    const request = ++generation.current;
    try { const result = await loadMarkets(fixture.id); if (generation.current === request) setDetail(result); }
    catch (err) { if (generation.current === request) setError(err instanceof Error ? err.message : 'Markets unavailable'); }
    finally { if (generation.current === request) setLoading(false); }
  };
  // Classification and filters use the same listing prices. Expanded detail is timestamped separately.
  return <View style={styles.card}>
    <Text style={styles.heading}>{fixture.bookmaker} - {fixture.name}</Text>
    <Text style={styles.text}>{[fixture.country, fixture.competition].filter(Boolean).join(' / ')} / {time(fixture.kickoff)}</Text>
    <View style={styles.row}>{(['home', 'draw', 'away'] as const).map((side) => <View key={side} style={styles.price}>
      <Text style={styles.text}>{side.toUpperCase()} - {fixture[side].name}</Text>
      <Text style={styles.heading}>{price(fixture[side].odds)}{fixture[side].open ? '' : ' (unavailable)'}</Text>
    </View>)}</View>
    <BookmakerAssessment fixture={fixture} />
    <Text style={styles.note}>Prices observed: {fixture.observedAt ? time(fixture.observedAt) : 'Time unavailable'}. Draw excluded from classification.</Text>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded }} disabled={loading}
      onPress={() => expanded ? setExpanded(false) : void load()} style={styles.button}>
      <Text style={styles.heading}>{loading ? 'Loading all markets...' : expanded ? 'Hide markets' : 'Show all markets'}</Text>
    </Pressable>
    {expanded && error ? <><Text accessibilityRole="alert" style={styles.text}>{error}</Text><Pressable onPress={() => void load()}><Text style={styles.heading}>Retry markets</Text></Pressable></> : null}
    {expanded && detail && !loading && !error ? <>
      <Text style={styles.note}>Market prices observed: {detail.observedAt ? time(detail.observedAt) : 'Time unavailable'}</Text>
      {detail.markets.length === 0 ? <Text style={styles.text}>No markets returned by the bookmaker.</Text> : null}
      {detail.markets.map((market) => <View key={market.id} style={styles.assessment}>
        <Text style={styles.heading}>{market.name}{market.line != null ? ` / Line ${market.line}` : ''}</Text>
        {market.selections.map((selection, index) => <Text key={index} style={styles.text}>
          {selection.name}: {price(selection.odds)}{selection.open ? '' : ' (unavailable)'}
        </Text>)}
        {opposingPairs(market).map((pair) => {
          const assessment = pair.second ? assessPair(pair.first, pair.second) : null;
          return <Text key={pair.label} style={styles.note}>{pair.label}: {assessment
            ? `Gap ${Math.max(pair.first.odds!, pair.second!.odds!)} - ${Math.min(pair.first.odds!, pair.second!.odds!)} = ${assessment.gap} - ${assessment.preference === 'none' ? 'No clear choice'
              : `Bookmaker preference: ${assessment.preference === 'first' ? pair.first.name : pair.second!.name}`}`
            : 'Unavailable - opposing prices must both be open and valid'}</Text>;
        })}
      </View>)}
    </> : null}
  </View>;
}
export default function BookmakerFixtures({ fixtures, loadMarkets, showLocationFilters = true }: {
  fixtures: BookFixture[]; loadMarkets: (id: string) => Promise<BookFixture>; showLocationFilters?: boolean;
}) {
  const [filters, setFilters] = useState<FixtureFilters>(EMPTY);
  const [page, setPage] = useState(0);
  const filtered = useMemo(() => filterBookFixtures(fixtures, filters), [fixtures, filters]);
  const pages = Math.max(1, Math.ceil(filtered.length / 10));
  const current = Math.min(page, pages - 1);
  const change = (key: keyof FixtureFilters, value: string) => { setFilters((state) => ({ ...state, [key]: value })); setPage(0); };
  const select = (key: keyof FixtureFilters, label: string, values: { value: string; label: string }[]) =>
    <FilterDropdown key={key} label={label} value={filters[key]} options={[{ value: '', label: 'All' }, ...values]} onChange={(value) => change(key, value)} />;
  const options = (values: string[]) => [...new Set(values.filter(Boolean))].map((value) => ({ value, label: value }));
  return <View style={styles.container}>
    <Text style={styles.heading}>BOOKMAKER FIXTURE CLASSIFICATIONS</Text>
    <Text style={styles.note}>Website decimal prices. Ratio = smaller home/away price divided by bigger; gap = bigger minus smaller. Classification uses unrounded values.</Text>
    <TextInput accessibilityLabel="Search bookmaker fixtures" placeholder="Search teams" placeholderTextColor={theme.textMuted}
      value={filters.query} onChangeText={(value) => change('query', value)} style={styles.input} />
    <View style={styles.row}>
      {showLocationFilters && fixtures.some((item) => item.country) ? select('country', 'Country / category', options(fixtures.map((item) => item.country))) : null}
      {showLocationFilters ? select('competition', 'Competition', options(fixtures.map((item) => item.competition))) : null}
      {select('group', 'Ratio group', [{ value: '1', label: '1 - Below 0.35' }, { value: '2', label: '2 - 0.35 to 0.65' }, { value: '3', label: '3 - Above 0.65' }])}
      {select('orientation', 'Orientation', [{ value: 'A', label: 'A - Bigger home / smaller away' }, { value: 'B', label: 'B - Smaller home / bigger away' }, { value: 'equal', label: 'Equal odds' }])}
      {select('category', 'Category', options(['1A', '1B', '2A', '2B', '3A', '3B']))}
      {select('preference', 'Bookmaker choice', [{ value: 'clear', label: 'Clear choice' }, { value: 'none', label: 'No clear choice' }, { value: 'unavailable', label: 'Unavailable prices' }])}
      {select('side', 'Preferred team', [{ value: 'first', label: 'Home' }, { value: 'second', label: 'Away' }])}
    </View>
    <Pressable accessibilityRole="button" onPress={() => { setFilters(EMPTY); setPage(0); }}><Text style={styles.heading}>Clear filters</Text></Pressable>
    <Text style={styles.note}>{filtered.length} matching fixtures / {fixtures.length} returned. Page {current + 1} of {pages}</Text>
    {filtered.length === 0 ? <Text style={styles.text}>No fixtures match these filters.</Text> : null}
    {filtered.slice(current * 10, (current + 1) * 10).map((fixture) => <FixtureCard key={`${fixture.bookmaker}-${fixture.id}`} fixture={fixture} loadMarkets={loadMarkets} />)}
    <View style={styles.row}>
      <Pressable accessibilityRole="button" disabled={current === 0} onPress={() => setPage(current - 1)}><Text style={styles.heading}>Previous</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={current + 1 >= pages} onPress={() => setPage(current + 1)}><Text style={styles.heading}>Next</Text></Pressable>
    </View>
  </View>;
}
const styles = StyleSheet.create({
  container: { width: '100%', gap: spacing.sm, marginBottom: spacing.lg },
  card: { width: '100%', padding: spacing.md, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: 10, gap: spacing.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  price: { padding: spacing.sm, flexGrow: 1 },
  heading: { color: theme.textPrimary, fontFamily: fonts.bodySemiBold, fontSize: 13 },
  text: { color: theme.textPrimary, fontFamily: fonts.body, fontSize: 12, lineHeight: 20 },
  note: { color: theme.textMuted, fontFamily: fonts.body, fontSize: 12, lineHeight: 20 },
  assessment: { paddingVertical: spacing.sm, gap: spacing.xs, borderTopWidth: 1, borderColor: theme.border },
  button: { paddingVertical: spacing.sm },
  input: { color: theme.textPrimary, fontFamily: fonts.body, padding: spacing.sm, borderWidth: 1, borderColor: theme.border, borderRadius: 8 },
});
