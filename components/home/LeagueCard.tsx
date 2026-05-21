import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import ComplianceBadge from '@/components/analytics/ComplianceBadge';
import type { League } from '@/mock/leaguesData';
import { complianceFromPercent } from '@/utils/compliance';
import { fonts, layout, spacing, theme } from '@/styles/theme';

type LeagueCardProps = {
  league: League;
  onPress: () => void;
};

export default function LeagueCard({ league, onPress }: LeagueCardProps) {
  const level = complianceFromPercent(league.topCompliance);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed, hovered }) => [
        styles.card,
        (pressed || (Platform.OS === 'web' && hovered)) && styles.cardHover,
      ]}>
      <Text style={styles.regionCode}>{league.regionCode}</Text>
      <Text style={styles.flag}>{league.flag}</Text>
      <Text style={styles.name}>{league.name}</Text>
      <Text style={styles.country}>{league.country}</Text>

      <View style={styles.intelRow}>
        <View style={styles.signalPill}>
          <Text style={styles.signalText}>{league.signalsToday} signals</Text>
        </View>
        <ComplianceBadge level={level} value={league.topCompliance} compact />
      </View>

      <Text style={styles.topPick} numberOfLines={1}>
        Top: {league.topPick}
      </Text>

      <View style={styles.footer}>
        {league.liveCount > 0 ? (
          <View style={styles.livePill}>
            <Text style={styles.livePillText}>● {league.liveCount} LIVE</Text>
          </View>
        ) : null}
        <Text style={styles.matchCount}>{league.matchCount} matches</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.surface,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    padding: spacing.lg,
    minHeight: 200,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: theme.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 3,
    ...(Platform.OS === 'web'
      ? ({
          cursor: 'pointer',
          transition: 'border-color 150ms ease, box-shadow 150ms ease, transform 150ms ease',
        } as object)
      : {}),
  },
  cardHover: {
    borderColor: theme.accentGreen,
    transform: [{ translateY: -3 }],
  },
  regionCode: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.md,
    fontFamily: fonts.display,
    fontSize: 48,
    color: theme.textFaint,
    opacity: 0.25,
    letterSpacing: 2,
  },
  flag: {
    fontSize: 32,
    marginBottom: spacing.sm,
  },
  name: {
    fontFamily: fonts.display,
    fontSize: 18,
    color: theme.textPrimary,
    marginBottom: spacing.xs,
  },
  country: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textMuted,
    marginBottom: spacing.sm,
  },
  intelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
    flexWrap: 'wrap',
  },
  signalPill: {
    backgroundColor: theme.surfaceMuted,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: layout.borderRadius,
  },
  signalText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 10,
    color: theme.accentBlue,
    letterSpacing: 0.3,
  },
  topPick: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: theme.textMuted,
    marginBottom: spacing.md,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: 'auto',
  },
  livePill: {
    backgroundColor: 'rgba(5, 150, 105, 0.1)',
    borderWidth: layout.borderWidth,
    borderColor: theme.accentGreen,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: layout.borderRadius,
  },
  livePillText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 10,
    color: theme.accentGreen,
    letterSpacing: 0.5,
  },
  matchCount: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textMuted,
  },
});
