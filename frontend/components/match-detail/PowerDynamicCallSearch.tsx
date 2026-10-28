import { useMemo, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  getPowerDynamicLibrarySnapshot,
  retryPowerDynamicLibrary,
  scorePowerDynamicLibrary,
  startPowerDynamicLibrary,
  subscribePowerDynamicLibrary,
} from '@/services/powerDynamicCallLibrary';
import PowerDynamicFixtureModal from '@/components/match-detail/PowerDynamicFixtureModal';
import { fonts, layout, spacing, theme } from '@/styles/theme';
import type { PowerDynamicHit } from '@/utils/powerDynamicLibraryScore';
import { formatUpcomingDayLabel, parseDateKey, todayKey } from '@/utils/dates';
import { POWER_DYNAMIC_CALLS, powerDynamicCall } from '@/utils/powerDynamicCalls';
import { callAspectById, callAspectsFor } from '@/utils/powerDynamicCallSearch';

type InRow = {
  key: string;
  label: string;
  detail: string;
  tickId?: string;
  wrongId?: string;
  plainId?: string;
};

const PERCENT_STEPS = Array.from({ length: 11 }, (_, index) => index * 10);

function dayCard(key: string): { kicker: string; day: string; month: string } {
  const date = parseDateKey(key);
  return {
    kicker: formatUpcomingDayLabel(key),
    day: String(date.getDate()),
    month: date.toLocaleDateString('en-GB', { month: 'short' }),
  };
}

function inOptionRows(aspects: { id: string; label: string; detail: string; mark?: 'tick' | 'wrong' }[]): InRow[] {
  const rows: InRow[] = [];
  const index = new Map<string, InRow>();
  for (const item of aspects) {
    const base = item.id.replace(/::(tick|wrong)$/, '');
    if (item.mark === 'tick' || item.mark === 'wrong') {
      let row = index.get(base);
      if (!row) {
        row = { key: base, label: item.label, detail: item.detail };
        index.set(base, row);
        rows.push(row);
      }
      if (item.mark === 'tick') row.tickId = item.id;
      else row.wrongId = item.id;
      continue;
    }
    rows.push({ key: item.id, label: item.label, detail: item.detail, plainId: item.id });
  }
  return rows;
}

function bandColor(percent: number): string {
  if (percent >= 80) return theme.accentGreen;
  if (percent >= 40) return theme.yellow;
  return theme.loss;
}

function aspectCaption(id: string): string {
  const aspect = callAspectById(id);
  if (!aspect) return id;
  if (aspect.mark === 'tick') return `${aspect.label} · true`;
  if (aspect.mark === 'wrong') return `${aspect.label} · opposite`;
  return aspect.label;
}

function toggleId(current: string[], id: string): string[] {
  return current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
}

