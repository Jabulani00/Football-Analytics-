# Quotation — Scoreline Football Analytics & Betting Intelligence Platform

**Quotation No.:** SCL-2026-001
**Date issued:** 20 June 2026
**Valid until:** 20 July 2026 (30 days)
**Currency:** South African Rand (ZAR, R)

| | |
|---|---|
| **Prepared for** | _[Client name / company]_ |
| **Prepared by** | _[Your name / company]_ |
| **Contact** | _[email · phone]_ |
| **Project** | Scoreline — Football Analytics, Strategy & Bet‑Slip Platform |
| **Engagement type** | Fixed‑price software development |
| **Total (fixed price)** | **R75 000** |

---

## 1. Summary

Scoreline is a **football analytics and betting‑intelligence platform** that
collects match data, calculates a deep statistics model, surfaces statistical
"call‑outs" and strategies, fuses them with live odds, and **auto‑generates
bet slips** with an interactive tracking dashboard.

This quotation covers the **design, development, deployment and handover** of
the platform as a responsive web application (works on desktop and mobile),
built on the existing Expo / React Native Web codebase and the live **OddAlerts
Football Data API** integration already in place.

The fee is a **fixed price of R75 000** for the deliverables in Section 3.

---

## 2. Already delivered (baseline — included in this engagement)

A working foundation is in place and forms the starting point for the remaining
work below (no extra charge — listed for transparency):

- Flashscore‑style **live scores, results and fixtures** feed (men/women,
  clubs/countries filters) powered by the OddAlerts API via a secure server‑side proxy.
- **Country → League/Cup → Season standings browser** with traffic‑light zones
  (green / yellow / red), home & away points, points‑vs‑tier breakdown and
  post‑match movement arrows.
- **Match detail** screen — summary, prediction/odds, stats, head‑to‑head,
  pitch‑style lineups and standings.
- **Club logos** (TheSportsDB) and **country flags**, with graceful fallbacks.
- **Responsive mobile layout** and Vercel deployment configuration.
- Full integration documentation (`docs/ODDALERTS_INTEGRATION.md`).

---

## 3. Scope of work & price breakdown

All amounts in ZAR. The line items below sum to the fixed total of **R75 000**.

| # | Deliverable | Description | Price (R) |
|---|-------------|-------------|----------:|
| 1 | **Discovery, architecture & setup** | Requirements confirmation, data model finalisation, environment & repo setup, project plan | 4 000 |
| 2 | **Live data integration** | OddAlerts API: scores, fixtures, results, standings, match detail; secure token proxy; caching & rate‑limit handling | 9 000 |
| 3 | **Standings browser & logos** | Country → League/Cup → Season drill‑down, zoned tables, home/away points, tier breakdown, movement, club badges & flags | 7 000 |
| 4 | **Match detail** | Summary, lineups (pitch view), H2H, match stats and odds in context | 6 000 |
| 5 | **Statistics engine** | Core of the 72‑table stats model (base + last‑N splits: Overall/Home/Away · FT/HT/2H), 100+ metrics, traffic‑light signal colours | 12 000 |
| 6 | **Stats call‑out & strategy layer** | Streams & groupings, % compliance ranking (Overall → Home → Away), strategy build‑up and fixture call‑outs by date/time | 9 000 |
| 7 | **Odds fusion page** | Combine stats/strategies with live odds to surface value and risk exposure | 6 000 |
| 8 | **Bet‑slip generator** | Auto‑build slips from qualified selections, multi‑selection support, review & confirm, copy/share, persistence | 9 000 |
| 9 | **Interactive tracking dashboard** | Active strategies, bet‑slip performance, live fixture monitoring, ongoing compliance scores | 7 000 |
| 10 | **Responsive mobile UX & theming** | Mobile‑first layouts, navigation, polish across all screens | 3 000 |
| 11 | **QA, documentation, deployment & handover** | Testing, user/technical docs, Vercel production deployment, walkthrough & handover | 3 000 |
| | | **Total (fixed price)** | **75 000** |

