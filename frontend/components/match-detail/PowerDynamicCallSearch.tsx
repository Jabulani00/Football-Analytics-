import { useMemo, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { SectorIntro } from '@/components/match-detail/PowerDynamicsSectors';
import PowerDynamicFixtureModal from '@/components/match-detail/PowerDynamicFixtureModal';
import SubTabBar from '@/components/shared/SubTabBar';
import {
  getPowerDynamicLibrarySnapshot,
  retryPowerDynamicLibrary,
  scorePowerDynamicLibrary,
  startPowerDynamicLibrary,
  subscribePowerDynamicLibrary,
} from '@/services/powerDynamicCallLibrary';
import { fonts, layout, spacing, theme } from '@/styles/theme';
import type { PowerDynamicHit } from '@/utils/powerDynamicLibraryScore';
import { formatUpcomingDayLabel, todayKey } from '@/utils/dates';
import { POWER_DYNAMIC_CALLS, powerDynamicCall, type PowerDynamicCallDef } from '@/utils/powerDynamicCalls';
import { CALCULATION_CALL } from '@/utils/powerDynamicCalculationCalls';
import { callAspectById, callAspectsFor } from '@/utils/powerDynamicCallSearch';

type InRow = {
  key: string;
  label: string;
  detail: string;
  tickId?: string;
  wrongId?: string;
  plainId?: string;
};

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

export default function PowerDynamicCallSearch({
  heading = true,
  source = 'sectors',
}: {
  heading?: boolean;
  source?: 'sectors' | 'calculations';
}) {
  const calls = useMemo<PowerDynamicCallDef[]>(
    () => (source === 'calculations' ? [CALCULATION_CALL] : POWER_DYNAMIC_CALLS),
    [source],
  );
  const [tabId, setTabId] = useState(source === 'calculations' ? 'calculations' : '');
  const [functionId, setFunctionId] = useState('');
  const [aspectIds, setAspectIds] = useState<string[]>([]);
  const [openHit, setOpenHit] = useState<PowerDynamicHit | null>(null);
  const [query, setQuery] = useState('');
  const [dateKey, setDateKey] = useState(todayKey);
  const [openSectorId, setOpenSectorId] = useState<string | null>(null);
  const library = useSyncExternalStore(
    subscribePowerDynamicLibrary,
    getPowerDynamicLibrarySnapshot,
    getPowerDynamicLibrarySnapshot,
  );
  const dates = library.days;

  const call = tabId ? calls.find((item) => item.id === tabId) ?? powerDynamicCall(tabId) : undefined;
  const groups = useMemo(() => {
    if (!call) return [];
    const options = functionId ? call.functions.filter((item) => item.id === functionId) : call.functions;
    return options
      .map((item) => ({ item, rows: inOptionRows(callAspectsFor(tabId, item.id)) }))
      .filter((group) => group.rows.length > 0);
  }, [call, functionId, tabId]);
  const selected = aspectIds.map((id) => callAspectById(id)).filter((item) => item != null);
  const selectionKey = aspectIds.join('|');
  const selectionGroups = useMemo(() => {
    const bySector = new Map<string, string[]>();
    for (const id of aspectIds) {
      const aspect = callAspectById(id);
      if (!aspect) continue;
      const list = bySector.get(aspect.tabId) ?? [];
      list.push(id);
      bySector.set(aspect.tabId, list);
    }
    const order = calls.map((item) => item.id);
    for (const id of bySector.keys()) if (!order.includes(id)) order.push(id);
    return order
      .filter((id) => bySector.has(id))
      .map((sectorId) => {
        const ids = bySector.get(sectorId) ?? [];
        const def = calls.find((item) => item.id === sectorId) ?? powerDynamicCall(sectorId);
        const byOption = new Map<string, { id: string; label: string }[]>();
        for (const id of ids) {
          const aspect = callAspectById(id);
          if (!aspect) continue;
          const list = byOption.get(aspect.functionId) ?? [];
          list.push({ id, label: aspectCaption(id) });
          byOption.set(aspect.functionId, list);
        }
        const optionOrder = def?.functions.map((item) => item.id) ?? [];
        for (const id of byOption.keys()) if (!optionOrder.includes(id)) optionOrder.push(id);
        const options = optionOrder
          .filter((id) => byOption.has(id))
          .map((functionId) => ({
            functionId,
            label: def?.functions.find((item) => item.id === functionId)?.label ?? functionId,
            aspects: byOption.get(functionId) ?? [],
          }));
        return {
          sectorId,
          sectorName: def?.name ?? sectorId,
          ids,
          options,
        };
      });
  }, [aspectIds, calls]);
  const clearSector = (sectorId: string) => {
    setAspectIds((current) => current.filter((id) => callAspectById(id)?.tabId !== sectorId));
  };
  const clearOption = (sectorId: string, functionId: string) => {
    setAspectIds((current) => current.filter((id) => {
      const aspect = callAspectById(id);
      return aspect?.tabId !== sectorId || aspect.functionId !== functionId;
    }));
  };
  const clearInOption = (aspectId: string) => {
    setAspectIds((current) => current.filter((id) => id !== aspectId));
  };
  const sectorHits = useMemo(() => {
    if (library.phase !== 'ready') return [];
    return selectionGroups.map((group) => ({
      ...group,
      hits: scorePowerDynamicLibrary(group.ids, dateKey).filter((hit) => hit.percent > 0),
    }));
  }, [library.phase, library.revision, selectionKey, dateKey, selectionGroups]);
  const needle = query.trim().toLowerCase();
  const visibleGroups = groups
    .map((group) => ({
      ...group,
      rows: needle ? group.rows.filter((row) => row.label.toLowerCase().includes(needle)) : group.rows,
    }))
    .filter((group) => group.rows.length > 0);
  const inOptionCount = groups.reduce((sum, group) => sum + group.rows.length, 0);
  const hasMarks = groups.some((group) => group.rows.some((row) => row.tickId));

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

      <View>
        {source === 'calculations' ? null : (
          <>
            <SectorIntro title="Sector" note="Open any sector. In-options you already ticked in other sectors stay selected, and each sector keeps its own fixtures." />
            <SubTabBar
              tabs={calls.map((item) => ({ id: item.id, label: `${item.index}. ${item.name}` }))}
              active={tabId}
              onChange={(id) => {
                setTabId(id);
                setFunctionId('');
                setQuery('');
              }}
            />
          </>
        )}

        {selectionGroups.length > 0 ? (
          <View style={styles.tracker}>
            <Text style={styles.trackerTitle}>Selected</Text>
            <View style={styles.sectorTabs}>
              {selectionGroups.map((group) => {
                const open = openSectorId === group.sectorId;
                const share = `${100 / selectionGroups.length}%`;
                return (
                  <View
                    key={group.sectorId}
                    style={[styles.sectorTab, open && styles.sectorTabOn, { width: share, maxWidth: share }]}>
                    <Pressable
                      onPress={() => setOpenSectorId(open ? null : group.sectorId)}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: open }}
                      accessibilityLabel={`${open ? 'Collapse' : 'Open'} ${group.sectorName}`}
                      style={styles.sectorTabMain}>
                      <Text
                        numberOfLines={1}
                        ellipsizeMode="tail"
                        style={[
                          styles.sectorTabText,
                          open && styles.sectorTabTextOn,
                          { fontSize: selectionGroups.length > 8 ? 9 : selectionGroups.length > 4 ? 10 : 12 },
                        ]}>
                        {group.sectorName}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        clearSector(group.sectorId);
                        if (open) setOpenSectorId(null);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${group.sectorName}`}
                      style={styles.sectorTabX}>
                      <Text style={[styles.sectorTabXText, open && styles.sectorTabTextOn]}>×</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
            {selectionGroups.filter((group) => group.sectorId === openSectorId).map((group) => (
              <View key={group.sectorId}>
                <View style={styles.trackerRow}>
                  <Text style={styles.trackerSector}>{group.sectorName}</Text>
                  <Pressable
                    onPress={() => {
                      clearSector(group.sectorId);
                      setOpenSectorId(null);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Clear ${group.sectorName}`}
                    style={styles.clearBtn}>
                    <Text style={styles.clearText}>Clear sector</Text>
                  </Pressable>
                </View>
                {group.options.map((option) => (
                  <View key={option.functionId}>
                    <View style={[styles.trackerRow, styles.optionRow]}>
                      <Text style={styles.kindOption}>Option</Text>
                      <Text style={styles.optionLabel}>{option.label}</Text>
                      <Pressable
                        onPress={() => clearOption(group.sectorId, option.functionId)}
                        accessibilityRole="button"
                        accessibilityLabel={`Clear option ${option.label}`}
                        style={styles.clearBtn}>
                        <Text style={styles.clearText}>Clear option</Text>
                      </Pressable>
                    </View>
                    {option.aspects.map((aspect) => (
                      <View key={aspect.id} style={[styles.trackerRow, styles.inTrackRow]}>
                        <Text style={styles.kindIn}>In-option</Text>
                        <Text style={styles.inTrackLabel}>{aspect.label}</Text>
                        <Pressable
                          onPress={() => clearInOption(aspect.id)}
                          accessibilityRole="button"
                          accessibilityLabel={`Clear in-option ${aspect.label}`}
                          style={styles.clearBtn}>
                          <Text style={styles.clearText}>Clear</Text>
                        </Pressable>
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            ))}
          </View>
        ) : null}

        {call ? (
          <>
            <SectorIntro title={source === 'calculations' ? 'Calculation' : 'Option'} note={call.detail} />
            <SubTabBar
              tabs={[{ id: '', label: 'All options' }, ...call.functions.map((item) => ({ id: item.id, label: item.label }))]}
              active={functionId}
              onChange={(id) => {
                setFunctionId(id);
                setQuery('');
              }}
            />
            <SectorIntro
              title={source === 'calculations' ? `Call · ${inOptionCount}` : `In-option · ${inOptionCount}`}
              note={`${hasMarks ? 'A tick means the call holds. A cross means the same call does not. ' : ''}Select any number. In one sector, a fixture is called only when every selected in-option holds. Each sector keeps its own fixtures.${aspectIds.length > 0 ? ` ${aspectIds.length} selected.` : ''}`}
            />
            {inOptionCount > 8 ? (
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Find an in-option"
                placeholderTextColor={theme.textFaint}
                style={styles.search}
              />
            ) : null}
            <View style={styles.inSheet}>
              <ScrollView style={styles.inScroll} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                {visibleGroups.length === 0 ? <Text style={styles.emptyIn}>No in-option matches that search.</Text> : null}
                {visibleGroups.map((group) => (
                  <View key={group.item.id}>
                    <View style={styles.sectionBar}>
                      <Text style={styles.kindOption}>Option</Text>
                      <Text style={styles.section}>{group.item.label}</Text>
                      {group.rows.some((row) => row.tickId) ? (
                        <View style={styles.marks}>
                          <Text style={styles.markHead}>True</Text>
                          <Text style={styles.markHead}>Opposite</Text>
                        </View>
                      ) : null}
                    </View>
                    {group.rows.map((row) => {
                      const plainOn = row.plainId != null && aspectIds.includes(row.plainId);
                      const tickOn = row.tickId != null && aspectIds.includes(row.tickId);
                      const wrongOn = row.wrongId != null && aspectIds.includes(row.wrongId);
                      if (row.plainId) {
                        return (
                          <Pressable
                            key={row.key}
                            onPress={() => setAspectIds((current) => toggleId(current, row.plainId ?? ''))}
                            style={[styles.inRow, plainOn && styles.inRowOn]}>
                            <Text style={styles.kindIn}>In-option</Text>
                            <Text style={[styles.inLabel, plainOn && styles.inLabelOn]}>{row.label}</Text>
                          </Pressable>
                        );
                      }
                      return (
                        <View key={row.key} style={[styles.inRow, (tickOn || wrongOn) && styles.inRowOn]}>
                          <Text style={styles.kindIn}>In-option</Text>
                          <Text style={[styles.inLabel, (tickOn || wrongOn) && styles.inLabelOn]}>{row.label}</Text>
                          <View style={styles.marks}>
                            <Pressable
                              onPress={() => row.tickId && setAspectIds((current) => toggleId(current, row.tickId ?? ''))}
                              style={[styles.mark, tickOn && styles.markTick]}
                              accessibilityLabel={`${row.label} true`}>
                              <Text style={[styles.markGlyph, tickOn && styles.markGlyphTick]}>✓</Text>
                            </Pressable>
                            <Pressable
                              onPress={() => row.wrongId && setAspectIds((current) => toggleId(current, row.wrongId ?? ''))}
                              style={[styles.mark, wrongOn && styles.markWrong]}
                              accessibilityLabel={`${row.label} opposite`}>
                              <Text style={[styles.markGlyph, wrongOn && styles.markGlyphWrong]}>✗</Text>
                            </Pressable>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                ))}
              </ScrollView>
            </View>
          </>
        ) : (
          <Text style={styles.hint}>Choose a sector to open its options.</Text>
        )}
      </View>

      {selected.length > 0 ? (
        <View style={styles.stage}>
          <SectorIntro
            title="Day"
            note={selectionGroups.map((group) => group.sectorName).join(' · ')}
          />
          <SubTabBar
            tabs={dates.map((key) => ({ id: key, label: formatUpcomingDayLabel(key) }))}
            active={dateKey}
            onChange={setDateKey}
          />
        </View>
      ) : null}

      {library.phase !== 'ready' && selected.length > 0 ? (
        <Text style={styles.readyNote}>This selection is kept. Results show when the leagues are ready.</Text>
      ) : null}

      {library.phase === 'ready' && sectorHits.length > 0 ? (
        <View style={styles.list}>
          {sectorHits.map((group) => (
            <View key={group.sectorId} style={styles.sectorBlock}>
              <View style={styles.banner}>
                <Text style={styles.bannerText}>{group.sectorName}</Text>
                <Text style={styles.bannerCount}>
                  {group.hits.length} fixture{group.hits.length === 1 ? '' : 's'}
                </Text>
              </View>
              {group.hits.length === 0 ? <Text style={styles.empty}>No fixture matches this sector.</Text> : null}
              {group.hits.slice(0, 250).map((hit, index) => {
                const [home, away] = hit.name.split(' vs ');
                return (
                  <Pressable
                    key={`${group.sectorId}-${hit.fixtureId}-${hit.aspectId}`}
                    onPress={() => setOpenHit(hit)}
                    style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${hit.name}, ${group.sectorName}, ${hit.aspectLabel}`}
                  >
                    <Text style={styles.cardIndex}>{index + 1}</Text>
                    <View style={styles.cardBody}>
                      <Text style={styles.belongs} numberOfLines={2}>{group.sectorName} · {hit.aspectLabel}</Text>
                      <Text style={styles.home} numberOfLines={1}>{home || hit.name}</Text>
                      {away ? <Text style={styles.away} numberOfLines={1}>{away}</Text> : null}
                      <Text style={styles.meta} numberOfLines={1}>
                        {hit.country} · {hit.league} · {hit.when}
                      </Text>
                      <Text style={styles.reason} numberOfLines={4}>{hit.reason}</Text>
                    </View>
                  </Pressable>
                );
              })}
              {group.hits.length > 250 ? (
                <Text style={styles.more}>Showing the first 250 fixtures in {group.sectorName}.</Text>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
      {openHit ? <PowerDynamicFixtureModal hit={openHit} onClose={() => setOpenHit(null)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 16,
    color: theme.textPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
  },
  hint: { fontFamily: fonts.bodyMedium, fontSize: 13, color: theme.textPrimary, opacity: 0.85 },
  search: {
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    fontFamily: fonts.body,
    fontSize: 14,
    color: theme.textPrimary,
    backgroundColor: theme.surface,
    marginBottom: spacing.sm,
  },
  inSheet: {
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    overflow: 'hidden',
    backgroundColor: theme.surface,
    marginBottom: spacing.sm,
  },
  inScroll: { maxHeight: 380 },
  sectionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(124, 58, 237, 0.1)',
    borderLeftWidth: 3,
    borderLeftColor: theme.accentPurple,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
  },
  section: { flex: 1, fontFamily: fonts.bodySemiBold, fontSize: 14, color: theme.textPrimary },
  kindOption: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    letterSpacing: 0.3,
    color: theme.accentPurple,
    backgroundColor: 'rgba(124, 58, 237, 0.14)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  kindIn: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    letterSpacing: 0.3,
    color: theme.accentBlue,
    backgroundColor: 'rgba(37, 99, 235, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  inRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    borderBottomWidth: layout.borderWidth,
    borderBottomColor: theme.border,
  },
  inRowOn: { backgroundColor: 'rgba(5, 150, 105, 0.08)' },
  inLabel: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 18, color: theme.textPrimary },
  inLabelOn: { fontFamily: fonts.bodySemiBold, color: theme.accentGreen },
  marks: { width: 92, flexDirection: 'row', justifyContent: 'flex-end', gap: 6 },
  markHead: { width: 40, textAlign: 'center', fontFamily: fonts.bodyMedium, fontSize: 10, color: theme.textMuted },
  mark: {
    width: 40,
    height: 32,
    borderRadius: layout.borderRadius,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markTick: { borderColor: theme.accentGreen, backgroundColor: 'rgba(5, 150, 105, 0.14)' },
  markWrong: { borderColor: theme.loss, backgroundColor: 'rgba(220, 38, 38, 0.1)' },
  markGlyph: { fontSize: 16, color: theme.textMuted, fontFamily: fonts.bodySemiBold },
  markGlyphTick: { color: theme.accentGreen },
  markGlyphWrong: { color: theme.loss },
  emptyIn: { fontFamily: fonts.body, fontSize: 13, color: theme.textMuted, padding: spacing.md },
  tracker: {
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    backgroundColor: theme.surface,
    marginBottom: spacing.sm,
  },
  trackerTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: theme.textMuted,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  sectorTabs: {
    flexDirection: 'row',
    alignItems: 'stretch',
    width: '100%',
    paddingHorizontal: spacing.xs,
    paddingBottom: spacing.sm,
  },
  sectorTab: {
    minWidth: 0,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    backgroundColor: theme.surfaceMuted,
  },
  sectorTabMain: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 8,
    paddingLeft: 4,
    paddingRight: 2,
  },
  sectorTabX: {
    flexShrink: 0,
    width: 22,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectorTabXText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    lineHeight: 16,
    color: theme.textMuted,
  },
  sectorTabOn: {
    borderColor: theme.accentGreen,
    backgroundColor: 'rgba(5, 150, 105, 0.14)',
  },
  sectorTabText: {
    width: '100%',
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: theme.textPrimary,
    textAlign: 'center',
  },
  sectorTabTextOn: { color: theme.accentGreen },
  trackerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: layout.borderWidth,
    borderTopColor: theme.border,
  },
  trackerBody: { flex: 1, minWidth: 0 },
  trackerSector: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.textPrimary },
  optionRow: { backgroundColor: 'rgba(124, 58, 237, 0.06)', paddingLeft: spacing.md },
  optionLabel: { flex: 1, fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.accentPurple },
  inTrackRow: { backgroundColor: 'rgba(37, 99, 235, 0.05)', paddingLeft: spacing.lg },
  inTrackLabel: { flex: 1, fontFamily: fonts.body, fontSize: 12, lineHeight: 16, color: theme.textPrimary },
  clearBtn: {
    flexShrink: 0,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    backgroundColor: theme.surface,
  },
  clearText: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: theme.loss },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    backgroundColor: 'rgba(5, 150, 105, 0.12)',
    borderLeftWidth: 3,
    borderLeftColor: theme.accentGreen,
    borderRadius: layout.borderRadius,
    paddingVertical: 8,
    paddingHorizontal: spacing.sm,
  },
  bannerText: { flex: 1, fontFamily: fonts.bodySemiBold, fontSize: 14, color: theme.textPrimary },
  bannerCount: { fontFamily: fonts.bodyMedium, fontSize: 12, color: theme.textMuted },
  sectorBlock: { gap: spacing.sm },
  stage: { marginTop: spacing.xs },
  progress: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  progressText: { fontFamily: fonts.body, fontSize: 13, color: theme.textMuted, flex: 1 },
  readyNote: { fontFamily: fonts.bodyMedium, fontSize: 13, color: theme.textPrimary, opacity: 0.85, marginBottom: spacing.sm },
  error: { fontFamily: fonts.body, fontSize: 13, color: theme.loss, marginBottom: spacing.sm },
  list: { gap: spacing.sm },
  count: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.textMuted },
  empty: { fontFamily: fonts.body, fontSize: 13, color: theme.textMuted },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: theme.surface,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    padding: spacing.sm,
  },
  cardPressed: { backgroundColor: theme.surfaceHover },
  cardIndex: { width: 22, fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.textMuted, paddingTop: 2 },
  cardBody: { flex: 1, minWidth: 0 },
  belongs: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: theme.accentGreen, marginBottom: 2 },
  home: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: theme.textPrimary },
  away: { fontFamily: fonts.bodyMedium, fontSize: 14, color: theme.textPrimary, marginTop: 1 },
  meta: { fontFamily: fonts.bodyMedium, fontSize: 12, color: theme.textPrimary, opacity: 0.75, marginTop: 4 },
  reason: { fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 18, color: theme.textPrimary, marginTop: 4 },
  more: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16, color: theme.textMuted },
});
