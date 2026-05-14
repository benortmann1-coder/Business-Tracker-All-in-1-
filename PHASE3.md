# Phase 3 — Expansion Specification

Phase 3 is the 12-month horizon after the Phase 2 Pro features ship. It is where Bevelry stops being just a mobile shop manager and becomes a platform — a desktop companion, a marketplace, an AI-augmented workflow, and a globally-localized product.

Phase 3 is not one ship. It is a portfolio of four tracks, each independently fundable and shippable.

---

## 1. Overview

| Track | Goal | Duration | Funding gate |
| --- | --- | --- | --- |
| Web Companion | Match mobile parity on desktop for power workflows | 8–10 weeks | Phase 2 revenue confirmed |
| Marketplace | Two-sided liquidity between woodworkers and clients | 16–20 weeks | Seed round (or self-funded if revenue allows) |
| AI Features | Cut optimization + material substitution suggestions | 6–8 weeks | Phase 2 launch + 90 days of usage data |
| Internationalization | Launch in UK, AU, CA, then DE | 4–6 weeks | Phase 2 launch + steady English-market growth |

These can run in parallel with the right team. The recommended order is **Web Companion → AI → i18n → Marketplace** because Marketplace requires the largest investment and most product-market risk.

---

## 2. Web Companion

### Strategy
Flutter Web is the right call for v1 of the desktop companion. It shares ~95% of the codebase with mobile and ships through Firebase Hosting in days, not weeks. The cost is a slightly larger bundle and slower first paint — acceptable for a logged-in pro tool, unacceptable for a public landing page.

The marketing site stays on a separate Webflow / Astro stack (already in the marketing budget). The app is the only thing that runs on Flutter Web.

### Desktop-specific features
The Web Companion isn't a 1:1 port. It's where features that are awkward on mobile finally make sense.

| Feature | Mobile | Web |
| --- | --- | --- |
| Quote PDF preview | Single column, scroll | Side-by-side editor + live PDF preview |
| Bulk material library import | Not supported | CSV / Excel import with column mapping |
| Cut list editor | Touch keyboard, one part at a time | Spreadsheet-grid with paste from Excel |
| Photo gallery | Vertical scroll | Lightroom-style grid + bulk-select |
| Quote sending | Mobile mail picker | In-app email composer + send tracking |
| Analytics | Single KPI strip | Full dashboard with side filters |
| Keyboard shortcuts | n/a | Yes — see table below |

### Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Cmd/Ctrl + N` | New project |
| `Cmd/Ctrl + K` | Open command palette (jump to project / client / quote by name) |
| `Cmd/Ctrl + Shift + Q` | New quote |
| `/` | Focus search anywhere |
| `J` / `K` | Navigate list rows |
| `Cmd/Ctrl + P` | Print / export PDF |

### Responsive layouts
The same Flutter widgets render at three breakpoints:
- **Compact** (< 600 dp): mobile single-column
- **Medium** (600–1240 dp): split view (list + detail)
- **Expanded** (>= 1240 dp): three-pane (nav rail + list + detail)

Implemented via a `ResponsiveScaffold` wrapper in `lib/shared/layout/responsive_scaffold.dart` that swaps the navigation chrome based on `MediaQuery.sizeOf(context).width`.

### Hosting & auth
- **Hosting:** Firebase Hosting with a custom domain `app.bevelry.com`.
- **Auth:** same Firebase Auth flows; Apple Sign-In on web works via OAuth web flow. Google Sign-In via the Identity Services library.
- **Sessions:** persistent across browser sessions; signed-in users land on `/projects` from any page.

### Performance budgets
| Metric | Budget |
| --- | --- |
| First paint | < 2.5s on a 2020 MacBook Air over 50 Mbps |
| Time to interactive | < 4s on the same |
| Bundle size (gzipped) | < 1.5 MB initial, lazy-load the rest |
| Lighthouse Performance | >= 80 (logged-in app, not landing page) |

### Pricing
Bundled with Cloud Sync. No extra charge. The Web Companion is what makes Cloud Sync worth paying for — it's a retention play, not a separate SKU.

---

## 3. Marketplace

### Vision
A directory + intake funnel where:
- **Woodworkers** publish capacity (e.g. "I have 6 weeks open in June for kitchen cabinetry — here's my portfolio and average price range")
- **Clients** browse, request quotes, and see verified shops near them
- Bevelry takes a referral fee on jobs that originate via the marketplace

