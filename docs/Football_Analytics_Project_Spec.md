# Football Analytics & Betting Intelligence Platform

**PROJECT REQUIREMENTS & SPECIFICATION DOCUMENT**

*Extracted from handwritten project notes*

---

> **PROJECT AT A GLANCE**
> - **Data Sources:** Flashscore │ Footy Stats │ Odds Alert API │ Sofascore │ Hollywoodbets
> - **Database:** 72 statistical tables (45 base + 27 last-N variations)
> - **Stats:** 100+ metrics │ **Scope:** Full-time, 1st Half, 2nd Half
> - **Phases:** 5 phases from data scraping to strategy + dashboard

---

## 1. Project Overview

This project builds a comprehensive Football Analytics and Betting Intelligence Platform. It collects, normalises, and analyses match data from multiple sources, then uses statistical models to identify profitable betting opportunities. The platform is designed to progress through 5 phases, from raw data collection through to an interactive betting dashboard.

### 1.1 High-Level Goals

- Automate data collection from Flashscore, Footy Stats, Sofascore, and Hollywoodbets
- Build a relational database of 72 statistical tables covering all key match metrics
- Generate 100+ calculated statistics per team across Overall, Home, and Away splits
- Create betting streams and strategy groupings based on statistical patterns
- Integrate an odds engine (Odds Alert API + Hollywoodbets) to match stats to live odds
- Deliver a bet-slip generator and an interactive tracking dashboard

---

## 2. Data Sources & Scripts

All data originates from two categories of sources: match/stats providers and bookmakers.

### 2.1 Match & Stats Providers

| Source | Data Collected | Delivery |
|---|---|---|
| Flashscore | Results (FT / HT / 2nd Half), Match Summary, Fixtures, H2H (last 5), Standings (overall/home/away, current + archived) | Custom scraping script — list of requirements to be documented |
| Footy Stats | Referee stats, Cards (yellow/red), Corners, XG, XGA, Fixture details, Results (FT + Match Summary), Standing table | Script — every available endpoint |
| Sofascore | Additional match data to complement Flashscore | Script |
| Google Search | Coach and player names / transfers / squad info | Search results — take results |

### 2.2 Bookmaker / Odds Sources

| Source | Data Collected | Notes |
|---|---|---|
| Hollywoodbets | Odds, bet-slip generation | Requires instructions doc + odds function |
| Odds Alert API | Live odds alerts, odds comparison | API integration — used in strategy formulation (Phase 3+) |

### 2.3 Key Data Elements per League

- All-round matches with photos (match images from Flashscore)
- Results: Full-time, Half-time, 2nd Half, Match Summary
- Fixtures: H2H results (last 5 meetings)
- Standings: Overall, Home, Away — old + new — current + archived
- Team information: Transfers (arrivals + departures), Squad down to player info
- Fixture detail page: H2H (all — overall/away/home), Match Summary, draw importance, line-ups, odds, top scorers

---

## 3. Database — Tables to be Created

The database is organised into two groups of tables, totalling 72 tables. Each table captures a specific slice of match statistics across different time periods and game contexts.

### 3.1 Table Groups

| Group | Count | Description |
|---|---|---|
| Base Tables | 45 | Core statistical tables covering all standard metrics (see Section 4 for full list) |
| Last-N Variation Tables | 27 | Rolling last-N match tables: Last 10, Last 8, Last 6 — each split across Overall, Home, and Away |
| **TOTAL** | **72** | |

### 3.2 Last-N Table Structure

The 27 variation tables are built from 3 recency windows × 3 splits × 3 time periods:

| Recency Window | Splits | Time Periods | Sub-total |
|---|---|---|---|
| Last 10 games | Overall / Home / Away | Full-time / Half-time / 2nd Half | 9 tables |
| Last 8 games | Overall / Home / Away | Full-time / Half-time / 2nd Half | 9 tables |
| Last 6 games | Overall / Home / Away | Full-time / Half-time / 2nd Half | 9 tables |

### 3.3 Colour-Coding Convention

Tables will use a traffic-light colour scheme based on percentage compliance thresholds:

| Colour | Threshold | Meaning |
|---|---|---|
| 🟢 Green | ≥ 33% | Strong / high compliance |
| 🟡 Yellow | 33% | Medium / moderate |
| 🔴 Red | 33% | Low / caution |

---

## 4. Statistics Catalogue

Statistics are divided into categories based on the scope they cover. All 45 tables share the Ordinary (Team) Stats listed in Section 4.1. Additional sub-category stats are described in Sections 4.2 onwards.

### 4.1 Ordinary / Team Stats (all 45 tables)

The following 34 standard metrics apply to every table. SC% = Scoring %, Conc% = Conceding %, AVG = Average:

