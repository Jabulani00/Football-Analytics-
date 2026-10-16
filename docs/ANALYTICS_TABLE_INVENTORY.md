# Analytics audit and 72-table inventory

Audit performed 2026-10-16 against the project source, `docs/Football_Analytics_Project_Spec.md`, the OddAlerts integration notes, frontend table builder, and backend schema generator.

## Audit findings

- **Architecture:** Expo Router / React Native with TypeScript; the analytics UI builds tables client-side from OddAlerts `/fixtures/between`. Python generates the alternate SQLite export; Supabase migrations serve odds and strategy storage, not the 72 statistics tables.
- **What “72 tables” means:** generated table variants, not 72 live Supabase relations: 5 families × 3 periods × 3 venue scopes = 45 base variants, plus 3 recent windows × 3 periods × 3 scopes = 27. The live builder creates these names, and the backend schema has the same 72-name generator.
- **Navigation:** the shared desktop bar and compact phone menu expose Scores, Analytics, SL-STATS, Additional, Ordinary, and FT-Only routes. Analytics has its own section selector. Before this change the Stats Tables panel compressed variants into family/period/scope controls; an FT-Only period restriction made some generated variants unreachable. The fixture dashboard has a separate 14-context mock picker and is not the live 72-table panel.
- **Data path:** OddAlerts fixture results (`id`, `status`, `home_goals`, `away_goals`, `ht_score`, names, kickoff timestamp) → `buildStatsTables` → `TeamStatsExport.tables` → live table hook → `StatsTablesPanel`. The fixture-list response does not carry the match-stat fields needed for corners/cards/xG or goal event order. The integration separately models season-stat timing data, but those fields are not joined into this builder.
- **Ordinary formulas in the live builder:** percentages are matches satisfying a predicate divided by eligible matches; complements are counted directly. Goal averages are total goals for/against or total goals divided by eligible matches. Half-time uses recorded `ht_score`; second-half goals are FT minus HT. Missing halves are excluded from half calculations. `scored_first`, handicap, and goal-timing/event-order fields remain unavailable in this builder.
- **PPG:** 3/1/0 points per match divided by matches in the selected period. The spec additionally calls for opponent-table-third PPG; the live builder does not have opponent-zone inputs and currently emits only overall PPG/duplicate `avg_pts` plus ordinary rates. This spec/code mismatch remains unresolved.
- **Series:** current consecutive streak lengths (win, unbeaten, loss, BTTS, over 2.5, clean sheet, failed to score, scored) over newest-first eligible results. The spec’s wider 29 + 7 series catalogue is not implemented in the live table family.
- **FT-Only:** pattern percentages use whole-match FT results; patterns needing half outcomes use only matches with a valid HT score consistent with FT. Rescued points are the average FT points earned after trailing at HT; blown points are average points dropped after leading at HT. No qualifying situation yields unavailable, not zero. Extra-time/penalty statuses are excluded by the FT-only status filter.
- **Defects corrected here:** generated sample teams appeared when live table data was unavailable; individual table variants were not directly selectable; fixture IDs were double-counted; goal and half-score inputs were insufficiently validated; a missing newest half-time score could incorrectly let an older half-series streak appear current; there was no match-level data-quality explanation in the table view.
- **Remaining limitations / assumptions:** “Additional” means the four generated families PPG, Series, FT-Only, and League Avg, matching the existing panel. “Scores”/“Ordinary” are result-derived from FT scores. Missing HT is treated as a provider-missing field for completed matches, but the UI preserves valid FT-derived values. More extensive PPG-by-opponent-tier and Series requirements need business logic/API inputs not present in this builder, so they are flagged here rather than guessed.

## Inventory and verification checklist

Each cell lists three distinct generated tables in the order **overall / home / away**. “Stats Tables” exposes all 72; “Additional stats” exposes the 36 non-ordinary base family variants. `FT`, `1H`, and `2H` map to builder suffixes `ft`, `ht`, and `2h`.

