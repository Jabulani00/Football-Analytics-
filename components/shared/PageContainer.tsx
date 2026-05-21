import { Platform, ScrollView, StyleSheet, View, type ScrollViewProps } from 'react-native';

import { layout, spacing, theme } from '@/styles/theme';

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
  },
  content: {
    width: '100%',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    ...(Platform.OS === 'web' ? { minHeight: '100%' as unknown as number } : {}),
  },
  noPad: {
    paddingHorizontal: 0,
  },
  section: {
    width: '100%',
    marginBottom: spacing.lg,
  },
});
