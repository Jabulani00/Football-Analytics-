import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import CompetitionPicker from '@/components/shared/CompetitionPicker';
import SubTabBar from '@/components/shared/SubTabBar';
import { useLiveCompetitions } from '@/hooks/useLiveCompetitions';
import { useLiveFixturePredictions, type PredictedFixture } from '@/hooks/useLiveFixturePredictions';
import type { FixturePrediction } from '@/services/predictionEngine';
import { fonts, layout, spacing, theme } from '@/styles/theme';

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

// Bet-type screener: each maps to a probability on the model prediction, so
// filtering the fixtures list returns exactly the games worth that bet.
type BetTypeId =
  | 'all'
  | 'home'
  | 'away'
  | 'draw'
  | 'btts'
  | 'o15'
  | 'o25'
  | 'o35'
  | 'u25'
  | 'banker';

const BET_TYPES: { id: BetTypeId; label: string; value?: (p: FixturePrediction) => number }[] = [
  { id: 'all', label: 'All' },
  { id: 'home', label: 'Home Win', value: (p) => p.homeWin },
  { id: 'away', label: 'Away Win', value: (p) => p.awayWin },
  { id: 'draw', label: 'Draw', value: (p) => p.draw },
  { id: 'btts', label: 'BTTS', value: (p) => p.btts },
  { id: 'o15', label: 'Over 1.5', value: (p) => p.over15 },
  { id: 'o25', label: 'Over 2.5', value: (p) => p.over25 },
  { id: 'o35', label: 'Over 3.5', value: (p) => p.over35 },
  { id: 'u25', label: 'Under 2.5', value: (p) => 1 - p.over25 },
  { id: 'banker', label: '🔒 Bankers', value: (p) => p.confidence / 100 },
];

const PROB_MINS: { id: string; label: string }[] = [
  { id: '0', label: 'Any' },
  { id: '55', label: '55%+' },
  { id: '65', label: '65%+' },
  { id: '75', label: '75%+' },
];

function pickLabel(pick: '1' | 'X' | '2'): string {
  return pick === '1' ? 'HOME' : pick === '2' ? 'AWAY' : 'DRAW';
}

function confidenceTier(c: number): { label: string; color: string } {
  if (c >= 70) return { label: 'High', color: theme.accentGreen };
  if (c >= 45) return { label: 'Medium', color: theme.yellow };
  return { label: 'Low', color: theme.loss };
}

/** Plain-English one-line read of the prediction. */
function verdict(p: FixturePrediction, home: string, away: string): string {
  const top = Math.max(p.homeWin, p.draw, p.awayWin);
  const strength = top >= 0.6 ? 'strongly favoured' : 'favoured';
  const parts: string[] = [];
  if (p.pick === '1') parts.push(top >= 0.45 ? `${home} ${strength}` : `slight edge to ${home}`);
  else if (p.pick === '2') parts.push(top >= 0.45 ? `${away} ${strength}` : `slight edge to ${away}`);
  else parts.push('honours even — draw');
  if (p.over25 >= 0.6) parts.push('goals expected');
  else if (p.over25 <= 0.38) parts.push('low-scoring lean');
  if (p.btts >= 0.62) parts.push('both to score');
  return parts.join(' · ');
}

