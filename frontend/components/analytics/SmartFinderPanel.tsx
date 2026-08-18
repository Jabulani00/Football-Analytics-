import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import CompetitionPicker from '@/components/shared/CompetitionPicker';
import SubTabBar from '@/components/shared/SubTabBar';
import { useLiveCompetitions } from '@/hooks/useLiveCompetitions';
import { useLiveFixturePredictions, type PredictedFixture } from '@/hooks/useLiveFixturePredictions';
import {
  computeTieredTables,
  fetchSeasonStandings,
  type Season,
  type StandingZone,
  type TierTeamRow,
} from '@/services/oddAlerts';
import {
  buildRecommendation,
  type FixtureRecommendation,
  type MarketModule,
  type RiskLevel,
} from '@/utils/fixtureRecommendation';
import { fonts, layout, spacing, theme } from '@/styles/theme';

// ---------------------------------------------------------------------------
// Filter option sets — plain English, so the query reads like a sentence.
// ---------------------------------------------------------------------------

type TierFilter = 'any' | 'top' | 'mid' | 'bottom';
type FormFilter = 'any' | 'beating' | 'struggling';
type ProbFilter = 0 | 60 | 70 | 80;
type RiskFilter = 'any' | 'low' | 'medium';
type ModuleFilter = 'all' | MarketModule;

const TIER_TABS: { id: TierFilter; label: string }[] = [
  { id: 'any', label: 'Any tier' },
  { id: 'top', label: '🟢 Top' },
  { id: 'mid', label: '🟡 Mid' },
  { id: 'bottom', label: '🔴 Bottom' },
];
const FORM_TABS: { id: FormFilter; label: string }[] = [
  { id: 'any', label: 'Any form' },
  { id: 'beating', label: 'Beating Green' },
  { id: 'struggling', label: 'Struggling vs Green' },
];
const PROB_TABS: { id: string; label: string }[] = [
  { id: '0', label: 'Any %' },
  { id: '60', label: '60%+' },
  { id: '70', label: '70%+' },
  { id: '80', label: '80%+' },
];
const RISK_TABS: { id: RiskFilter; label: string }[] = [
  { id: 'any', label: 'Any risk' },
  { id: 'medium', label: '≤ Medium' },
  { id: 'low', label: '🟢 Low only' },
];
const MODULE_TABS: { id: ModuleFilter; label: string }[] = [
  { id: 'all', label: 'All markets' },
  { id: 'result', label: 'Result' },
  { id: 'goals', label: 'Goals' },
  { id: 'btts', label: 'BTTS' },
];

const ZONE_COLOR: Record<StandingZone, string> = {
  top: '#16A34A',
  mid: '#D97706',
  bottom: '#DC2626',
};
const ZONE_LABEL: Record<StandingZone, string> = { top: 'Top', mid: 'Mid', bottom: 'Bottom' };
const RISK_COLOR: Record<RiskLevel, string> = {
  low: theme.accentGreen,
  medium: theme.yellow,
  high: theme.loss,
};

// ---------------------------------------------------------------------------
// Per-competition tier data (zone + record vs Green for every team).
// ---------------------------------------------------------------------------

type TierInfo = { zone: StandingZone; name: string; rank: number; vsGreen: TierTeamRow | null };

function useCompetitionTiers(
  competitionId: number | null,
  seasonId: number | null,
  seasonName: string | undefined,
): { byTeam: Map<number, TierInfo>; loading: boolean } {
  const [state, setState] = useState<{ byTeam: Map<number, TierInfo>; loading: boolean }>({
    byTeam: new Map(),
    loading: false,
  });

  useEffect(() => {
    if (competitionId == null || seasonId == null || !seasonName) {
      setState({ byTeam: new Map(), loading: false });
      return;
    }
    const ctrl = new AbortController();
    setState((s) => ({ ...s, loading: true }));
    (async () => {
      try {
        const standings = await fetchSeasonStandings(seasonId, ctrl.signal);
        if (ctrl.signal.aborted) return;
        const season: Season = {
          seasonId,
          seasonName,
          played: null,
          progress: null,
          isCurrent: true,
        };
        const tiered = await computeTieredTables({ competitionId, season, standings }, ctrl.signal);
        if (ctrl.signal.aborted) return;

        const byTeam = new Map<number, TierInfo>();
        for (const r of standings) {
          byTeam.set(r.teamId, { zone: r.zone, name: r.name, rank: r.rank, vsGreen: null });
        }
        const apply = (rows: TierTeamRow[]) => {
          for (const row of rows) {
            const t = byTeam.get(row.teamId);
            if (t) t.vsGreen = row;
          }
        };
        apply(tiered.green);
        apply(tiered.yellow);
        apply(tiered.red);
        setState({ byTeam, loading: false });
      } catch {
        if (!ctrl.signal.aborted) setState({ byTeam: new Map(), loading: false });
      }
    })();
    return () => ctrl.abort();
  }, [competitionId, seasonId, seasonName]);

  return state;
}

