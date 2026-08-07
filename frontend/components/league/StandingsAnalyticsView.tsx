import { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import StandingsTable from '@/components/match/StandingsTable';
import SubTabBar from '@/components/shared/SubTabBar';
import type { StandingRow } from '@/mock/matchData';
import { fonts, spacing, theme } from '@/styles/theme';
import {
  buildInsights,
  buildStandingsView,
  INSIGHT_MARKETS,
  PROB_METRICS,
  type Band,
  type FormWindow,
  type InsightMarket,
  type Period,
  type ProbMetricKey,
  type Selection,
  type Split,
} from '@/utils/standingsAnalytics';

type Group = 'standard' | 'ppg' | 'last6' | 'form' | 'prob' | 'insights';

const GROUPS: { id: Group; label: string }[] = [
  { id: 'standard', label: 'Standard' },
  { id: 'ppg', label: 'PPG' },
  { id: 'last6', label: 'Last 6 PPG' },
  { id: 'form', label: 'Recent Form' },
  { id: 'prob', label: 'Probability' },
  { id: 'insights', label: '🎯 Bet Finder' },
];

const MARKET_TABS = INSIGHT_MARKETS.map((m) => ({ id: m.key, label: m.short }));

const THRESHOLDS: { id: string; label: string }[] = [
  { id: '0', label: 'All' },
  { id: '50', label: '50%+' },
  { id: '60', label: '60%+' },
  { id: '70', label: '70%+' },
  { id: '80', label: '80%+' },
];

const PERIODS: { id: Period; label: string }[] = [
  { id: 'ft', label: 'Full-time' },
  { id: '1h', label: '1st Half' },
  { id: '2h', label: '2nd Half' },
];

const SCOPES: { id: Split; label: string }[] = [
  { id: 'overall', label: 'Overall' },
  { id: 'home', label: 'Home' },
  { id: 'away', label: 'Away' },
];

const BANDS: { id: Band; label: string }[] = [
  { id: 'plain', label: 'Plain' },
  { id: 'green', label: '🟢 Green' },
  { id: 'yellow', label: '🟡 Yellow' },
  { id: 'red', label: '🔴 Red' },
];

const WINDOWS: { id: string; label: string }[] = [
  { id: '10', label: 'Last 10' },
  { id: '8', label: 'Last 8' },
  { id: '6', label: 'Last 6' },
];

const METRIC_TABS = PROB_METRICS.map((m) => ({ id: m.key, label: m.short }));

type Props = {
  base: StandingRow[];
  seasonLabel: string;
  /** Team names to highlight (e.g. the two teams of a fixture). */
  highlightTeams?: string[];
  /** Make table rows tappable, receiving the row's team name. */
  onTeamPress?: (team: string) => void;
};

export default function StandingsAnalyticsView({
  base,
  seasonLabel,
  highlightTeams,
  onTeamPress,
}: Props) {
  const [group, setGroup] = useState<Group>('standard');
  const [period, setPeriod] = useState<Period>('ft');
  const [scope, setScope] = useState<Split>('overall');
  const [band, setBand] = useState<Band>('plain');
  const [window, setWindow] = useState<FormWindow>(10);
  const [metric, setMetric] = useState<ProbMetricKey>('sc');
  const [market, setMarket] = useState<InsightMarket>('btts');
  const [minPct, setMinPct] = useState(60);

  const selection: Selection = useMemo(() => {
    switch (group) {
      case 'ppg':
        return { kind: 'ppg', split: scope, period, band };
      case 'last6':
        return { kind: 'last6ppg', split: scope, period };
      case 'form':
        return { kind: 'form', window, split: scope, period };
      case 'prob':
        return { kind: 'prob', metric };
      default:
        return { kind: 'standard' };
    }
  }, [group, period, scope, band, window, metric]);

  const view = useMemo(() => buildStandingsView(base, selection), [base, selection]);

  const isInsights = group === 'insights';
  const showPeriodScope = group === 'ppg' || group === 'last6' || group === 'form';

  return (
    <View style={styles.wrap}>
      {/* New tab row: table group */}
      <SubTabBar tabs={GROUPS} active={group} onChange={setGroup} />

      {group === 'form' ? (
        <SubTabBar
          tabs={WINDOWS}
          active={String(window)}
          onChange={(id) => setWindow(Number(id) as FormWindow)}
        />
      ) : null}

      {isInsights ? <SubTabBar tabs={MARKET_TABS} active={market} onChange={setMarket} /> : null}

      {showPeriodScope || isInsights ? (
        <>
          {showPeriodScope ? (
            <SubTabBar tabs={PERIODS} active={period} onChange={setPeriod} />
          ) : null}
          <SubTabBar tabs={SCOPES} active={scope} onChange={setScope} />
        </>
      ) : null}

      {group === 'ppg' ? <SubTabBar tabs={BANDS} active={band} onChange={setBand} /> : null}

      {group === 'prob' ? (
        <SubTabBar tabs={METRIC_TABS} active={metric} onChange={setMetric} />
      ) : null}

      {isInsights ? (
        <SubTabBar
          tabs={THRESHOLDS}
          active={String(minPct)}
          onChange={(id) => setMinPct(Number(id))}
        />
      ) : null}

      {isInsights ? (
        <InsightsPanel
          base={base}
          market={market}
          scope={scope}
          minPct={minPct}
          highlightTeams={highlightTeams}
          onTeamPress={onTeamPress}
        />
      ) : (
        <>
          <Text style={styles.caption}>{view.caption}</Text>

          {group === 'standard' ? (
            <View style={styles.legend}>
              <LegendDot color={theme.accentGreen} label="Promotion" />
              <LegendDot color={theme.accentBlue} label="Champions Lg" />
              <LegendDot color={theme.accentPurple} label="Europa Lg" />
              <LegendDot color={theme.loss} label="Relegation" />
            </View>
          ) : null}

          <StandingsTable
            standings={view.rows}
            seasonLabel={seasonLabel}
            highlightTeams={highlightTeams}
            onRowPress={onTeamPress}
            colorRank={group === 'standard'}
            zoneSeparators={group === 'standard' ? undefined : []}
            bandDivideAfter={view.bandDivideAfter}
          />
        </>
      )}
    </View>
  );
}

const MARKET_LABEL: Record<InsightMarket, string> = INSIGHT_MARKETS.reduce(
  (acc, m) => ({ ...acc, [m.key]: m.label }),
  {} as Record<InsightMarket, string>,
);
const SCOPE_LABEL: Record<Split, string> = { overall: 'Overall', home: 'Home', away: 'Away' };

function confidenceColor(v: number): string {
  if (v >= 66) return theme.accentGreen;
  if (v >= 45) return theme.yellow;
  return theme.loss;
}

function InsightsPanel({
  base,
  market,
  scope,
  minPct,
  highlightTeams,
  onTeamPress,
}: {
  base: StandingRow[];
  market: InsightMarket;
  scope: Split;
  minPct: number;
  highlightTeams?: string[];
  onTeamPress?: (team: string) => void;
}) {
  const rows = useMemo(() => buildInsights(base, { market, scope }), [base, market, scope]);
  const matches = rows.filter((r) => r.value >= minPct);
  const highlight = new Set(highlightTeams ?? []);
  const fixtureRows = (highlightTeams ?? [])
    .map((t) => rows.find((r) => r.team === t))
    .filter((r): r is (typeof rows)[number] => !!r);

  const scopeLabel = SCOPE_LABEL[scope];
  const marketLabel = MARKET_LABEL[market];

  return (
    <View>
      {/* Betting read for the two fixture teams, when present. */}
      {fixtureRows.length > 0 ? (
        <View style={styles.fixtureCard}>
          <Text style={styles.fixtureTitle}>THIS FIXTURE · {scopeLabel} {marketLabel}</Text>
          <View style={styles.fixtureRow}>
            {fixtureRows.map((r) => (
              <View key={r.team} style={styles.fixtureTeam}>
                <Text style={styles.fixtureName} numberOfLines={1}>
                  {r.team}
                </Text>
                <Text style={[styles.fixturePct, { color: confidenceColor(r.value) }]}>
                  {Math.round(r.value)}%
                </Text>
              </View>
            ))}
          </View>
          {fixtureRows.length === 2 ? (
            <Text style={styles.fixtureLean}>
              {leanText(fixtureRows[0].value, fixtureRows[1].value, marketLabel)}
            </Text>
          ) : null}
        </View>
      ) : null}

      <Text style={styles.caption}>
        {matches.length} of {rows.length} teams · {marketLabel} {minPct > 0 ? `${minPct}%+ ` : ''}
        ({scopeLabel})
      </Text>

      <View style={styles.insightList}>
        {matches.map((r, i) => {
          const on = highlight.has(r.team);
          return (
            <Pressable
              key={r.team}
              onPress={onTeamPress ? () => onTeamPress(r.team) : undefined}
              style={({ hovered }) => [
                styles.insightRow,
                on && styles.insightRowActive,
                Platform.OS === 'web' && hovered ? styles.insightRowHover : null,
              ]}>
              <Text style={styles.insightRank}>{i + 1}</Text>
              <Text style={[styles.insightTeam, on && styles.insightTeamActive]} numberOfLines={1}>
                {r.team}
              </Text>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    { width: `${Math.min(100, r.value)}%`, backgroundColor: confidenceColor(r.value) },
                  ]}
                />
              </View>
              <Text style={[styles.insightPct, { color: confidenceColor(r.value) }]}>
                {Math.round(r.value)}%
              </Text>
            </Pressable>
          );
        })}
        {matches.length === 0 ? (
          <Text style={styles.insightEmpty}>No team clears {minPct}% here — lower the threshold.</Text>
        ) : null}
      </View>
    </View>
  );
}