export default function PredictionsPanel() {
  const competitions = useLiveCompetitions(3);
  const [competitionId, setCompetitionId] = useState<number | null>(null);

  useEffect(() => {
    if (competitionId == null && competitions.length > 0) setCompetitionId(competitions[0].id);
  }, [competitions, competitionId]);

  const active = competitions.find((c) => c.id === competitionId) ?? null;
  const { items, loading, error } = useLiveFixturePredictions({
    competitionId: competitionId ?? undefined,
    seasonName: active?.season,
    days: 10,
  });

  const withPred = useMemo(() => items.filter((i) => i.prediction), [items]);

  const [betType, setBetType] = useState<BetTypeId>('all');
  const [minProb, setMinProb] = useState(0);
  const activeBet = BET_TYPES.find((b) => b.id === betType) ?? BET_TYPES[0];

  const filtered = useMemo(() => {
    const getVal = activeBet.value;
    if (!getVal) return withPred;
    return withPred
      .filter((i) => i.prediction && getVal(i.prediction) >= minProb / 100)
      .sort((a, b) => getVal(b.prediction!) - getVal(a.prediction!));
  }, [withPred, activeBet, minProb]);

  return (
    <View style={styles.container}>
      <Text style={styles.hint}>
        Predictions generated live from the API — stat tables rebuilt on each
        refresh, then run through the Dixon-Coles model.
      </Text>

      <CompetitionPicker
        competitions={competitions}
        selectedId={competitionId}
        onSelect={setCompetitionId}
      />

      <View style={styles.statusRow}>
        {loading ? (
          <>
            <ActivityIndicator size="small" color={theme.accentGreen} />
            <Text style={styles.statusMuted}>Running predictions…</Text>
          </>
        ) : error ? (
          <Text style={styles.statusMuted}>Couldn’t load — {error}</Text>
        ) : (
          <Text style={[styles.statusText, styles.statusLive]}>
            ● LIVE · {active?.name ?? ''} — {withPred.length} predicted / {items.length} upcoming
          </Text>
        )}
      </View>

      {/* Bet-type screener — filter the fixtures down to the bets you want. */}
      <View style={styles.screener}>
        <Text style={styles.screenerLabel}>SHOW FIXTURES FOR</Text>
        <SubTabBar tabs={BET_TYPES} active={betType} onChange={setBetType} />
        {activeBet.value ? (
          <SubTabBar
            tabs={PROB_MINS}
            active={String(minProb)}
            onChange={(id) => setMinProb(Number(id))}
          />
        ) : null}
      </View>

      {!loading && withPred.length === 0 ? (
        <Text style={styles.empty}>
          No predictable upcoming fixtures for this competition yet (teams need
          prior results this season).
        </Text>
      ) : null}

      {!loading && withPred.length > 0 ? (
        <Text style={styles.resultCount}>
          {filtered.length} of {withPred.length} fixtures
          {activeBet.value ? ` · ${activeBet.label}${minProb > 0 ? ` ${minProb}%+` : ''}` : ''}
        </Text>
      ) : null}

      {!loading && withPred.length > 0 && filtered.length === 0 ? (
        <Text style={styles.empty}>
          No fixtures clear this filter — lower the probability or pick another market.
        </Text>
      ) : null}

      <View style={styles.list}>
        {filtered.slice(0, 40).map((item) => (
          <FixtureCard
            key={item.fixture.id}
            item={item}
            highlight={
              activeBet.value
                ? { label: activeBet.label, value: pct(activeBet.value(item.prediction!)) }
                : undefined
            }
          />
        ))}
      </View>
    </View>
  );
}

function FixtureCard({
  item,
  highlight,
}: {
  item: PredictedFixture;
  highlight?: { label: string; value: string };
}) {
  const { fixture, prediction } = item;
  const p = prediction as FixturePrediction;
  const kickoff = fixture.ko_human || fixture.date || '';
  const tier = confidenceTier(p.confidence);

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.teams} numberOfLines={1}>
          {fixture.home_name} <Text style={styles.vs}>v</Text> {fixture.away_name}
        </Text>
        <View style={[styles.pickBadge, { borderColor: tier.color }]}>
          <Text style={[styles.pickBadgeText, { color: tier.color }]}>{pickLabel(p.pick)}</Text>
        </View>
      </View>
      <View style={styles.kickoffRow}>
        <Text style={styles.kickoff}>{kickoff}</Text>
        {highlight ? (
          <View style={styles.matchBadge}>
            <Text style={styles.matchBadgeText}>
              {highlight.label} {highlight.value}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Plain-English read */}
      <Text style={styles.verdict}>{verdict(p, fixture.home_name, fixture.away_name)}</Text>

      {/* Stacked 1X2 probability bar */}
      <View style={styles.stack}>
        <View style={[styles.stackSeg, { flex: Math.max(0.001, p.homeWin), backgroundColor: theme.accentGreen }]} />
        <View style={[styles.stackSeg, { flex: Math.max(0.001, p.draw), backgroundColor: theme.textMuted }]} />
        <View style={[styles.stackSeg, { flex: Math.max(0.001, p.awayWin), backgroundColor: theme.accentBlue }]} />
      </View>
      <View style={styles.stackLabels}>
        <Text style={[styles.stackLabel, p.pick === '1' && styles.stackLabelActive]}>1 · {pct(p.homeWin)}</Text>
        <Text style={[styles.stackLabel, styles.stackLabelMid, p.pick === 'X' && styles.stackLabelActive]}>
          X · {pct(p.draw)}
        </Text>
        <Text style={[styles.stackLabel, styles.stackLabelRight, p.pick === '2' && styles.stackLabelActive]}>
          2 · {pct(p.awayWin)}
        </Text>
      </View>

      {/* Markets */}
      <View style={styles.markets}>
        <Market label="BTTS" value={pct(p.btts)} />
        <Market label="Over 2.5" value={pct(p.over25)} />
        <Market label="Exp. goals" value={`${p.expectedHome.toFixed(1)}–${p.expectedAway.toFixed(1)}`} />
        <Market label="Scoreline" value={p.topScore} />
      </View>

      {/* Confidence meter */}
      <View style={styles.confRow}>
        <Text style={styles.confLabel}>Confidence</Text>
        <View style={styles.confTrack}>
          <View style={[styles.confFill, { width: `${p.confidence}%`, backgroundColor: tier.color }]} />
        </View>
        <Text style={[styles.confVal, { color: tier.color }]}>
          {tier.label} · {p.confidence}%
        </Text>
      </View>
      {p.lowData ? <Text style={styles.lowData}>Limited sample — treat with caution</Text> : null}
    </View>
  );
}

