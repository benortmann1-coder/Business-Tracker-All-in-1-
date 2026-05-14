# Bevelry

A mobile app for woodworking professionals — cabinet makers, custom furniture builders, woodshop owners, and small woodworking businesses.

Bevelry streamlines project planning, estimating, material management, and client communication, with woodworking-specific tools like a cut list generator, board-foot calculator, and material cost estimator built in.

## Status

**Concept / Blueprint phase.** The repository holds the product and engineering blueprint plus a working Flutter scaffold for Phase 1, Phase 2, and Phase 3 features.

**Brand name:** locked as **Bevelry** (coined word built on the woodworking term *bevel*). Selection process moved from "WoodWorks Pro" (generic working title) → "Bevel" (collision risk with the Matter reading app and P&G grooming brand) → **Bevelry**. Trademark + App Store availability checks are the next concrete branding tasks; see `APP_STORE.md` §1.

## Documents

- [`REQUIREMENTS.md`](./REQUIREMENTS.md) — Developer-ready requirements document covering features, tech stack, database structure, security, UI/UX, user flows, monetization, roadmap, and launch checklist.
- [`APP_STORE.md`](./APP_STORE.md) — App Store launch assets: name candidates, short + long descriptions, screenshot storyboard, pricing strategy, competitive analysis, and target personas.
- [`DESIGN.md`](./DESIGN.md) — Design system and wireframes: brand direction, logo concept, color tokens, typography, components, navigation, and per-screen wireframe descriptions.
- [`PITCH.md`](./PITCH.md) — 12-slide investor pitch deck content: problem, market, solution, business model, go-to-market, competition, roadmap, team, and ask.
- [`API.md`](./API.md) — Backend specification: Firestore collections, field schemas, indexes, security rules, Cloud Functions, Storage layout, and offline sync strategy.
- [`MARKETING.md`](./MARKETING.md) — 90-day launch playbook: channel strategy, calendar, beta cohort plan, outreach templates, ASO experiments, content calendar, budget, and metrics.
- [`PHASE2.md`](./PHASE2.md) — Pro features specification: Cloud Sync, Team Collaboration, CNC File Manager, Finishing Schedule Tracker, Advanced Analytics, sprint plan, and migration strategy.
- [`PHASE3.md`](./PHASE3.md) — Expansion specification: Web Companion, Marketplace, AI-assisted cut optimization and material substitution, internationalization plan (UK / AU / CA / DE).
- [`app/`](./app) — Flutter project scaffold across all three phases (Riverpod + go_router + Material 3, paywall gates, marketplace browse, AI service stubs, responsive scaffold, ARB seed files for 4 locales).

## Target Platforms

- iOS (App Store)
- Android (Google Play)

Distribution model: paid app, optional in-app purchases for cloud sync, CNC file manager, and team collaboration.

## Target Users

- Custom furniture builders
- Cabinet makers
- Woodshop owners
- Storage system contractors
- Makers selling products locally or online

## Roadmap (High Level)

| Phase | Scope | Duration |
| --- | --- | --- |
| 1 — MVP | Projects, cut list, board-foot calc, material estimator, CRM, quotes, invoices, tool inventory | 8–12 weeks |
| 2 — Pro | CNC file manager, finishing tracker, cloud sync, team collaboration, analytics | 6–10 weeks |
| 3 — Expansion | Web companion, marketplace, AI cut optimization, internationalization (UK/AU/CA/DE) | 12 months |

See [`REQUIREMENTS.md`](./REQUIREMENTS.md) for the full breakdown.
