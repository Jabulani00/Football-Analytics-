import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useLiveCompetitions } from '@/hooks/useLiveCompetitions';
import { useLiveFixturePredictions, type PredictedFixture } from '@/hooks/useLiveFixturePredictions';
import type { FixturePrediction } from '@/services/predictionEngine';
import { fonts, layout, spacing, theme } from '@/styles/theme';

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

function outcomeColor(p: number) {
  return p >= 0.5 ? theme.accentGreen : p >= 0.34 ? theme.yellow : theme.textMuted;
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

  return (
    <View style={styles.container}>
      <Text style={styles.hint}>
        Predictions generated live from the API — stat tables rebuilt on each
        refresh, then run through the Dixon-Coles model.
      </Text>

      {competitions.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={Platform.OS === 'web'}
          contentContainerStyle={styles.picker}>
          {competitions.map((c) => (
            <Pressable
              key={c.id}
              onPress={() => setCompetitionId(c.id)}
              style={({ pressed, hovered }) => [
                styles.chip,
                c.id === competitionId && styles.chipActive,
                (pressed || (Platform.OS === 'web' && hovered)) && styles.chipHover,
              ]}>
              <Text style={[styles.chipText, c.id === competitionId && styles.chipTextActive]}>
                {c.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

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

      {!loading && withPred.length === 0 ? (
        <Text style={styles.empty}>
          No predictable upcoming fixtures for this competition yet (teams need
          prior results this season).
        </Text>
      ) : null}

      <View style={styles.list}>
        {withPred.slice(0, 40).map((item) => (
          <FixtureCard key={item.fixture.id} item={item} />
        ))}
      </View>
    </View>
  );
}

function FixtureCard({ item }: { item: PredictedFixture }) {
  const { fixture, prediction } = item;
  const p = prediction as FixturePrediction;
  const kickoff = fixture.ko_human || fixture.date || '';

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.teams} numberOfLines={1}>
          {fixture.home_name} <Text style={styles.vs}>v</Text> {fixture.away_name}
        </Text>
        <Text style={styles.kickoff}>{kickoff}</Text>
      </View>

      {/* 1X2 */}
      <View style={styles.oneXtwo}>
        <Outcome label="1" value={p.homeWin} active={p.pick === '1'} />
        <Outcome label="X" value={p.draw} active={p.pick === 'X'} />
        <Outcome label="2" value={p.awayWin} active={p.pick === '2'} />
      </View>

      {/* Markets */}
      <View style={styles.markets}>
        <Market label="BTTS" value={pct(p.btts)} />
        <Market label="O2.5" value={pct(p.over25)} />
        <Market label="xG" value={`${p.expectedHome.toFixed(1)}-${p.expectedAway.toFixed(1)}`} />
        <Market label="Score" value={p.topScore} />
        <Market label="Conf" value={`${p.confidence}%`} />
      </View>
      {p.lowData ? <Text style={styles.lowData}>· limited sample</Text> : null}
    </View>
  );
}

function Outcome({ label, value, active }: { label: string; value: number; active: boolean }) {
  return (
    <View style={[styles.outcome, active && styles.outcomeActive]}>
      <Text style={[styles.outcomeLabel, active && styles.outcomeLabelActive]}>{label}</Text>
      <Text style={[styles.outcomePct, { color: outcomeColor(value) }]}>{pct(value)}</Text>
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
  picker: { justifyContent: 'center', gap: spacing.sm, paddingBottom: spacing.md, flexGrow: 1 },
  chip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: layout.borderWidth,
    borderColor: theme.border, borderRadius: layout.borderRadius, backgroundColor: theme.surface,
  },
  chipActive: { borderColor: theme.accentGreen },
  chipHover: { borderColor: theme.textMuted },
  chipText: { fontFamily: fonts.body, fontSize: 12, color: theme.textMuted },
  chipTextActive: { color: theme.accentGreen, fontFamily: fonts.bodyMedium },
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
  kickoff: { fontFamily: fonts.body, fontSize: 12, color: theme.textMuted },
  oneXtwo: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  outcome: {
    flex: 1, alignItems: 'center', paddingVertical: spacing.sm,
    borderWidth: layout.borderWidth, borderColor: theme.border, borderRadius: layout.borderRadius,
  },
  outcomeActive: { borderColor: theme.accentGreen, backgroundColor: 'rgba(0,180,120,0.06)' },
  outcomeLabel: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted },
  outcomeLabelActive: { color: theme.accentGreen, fontFamily: fonts.bodyMedium },
  outcomePct: { fontFamily: fonts.bodyMedium, fontSize: 15 },
  markets: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, alignItems: 'center' },
  market: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  marketLabel: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted },
  marketValue: { fontFamily: fonts.bodyMedium, fontSize: 13, color: theme.textPrimary },
  lowData: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted, marginTop: spacing.xs },
});
