import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import FilterDropdown from '@/components/shared/FilterDropdown';
import { colourWord, type PowerDynamicsBundle, type SideSnapshot, type TableColour } from '@/utils/powerDynamicsEngine';
import {
  COLOUR_PERIODS,
  COLOUR_STAT_CATALOGUE,
  COLOUR_VENUES,
  MIN_COLOUR_OPPONENT_MATCHES,
  bandForTeam,
  colourDaLean,
  colourDifferenceDecimals,
  colourPairBetween,
  colourPairDifferences,
  colourPeriodLabel,
  colourStatById,
  colourVenueLabel,
  countMatchesAgainstColour,
  formatColourStatValue,
  passesColourPosition,
  rateOnFullTable,
  ratesAgainstColours,
  type ColourDaLean,
  type ColourDifference,
  type ColourDirection,
  type ColourFixture,
  type ColourPeriodId,
  type ColourRateRow,
  type ColourStat,
  type ColourVenue,
} from '@/utils/colourVerification';
import type { Band } from '@/utils/leagueTables';
import { fonts, layout, spacing, theme } from '@/styles/theme';

const COLOUR_HEX: Record<TableColour, string> = {
  green: '#16A34A',
  yellow: '#CA8A04',
  red: '#DC2626',
};

type StandingRef = { teamId: number; rank: number; name: string };

type Props = {
  pd: PowerDynamicsBundle;
  standings: StandingRef[];
  matches: ColourFixture[];
  matchesLoading: boolean;
  matchesError: string | null;
  seasonLinked: boolean;
};

type SidePick = {
  statId: string;
  venue: '' | ColourVenue;
  period: '' | ColourPeriodId;
  direction: '' | ColourDirection;
};

const EMPTY_PICK: SidePick = { statId: '', venue: '', period: '', direction: '' };

export default function ColourVerificationPanel({
  pd,
  standings,
  matches,
  matchesLoading,
  matchesError,
  seasonLinked,
}: Props) {
  const wide = useWindowDimensions().width >= 860;
  const [picks, setPicks] = useState<{ t1: SidePick; t2: SidePick }>({ t1: EMPTY_PICK, t2: EMPTY_PICK });
  const statOptions = useMemo(
    () => COLOUR_STAT_CATALOGUE.map((stat) => ({ value: stat.id, label: stat.label })),
    [],
  );

  const setPick = (side: 't1' | 't2', patch: Partial<SidePick>) => {
    setPicks((current) => ({ ...current, [side]: { ...current[side], ...patch } }));
  };

  return (
    <View>
      <Text style={styles.title}>Colour verification</Text>
      <Text style={styles.note}>
        Pick a stat, then overall, home or away, then full time, 1st half or 2nd half. Finish with Strong or Weak.
        The ranking is your own figure against the green, yellow and red tables.
        Strong numbers position 1 as your highest figure. Weak numbers position 1 as your smallest figure, then up to the highest.
        The read opens after 3 matches against the opponent’s colour in that split.
        See difference compares Red with Green, Yellow with Green, and Red with Yellow. Each pair is None DA at 0–15, Lean DA at 16–24, and DA at 25+. Percent stats use point gaps; raw stats use relative gaps.
        Up is the higher figure in that pair and Down is the lower one, including when both figures are under 50%.
      </Text>
      <View style={styles.rules}>
        <Rule title="Strong" body="Position 1 is your highest figure. Successful at position 1 or 2." />
        <Rule title="Weak" body="Position 1 is your smallest figure, then up to the highest. Successful at position 2 or 3." />
        <Rule title="Sample" body="At least 3 matches vs the opponent’s colour." />
      </View>
      {!seasonLinked ? (
        <Text style={styles.muted}>No season is linked to this fixture, so matches against each colour cannot be counted.</Text>
      ) : standings.length === 0 ? (
        <Text style={styles.muted}>Need a league table to know which colour each opponent belongs to.</Text>
      ) : (
        <View style={[styles.grid, wide && styles.gridWide]}>
          <SideVerify
            snap={pd.t1}
            opponent={pd.t2}
            pick={picks.t1}
            onChange={(patch) => setPick('t1', patch)}
            standings={standings}
            matches={matches}
            matchesLoading={matchesLoading}
            matchesError={matchesError}
            statOptions={statOptions}
          />
          <SideVerify
            snap={pd.t2}
            opponent={pd.t1}
            pick={picks.t2}
            onChange={(patch) => setPick('t2', patch)}
            standings={standings}
            matches={matches}
            matchesLoading={matchesLoading}
            matchesError={matchesError}
            statOptions={statOptions}
          />
        </View>
      )}
    </View>
  );
}

