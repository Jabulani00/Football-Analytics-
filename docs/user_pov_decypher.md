# From the User's Point of View — How They Use It

---

## Overview

The user interacts with a football analytics platform that organises all scraped and calculated data into a structured, layered experience. Every fixture the user looks at triggers a full information stack — from team form and head-to-head history, all the way through to live odds and auto-generated bet slips.

The platform is designed so the user never has to go digging. Everything surfaces in context, at the right level.

---

## 1. The League View

When a user selects a league, they land on a results-first view:

- **Results** — all match results for that league
- **Standings** — three versions: overall, home, and away
  - Both current (new) and historical (archived/old) standings are available
  - Comparison is done against the Opta/expected standing only
- **Top Scorers** — league-wide goal scoring leaders
- **Odds** — league-level odds overview (6)
- **Form** — team form across the league
- **Over/Under** — league-wide over/under trends
- **HT/FT** — halftime to full-time patterns across the league

---

## 2. The Match View (Flash Score Feed)

Clicking into a fixture from the league view opens the full match layer. This is the core of the user's daily workflow.

### Head-to-Head (H2H)
- Displays all previous meetings between the two teams
- Broken into: **Overall**, **Home**, and **Away** views
- Shows last 5 H2H meetings with results

### Match Summary
- Flags all **missing or injured players** for both teams
- Notes the **importance of the game** (draw relevance, relegation, title race, etc.)

### Lineups
- Starting XI for both teams when confirmed

### Odds
- Pulled directly from the **Odds Alert API** and **Hollywoodbets**
- Displayed in context of the fixture, not as a separate screen

### Draw Analysis
- A dedicated section that assesses how likely or meaningful a draw is for this specific fixture

---

## 3. The Statistics View (Footy Stats Feed)

Each fixture has a deeper stats layer pulled from Footy Stats, showing:

- **XG** (Expected Goals) — how many goals each team "should" score based on chances
- **XGA** (Expected Goals Against) — defensive exposure metric
- **Last 5 Home** team results vs **Last 5 Away** team results — side by side comparison
- **Fixtures with "Show More"** — expands to the full fixture history
- A **H2H last 5 games** section specific to the stat context
- **Referee stats** — the assigned referee's history (cards given, fouls allowed, etc.)
- **Cards stats** — yellow and red card frequency per team
- **Corners stats** — average corners for and against

---

## 4. The Team View

When a user drills into a specific team, they see:

### Squad & Personnel
- Full squad list with individual player profiles
- **Coach** name (verified via Google search)
- **Player names** (verified via Google search — taken as search results)

### Transfers
- All arrivals and departures
- Full transfer history — everything in, everything out

### Player Info
- Each player's details down to individual level (position, nationality, age, etc.)

---

## 5. The Stats Callout & Strategy Layer

This is the intelligence layer of the platform — where raw stats become actionable insights.

### How Stats Are Called Out
- Stats are ranked by **% compliance** — how frequently a stat has held true over the selected sample
- Sorted in order: **Overall → Home → Away**
- Each callout also includes **fixture kickoff time and date** for context

### Strategy Engine
- Strategies are pre-built combinations of stats
- The system **fires strategies automatically** based on date and time of upcoming fixtures
- Strategies are ranked by their compliance percentage — highest confidence first

### Phases of the Strategy Build (Phases 1–5)
The full workflow the user goes through when selecting bets:

1. **Calling Out** — surfacing which stats are active and trending
2. **Comparing** — comparing stats across fixtures or teams
3. **Picking Options** — shortlisting viable bet options
4. **Strategy Build-Up** — constructing the strategy from selected stats
5. **Selection & Verification of Fixtures** — confirming the fixture qualifies
6. **Risk Exposure** — understanding how much risk the selection carries
7. **Risk Elimination** — removing selections that don't meet the threshold

This process links directly to the **Odds Alert formulation** to ensure the odds on offer match the statistical edge identified.

---

## 6. The Odds Fusion Page

A dedicated page that brings together:
- Live odds from Hollywoodbets and the Odds Alert API
- The stats and strategies that align with those odds
- Allows the user to see where **value** exists based on the system's calculations

---

## 7. Bet Slip Generator

Once selections pass through the strategy and odds fusion layer:
- The system **auto-generates a bet slip** from the qualified selections
- The user reviews and confirms
- No manual selection needed if the strategy engine has done its job

---

## 8. The Interactive Dashboard

A real-time tracking view that shows:
- All active strategies and their current status
- Bet slip performance tracking
- Live fixture monitoring
- Ongoing compliance scores for each stat and strategy

---

## Summary Flow — What the User Actually Does

```
Open league → Check standings + results
       ↓
Select fixture → View H2H, missing players, lineups, odds
       ↓
Drill into stats → XG, XGA, form, cards, corners, referee
       ↓
Check team page → Squad, transfers, player info
       ↓
Review callouts → Stats ranked by % compliance
       ↓
Apply strategy → System fires strategy for fixture date/time
       ↓
Odds Fusion Page → Confirm value exists
       ↓
Bet Slip Generator → Auto-generated selections
       ↓
Dashboard → Track everything live
```

The user's role is essentially **verification and confirmation** — the system surfaces the data, ranks it, and generates the output. The user decides whether to act on it.
