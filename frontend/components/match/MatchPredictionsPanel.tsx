import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import PredictionBar from '@/components/PredictionBar';
import SectionLabel from '@/components/shared/SectionLabel';
import { useModel } from '@/hooks/useModel';
import { spacing } from '@/styles/theme';

type MatchPredictionsPanelProps = {
  fixtureId: string;
  homeTeam: string;
  awayTeam: string;
};

export default function MatchPredictionsPanel({
  fixtureId,
  homeTeam,
  awayTeam,
}: MatchPredictionsPanelProps) {
  const { predictBTTS, predictOver25 } = useModel(fixtureId, homeTeam, awayTeam);
  const [bttsProb, setBttsProb] = useState<number | null>(null);
  const [over25Prob, setOver25Prob] = useState<number | null>(null);
  const [bttsSource, setBttsSource] = useState<'tfjs' | 'scaler' | 'heuristic'>('heuristic');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const btts = await predictBTTS();
      const over25 = predictOver25();
      if (!cancelled) {
        setBttsProb(btts.probability);
        setBttsSource(btts.source);
        setOver25Prob(over25.probability);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [predictBTTS, predictOver25]);

  return (
    <View style={styles.wrap}>
      <SectionLabel>ML PREDICTIONS</SectionLabel>
      <PredictionBar
        label="BTTS Yes"
        probability={bttsProb ?? 0.5}
        source={bttsSource}
        loading={loading}
      />
      <PredictionBar
        label="Over 2.5 Goals"
        probability={over25Prob ?? 0.5}
        source="heuristic"
        loading={loading}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    marginBottom: spacing.md,
  },
});