function Rule({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.rule}>
      <Text style={styles.ruleTitle}>{title}</Text>
      <Text style={styles.ruleBody}>{body}</Text>
    </View>
  );
}

function SideVerify({
  snap,
  opponent,
  pick,
  onChange,
  standings,
  matches,
  matchesLoading,
  matchesError,
  statOptions,
}: {
  snap: SideSnapshot;
  opponent: SideSnapshot;
  pick: SidePick;
  onChange: (patch: Partial<SidePick>) => void;
  standings: StandingRef[];
  matches: ColourFixture[];
  matchesLoading: boolean;
  matchesError: string | null;
  statOptions: { value: string; label: string }[];
}) {
  const colour = bandForTeam(opponent.teamId, standings) ?? opponent.colour;
  const ownColour = bandForTeam(snap.teamId, standings) ?? snap.colour;
  const [seeDifference, setSeeDifference] = useState(false);
  const venue = pick.venue || 'overall';
  const played = colour != null && snap.teamId != null
    ? countMatchesAgainstColour(snap.teamId, colour, standings, matches, venue)
    : 0;
  const enough = played >= MIN_COLOUR_OPPONENT_MATCHES;
  const stat = colourStatById(pick.statId);
  const periodOptions = useMemo(
    () => COLOUR_PERIODS.filter((item) => stat?.periods.includes(item.id)).map((item) => ({ value: item.id, label: item.label })),
    [stat],
  );
  const ranking: ColourDirection = pick.direction === 'weak' ? 'weak' : 'strong';
  const rates = useMemo(() => {
    if (!stat || !pick.venue || !pick.period || snap.teamId == null) return [];
    return ratesAgainstColours(snap.teamId, stat, standings, matches, ranking, pick.venue, pick.period);
  }, [stat, pick.venue, pick.period, snap.teamId, standings, matches, ranking]);
  const fullTable = useMemo(() => {
    if (!stat || !pick.venue || !pick.period || snap.teamId == null) return null;
    return rateOnFullTable(snap.teamId, stat, matches, pick.venue, pick.period);
  }, [stat, pick.venue, pick.period, snap.teamId, matches]);
  const opponentRate = colour != null ? rates.find((row) => row.colour === colour) ?? null : null;
  const opponentFails = (pick.direction === 'strong' || pick.direction === 'weak')
    && opponentRate?.position != null
    && !passesColourPosition(opponentRate.position, pick.direction);

  return (
    <View style={styles.card}>
      <View style={[styles.bar, { backgroundColor: colour ? COLOUR_HEX[colour] : theme.borderStrong }]} />
      <Text style={styles.kicker}>{snap.label}</Text>
      <View style={styles.oppLine}>
        <Text style={styles.oppName} numberOfLines={1}>{opponent.name}</Text>
        <View style={[styles.chip, { backgroundColor: colour ? COLOUR_HEX[colour] : theme.surfaceMuted }]}>
          <Text style={[styles.chipText, !colour && styles.chipTextMuted]}>
            {colour ? `${colourWord(colour)} table` : 'No colour'}
          </Text>
        </View>
      </View>
      <SampleLine
        colour={colour}
        played={played}
        enough={enough}
        venue={pick.venue}
        loading={matchesLoading}
        error={matchesError}
      />

      <FilterDropdown
        label="Stat"
        value={pick.statId}
        options={statOptions}
        emptyLabel="Choose a stat"
        onChange={(statId) => onChange({ statId, venue: '', period: '' })}
        style={styles.dropdown}
      />
      {pick.statId ? (
        <FilterDropdown
          label="Where"
          value={pick.venue}
          options={COLOUR_VENUES.map((item) => ({ value: item.id, label: item.label }))}
          emptyLabel="Overall, home or away"
          onChange={(next) => onChange({ venue: next as ColourVenue })}
          style={styles.dropdown}
        />
      ) : null}
      {pick.statId && pick.venue ? (
        <FilterDropdown
          label="When"
          value={pick.period}
          options={periodOptions}
          emptyLabel="Full time, 1st half or 2nd half"
          onChange={(next) => onChange({ period: next as ColourPeriodId })}
          style={styles.dropdown}
        />
      ) : null}
      {pick.statId && pick.venue && pick.period ? (
        <>
          <Text style={styles.fieldLabel}>Filter</Text>
          <View style={styles.directions}>
            <DirectionButton
              label="Strong"
              hint="Highest · 1–2"
              active={pick.direction === 'strong'}
              onPress={() => onChange({ direction: 'strong' })}
            />
            <DirectionButton
              label="Weak"
              hint="Pos 2–3"
              active={pick.direction === 'weak'}
              onPress={() => onChange({ direction: 'weak' })}
            />
          </View>
        </>
      ) : null}

      <Verdict
        colour={colour}
        enough={enough}
        played={played}
        matchesLoading={matchesLoading}
        matchesError={matchesError}
        stat={stat ?? null}
        venue={pick.venue}
        period={pick.period}
        direction={pick.direction}
        opponentName={opponent.name}
        position={opponentRate?.position ?? null}
        missingValue={stat != null && pick.venue !== '' && pick.period !== '' && opponentRate != null && opponentRate.value == null}
      />

      {opponentFails && enough && stat && pick.venue && pick.period ? (
        <Text style={styles.failNote}>
          {opponent.name} is in an unsuccessful position
          {opponentRate?.position != null ? ` (${opponentRate.position})` : ''}.
        </Text>
      ) : null}

      {stat && pick.venue && pick.period && fullTable ? (
        <>
          <View style={styles.fullTable}>
            <View style={styles.fullTableCopy}>
              <Text style={styles.fullTableTitle}>Full table</Text>
              <Text style={styles.fullTableHint}>Your {stat.name} before the matches are split into colours.</Text>
            </View>
            <View style={styles.fullTableFigure}>
              <Text style={styles.fullTableValue}>
                {fullTable.value == null ? '—' : formatColourStatValue(stat, fullTable.value)}
              </Text>
              <Text style={styles.fullTablePlayed}>
                {fullTable.played} match{fullTable.played === 1 ? '' : 'es'}
              </Text>
            </View>
          </View>
          <ColourRates
            stat={stat}
            rows={rates}
            opponentColour={colour}
            direction={enough ? pick.direction : ''}
          />
          <Pressable
            onPress={() => setSeeDifference((on) => !on)}
            style={[styles.seeDiff, seeDifference && styles.seeDiffOn]}
            accessibilityRole="button"
            accessibilityState={{ selected: seeDifference }}>
            <Text style={[styles.seeDiffLabel, seeDifference && styles.seeDiffLabelOn]}>See difference</Text>
            <Text style={[styles.seeDiffHint, seeDifference && styles.seeDiffHintOn]}>
              Largest gap is DA. Up is the higher figure, even under 50%.
            </Text>
          </Pressable>
          {seeDifference ? (
            <ColourDifferences
              stat={stat}
              rows={rates}
              ownColour={ownColour}
              opponentColour={colour}
              ownLabel={snap.label}
              opponentLabel={opponent.label}
            />
          ) : null}
        </>
      ) : (
        <Text style={styles.prompt}>
          {!pick.statId
            ? 'Choose a stat first.'
            : !pick.venue
              ? 'Choose overall, home or away.'
              : 'Choose full time, 1st half or 2nd half.'}
        </Text>
      )}
    </View>
  );
}