### Two-sided model
| Side | Acquisition strategy |
| --- | --- |
| Supply (woodworkers) | Existing Bevelry users opt-in for free; listing fee is $0; we charge on successful match |
| Demand (clients) | SEO landing pages + targeted Pinterest / Instagram ads + word-of-mouth from delivered projects |

### Domain model

```
/marketplace/listings/{listingId}              (PUBLIC READ)
{
  id: string
  shopUid: string                              ref → /users
  shopName: string                             denormalized
  shopAvatarUrl: string?
  city: string
  region: string                               US state / UK county / etc.
  country: string                              ISO-3166
  serviceRadiusKm: int                         e.g. 80
  trades: string[]                             ['cabinets','furniture',...]
  priceRangeUSD: { min: int, max: int }        cents
  portfolioPhotoIds: string[]                  refs → /marketplace/portfolio_photos
  averageProjectPriceCents: int?               from completed projects
  reviewCount: int                             denormalized
  averageRating: number?                       denormalized, 0..5
  bio: string                                  up to 2000 chars, markdown
  capacityOpensAt: Timestamp?                  next available slot
  active: bool                                 publish flag
  createdAt: Timestamp
  updatedAt: Timestamp
}

/marketplace/requests/{requestId}              (OWNER + matched shop READ)
{
  id: string
  clientUid: string?                           null if guest checkout
  clientEmail: string                          for guest flows
  clientName: string
  description: string                          markdown
  budgetCents: int?
  targetStartAt: Timestamp?
  attachments: { storagePath: string }[]       up to 10 photos / drawings
  city: string
  region: string
  country: string
  matchedListingIds: string[]                  shops invited to quote
  status: 'open' | 'matched' | 'closed' | 'completed'
  createdAt: Timestamp
  closedAt: Timestamp?
}

/marketplace/reviews/{reviewId}                (PUBLIC READ)
{
  id: string
  shopUid: string
  clientUid: string
  projectId: string                            ref to the originating job
  rating: int                                  1..5
  body: string                                 up to 2000 chars
  photoIds: string[]
  createdAt: Timestamp
  shopRespondedAt: Timestamp?
  shopResponse: string?
}
```

### Security rules sketch
```javascript
match /marketplace/listings/{id} {
  allow read: if true;                                              // public
  allow create: if request.auth != null
    && request.resource.data.shopUid == request.auth.uid;
  allow update: if request.auth != null
    && resource.data.shopUid == request.auth.uid;
  allow delete: if request.auth != null
    && resource.data.shopUid == request.auth.uid;
}

match /marketplace/requests/{id} {
  allow read: if request.auth != null
    && (resource.data.clientUid == request.auth.uid
        || request.auth.uid in resource.data.matchedShopUids);
  allow create: if true;                                            // guest checkout supported
  allow update: if request.auth != null
    && resource.data.clientUid == request.auth.uid;
}

match /marketplace/reviews/{id} {
  allow read: if true;
  allow create: if request.auth != null
    && request.resource.data.clientUid == request.auth.uid;
  allow update: if request.auth != null
    && (resource.data.clientUid == request.auth.uid
        || resource.data.shopUid == request.auth.uid);                // shop can respond
}
```

### Search & discovery
- **Geo search:** GeoFire-style indexing on a `geohash` field; query "within X km of {lat,lng}". Library: `geoflutterfire_plus`.
- **Trade filter:** simple `array-contains` on `trades`.
- **Price filter:** `where('priceRangeUSD.min', '<=', max)`.
- **Sort:** distance first, then rating; can be swapped to "newly available" when capacity-driven discovery becomes a primary use.

### Payments
- **Intake fee:** free for clients to submit a request; free for shops to publish a listing.
- **Success fee:** 8% of the agreed-upon project total, billed to the **shop**, not the client. The shop sets their price already accounting for this fee; nothing is added to the client's invoice.
- **Collection:** integrated with Bevelry's invoice flow. When a marketplace-originated invoice is marked `paid`, a Cloud Function automatically calculates and bills the success fee via Stripe Connect.
- **Stripe Connect** is required only for shops who use the marketplace; not for solo app users.

