import { useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import FilterDropdown from '@/components/shared/FilterDropdown';
import { fonts, layout, spacing, theme } from '@/styles/theme';
import {
  ALL_POWER_FUNCTIONS,
  POWER_DYNAMIC_CALLS,
  powerDynamicCall,
  powerDynamicFunction,
} from '@/utils/powerDynamicCalls';
import { colourWord, type SideSnapshot, type TableColour } from '@/utils/powerDynamicsEngine';

const COLOUR_HEX: Record<TableColour, string> = {
  green: '#16A34A',
  yellow: '#CA8A04',
  red: '#DC2626',
};

type SideId = 't1' | 't2';

type SidePick = { tabId: string; functionId: string };

const EMPTY_PICK: SidePick = { tabId: '', functionId: ALL_POWER_FUNCTIONS };

type Props = {
  t1: SideSnapshot;
  t2: SideSnapshot;
  renderResult: (tabId: string, functionId: string) => ReactNode;
};

function sideLabel(snap: SideSnapshot): string {
  const bits = [
    snap.name,
    snap.rank != null ? `#${snap.rank}` : null,
    snap.colour ? colourWord(snap.colour) : null,
  ].filter((bit): bit is string => bit != null);
  return bits.join(' · ');
}

/**
 * Picks a power dynamic and one of its functions for a team, then renders that result.
 * Drop it anywhere a match already has both side snapshots and a result renderer.
 */
export default function PowerDynamicsCaller({ t1, t2, renderResult }: Props) {
  const [side, setSide] = useState<SideId>('t1');
  const [picks, setPicks] = useState<Record<SideId, SidePick>>({ t1: EMPTY_PICK, t2: EMPTY_PICK });
  const active = side === 't1' ? t1 : t2;
  const pick = picks[side];
  const call = pick.tabId ? powerDynamicCall(pick.tabId) : undefined;
  const chosenFn = call && pick.functionId !== ALL_POWER_FUNCTIONS
    ? powerDynamicFunction(call.id, pick.functionId)
    : undefined;

  const teamOptions = useMemo(
    () => [
      { value: 't1', label: sideLabel(t1) },
      { value: 't2', label: sideLabel(t2) },
    ],
    [t1, t2],
  );
  const dynamicOptions = useMemo(
    () => POWER_DYNAMIC_CALLS.map((item) => ({ value: item.id, label: `${item.index}. ${item.name}` })),
    [],
  );
  const functionOptions = useMemo(() => {
    if (!call) return [];
    return [
      { value: ALL_POWER_FUNCTIONS, label: 'All functions' },
      ...call.functions.map((item) => ({ value: item.id, label: item.label })),
    ];
  }, [call]);

  const chooseTab = (tabId: string) => {
    setPicks((current) => ({ ...current, [side]: { tabId, functionId: ALL_POWER_FUNCTIONS } }));
  };

  return (
    <View>
      <Text style={styles.title}>Call a power dynamic</Text>
      <Text style={styles.note}>
        Choose the team, then the power dynamic, then one function or all of them. Each team keeps its own call.
      </Text>
      <View style={styles.filters}>
        <FilterDropdown
          label="Team"
          value={side}
          options={teamOptions}
          onChange={(value) => setSide(value as SideId)}
          style={styles.dropdown}
        />
        <FilterDropdown
          label="Power dynamic"
          value={pick.tabId}
          options={dynamicOptions}
          emptyLabel="Choose a power dynamic"
          onChange={chooseTab}
          style={styles.dropdown}
        />
        {call ? (
          <FilterDropdown
            label="Function"
            value={pick.functionId}
            options={functionOptions}
            emptyLabel="All functions"
            onChange={(functionId) => {
              setPicks((current) => ({ ...current, [side]: { ...current[side], functionId } }));
            }}
            style={styles.dropdown}
          />
        ) : null}
      </View>

      {call ? (
        <View style={styles.result}>
          <View style={[styles.resultBar, { backgroundColor: active.colour ? COLOUR_HEX[active.colour] : theme.textPrimary }]} />
          <Text style={styles.resultKicker}>Result · {active.label}</Text>
          <Text style={styles.resultTitle}>
            {active.name} · {call.name}
            {chosenFn ? ` · ${chosenFn.label}` : ' · All functions'}
          </Text>
          {chosenFn ? <Text style={styles.resultDetail}>{chosenFn.detail}</Text> : <Text style={styles.resultDetail}>{call.detail}</Text>}
          <View style={styles.resultBody}>{renderResult(call.id, pick.functionId)}</View>
        </View>
      ) : (
        <Text style={styles.empty}>Choose a power dynamic for {active.name}.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontFamily: fonts.display,
    fontSize: 22,
    letterSpacing: 0.3,
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
  filters: { width: '100%', alignSelf: 'stretch', gap: spacing.sm, marginBottom: spacing.md },
  dropdown: { width: '100%', maxWidth: '100%', alignSelf: 'stretch', minWidth: 0, flexBasis: 'auto', flexGrow: 0 },
  result: {
    backgroundColor: theme.surface,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    padding: spacing.md,
    overflow: 'hidden',
  },
  resultBar: { height: 4, borderRadius: 99, marginBottom: spacing.sm },
  resultKicker: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: theme.textMuted,
  },
  resultTitle: {
    fontFamily: fonts.display,
    fontSize: 20,
    color: theme.textPrimary,
    marginBottom: spacing.xs,
  },
  resultDetail: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    color: theme.textMuted,
    marginBottom: spacing.sm,
  },
  resultBody: { gap: spacing.sm },
  empty: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    color: theme.textMuted,
  },
});