function SampleLine({
  colour,
  played,
  enough,
  venue,
  loading,
  error,
}: {
  colour: TableColour | null;
  played: number;
  enough: boolean;
  venue: '' | ColourVenue;
  loading: boolean;
  error: string | null;
}) {
  if (!colour) return <Text style={styles.sampleMuted}>Opponent colour is not on this table.</Text>;
  if (error) return <Text style={styles.sampleBad}>{error}</Text>;
  if (loading) return <Text style={styles.sampleMuted}>Counting matches against {colourWord(colour).toLowerCase()} teams…</Text>;
  const fill = Math.min(100, (played / MIN_COLOUR_OPPONENT_MATCHES) * 100);
  const place = venue === 'home' ? 'home ' : venue === 'away' ? 'away ' : '';
  const versus = `${place}matches vs ${colourWord(colour).toLowerCase()} teams`;
  return (
    <View style={styles.sampleBlock}>
      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            { width: `${fill}%`, backgroundColor: enough ? theme.accentGreen : theme.accentOrange },
          ]}
        />
      </View>
      <Text style={[styles.sampleText, enough ? styles.sampleGood : styles.sampleWait]}>
        {enough
          ? `${played} ${versus}`
          : `${played} of ${MIN_COLOUR_OPPONENT_MATCHES} ${versus}`}
      </Text>
    </View>
  );
}

