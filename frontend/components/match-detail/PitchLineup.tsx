import { StyleSheet, Text, View } from 'react-native';

import type { SquadPlayer } from '@/services/oddAlerts';
import { fonts, layout, spacing, theme } from '@/styles/theme';

type PitchLineupProps = {
  teamName: string;
  players: SquadPlayer[];
  accent: string;
  formation?: string | null;
};

const SIDE_ORDER: Record<SquadPlayer['side'], number> = { left: 0, center: 1, right: 2 };

// How many players to place on the pitch per line (the rest drop to the bench).
const LINE_CAP = { GK: 1, DEF: 5, MID: 5, FWD: 4 } as const;

function sortByPitch(a: SquadPlayer, b: SquadPlayer) {
  const side = SIDE_ORDER[a.side] - SIDE_ORDER[b.side];
  if (side !== 0) return side;
  return (a.shirt ?? 99) - (b.shirt ?? 99);
}

export default function PitchLineup({ teamName, players, accent, formation }: PitchLineupProps) {
  const byLine = (pos: SquadPlayer['position']) =>
    players.filter((p) => p.position === pos).sort(sortByPitch);

  const gk = byLine('GK').slice(0, LINE_CAP.GK);
  const def = byLine('DEF').slice(0, LINE_CAP.DEF);
  const mid = byLine('MID').slice(0, LINE_CAP.MID);
  const fwd = byLine('FWD').slice(0, LINE_CAP.FWD);

  const onPitchIds = new Set([...gk, ...def, ...mid, ...fwd].map((p) => p.id));
  const bench = players.filter((p) => !onPitchIds.has(p.id));

  return (
    <View style={styles.wrap}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>{teamName}</Text>
        {formation ? <Text style={styles.formation}>{formation}</Text> : null}
      </View>

      <View style={styles.pitch}>
        {/* Field markings */}
        <View style={styles.midline} />
        <View style={styles.centerCircle} />
        <View style={styles.centerSpot} />
        <View style={styles.penaltyBox} />
        <View style={styles.goalArea} />

        <View style={styles.lines}>
          <PitchRow players={fwd} accent={accent} />
          <PitchRow players={mid} accent={accent} />
          <PitchRow players={def} accent={accent} />
          <PitchRow players={gk} accent={theme.accentOrange} />
        </View>
      </View>

      {bench.length > 0 ? (
        <View style={styles.bench}>
          <Text style={styles.benchTitle}>Squad ({bench.length})</Text>
          <View style={styles.benchList}>
            {bench.map((p) => (
              <View key={p.id} style={styles.benchChip}>
                <Text style={styles.benchShirt}>{p.shirt ?? '–'}</Text>
                <Text style={styles.benchName} numberOfLines={1}>
                  {p.shortName}
                </Text>
                {p.detailedPosition || p.position !== '—' ? (
                  <Text style={styles.benchPos}>{p.detailedPosition ?? p.position}</Text>
                ) : null}
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function PitchRow({ players, accent }: { players: SquadPlayer[]; accent: string }) {
  if (players.length === 0) return <View style={styles.rowEmpty} />;
  return (
    <View style={styles.row}>
      {players.map((p) => (
        <View key={p.id} style={styles.player}>
          <View style={[styles.jersey, { backgroundColor: accent }]}>
            <Text style={styles.jerseyNum}>{p.shirt ?? ''}</Text>
          </View>
          <Text style={styles.playerName} numberOfLines={1}>
            {p.shortName}
          </Text>
        </View>
      ))}
    </View>
  );
}

const LINE = 'rgba(255,255,255,0.35)';

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  title: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.textPrimary },
  formation: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: theme.accentGreen },
  pitch: {
    width: '100%',
    aspectRatio: 0.78,
    backgroundColor: '#15803d',
    borderRadius: layout.borderRadius,
    borderWidth: 2,
    borderColor: LINE,
    overflow: 'hidden',
    position: 'relative',
  },
  midline: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: LINE,
  },
  centerCircle: {
    position: 'absolute',
    top: '-9%',
    alignSelf: 'center',
    width: '34%',
    aspectRatio: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: LINE,
  },
  centerSpot: {
    position: 'absolute',
    top: 0,
    alignSelf: 'center',
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: LINE,
  },
  penaltyBox: {
    position: 'absolute',
    bottom: 0,
    alignSelf: 'center',
    width: '54%',
    height: '20%',
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: LINE,
  },
  goalArea: {
    position: 'absolute',
    bottom: 0,
    alignSelf: 'center',
    width: '28%',
    height: '9%',
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: LINE,
  },
  lines: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'column',
    justifyContent: 'space-around',
    paddingVertical: spacing.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
  },
  rowEmpty: { height: 1 },
  player: { alignItems: 'center', width: 58 },
  jersey: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  jerseyNum: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: '#FFFFFF' },
  playerName: {
    marginTop: 3,
    fontFamily: fonts.bodyMedium,
    fontSize: 9,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  bench: { marginTop: spacing.sm },
  benchTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    color: theme.textFaint,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  benchList: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  benchChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: theme.surfaceMuted,
    borderRadius: layout.borderRadius,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  benchShirt: { fontFamily: fonts.bodySemiBold, fontSize: 10, color: theme.textMuted },
  benchName: { fontFamily: fonts.bodyMedium, fontSize: 11, color: theme.textPrimary, maxWidth: 110 },
  benchPos: { fontFamily: fonts.body, fontSize: 9, color: theme.textFaint },
});
