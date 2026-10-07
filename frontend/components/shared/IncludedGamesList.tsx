import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { fonts, spacing, theme } from '@/styles/theme';
import type { CountedGame } from '@/utils/countedGames';

function when(unix: number): string {
  if (!unix) return '';
  return new Date(unix * 1000).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Finished games behind a stat row. Each one opens the match page. */
export default function IncludedGamesList({
  title,
  games,
}: {
  title: string;
  games: CountedGame[];
}) {
  const router = useRouter();
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.note}>
        These are the games counted for this row. Open one for the match.
      </Text>
      {games.length === 0 ? (
        <Text style={styles.empty}>No fixtures are tied to this row.</Text>
      ) : (
        games.map((game, index) => (
          <Pressable
            key={`${game.id}-${index}`}
            onPress={() => {
              if (game.id > 0) router.push({ pathname: '/match/[id]', params: { id: String(game.id) } });
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
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    backgroundColor: theme.surface,
    padding: spacing.md,
    gap: spacing.sm,
    maxWidth: 720,
  },
  title: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
    color: theme.textPrimary,
  },
  note: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: theme.textMuted,
    lineHeight: 18,
  },
  empty: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: theme.textMuted,
  },
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
  rowPressed: {
    backgroundColor: theme.surfaceHover,
  },
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