/** Plain-English betting lean for a two-team fixture. */
function leanText(a: number, b: number, marketLabel: string): string {
  const avg = (a + b) / 2;
  if (avg >= 66) return `→ ${marketLabel} leans YES (both strong)`;
  if (avg <= 38) return `→ ${marketLabel} leans NO (both weak)`;
  return `→ ${marketLabel} is a coin-flip — check other markets`;
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendSwatch, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  caption: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: theme.textPrimary,
    marginBottom: spacing.sm,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  legendSwatch: { width: 10, height: 10, borderRadius: 2 },
  legendText: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted },

  // Bet Finder
  fixtureCard: {
    backgroundColor: theme.surfaceMuted,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.border,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  fixtureTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    letterSpacing: 0.5,
    color: theme.textMuted,
    marginBottom: spacing.xs,
  },
  fixtureRow: { flexDirection: 'row', gap: spacing.md },
  fixtureTeam: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.xs },
  fixtureName: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.textPrimary, flexShrink: 1 },
  fixturePct: { fontFamily: fonts.display, fontSize: 16 },
  fixtureLean: { fontFamily: fonts.bodyMedium, fontSize: 11, color: theme.textMuted, marginTop: spacing.xs },

  insightList: { width: '100%' },
  insightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 6,
    paddingHorizontal: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    borderLeftWidth: 2,
    borderLeftColor: 'transparent',
  },
  insightRowActive: { borderLeftColor: theme.accentGreen, backgroundColor: 'rgba(5,150,105,0.05)' },
  insightRowHover: { backgroundColor: theme.surfaceHover },
  insightRank: { width: 20, fontFamily: fonts.body, fontSize: 11, color: theme.textFaint },
  insightTeam: { width: 120, fontFamily: fonts.bodyMedium, fontSize: 12, color: theme.textPrimary },
  insightTeamActive: { fontFamily: fonts.bodySemiBold },
  barTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: theme.surfaceMuted, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3 },
  insightPct: { width: 40, textAlign: 'right', fontFamily: fonts.bodySemiBold, fontSize: 12 },
  insightEmpty: { fontFamily: fonts.body, fontSize: 12, color: theme.textMuted, paddingVertical: spacing.md },
});
