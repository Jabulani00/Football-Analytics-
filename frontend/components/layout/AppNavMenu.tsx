import { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { usePathname, useRouter, type Href } from 'expo-router';

import { fonts, layout, spacing, theme } from '@/styles/theme';

const LINKS: { href: Href; label: string; match: string }[] = [
  { href: '/', label: 'Scores', match: '/' },
  { href: '/analytics', label: 'Analytics', match: '/analytics' },
  { href: '/sl-stats', label: 'SL-STATS', match: '/sl-stats' },
  { href: '/additional-stats', label: 'Additional stats', match: '/additional-stats' },
  { href: '/stats-ordinary', label: 'Ordinary', match: '/stats-ordinary' },
  { href: '/full-time-stats', label: 'FT-Only', match: '/full-time-stats' },
];

function isCurrent(pathname: string, match: string): boolean {
  if (match === '/') return pathname === '/' || pathname === '' || pathname === '/index';
  return pathname === match || pathname.startsWith(`${match}/`);
}

/** Compact menu for phone widths. Opens the main pages as large tap targets. */
export default function AppNavMenu() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open menu"
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.trigger, pressed && styles.triggerPressed]}>
        <View style={styles.bars}>
          <View style={styles.bar} />
          <View style={styles.bar} />
          <View style={styles.bar} />
        </View>
        <Text style={styles.triggerText}>Menu</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.modal}>
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel="Close menu" />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.title}>Menu</Text>
            {LINKS.map((link) => {
              const active = isCurrent(pathname, link.match);
              return (
                <Pressable
                  key={link.match}
                  onPress={() => {
                    setOpen(false);
                    router.push(link.href);
                  }}
                  style={({ pressed }) => [styles.item, active && styles.itemActive, pressed && styles.itemPressed]}>
                  <Text style={[styles.itemText, active && styles.itemTextActive]}>{link.label}</Text>
                  {active ? <Text style={styles.here}>Here</Text> : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: layout.borderWidth,
    borderColor: theme.borderStrong,
    borderRadius: layout.borderRadius,
    backgroundColor: theme.surface,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : {}),
  },
  triggerPressed: {
    backgroundColor: theme.surfaceMuted,
  },
  bars: {
    width: 16,
    gap: 3,
  },
  bar: {
    height: 2,
    borderRadius: 1,
    backgroundColor: theme.textPrimary,
  },
  triggerText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: theme.textPrimary,
  },
  modal: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  sheet: {
    backgroundColor: theme.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    gap: spacing.xs,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.borderStrong,
    marginBottom: spacing.sm,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 20,
    color: theme.textPrimary,
    marginBottom: spacing.sm,
  },
  item: {
    minHeight: 52,
    paddingHorizontal: spacing.md,
    borderRadius: layout.borderRadius,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : {}),
  },
  itemActive: {
    backgroundColor: '#ECFDF5',
  },
  itemPressed: {
    backgroundColor: theme.surfaceMuted,
  },
  itemText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 16,
    color: theme.textPrimary,
  },
  itemTextActive: {
    fontFamily: fonts.bodySemiBold,
    color: theme.accentGreen,
  },
  here: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: theme.accentGreen,
  },
});
