import { StyleSheet, Text, View } from 'react-native';

import DateFilterStrip from '@/components/league/DateFilterStrip';
import MatchRow from '@/components/league/MatchRow';
import UpcomingFixtureCard from '@/components/league/UpcomingFixtureCard';
import type { Fixture } from '@/mock/fixturesData';
import { fonts, spacing, theme } from '@/styles/theme';
import { formatDateHeading } from '@/utils/dates';

type LeagueResultsPanelProps = {
  selectedDate: string;
  onSelectDate: (d: string) => void;
  upcoming: Fixture[];
  inPlay: Fixture[];
  onMatchPress: (id: string) => void;
};

export default function LeagueResultsPanel({
  selectedDate,
  onSelectDate,
  upcoming,
  inPlay,
  onMatchPress,
}: LeagueResultsPanelProps) {
  return (
    <View style={styles.wrap}>
      <DateFilterStrip selectedDate={selectedDate} onSelect={onSelectDate} />
      <Text style={styles.dateHeading}>{formatDateHeading(selectedDate)}</Text>

      {inPlay.length > 0 ? (
        <View style={styles.block}>
          <Text style={styles.blockTitle}>RESULTS & LIVE</Text>
          {inPlay.map((f) => (
            <MatchRow key={f.id} fixture={f} onPress={() => onMatchPress(f.id)} />
          ))}
        </View>
      ) : null}

      {upcoming.length > 0 ? (
        <View style={styles.block}>
          <Text style={styles.blockTitle}>UPCOMING FIXTURES</Text>
          {upcoming.map((f) => (
            <UpcomingFixtureCard key={f.id} fixture={f} onPress={() => onMatchPress(f.id)} />
          ))}
        </View>
      ) : null}

      {inPlay.length === 0 && upcoming.length === 0 ? (
        <Text style={styles.empty}>No matches on this date.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  dateHeading: {
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    color: theme.textMuted,
    marginBottom: spacing.lg,
  },
  block: { marginBottom: spacing.xl, width: '100%' },
  blockTitle: {
    fontFamily: fonts.display,
    fontSize: 16,
    color: theme.textPrimary,
    marginBottom: spacing.md,
  },
  empty: {
    fontFamily: fonts.body,
    color: theme.textMuted,
    textAlign: 'center',
    paddingVertical: spacing.xl,
  },
});
