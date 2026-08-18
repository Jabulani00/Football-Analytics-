import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import RecommendationCard from '@/components/analytics/RecommendationCard';
import ScoresMatchRow from '@/components/scores/ScoresMatchRow';
import { fetchFixtureDetail, type Fixture, type RawFixtureDetail } from '@/services/oddAlerts';
import { oddsInputFromApi, predictionFromApiProbability } from '@/utils/apiRecommendationAdapter';
import { buildRecommendation, type MarketModule } from '@/utils/fixtureRecommendation';
import { fonts, spacing, theme } from '@/styles/theme';

type Props = {
  fixture: Fixture;
  /** Which market the recommendation is drawn from. */
  module: 'all' | MarketModule;
  /** Open the full match detail. */
  onOpen: () => void;
};

const CAN_RECOMMEND = new Set(['NS', 'LIVE', 'HT']);

/**
 * A fixtures-feed row with an expandable "best bet". The recommendation is
 * lazy-loaded (fixture detail is only fetched when the row is opened), so the
 * feed stays cheap. Uses the fixture's REAL odds + model probabilities.
 */
export default function FeedFixtureRow({ fixture, module, onOpen }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<RawFixtureDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  // Fetch the detail once, the first time the row is opened. Kept in a ref so the
  // effect only depends on `expanded` — depending on the loading/detail state
  // would let a state update cancel the in-flight fetch via cleanup.
  const startedRef = useRef(false);

  const recommendable = CAN_RECOMMEND.has(fixture.status);

  useEffect(() => {
    if (!expanded || startedRef.current) return;
    startedRef.current = true;
    let active = true;
    setLoading(true);
    fetchFixtureDetail(fixture.id)
      .then((d) => {
        if (!active) return;
        setDetail(d);
        setFailed(!d);
      })
      .catch(() => {
        if (active) setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [expanded, fixture.id]);

  const prob = detail?.probability;
  const rec =
    prob && prob.home_win != null
      ? buildRecommendation({
          prediction: predictionFromApiProbability(prob),
          homeName: fixture.home.name,
          awayName: fixture.away.name,
          homePosition: fixture.home.position,
          awayPosition: fixture.away.position,
          odds: oddsInputFromApi(detail?.odds),
          modules: module === 'all' ? undefined : [module],
        })
      : null;

  const isLive = fixture.status === 'LIVE' || fixture.status === 'HT';

  return (
    <View style={styles.wrap}>
      <ScoresMatchRow fixture={fixture} onPress={onOpen} />

      {recommendable ? (
        <Pressable
          onPress={() => setExpanded((e) => !e)}
          style={({ hovered }) => [
            styles.toggle,
            Platform.OS === 'web' && hovered ? styles.toggleHover : null,
          ]}>
          <Text style={styles.toggleText}>
            {expanded ? '▾ Hide best bet' : '⚡ Best bet'}
          </Text>
          {rec && !expanded ? (
            <Text style={styles.peek} numberOfLines={1}>
              {rec.best?.selection} · {Math.round((rec.best?.probability ?? 0) * 100)}%
            </Text>
          ) : null}
        </Pressable>
      ) : null}

      {expanded ? (
        <View style={styles.body}>
          {loading ? (
            <ActivityIndicator size="small" color={theme.accentGreen} />
          ) : rec ? (
            <RecommendationCard
              rec={rec}
              homePosition={fixture.home.position}
              awayPosition={fixture.away.position}
              isLive={isLive}
            />
          ) : (
            <Text style={styles.muted}>
              {failed ? 'No model data for this fixture yet.' : 'No recommendation available.'}
            </Text>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingBottom: 6,
    paddingTop: 2,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : {}),
  },
  toggleHover: { backgroundColor: theme.surfaceHover },
  toggleText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    letterSpacing: 0.4,
    color: theme.accentGreen,
    textTransform: 'uppercase',
  },
  peek: { flex: 1, fontFamily: fonts.body, fontSize: 11, color: theme.textMuted },
  body: { paddingHorizontal: spacing.sm, paddingBottom: spacing.sm },
  muted: { fontFamily: fonts.body, fontSize: 12, color: theme.textMuted, paddingVertical: spacing.sm },
});
