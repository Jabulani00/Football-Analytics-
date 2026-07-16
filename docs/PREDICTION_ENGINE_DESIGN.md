# Football Prediction Engine — Intelligence Layer Design

> **Status:** Design only (no code yet).
> **Authoritative data source:** the **OddAlerts API** as verified in
> [ODDALERTS_API_DATA_CATALOG.md](./ODDALERTS_API_DATA_CATALOG.md) and
> [ODDALERTS_API_GAPS.md](./ODDALERTS_API_GAPS.md). Every feature, weight and
> formula below is derived from fields that **actually exist** in those docs.
> The build-prompt's `[INSERT STATISTICS FILE NAME HERE]` file was never
> supplied, so this design uses the repo's verified catalogue instead of
> assuming fields.

---

## 0. Reality check — what the data does and doesn't support

The requested prediction list, scored against the **real** OddAlerts fields:

| Prediction | Supported? | Source of truth |
|---|---|---|
| Home / Draw / Away win | ✅ Full | Season results + our Poisson model, blended with API `probability.home_win/draw/away_win` |
| Double Chance | ✅ Full | Derived from 1X2; API also gives `double_chance_1x/12/x2` |
| BTTS | ✅ Full | Season `btts`, H2H `btts`, API `probability.btts` |
| Over/Under 0.5 | ✅ Full | Poisson; API `o05/u05` |
| Over/Under 1.5 | ✅ Full | Poisson; API `o15/u15` |
| Over/Under 2.5 | ✅ Full | Poisson; API `o25/u25` |
| Over/Under 3.5 | ✅ Full | Poisson; API `o35/u35` |
| Correct Score | ⚠️ **Derived only** | No correct-score market in API — computed from the Poisson goal matrix |
| Expected Goals (xG) | ⚠️ **Estimated only** | API `home_xg/away_xg` are **post-match** stats, absent on upcoming fixtures. We output **λ (Poisson mean)** as the pre-match xG estimate |
| Confidence % | ⚠️ **Derived only** | Computed from probability margin, model agreement, sample size, and data completeness (Section 8) |

**Four hard gaps to communicate to the client (from the GAPS doc):**

1. **No pre-match xG** — xG only exists after kickoff. Our xG output is a model
   estimate (λ), clearly labelled as such.
2. **No per-match half-split live stats** — only `ht_score` + team-**season**
   1H/2H aggregates. First-half markets are supported at *season-aggregate*
   fidelity, not per-match.
3. **No goal scorers / minutes** — irrelevant to these markets, so no impact.
4. **The prompt's endpoints don't exist as written** (`/team/{id}/matches`,
   `/matches/head-to-head`, `/league/{id}/standings`). Section 6 maps every
   requested call to the **real** OddAlerts endpoint.

---

## 1. Feature list

All features are engineered from three real endpoints: season aggregates
(`/stats/season/:seasonId`), fixture detail with H2H/probability/odds
(`/fixtures/:id?include=…`), and a rolling results window
(`/fixtures/between`).

### 1.1 League baseline features (computed once per league/season)
| Feature | Formula | Source |
|---|---|---|
| `lg_home_goal_avg` | Σ home_goals / matches | season rows / `/fixtures/between` |
| `lg_away_goal_avg` | Σ away_goals / matches | same |
| `lg_btts_rate` | btts matches / matches | H2H flags + season `btts` |
| `lg_over25_rate` | matches with >2.5 / matches | derived |

### 1.2 Team season strength features (venue-split)
Derived from `played`, `goals_for`, `goals_against`, `points` (with
`home`/`away` breakdown), `btts`, `btts_1h/2h`, `goals_for_1h/2h`,
`goals_against_1h/2h`.

