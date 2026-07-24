# Hollywoodbets Integration — Session Change Log

**Date:** 2026-07-23
**Branch:** `claude/pull-all-changes-2nna11`
**Scope:** Investigate and build the "Hollywoodbets script" (Phase 1 deliverable —
*Odds + bet-slip generation*) from `docs/Football_Analytics_Project_Spec.md` §2.2.
**Status:** Data layer + UI wiring complete and committed locally; **not yet pushed**
(git host returned HTTP 403 for this session — see [§8](#8-known-blockers--open-items)).

---

## 1. What this session delivered

A full Hollywoodbets integration for Scoreline, reverse-engineered from the live
web app's network traffic (captured HAR files) and wired into the Analytics hub:

- **Odds ingestion** — live soccer odds (1X2, and any market by bet-type id) via a
  server-side proxy, typed to Hollywoodbets' real response shapes.
- **Odds fusion** — de-vig (overround removal), fair-probability and EV/edge math.
- **Fixture matching** — pair Hollywoodbets events to app fixtures by team name +
  kickoff.
- **Bet-slip generation** — build a Hollywoodbets **booking code** ("Share-A-Bet")
  from selections and open a pre-loaded betslip deep link. **Reservation only —
  no automated bet placement.**
- **Three UI surfaces** — live Odds Fusion rows, a working *Export to
  Hollywoodbets* button, and a new browsable **Hollywoodbets** tab.

All endpoints used are **unauthenticated public GET/POST**. CORS on every
Hollywoodbets host is locked to `https://www.hollywoodbets.net`, so all calls are
routed through a bundled server-side proxy (the same pattern as the existing
OddAlerts proxy).

---

## 2. Reverse-engineered API reference

Discovered from captured traffic. All hosts require **no token/cookie**; all lock
CORS to Hollywoodbets' own origin (⇒ must be proxied server-side).

### 2.1 Hosts

| Host | Role |
|------|------|
| `sport-events-api.hollywoodbets.net` | **Events + odds** (the primary feed) |
| `comet-settings-api.hollywoodbets.net` | Sport list / priorities / bet-type catalog |
| `betepsweb.hollywoodbets.net` | Live/upcoming sport counts |
| `betapi.hollywoodbets.net` | **Share-A-Bet** (booking-code generation) |
| `id.hollywoodbets.net` | OIDC auth (account features only — not needed here) |

### 2.2 Navigation tree (Soccer = `sportId` 1)

```
GET /api/events/eps/sports                                                   → all sports
GET /api/events/eps/sports/1/categories                                      → countries (2=South Africa, 61=France, 65=Germany, 83=Italy…)
GET /api/events/eps/sports/1/categories/{categoryId}/tournaments             → leagues
GET /api/events/eps/sports/1/categories/{categoryId}/tournaments/{id}/events?withBetTypeId=15&lang=en   → EVENTS + ODDS
GET /api/sports?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&eventStatusIDs=1      → date-scoped sports
```

### 2.3 Event / odds payload shape

```jsonc
{
  "id": 9086668,
  "name": "Golden Arrows vs Chippa Utd",     // "Home vs Away"
  "startTime": "2026-08-01T13:30:00+00:00",
  "categoryId": 2, "category": "South Africa",
  "betTypes": [{
    "id": 15, "name": "Full Time",             // the market
    "eventBetTypeMapID": 190011671,
    "markets": [                               // selections
      { "number": 1, "name": "Golden Arrows", "odds": 0.6, "ratio": "6/10", "eventDetailId": 654483691 },  // home
      { "number": 2, "name": "Draw",          "odds": 2.5, "ratio": "5/2",  "eventDetailId": 654483694 },  // draw
      { "number": 3, "name": "Chippa Utd",    "odds": 4.5, "ratio": "9/2",  "eventDetailId": 654483697 }   // away
    ]
  }]
}
```

### 2.4 ⚠️ Odds format — the critical gotcha

The `odds` field is **fractional net** odds (winnings per 1 unit), **not decimal**,
confirmed by `ratio`:

| `odds` | `ratio` | **True decimal** (`odds + 1`) |
|-------:|:-------:|:-----------------------------:|
| 0.6 | 6/10 | **1.60** |
| 2.5 | 5/2 | **3.50** |
| 4.5 | 9/2 | **5.50** |
| 10.0 | 10/1 | **11.00** |

**Always convert with `toDecimal()` before any probability/edge math.**

### 2.5 Bet-type ids (`withBetTypeId`)

`15` Full Time (1X2) · `22` Both Teams to Score · `27` Totals (O/U) · `19` Double
Chance · `20` Correct Score · `23` HT/FT · `17` Handicap. (Full catalog captured.)
For 1X2, `market.number`: **1 = home, 2 = draw, 3 = away**.

### 2.6 Share-A-Bet (booking code)

```
POST betapi.hollywoodbets.net/api/punters/ShareABet
```
Request — every field comes straight from an event/market:
```jsonc
{ "punterId": 0,
  "shareABetDetails": [{
    "eventID": 8771459, "eventName": "…", "eventDate": "…ISO…",
    "eventBetTypeMapID": 190672801, "eventDetailOfferedOdd": 0.55,  // FRACTIONAL
    "eventDetailId": 656143759, "betTypeID": 15, "betTypeName": "Full Time",
    "sportId": 1, "tournamentId": 3096972, "tournamentName": "…", "countryId": 184
  }, … ] }
```
Response:
```jsonc
{ "responseMessage": "Success",
  "responseType": 1392654710,                       // ← the BOOKING CODE
  "responseObject": [ { "returnUrl": "/betting/1392654710/code", … } ] }
```
Deep link that opens the pre-loaded slip: `https://www.hollywoodbets.net/betting/{code}/code`.

> This creates a **reservation** — the punter still opens, reviews and pays on
> Hollywoodbets. No bet is placed by the app. This matches the spec's "bet-slip
> generation" deliverable and stays within the quotation's "no live bet placement"
> boundary.

---

## 3. Files changed

3 commits on `claude/pull-all-changes-2nna11`; **15 files, +1317 / −10**.

| # | File | Type | Purpose |
|---|------|------|---------|
| 1 | `frontend/app/hollywood+api.ts` | **new** | Expo Router proxy at `/hollywood`; host+path allowlist; forwards Origin/Referer; GET edge-cached, POST no-store |
| 2 | `frontend/services/hollywoodbets.ts` | **new** | Typed API client, `toDecimal()`, `decimal1x2()`, `createShareABet()`, `bookingUrl()` |
| 3 | `frontend/services/oddsMath.ts` | **new** | `impliedProb`, `devig1x2`, `devigBinary`, `evPct`, `edgePctFromCompliance` |
| 4 | `frontend/services/hollywoodMatch.ts` | **new** | Team-name normalization + fixture ↔ event matcher |
| 5 | `frontend/services/hollywoodFusion.ts` | **new** | Events → fusion rows (odds, fair probs, edge, Share-A-Bet leg) |
| 6 | `frontend/hooks/useHollywoodOdds.ts` | **new** | Tournament-scoped odds/fusion rows |
| 7 | `frontend/hooks/useHollywoodPopularOdds.ts` | **new** | Self-navigates the soccer tree to the first priced tournament |
| 8 | `frontend/hooks/useHollywoodNav.ts` | **new** | Categories → tournaments navigation |
| 9 | `frontend/hooks/useHollywoodExport.ts` | **new** | Booking-code export + deep-link open (web/native) |
| 10 | `frontend/components/analytics/HollywoodOddsPanel.tsx` | **new** | Browsable live-odds tab (country → league → picks → booking code) |
| 11 | `frontend/components/analytics/OddsFusionPanel.tsx` | mod | Live HB rows + de-vig fair prices + LIVE/SAMPLE badge; sample fallback |
| 12 | `frontend/components/analytics/BetSlipPanel.tsx` | mod | *Export to Hollywoodbets* now generates a booking code |
| 13 | `frontend/components/analytics/AnalyticsHub.tsx` | mod | Register the `hollywood` tab |
| 14 | `frontend/types/analytics.ts` | mod | `BetSlipLeg.hbLeg`; add `'hollywood'` to `AnalyticsTab` |
| 15 | `frontend/mock/analyticsData.ts` | mod | Add `Hollywoodbets` tab to `ANALYTICS_TABS` |

---

## 4. Architecture / data flow

```
Hollywoodbets hosts (unauth, CORS-locked)
        │  (server-side only)
        ▼
/hollywood  (app/hollywood+api.ts)  ── proxy: allowlist + Origin/Referer + cache
        │
        ▼
services/hollywoodbets.ts  ── typed client (fractional→decimal, ShareABet)
        │
        ├── services/oddsMath.ts       (de-vig, EV/edge)
        ├── services/hollywoodMatch.ts (fixture ↔ event)
        └── services/hollywoodFusion.ts (events → fusion rows + legs)
        │
        ▼
hooks/  useHollywoodOdds · useHollywoodPopularOdds · useHollywoodNav · useHollywoodExport
        │
        ▼
UI      OddsFusionPanel (live rows) · BetSlipPanel (export) · HollywoodOddsPanel (browse→booking code)
```

The **pure core** (`services/*`, minus network) has no React/RN dependencies and is
unit-testable under plain Node.

---

## 5. Key modules & public API

### `services/hollywoodbets.ts`
- `SPORT_SOCCER`, `BET_TYPE` (`FULL_TIME`/`BTTS`/`TOTALS`/…)
- `fetchSports`, `fetchSoccerCategories`, `fetchTournaments`, `fetchEvents(cat, tour, betTypeId)`
- `toDecimal(fractional)` → decimal; `decimal1x2(event)` → `{home,draw,away}`
- `toShareLeg(event, betType, market, ctx)` → `ShareLeg`
- `createShareABet(legs, punterId=0)` → `{ code, url }`; `bookingUrl(code)`

### `services/oddsMath.ts`
- `impliedProb`, `devig1x2`, `devigBinary`, `evPct(modelProb, decimalOdds)`, `edgePctFromCompliance`

### `services/hollywoodMatch.ts`
- `normalizeTeam`, `splitEventName`, `nameSimilarity`, `matchFixtureToEvent(fixtureKey, events)`
- Synonyms (`utd→united`, drops `fc/afc/cf/sc`), accent strip, kickoff ±3h tolerance, ≥0.5 per-side threshold.

### `services/hollywoodFusion.ts`
- `buildFusionRows(events, ctx, modelProbFor?)` → `FusionRow[]`
  (`decimal`, `fair`, `pick`, `edgePct`, `hbLeg`). With no model, edge = −(book margin).

### Hooks
- `useHollywoodOdds(ctx, modelProbFor?)`, `useHollywoodPopularOdds(enabled?)`,
  `useHollywoodNav(categoryId)`, `useHollywoodExport(punterId?)` → `{ state, exportSlip, reset }`.

---

## 6. UI changes

- **Odds Fusion tab** — attempts live HB odds via `useHollywoodPopularOdds`; renders
  real fixtures with decimal odds + de-vig fair %; **LIVE/SAMPLE** badge; falls back
  to the bundled sample rows when offline.
- **Bet Slip tab** — `EXPORT TO HOLLYWOODBETS` calls `createShareABet` for
  HB-sourced legs, opens the booking-code deep link, and shows code / hint / error.
  Non-HB (sample) legs show a helpful hint instead.
- **New Hollywoodbets tab** — country filter → league chips → priced matches with
  tappable 1/X/2 buttons → combined-odds slip bar → **GENERATE BOOKING CODE** →
  opens the pre-loaded betslip.

---

## 7. Verification

| Check | Result |
|-------|--------|
| `tsc --noEmit` | No new error *types*. Remaining errors are the pre-existing react-native-web `hovered` / `PressableStateCallbackType` pattern used across 6+ existing files and present at HEAD. |
| `eslint` (all touched files) | Clean (exit 0). |
| Pure-logic validation vs captured HAR | ✅ fractional→decimal (0.6→1.60); de-vig sums to 1.000; EV edge flips correctly with a model; matcher resolves "Chippa United"→"Chippa Utd", "Orlando Pirates"→"Pirates", rejects non-tournament fixtures; selection→ShareABet leg carries correct `eventDetailId`/price; parlay combined odds correct (1.60×3.00=4.80). |

> Live network paths could not be exercised in this environment: the sandbox proxy
> blocks gambling domains (HTTP 403), the same class of limitation noted for
> OddAlerts in `docs/SESSION_PROGRESS.md`. They must be smoke-tested in the
> client's South African environment.

---

## 8. Known blockers & open items

- **Push blocked** — `git push` returns **HTTP 403** from the git host for this
  session (the prior PR/branch was merged and deleted server-side). All work is
  committed locally on `claude/pull-all-changes-2nna11` and ready to push once
  write access is restored.
- **`ShareABet` `punterId`** — sent unvalidated (endpoint requires no auth); the
  capture used a real punter number. Default is `0` (guest) — **verify live** that
  a guest id is accepted, else pass a service number to `useHollywoodExport(punterId)`.
- **Live smoke test** — confirm the LIVE badge, real booking-code generation, and
  deep-link open in the client's SA environment.

---

## 9. Compliance note

The integration reads public odds and generates **informational booking codes /
betslip reservations** only. It does **not** place bets, log into punter accounts,
or circumvent bot protections — consistent with `docs/QUOTATION_R75000.md` §9–10
(no live bet placement; client responsible for bookmaker ToS and gambling-law
compliance in their jurisdiction).

---

## 10. Suggested next steps (not built this session)

1. **Model-probability join** — pass the prediction engine's probabilities into
   `buildFusionRows(events, ctx, modelProbFor)` so Odds Fusion shows true EV vs the
   model (not just the book's fair price). Hook + helper already accept this.
2. **`MatchOddsPanel` live column** — replace the mock `hollywood` price with a live
   per-fixture lookup via the matcher.
3. **Shared bet-slip state** — lift slip selections into a context so picks made in
   any panel flow into the Bet Slip tab.
4. **More markets** — surface BTTS (`22`) and Totals (`27`) alongside 1X2.
5. **Unit tests** — port the HAR validations into the repo's `tsx` test runner.
