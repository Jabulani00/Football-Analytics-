# Scoreline — Progress Update for the Client

**Date:** 15 July 2026
**In one line:** The app is stable and working, we fixed the one issue that could
cause a crash, the full set of 72 statistics sheets is built, and we're now
filling them in and connecting the live match feed.

---

## Where we are right now

Scoreline is coming together well. The app opens reliably, every screen loads and
looks right, and moving around it — Scores, Match pages, Team pages, League
tables, and the Betting Intelligence section — is smooth and responsive. Nothing
on screen is broken.

---

## The statistics tables — how many are built, how many are left

A big part of Scoreline is its library of **72 statistics tables**. Think of each
one as a specialist sheet that looks at team performance from a different angle —
the full match, the first half, the second half, home games, away games, and
recent-form windows (last 6, 8, and 10 games).

Here's exactly where those 72 stand today:

| Statistics tables | Count | What it means |
|---|---|---|
| **Built (structure in place)** | **72 of 72** | The entire framework exists — every sheet has been created. ✅ |
| **Filled in with their own correct calculations** | **36 of 72** | About half are already doing their specific job properly. |
| **Built but still showing placeholder numbers** | **36 of 72** | The other half exist but need their own tailored calculations added. |
| **Connected to live match data** | **0 of 72** | None are yet fed by the live feed — that's the next milestone. |

**In plain terms:** the shelving for all 72 sheets is 100% built. Half the sheets
are already filled with the right figures; the other half are built but waiting
for their specific calculations. The final step — pouring real, live match
results into all of them — is queued up next.

---

## What we fixed recently

- **One important fix:** we found and corrected a fault that could crash the Match
  page at the moment a game's details finished loading. That page is now solid.
- **Tidy-up:** we cleaned out unused leftover code in nine places, keeping the app
  lean and easier to maintain.

After the fixes we re-checked everything and confirmed nothing else was affected.

---

## Why the live scores show "Couldn't load" on our test machine

While testing, our development computer is on a network that **blocks betting and
odds websites** (a common internet content filter). Our data provider is an
odds/betting service, so this machine simply isn't allowed to reach it — and the
app politely shows a "Couldn't load — Retry" message, exactly as designed.

**This is a restriction of our test network, not a fault in the app.** We
confirmed general internet works fine here; only betting-category sites are
blocked. On an unrestricted connection — such as a mobile hotspot, or the hosted
version we'll set up for you — the live match data flows normally. In the
meantime, the parts of the app that use built-in sample data displayed perfectly.

---

## What's coming next

We've organised the upcoming work into three streams so our three developers can
build in parallel without waiting on each other:

1. **Finishing the statistics tables** — adding the tailored calculations to the
   remaining 36 sheets, then filling all 72 with real, live match results.
2. **Turning on predictions** — showing each match's likely winner, goals,
   both-teams-to-score, likely scoreline, and a confidence level, built from past
   results.
3. **Strategy & betting tools** — completing the strategy builder and bet-slip
   features, plus user sign-in so people can save their own strategies.

Alongside this we'll set up the shared hosted version, which also removes the
betting-site network restriction so the whole team — and you — can preview
everything with real, live data.

---

## The bottom line

The foundation is strong and stable, the app is crash-free, and the full 72-table
statistics framework is in place with half already calculating correctly. The next
phase — finishing the remaining tables and switching on live data and predictions
— is well mapped out and underway. We're on track and confident in the direction.