| Feature | Definition |
|---|---|
| `home_attack` | (home_goals_for / home_played) ÷ `lg_home_goal_avg` |
| `home_defense` | (home_goals_against / home_played) ÷ `lg_away_goal_avg` |
| `away_attack` | (away_goals_for / away_played) ÷ `lg_away_goal_avg` |
| `away_defense` | (away_goals_against / away_played) ÷ `lg_home_goal_avg` |
| `ppg_home` / `ppg_away` | points.home / home_played, points.away / away_played |
| `btts_rate` | season `btts` / played |
| `scoring_rate` | 1 − (failed_to_score / played)  *(fail-to-score derived from window)* |
| `cs_rate` | clean_sheets / played  *(derived from window; not a native field)* |
| `h1_goal_share` | goals_for_1h / goals_for  *(first-half tendency)* |

### 1.3 Recent-form features (rolling last-N from `/fixtures/between`)
| Feature | Window | Definition |
|---|---|---|
| `form_ppg_5` | last 5 | points earned / 5 |
| `form_gf_5`, `form_ga_5` | last 5 | goals for/against per game |
| `form_btts_5`, `form_over25_5` | last 5 | hit rate |
| `momentum` | last 5 vs season | `form_ppg_5 − ppg_season` (regression-to-mean guard) |

### 1.4 Head-to-head features (`include=h2h`, last N meetings)
`h2h_btts_rate`, `h2h_over25_rate`, `h2h_avg_total_goals`,
`h2h_home_win_rate`, `h2h_draw_rate` — each with `sample_size`.

### 1.5 External-model anchor features (blend targets, not inputs)
From `include=probability`: `api_home_win`, `api_draw`, `api_away_win`,
`api_btts`, `api_o05…o45`, `api_double_chance_*`.
From `include=odds` (`ft_result`, `btts`, `total_goals`): de-vigged
market-implied probabilities as a second anchor.

---

## 2. Feature importance (ranked)

Ranking reflects predictive weight for match-outcome & goals markets:

1. **Venue-split attack/defense strengths** — drive the Poisson λ; everything
   downstream (1X2, O/U, BTTS, correct score, xG) flows from these. *Highest.*
2. **League goal baselines** — normalize strengths; wrong baseline skews all λ.
3. **Recent form / momentum** — corrects stale season aggregates mid-season.
4. **API `probability` anchor** — a strong independent model; excellent
   ensemble partner and sanity check.
5. **Market-implied (de-vigged) odds** — sharpest single signal where liquid,
   but only on some fixtures (`has_odds`).
6. **Home/away PPG** — outcome tilt, partly redundant with strengths.
7. **H2H** — low sample, noisy; small nudge only.
8. **First-half goal shares** — only for 1H sub-markets.

---

## 3. Weight allocation

Two blend layers. **Layer A** builds our own explainable probability from
statistics. **Layer B** ensembles it with independent models.

### 3.1 Layer A — strength construction (inside the Poisson model)
```
effective_attack  = 0.60 * season_venue_attack  + 0.40 * form_attack_5
effective_defense = 0.60 * season_venue_defense + 0.40 * form_defense_5
h2h_nudge         = ±0.05 max, scaled by h2h_sample_size / 6   (capped)
```
Season vs form 60/40 early-season shifts to 50/50 once `form` sample ≥ 8.

### 3.2 Layer B — final ensemble (per market)
```
P_final = w_model * P_ourPoisson
        + w_api   * P_oddAlertsProbability
        + w_market* P_deviggedOdds
```
| Scenario | w_model | w_api | w_market |
|---|---|---|---|
| Odds present (`has_odds=true`) | 0.40 | 0.30 | 0.30 |
| No odds, API prob present | 0.55 | 0.45 | 0.00 |
| Sparse data (<6 matches either team) | 0.25 | 0.75 | 0.00 |

Weights renormalize when a source is missing (Section 7). All weights live in
one config module so they are tunable without code changes.

---

## 4. Formula / logic per prediction type

The engine core is a **Dixon-Coles-corrected bivariate Poisson** goals model.
Two means produce **every** market, which keeps predictions internally
consistent and fully explainable.

### 4.1 Expected goals (λ) — the xG estimate
```
λ_home = lg_home_goal_avg * eff_attack_home * eff_defense_away
λ_away = lg_away_goal_avg * eff_attack_away * eff_defense_home
```
Output `expected_goals = { home: λ_home, away: λ_away }` (labelled *estimate*).

