import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { PredictionResult } from '@/hooks/useModel';
import { fonts, spacing, theme } from '@/styles/theme';

type PredictionBarProps = {
  label: string;
  probability: number;
  source?: PredictionResult['source'];
  loading?: boolean;
};

export default function PredictionBar({ label, probability, source, loading }: PredictionBarProps) {
  const [animated, setAnimated] = useState(0);

  useEffect(() => {
    const id = setTimeout(() => setAnimated(probability), 80);
    return () => clearTimeout(id);
  }, [probability]);

  const pct = Math.round(probability * 100);
  const barColor = pct >= 65 ? theme.accentGreen : pct >= 45 ? theme.yellow : theme.loss;

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.pct}>{loading ? '…' : `${pct}%`}</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${animated * 100}%`, backgroundColor: barColor }]} />
      </View>
      {source ? (
        <Text style={styles.source}>
          {source === 'tfjs' ? 'TF.js model' : source === 'scaler' ? 'Linear scaler' : 'Heuristic'}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    marginBottom: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  label: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: theme.textPrimary,
  },
  pct: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: theme.textPrimary,
  },
  track: {
    height: 8,
    backgroundColor: theme.surfaceMuted,
    borderRadius: 4,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 4,
  },
  source: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: theme.textFaint,
    marginTop: 2,
  },
});