function DirectionButton({
  label,
  hint,
  active,
  onPress,
}: {
  label: string;
  hint: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.direction, active && styles.directionOn]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}>
      <Text style={[styles.directionLabel, active && styles.directionLabelOn]}>{label}</Text>
      <Text style={[styles.directionHint, active && styles.directionHintOn]}>{hint}</Text>
    </Pressable>
  );
}

function Verdict({
  colour,
  enough,
  played,
  matchesLoading,
  matchesError,
  stat,
  venue,
  period,
  direction,
  opponentName,
  position,
  missingValue,
}: {
  colour: TableColour | null;
  enough: boolean;
  played: number;
  matchesLoading: boolean;
  matchesError: string | null;
  stat: ColourStat | null;
  venue: '' | ColourVenue;
  period: '' | ColourPeriodId;
  direction: '' | ColourDirection;
  opponentName: string;
  position: number | null;
  missingValue: boolean;
}) {
  if (!colour) {
    return <Banner tone="wait" title="Waiting" body="The opponent needs a green, yellow, or red table place." />;
  }
  if (matchesLoading) {
    return <Banner tone="wait" title="Checking sample" body="Finished matches against this colour are still loading." />;
  }
  if (matchesError) {
    return <Banner tone="bad" title="Sample unknown" body="Finished matches could not be loaded, so the 3-match check cannot run." />;
  }
  if (!enough) {
    return (
      <Banner
        tone="wait"
        title="Not ready"
        body={`${played} match${played === 1 ? '' : 'es'} against ${colourWord(colour).toLowerCase()} teams. Colour verification needs ${MIN_COLOUR_OPPONENT_MATCHES}.`}
      />
    );
  }
  if (!stat) return <Banner tone="wait" title="Choose a stat" body="Start with the stat. Venue and period come next." />;
  if (!venue) return <Banner tone="wait" title="Choose where" body="Overall, home or away." />;
  if (!period) return <Banner tone="wait" title="Choose when" body="Full time, 1st half or 2nd half." />;
  if (!direction) return <Banner tone="wait" title="Choose Strong or Weak" body="Strong passes at 1 or 2 from the highest figure. Weak passes at 2 or 3, with position 1 the smallest figure." />;
  if (position == null || missingValue) {
    return <Banner tone="wait" title="No figure" body={`${stat.name} has no figure against the ${colourWord(colour).toLowerCase()} table.`} />;
  }
  const pass = passesColourPosition(position, direction);
  const split = `${colourVenueLabel(venue)}, ${colourPeriodLabel(period).toLowerCase()}`;
  const rule = direction === 'strong'
    ? 'Strong passes at position 1 or 2, with position 1 the highest figure.'
    : 'Weak passes at position 2 or 3. Position 1, the smallest figure, does not pass.';
  if (!pass) {
    return (
      <Banner
        tone="bad"
        title="Unsuccessful position"
        body={`${opponentName} is in an unsuccessful position. ${colourWord(colour)} is position ${position} on your ${stat.name} (${split}). ${rule}`}
      />
    );
  }
  return (
    <Banner
      tone="good"
      title="Successful"
      body={`${colourWord(colour)} is position ${position} on your ${stat.name} (${split}). ${rule}`}
    />
  );
}

