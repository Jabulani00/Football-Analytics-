# Analytics table catalogue

Updated 2026-10-17 from the Analytics UI, live stats builder, OddAlerts integration, and existing calculation tests.

## User-facing catalogue: 72 selectable views

The Analytics catalogue is intentionally 72 views, defined by the user's requested list:

- **All games (36):** 3 periods (Fulltime, Halftime/1H, 2nd Half/2H) × 3 venue scopes (Overall, Home, Away) × 4 team groups (all, Green, Yellow, Red).
- **Last-N (36):** Last 5, Last 6, Last 8, and Last 10 × the same 3 periods × 3 venue scopes.

`frontend/mock/analyticsData.ts` is the catalogue source. Its base labels use the requested words (for example, “Overall Fulltime Green”); the Last-N labels follow the same order. The Green/Yellow/Red **team** groups filter by each team's current league position, using the shared `bandOf` rule and provider team IDs. They are distinct from PPG's separate opponent-tier columns (`PPG vs Green/Yellow/Red`). If current standings are unavailable, the panel reports that the team-group filter cannot be verified and does not show an unfiltered result as a coloured group.

The table picker controls the requested view. A separate Statistics picker controls which existing calculation appears under it, so calculation families do not add entries to the 72-view catalogue. Ordinary has 34 mapped columns; Series has the 29 `SERIES_DEFS`; PPG has PPG and its three opponent-tier values; League Stats uses the existing average row; FT-Only is available on full-time views; Half stats are available on half views. Last-N rows use their matching builder window and the same family columns where those fields are built.

**Mixed Stats (1–23)** is a separate panel in the Statistics picker for the selected 72-view table. The supplied transcription defines a fixed set of derived columns, shown alongside the existing custom source-column picker. First/second-half scoring, conceding, and total-goal shares use goal totals from the same valid-half fixture sample, with each pair complementary to 100%. Items 7–10 now report team and league second-half goal averages and consistency. BTTS-by-outcome uses team-perspective full-time scores; form uses full-time PPG; and scores/concedes in both halves reuse FT-Only calculations. Missing or zero-denominator values remain blank.

The later formula clarification defines `Conc* 2H%` as second-half conceded goals divided by full-time conceded goals; its first-half counterpart uses first-half conceded goals over the same full-time conceded total. The selected full-time team's counted fixtures are filtered to valid half scores before summing, so missing-half matches cannot break the complementary percentage pairs. The user clarified that items 7–10 should be second-half stats; these are labeled 2H_T/2H_L averages and consistency. “Best/worst form” use the same PPG value with high/low ranking semantics; “best/worst performance” use FT goals-scored average minus goals-conceded average with high/low ranking semantics. BTTS win/draw/loss values are the percentage of the team's sampled matches that both teams scored and the team had that outcome. RFS-combined views are not fabricated: the current Mixed Stats inputs do not include the RFS results required for those variants.

## Internal data model and compatibility

The live builder and Python export retain their legacy family-specific table names and schema. The frontend's 72 views are projections over those calculations; this change does not delete or rename stored tables. The builder's legacy matrix includes ordinary, PPG, series, FT-only, and league-average families across periods/scopes, plus Last 5/6/8/10 windows. Internal builder counts are not the user-facing catalogue count.

The Analytics UI builds tables client-side from OddAlerts fixture results. Relevant source fields include fixture identity/status, team names/IDs, full-time goals, half-time score, and kickoff. Completed score results are validated before calculation. Full-time rates use eligible full-time scores; first-half rates use recorded half-time scores; second-half goals are full-time minus half-time. Missing or invalid half-time data is excluded and flagged. Duplicate fixture IDs are ignored. Scored-first/conceded-first is marked only when the final and half-time scores prove which side scored first (or when only one side scored); ambiguous order stays unknown and is excluded from the first-goal percentage sample. Minute-level timing stats still require event data unavailable from the fixtures-between feed.

PPG is points (3/1/0) divided by eligible games. Opponent-tier PPG uses current standings and qualifying results against opponents in the corresponding tier. Series uses the 29 definitions in `frontend/utils/fixtureSeries.ts`; current runs are evaluated newest-first and unknown latest half samples cannot extend a half-series. FT-Only patterns are derived from full-match results and the recorded half score where the pattern requires it. Rescued/blown points are based on trailing/leading at half-time, respectively, and remain unavailable with no qualifying situations.

## Source and behaviour checks

- `frontend/services/statsBuilder.ts` computes the live rows and preserves fixture inclusion/coverage metadata.
- `frontend/utils/statsTableAdapter.ts` maps builder rows to family-specific display columns and leaves unavailable values blank.
- `frontend/components/analytics/StatsTablesPanel.tsx` renders all 72 view choices, current-team colour groups, the separate calculation selector, provider data-quality flags, and included-game details.
- `frontend/scripts/statsTableAdapter.test.ts` checks the 72-entry composition, labels, family columns, mapping, and unavailable values. `frontend/scripts/test-stats-builder.ts` exercises the underlying live builder.

The original project documentation and implementation used “72”, “81”, and “90” for different catalogue concepts as Last 5 and PPG tier rows were added. This UI follows the explicit 72-item list supplied by the user; family selectors and opponent-tier metrics remain available without changing that list.