| # | Stat | # | Stat | # | Stat |
|---|---|---|---|---|---|
| 1 | SC% | 13 | Over 1.5 | 25 | Scoring 1.5 or more |
| 2 | Conc% | 14 | Over 2.5 | 26 | Conceding 1.5 or more |
| 3 | SC/m (AVG) | 15 | Over 3.5 | 27 | Scoring 2.5 or more |
| 4 | Conc/m (AVG) | 16 | Over 4.5 | 28 | Conceding 2.5 or more |
| 5 | BTTS - Yes | 17 | Under 1.5 | 29 | Scored First (SF / CF / NG) |
| 6 | BTTS - No | 18 | Under 2.5 | 30 | Handicap |
| 7 | CS | 19 | Under 3.5 | 31 | Early Goals — 1H (20 min) |
| 8 | AVG | 20 | Under 4.5 | 32 | Early Goals Scored — 2H (60 min) |
| 9 | FTS | 21 | Over 0.5 | 33 | Early Goals Conceded |
| 10 | W | 22 | Under 0.5 | 34 | Late Goals — FT: 70 min / 1H: 35 min / 2H: 75 min |
| 11 | D | 23 | Scoring 0.5 or more | | |
| 12 | L | 24 | Conceding 0.5 or more | | |

### 4.2 PPG (Points Per Game) Tables — 45 Stats

PPG is tracked across Overall, Half-time, and 2nd Half contexts. The 45 PPG stats cover:

| Scope | Sub-stats (× 4 card variants each) | Stats # |
|---|---|---|
| Full-time Overall | PPG, Green PPG, Yellow PPG, Red PPG | 1–4 |
| Full-time Home | PPG, Green PPG, Yellow PPG, Red PPG | 5–8 |
| Full-time Away | PPG, Green PPG, Yellow PPG, Red PPG | 9–12 |
| 1st Half Overall | PPG, Green PPG, Yellow PPG, Red PPG | 13–16 |
| 1st Half Home | PPG, Green PPG, Yellow PPG, Red PPG | 17–20 |
| 1st Half Away | PPG, Green PPG, Yellow PPG, Red PPG | 21–24 |
| 2nd Half Overall | PPG, Green PPG, Yellow PPG, Red PPG | 25–28 |
| 2nd Half Home | PPG, Green PPG, Yellow PPG, Red PPG | 29–32 |
| 2nd Half Away | PPG, Green PPG, Yellow PPG, Red PPG | 33–36 |
| Last 5 — Full-time Overall/Home/Away | PPG each | 37–39 |
| 1st Half Last 5 — Overall/Home/Away | PPG each (lasts) | 40–42 |
| 2nd Half Last 5 — Overall/Home/Away | PPG each (lasts) | 43–45 |

### 4.3 Full-Time Only Stats

| # | Stat |
|---|---|
| 1 | BTTS Both Halves |
| 2 | Teams that Score in Both Halves |
| 3 | BTTS & Over 2.5 |
| 4 | Conceded Both Halves |
| 5 | Won Both Halves |
| 6 | Win to Nil |
| 7 | Lost to Nil |
| 8 | Rescued Points |
| 9 | Blown Points |
| 10 | HT/FT (9 combos): Win/Win, Win/Draw, Win/Lose, Draw/Win, Draw/Draw, Draw/Lose, Lose/Win, Lose/Draw, Lose/Lose |

### 4.4 1st Half Stats Only

- 0–0 at 1st Half (percentage of games)
- HT Under 0.5 (AVG)
- HT Over 1.5 (AVG)

### 4.5 2nd Half Stats Only

- 0–0 at 2nd Half
- 2nd Half Under 0.5 (AVG)
- 2nd Half Over 1.5 (AVG)

### 4.6 Series Stats (Table 2)

Series stats track consecutive / sequential patterns (29 stats with opponent context, plus 7 without-proper-opponent variants):

| # | Stat | # | Stat |
|---|---|---|---|
| 1 | BTTS - Yes | 16 | Under 4.5 |
| 2 | BTTS - No | 17 | Scoring 0.5 or more |
| 3 | CS | 18 | Conceding 0.5 or more |
| 4 | FTS | 19 | Scoring 1.5 or more |
| 5 | W | 20 | Conceding 1.5 or more |
| 6 | D | 21 | Scoring 2.5 or more |
| 7 | L | 22 | Conceding 2.5 or more |
| 8 | Over 0.5 | 23–26 | Scored/Conceded 1.5/2.5 (no proper opponent) |
| 9 | Over 1.5 | 27 | W (no proper opponent) |
| 10 | Over 2.5 | 28 | D (no proper opponent) |
| 11 | Over 3.5 | 29 | L (no proper opponent) |
| 12 | Over 4.5 | — | — |
| 13 | Under 0.5 | — | — |
| 14 | Under 1.5 | — | — |
| 15 | Under 3.5 | — | — |

### 4.7 League Stats

Found at the bottom of the league table, representing league-wide averages. Contains all Ordinary stats except SC% and Conc%:

- BTTS - Yes / No
- Over 2.5 / Over 3.5
- Under 2.5 / Under 3.5
- *(Additional slots reserved)*