function Banner({ tone, title, body }: { tone: 'good' | 'bad' | 'wait'; title: string; body: string }) {
  return (
    <View style={[styles.banner, tone === 'good' && styles.bannerGood, tone === 'bad' && styles.bannerBad, tone === 'wait' && styles.bannerWait]}>
      <Text style={[styles.bannerTitle, tone === 'good' && styles.bannerTitleGood, tone === 'bad' && styles.bannerTitleBad]}>{title}</Text>
      <Text style={styles.bannerBody}>{body}</Text>
    </View>
  );
}

function ColourDifferences({
  stat,
  rows,
  ownColour,
  opponentColour,
  ownLabel,
  opponentLabel,
}: {
  stat: ColourStat;
  rows: ColourRateRow[];
  ownColour: TableColour | null;
  opponentColour: TableColour | null;
  ownLabel: string;
  opponentLabel: string;
}) {
  const differences = colourPairDifferences(rows, colourDifferenceDecimals(stat), !stat.raw);
  const pair = colourPairBetween(differences, ownColour, opponentColour);
  const agents = pair?.isDA === true;
  const lean = colourDaLean(pair, opponentColour);
  return (
    <View style={styles.diffBlock}>
      <Text style={styles.ladderTitle}>Difference between colours</Text>
      {differences.map((row) => {
        const rowLean = row.isDA && row.key === pair?.key ? lean : null;
        const badge = row.band === 'da' ? 'DA' : row.band === 'lean' ? 'Lean DA' : row.band === 'none' ? 'None DA' : '—';
        return (
          <View key={row.key} style={[styles.diffRow, row.isDA && styles.diffDA]}>
            <View style={styles.colourCell}>
              <View style={[styles.swatch, { backgroundColor: COLOUR_HEX[row.left] }]} />
              <View style={[styles.swatch, { backgroundColor: COLOUR_HEX[row.right] }]} />
              <Text style={[styles.ladderName, row.isDA && styles.diffNameDA]} numberOfLines={1}>
                {colourWord(row.left)} vs {colourWord(row.right)}
              </Text>
            </View>
            <Text style={styles.diffValue}>
              {row.difference == null ? '—' : formatColourStatValue(stat, row.difference)}
            </Text>
            <View style={styles.diffTags}>
              <Text style={row.isDA ? styles.diffBadgeOn : styles.diffBadgeOff}>{badge}</Text>
              {rowLean ? <LeanTag lean={rowLean} /> : null}
            </View>
          </View>
        );
      })}
      <View style={[styles.daCallout, agents && styles.daCalloutOn]}>
        <View style={styles.daTitleRow}>
          <Text style={[styles.daTitle, agents && styles.daTitleOn]}>{agents ? 'Double Agent' : 'Double Agent check'}</Text>
          {lean ? <LeanTag lean={lean} /> : null}
        </View>
        <Text style={styles.daBody}>
          {doubleAgentCopy(ownLabel, opponentLabel, ownColour, opponentColour, pair, stat, lean)}
        </Text>
      </View>
    </View>
  );
}

function LeanTag({ lean }: { lean: ColourDaLean }) {
  const up = lean === 'up';
  return (
    <View style={[styles.leanTag, up ? styles.leanTagUp : styles.leanTagDown]}>
      <Text style={[styles.leanTagText, up ? styles.leanTagTextUp : styles.leanTagTextDown]}>{up ? 'Up' : 'Down'}</Text>
    </View>
  );
}

