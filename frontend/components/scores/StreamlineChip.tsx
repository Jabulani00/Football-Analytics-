import { StyleSheet, Text, View } from 'react-native';

import { STREAM_CHIP, type StreamName } from '@/utils/powerDynamicsEngine';
import { fonts, theme } from '@/styles/theme';

type Props = {
  stream?: StreamName | StreamName[] | null;
};

function asList(stream: StreamName | StreamName[] | null | undefined): StreamName[] {
  if (stream == null) return [];
  return Array.isArray(stream) ? stream : [stream];
}

function streamColor(stream: StreamName): string {
  if (stream === 'bateteme') return theme.yellow;
  if (stream === 'compliant') return theme.accentGreen;
  if (stream === 'zidane_law') return theme.accentBlue;
  if (stream === 'bookie' || stream === 'bookie2') return theme.loss;
  return theme.textFaint;
}

/** Fixed far-right Streamline column so fixture rows stay aligned. */
export default function StreamlineChip({ stream }: Props) {
  const streams = asList(stream);
  const label =
    streams.length > 0
      ? `Streamline ${streams.map((s) => STREAM_CHIP[s]).join(', ')}`
      : 'Streamline loading';

  return (
    <View style={styles.col} accessibilityLabel={label}>
      <Text style={styles.kicker}>Streamline</Text>
      {streams.length === 0 ? (
        <Text style={[styles.name, { color: theme.textFaint }]}>—</Text>
      ) : (
        streams.map((name) => (
          <Text key={name} style={[styles.name, { color: streamColor(name) }]}>
            {STREAM_CHIP[name]}
          </Text>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  col: {
    width: 86,
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