### 4.2 Score matrix
```
P(i,j) = Poisson(i; λ_home) * Poisson(j; λ_away) * τ(i,j)
```
`τ` = Dixon-Coles low-score correction (adjusts 0-0/1-0/0-1/1-1 for the known
draw-inflation bias). Compute i,j over 0..8, renormalize to sum 1.

### 4.3 1X2 (home / draw / away)
```
home_win = Σ P(i,j) for i>j ;  draw = Σ i=j ;  away_win = Σ i<j
```
Then ensemble per Section 3.2.

### 4.4 Double chance
```
1X = home_win + draw ; 12 = home_win + away_win ; X2 = draw + away_win
```
Output the highest-probability pair (cross-check vs API `double_chance_*`).

### 4.5 BTTS
```
btts_yes = 1 − P(home=0) − P(away=0) + P(0,0)
```
Blend with season `btts_rate`, `h2h_btts_rate`, API `probability.btts`.

### 4.6 Over/Under 0.5 / 1.5 / 2.5 / 3.5
```
over_k.5 = Σ P(i,j) for (i+j) > k ;  under = 1 − over
```
Blend with API `o05/o15/o25/o35`. (O0.5 ≈ `1 − P(0,0)`.)

### 4.7 Correct score
Take the top 3 cells of the (blended-scaled) matrix, sorted by probability:
`["2-1", "1-1", "1-0"]`. Attach each cell's probability for transparency.

### 4.8 Confidence — Section 8.

**Rule for every market:** attach the top 1–3 statistics (with values and
`sample_size`) that drove it, for the `explanation[]` array.

---

## 5. Data requirements per prediction

| Prediction | Minimum data needed | Degrades to |
|---|---|---|
| 1X2 | venue-split GF/GA + played, league avgs | API `probability` only |
| Double chance | 1X2 output | API `double_chance_*` |
| BTTS | GF/GA both teams | season `btts_rate` / API `btts` |
| O/U lines | λ_home, λ_away | API `o**` |
| Correct score | full score matrix | top API-implied scoreline |
| xG estimate | strengths + baselines | league-avg fallback λ |
| Confidence | all of the above + sample sizes | capped low (Section 8) |

---

## 6. API calls required (real OddAlerts endpoints)

The prompt's endpoints are idealized; here is the **actual** mapping.