### Trust & safety
- ID verification for shops before listing goes live (Stripe Identity)
- Photo authenticity: portfolio photos must come from completed projects already in the app, not arbitrary uploads
- Review verification: only clients with a delivered project can leave a review
- Dispute resolution: 14-day window after marking a project delivered; refund flow handled via Stripe

---

## 4. AI Features

### Scope
Two near-term applications:
1. **Cut optimization** — better packing than the deterministic algorithm in Phase 1
2. **Material substitution suggestions** — "you used walnut at $12/bf, here are 3 alternatives that would have saved you $X"

Two further-out applications (research, not shippable in Phase 3):
3. **Quote pricing assistant** — suggests markup based on the user's history and similar shops
4. **Time-to-completion predictor** — uses past project durations to flag at-risk schedules

### Cut Optimization

**Approach v1 (algorithmic):** Best-fit decreasing height heuristic + recursive guillotine packing, executed locally. Beats the naive shelf algorithm by 5–15% on typical inputs. Latency: < 500ms on-device.

**Approach v2 (ML-assisted):** Train a small reinforcement-learning agent on a corpus of real cut lists (collected from opted-in users). Use the agent as a pre-processor that orders the input list before passing to the deterministic packer. Hosted as a Cloud Function on Cloud Run with a TF Lite model for cold-start < 1s.

**Privacy:**
- Training data is opt-in only with an explicit toggle in Settings.
- Inference happens on the user's data, returned to the user. No persistence of inference inputs server-side beyond 24 hours of logs.

### Material Substitution Suggestions

**Approach:** A retrieval-augmented LLM call (Claude Sonnet / Haiku, depending on cost) at quote-build time. The prompt includes:
- Current material list
- Project type and dimensions
- Region (for vendor availability)
- The user's historical preferences (if opted in)

Output: 3 alternatives ranked by estimated cost savings, with a one-sentence rationale per alternative. The user accepts / declines per item.

**Latency budget:** 3s for a full quote. Run as a callable function `suggestMaterialSubstitutions`.

**Quality control:** Suggestions must include an explicit substitution rationale. We log accept/decline rates as a quality signal; if accept rate drops below 30% we revisit the prompt.

### Predictive Estimates (future)

Not shipped in v3. Documented here for roadmap continuity. The hypothesis is that with 12+ months of usage data we can predict a 90% confidence interval for project duration. This becomes a Phase 4 differentiator.

### Pricing
- AI features bundled with **Cloud Sync** at no extra charge. The bundle keeps adding value without growing the SKU sprawl.
- The cost of inference is absorbed; budget is ~$0.04 per active Cloud Sync user per month at v3 scale, well within Cloud Sync's gross margin.

---

## 5. Internationalization

### Target markets (in launch order)
1. **UK** — English, GBP, metric primary (with imperial available because some UK woodworkers still use imperial)
2. **Australia** — English, AUD, metric
3. **Canada** — bilingual EN/FR, CAD, metric primary
4. **Germany** — German, EUR, metric

Spanish-speaking markets (US Spanish-speaking users + Mexico) come right after the above sequence.

### Scope of localization

| Component | Effort |
| --- | --- |
| App strings | Easy — flutter_localizations + ARB files |
| App Store / Play listings | Medium — per-locale assets and copy |
| PDF templates (quote, invoice) | Medium — per-locale layout, address formats, tax fields |
| Currency formatting | Easy — `intl` package handles it |
| Measurement system | Already handled per-user (imperial vs metric) |
| Tax handling | **Hard** — VAT (UK, DE), GST (AU, CA), each has different invoice requirements |
| Date formatting | Easy — `intl` |
| Marketing site | Medium — separate codebase, separate translation effort |
| Support | Hard — handled with translation tooling (Linear + DeepL) initially; native speakers when revenue justifies |

### Tax handling

This is the hard part of i18n for a business app. Key requirements per market:

- **UK:** VAT-registered businesses must show their VAT number on invoices; line items can be net + VAT or gross
- **Germany:** Strict "Rechnung" format with mandatory fields; consecutive invoice numbers required by law
- **Canada:** GST or HST depending on province; provincial sales taxes vary
- **Australia:** GST at 10%; ABN required on invoices

We will not invoice on the user's behalf; we generate the PDF and the user is responsible for filing. But the PDF must be legally compliant in the locale where the business operates. This means **per-locale invoice templates** with required fields.

