# Scoreline — Integration Breakdown (from analysis PDF)

**Source:** `SKM_301i26082719570.pdf` (handwritten analysis, ~98 pages)  
**Purpose:** Simplified work list of what still needs to be built into this app.  
**How to use:** Pick **one section at a time**. Do not start the next section until the current one is accepted.

Related docs already in the repo: `Football_Analytics_Project_Spec.md`, `USER_STORIES.md`, `user_pov_decypher.md`.

---

## How this maps to the app today

| Area | Rough status in Scoreline |
|---|---|
| Live scores / Results / match shell | Largely in place (OddAlerts) |
| League standings + green/yellow/red thirds | Partly in place |
| 72 stats tables (ordinary / PPG / series / last-N) | Structure + live builder largely in place |
| H2H lists on match page | Basic version in place |
| Motivation / “importance of 3 points” | **Built** — match Summary “Table stakes” + standings Stakes tab |
| Separator tools (sudden drop, streaks, Imbangi…) | **Built** — match Summary “Separators & last 5” |
| Last-5 graded analysis + matchup naming | **Built** — same panel (Ukulumbana + lenses A–D) |
| Hidden strength / weakness & problem address | **Built** — Summary “Hidden layers” (Section 6) |
| H2H options & Polar patterns | **Built** — H2H tab option tags (Section 7) |
| Bhozoma / mid-table power tables | Not built |
| Hollywood hunt script + value odds rules | Partial / sample only |
| Strategy compliance + bet slip | UI shell / sample; not full engine |
| Chase / Escape / critical positions | **Built** — same Table stakes surfaces (Section 3) |

---

## Section 0 — Shared foundations (do once, unlocks many sections)

Small shared pieces every later section will reuse.

- Confirm **Green / Yellow / Red** bands on league tables (top / middle / bottom thirds).
- Keep **Overall / Home / Away** and **FT / 1H / 2H** as the standard splits everywhere.
- Keep **Last 10 / Last 8 / Last 6** rolling windows available on stats views.
- Store or compute, per team: points, position, matches played, remaining matches, gap to neighbours.
- Agree plain English names for internal terms used in the notes (keep original names in UI later if needed):
  - **Imbangi / Imbanpi** — rival / neighbour comparison in the table
  - **Indlela** — path / method filter
  - **Bhozoma / Bozoma** — mid-table power vs teams above/below
  - **Makhelwane** — neighbour team tied to a target position
  - **Inhlambuluko** — draw-heavy recent form (3+ draws in last 5)
  - **Ukulumbana** — named matchup type between two form states
  - **Child beater** — strong team beating weak opposition pattern
  - **Polar** — clear one-sided H2H or form pattern

**Done when:** bands + splits + last-N windows work consistently, and the glossary above is agreed.

---

## Section 1 — Stats tables finish & display rules

Finish the stats layer so later “call-outs” have real numbers.

- Finish any remaining **family-specific** metrics (PPG colours, series streaks, FT-only patterns, league averages).
- On **Last 10 / 8 / 6** tables, show only the teams that belong in that window context (not the full league dump if the view is meant to be truncated).
- Apply traffic-light colours on percentage stats using the project thresholds.
- Add the **core comparison set of 7 stats** side-by-side for Team 1 vs Team 2 on a fixture:
  - PPG, scored/match, conceded/match, scoring %, conceding %, BTTS, clean sheets
- Support **original / true / revised** views later (start with one clear “live calculated” view).

**Done when:** fixture and league stats views show correct live numbers with colours, and T1 vs T2 can compare the 7 core stats.

---

## Section 2 — Importance of 3 points (motivation engine)

Decide whether a win actually matters for a team right now.

- For each team, read points of: team above 1, above 2, below 1, below 2, and any chosen **target position**.
- After imagining a **+3 win**, compute the new gaps.
- If the resulting gap is **4 points or less** → counts as motivation.
- If the gap is **4.1+** → ignore (no motivation impact).
- Label outcomes such as:
  - extend lead
  - take over a position
  - reduce gap as a chaser
  - escape relegation / safety
  - meaningless lead (no attached target) → **no motivation**
- Factor in **league progress**:
  - early season (~75% progress not reached): mostly “pull” factors
  - late season / last ~10 games: pull **and** push factors
- Mark **futile chase** when remaining matches cannot close the gap to the target.

**Done when:** each fixture can show Motivation A / B / none for home and away, with a short reason.

**Status (2026-09-02):** ✅ Shipped — `utils/motivationEngine.ts`, match Summary **Table stakes** panel, standings **Table stakes** tab. Existing league/tier views unchanged.

---

## Section 3 — Chase / Escape / critical positions

Turn league context into chase vs escape labels.

- Define critical lines per league (examples from notes: title, Europe spots, mid cut, relegation line — make configurable per league size).
- Tag teams as **Chase**, **Escape**, or **No reward / no motivation**.
- Escape rule of thumb: about **3 points** from the relegation line matters.
- Handle “dethroned” cases (dropped out of a critical band but still mathematically linked to it).
- Prefer sharper decisions for **middle-table** teams (yellow band), not only top/bottom.

