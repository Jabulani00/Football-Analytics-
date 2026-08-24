# Goal timing — measured vs estimated

Notes for whoever picks this up next. Written Aug 2026, after replacing the
synthetic goal-timing minutes in the Probability tables with real API data.

---

## The short version

The four goal-timing metrics in the Probability tab used to be **invented
numbers**. They now use the provider's recorded timings wherever those exist,
and clearly say so when they don't.

| Short | Metric | Headline | Ranks by |
| ----- | ------ | -------- | -------- |
| `FG` | First goal — average minute | `27.4'` | minute, earliest first |
| `FGA` | First goal conceded — average minute | `32.8'` | minute, earliest first |
| `L70` | Late goals — from 70 min | `54%` | rate, highest first |
| `LC70` | Late goals conceded — from 70 min | `46%` | rate, highest first |

The metric **keys** in `ProbMetricKey` are unchanged (`early1h`, `earlyConc`,
`late`, `early2h`) so nothing persisted or typed breaks — only the labels and
the data behind them changed.

---

## Where the data comes from

`GET /stats/season/:seasonId` — see
[ODDALERTS_API_DATA_CATALOG.md §5.1](./ODDALERTS_API_DATA_CATALOG.md) for the
full field list and the two traps (bucket `total` counts *matches*; minute `0`
means *no data*).

Flow:

```
stats/season/:id
  → fetchSeasonStandings()            services/oddAlerts.ts
  → StandingRow.timing (TeamGoalTiming)
  → timingByName()                    utils/standingsAdapter.ts
  → <StandingsAnalyticsView timing={…}>
  → buildStandingsView(base, sel, { timing })
  → realTimingCell()                  utils/standingsAnalytics.ts
```

`utils/standingsAnalytics.ts` deliberately **does not import the API layer**. It
declares its own `TeamTiming` shape so it stays a pure function over plain
objects and can be tested without network or mocks. If you add fields, mirror
them in both `TeamGoalTiming` (service) and `TeamTiming` (analytics).

---

## Which screens get real data

| Screen | Source | Timing |
| ------ | ------ | ------ |
| Match detail → Table/Odds → League Table | `fetchSeasonStandings` | **measured** |
| Clubs sidebar → standings browser | `fetchSeasonStandings` | **measured** |
| `/league/:id` (e.g. `/league/spl`) | `mock/standingsData.ts` | estimated |

The mock league page has no season id, so there is nothing to look up. That is
the main reason the estimate path still exists.

---

## The estimate is still there — on purpose

`buildStandingsView` falls back to `synthGoalMinute` / `probValue` when:

- no `timing` map is passed (mock data), **or**
- the team has no recorded first goal (`firstGoalFor === null`), **or**
- the period is `1h` / `2h` — recorded timing covers the **whole match**, so it
  cannot answer a half-split view.

Provenance is surfaced, never hidden. `StandingsView.timingSource` is
`'measured' | 'partial' | 'estimated'`, the caption spells it out
(`· recorded timings`, `· recorded for 7/10, rest estimated`,
`· estimated (no recorded timings)`), and estimated cells end in `est.`.

**Rule worth keeping:** the column's *shape* must not change with the data
source. `FG`/`FGA` are always a minute, `L70`/`LC70` are always a percentage.
Otherwise the same metric reads as a minute in one competition and a rate in
another, which is worse than either.

---

## Why `LC70` exists instead of an "E60"

There used to be a metric for "early goals — up to 60 min". **It cannot be
computed from this API.** The buckets count matches, so summing `m0_15 …
m45_60` double-counts any match that scored in two windows. Rather than
fabricate it, that slot became *late goals conceded*, which `conceded_after_70`
measures directly and which completes a symmetric for/against × early/late set.

If a real "by 60'" number is ever needed, it needs per-goal minutes — that means
the **API-Football add-on** (`API_FOOTBALL_KEY`, `services/apiFootball.ts`),
not this endpoint.

---

## Testing

`frontend/scripts/standingsTiming.test.ts` (in `npm test`) covers: measured
values used verbatim, ranking direction per metric, the minute-`0` fallback,
provenance flags, shape consistency across sources, and half-view fallback.

Run just this suite:

```bash
npx tsx scripts/standingsTiming.test.ts
```

---

## Gotcha that will cost you an hour

**Local dev cannot reach the API.** `frontend/.env` is gitignored and absent on
a fresh clone, so the `/oddalerts` proxy returns:

```
{"error":"ODDALERTS_TOKEN is not configured on the server."}
```

…as a **500**, which looks exactly like an upstream outage. Set
`ODDALERTS_TOKEN` in `frontend/.env` (see `.env.example`). Without it every
API-backed screen falls back or errors, and you will not see measured timing at
all.

To inspect the real API shape without a local token, go through the deployed
proxy:

```bash
curl -s "https://football-analytics-rose.vercel.app/oddalerts?path=stats/season/1036325"
```

Also note: the match detail screen **remounts on data refresh and resets to the
Summary tab**, so any multi-step click-through has to happen in one pass.

---

## Route map (for finding things)

- `/match/:id` → `app/(scores)/match/[id].tsx` → `MatchDetailScreen`
  - needs a **real numeric fixture id**. The mock league page links to
    `/match/spl_001`, which the live API cannot resolve → "Match not found".
    Reach a working match from the **home feed**, not the league page.
  - standings live under **Table/Odds → League Table** (not a tab called
    "Table").