### Localization pipeline
- Source language: en-US in `lib/l10n/intl_en.arb`
- Translations: kicked off via DeepL API for first drafts, reviewed by native-speaker contractor before each release
- Translation memory stored in a Google Sheet to start; graduate to a real TMS (Crowdin or Lokalise) when locale count exceeds 6
- CI check: every new English string blocks merge until other locales are updated (or marked as `pending_translation`)

### Launch sequence per market
1. App Store and Play listings localized
2. PDF templates localized (especially tax fields)
3. In-app paywall pricing converted (App Store regional pricing)
4. Beta cohort of 10 woodworkers in the target market
5. Public launch + paid promo with a local YouTuber / influencer if the market warrants

---

## 6. Sprint Plan (12 Months)

This is a coarse plan. Each track has its own sub-plan once kicked off.

| Month | Track | Milestone |
| --- | --- | --- |
| 1 | Web Companion | Bring `ResponsiveScaffold` and split-view to mobile (no regression); web build runs locally |
| 2 | Web Companion | Bulk material import, keyboard shortcuts, command palette |
| 3 | Web Companion | Public launch at `app.bevelry.com`; Cloud Sync subs +20% target |
| 4 | AI | Algorithmic cut optimization v1 shipped on mobile + web |
| 5 | AI | Material substitution suggestions in private beta |
| 6 | AI | Material substitution GA; collect quality metrics |
| 7 | i18n | UK launch (GBP, metric, VAT templates) |
| 8 | i18n | AU launch + tax template |
| 9 | i18n | CA + DE launch |
| 10 | Marketplace | Domain model live, internal alpha for 5 shops |
| 11 | Marketplace | Public beta in 3 metros (SF Bay, NYC tri-state, London) |
| 12 | Marketplace | National US + UK launch; review marketplace KPIs and decide on Phase 4 scope |

---

## 7. Pricing Sheet (Through Phase 3)

| Product | Price | Notes |
| --- | --- | --- |
| Base App (one-time) | $9.99 | Forever owned |
| Cloud Sync (sub) | $4.99/mo or $39.99/yr | Includes Finishing Tracker, Analytics, AI features, Web Companion |
| Team Collaboration (sub) | $9.99/seat/mo | First seat = owner, no charge until 2nd seat |
| CNC File Manager (IAP) | $14.99 | Forever owned |
| Marketplace success fee | 8% of project total | Billed to the shop only, on closed projects |

**Bundles offered:**
- Cloud Sync + CNC Bundle: $59.99 (saves ~$5)
- Annual everything bundle (Cloud Sync + Team 2 seats + CNC): $249/yr (saves ~$30)

---

## 8. Risk Register

| Risk | Track | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| Flutter Web bundle size hurts conversion | Web | Medium | Medium | Aggressive route-level code splitting; defer the Drift / Hive web shim |
| Marketplace has insufficient supply at launch | Marketplace | High | High | Soft launch in dense metros only (NYC, SF, LA); recruit 20+ shops before opening to clients |
| AI suggestions hallucinate unusable material substitutions | AI | Medium | Medium | Restrict suggestions to a curated material taxonomy; log accept rate; pull bad suggestions |
| Per-locale tax compliance is more nuanced than expected | i18n | High | High | Hire local accounting contractors per market for template review; never auto-file |
| Stripe Connect onboarding friction for shops | Marketplace | Medium | Medium | Pre-fill as much as possible from the existing user profile; offer phone support during pilot |
| Translation drift across releases | i18n | Medium | Low | CI check that blocks merge on untranslated strings; translation freeze 3 days before release |

---

## 9. Open Phase 3 Decisions

- [ ] Whether the Web Companion launches publicly or remains beta-gated for 90 days (recommend: gated, gives a quality bar to enforce)
- [ ] Marketplace success-fee floor (recommend: $25 minimum so $200 jobs don't yield $16)
- [ ] AI training data: collect only from opted-in users (recommend: yes — strict opt-in with clear UI)
- [ ] Whether to localize the marketing site at the same time as the app (recommend: yes, but only landing pages, not the blog)
- [ ] When to spin Marketplace out as its own product / brand (recommend: stay under Bevelry through Phase 3; revisit at Phase 4 if it grows past 20% of revenue)
