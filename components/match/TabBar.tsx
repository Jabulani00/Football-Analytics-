import { Pressable, StyleSheet, Text, View } from 'react-native';

import { fonts, layout, spacing, theme } from '@/styles/theme';

export type TabId = 'stats' | 'summary' | 'h2h' | 'table';

const TABS: { id: TabId; label: string }[] = [
  { id: 'stats', label: 'Our Stats' },
  { id: 'summary', label: 'Summary' },
  { id: 'h2h', label: 'H2H' },
  { id: 'table', label: 'Table' },
];

type TabBarProps = {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  isUpcoming?: boolean;
};

export default function TabBar({ activeTab, onTabChange, isUpcoming }: TabBarProps) {
  return (
    <View style={styles.container}>
      {TABS.map((tab) => {
        const isActive = activeTab === tab.id;
        const highlight = tab.id === 'stats' && isUpcoming;
        return (
          <Pressable
            key={tab.id}
            onPress={() => onTabChange(tab.id)}
            style={[styles.tab, isActive && styles.tabActive, highlight && !isActive && styles.tabHighlight]}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}>
            <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
              {tab.label}
              {tab.id === 'stats' && isUpcoming ? ' ●' : ''}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: theme.surface,
    borderBottomWidth: layout.borderWidth,
    borderBottomColor: theme.border,
    zIndex: 10,
    width: '100%',
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: theme.accentGreen,
  },
  tabHighlight: {
    backgroundColor: 'rgba(5, 150, 105, 0.06)',
  },
  tabLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: theme.textMuted,
  },
  tabLabelActive: {
    color: theme.accentGreen,
    fontFamily: fonts.bodySemiBold,
  },
});
