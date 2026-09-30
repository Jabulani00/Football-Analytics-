import { StyleSheet, View, useWindowDimensions } from 'react-native';

import FilterDropdown from '@/components/shared/FilterDropdown';
import { ANALYTICS_TABS } from '@/mock/analyticsData';
import type { AnalyticsTab } from '@/types/analytics';
import { spacing } from '@/styles/theme';

type AnalyticsNavProps = {
  active: AnalyticsTab;
  onChange: (tab: AnalyticsTab) => void;
};

export default function AnalyticsNav({ active, onChange }: AnalyticsNavProps) {
  const narrow = useWindowDimensions().width < 720;
  return (
    <View style={styles.wrap}>
      <FilterDropdown
        label="Section"
        value={active}
        options={ANALYTICS_TABS.map((tab) => ({ value: tab.id, label: tab.label }))}
        onChange={(value) => onChange(value as AnalyticsTab)}
        style={narrow ? styles.full : styles.wide}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    marginBottom: spacing.lg,
  },
  wide: { width: '100%', flexBasis: 'auto' },
  full: { width: '100%', minWidth: 0, flexBasis: 'auto', flexGrow: 0 },
});
