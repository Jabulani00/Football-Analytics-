import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import StandingsTable from '@/components/match/StandingsTable';
import SubTabBar from '@/components/shared/SubTabBar';
import type { StandingRow } from '@/mock/matchData';
import { fonts, spacing, theme } from '@/styles/theme';
import {
  buildStandingsView,
  PROB_METRICS,
  type Band,
  type FormWindow,
  type Period,
  type ProbMetricKey,
  type Selection,
  type Split,
} from '@/utils/standingsAnalytics';

type Group = 'standard' | 'ppg' | 'last6' | 'form' | 'prob';

const GROUPS: { id: Group; label: string }[] = [
  { id: 'standard', label: 'Standard' },
  { id: 'ppg', label: 'PPG' },
  { id: 'last6', label: 'Last 6 PPG' },
  { id: 'form', label: 'Recent Form' },
  { id: 'prob', label: 'Probability' },
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
};

export default function StandingsAnalyticsView({ base, seasonLabel }: Props) {
  const [group, setGroup] = useState<Group>('standard');
  const [period, setPeriod] = useState<Period>('ft');
  const [scope, setScope] = useState<Split>('overall');
  const [band, setBand] = useState<Band>('plain');
  const [window, setWindow] = useState<FormWindow>(10);
  const [metric, setMetric] = useState<ProbMetricKey>('sc');

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

      {showPeriodScope ? (
        <>
          <SubTabBar tabs={PERIODS} active={period} onChange={setPeriod} />
          <SubTabBar tabs={SCOPES} active={scope} onChange={setScope} />
        </>
      ) : null}

      {group === 'ppg' ? <SubTabBar tabs={BANDS} active={band} onChange={setBand} /> : null}

      {group === 'prob' ? (
        <SubTabBar tabs={METRIC_TABS} active={metric} onChange={setMetric} />
      ) : null}

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
        colorRank={group === 'standard'}
        zoneSeparators={group === 'standard' ? undefined : []}
        bandDivideAfter={view.bandDivideAfter}
      />
    </View>
  );
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
});
