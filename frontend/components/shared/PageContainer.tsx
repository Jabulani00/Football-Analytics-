import { Platform, ScrollView, StyleSheet, View, type ScrollViewProps } from 'react-native';

import { spacing } from '@/styles/theme';

type PageContainerProps = ScrollViewProps & {
  children: React.ReactNode;
  noPadding?: boolean;
};

export default function PageContainer({ children, noPadding, contentContainerStyle, ...rest }: PageContainerProps) {
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.content, noPadding && styles.noPad, contentContainerStyle]}
      showsVerticalScrollIndicator={Platform.OS === 'web'}
      {...rest}>
      {children}
    </ScrollView>
  );
}

export function PageSection({ children, style }: { children: React.ReactNode; style?: object }) {
  return <View style={[styles.section, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    width: '100%',
    ...(Platform.OS === 'web' ? ({ minHeight: 0 } as object) : {}),
  },
  content: {
    width: '100%',
    paddingHorizontal: spacing.page,
    paddingBottom: spacing.xxl,
    flexGrow: 1,
  },
  noPad: {
    paddingHorizontal: 0,
  },
  section: {
    width: '100%',
    marginBottom: spacing.lg,
  },
});