**Done when:** standings and match pages can show Chase / Escape / No motivation badges.

**Status (2026-09-02):** ✅ Shipped with Section 2 — Chase / Escape / No reward badges + dethroned / futile-chase flags on the same Table stakes UI.

---

## Section 4 — Separator tools (alerts that split close games)

Build the “other separator tools” as yes/no flags on fixtures.

- **Sudden drop** (Overall / Home / Away)
- **Sudden rise / pickup**
- **Won 6 in a row** / **Lost 6 in a row** (warnings)
- **Never lost twice in a row** / **Never won twice in a row**
- **Struggle 2–3 games** + whether there is a **position worth fighting for**
- **Points difference (ΔP)** between the two teams
- **Highly contested league tops** (e.g. positions 1–5 within ~3 points) → “dangerous to play”
- **1-goal-difference** wins/losses graded as good / mediocre / bad (and late goals 80’–FT as a feature)
- Tools named in the notes to design carefully later: **Imbangi**, **Indlela**, **Child beater** (2 methods)

**Done when:** a fixture can show a short list of active separators with Good / Mediocre / Bad where needed.

**Status (2026-09-02):** ✅ Shipped — `utils/separatorTools.ts` + match Summary **Separators & last 5** panel. Existing tabs unchanged.

---

## Section 5 — Last 5 analysis engine

Build the dedicated last-5 pipeline described in the notes.

1. Take last 5 results as raw feed.  
2. Grade each result using **result + home/away + opponent above/below**.  
3. Score grades: Excellent=3, Good=2, Mediocre=1, Bad=0.  
4. Classify each team’s last-5 points:
   - Good: **> 9**
   - Medium: **4.1–8.9**
   - Bad: **< 4**
   - **Inhlambuluko** if 3+ draws  
5. Produce one of **6 true options** per team (good/med/bad ± inhlambuluko).  
6. Map the fixture to one of **21 Ukulumbana** matchup names (good vs bad, med vs med + inhla, etc.).  
7. Compare **initial vs final** state (positive / zero / negative change).  
8. Keep a path to later measure **machine reliability** (analysis vs actual result).

Also support comparison lenses:

- A Home vs Away  
- B Home vs Overall  
- C Overall vs Away  
- D Overall vs Overall  

Same-strength rule: difference **≤ 4.0**; meaningful gap when scenario differences are **≥ 3**.

**Done when:** opening a fixture shows last-5 grades, matchup name, and whether the gap is same-strength or split.

**Status (2026-09-02):** ✅ Shipped — `utils/last5Analysis.ts` (grades, Inhlambuluko, 21 Ukulumbana, lenses A–D) on the same Summary panel.

---

## Section 6 — Hidden strength / weakness & problem address

Use deeper layers when table power alone is not enough.

- When teams are **close** (Δ ≤ 4): look for big hidden strength / weakness gaps to separate them.
- When teams are **far apart** (Δ ≥ 4.1): measure risk — hidden weakness of the backed side vs hidden strength of the other.
- Track problem patterns in a call-out table:
  - stats affected
  - positive or negative
  - naming
  - value / difference
  - level
  - ability to call out
- Cover positive/negative count patterns for samples of 4 and 5 (A–F style mixes, including cancel-out cases).

**Done when:** close and far fixtures each show a short “hidden” verdict that can support or doubt the main pick.

**Status (2026-09-05):** ✅ Shipped — `utils/hiddenLayers.ts` + Summary **Hidden layers** block (close separate / far risk). Existing views unchanged.

---

## Section 7 — H2H options & Polar patterns

Upgrade H2H from a plain list into decision options.

- If no H2H data → no H2H effect.
- Flag **never beaten** the other side (Overall / Home / Away), from each team’s lens.
- **Polar**: one side clearly dominant.
- Compare H2H points share (example style `4/15` vs `6/15`); difference **≤ 3** counts as same.
- **Nika Nika**: anyone’s game / neutral.
- Last meeting was a draw → revenge / unsettled note.
- High avg goals (≥ 2.5) / low avg goals (≤ 1.5).
- Polar form sequences through Team 1’s lens (e.g. WWWWL, WWWL, WWL…) when enough matches exist.
- Output tags such as team good / team bad / warnings / score-bet relevance.

**Done when:** match H2H tab shows option tags, not only past scores.

**Status (2026-09-05):** ✅ Shipped — `utils/h2hOptions.ts` + additive **H2H options** strip above the existing H2H list.

---

## Section 8 — Bhozoma / mid-table power tables

Build the mid-table (“yellow guys”) separation tool.

- Focus on middle-band teams.
- For a team, list opponents **above** and **below**.
- Only use pairs with enough meetings (**MP ≥ 3**; 2 or less = not enough data).
- Compute possible points vs actual points, then %.
- Classify, for example:
  - under ~30% points taken from sides above → “Goliath hero” style underdog read
  - over ~30% → riskier / Bhozoma classic