export default function PowerDynamicCallSearch({ heading = true }: { heading?: boolean }) {
  const [tabId, setTabId] = useState('');
  const [functionId, setFunctionId] = useState('');
  const [aspectIds, setAspectIds] = useState<string[]>([]);
  const [openHit, setOpenHit] = useState<PowerDynamicHit | null>(null);
  const [minPct, setMinPct] = useState(0);
  const [maxPct, setMaxPct] = useState(100);
  const [query, setQuery] = useState('');
  const [dateKey, setDateKey] = useState(todayKey);
  const library = useSyncExternalStore(
    subscribePowerDynamicLibrary,
    getPowerDynamicLibrarySnapshot,
    getPowerDynamicLibrarySnapshot,
  );
  const dates = library.days;

  const call = tabId ? powerDynamicCall(tabId) : undefined;
  const aspects = call && functionId ? callAspectsFor(tabId, functionId) : [];
  const selected = aspectIds.map((id) => callAspectById(id)).filter((item) => item != null);
  const selectionKey = aspectIds.join('|');
  const rows = useMemo(() => inOptionRows(aspects), [aspects]);
  const hits = useMemo(() => {
    if (library.phase !== 'ready' || aspectIds.length === 0) return [];
    return scorePowerDynamicLibrary(aspectIds, dateKey);
  }, [library.phase, library.revision, selectionKey, dateKey, aspectIds]);
  const hasMarks = rows.some((row) => row.tickId);
  const needle = query.trim().toLowerCase();
  const visibleRows = needle ? rows.filter((row) => row.label.toLowerCase().includes(needle)) : rows;

  const floor = Math.min(minPct, maxPct);
  const ceiling = Math.max(minPct, maxPct);
  const shown = hits.filter((hit) => hit.percent >= floor && hit.percent <= ceiling);
  const option = call?.functions.find((item) => item.id === functionId);

  return (
    <View>
      {heading ? <Text style={styles.title}>Call</Text> : null}
      {library.phase === 'loading' ? (
        <View style={styles.progress}>
          <ActivityIndicator color={theme.accentGreen} />
          <Text style={styles.progressText}>
            {library.hold === 'saved'
              ? 'Opening the leagues saved in this browser.'
              : library.total > 0
                ? `Preparing leagues ${library.done} of ${library.total}. This stays in the browser when it finishes.`
                : 'Preparing leagues. This stays in the browser when it finishes.'}
          </Text>
        </View>
      ) : library.phase === 'error' ? (
        <Pressable onPress={() => { retryPowerDynamicLibrary(); startPowerDynamicLibrary(); }}>
          <Text style={styles.error}>{library.error} Tap to try again.</Text>
        </Pressable>
      ) : (
        <Text style={styles.readyNote}>
          {library.stored
            ? 'Leagues are saved in this browser. A refresh opens this copy and does not load them again.'
            : 'Leagues are ready for this visit. This browser could not keep a copy, so a refresh loads them again.'}
        </Text>
      )}

      <View style={styles.board}>
        <Text style={styles.step}>01  Sector</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sectorRow}>
          {POWER_DYNAMIC_CALLS.map((item) => {
            const active = item.id === tabId;
            return (
              <Pressable
                key={item.id}
                onPress={() => {
                  setTabId(item.id);
                  setFunctionId('');
                  setAspectIds([]);
                  setQuery('');
                }}
                style={[styles.sector, active && styles.sectorOn]}>
                <Text style={[styles.sectorIndex, active && styles.sectorIndexOn]}>{item.index}</Text>
                <Text style={[styles.sectorName, active && styles.sectorNameOn]}>{item.name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {call ? (
          <>
            <Text style={styles.step}>02  Option</Text>
            <View style={styles.pills}>
              {call.functions.map((item) => {
                const active = item.id === functionId;
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => {
                      setFunctionId(item.id);
                      setAspectIds([]);
                      setQuery('');
                    }}
                    style={[styles.pill, active && styles.pillOn]}>
                    <Text style={[styles.pillText, active && styles.pillTextOn]}>{item.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : (
          <Text style={styles.hint}>Choose a sector to open its options.</Text>
        )}

        {functionId ? (
          <>
            <View style={styles.inTitle}>
              <Text style={styles.step}>03  In-option</Text>
              <Text style={styles.inCount}>{rows.length}</Text>
            </View>
            <Text style={styles.markNote}>
              {hasMarks ? 'A tick means the call holds. A cross means the same call does not. ' : ''}
              Select any number. The closest fits stay at the top, and each result names its in-option.
              {aspectIds.length > 0 ? ` ${aspectIds.length} selected.` : ''}
            </Text>
            {rows.length > 8 ? (
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Find an in-option"
                placeholderTextColor={theme.textFaint}
                style={styles.search}
              />
            ) : null}
            <View style={styles.inSheet}>
              {hasMarks ? (
                <View style={styles.inHead}>
                  <Text style={styles.inHeadLabel}>{option?.label}</Text>
                  <View style={styles.marks}>
                    <Text style={styles.markHead}>True</Text>
                    <Text style={styles.markHead}>Opposite</Text>
                  </View>
                </View>
              ) : null}
              <ScrollView style={styles.inScroll} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                {visibleRows.length === 0 ? <Text style={styles.emptyIn}>No in-option matches that search.</Text> : null}
                {visibleRows.map((row) => {
                  const plainOn = row.plainId != null && aspectIds.includes(row.plainId);
                  const tickOn = row.tickId != null && aspectIds.includes(row.tickId);
                  const wrongOn = row.wrongId != null && aspectIds.includes(row.wrongId);
                  if (row.plainId) {
                    return (
                      <Pressable
                        key={row.key}
                        onPress={() => setAspectIds((current) => toggleId(current, row.plainId ?? ''))}
                        style={[styles.inRow, plainOn && styles.inRowOn]}>
                        <Text style={[styles.inLabel, plainOn && styles.inLabelOn]}>{row.label}</Text>
                      </Pressable>
                    );
                  }
                  return (
                    <View key={row.key} style={[styles.inRow, (tickOn || wrongOn) && styles.inRowOn]}>
                      <Text style={[styles.inLabel, (tickOn || wrongOn) && styles.inLabelOn]}>{row.label}</Text>
                      <View style={styles.marks}>
                        <Pressable
                          onPress={() => row.tickId && setAspectIds((current) => toggleId(current, row.tickId ?? ''))}
                          style={[styles.mark, tickOn && styles.markTick]}
                          accessibilityLabel={`${row.label} true`}>
                          <Text style={[styles.markGlyph, tickOn && styles.markGlyphOn]}>✓</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => row.wrongId && setAspectIds((current) => toggleId(current, row.wrongId ?? ''))}
                          style={[styles.mark, wrongOn && styles.markWrong]}
                          accessibilityLabel={`${row.label} opposite`}>
                          <Text style={[styles.markGlyph, wrongOn && styles.markGlyphOn]}>✗</Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          </>
        ) : null}
      </View>

      {selected.length > 0 ? (
        <View style={styles.stage}>
          <Text style={styles.path}>
            {call?.name} · {option?.label} · {selected.length === 1 ? aspectCaption(selected[0].id) : `${selected.length} in-options`}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dates}>
            {dates.map((key) => {
              const active = key === dateKey;
              const card = dayCard(key);
              return (
                <Pressable key={key} onPress={() => setDateKey(key)} style={[styles.day, active && styles.dayOn]}>
                  <Text style={[styles.dayKicker, active && styles.dayKickerOn]}>{card.kicker}</Text>
                  <Text style={[styles.dayNum, active && styles.dayNumOn]}>{card.day}</Text>
                  <Text style={[styles.dayMonth, active && styles.dayKickerOn]}>{card.month}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.fit}>
            <View style={styles.fitCol}>
              <Text style={styles.fitLabel}>From {floor}%</Text>
              <View style={styles.ruler}>
                {PERCENT_STEPS.map((step) => {
                  const on = step === floor;
                  return (
                    <Pressable key={`from-${step}`} onPress={() => setMinPct(step)} style={[styles.stepChip, on && styles.stepChipOn]}>
                      <Text style={[styles.stepChipText, on && styles.stepChipTextOn]}>{step}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            <View style={styles.fitCol}>
              <Text style={styles.fitLabel}>To {ceiling}%</Text>
              <View style={styles.ruler}>
                {PERCENT_STEPS.map((step) => {
                  const on = step === ceiling;
                  return (
                    <Pressable key={`to-${step}`} onPress={() => setMaxPct(step)} style={[styles.stepChip, on && styles.stepChipOn]}>
                      <Text style={[styles.stepChipText, on && styles.stepChipTextOn]}>{step}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>
        </View>
      ) : null}

      {library.phase !== 'ready' && selected.length > 0 ? (
        <Text style={styles.readyNote}>This selection is kept. Results show when the leagues are ready.</Text>
      ) : null}

      {library.phase === 'ready' && selected.length > 0 ? (
        <View style={styles.list}>
          <Text style={styles.count}>
            {shown.length} result{shown.length === 1 ? '' : 's'} from {floor}% to {ceiling}%, closest first
          </Text>
          {shown.length === 0 ? <Text style={styles.empty}>No fixture in this percentage band.</Text> : null}
          {shown.slice(0, 250).map((hit, index) => {
            const [home, away] = hit.name.split(' vs ');
            return (
              <Pressable
                key={`${hit.fixtureId}-${hit.aspectId}`}
                onPress={() => setOpenHit(hit)}
                style={({ pressed }) => [styles.ticket, pressed && styles.ticketPressed]}
                accessibilityRole="button"
                accessibilityLabel={`Open ${hit.name}, ${hit.aspectLabel}`}
              >
                <View style={[styles.ticketBar, { backgroundColor: bandColor(hit.percent) }]} />
                <Text style={styles.place}>{index + 1}</Text>
                <View style={styles.identity}>
                  <Text style={styles.belongs} numberOfLines={2}>{hit.aspectLabel}</Text>
                  <Text style={styles.home} numberOfLines={1}>{home || hit.name}</Text>
                  {away ? <Text style={styles.away} numberOfLines={1}>{away}</Text> : null}
                  <Text style={styles.meta} numberOfLines={1}>
                    {hit.country} · {hit.league} · {hit.when}
                  </Text>
                  <Text style={styles.reason} numberOfLines={2}>{hit.reason}</Text>
                </View>
                <View style={styles.scoreBox}>
                  <Text style={[styles.percent, { color: bandColor(hit.percent) }]}>{hit.percent}</Text>
                  <Text style={styles.percentUnit}>%</Text>
                </View>
              </Pressable>
            );
          })}
          {shown.length > 250 ? (
            <Text style={styles.more}>Showing the first 250 fixtures in this band. Tighten the percentage to see a shorter list.</Text>
          ) : null}
        </View>
      ) : null}
      {openHit ? <PowerDynamicFixtureModal hit={openHit} onClose={() => setOpenHit(null)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontFamily: fonts.display,
    fontSize: 22,
    color: theme.textPrimary,
    marginBottom: spacing.sm,
  },
  board: {
    backgroundColor: theme.surface,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: 12,
    padding: spacing.md,
    gap: spacing.sm,
  },
  step: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    letterSpacing: 1.1,
    color: theme.textMuted,
    textTransform: 'uppercase',
    marginTop: spacing.xs,
  },
  sectorRow: { gap: spacing.sm, paddingVertical: spacing.xs },
  sector: {
    width: 148,
    minHeight: 84,
    padding: spacing.sm,
    borderRadius: 10,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    backgroundColor: theme.bg,
    justifyContent: 'space-between',
  },
  sectorOn: {
    borderColor: theme.accentGreen,
    backgroundColor: '#ECFDF5',
  },
  sectorIndex: {
    fontFamily: fonts.display,
    fontSize: 18,
    color: theme.textFaint,
  },
  sectorIndexOn: { color: theme.accentGreen },
  sectorName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    lineHeight: 18,
    color: theme.textPrimary,
  },
  sectorNameOn: { color: theme.textPrimary },
  hint: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: theme.textMuted,
    marginBottom: spacing.xs,
  },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    backgroundColor: theme.bg,
  },
  pillOn: { borderColor: theme.accentGreen, backgroundColor: theme.accentGreen },
  pillText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: theme.textPrimary },
  pillTextOn: { color: '#FFFFFF', fontFamily: fonts.bodySemiBold },
  inTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  inCount: {
    fontFamily: fonts.display,
    fontSize: 16,
    color: theme.textMuted,
  },
  markNote: {
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 16,
    color: theme.textMuted,
  },
  search: {
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    fontFamily: fonts.body,
    fontSize: 14,
    color: theme.textPrimary,
    backgroundColor: theme.bg,
  },
  inSheet: {
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: theme.bg,
  },
  inHead: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderBottomWidth: layout.borderWidth,
    borderBottomColor: theme.border,
    backgroundColor: theme.surface,
  },
  inHeadLabel: {
    flex: 1,
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: theme.textFaint,
  },
  inScroll: { maxHeight: 380 },
  inRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    borderBottomWidth: layout.borderWidth,
    borderBottomColor: theme.border,
  },
  inRowOn: { backgroundColor: '#F0FDF4' },
  inLabel: { flex: 1, fontFamily: fonts.body, fontSize: 14, lineHeight: 18, color: theme.textPrimary },
  inLabelOn: { fontFamily: fonts.bodySemiBold },
  marks: { width: 92, flexDirection: 'row', justifyContent: 'flex-end', gap: 6 },
  markHead: { width: 40, textAlign: 'center', fontFamily: fonts.bodyMedium, fontSize: 10, color: theme.textFaint },
  mark: {
    width: 40,
    height: 32,
    borderRadius: 8,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markTick: { backgroundColor: theme.accentGreen, borderColor: theme.accentGreen },
  markWrong: { backgroundColor: theme.loss, borderColor: theme.loss },
  markGlyph: { fontSize: 16, color: theme.textMuted, fontFamily: fonts.bodySemiBold },
  markGlyphOn: { color: '#FFFFFF' },
  emptyIn: { fontFamily: fonts.body, fontSize: 13, color: theme.textMuted, padding: spacing.md },
  stage: { marginTop: spacing.md, gap: spacing.sm },
  path: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    lineHeight: 20,
    color: theme.textPrimary,
  },
  dates: { gap: spacing.sm, paddingVertical: spacing.xs },
  day: {
    width: 76,
    paddingVertical: spacing.sm,
    borderRadius: 10,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    alignItems: 'center',
  },
  dayOn: { borderColor: theme.accentGreen, backgroundColor: '#ECFDF5' },
  dayKicker: { fontFamily: fonts.bodyMedium, fontSize: 10, color: theme.textMuted },
  dayKickerOn: { color: theme.accentGreen },
  dayNum: { fontFamily: fonts.display, fontSize: 22, color: theme.textPrimary, lineHeight: 26 },
  dayNumOn: { color: theme.accentGreen },
  dayMonth: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted },
  fit: { gap: spacing.sm },
  fitCol: { gap: 4 },
  fitLabel: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: theme.textMuted },
  ruler: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  stepChip: {
    minWidth: 36,
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 6,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    alignItems: 'center',
  },
  stepChipOn: { backgroundColor: theme.textPrimary, borderColor: theme.textPrimary },
  stepChipText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: theme.textMuted },
  stepChipTextOn: { color: '#FFFFFF' },
  progress: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  progressText: { fontFamily: fonts.body, fontSize: 13, color: theme.textMuted, flex: 1 },
  readyNote: { fontFamily: fonts.body, fontSize: 12, color: theme.textMuted, marginBottom: spacing.sm },
  error: { fontFamily: fonts.body, fontSize: 13, color: theme.loss, marginBottom: spacing.sm },
  list: { marginTop: spacing.sm, gap: spacing.sm },
  count: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: theme.textMuted },
  empty: { fontFamily: fonts.body, fontSize: 13, color: theme.textMuted },
  ticket: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: theme.surface,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: 12,
    overflow: 'hidden',
  },
  ticketPressed: { backgroundColor: theme.surfaceHover },
  ticketBar: { width: 5 },
  place: {
    width: 36,
    textAlign: 'center',
    textAlignVertical: 'center',
    fontFamily: fonts.display,
    fontSize: 16,
    color: theme.textFaint,
    paddingTop: spacing.md,
  },
  identity: { flex: 1, minWidth: 0, paddingVertical: spacing.sm, paddingRight: spacing.sm },
  belongs: {
    alignSelf: 'flex-start',
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    lineHeight: 15,
    color: theme.accentGreen,
    backgroundColor: '#ECFDF5',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginBottom: 4,
  },
  home: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: theme.textPrimary },
  away: { fontFamily: fonts.body, fontSize: 14, color: theme.textPrimary, marginTop: 1 },
  meta: { fontFamily: fonts.body, fontSize: 12, color: theme.textMuted, marginTop: 4 },
  reason: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16, color: theme.textPrimary, marginTop: 4 },
  scoreBox: {
    width: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: layout.borderWidth,
    borderLeftColor: theme.border,
  },
  percent: { fontFamily: fonts.display, fontSize: 26, lineHeight: 28 },
  percentUnit: { fontFamily: fonts.bodyMedium, fontSize: 11, color: theme.textFaint },
  more: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16, color: theme.textMuted },
});
