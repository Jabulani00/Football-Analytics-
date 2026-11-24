import { StyleSheet, Text, View } from 'react-native';

import { fonts, layout, spacing, theme } from '@/styles/theme';
import { splitCallReason } from '@/utils/powerDynamicLibraryScore';

/** T1 and T2 on their own rows, with anything shared underneath. */
export default function CallReasonBlocks({
  reason,
  t1Name,
  t2Name,
  homeIsT1 = true,
}: {
  reason: string;
  t1Name?: string;
  t2Name?: string;
  homeIsT1?: boolean;
}) {
  const notes = splitCallReason(reason, homeIsT1, { t1: t1Name, t2: t2Name });
  const split = notes.t1.length > 0 || notes.t2.length > 0;
  if (!split) {
    return <Text style={styles.line}>{reason}</Text>;
  }
  return (
    <View style={styles.wrap}>
      <Side title="T1" name={t1Name} lines={notes.t1} tone="t1" />
      <Side title="T2" name={t2Name} lines={notes.t2} tone="t2" />
      {notes.shared.length > 0 ? (
        <View style={styles.shared}>
          {notes.shared.map((line) => (
            <Text key={line} style={styles.sharedLine}>{line}</Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Side({
  title,
  name,
  lines,
  tone,
}: {
  title: string;
  name?: string;
  lines: string[];
  tone: 't1' | 't2';
}) {
  return (
    <View style={[styles.side, tone === 't1' ? styles.sideT1 : styles.sideT2]}>
      <Text style={styles.head}>
        {title}
        {name ? <Text style={styles.name}>  {name}</Text> : null}
      </Text>
      {lines.map((line) => (
        <Text key={line} style={styles.line}>{line}</Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs, marginTop: spacing.xs },
  side: {
    borderLeftWidth: 3,
    borderRadius: layout.borderRadius,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    gap: 2,
  },
  sideT1: { borderLeftColor: theme.accentGreen, backgroundColor: 'rgba(5, 150, 105, 0.08)' },
  sideT2: { borderLeftColor: theme.accentBlue, backgroundColor: 'rgba(37, 99, 235, 0.08)' },
  head: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.textPrimary },
  name: { fontFamily: fonts.bodyMedium, fontSize: 13, color: theme.textPrimary },
  line: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: theme.textPrimary },
  shared: { gap: 2, paddingHorizontal: 2 },
  sharedLine: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16, color: theme.textMuted },
});
