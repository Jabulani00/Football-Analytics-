import { Platform, StyleSheet, View } from 'react-native';

import BackButton from '@/components/shared/BackButton';
import { spacing, theme } from '@/styles/theme';

type StickyBackProps = {
  label: string;
  onPress: () => void;
};

/** Back control — sticky at top on web; scrolls with page on native. */
export default function StickyBack({ label, onPress }: StickyBackProps) {
  return (
    <View style={styles.wrap}>
      <BackButton label={label} onPress={onPress} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'stretch',
    ...(Platform.OS === 'web'
      ? ({
          position: 'sticky',
          top: 0,
          zIndex: 100,
          backgroundColor: theme.bg,
          paddingTop: spacing.sm,
          marginBottom: spacing.sm,
        } as object)
      : {
          marginBottom: spacing.sm,
        }),
  },
});
