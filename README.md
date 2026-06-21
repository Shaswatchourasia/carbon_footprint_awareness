# CarbonPulse

**A context-aware assistant that helps people understand, track, and reduce their personal carbon footprint.**

CarbonPulse turns a short onboarding profile and lightweight daily logging into a personal carbon estimate, a clear breakdown of where it comes from, and a short, ranked list of recommendations that are actually relevant to *that* person — not a generic checklist. It also includes a "what if?" simulator so a user can test a change before committing to it.

> Built for the hack2skill Prompt Wars challenge — **Sustainability / Climate Action** vertical (Personal Carbon Footprint Assistant persona).

---

## Table of contents

- [Why this is a "smart, dynamic assistant" and not a calculator](#why-this-is-a-smart-dynamic-assistant-and-not-a-calculator)
- [Architecture](#architecture)
- [Approach and logic](#approach-and-logic)
- [How the solution works, end to end](#how-the-solution-works-end-to-end)
- [Getting started](#getting-started)
- [API reference](#api-reference)
- [Testing](#testing)
- [Security](#security)
- [Accessibility](#accessibility)
- [Assumptions](#assumptions)
- [Roadmap / what I'd do with more time](#roadmap--what-id-do-with-more-time)

---

## Why this is a "smart, dynamic assistant" and not a calculator

A carbon calculator gives everyone the same advice ("eat less meat, drive less"). CarbonPulse's insight engine (`src/engine/insightEngine.js`) instead runs a small **rule chain per category** that branches on the user's actual profile and logged behaviour:

- A user who already commutes by bike is **never** told to bike more — that lever is already pulled. The engine instead looks at flights, diet, and energy.
- A user who is already vegan is **never** told to eat less meat — the engine recommends cutting food waste instead, because that's the next real lever available to them.
- Every recommendation carries a **quantified estimate** (kg CO2e/year saved), computed with the same calculator that powers the dashboard, so the numbers are internally consistent and the user can trust the ranking.
- A **trend detector** compares the last 30 days of logged activity to the 30 days before that and produces a different, dynamic message depending on direction (improving / worsening / steady / not enough data yet).
- A **what-if simulator** lets the user test a hypothetical change (e.g. "switch to public transit") and see the projected annual impact before they act.

This is deliberately implemented as a **deterministic rule engine**, not an opaque LLM call, so every recommendation is explainable, reproducible, and testable (see [Testing](#testing)). An optional AI narration layer (`src/engine/narrativeAssistant.js`) sits on top to turn the structured output into a warmer paragraph when an API key is available — but the app is fully functional, deterministic, and demonstrable with zero external keys.

## Architecture

```
                         ┌─────────────────────────┐
   Browser (no build)    │   public/ (HTML/CSS/JS)  │
   ───────────────────►  │  vanilla ES modules,     │
                         │  fetch() calls to /api    │
                         └────────────┬─────────────┘
                                      │ JSON over HTTP
                         ┌────────────▼─────────────┐
                         │   Express app (src/app.js)│
                         │  helmet, cors, rate-limit │
                         └────────────┬─────────────┘
                                      │
                ┌─────────────────────┼─────────────────────┐
                │                     │                     │
        routes/users     routes/activities        routes/insights
                │                     │                     │
                └─────────┬───────────┴───────────┬─────────┘
                          │                       │
                 src/data/store.js        src/engine/carbonCalculator.js
                 (file-backed JSON)       src/engine/insightEngine.js
                          │               src/engine/narrativeAssistant.js
                 data/db.json (gitignored) (optional Anthropic API call,
                                             safe templated fallback)
```

- **No build step on the frontend.** Plain HTML/CSS/JS served statically by Express — open it, it just works, and there's nothing to compile or break in a 5-minute judging window.
- **No external database.** A small file-backed JSON store (`src/data/store.js`) keeps setup to `npm install && npm start`. It's documented as a deliberate scope choice, not an oversight (see [Roadmap](#roadmap--what-id-do-with-more-time)).
- **Engine code has zero framework dependencies.** `carbonCalculator.js` and `insightEngine.js` are pure functions of (profile, activities) → data, which is what makes them trivially unit-testable.

## Approach and logic

### 1. Carbon calculation (`src/engine/carbonCalculator.js`)

Two ways to estimate a footprint, blended automatically:

- **Profile baseline** — derived once from onboarding answers (diet, primary commute mode + distance, home energy + household size, flights/year). This is what powers the dashboard from minute one.
- **Logged activity** — every time the user logs something specific ("20km by petrol car", "1 vegan meal", "30kg of waste recycled"), it's converted to kg CO2e on the spot using the same factor table.

For each category, `getMonthlyEstimate()` prefers **logged data** if there's any in the last 30 days, and falls back to the **baseline** otherwise. This means the assistant is never blind about a category the user hasn't logged yet, but becomes more accurate the more they actually use it — a deliberate, explainable piece of context-aware logic rather than a black box.

### 2. Insight generation (`src/engine/insightEngine.js`)

For each category (transport, flights, food, energy, shopping, waste), a rule chain asks: *given this person's actual profile, is there a relevant, non-redundant lever here?* If yes, it produces a candidate recommendation with a quantified annual saving. All candidates are then deduplicated for diversity (`pickDiverseTopN`) so the user gets a *spread* of categories, not five transport tips, and ranked by impact.

### 3. Comparative context (`src/data/benchmarks.js`)

The dashboard always shows the user's projection against their **country's per-capita average** and a **Paris-aligned target** (2.0 t CO2e/year), so a raw number ("8.4 tonnes/year") becomes meaningful ("38% above your country's average").

### 4. Optional AI narration (`src/engine/narrativeAssistant.js`)

If `ANTHROPIC_API_KEY` is set, the structured insight payload is sent to Claude to produce a short, warm paragraph. If the key is missing, or the call fails for any reason, the app **silently falls back** to a deterministic template built from the same data — so the feature degrades gracefully and the demo never depends on a live key.

## How the solution works, end to end

1. **Onboarding** — the user answers ~10 questions (diet, commute, energy, flights). This creates a profile (`POST /api/users`) and computes a baseline footprint immediately.
2. **Dashboard** — a radial "emission ring" gauge shows projected annual tonnes against the country benchmark and the Paris-aligned target, plus a category breakdown and a trend banner.
3. **Log activity** — the user logs a specific action; the server computes and stores its CO2e. The next time the dashboard is viewed, that category switches from "baseline" to "logged" data.
4. **Insights** — the rule engine produces a ranked, explained, quantified shortlist of next steps, narrated in plain language.
5. **What if?** — the user picks one hypothetical change (transport mode, diet, or energy source) and sees the projected annual saving instantly, computed with the same model.

## Getting started

Requires Node.js 18+.

```bash
git clone <your-repo-url>
cd carbon-footprint-assistant
npm install
cp .env.example .env      # optional - the app works with no changes here
npm start
```

Then open **http://localhost:3000**.

To enable the optional AI narration layer, set `ANTHROPIC_API_KEY` in `.env`. Everything else works identically with or without it.

```bash
npm run dev    # auto-restart on file changes (Node's built-in --watch)
npm test       # run the full test suite
```

## API reference

All endpoints are under `/api` and return JSON.

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Liveness check, also reports whether AI narration is enabled |
| `POST` | `/users` | Create a profile |
| `GET` | `/users/:id` | Fetch a profile |
| `PUT` | `/users/:id` | Update a profile (partial) |
| `POST` | `/users/:id/activities` | Log an activity; server computes CO2e |
| `GET` | `/users/:id/activities` | List logged activities, most recent first |
| `GET` | `/users/:id/summary` | Lightweight totals + trend (used by the dashboard) |
| `GET` | `/users/:id/insights` | Full insight payload: totals, trend, ranked recommendations, AI/templated narrative |
| `POST` | `/users/:id/simulate` | What-if projection for a single hypothetical change |
| `GET` | `/meta/emission-factors` | Exposes the factor tables so the frontend never hardcodes them |
| `GET` | `/meta/benchmarks` | Per-country annual averages |

## Testing

```bash
npm test
```

- `tests/carbonCalculator.test.js` — unit tests for every calculation path (transport, food, energy, flights, the logged-vs-baseline blend, unit conversions, malformed-input safety).
- `tests/insightEngine.test.js` — the tests that matter most for "logical decision making based on user context": asserts the engine never recommends a transport-mode switch to someone who already bikes, never recommends cutting meat to someone already vegan, correctly detects an upward trend, and produces consistent simulator results.
- `tests/api.test.js` — integration tests over the real HTTP routes (validation, 404s, the full log → summary → insights → simulate flow), using an isolated test database file so they never touch your real data.

## Security

- **Helmet** for standard security headers, with an explicit Content-Security-Policy (no inline scripts; styles/fonts limited to Google Fonts + self).
- **Rate limiting** on the entire `/api` surface via `express-rate-limit`.
- **Input validation** on every write endpoint (`src/middleware/validate.js`) — categories, enum values, and numeric ranges are all checked server-side before they ever reach the calculation engine, so the frontend is never a trust boundary.
- **No secrets in code.** `ANTHROPIC_API_KEY` is read from environment only, never logged, never sent to the client, and the app works correctly with it absent.
- **Centralized error handling** (`src/middleware/errorHandler.js`) that logs full detail server-side but only ever returns a generic message to the client for 5xx errors — no stack traces leak over HTTP.
- **Body size cap** (100kb) as a cheap defense against oversized-payload abuse.
- **Atomic, single-process-safe persistence** — writes go through a write-then-rename so the data file can't be left half-written by a crash mid-save (see `src/data/store.js`).

## Accessibility

- Semantic landmarks (`header`, `main`, `nav`, `footer`), a skip-link, and labelled form fields throughout.
- All dynamic regions that update without a page reload (trend banner, insight narrative, simulator result) use `aria-live`.
- The category breakdown is rendered as real list items with `aria-label`s carrying the data, not just a canvas/SVG chart, so it's readable by screen readers.
- Visible focus rings (`:focus-visible`) and a `prefers-reduced-motion` guard on transitions.
- Color is never the only signal: the "top contributing category" bar is both colored *and* bold-labelled.

## Assumptions

This is a decision-support estimate, not a certified carbon audit. Specific, documented simplifications:

- **Emission factors** (`src/data/emissionFactors.js`) are illustrative, rounded approximations assembled from commonly published transport/food/grid/goods carbon-intensity ranges. A production version would license a proper factor database (e.g. DEFRA, EPA, or a regional equivalent).
- **Country grid intensity** covers a curated set of countries; unlisted countries fall back to a global-average factor.
- **Meals/day** is assumed to be 3 for the diet-based baseline.
- **Energy is split evenly per household member** for the personal-footprint baseline.
- **Annual events (flights) are divided by 12** to blend into a monthly figure, using assumed average trip distances (800km short-haul, 6000km long-haul).
- **"Switchable" commute share** (60% for fossil-fuel commuters, 40% for carpoolers) is a documented estimate used only to size a recommendation's potential saving, not the user's real schedule.
- **Persistence** uses a single JSON file, intentionally, to keep the project a zero-setup clone-and-run for judging. It is correct and safe for a single-instance demo (see `src/data/store.js` for the durability notes) but is explicitly not a multi-instance production design.
- **One profile per browser**, tracked via `localStorage`. There's no authentication layer — this is a single-user demo, not a multi-tenant product.

## Roadmap / what I'd do with more time

- Swap the JSON file store for Postgres (the store module is the only file that would need to change).
- Add user accounts/auth instead of a localStorage-held profile id.
- License a proper, region-granular emission factor database.
- Expand the simulator to support combining multiple simultaneous changes.
- Add push/email nudges when the trend turns upward for a sustained period.

---

## Project structure

```
carbon-footprint-assistant/
├── src/
│   ├── app.js                  # Express app: middleware, routes, static frontend
│   ├── server.js               # Entry point (separated from app.js for testability)
│   ├── config/env.js           # Centralized env var access with safe defaults
│   ├── data/
│   │   ├── emissionFactors.js  # Reference CO2e factor tables
│   │   ├── benchmarks.js       # Per-country averages + Paris-aligned target
│   │   └── store.js            # File-backed JSON persistence
│   ├── engine/
│   │   ├── carbonCalculator.js # Pure calculation functions
│   │   ├── insightEngine.js    # Context-aware recommendation rule chain
│   │   └── narrativeAssistant.js # Optional AI narration + safe fallback
│   ├── middleware/
│   │   ├── validate.js         # Request body validation
│   │   └── errorHandler.js     # Centralized error handling
│   ├── routes/                 # users / activities / insights / meta
│   └── utils/                  # id generation, logging, async wrapper
├── public/                      # Vanilla HTML/CSS/JS frontend, no build step
├── tests/                       # Jest unit + integration tests
├── data/                        # Runtime JSON database (gitignored)
├── .env.example
└── package.json
```

## License

MIT — see [LICENSE](./LICENSE).
