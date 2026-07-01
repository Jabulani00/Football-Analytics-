import { StyleSheet, Text, View } from 'react-native';

import SectionLabel from '@/components/shared/SectionLabel';
import type { H2HResult } from '@/mock/matchData';
import { fonts, layout, spacing, theme } from '@/styles/theme';

type H2HListProps = {
  results: H2HResult[];
  homeTeamName: string;
  awayTeamName: string;
};

function parseScore(score: string): [number, number] {
  const [h, a] = score.split('-').map((s) => parseInt(s.trim(), 10));
  return [h ?? 0, a ?? 0];
}

function homeTeamResult(
  result: H2HResult,
  currentHome: string,
): 'W' | 'D' | 'L' {
  const [hg, ag] = parseScore(result.score);
  const wasHome = result.home === currentHome;
  const teamGoals = wasHome ? hg : ag;
  const oppGoals = wasHome ? ag : hg;
  if (teamGoals > oppGoals) return 'W';
  if (teamGoals < oppGoals) return 'L';
  return 'D';
}

function scoreTint(
  result: H2HResult,
  currentHome: string,
  currentAway: string,
): 'win' | 'loss' | 'draw' | null {
  const r = homeTeamResult(result, currentHome);
  if (r === 'W') return 'win';
  if (r === 'L') return 'loss';
  return 'draw';
}

function buildSummary(results: H2HResult[], homeTeamName: string): string {
  let w = 0;
  let d = 0;
  let l = 0;
  for (const r of results) {
    const res = homeTeamResult(r, homeTeamName);
    if (res === 'W') w++;
    else if (res === 'D') d++;
    else l++;
  }
  return `${homeTeamName} W${w} D${d} L${l} in last 5 meetings`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function H2HRow({
  result,
  currentHome,
  currentAway,
}: {
  result: H2HResult;
  currentHome: string;
  currentAway: string;
}) {
  const tint = scoreTint(result, currentHome, currentAway);
  const scoreStyle =
    tint === 'win'
      ? styles.scoreWin
      : tint === 'loss'
        ? styles.scoreLoss
        : styles.scoreDraw;
  const form = homeTeamResult(result, currentHome);
  const formColor =
    form === 'W' ? theme.win : form === 'L' ? theme.loss : theme.yellow;

  return (
    <View style={styles.row}>
      <View style={styles.rowTop}>
        <Text style={styles.date}>{formatDate(result.date)}</Text>
        <View style={styles.compBadge}>
          <Text style={styles.compText} numberOfLines={1}>
            {result.competition}
          </Text>
        </View>
      </View>
      <View style={styles.fixture}>
        <Text style={styles.team} numberOfLines={1}>
          {result.home}
        </Text>
        <Text style={[styles.score, scoreStyle]}>{result.score}</Text>
        <Text style={[styles.team, styles.teamRight]} numberOfLines={1}>
          {result.away}
        </Text>
        <Text style={[styles.formLabel, { color: formColor }]}>{form}</Text>
      </View>
    </View>
  );
}

export default function H2HList({ results, homeTeamName, awayTeamName }: H2HListProps) {
  return (
    <View style={styles.container}>
      <SectionLabel style={styles.heading}>HEAD TO HEAD — LAST 5 MEETINGS</SectionLabel>
      {results.map((result) => (
        <H2HRow
          key={result.date + result.score}
          result={result}
          currentHome={homeTeamName}
          currentAway={awayTeamName}
        />
      ))}
      <Text style={styles.summary}>{buildSummary(results, homeTeamName)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    backgroundColor: theme.surface,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
  },
  heading: {
    marginBottom: spacing.lg,
  },
  row: {
    paddingVertical: spacing.md,
    borderBottomWidth: layout.borderWidth,
    borderBottomColor: theme.border,
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  date: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textMuted,
  },
  compBadge: {
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: layout.borderRadius,
    maxWidth: '55%',
  },
  compText: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: theme.textMuted,
  },
  fixture: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  team: {
    flex: 1,
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    color: theme.textPrimary,
  },
  teamRight: {
    textAlign: 'right',
  },
  score: {
    fontFamily: fonts.display,
    fontSize: 16,
    minWidth: 44,
    textAlign: 'center',
  },
  scoreWin: {
    color: theme.accentGreen,
  },
  scoreLoss: {
    color: theme.accentOrange,
  },
  scoreDraw: {
    color: theme.yellow,
  },
  formLabel: {
    fontFamily: fonts.display,
    fontSize: 14,
    width: 20,
    textAlign: 'center',
  },
  summary: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textMuted,
    marginTop: spacing.lg,
    fontStyle: 'italic',
  },
});
