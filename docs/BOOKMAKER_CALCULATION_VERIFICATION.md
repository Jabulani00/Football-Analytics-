# Bookmaker calculation verification

Local verification against stakeholder rules. No push, deployment or live-browser verification was performed.

## Rules checked

- Website decimal prices; Hollywood net feed prices restored by adding the stake with decimal-safe arithmetic.
- Home/away ratio: smaller divided by bigger. Group 1 below 0.35; Group 2 inclusive 0.35 to 0.65; Group 3 above 0.65.
- A means bigger home price; B means smaller home price. Equal odds have no A/B category or invented code.
- Gap: bigger minus smaller. Below 0.30 means no clear choice; 0.30 or more favours the smaller-priced outcome.
- Draw excluded from home/away classification.
- Additional opposing markets receive the gap rule only, not ratio categories.
- Invalid, missing and closed prices do not produce a preference.

## Expected examples

| Home | Away | Ratio | Category | Gap | Preference |
|---:|---:|---:|---|---:|---|
| 10.00 | 2.00 | 0.20 | 1A | 8.00 | Away |
| 2.00 | 10.00 | 0.20 | 1B | 8.00 | Home |
| 4.00 | 2.00 | 0.50 | 2A | 2.00 | Away |
| 2.10 | 6.00 | 0.35 | 2B | 3.90 | Home |
| 1.30 | 2.00 | 0.65 | 2B | 0.70 | Home |
| 2.60 | 2.50 | 0.961538... | 3A | 0.10 | No clear choice |
| 2.50 | 2.60 | 0.961538... | 3B | 0.10 | No clear choice |
| 2.60 | 2.60 | 1.00 | Group 3, equal odds | 0.00 | No clear choice |
| 1.10 | 1.40 | 0.785714... | 3B | 0.30 | Home |
| 1.10 | 1.39 | 0.791366... | 3B | 0.29 | No clear choice |

## Automated evidence

`frontend/scripts/bookmakerClassification.test.ts` passes:

- 25,728 price pairs checked against an independent integer-cent oracle, including swapped home/away prices.
- 10,001 net-price conversions checked against expected decimal prices.
- Exact boundaries and values immediately around them; equal prices; suspended and invalid inputs.
- Recognised Odd/Even, No Bet, Asian Handicap, qualification and trophy-winner pairs.
- Three-way/compound markets, invalid Home/Away No Bet selections and inconsistent handicaps excluded.
- Bookmaker adapters, draw independence and fixture filters.

Verification exposed and fixed pairing of Yes/No or Over/Under selections from markets containing an additional outcome. Regression tests now reject those cases.

Related suites passed: Hollywood Hunt (179 checks), Hollywood fusion browsing, Betway Hunt, Betway Hunt route, Betway markets, Betway markets route, value/strategy (24 checks).

Lint passed for all changed TypeScript/TSX files. Expo web export completed to `tmp/bookmaker-verification-web`.

## Remaining verification limits

Full `tsc --noEmit` fails in unchanged files: `ImportanceOf3Panel.tsx`, `PowerDynamicsSectors.tsx`, `useCatalogueTables.ts`, `powerDynamics.test.ts`, `colourVerification.ts`, `formChildBeater.ts`, and `powerDynamicCallMeasures.ts`. No errors were reported in the changed bookmaker files. The complete repository therefore does not have a clean typecheck, despite the successful web export.

## Reproduce

From `frontend`:

```powershell
node --import tsx scripts/bookmakerClassification.test.ts
node --import tsx scripts/hollywoodFusionView.test.ts
node --import tsx scripts/hollywoodHunt.test.ts
node --import tsx scripts/betwayHunt.test.ts
node --import tsx scripts/betwayHuntRoute.test.ts
node --import tsx scripts/betwayMarkets.test.ts
node --import tsx scripts/betwayMarketsRoute.test.ts
node --import tsx scripts/valueStrategy.test.ts
node node_modules/expo/bin/cli export --platform web --output-dir ../tmp/bookmaker-verification-web
```

Browser interactions, live bookmaker payload coverage and exact site price comparisons remain separate acceptance checks; synthetic regression data and a successful export do not establish them.