| Section | Family/window | Period | Table keys (overall / home / away) | Verified |
|---|---|---|---|---|
| Stats Tables | Ordinary | FT | `ordinary_ft_overall`, `ordinary_ft_home`, `ordinary_ft_away` | [x] |
| Stats Tables | Ordinary | 1H | `ordinary_ht_overall`, `ordinary_ht_home`, `ordinary_ht_away` | [x] |
| Stats Tables | Ordinary | 2H | `ordinary_2h_overall`, `ordinary_2h_home`, `ordinary_2h_away` | [x] |
| Additional stats | PPG | FT | `ppg_ft_overall`, `ppg_ft_home`, `ppg_ft_away` | [x] |
| Additional stats | PPG | 1H | `ppg_ht_overall`, `ppg_ht_home`, `ppg_ht_away` | [x] |
| Additional stats | PPG | 2H | `ppg_2h_overall`, `ppg_2h_home`, `ppg_2h_away` | [x] |
| Additional stats | Series | FT | `series_ft_overall`, `series_ft_home`, `series_ft_away` | [x] |
| Additional stats | Series | 1H | `series_ht_overall`, `series_ht_home`, `series_ht_away` | [x] |
| Additional stats | Series | 2H | `series_2h_overall`, `series_2h_home`, `series_2h_away` | [x] |
| Additional stats | FT-Only | FT | `ft_only_ft_overall`, `ft_only_ft_home`, `ft_only_ft_away` | [x] |
| Additional stats | FT-Only | 1H | `ft_only_ht_overall`, `ft_only_ht_home`, `ft_only_ht_away` | [x] |
| Additional stats | FT-Only | 2H | `ft_only_2h_overall`, `ft_only_2h_home`, `ft_only_2h_away` | [x] |
| Additional stats | League Avg | FT | `league_avg_ft_overall`, `league_avg_ft_home`, `league_avg_ft_away` | [x] |
| Additional stats | League Avg | 1H | `league_avg_ht_overall`, `league_avg_ht_home`, `league_avg_ht_away` | [x] |
| Additional stats | League Avg | 2H | `league_avg_2h_overall`, `league_avg_2h_home`, `league_avg_2h_away` | [x] |
| Stats Tables | Last 10 | FT | `last10_ft_overall`, `last10_ft_home`, `last10_ft_away` | [x] |
| Stats Tables | Last 10 | 1H | `last10_ht_overall`, `last10_ht_home`, `last10_ht_away` | [x] |
| Stats Tables | Last 10 | 2H | `last10_2h_overall`, `last10_2h_home`, `last10_2h_away` | [x] |
| Stats Tables | Last 8 | FT | `last8_ft_overall`, `last8_ft_home`, `last8_ft_away` | [x] |
| Stats Tables | Last 8 | 1H | `last8_ht_overall`, `last8_ht_home`, `last8_ht_away` | [x] |
| Stats Tables | Last 8 | 2H | `last8_2h_overall`, `last8_2h_home`, `last8_2h_away` | [x] |
| Stats Tables | Last 6 | FT | `last6_ft_overall`, `last6_ft_home`, `last6_ft_away` | [x] |
| Stats Tables | Last 6 | 1H | `last6_ht_overall`, `last6_ht_home`, `last6_ht_away` | [x] |
| Stats Tables | Last 6 | 2H | `last6_2h_overall`, `last6_2h_home`, `last6_2h_away` | [x] |

**Count:** 15 base rows × 3 = 45; 9 last-N rows × 3 = 27; total 72. The per-table mapping is generated from `STATS_TABLES` and tested for 72 unique live builder names.

## Validation behavior added

- Only completed `FT` results with non-negative safe-integer scores enter score-based tables; zero remains a valid score.
- Duplicate completed fixture IDs are counted once, with a duplicate count in table metadata.
- Half-time scores must match a strict `n-n` format and cannot exceed the full-time score. Missing and malformed half-time records are counted separately.
- A missing newest half score no longer allows a prior half-time streak to be presented as current; a streak is unavailable until its newest sample is observable.
- Match-level issues list the fields and affected table categories. Valid full-time calculations remain available when only half-time data is absent.
- Unsupported timing/event-order metrics remain null; an empty sample is never represented as a real zero.
- The Stats Tables selector uses the table inventory directly, and empty/error states no longer substitute fabricated team data.

## Verification

- `npm test` — passed after the final calculation change; the builder covers 98 checks and the table adapter covers 32 checks, including all 72 unique mappings.
- Focused ESLint on the changed TypeScript files — passed. `npm run lint` — 0 errors, 9 warnings in other existing components.
- `npm run build` — passed; Expo exported 20 static routes and 6 API routes.
- `npx tsc --noEmit` — still reports unrelated diagnostics in `components/match-detail/ImportanceOf3Panel.tsx`, `MatchPowerDynamicsPanel.tsx`, `PowerDynamicsSectors.tsx`, `hooks/useCatalogueTables.ts`, `scripts/powerDynamics.test.ts`, and `utils/formChildBeater.ts`. No changed source/test file is reported after the test fixture casts were corrected.
- No database migration or API fetch contract change was needed for these validation and visibility improvements.