// ---------------------------------------------------------------------------
// Matching helpers
// ---------------------------------------------------------------------------

const IN_PLAY = new Set(['LIVE', 'HT', '1H', '2H', 'ET', 'BT', 'P', 'INT']);

function recFor(item: PredictedFixture, module: ModuleFilter): FixtureRecommendation | null {
  if (!item.prediction) return null;
  const f = item.fixture;
  const live =
    IN_PLAY.has(f.status) && f.home_goals != null && f.away_goals != null
      ? { minute: f.elapsed ?? 0, homeGoals: f.home_goals, awayGoals: f.away_goals }
      : null;
  return buildRecommendation({
    prediction: item.prediction,
    homeName: f.home_name,
    awayName: f.away_name,
    homePosition: f.home_position,
    awayPosition: f.away_position,
    live,
    modules: module === 'all' ? undefined : [module],
  });
}

/** Green-record verdict for a team (green teams: vs other green; others: vs green). */
function greenVerdict(v: TierTeamRow | null): 'beating' | 'struggling' | 'level' | 'none' {
  if (!v || v.played === 0) return 'none';
  if (v.won > v.lost) return 'beating';
  if (v.lost > v.won) return 'struggling';
  return 'level';
}

function teamMatches(info: TierInfo | undefined, tier: TierFilter, form: FormFilter): boolean {
  const constrained = tier !== 'any' || form !== 'any';
  if (!info) return !constrained; // no tier data → only matches when unconstrained
  if (tier !== 'any' && info.zone !== tier) return false;
  if (form !== 'any') {
    const verdict = greenVerdict(info.vsGreen);
    if (form === 'beating' && verdict !== 'beating') return false;
    if (form === 'struggling' && verdict !== 'struggling') return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export default function SmartFinderPanel() {
  const competitions = useLiveCompetitions(3);
  const [competitionId, setCompetitionId] = useState<number | null>(null);
  useEffect(() => {
    if (competitionId == null && competitions.length > 0) setCompetitionId(competitions[0].id);
  }, [competitions, competitionId]);
  const active = competitions.find((c) => c.id === competitionId) ?? null;

  const { items, loading: predsLoading } = useLiveFixturePredictions({
    competitionId: competitionId ?? undefined,
    seasonName: active?.season,
    days: 10,
  });

  // The season id the fixtures belong to (most common) → used for the tier tables.
  const seasonId = useMemo(() => {
    const counts = new Map<number, number>();
    for (const it of items) {
      const s = it.fixture.season_id;
      if (s != null) counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    let best: number | null = null;
    let bestN = 0;
    for (const [s, n] of counts) if (n > bestN) [best, bestN] = [s, n];
    return best;
  }, [items]);

  const { byTeam, loading: tiersLoading } = useCompetitionTiers(
    competitionId,
    seasonId,
    active?.season,
  );

  const [tier, setTier] = useState<TierFilter>('mid');
  const [form, setForm] = useState<FormFilter>('beating');
  const [minProb, setMinProb] = useState<ProbFilter>(60);
  const [maxRisk, setMaxRisk] = useState<RiskFilter>('medium');
  const [module, setModule] = useState<ModuleFilter>('all');

  const results = useMemo(() => {
    const out: {
      item: PredictedFixture;
      rec: FixtureRecommendation;
      focus: { name: string; info: TierInfo } | null;
    }[] = [];

    for (const item of items) {
      if (!item.prediction) continue;
      const f = item.fixture;

      // Which team (if any) satisfies the tier + form filter?
      const homeInfo = f.home_id != null ? byTeam.get(f.home_id) : undefined;
      const awayInfo = f.away_id != null ? byTeam.get(f.away_id) : undefined;
      const teamConstrained = tier !== 'any' || form !== 'any';

      let focus: { name: string; info: TierInfo } | null = null;
      if (teamConstrained) {
        if (teamMatches(homeInfo, tier, form) && homeInfo) focus = { name: f.home_name, info: homeInfo };
        else if (teamMatches(awayInfo, tier, form) && awayInfo) focus = { name: f.away_name, info: awayInfo };
        else continue; // neither team qualifies
      }

      // Bet-side filter: probability + risk on the recommendation.
      const rec = recFor(item, module);
      if (!rec || !rec.best) continue;
      if (rec.best.probability * 100 < minProb) continue;
      if (maxRisk === 'low' && rec.riskLevel !== 'low') continue;
      if (maxRisk === 'medium' && rec.riskLevel === 'high') continue;

      out.push({ item, rec, focus });
    }

    return out.sort((a, b) => b.rec.best!.score - a.rec.best!.score);
  }, [items, byTeam, tier, form, minProb, maxRisk, module]);

  const needsTiers = tier !== 'any' || form !== 'any';
  const sentence = buildSentence(tier, form, minProb, maxRisk);

  return (
    <View style={styles.container}>
      <Text style={styles.intro}>
        Build a query in plain English — pick a tier, how they’re doing against the Green table, then
        screen the bets by probability and risk. The best matches rise to the top.
      </Text>

      <CompetitionPicker
        competitions={competitions}
        selectedId={competitionId}
        onSelect={setCompetitionId}
      />

      <View style={styles.filters}>
        <FilterRow label="TEAM TIER">
          <SubTabBar tabs={TIER_TABS} active={tier} onChange={setTier} />
        </FilterRow>
        <FilterRow label="FORM VS GREEN">
          <SubTabBar tabs={FORM_TABS} active={form} onChange={setForm} />
        </FilterRow>
        <FilterRow label="MIN BET PROBABILITY">
          <SubTabBar
            tabs={PROB_TABS}
            active={String(minProb)}
            onChange={(id) => setMinProb(Number(id) as ProbFilter)}
          />
        </FilterRow>
        <FilterRow label="MAX RISK">
          <SubTabBar tabs={RISK_TABS} active={maxRisk} onChange={setMaxRisk} />
        </FilterRow>
        <FilterRow label="MARKET">
          <SubTabBar tabs={MODULE_TABS} active={module} onChange={setModule} />
        </FilterRow>
      </View>

      <View style={styles.summaryCard}>
        <Text style={styles.summaryText}>{sentence}</Text>
        <Text style={styles.summaryCount}>
          {predsLoading ? 'Screening…' : `${results.length} match${results.length === 1 ? '' : 'es'}`}
        </Text>
      </View>

      {predsLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="small" color={theme.accentGreen} />
          <Text style={styles.muted}>Running predictions…</Text>
        </View>
      ) : needsTiers && tiersLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="small" color={theme.accentGreen} />
          <Text style={styles.muted}>Building tier tables…</Text>
        </View>
      ) : needsTiers && byTeam.size === 0 ? (
        <Text style={styles.muted}>
          No tier table for this competition yet — set the tier filters to “Any”, or pick another
          league.
        </Text>
      ) : results.length === 0 ? (
        <Text style={styles.muted}>
          Nothing clears this query. Loosen the tier, form, probability or risk.
        </Text>
      ) : (
        <View style={styles.list}>
          {results.slice(0, 40).map(({ item, rec, focus }) => (
            <ResultRow key={item.fixture.id} item={item} rec={rec} focus={focus} />
          ))}
        </View>
      )}
    </View>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.filterRow}>
      <Text style={styles.filterLabel}>{label}</Text>
      {children}
    </View>
  );
}