| Prompt asked for | Real OddAlerts call | Provides |
|---|---|---|
| `GET /fixtures/upcoming` | `GET /fixtures/upcoming?days=N` | fixture list, `home_id/away_id`, `season_id`, `competition_id`, `has_odds` |
| `GET /team/{id}/matches` *(doesn't exist)* | `GET /fixtures/between?from&to&teams=` | rolling results → form features |
| `GET /matches/head-to-head` *(doesn't exist)* | `GET /fixtures/:id?include=h2h` | last-N meetings, btts/over/result flags |
| `GET /league/{id}/standings` *(doesn't exist)* | `GET /stats/season/:seasonId` | per-team season aggregates + 1H/2H splits + home/away points |
| — (bonus) | `GET /fixtures/:id?include=probability,odds` | API model probs + de-vigged market anchor |

**Per-fixture prediction flow:**
1. `GET /fixtures/upcoming?days=N` → candidate fixtures.
2. For each: `GET /fixtures/:id?include=h2h,probability,odds`.
3. `GET /stats/season/:seasonId` (cached per season) → strengths.
4. `GET /fixtures/between` (cached per team/season) → form.
5. Feed features → Poisson core → ensemble → response.

Respect `X-RateLimit-Limit: 300`; cache season + competition data aggressively
(they change slowly). Precompute predictions on a schedule (APScheduler) — the
app API only ever reads stored predictions, never predicts on request.

---

## 7. Missing-data handling

| Situation | Handling |
|---|---|
| `home_id`/`away_id` null | Cannot map to season stats → fall back to API `probability` only; confidence capped at 40%. |
| No `season_id` / empty season stats | Use league-average λ (both teams = league mean) → flag `low_data`. |
| `played` < 6 for a team | Shrink strengths toward league mean (Bayesian shrinkage, prior weight = 6 matches); raise `w_api`. |
| `has_odds=false` | Drop market anchor; renormalize `w_model`/`w_api`. |
| No `probability` include | Pure Poisson; confidence penalty. |
| H2H `sample_size` < 2 | Ignore H2H nudge entirely. |
| Any divide-by-zero (0 played) | Guard → league mean, never NaN. |

**Principle:** never fabricate. Every fallback lowers confidence and is recorded
in the prediction's `data_flags` so the UI can show why a prediction is soft.

---

## 8. Confidence calculation

Confidence is a 0–100 blend of four independent signals:

```
confidence = 100 * ( 0.40 * margin_score      # how decisive the top outcome is
                   + 0.25 * agreement_score   # model vs API vs market agreement
                   + 0.20 * sample_score      # data volume behind the features
                   + 0.15 * completeness_score) # how many sources were available
```
- `margin_score` = normalized gap between the top and second 1X2 probability
  (or top-vs-implied for goals markets). Also usable as `1 − entropy/entropy_max`.
- `agreement_score` = 1 − mean pairwise distance between our model, API
  `probability`, and de-vigged odds (only sources present count).
- `sample_score` = min(1, min(home_played, away_played) / 12).
- `completeness_score` = fraction of {season stats, form, H2H≥3, API prob,
  odds} actually available.

Hard caps from Section 7 (e.g. null team id → ≤40) apply **after** the blend.

---

## 9. Future ML upgrade path

The Poisson core is deliberately the **baseline**; it doubles as a feature
generator and an explainability anchor for later models.

| Phase | Model | Notes |
|---|---|---|
| **P0 (now)** | Dixon-Coles Poisson + ensemble blend | Explainable, zero training data needed, ships immediately. |
| **P1** | Logistic Regression per market | Trained on stored predictions vs actual results (features from Section 1). Calibrated with Platt/Isotonic. |
| **P2** | Gradient boosting (XGBoost / LightGBM) | Multiclass 1X2 + per-market binaries; SHAP values feed the same `explanation[]` contract. |
| **P3** | Poisson/Neg-Binomial GLM or bivariate-Poisson NN | Directly models goal counts → keeps correct-score + O/U consistency. |

**Data flywheel:** log every prediction with its features and the realized
result (`/fixtures/between` backfill) into Supabase. After ~1 full season of
stored fixtures, models train on real labels instead of the current synthetic
labels in `backend/train_btts.py`. Keep the Poisson output as a **feature** into
the ML models (stacking), never discard it — it preserves explainability.

---

## 10. Explainability contract

Every prediction returns `explanation[]` where each item cites a **real field**
and its value, e.g.:
- `"Home scores 1.9/game at home (home_goals_for/home_played), 38% above league avg"`
- `"BTTS in 7/10 recent matches (form_btts_5) and 4/6 H2H meetings"`
- `"Model (58%), OddAlerts (55%) and market (56%) agree on home win → high confidence"`

No explanation may reference a stat the API did not actually provide.

---

## 11. Response shape (matches the prompt, with honesty fields added)

```json
{
  "match": { "home_team": "", "away_team": "", "fixture_id": 0 },
  "prediction": { "home_win": 0, "draw": 0, "away_win": 0 },
  "markets": {
    "double_chance": "", "btts": "",
    "over_05": "", "over_15": "", "over_25": "", "over_35": ""
  },
  "expected_goals": { "home": 0, "away": 0, "note": "model estimate (λ), not API xG" },
  "correct_score": [ { "score": "2-1", "p": 0.11 }, { "score": "1-1", "p": 0.10 } ],
  "confidence": 0,
  "data_flags": [ "low_data", "no_odds" ],
  "explanation": [ "…tied to a real field…" ]
}
```
