import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import FilterDropdown from '@/components/shared/FilterDropdown';
import {
  detectKind,
  fetchAllCompetitions,
  fetchAllFixturesBetween,
  fetchSeasonStandings,
  seasonWindowUnix,
} from '@/services/oddAlerts';
import { fonts, layout, spacing, theme } from '@/styles/theme';
import { seasonFeedFromFixtures } from '@/utils/powerDynamicCallFeed';
import { POWER_DYNAMIC_CALLS, powerDynamicCall } from '@/utils/powerDynamicCalls';
import {
  callAspectById,
  callAspectsFor,
  scoreCallAspect,
  type CallSearchContext,
  type CallTableRow,
} from '@/utils/powerDynamicCallSearch';

type Hit = {
  teamId: number;
  name: string;
  league: string;
  country: string;
  rank: number;
  percent: number;
  reason: string;
};

const PERCENT_OPTIONS = Array.from({ length: 11 }, (_, index) => {
  const value = String(index * 10);
  return { value, label: `${value}%` };
});

const SCAN_LIMIT = 4;

async function scanLeagues(
  aspectId: string,
  signal: AbortSignal,
  onProgress: (done: number, total: number) => void,
): Promise<Hit[]> {
  const competitions = await fetchAllCompetitions(signal);
  const leagues = competitions.filter((competition) => {
    if (competition.isCup || competition.currentSeason == null) return false;
    if (detectKind(competition.name) === 'country') return false;
    const season = competition.seasons.find((item) => item.seasonId === competition.currentSeason);
    return season == null || season.played == null || season.played > 0;
  });
  const seenSeasons = new Set<number>();
  const jobs = leagues.filter((competition) => {
    const seasonId = competition.currentSeason;
    if (seasonId == null || seenSeasons.has(seasonId)) return false;
    seenSeasons.add(seasonId);
    return true;
  });

  const hits: Hit[] = [];
  let cursor = 0;
  let done = 0;
  const needsFixtures = callAspectById(aspectId)?.needsFixtures === true;
  onProgress(0, jobs.length);

  async function worker() {
    while (cursor < jobs.length) {
      if (signal.aborted) return;
      const competition = jobs[cursor];
      cursor += 1;
      const seasonId = competition.currentSeason;
      if (seasonId == null) continue;
      try {
        const standings = await fetchSeasonStandings(seasonId, signal);
        const table: CallTableRow[] = standings.map((row) => ({
          rank: row.rank,
          teamId: row.teamId,
          name: row.name,
          played: row.played,
          points: row.points,
          homePoints: row.homePoints,
          awayPoints: row.awayPoints,
          zone: row.zone,
        }));
        let context: CallSearchContext | undefined;
        if (needsFixtures) {
          const season = competition.seasons.find((item) => item.seasonId === seasonId);
          const window = seasonWindowUnix(season?.seasonName ?? '');
          const raw = await fetchAllFixturesBetween(
            {
              fromUnix: window.fromUnix,
              toUnix: window.toUnix,
              competitions: String(competition.id),
              maxPages: 8,
            },
            signal,
          );
          const feed = seasonFeedFromFixtures(raw, seasonId);
          context = { matches: feed.matches, schedule: feed.schedule, cache: new Map() };
        }
        for (const row of table) {
          const score = scoreCallAspect(aspectId, row, table, context);
          if (!score) continue;
          hits.push({
            teamId: row.teamId,
            name: row.name,
            league: competition.name,
            country: competition.country,
            rank: row.rank,
            percent: score.percent,
            reason: score.reason,
          });
        }
      } catch {
        if (signal.aborted) return;
      } finally {
        done += 1;
        onProgress(done, jobs.length);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(SCAN_LIMIT, jobs.length) }, () => worker()));
  hits.sort((a, b) => b.percent - a.percent || a.name.localeCompare(b.name));
  return hits;
}

