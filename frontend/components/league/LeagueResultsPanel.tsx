import { StyleSheet, Text, View } from 'react-native';

import DateFilterStrip from '@/components/league/DateFilterStrip';
import MatchRow from '@/components/league/MatchRow';
import type { Fixture } from '@/mock/fixturesData';
import { fonts, spacing, theme } from '@/styles/theme';
import { formatDateHeading } from '@/utils/dates';

type LeagueResultsPanelProps = {
  selectedDate: string;
  onSelectDate: (d: string) => void;
  fixtures: Fixture[];
  onMatchPress: (id: string) => void;
};

export default function LeagueResultsPanel({
  selectedDate,
  onSelectDate,
  fixtures,
  onMatchPress,
}: LeagueResultsPanelProps) {
  return (
    <View style={styles.wrap}>
      <DateFilterStrip selectedDate={selectedDate} onSelect={onSelectDate} />
      <Text style={styles.dateHeading}>{formatDateHeading(selectedDate)}</Text>

      {fixtures.length > 0 ? (
        <View style={styles.list}>
          {fixtures.map((f) => (
            <MatchRow key={f.id} fixture={f} onPress={() => onMatchPress(f.id)} />
          ))}
        </View>
      ) : (
        <Text style={styles.empty}>No matches on this date.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  dateHeading: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: theme.textMuted,
    marginBottom: spacing.sm,
  },
  list: {
    backgroundColor: theme.surface,
    width: '100%',
  },
  empty: {
    fontFamily: fonts.body,
    color: theme.textMuted,
    textAlign: 'center',
    paddingVertical: spacing.xl,
  },
});
