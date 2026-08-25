/**
 * Qualification and relegation zones, per competition.
 *
 * The OddAlerts API does not carry this. `stats/season/:id` returns a full
 * league table but nothing about what the positions *mean*, and there is no
 * standings/zones endpoint (`stats` accepts only `season` or `fixture`). So the
 * rules live here, keyed by OddAlerts competition id.
 *
 * A competition with no entry gets **no zones** rather than guessed ones. That
 * is deliberate: the previous implementation hardcoded lines after positions
 * 3/6/9/11 for every competition in the feed — over a thousand of them — which
 * was wrong nearly everywhere.
 *
 * ⚠️ Review each season. Slot allocation is not static: under UEFA the two
 * best-performing leagues by coefficient gain an extra Champions League place,
 * and domestic-cup winners can shift the Europa and Conference slots down a
 * position. CAF allocations move too. Treat these as the standard allocation,
 * not a guarantee for a given year.
 *
 * ⚠️ Cup-winner places are deliberately absent. Scotland's Europa League place
 * belongs to the Scottish Cup winner and South Africa's CAF Confederation Cup
 * place to the Nedbank Cup winner — neither maps to a league position, so
 * neither is drawn. Showing them against an arbitrary row would be a guess, and
 * the point of this module is to stop guessing.
 */

/**
 * Zone kinds are continent-neutral: they select a colour, while `label` carries
 * the real competition name. South Africa's top clubs enter the **CAF**
 * Champions League and Confederation Cup, not the UEFA ones, so naming these
 * 'champions' / 'europa' would be wrong outside Europe.
 */
export type ZoneKind =
  | 'continentalTop'
  | 'continentalTopQual'
  | 'continentalSecond'
  | 'continentalThird'
  | 'relegationPlayoff'
  | 'relegation';

/**
 * One band of the table. Anchor qualification bands to the top (`from`/`to`)
 * and demotion bands to the bottom (`fromBottom`/`toBottom`, where 1 is last
 * place) — leagues change size between seasons, and a bottom-anchored rule
 * survives that where a top-anchored one silently rots.
 */
export type ZoneRule = {
  kind: ZoneKind;
  label: string;
} & ({ from: number; to: number } | { fromBottom: number; toBottom: number });

/** A divider to draw after a given position, naming the band it separates. */
export type ResolvedZone = { afterPos: number; label: string; kind: ZoneKind };

function isTopAnchored(r: ZoneRule): r is ZoneRule & { from: number; to: number } {
  return (r as { from?: number }).from !== undefined;
}

const TOP_FIVE_20: ZoneRule[] = [
  { kind: 'continentalTop', label: 'Champions League', from: 1, to: 4 },
  { kind: 'continentalSecond', label: 'Europa League', from: 5, to: 5 },
  { kind: 'continentalThird', label: 'Conference League qualifying', from: 6, to: 6 },
  { kind: 'relegation', label: 'Relegation', fromBottom: 3, toBottom: 1 },
];

export const COMPETITION_ZONES: Record<number, ZoneRule[]> = {
  // England — Premier League (20)
  423: TOP_FIVE_20,
  // Spain — La Liga (20)
  419: TOP_FIVE_20,
  // Italy — Serie A (20)
  499: TOP_FIVE_20,
  // Germany — Bundesliga (18): 16th plays a relegation/promotion play-off.
  477: [
    { kind: 'continentalTop', label: 'Champions League', from: 1, to: 4 },
    { kind: 'continentalSecond', label: 'Europa League', from: 5, to: 5 },
    { kind: 'continentalThird', label: 'Conference League qualifying', from: 6, to: 6 },
    { kind: 'relegationPlayoff', label: 'Relegation play-off', fromBottom: 3, toBottom: 3 },
    { kind: 'relegation', label: 'Relegation', fromBottom: 2, toBottom: 1 },
  ],
  // France — Ligue 1 (18): 4th enters Champions League qualifying, 16th plays off.
  200: [
    { kind: 'continentalTop', label: 'Champions League', from: 1, to: 3 },
    { kind: 'continentalTopQual', label: 'Champions League qualifying', from: 4, to: 4 },
    { kind: 'continentalSecond', label: 'Europa League', from: 5, to: 5 },
    { kind: 'continentalThird', label: 'Conference League qualifying', from: 6, to: 6 },
    { kind: 'relegationPlayoff', label: 'Relegation play-off', fromBottom: 3, toBottom: 3 },
    { kind: 'relegation', label: 'Relegation', fromBottom: 2, toBottom: 1 },
  ],
  // Scotland — Premiership (12). Splits into a top and bottom six after 33
  // games; the split changes who plays whom, not what the positions mean, so
  // position-anchored rules still hold. 11th plays off against the
  // Championship play-off winner, 12th goes down automatically.
  //
  // The Europa League place is NOT a league position — it belongs to the
  // Scottish Cup winner, and cascades down the league only if that club has
  // already qualified. There is no position to anchor it to, so it is
  // deliberately absent rather than guessed onto a row.
  259: [
    { kind: 'continentalTop', label: 'Champions League', from: 1, to: 1 },
    { kind: 'continentalTopQual', label: 'Champions League qualifying', from: 2, to: 2 },
    { kind: 'continentalThird', label: 'Conference League qualifying', from: 3, to: 3 },
    { kind: 'relegationPlayoff', label: 'Relegation play-off', fromBottom: 2, toBottom: 2 },
    { kind: 'relegation', label: 'Relegation', fromBottom: 1, toBottom: 1 },
  ],
  // South Africa — Premier League / Betway Premiership (16). CAF competitions,
  // not UEFA: the top two enter the CAF Champions League. 15th plays the
  // promotion/relegation play-off (the provider carries it as its own
  // competition, "Premier League Play-offs"), 16th goes down automatically.
  //
  // The CAF Confederation Cup place is cup-driven (Nedbank Cup winner, with the
  // MTN8 winner taking a spot in some seasons), not a league position, so it is
  // omitted for the same reason as Scotland's Europa place.
  26: [
    { kind: 'continentalTop', label: 'CAF Champions League', from: 1, to: 2 },
    { kind: 'relegationPlayoff', label: 'Promotion / relegation play-off', fromBottom: 2, toBottom: 2 },
    { kind: 'relegation', label: 'Relegation', fromBottom: 1, toBottom: 1 },
  ],
};

/**
 * Dividers for a competition's table, or `[]` when the competition has no
 * curated rules — callers render no zones at all in that case.
 *
 * A qualification band draws its line *below* the band (under the last
 * qualifying position); a demotion band draws its line *above* it, so the
 * label always sits next to the positions it describes. Lines that would fall
 * outside the table, or collide with another, are dropped — that happens when
 * a league is smaller than its rules assume.
 */
export function zonesForCompetition(
  competitionId: number | string | null | undefined,
  total: number,
): ResolvedZone[] {
  if (competitionId == null || total <= 0) return [];
  const rules = COMPETITION_ZONES[Number(competitionId)];
  if (!rules) return [];

  const seen = new Set<number>();
  const out: ResolvedZone[] = [];
  for (const rule of rules) {
    // Qualification: line under the band. Demotion: line above it.
    const afterPos = isTopAnchored(rule) ? rule.to : total - rule.fromBottom;
    // A line after the final row is meaningless, and one at 0 would sit above
    // the table — both happen when the table is smaller than the rules assume.
    if (afterPos < 1 || afterPos >= total) continue;
    if (seen.has(afterPos)) continue;
    seen.add(afterPos);
    out.push({ afterPos, label: rule.label, kind: rule.kind });
  }
  return out.sort((a, b) => a.afterPos - b.afterPos);
}