function doubleAgentCopy(
  ownLabel: string,
  opponentLabel: string,
  ownColour: TableColour | null,
  opponentColour: TableColour | null,
  pair: ColourDifference | null,
  stat: ColourStat,
  lean: ColourDaLean | null,
): string {
  if (ownColour == null || opponentColour == null) {
    return 'Both sides need a table colour before this gap can be read.';
  }
  if (ownColour === opponentColour) {
    return `${ownLabel} and ${opponentLabel} are both ${colourWord(ownColour)}. Double Agent needs the two sides on different colours.`;
  }
  const sides = `${ownLabel} (${colourWord(ownColour)}) and ${opponentLabel} (${colourWord(opponentColour)})`;
  if (pair == null || pair.difference == null) {
    return `${sides} are different colours. One of those figures is missing, so their gap cannot be read.`;
  }
  const gap = formatColourStatValue(stat, pair.difference);
  const between = `${colourWord(pair.left)} vs ${colourWord(pair.right)}`;
  const direction = lean === 'up'
    ? `This is Up. ${opponentLabel} is on ${colourWord(opponentColour)}, the higher figure.`
    : lean === 'down'
      ? `This is Down. ${opponentLabel} is on ${colourWord(opponentColour)}, the lower figure.`
      : '';
  if (pair.isDA) {
    const base = `${sides} are Double Agents. ${between} has a DA gap of ${gap} (at least 25).`;
    return direction ? `${base} ${direction}` : base;
  }
  const status = pair.band === 'lean' ? 'Lean DA (16–24)' : pair.band === 'none' ? 'None DA (0–15)' : 'not classifiable';
  const base = `${sides} differ by ${gap}. This pair is ${status}; DA starts at 25.`;
  return direction ? `${base} ${direction}` : base;
}