> **Note on the full 5‑phase vision.** The original specification describes a
> very large platform (multi‑source scraping at scale — Flashscore, Footy Stats,
> Sofascore, Hollywoodbets — six ML models, full transfer/squad ingestion, etc.).
> This R75 000 fixed price delivers the **core working platform end‑to‑end**
> (data → stats → strategy → odds fusion → bet slip → dashboard) using the
> OddAlerts data source. Heavier items are listed as optional add‑ons in
> Section 4 so the budget stays predictable.

---

## 4. Optional add‑ons (quoted separately, not in the R75 000)

| Add‑on | Indicative scope |
|--------|------------------|
| Additional data sources (Footy Stats / Sofascore / Flashscore scrapers) | Per‑source scraper + ingestion + scheduling |
| Hollywoodbets odds & live bet placement integration | Subject to bookmaker terms & API availability |
| Full ML model suite (BTTS, Over 1.5/2.5, CS, FTS, HT Over 0.5) + TensorFlow.js | Training pipeline + on‑device inference |
| Vector‑similarity "Evidence" engine (ChromaDB) | Similar‑match retrieval + pre‑export |
| Transfers, full squads & player profiles | Ingestion + UI |
| Native mobile apps (iOS / Android via Expo) | App store builds & submission |
| Ongoing maintenance & data‑source monitoring | Monthly retainer |

---

## 5. Timeline & milestones (indicative)

Estimated **10–12 weeks** from signed acceptance and deposit, in milestones:

| Milestone | Deliverables (Section 3) | Target |
|-----------|--------------------------|--------|
| M1 — Foundation | Items 1–4 | Weeks 1–3 |
| M2 — Stats & strategy | Items 5–6 | Weeks 4–7 |
| M3 — Odds, slips & dashboard | Items 7–9 | Weeks 8–10 |
| M4 — Polish & handover | Items 10–11 | Weeks 11–12 |

---

## 6. Payment schedule

| Stage | % | Amount (R) |
|-------|--:|-----------:|
| Deposit on acceptance | 40% | 30 000 |
| On M2 completion | 30% | 22 500 |
| On final delivery & handover (M4) | 30% | 22 500 |
| **Total** | **100%** | **75 000** |

- Payment via EFT within 7 days of each invoice.
- Work on each milestone begins once the prior milestone is approved.

---

## 7. What's included

- Source code (Git repository) and all project documentation.
- Production deployment to a Vercel project under the client's account.
- Up to **2 rounds of revisions** per milestone within the agreed scope.
- **30 days** of post‑handover bug‑fix support (defects in delivered scope).
- Knowledge‑transfer / handover session.

## 8. Assumptions

- A valid **OddAlerts API token** is provided by the client (subscription costs
  are the client's responsibility).
- Logos use **TheSportsDB**; coverage is best‑effort with initials fallback.
- One responsive **web** application (desktop + mobile browsers); native app
  builds are an add‑on (Section 4).
- Client provides timely feedback and content/branding assets.
- Statistics are computed from data available via the chosen data source(s).

## 9. Exclusions

- Third‑party costs: data/API subscriptions, hosting beyond a standard Vercel
  plan, domain, SSL, bookmaker accounts.
- Large‑scale scraping infrastructure and anti‑bot circumvention.
- Live bet placement with any bookmaker, and any guarantee of betting profit.
- Content moderation, KYC, payments/wallets, or gambling‑licence compliance.
- Ongoing maintenance after the 30‑day support window (available as a retainer).

## 10. Responsible‑gambling & legal note

This platform provides **statistical analysis and informational bet‑slip
generation only**. It does not guarantee outcomes or profit. The client is
responsible for compliance with all applicable **gambling laws and bookmaker
terms of service** in their jurisdiction, and for any required licensing,
age‑verification and responsible‑gambling messaging.

---

## 11. Acceptance

| | |
|---|---|
| Accepted by (client) | ________________________ |
| Signature / Date | ________________________ |
| Accepted by (developer) | ________________________ |
| Signature / Date | ________________________ |

*All amounts are in South African Rand (ZAR). VAT excluded unless the developer
is VAT‑registered, in which case VAT applies at the prevailing rate. This
quotation is valid for 30 days from the date of issue.*