function ResultRow({
  item,
  rec,
  focus,
}: {
  item: PredictedFixture;
  rec: FixtureRecommendation;
  focus: { name: string; info: TierInfo } | null;
}) {
  const f = item.fixture;
  const best = rec.best!;
  const riskColor = RISK_COLOR[rec.riskLevel];
  const v = focus?.info.vsGreen ?? null;
  const verdict = greenVerdict(v);

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.fixture} numberOfLines={1}>
          {f.home_name} <Text style={styles.vs}>v</Text> {f.away_name}
        </Text>
        <Text style={styles.kickoff}>{f.ko_human || f.date || ''}</Text>
      </View>

      {focus ? (
        <View style={styles.tierRow}>
          <View style={[styles.tierBadge, { borderColor: ZONE_COLOR[focus.info.zone] }]}>
            <Text style={[styles.tierBadgeText, { color: ZONE_COLOR[focus.info.zone] }]}>
              {ZONE_LABEL[focus.info.zone]} tier · {focus.name}
            </Text>
          </View>
          {v && v.played > 0 ? (
            <Text style={styles.vsGreen}>
              {verdict === 'beating' ? 'Beating' : verdict === 'struggling' ? 'Struggling vs' : 'Level with'}{' '}
              Green · W{v.won} D{v.drawn} L{v.lost} ({v.points} pts)
            </Text>
          ) : (
            <Text style={styles.vsGreenMuted}>No Green games yet</Text>
          )}
        </View>
      ) : null}

      <View style={styles.betRow}>
        <View style={styles.betText}>
          <Text style={styles.betMarket}>{best.market}</Text>
          <Text style={styles.betSelection} numberOfLines={1}>
            {best.selection}
          </Text>
        </View>
        <View style={styles.betRight}>
          <Text style={[styles.betProb, { color: riskColor }]}>{Math.round(best.probability * 100)}%</Text>
          <View style={[styles.riskPill, { borderColor: riskColor }]}>
            <Text style={[styles.riskPillText, { color: riskColor }]}>{rec.riskLevel} risk</Text>
          </View>
        </View>
      </View>

      {rec.factors.length > 0 ? (
        <Text style={styles.factorLine} numberOfLines={1}>
          ⚠ {rec.factors.map((x) => x.label).join(' · ')}
        </Text>
      ) : (
        <Text style={styles.cleanLine}>No material risk flags — a clean read.</Text>
      )}
    </View>
  );
}