function ColourRates({
  stat,
  rows,
  opponentColour,
  direction,
}: {
  stat: ColourStat;
  rows: ColourRateRow[];
  opponentColour: Band | null;
  direction: '' | ColourDirection;
}) {
  const ordered = [...rows].sort((a, b) => {
    if (a.position == null && b.position == null) return a.colour.localeCompare(b.colour);
    if (a.position == null) return 1;
    if (b.position == null) return -1;
    if (a.position !== b.position) return a.position - b.position;
    return (b.value ?? 0) - (a.value ?? 0) || a.colour.localeCompare(b.colour);
  });
  return (
    <View style={styles.table}>
      <Text style={styles.ladderTitle}>Your {stat.name} against each colour</Text>
      <View style={[styles.ladderRow, styles.tableHead]}>
        <Text style={[styles.pos, styles.headCell]}>Pos</Text>
        <Text style={[styles.ladderName, styles.headCell]}>Colour</Text>
        <Text style={[styles.playedCol, styles.headCell]}>Matches</Text>
        <Text style={[styles.ladderValue, styles.headCell, styles.valueHead]}>Figure</Text>
      </View>
      {ordered.map((row) => {
        const focus = row.colour === opponentColour;
        const pass = direction !== '' && row.position != null && passesColourPosition(row.position, direction);
        const fail = direction !== '' && row.position != null && !pass;
        return (
          <View
            key={row.colour}
            style={[
              styles.ladderRow,
              styles.tableBody,
              focus && styles.ladderFocus,
              pass && styles.ladderPass,
              fail && styles.ladderFail,
            ]}>
            <Text style={[styles.pos, { color: COLOUR_HEX[row.colour] }]}>{row.position ?? '—'}</Text>
            <View style={styles.colourCell}>
              <View style={[styles.swatch, { backgroundColor: COLOUR_HEX[row.colour] }]} />
              <Text style={[styles.ladderName, focus && styles.ladderNameFocus, fail && styles.ladderFailText]} numberOfLines={2}>
                {colourWord(row.colour)}
                {focus ? ' · opponent' : ''}
                {fail ? ' · unsuccessful' : ''}
              </Text>
            </View>
            <Text style={styles.playedCol}>{row.played}</Text>
            <Text style={styles.ladderValue}>{row.value == null ? '—' : formatColourStatValue(stat, row.value)}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontFamily: fonts.display,
    fontSize: 18,
    color: theme.textPrimary,
    letterSpacing: 0.4,
    marginBottom: spacing.xs,
  },
  note: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    color: theme.textMuted,
    marginBottom: spacing.sm,
  },
  rules: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  rule: {
    flexGrow: 1,
    flexBasis: 180,
    backgroundColor: theme.surface,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    padding: spacing.sm,
  },
  ruleTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: theme.textPrimary,
    marginBottom: 2,
  },
  ruleBody: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16, color: theme.textMuted },
  muted: { fontFamily: fonts.body, fontSize: 13, color: theme.textMuted, paddingVertical: spacing.sm },
  grid: { gap: spacing.sm },
  gridWide: { flexDirection: 'row', alignItems: 'flex-start' },
  card: {
    flex: 1,
    minWidth: 280,
    backgroundColor: theme.surface,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    padding: spacing.md,
    overflow: 'hidden',
  },
  bar: { height: 4, borderRadius: 99, marginBottom: spacing.sm },
  kicker: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: theme.textPrimary },
  oppLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 4, marginBottom: spacing.sm },
  oppName: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 13, color: theme.textMuted },
  chip: { borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3 },
  chipText: { fontFamily: fonts.bodySemiBold, fontSize: 10, color: '#FFFFFF', letterSpacing: 0.3 },
  chipTextMuted: { color: theme.textMuted },
  sampleBlock: { marginBottom: spacing.sm },
  track: { height: 6, borderRadius: 99, backgroundColor: theme.surfaceMuted, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 99 },
  sampleText: { fontFamily: fonts.bodyMedium, fontSize: 12, marginTop: 4 },
  sampleGood: { color: theme.accentGreen },
  sampleWait: { color: theme.accentOrange },
  sampleMuted: { fontFamily: fonts.body, fontSize: 12, color: theme.textMuted, marginBottom: spacing.sm },
  sampleBad: { fontFamily: fonts.body, fontSize: 12, color: theme.loss, marginBottom: spacing.sm },
  dropdown: { width: '100%', minWidth: 0, flexBasis: 'auto', flexGrow: 0, marginBottom: spacing.sm },
  fieldLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    color: theme.textMuted,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  directions: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  direction: {
    flex: 1,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    backgroundColor: theme.bg,
  },
  directionOn: { backgroundColor: theme.textPrimary, borderColor: theme.textPrimary },
  directionLabel: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: theme.textPrimary },
  directionLabelOn: { color: theme.surface },
  directionHint: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted, marginTop: 1 },
  directionHintOn: { color: '#E2E8F0' },
  banner: { borderRadius: layout.borderRadius, padding: spacing.sm, marginBottom: spacing.sm },
  bannerGood: { backgroundColor: 'rgba(5, 150, 105, 0.12)' },
  bannerBad: { backgroundColor: 'rgba(220, 38, 38, 0.1)' },
  bannerWait: { backgroundColor: theme.bg },
  bannerTitle: { fontFamily: fonts.display, fontSize: 16, letterSpacing: 0.4, color: theme.textPrimary },
  bannerTitleGood: { color: theme.accentGreen },
  bannerTitleBad: { color: theme.loss },
  bannerBody: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16, color: theme.textMuted, marginTop: 2 },
  prompt: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: theme.textMuted },
  fullTable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    backgroundColor: theme.bg,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  fullTableCopy: { flex: 1, minWidth: 0 },
  fullTableTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: theme.textPrimary,
  },
  fullTableHint: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16, color: theme.textMuted, marginTop: 2 },
  fullTableFigure: { alignItems: 'flex-end' },
  fullTableValue: { fontFamily: fonts.display, fontSize: 22, color: theme.textPrimary },
  fullTablePlayed: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted, marginTop: 1 },
  failNote: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    lineHeight: 18,
    color: theme.loss,
    marginBottom: spacing.sm,
  },
  table: {
    marginTop: spacing.xs,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    overflow: 'hidden',
  },
  ladderTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: theme.textMuted,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  ladderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 8,
    paddingHorizontal: spacing.sm,
  },
  tableHead: {
    borderTopWidth: layout.borderWidth,
    borderBottomWidth: layout.borderWidth,
    borderColor: theme.border,
    backgroundColor: theme.surfaceMuted,
  },
  tableBody: { borderBottomWidth: layout.borderWidth, borderBottomColor: theme.border },
  headCell: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: theme.textMuted,
  },
  ladderFocus: { backgroundColor: theme.surfaceMuted },
  ladderPass: { backgroundColor: 'rgba(5, 150, 105, 0.1)' },
  ladderFail: { backgroundColor: 'rgba(220, 38, 38, 0.1)' },
  ladderFailText: { color: theme.loss },
  pos: { width: 36, fontFamily: fonts.display, fontSize: 18, textAlign: 'center' },
  colourCell: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minWidth: 0 },
  swatch: { width: 8, height: 18, borderRadius: 99 },
  ladderName: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: theme.textPrimary },
  ladderNameFocus: { fontFamily: fonts.bodySemiBold },
  playedCol: { width: 64, fontFamily: fonts.bodyMedium, fontSize: 13, color: theme.textPrimary, textAlign: 'center' },
  ladderValue: { width: 72, fontFamily: fonts.display, fontSize: 16, color: theme.textPrimary, textAlign: 'right' },
  valueHead: { textAlign: 'right' },
  seeDiff: {
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    backgroundColor: theme.bg,
    marginTop: spacing.sm,
  },
  seeDiffOn: { backgroundColor: theme.textPrimary, borderColor: theme.textPrimary },
  seeDiffLabel: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: theme.textPrimary },
  seeDiffLabelOn: { color: theme.surface },
  seeDiffHint: { fontFamily: fonts.body, fontSize: 11, color: theme.textMuted, marginTop: 1, textAlign: 'center' },
  seeDiffHintOn: { color: '#E2E8F0' },
  diffBlock: {
    marginTop: spacing.sm,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    borderRadius: layout.borderRadius,
    overflow: 'hidden',
  },
  diffRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 8,
    paddingHorizontal: spacing.sm,
    borderTopWidth: layout.borderWidth,
    borderTopColor: theme.border,
  },
  diffDA: { backgroundColor: 'rgba(124, 58, 237, 0.12)' },
  diffNameDA: { fontFamily: fonts.bodySemiBold },
  diffValue: { width: 72, fontFamily: fonts.display, fontSize: 16, color: theme.textPrimary, textAlign: 'right' },
  diffTags: { width: 78, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 4 },
  diffBadgeOn: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: theme.accentPurple },
  diffBadgeOff: { fontFamily: fonts.bodySemiBold, fontSize: 11, color: theme.textMuted },
  leanTag: { borderRadius: 99, paddingHorizontal: 7, paddingVertical: 2 },
  leanTagUp: { backgroundColor: 'rgba(5, 150, 105, 0.16)' },
  leanTagDown: { backgroundColor: 'rgba(220, 38, 38, 0.14)' },
  leanTagText: { fontFamily: fonts.bodySemiBold, fontSize: 11, letterSpacing: 0.3 },
  leanTagTextUp: { color: theme.accentGreen },
  leanTagTextDown: { color: theme.loss },
  daCallout: {
    borderTopWidth: layout.borderWidth,
    borderTopColor: theme.border,
    padding: spacing.sm,
    backgroundColor: theme.bg,
  },
  daCalloutOn: { backgroundColor: 'rgba(124, 58, 237, 0.12)' },
  daTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  daTitle: {
    fontFamily: fonts.display,
    fontSize: 15,
    letterSpacing: 0.4,
    color: theme.textPrimary,
  },
  daTitleOn: { color: theme.accentPurple },
  daBody: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16, color: theme.textMuted, marginTop: 2 },
});
