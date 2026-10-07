import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';

import PageControls from '@/components/shared/PageControls';
import { fonts, spacing, theme } from '@/styles/theme';
import type { CountedGame } from '@/utils/countedGames';

const GAME_PAGE = 8;

function when(unix: number): string {
  if (!unix) return '';
  return new Date(unix * 1000).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Games behind a stat row, opened at the top of the screen. Each one opens the match page. */
export default function IncludedGamesList({
  title,
  games,
  onClose,
}: {
  title: string;
  games: CountedGame[];
  onClose: () => void;
}) {
  const router = useRouter();
  const height = useWindowDimensions().height;
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(games.length / GAME_PAGE));
  const safe = Math.min(page, pages);
  const start = (safe - 1) * GAME_PAGE;
  const visible = games.slice(start, start + GAME_PAGE);
  const signature = `${title}|${games.length}|${games[0]?.id ?? ''}|${games[games.length - 1]?.id ?? ''}`;

  useEffect(() => {
    setPage(1);
  }, [signature]);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modal}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close games" />
        <View style={[styles.sheet, { maxHeight: Math.max(280, Math.round(height * 0.72)) }]}>
          <View style={styles.head}>
            <View style={styles.headCopy}>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.note}>These are the games counted for this row. Open one for the match.</Text>
            </View>
            <Pressable onPress={onClose} style={styles.close} accessibilityLabel="Close">
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>
          {games.length === 0 ? (
            <Text style={styles.empty}>No fixtures are tied to this row.</Text>
          ) : (
            <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
              {visible.map((game, index) => (
                <Pressable
                  key={`${game.id}-${start + index}`}
                  onPress={() => {
                    if (game.id > 0) {
                      onClose();
                      router.push({ pathname: '/match/[id]', params: { id: String(game.id) } });
                    }
                  }}
                  style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
                  <View style={styles.copy}>
                    <Text style={styles.match}>{game.match}</Text>
                    <Text style={styles.meta}>
                      {when(game.unix)}
                      {game.score ? ` · ${game.score}` : ''}
                      {game.detail ? ` · ${game.detail}` : ''}
                    </Text>
                  </View>
                  <Text style={styles.open}>Match</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
          <PageControls
            page={safe}
            pages={pages}
            total={games.length}
            from={games.length === 0 ? 0 : start + 1}
            to={start + visible.length}
            onChange={setPage}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modal: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 56,
    paddingHorizontal: spacing.md,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  sheet: {
    width: '100%',
    maxWidth: 640,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 16,
    backgroundColor: theme.surface,
    padding: spacing.md,
    gap: spacing.sm,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  headCopy: { flex: 1, gap: 4 },
  title: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 16,
    color: theme.textPrimary,
  },
  note: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: theme.textMuted,
    lineHeight: 18,
  },
  close: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.surface,
  },
  closeText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: theme.textPrimary,
  },
  empty: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: theme.textMuted,
  },
  list: { flexGrow: 0 },
  row: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  rowPressed: { backgroundColor: theme.surfaceHover },
  copy: { flex: 1, gap: 2 },
  match: {
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    color: theme.textPrimary,
  },
  meta: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textMuted,
  },
  open: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: theme.accentBlue,
  },
});