function buildSentence(tier: TierFilter, form: FormFilter, minProb: ProbFilter, maxRisk: RiskFilter): string {
  const tierPart =
    tier === 'top' ? 'Top-tier (Green)' : tier === 'mid' ? 'Mid-tier (Yellow)' : tier === 'bottom' ? 'Bottom-tier (Red)' : 'Any';
  const teamNoun = tier === 'any' ? 'Teams' : `${tierPart} teams`;
  const formPart = form === 'beating' ? ' beating Green' : form === 'struggling' ? ' struggling vs Green' : '';
  const probPart = minProb > 0 ? `, ${minProb}%+ bets` : ', best bets';
  const riskPart = maxRisk === 'low' ? ' at low risk' : maxRisk === 'medium' ? ' at ≤ medium risk' : '';
  return `${teamNoun}${formPart}${probPart}${riskPart}.`;
}

const styles = StyleSheet.create({
  container: { width: '100%', maxWidth: 680, alignSelf: 'center' },
  intro: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: theme.textMuted,
    textAlign: 'center',
    marginBottom: spacing.md,
    lineHeight: 19,
  },
  filters: { marginTop: spacing.sm },
  filterRow: { marginBottom: spacing.xs },
  filterLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    letterSpacing: 0.8,
    color: theme.textMuted,
    marginBottom: 2,
  },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    backgroundColor: theme.surfaceMuted,
    borderRadius: layout.borderRadius,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginVertical: spacing.sm,
  },
  summaryText: { flex: 1, fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.textPrimary },
  summaryCount: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: theme.accentGreen },
  center: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
  muted: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: theme.textMuted,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  list: { gap: spacing.sm },
  card: {
    backgroundColor: theme.surface,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    padding: spacing.md,
    gap: spacing.xs,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  fixture: { flex: 1, fontFamily: fonts.bodySemiBold, fontSize: 14, color: theme.textPrimary },
  vs: { color: theme.textMuted, fontFamily: fonts.body },
  kickoff: { fontFamily: fonts.body, fontSize: 11, color: theme.textFaint },
  tierRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  tierBadge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 1 },
  tierBadgeText: { fontFamily: fonts.bodySemiBold, fontSize: 11 },
  vsGreen: { fontFamily: fonts.bodyMedium, fontSize: 11, color: theme.textMuted },
  vsGreenMuted: { fontFamily: fonts.body, fontSize: 11, color: theme.textFaint },
  betRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: 2,
  },
  betText: { flex: 1, minWidth: 0 },
  betMarket: { fontFamily: fonts.body, fontSize: 10, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  betSelection: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: theme.textPrimary },
  betRight: { alignItems: 'flex-end', gap: 2 },
  betProb: { fontFamily: fonts.display, fontSize: 18 },
  riskPill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 1 },
  riskPillText: { fontFamily: fonts.bodySemiBold, fontSize: 9, textTransform: 'capitalize' },
  factorLine: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted },
  cleanLine: { fontFamily: fonts.body, fontSize: 11, color: theme.accentGreen },
});
