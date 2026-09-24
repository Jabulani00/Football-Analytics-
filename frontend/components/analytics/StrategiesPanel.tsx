import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import ComplianceBadge from '@/components/analytics/ComplianceBadge';
import SectionLabel from '@/components/shared/SectionLabel';
import type { HollywoodPopularOddsState } from '@/hooks/useHollywoodPopularOdds';
import { useSavedStrategies } from '@/hooks/useSavedStrategies';
import {
  strategyCallsFromMarketRows,
  type StrategyEvidenceKey,
} from '@/services/strategyEngine';
import { fonts, layout, spacing, theme } from '@/styles/theme';
import type { BetSlipLeg } from '@/types/analytics';

type SortKey = 'overall' | 'kickoff' | 'date';

const LAYERS: { key: StrategyEvidenceKey; label: string }[] = [
  { key: 'form', label: 'Form' },
  { key: 'colour', label: 'Colour' },
  { key: 'h2h', label: 'H2H' },
  { key: 'motivation', label: 'Motivation' },
  { key: 'bhozoma', label: 'Bhozoma' },
  { key: 'separator', label: 'Separator' },
  { key: 'value', label: 'Value' },
];

export default function StrategiesPanel({
  live,
  onAddLeg,
}: {
  live: HollywoodPopularOddsState;
  onAddLeg: (leg: BetSlipLeg) => void;
}) {
  const [sort, setSort] = useState<SortKey>('overall');
  const {
    definitions,
    historyByDefinition,
    record: recordEvaluations,
    remove: removeStrategy,
    save: saveDefinition,
  } = useSavedStrategies();
  const [name, setName] = useState('My value strategy');
  const [minimumCompliance, setMinimumCompliance] = useState('70');
  const [minimumOdds, setMinimumOdds] = useState('1.20');
  const [minimumEdge, setMinimumEdge] = useState('0');
  const [required, setRequired] = useState<StrategyEvidenceKey[]>(LAYERS.map((item) => item.key));
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const calls = useMemo(() => {
    const result = strategyCallsFromMarketRows(
      live.marketRows,
      live.strategyContexts,
      definitions,
    );
    return [...result].sort((a, b) => {
      if (sort === 'overall') return b.compliance - a.compliance;
      const aDate = new Date(a.kickoff).getTime();
      const bDate = new Date(b.kickoff).getTime();
      if (sort === 'date') return aDate - bDate;
      return new Date(a.kickoff).getHours() - new Date(b.kickoff).getHours();
    });
  }, [live.marketRows, live.strategyContexts, definitions, sort]);
  const qualified = calls.filter((call) => call.status === 'qualified');

  useEffect(() => {
    recordEvaluations(calls);
  }, [calls, recordEvaluations]);

  const toggleLayer = (key: StrategyEvidenceKey) => {
    setRequired((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
  };

  const saveStrategy = () => {
    const compliance = Number(minimumCompliance);
    const odds = Number(minimumOdds);
    const edge = Number(minimumEdge);
    if (!name.trim() || required.length === 0 || !Number.isFinite(compliance) || compliance < 0 || compliance > 100 || !Number.isFinite(odds) || odds < 1 || !Number.isFinite(edge)) {
      setSaveMessage('Enter a name, choose at least one layer, and use valid thresholds.');
      return;
    }
    saveDefinition({
      name: name.trim(),
      required,
      minimumCompliance: compliance,
      minimumOdds: odds,
      minimumEdgePct: edge,
    });
    setSaveMessage('Strategy saved on this device and added to live evaluation.');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.intro}>
        Create a strategy from the PDF layers and price thresholds. Live calls use joined form,
        table colour, H2H, motivation, Bhozoma, separator and value data; unavailable evidence
        remains a visible blocker instead of being replaced with sample numbers.
      </Text>

      <View style={styles.builder}>
        <SectionLabel style={styles.builderTitle}>Strategy Builder</SectionLabel>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Strategy name"
          placeholderTextColor={theme.textFaint}
          style={styles.nameInput}
        />
        <Text style={styles.fieldLabel}>Required evidence layers</Text>
        <View style={styles.layerRow}>
          {LAYERS.map((layer) => {
            const selected = required.includes(layer.key);
            return (
              <Pressable
                key={layer.key}
                onPress={() => toggleLayer(layer.key)}
                style={[styles.layerChip, selected && styles.layerChipActive]}>
                <Text style={[styles.layerText, selected && styles.layerTextActive]}>{layer.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.thresholdRow}>
          <ThresholdInput label="Min compliance %" value={minimumCompliance} onChange={setMinimumCompliance} />
          <ThresholdInput label="Min odds" value={minimumOdds} onChange={setMinimumOdds} />
          <ThresholdInput label="Min edge %" value={minimumEdge} onChange={setMinimumEdge} />
        </View>
        <Pressable onPress={saveStrategy} style={styles.saveButton}>
          <Text style={styles.saveButtonText}>SAVE STRATEGY</Text>
        </Pressable>
        {saveMessage ? <Text style={styles.saveMessage}>{saveMessage}</Text> : null}
        <Text style={styles.persistenceNote}>
          Definitions and evaluation history persist in this browser. Supabase cross-device sync activates after project deployment and sign-in are available.
        </Text>
      </View>

      <SectionLabel style={styles.section}>Saved Strategies & Recorded Compliance</SectionLabel>
      <View style={styles.savedList}>
        {definitions.map((definition) => {
          const history = historyByDefinition[definition.id];
          return (
            <View key={definition.id} style={styles.savedCard}>
              <View style={styles.savedHeader}>
                <Text style={styles.savedName}>{definition.name}</Text>
                {definition.id !== 'core-value-seven-layers' ? (
                  <Pressable onPress={() => removeStrategy(definition.id)}>
                    <Text style={styles.deleteText}>REMOVE</Text>
                  </Pressable>
                ) : null}
              </View>
              <Text style={styles.savedRules}>
                {definition.required.join(' + ')} · compliance ≥ {definition.minimumCompliance}% · odds ≥ {(definition.minimumOdds ?? 1).toFixed(2)} · edge ≥ {(definition.minimumEdgePct ?? 0).toFixed(1)}%
              </Text>
              <Text style={styles.savedHistory}>
                Recorded history: {history?.matched ?? 0}/{history?.total ?? 0} qualified{history?.compliance != null ? ` · ${history.compliance.toFixed(0)}%` : ' · collecting real evaluations'}
              </Text>
            </View>
          );
        })}
      </View>

      <View style={styles.sortBar}>
        <Text style={styles.sortLabel}>Sort by:</Text>
        {([
          ['overall', 'Overall'],
          ['kickoff', 'Kickoff'],
          ['date', 'Date'],
        ] as const).map(([key, label]) => (
          <Pressable key={key} onPress={() => setSort(key)} style={[styles.sortChip, sort === key && styles.sortChipActive]}>
            <Text style={[styles.sortChipText, sort === key && styles.sortChipTextActive]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.pendingSort}>Home/Away form is evaluated inside each joined fixture context.</Text>

      <SectionLabel style={styles.section}>Live Strategy Call-outs</SectionLabel>

      {live.loading ? <Text style={styles.state}>Loading live candidates…</Text> : null}
      {live.error && calls.length === 0 ? <Text style={styles.error}>{live.error}</Text> : null}
      {!live.loading && calls.length === 0 ? (
        <Text style={styles.state}>No machine-priced Hollywood fixtures are available to evaluate.</Text>
      ) : null}
      {calls.length > 0 && qualified.length === 0 ? (
        <Text style={styles.blockedSummary}>
          {calls.length} live candidate{calls.length === 1 ? '' : 's'} checked · 0 fully qualified · inspect the named failed or missing layers below
        </Text>
      ) : null}

      <View style={styles.list}>
        {calls.slice(0, 20).map((match) => (
          <View key={match.id} style={[styles.card, match.status === 'blocked' && styles.cardBlocked]}>
            <View style={styles.cardHeader}>
              <Text style={styles.strategyName}>{match.strategy}</Text>
              <ComplianceBadge level={match.level} value={match.compliance} />
            </View>

            <Text style={styles.fixture}>{match.fixture}</Text>
            <Text style={styles.datetime}>
              {new Date(match.kickoff).toLocaleString()} · {match.market} — {match.selection} @ {match.odds.toFixed(2)}
            </Text>

            {match.motives.length > 0 ? <View style={styles.motives}>
              <Text style={styles.motivesLabel}>EVIDENCE</Text>
              {match.motives.map((m, index) => (
                <Text key={`${m}-${index}`} style={styles.motive}>
                  · {m}
                </Text>
              ))}
            </View> : null}

            {match.blockers.length > 0 ? (
              <View style={styles.blockers}>
                <Text style={styles.blockerTitle}>BLOCKED — MISSING REAL INPUTS</Text>
                {match.blockers.map((blocker) => (
                  <Text key={blocker} style={styles.blocker}>· {blocker}</Text>
                ))}
              </View>
            ) : null}

            {match.status === 'qualified' && match.betSlipLeg ? (
              <Pressable onPress={() => onAddLeg(match.betSlipLeg as BetSlipLeg)} style={styles.addButton}>
                <Text style={styles.addButtonText}>ADD QUALIFIED CALL TO SLIP</Text>
              </Pressable>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

function ThresholdInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.thresholdField}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType="decimal-pad"
        placeholderTextColor={theme.textFaint}
        style={styles.thresholdInput}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
  },
  intro: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: theme.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 640,
    marginBottom: spacing.lg,
  },
  builder: {
    width: '100%',
    maxWidth: 720,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    backgroundColor: theme.surface,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  builderTitle: { marginBottom: spacing.md, textAlign: 'center' },
  nameInput: {
    width: '100%',
    maxWidth: 420,
    fontFamily: fonts.body,
    fontSize: 14,
    color: theme.textPrimary,
    backgroundColor: theme.bg,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    textAlign: 'center',
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}),
  },
  fieldLabel: { fontFamily: fonts.bodySemiBold, fontSize: 10, color: theme.textMuted, textAlign: 'center', marginTop: spacing.sm, marginBottom: spacing.xs },
  layerRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.xs },
  layerChip: { borderWidth: layout.borderWidth, borderColor: theme.border, borderRadius: layout.borderRadius, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  layerChipActive: { borderColor: theme.accentGreen, backgroundColor: theme.surfaceMuted },
  layerText: { fontFamily: fonts.bodyMedium, fontSize: 10, color: theme.textMuted },
  layerTextActive: { color: theme.accentGreen },
  thresholdRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.md, marginTop: spacing.sm, width: '100%' },
  thresholdField: { minWidth: 130, alignItems: 'center' },
  thresholdInput: { width: 120, fontFamily: fonts.bodyMedium, fontSize: 13, color: theme.textPrimary, backgroundColor: theme.bg, borderWidth: layout.borderWidth, borderColor: theme.border, borderRadius: layout.borderRadius, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, textAlign: 'center', ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}) },
  saveButton: { marginTop: spacing.md, backgroundColor: theme.accentGreen, borderRadius: layout.borderRadius, paddingHorizontal: spacing.xl, paddingVertical: spacing.sm },
  saveButtonText: { fontFamily: fonts.display, fontSize: 12, color: theme.bg, letterSpacing: 0.8 },
  saveMessage: { fontFamily: fonts.bodyMedium, fontSize: 11, color: theme.accentGreen, textAlign: 'center', marginTop: spacing.sm },
  persistenceNote: { fontFamily: fonts.body, fontSize: 10, color: theme.textFaint, textAlign: 'center', lineHeight: 15, marginTop: spacing.sm, maxWidth: 560 },
  savedList: { width: '100%', maxWidth: 720, gap: spacing.sm, marginBottom: spacing.xl },
  savedCard: { borderWidth: layout.borderWidth, borderColor: theme.border, borderRadius: layout.borderRadius, backgroundColor: theme.surface, padding: spacing.md },
  savedHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  savedName: { flex: 1, fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.textPrimary },
  deleteText: { fontFamily: fonts.bodySemiBold, fontSize: 9, color: theme.loss },
  savedRules: { fontFamily: fonts.body, fontSize: 10, color: theme.textMuted, marginTop: spacing.xs, lineHeight: 15 },
  savedHistory: { fontFamily: fonts.bodyMedium, fontSize: 10, color: theme.accentBlue, marginTop: spacing.xs },
  sortBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  sortLabel: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textMuted,
  },
  sortChip: {
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: layout.borderRadius,
    backgroundColor: theme.surface,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : {}),
  },
  sortChipActive: { borderColor: theme.accentGreen, backgroundColor: theme.surfaceMuted },
  sortChipText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    color: theme.textPrimary,
  },
  sortChipTextActive: { color: theme.accentGreen },
  pendingSort: { fontFamily: fonts.body, fontSize: 11, color: theme.textFaint, marginTop: -spacing.md, marginBottom: spacing.lg },
  section: {
    alignSelf: 'stretch',
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  list: {
    width: '100%',
    maxWidth: 720,
    gap: spacing.md,
  },
  state: { fontFamily: fonts.body, fontSize: 13, color: theme.textMuted, marginBottom: spacing.md, textAlign: 'center' },
  error: { fontFamily: fonts.body, fontSize: 13, color: theme.loss, marginBottom: spacing.md, textAlign: 'center' },
  blockedSummary: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: theme.accentOrange, marginBottom: spacing.md, textAlign: 'center' },
  card: {
    backgroundColor: theme.surface,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    padding: spacing.md,
    width: '100%',
    alignItems: 'center',
  },
  cardBlocked: { borderColor: theme.accentOrange },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: spacing.sm,
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  strategyName: {
    fontFamily: fonts.display,
    fontSize: 16,
    color: theme.accentOrange,
    flex: 1,
  },
  fixture: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
    color: theme.textPrimary,
    marginBottom: spacing.xs,
  },
  datetime: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textMuted,
    marginBottom: spacing.md,
  },
  motives: {
    width: '100%',
    borderTopWidth: layout.borderWidth,
    borderTopColor: theme.border,
    paddingTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  motivesLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    color: theme.textMuted,
    letterSpacing: 1,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  motive: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textPrimary,
    textAlign: 'center',
    lineHeight: 18,
  },
  blockers: { width: '100%', borderTopWidth: layout.borderWidth, borderTopColor: theme.border, marginTop: spacing.sm, paddingTop: spacing.sm },
  blockerTitle: { fontFamily: fonts.bodySemiBold, fontSize: 10, color: theme.accentOrange, textAlign: 'center', marginBottom: spacing.xs },
  blocker: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted, lineHeight: 17, textAlign: 'center' },
  addButton: { marginTop: spacing.md, backgroundColor: theme.accentGreen, borderRadius: layout.borderRadius, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  addButtonText: { fontFamily: fonts.display, fontSize: 11, color: theme.bg, letterSpacing: 0.5 },
  oddsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  oddsChip: {
    borderWidth: layout.borderWidth,
    borderColor: theme.accentBlue,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: layout.borderRadius,
    alignItems: 'center',
  },
  oddsMarket: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: theme.textMuted,
  },
  oddsSelection: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: theme.accentBlue,
  },
});