export default function PowerDynamicCallSearch({ heading = true }: { heading?: boolean }) {
  const [tabId, setTabId] = useState('');
  const [functionId, setFunctionId] = useState('');
  const [aspectId, setAspectId] = useState('');
  const [minPct, setMinPct] = useState('0');
  const [maxPct, setMaxPct] = useState('100');
  const [hits, setHits] = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchedAspect, setSearchedAspect] = useState('');

  const call = tabId ? powerDynamicCall(tabId) : undefined;
  const aspects = call && functionId ? callAspectsFor(tabId, functionId) : [];
  const aspect = aspects.find((item) => item.id === aspectId);

  const dynamicOptions = useMemo(
    () => POWER_DYNAMIC_CALLS.map((item) => ({ value: item.id, label: `${item.index}. ${item.name}` })),
    [],
  );
  const functionOptions = useMemo(
    () => (call ? call.functions.map((item) => ({ value: item.id, label: item.label })) : []),
    [call],
  );
  const aspectOptions = useMemo(
    () => aspects.map((item) => ({ value: item.id, label: item.label })),
    [aspects],
  );

  const floor = Math.min(Number(minPct), Number(maxPct));
  const ceiling = Math.max(Number(minPct), Number(maxPct));
  const shown = hits.filter((hit) => hit.percent >= floor && hit.percent <= ceiling);

  useEffect(() => {
    if (!aspectId) return undefined;
    const ctrl = new AbortController();
    setSearching(true);
    setError(null);
    setHits([]);
    setProgress(null);
    setSearchedAspect(aspectId);
    scanLeagues(aspectId, ctrl.signal, (done, total) => {
      if (!ctrl.signal.aborted) setProgress({ done, total });
    })
      .then((rows) => {
        if (!ctrl.signal.aborted) setHits(rows);
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setError('The league search stopped before it finished.');
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setSearching(false);
      });
    return () => ctrl.abort();
  }, [aspectId]);

  return (
    <View>
      {heading ? <Text style={styles.title}>Call</Text> : null}
      <Text style={styles.note}>
        Pick a power dynamic, then a function, then an aspect. Every club league is searched, and teams are listed from the closest fit to the weakest. Pair reads use the nearest side on that table. Season reads use that league’s matches.
      </Text>
      <View style={styles.filters}>
        <FilterDropdown
          label="Power dynamic"
          value={tabId}
          options={dynamicOptions}
          emptyLabel="Choose a power dynamic"
          onChange={(value) => {
            setTabId(value);
            setFunctionId('');
            setAspectId('');
          }}
          style={styles.dropdown}
        />
        {tabId ? (
          <FilterDropdown
            label="Function"
            value={functionId}
            options={functionOptions}
            emptyLabel="Choose a function"
            onChange={(value) => {
              setFunctionId(value);
              setAspectId('');
            }}
            style={styles.dropdown}
          />
        ) : null}
        {functionId ? (
          <FilterDropdown
            label="Aspect"
            value={aspectId}
            options={aspectOptions}
            emptyLabel="Choose an aspect"
            onChange={setAspectId}
            style={styles.dropdown}
          />
        ) : null}
        {aspect ? (
          <View style={styles.range}>
            <FilterDropdown
              label="From"
              value={minPct}
              options={PERCENT_OPTIONS}
              onChange={setMinPct}
              style={styles.dropdown}
            />
            <FilterDropdown
              label="To"
              value={maxPct}
              options={PERCENT_OPTIONS}
              onChange={setMaxPct}
              style={styles.dropdown}
            />
          </View>
        ) : null}
      </View>

      {aspect ? <Text style={styles.detail}>{aspect.detail}</Text> : null}

      {searching ? (
        <View style={styles.progress}>
          <ActivityIndicator color={theme.accentGreen} />
          <Text style={styles.progressText}>
            {progress
              ? `Checked ${progress.done} of ${progress.total} leagues`
              : 'Loading leagues…'}
          </Text>
        </View>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {!searching && searchedAspect === aspectId && aspect ? (
        <View style={styles.list}>
          <Text style={styles.count}>
            {shown.length} team{shown.length === 1 ? '' : 's'} from {floor}% to {ceiling}%
          </Text>
          {shown.length === 0 ? (
            <Text style={styles.empty}>No team in this percentage band.</Text>
          ) : (
            shown.slice(0, 250).map((hit, index) => (
              <View key={`${hit.league}-${hit.teamId}`} style={styles.row}>
                <Text style={styles.place}>{index + 1}</Text>
                <View style={styles.identity}>
                  <Text style={styles.name} numberOfLines={1}>{hit.name}</Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {hit.country} · {hit.league} · #{hit.rank}
                  </Text>
                  <Text style={styles.reason} numberOfLines={2}>{hit.reason}</Text>
                </View>
                <Text style={styles.percent}>{hit.percent}%</Text>
              </View>
            ))
          )}
          {shown.length > 250 ? (
            <Text style={styles.more}>Showing the first 250 teams in this band. Tighten the percentage to see a shorter list.</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontFamily: fonts.display,
    fontSize: 22,
    color: theme.textPrimary,
    marginBottom: spacing.xs,
  },
  note: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    color: theme.textMuted,
    marginBottom: spacing.md,
  },
  filters: { width: '100%', alignSelf: 'stretch', gap: spacing.sm, marginBottom: spacing.sm },
  dropdown: { width: '100%', maxWidth: '100%', alignSelf: 'stretch', minWidth: 0, flexBasis: 'auto', flexGrow: 0 },
  range: { width: '100%', gap: spacing.sm },
  detail: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    color: theme.textPrimary,
    marginBottom: spacing.sm,
  },
  progress: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  progressText: { fontFamily: fonts.body, fontSize: 13, color: theme.textMuted },
  error: { fontFamily: fonts.body, fontSize: 13, color: theme.loss, marginBottom: spacing.sm },
  list: {
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    backgroundColor: theme.surface,
    overflow: 'hidden',
  },
  count: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: theme.textMuted,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: layout.borderWidth,
    borderBottomColor: theme.border,
  },
  empty: { fontFamily: fonts.body, fontSize: 13, color: theme.textMuted, padding: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: layout.borderWidth,
    borderBottomColor: theme.border,
  },
  place: { width: 28, fontFamily: fonts.display, fontSize: 16, color: theme.textMuted, textAlign: 'center' },
  identity: { flex: 1, minWidth: 0 },
  name: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: theme.textPrimary },
  meta: { fontFamily: fonts.body, fontSize: 12, color: theme.textMuted, marginTop: 1 },
  reason: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16, color: theme.textPrimary, marginTop: 2 },
  percent: { fontFamily: fonts.display, fontSize: 22, color: theme.accentGreen, minWidth: 58, textAlign: 'right' },
  more: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16, color: theme.textMuted, padding: spacing.sm },
});
