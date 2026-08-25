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
 * ⚠️ Review each season. UEFA slot allocation is not static: the two
 * best-performing leagues in a season's coefficient ranking gain an extra
 * Champions League place, and domestic-cup winners can shift the Europa and
 * Conference slots down a position. Treat the entries below as the standard
 * allocation, not a guarantee for a given year.
 */

export type ZoneKind =
  | 'champions'
  | 'championsQual'
  | 'europa'
  | 'conference'
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
  { kind: 'champions', label: 'Champions League', from: 1, to: 4 },
  { kind: 'europa', label: 'Europa League', from: 5, to: 5 },
  { kind: 'conference', label: 'Conference League qualifying', from: 6, to: 6 },
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
    { kind: 'champions', label: 'Champions League', from: 1, to: 4 },
    { kind: 'europa', label: 'Europa League', from: 5, to: 5 },
    { kind: 'conference', label: 'Conference League qualifying', from: 6, to: 6 },
    { kind: 'relegationPlayoff', label: 'Relegation play-off', fromBottom: 3, toBottom: 3 },
    { kind: 'relegation', label: 'Relegation', fromBottom: 2, toBottom: 1 },
  ],
  // France — Ligue 1 (18): 4th enters Champions League qualifying, 16th plays off.
  200: [
    { kind: 'champions', label: 'Champions League', from: 1, to: 3 },
    { kind: 'championsQual', label: 'Champions League qualifying', from: 4, to: 4 },
    { kind: 'europa', label: 'Europa League', from: 5, to: 5 },
    { kind: 'conference', label: 'Conference League qualifying', from: 6, to: 6 },
    { kind: 'relegationPlayoff', label: 'Relegation play-off', fromBottom: 3, toBottom: 3 },
    { kind: 'relegation', label: 'Relegation', fromBottom: 2, toBottom: 1 },
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
