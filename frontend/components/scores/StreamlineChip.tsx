import { StyleSheet, Text, View } from 'react-native';

import { STREAM_CHIP, type StreamName } from '@/utils/powerDynamicsEngine';
import { fonts, theme } from '@/styles/theme';

type Props = {
  stream: StreamName | null | undefined;
};

function streamColor(stream: StreamName | null | undefined): string {
  if (stream === 'bateteme') return theme.yellow;
  if (stream === 'compliant') return theme.accentGreen;
  if (stream === 'zidane_law') return theme.accentBlue;
  if (stream === 'bookie' || stream === 'bookie2') return theme.loss;
  return theme.textFaint;
}

/** Fixed far-right Streamline column so fixture rows stay aligned. */
export default function StreamlineChip({ stream }: Props) {
  return (
    <View
      style={styles.col}
      accessibilityLabel={stream ? `Streamline ${STREAM_CHIP[stream]}` : 'Streamline not yet'}>
      <Text style={styles.kicker}>Streamline</Text>
      <Text style={[styles.name, { color: streamColor(stream) }]} numberOfLines={1}>
        {stream ? STREAM_CHIP[stream] : 'Not yet'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  col: {
    width: 72,
    flexShrink: 0,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  kicker: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 8,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: theme.textFaint,
  },
  name: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    marginTop: 1,
  },
});
