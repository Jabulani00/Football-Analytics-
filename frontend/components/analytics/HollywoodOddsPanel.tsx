import { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import SectionLabel from '@/components/shared/SectionLabel';
import { useHollywoodExport } from '@/hooks/useHollywoodExport';
import { useHollywoodNav } from '@/hooks/useHollywoodNav';
import { useHollywoodOdds } from '@/hooks/useHollywoodOdds';
import {
  BET_TYPE,
  toDecimal,
  toShareLeg,
  type HbEvent,
  type ShareLeg,
} from '@/services/hollywoodbets';
import { fonts, layout, spacing, theme } from '@/styles/theme';

type Pick = '1' | 'X' | '2';
const PICK_NUMBER: Record<Pick, number> = { '1': 1, X: 2, '2': 3 };
type Selection = { pick: Pick; leg: ShareLeg; odds: number };

/** Build the Share-A-Bet leg + decimal price for a chosen outcome. */
function legFor(
  event: HbEvent,
  pick: Pick,
  ctx: { tournamentId: number; tournamentName: string; countryId: number },
): Selection | null {
  const ft = event.betTypes.find((b) => b.id === BET_TYPE.FULL_TIME);
  const market = ft?.markets.find((m) => m.number === PICK_NUMBER[pick]);
  if (!ft || !market) return null;
  return { pick, leg: toShareLeg(event, ft, market, ctx), odds: toDecimal(market.odds) };
}

export default function HollywoodOddsPanel() {
  const [filter, setFilter] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [tournamentId, setTournamentId] = useState<number | null>(null);
  const [selections, setSelections] = useState<Record<number, Selection>>({});

  const nav = useHollywoodNav(categoryId);
  const category = nav.categories.find((c) => c.id === categoryId) ?? null;
  const tournament = nav.tournaments.find((t) => t.id === tournamentId) ?? null;

  const ctx = useMemo(
    () =>
      category && tournament
        ? { categoryId: category.id, tournamentId: tournament.id, tournamentName: tournament.name, countryId: category.id }
        : null,
    [category, tournament],
  );
  const odds = useHollywoodOdds(ctx);
  const { state: exportState, exportSlip } = useHollywoodExport();

  const filteredCountries = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = q ? nav.categories.filter((c) => c.name.toLowerCase().includes(q)) : nav.categories;
    return list.slice(0, 40);
  }, [nav.categories, filter]);

  const legs = useMemo(() => Object.values(selections), [selections]);
  const combinedOdds = legs.reduce((acc, s) => acc * s.odds, 1);

  const togglePick = (event: HbEvent, pick: Pick) => {
    if (!ctx) return;
    setSelections((prev) => {
      const current = prev[event.id];
      if (current?.pick === pick) {
        const next = { ...prev };
        delete next[event.id];
        return next;
      }
      const sel = legFor(event, pick, ctx);
      return sel ? { ...prev, [event.id]: sel } : prev;
    });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.intro}>
        Live Hollywoodbets soccer odds. Pick a country and league, tap selections, then generate a
        booking code that opens a pre-loaded betslip on Hollywoodbets.
      </Text>

      {/* Country */}
      <SectionLabel style={styles.label}>Country</SectionLabel>
      <TextInput
        style={styles.search}
        value={filter}
        onChangeText={setFilter}
        placeholder="Filter countries…"
        placeholderTextColor={theme.textFaint}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {nav.loadingCategories ? <Text style={styles.muted}>Loading…</Text> : null}
        {filteredCountries.map((c) => (
          <Chip
            key={c.id}
            label={c.name}
            active={c.id === categoryId}
            onPress={() => {
              setCategoryId(c.id);
              setTournamentId(null);
            }}
          />
        ))}
      </ScrollView>

      {/* League */}
      {categoryId != null ? (
        <>
          <SectionLabel style={styles.label}>League</SectionLabel>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {nav.loadingTournaments ? <Text style={styles.muted}>Loading…</Text> : null}
            {nav.tournaments.map((t) => (
              <Chip key={t.id} label={t.name} active={t.id === tournamentId} onPress={() => setTournamentId(t.id)} />
            ))}
            {!nav.loadingTournaments && nav.tournaments.length === 0 ? (
              <Text style={styles.muted}>No leagues.</Text>
            ) : null}
          </ScrollView>
        </>
      ) : null}

      {/* Events */}
      {tournamentId != null ? (
        <View style={styles.events}>
          {odds.loading ? <Text style={styles.muted}>Loading odds…</Text> : null}
          {odds.error ? <Text style={styles.err}>{odds.error}</Text> : null}
          {!odds.loading && !odds.error && odds.events.length === 0 ? (
            <Text style={styles.muted}>No priced matches in this league right now.</Text>
          ) : null}
          {odds.events.map((event) => {
            const row = odds.rows.find((r) => r.eventId === event.id);
            if (!row) return null;
            const selected = selections[event.id]?.pick;
            return (
              <View key={event.id} style={styles.eventCard}>
                <Text style={styles.fixture}>{event.name}</Text>
                <Text style={styles.kickoff}>{new Date(event.startTime).toLocaleString()}</Text>
                <View style={styles.oddsRow}>
                  {(['1', 'X', '2'] as Pick[]).map((p) => {
                    const dec = p === '1' ? row.decimal.home : p === 'X' ? row.decimal.draw : row.decimal.away;
                    return (
                      <Pressable
                        key={p}
                        onPress={() => togglePick(event, p)}
                        style={({ pressed, hovered }) => [
                          styles.oddsBtn,
                          selected === p && styles.oddsBtnActive,
                          (pressed || (Platform.OS === 'web' && hovered)) && styles.oddsBtnHover,
                        ]}>
                        <Text style={[styles.oddsPick, selected === p && styles.oddsTextActive]}>{p}</Text>
                        <Text style={[styles.oddsVal, selected === p && styles.oddsTextActive]}>{dec.toFixed(2)}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            );
          })}
        </View>
      ) : null}

      {/* Booking code footer */}
      {legs.length > 0 ? (
        <View style={styles.slipBar}>
          <View>
            <Text style={styles.slipLegs}>{legs.length} selection{legs.length > 1 ? 's' : ''}</Text>
            <Text style={styles.slipOdds}>Combined @ {combinedOdds.toFixed(2)}</Text>
          </View>
          <Pressable
            onPress={() => exportSlip(legs.map((s) => s.leg))}
            disabled={exportState.status === 'loading'}
            style={({ pressed, hovered }) => [
              styles.exportBtn,
              (pressed || (Platform.OS === 'web' && hovered)) && styles.exportBtnHover,
              exportState.status === 'loading' && styles.exportBtnDisabled,
            ]}>
            <Text style={styles.exportText}>
              {exportState.status === 'loading' ? 'GENERATING…' : 'GENERATE BOOKING CODE'}
            </Text>
          </Pressable>
        </View>
      ) : null}
      {exportState.status === 'done' ? (
        <Text style={styles.ok}>Booking code {exportState.code} — opening Hollywoodbets…</Text>
      ) : null}
      {exportState.status === 'error' ? <Text style={styles.err}>{exportState.message}</Text> : null}
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed, hovered }) => [
        styles.chip,
        active && styles.chipActive,
        (pressed || (Platform.OS === 'web' && hovered)) && styles.chipHover,
      ]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', maxWidth: 720, alignSelf: 'center' },
  intro: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: theme.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  label: { alignSelf: 'flex-start', marginTop: spacing.md, marginBottom: spacing.sm },
  search: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: theme.textPrimary,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: theme.surface,
    marginBottom: spacing.sm,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}),
  },
  chipRow: { gap: spacing.sm, paddingVertical: spacing.xs },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    backgroundColor: theme.surface,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : {}),
  },
  chipActive: { borderColor: theme.accentGreen, backgroundColor: theme.surfaceMuted },
  chipHover: { opacity: 0.85 },
  chipText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: theme.textMuted },
  chipTextActive: { color: theme.accentGreen },
  events: { width: '100%', marginTop: spacing.md, gap: spacing.sm },
  eventCard: {
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    backgroundColor: theme.surface,
    padding: spacing.md,
  },
  fixture: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: theme.textPrimary },
  kickoff: { fontFamily: fonts.body, fontSize: 12, color: theme.textMuted, marginTop: 2, marginBottom: spacing.sm },
  oddsRow: { flexDirection: 'row', gap: spacing.sm },
  oddsBtn: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: theme.bg,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : {}),
  },
  oddsBtnActive: { borderColor: theme.accentGreen, backgroundColor: theme.accentGreen },
  oddsBtnHover: { opacity: 0.9 },
  oddsPick: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.textMuted },
  oddsVal: { fontFamily: fonts.display, fontSize: 15, color: theme.textPrimary },
  oddsTextActive: { color: theme.bg },
  muted: { fontFamily: fonts.body, fontSize: 13, color: theme.textMuted, paddingVertical: spacing.sm },
  err: { fontFamily: fonts.body, fontSize: 13, color: theme.loss, paddingVertical: spacing.sm },
  ok: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: theme.accentGreen,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  slipBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.lg,
    padding: spacing.md,
    borderWidth: layout.borderWidth,
    borderColor: theme.accentGreen,
    borderRadius: layout.borderRadius,
    backgroundColor: theme.surface,
  },
  slipLegs: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: theme.textPrimary },
  slipOdds: { fontFamily: fonts.display, fontSize: 16, color: theme.accentGreen },
  exportBtn: {
    backgroundColor: theme.accentGreen,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: layout.borderRadius,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : {}),
  },
  exportBtnHover: { opacity: 0.9 },
  exportBtnDisabled: { opacity: 0.5 },
  exportText: { fontFamily: fonts.display, fontSize: 13, color: theme.bg, letterSpacing: 1 },
});