function Market({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.market}>
      <Text style={styles.marketLabel}>{label}</Text>
      <Text style={styles.marketValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', alignItems: 'center' },
  hint: {
    fontFamily: fonts.body, fontSize: 13, color: theme.textMuted,
    textAlign: 'center', marginBottom: spacing.lg, maxWidth: 640,
  },
  statusRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, marginBottom: spacing.md, minHeight: 18,
  },
  statusText: { fontFamily: fonts.bodyMedium, fontSize: 12 },
  statusLive: { color: theme.accentGreen },
  statusMuted: { fontFamily: fonts.body, fontSize: 12, color: theme.textMuted },
  empty: {
    fontFamily: fonts.body, fontSize: 13, color: theme.textMuted,
    textAlign: 'center', maxWidth: 480, marginTop: spacing.md,
  },
  screener: { width: '100%', maxWidth: 640, marginBottom: spacing.sm },
  screenerLabel: {
    fontFamily: fonts.bodySemiBold, fontSize: 10, letterSpacing: 1,
    color: theme.textMuted, marginBottom: spacing.xs,
  },
  resultCount: {
    width: '100%', maxWidth: 640, fontFamily: fonts.bodyMedium, fontSize: 12,
    color: theme.textPrimary, marginBottom: spacing.sm,
  },
  kickoffRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: spacing.sm, marginBottom: spacing.sm,
  },
  matchBadge: {
    backgroundColor: 'rgba(5,150,105,0.10)', borderRadius: 4,
    paddingHorizontal: spacing.sm, paddingVertical: 2,
  },
  matchBadgeText: { fontFamily: fonts.bodySemiBold, fontSize: 11, color: theme.accentGreen },
  list: { width: '100%', maxWidth: 640, gap: spacing.md },
  card: {
    backgroundColor: theme.surface, borderWidth: layout.borderWidth, borderColor: theme.border,
    borderRadius: layout.borderRadius, padding: spacing.md,
  },
  cardHead: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: spacing.md, gap: spacing.sm,
  },
  teams: { fontFamily: fonts.bodyMedium, fontSize: 14, color: theme.textPrimary, flexShrink: 1 },
  vs: { color: theme.textMuted },
  kickoff: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted, marginBottom: spacing.sm },
  pickBadge: {
    borderWidth: 1, borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 2,
  },
  pickBadgeText: { fontFamily: fonts.bodyMedium, fontSize: 10, letterSpacing: 0.5 },
  verdict: { fontFamily: fonts.bodyMedium, fontSize: 13, color: theme.textPrimary, marginBottom: spacing.sm },
  stack: {
    flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden',
    backgroundColor: theme.surfaceMuted ?? theme.border, gap: 1,
  },
  stackSeg: { height: 8 },
  stackLabels: { flexDirection: 'row', marginTop: 4, marginBottom: spacing.sm },
  stackLabel: { flex: 1, fontFamily: fonts.body, fontSize: 11, color: theme.textMuted },
  stackLabelMid: { textAlign: 'center' },
  stackLabelRight: { textAlign: 'right' },
  stackLabelActive: { color: theme.textPrimary, fontFamily: fonts.bodyMedium },
  markets: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, alignItems: 'center', marginBottom: spacing.sm },
  market: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  marketLabel: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted },
  marketValue: { fontFamily: fonts.bodyMedium, fontSize: 13, color: theme.textPrimary },
  confRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  confLabel: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted, width: 70 },
  confTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: theme.surfaceMuted ?? theme.border, overflow: 'hidden' },
  confFill: { height: 6, borderRadius: 3 },
  confVal: { fontFamily: fonts.bodyMedium, fontSize: 11, width: 96, textAlign: 'right' },
  lowData: { fontFamily: fonts.body, fontSize: 11, color: theme.yellow, marginTop: spacing.sm },
});