### 4.8 Stats Ordinary + RFS (Table 3 & 4)

Two additional stream types use the base stats combined with a Recency Failure Signal (RFS):

- **Table 3** — Stats Ordinary + RFS: last game was the opposite of usual (team failed to do the usual)
- **Table 4** — Series or Series-Without + RFS: last game was opposite of usual (failed to continue the usual)

---

## 5. Project Phases

The project is structured into 5 phases, each building on the previous. Phases 1–2 are foundational; Phases 3–5 are where strategy and value generation happen.

| Phase | Name | Key Deliverables |
|---|---|---|
| Phase 1 | Data Collection & Scraping | Flashscore script, Footy Stats script, Sofascore script, Hollywoodbets script, Odds Alert API integration |
| Phase 2 | Database & Stats Engine | 72 tables created (45 base + 27 last-N), 100+ stats generated per table, colour-coded outputs |
| Phase 3 | Streams & Groupings Formation | Streams formation from stats, groupings formation, stats call-out framework, stats for support (Overall vs Home vs Away, fixture-based) |
| Phase 4 | Strategy Engine | Create strategies, call out fixtures matching strategies by date & time, % compliance to strategy, odds fusion page, motives for support |
| Phase 5 | Dashboard & Bet Slip | Bet slip generator, interactive tracking dashboard, coordination of fixture call (stats sorting list: overall/home/away + kickoff time + date) |

### 5.1 Phase 3 — Streams & Groupings Detail

The Streams & Groupings phase structures stats into actionable signals:

- **Calling out:** identifies fixtures meeting statistical thresholds
- **Comparing:** applies stats and compares performance
- **Picking options:** selects best fixture candidates
- **Strategies build-up:** progressive accumulation of qualifying criteria
- **Selection & verification** of fixtures
- **Risk Exposure & Risk Elimination** analysis
- **Relates to Odds Alert** formulation for support

### 5.2 Phase 4 — Coordination & Arrangement

The stats sorting list for each fixture call includes:

- Stats sorted by: Overall, Home, Away
- Forty-table stats — overall only
- Fixture kickoff time and date

---

## 6. Flashscore Scrape Requirements (06/12/22 Notes)

These notes document the detailed data requirements from the Flashscore website, as recorded from the scraping session dated 06 December 2022.

### 6.1 League Level

- Results page @ league level
- Match → Statistics (tab 3)
- Match → Line-ups (tab 5)
- Match summary
- Odds (tab 6)
- H2H (tab 4)
- Draw (tab 5)

### 6.2 Standings

All standings to include old + new (current + archived). Splits required:

- Overall
- Home
- Away

Additional standing columns: Form, Over/Under, HT/FT, Top Scorer.

*Note: Omakoti comparison use only.*

### 6.3 Fixture Page

- H2H — everything: overall / away / home
- Match Summary → identify missing players
- Draw — importance of the game
- Line-ups
- Odds
- Top scorers (in standings block)

### 6.4 Teams

- Transfers — everything: all arrivals + departures
- Squad — everything, down to player info

### 6.5 Footy Stats Additions

- Referee stats
- Cards (yellow / red) stats
- Corners stats
- Fixtures — Show more (take all), H2H last 5 games, XG, XGA, Last 5 Home team vs Last 5 Away team, Odds
- Results — Full-time → Match Summary → HT
- Standings table (old + new, overall)

### 6.6 Coach & Player Names

Coach and player names to be sourced via Google Search — take results directly.

---

## 7. Full Component & Feature Map

Summary of all 13 top-level components identified in the project summary notes:

| # | Component | Description |
|---|---|---|
| 1 | Data Suppliers — Scripts | Flashscore (list of requirements), Odds Alert API, Sofascore script, Hollywoodbets script |
| 2 | Create Tables (72 total) | 45 base tables + 27 last-N tables. 100+ stats per table |
| 3 | Streams Formation | Statistical streams created from table outputs |
| 4 | Groupings Formation | Groupings derived from streams |
| 5 | RA + Other Separation Tools | Imbalance detection (imbangi ect) — separation and filtering tools |
| 6 | Stats Call-out Framework | Framework for surfacing relevant stats at fixture level |
| 7 | Stats for Support | Overall vs Home vs Away — fixture-based support stats |
| 8 | Coordination & Arrangement | Stats sorting list per fixture: Overall/Home/Away + kickoff time + date |
| 9 | Create & Call-out Strategies | Strategy creation and % compliance calling — by date & time |
| 10 | Odds Fusion Page | Combine stats output with live odds data |
| 11 | Motives — for Support | Supporting motivations for bet selection |
| 12 | Bet Slip Generator | Auto-generate bet slips from strategy outputs |
| 13 | Dashboard (Interactive Tracking) | Live tracking and performance dashboard |

---

*— END OF DOCUMENT —*

*CONFIDENTIAL*
