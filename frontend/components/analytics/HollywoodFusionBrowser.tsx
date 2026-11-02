import { Pressable, StyleSheet, Text, View } from 'react-native';
import FilterDropdown from '@/components/shared/FilterDropdown';
import type { HollywoodPopularOddsState } from '@/hooks/useHollywoodPopularOdds';
import { fonts, spacing, theme } from '@/styles/theme';

/** Shared selection for Odds Fusion and Strategies, using the provider's own labels. */
export default function HollywoodFusionBrowser({ live }: { live: HollywoodPopularOddsState }) {
  const nav = live.navigation;
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Browse Hollywoodbets soccer</Text>
      <View style={styles.controls}>
        <FilterDropdown label="Country / category" value={live.categoryId == null ? '' : String(live.categoryId)}
          emptyLabel={nav.loadingCategories ? 'Loading countries...' : 'Choose a country / category'}
          options={nav.categories.map((item) => ({ value: String(item.id), label: item.name }))}
          onChange={(value) => live.selectCategory(Number(value))} />
        <FilterDropdown label="Competition" value={live.tournamentId == null ? '' : String(live.tournamentId)}
          emptyLabel={nav.loadingTournaments ? 'Loading competitions...' : 'Choose a competition'}
          options={nav.tournaments.map((item) => ({ value: String(item.id), label: item.name }))}
          onChange={(value) => live.selectTournament(Number(value))} />
        <Pressable accessibilityRole="button" accessibilityLabel="Refresh selected Hollywood competition"
          disabled={live.tournamentId == null || live.loading || live.enriching}
          onPress={live.refresh} style={styles.refresh}>
          <Text style={styles.action}>REFRESH</Text>
        </Pressable>
      </View>
      <Text style={styles.note}>
        {nav.categories.length} countries / categories available
        {live.categoryId != null ? ` · ${nav.tournaments.length} competitions in this category` : ''}.
        {' '}Choose a competition to load its fixtures. Names follow Hollywoodbets.
      </Text>
      {live.source ? <Text style={styles.note}>
        {live.fixtureCount} fixtures returned · {live.pricedFixtureCount} with supported open prices
        {' · '}{live.modelFixtureCount} with model probabilities · {live.strategyFixtureCount} with strategy context
      </Text> : null}
      {live.loading ? <Text style={styles.note}>Loading Hollywood prices...</Text> : null}
      {live.enriching ? <Text style={styles.note}>Prices loaded. Checking model and strategy evidence...</Text> : null}
      {live.source ? <Text style={styles.note}>
        Analysis covers 1X2, BTTS and Over/Under 0.5–3.5 where offered. Model lookup checks up to 12 matched fixtures;
        strategy context loads for up to 6. Missing evidence does not hide available prices.
      </Text> : null}
      {nav.error || live.error ? <Text accessibilityRole="alert" style={styles.error}>{nav.error ?? live.error}</Text> : null}
      {live.warning ? <Text style={styles.note}>{live.warning}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', padding: spacing.md, marginBottom: spacing.lg, borderWidth: 1,
    borderColor: theme.border, borderRadius: 12, backgroundColor: theme.surface },
  title: { fontFamily: fonts.bodySemiBold, color: theme.textPrimary, marginBottom: spacing.sm },
  controls: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: spacing.sm },
  refresh: { padding: spacing.md },
  action: { fontFamily: fonts.bodySemiBold, color: theme.accentGreen, fontSize: 12 },
  note: { fontFamily: fonts.body, color: theme.textMuted, fontSize: 12, lineHeight: 19, marginTop: spacing.sm },
  error: { fontFamily: fonts.body, color: theme.textPrimary, marginTop: spacing.sm },
});