- Show a small average table with columns like: MP, results/scores, max possible points, points attained, points lost, % attained.
- Run overall, but **usage focus is yellow-band teams**.
- Notes also count **+4 Bhozoma tables** on top of the 72 core tables (72 + 4 = 76).

**Done when:** yellow-band teams have a Bhozoma panel with above/below % and labels.

---

## Section 9 — League browser extras (Imbanpi & progress)

Extra league views beyond the normal table.

- League tables already need Overall / Home / Away; keep win=3, draw=1, loss=0.
- Build an **Imbanpi** comparison row/table:
  - team playing
  - position
  - competition / opponent team
  - opponent position
  - points difference (closer to 0 is more interesting)
  - recent Imbanpi score / result
- Show league progress and remaining matches; tighten logic in the last ~10 games.
- Optional standings extras from the wider project notes: Form, Over/Under, HT/FT, top scorers (add only after core motivation/separators work).

**Done when:** picking a league offers Imbanpi + progress context beside the normal table.

---

## Section 10 — Hollywoodbets script & coverage

Turn Hollywood from a static odds peek into a watch/hunt system.

- Script that can run frequently (notes say every minute) and store Country → League → Teams.
- Hourly compare “what was listed” vs “what is listed now”.
- Flag fixtures Hollywood removes or cools on (“teams they do not want us to play”).
- Strong **name matching** (nicknames, spelling, multi-part names, languages, II / Junior reserves as separate clubs).
- Coverage check: what our machine has vs what Hollywood has; list gaps and fill from other providers when needed.
- App must still work if the Hollywood script stops.

**Done when:** we can browse Hollywood coverage and see hunt/risk flags next to fixtures.

---

## Section 11 — Odds fusion & value rules

Compare “our machine” to bookmaker prices.

- Markets: 1X2, BTTS yes/no, Over/Under lines, Correct Score, Multiscores.
- Define top dog (shorter price) vs underdog (longer price).
- Value checks:
  - difference smaller / equal / bigger than a bracket
  - top-dog ÷ underdog ≈ 0.5 → investigate correct score / multiscores
  - watch the **0.35–0.65** style range for mispriced goal expectations
- Opposites formula example: `T1 − T2 = Δ` (e.g. BTTS Δ > 0.3); thresholds change per strategy.
- Handle cases where **machine conclusion ≠ Hollywood conclusion**.
- Strategy list minimums for O/U 0.5, 1.5, 2.5 (acceptable minimum to be configurable).

**Done when:** a fixture odds view shows machine vs bookie, value flags, and conflict state.

---

## Section 12 — Strategies, call-outs, bet slip, dashboard

Wire the decision pieces into the daily workflow.

- Create strategies from conditions (stats + separators + motivation + odds rules).
- Call out fixtures by date/time with **% compliance**.
- Motives / support notes under each pick.
- Bet-slip generator from selected calls.
- Interactive tracking dashboard (what was called vs what landed).
- Coordination sort order: Overall / Home / Away stats + kickoff time/date.

**Done when:** a user can save a strategy, see today’s matching fixtures, and export a slip.

---

## Section 13 — Bookmaker coverage list (later)

From the closing pages — expand beyond Hollywood when ready.

Priority-marked in the notes (start here later):

1. Hollywoodbets  
2. Betway  
3. Bet.co.za  
4. Supabets  
5. World Sports Betting  
6. Sunbet  
7. BetXchange  
8. Sportingbets  
9. Gbets  
10. Playabets  
11. Interbet (Soccer 13)

Also capture manager homework fields: **max payout** and **limiting policies** per bookie.

**Done when:** at least Hollywood + one more bookie can be compared on a fixture; list the rest as backlog.

---

## Suggested build order (separate passes)

| Pass | Section | Why this order |
|---|---|---|
| 1 | Section 0 + 1 | Shared splits/bands/stats everything else reads |
| 2 | Section 2 + 3 | Motivation / chase-escape is the decision core |
| 3 | Section 4 | Separators to split close games |
| 4 | Section 5 | Last-5 naming engine |
| 5 | Section 6 + 7 | Hidden layers + H2H options |
| 6 | Section 8 + 9 | Bhozoma + Imbanpi league tools |
| 7 | Section 10 + 11 | Hollywood hunt + value odds |
| 8 | Section 12 | Strategies / slip / dashboard |
| 9 | Section 13 | Extra bookmakers |

---

## Notes for implementers

- Many pages in the PDF are blank coloured dividers; the logic lives on the handwritten white pages.
- Some pages mix non-app notes (e.g. workshop/parts lists). Those were ignored here.
- Prefer **one section → one PR / one review** so rules stay testable.
- When a rule conflicts with what OddAlerts can supply, mark the field as **blocked on data** instead of inventing numbers.

---

*Generated from the attached analysis PDF for Scoreline integration planning.*
