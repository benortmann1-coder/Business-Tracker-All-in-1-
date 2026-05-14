# Design System & Wireframes — WoodWorks Pro

This document defines the brand, design tokens, component library, and wireframe descriptions for WoodWorks Pro. It is the source of truth for Figma mocks and the UI implementation. Anything not specified here defers to platform-native defaults (iOS Human Interface Guidelines / Material Design 3).

---

## 1. Brand Direction

**Personality:** Confident. Earned. Tradesperson-first.
**Voice:** Direct. No fluff. Short sentences. Use the word "shop," not "workspace." Use "cut list," not "BOM."
**Visual feel:** Workshop matte + steel hardware. Warm wood tones grounded in dark charcoal. The interface should feel like an honest pro tool, not a consumer SaaS dashboard.

### Anti-patterns
- No purple gradients
- No emoji-heavy UI
- No floating illustrations of cartoon contractors
- No "Hi there! 👋" microcopy

---

## 2. Logo Concept

### Recommended Direction: "Plane Mark"

A stylized woodworking hand plane in profile, used both as a standalone app icon and as the lockup anchor next to the wordmark. The hand plane is iconic, instantly readable, and the angled body gives the mark forward motion.

```
   ___________
  /           \___
 /              | \
|_______________|__\
       0   0
```

(Rough ASCII; final mark would be a clean 1.5pt vector silhouette.)

### Alternate Directions to Test
1. **Workbench profile** — flat-line drawing of a workbench end view; subtle grain texture in the worktop
2. **Concentric grain rings** — abstract circular logo riffing on tree-ring growth; pairs well with "WoodWorks Pro" set in a slab serif
3. **Tenon mark** — a tenon joint silhouette used as the "W" of WoodWorks; clever but risks being too inside-baseball
4. **Compass / square** — fallback if hand plane reads too niche

### Wordmark
- Primary face: **Söhne Breit** (or **Inter Display Bold** as open-source fallback)
- All-lowercase "woodworks pro" or title-case "WoodWorks Pro" — A/B test both
- Letter spacing: -1% (tightened)
- Mark sits to the left of the wordmark at 1.2× cap-height

### App Icon Rules
- Must read at 60×60 px (App Store list view) and 1024×1024 px (store page)
- Solid color background (charcoal or forest green) — no gradients
- Mark in cream (#F5F1EA) for contrast
- No text in the icon — wordmark is for the splash screen only
- Same icon for iOS and Android; iOS uses rounded square mask, Android uses adaptive icon foreground+background

---

## 3. Color System

### Primitive Palette

| Token | Hex | Use |
| --- | --- | --- |
| `charcoal-900` | `#14171A` | Darkest surface, dark mode background |
| `charcoal-700` | `#1F2226` | App background (dark), elevated card on light |
| `charcoal-500` | `#3A3F45` | Borders on dark, secondary text on light |
| `steel-500` | `#6B7079` | Secondary text, inactive icons |
| `steel-300` | `#A8ADB3` | Disabled, hint text |
| `cream-100` | `#F5F1EA` | App background (light), primary text on dark |
| `cream-50` | `#FAF8F3` | Surface light, card background |
| `walnut-700` | `#6B4A2B` | Wood-tone accent, brand secondary |
| `walnut-500` | `#946437` | Hover/active state of walnut |
| `forest-600` | `#2F6B4F` | Primary CTA, success, accent |
| `forest-500` | `#3D8865` | Hover/active state of forest |
| `amber-500` | `#C77A1F` | Warnings, low-stock, due-soon |
| `crimson-600` | `#B23E3E` | Destructive, overdue, error |

### Semantic Tokens

| Token | Light mode | Dark mode |
| --- | --- | --- |
| `bg/canvas` | `cream-100` | `charcoal-700` |
| `bg/surface` | `cream-50` | `charcoal-500` |
| `bg/elevated` | `#FFFFFF` | `#2A2E33` |
| `text/primary` | `charcoal-900` | `cream-100` |
| `text/secondary` | `steel-500` | `steel-300` |
| `border/default` | `#E2DCD0` | `charcoal-500` |
| `accent/primary` | `forest-600` | `forest-500` |
| `accent/secondary` | `walnut-700` | `walnut-500` |
| `state/warning` | `amber-500` | `amber-500` |
| `state/error` | `crimson-600` | `crimson-600` |

### Accessibility
- All text/background pairings must meet **WCAG 2.1 AA** (4.5:1 for body, 3:1 for large text)
- The default light theme background `cream-100` against `charcoal-900` text = 14.8:1 (AAA)
- Forest-600 CTA against cream-100 = 4.6:1 (AA pass for body text size)
- Status colors are paired with icons and never carry meaning by color alone

---

## 4. Typography

### Type Stack
- iOS: **SF Pro Display** (headings), **SF Pro Text** (body), **SF Mono** (numerics)
- Android: **Inter** (display/body), **JetBrains Mono** (numerics)
- Numbers throughout the app use monospaced figures so columns of measurements align cleanly.

### Scale

| Role | Size / Line | Weight | Letter spacing |
| --- | --- | --- | --- |
| Display | 32 / 40 | Bold | -1% |
| H1 | 28 / 36 | SemiBold | -0.5% |
| H2 | 22 / 28 | SemiBold | -0.25% |
| H3 | 17 / 24 | SemiBold | 0 |
| Body Large | 17 / 24 | Regular | 0 |
| Body | 15 / 22 | Regular | 0 |
| Caption | 13 / 18 | Regular | +0.5% |
| Overline | 11 / 14 | SemiBold | +5%, uppercase |
| Numeric Display | 28 / 36 | Medium (mono, tabular) | 0 |
| Numeric Body | 15 / 22 | Regular (mono, tabular) | 0 |

### Usage Rules
- Don't use more than 3 type weights on a single screen
- Always prefer SemiBold + Regular over Bold + Light — the latter looks fragile in shop lighting
- Measurements (inches, mm, board-feet, $) always use monospaced numerics

---

## 5. Spacing & Layout

### Base Grid: 8pt
Spacing tokens: `4, 8, 12, 16, 24, 32, 48, 64`

### Layout
- Phone: single-column, 16pt horizontal margin
- Tablet: max content width 720pt, centered; secondary panel optional at 360pt
- Bottom tab bar height: 64pt (iOS) / 56pt (Android)
- Top app bar height: 56pt
- Card border radius: 12pt
- Button border radius: 10pt
- Hit target minimum: **48 × 48pt** — non-negotiable; users may be wearing gloves

### Touch Density
WoodWorks Pro uses a **looser** touch density than typical consumer apps. List rows are 64pt minimum, primary buttons are 56pt tall. The cost is fewer items per screen; the win is reliable interaction with sawdust on hands.

---

## 6. Iconography

- **System icons:** Lucide (open source) — 24pt grid, 2pt stroke, rounded line caps
- **Platform fallback:** SF Symbols (iOS), Material Symbols Rounded (Android) where Lucide lacks a glyph
- **Custom icons (must commission):**
  - Cut list / sheet diagram
  - Board-foot measurement
  - Hand plane (brand)
  - Joinery joint marker
  - Wood-grain texture chip

### Status Icons
| State | Icon | Color token |
| --- | --- | --- |
| Draft | pencil | `steel-500` |
| In progress | hammer | `forest-600` |
| Awaiting approval | hourglass | `amber-500` |
| Completed | check-circle | `forest-600` |
| Delivered | truck | `walnut-700` |
| Overdue | alert-triangle | `crimson-600` |

---

## 7. Component Inventory

| Component | Variants | Notes |
| --- | --- | --- |
| **Button** | Primary, Secondary, Destructive, Ghost, Icon | Min 56pt tall for primary actions |
| **Input** | Text, Number, Measurement (with unit selector), Currency, Multiline | Number inputs auto-launch numeric keyboard |
| **Select** | Dropdown, Bottom sheet picker, Segmented control | Bottom sheet preferred for >5 options |
| **Status pill** | Draft / In Progress / Awaiting Approval / Completed / Delivered / Overdue | Icon + label, never color-only |
| **Material chip** | Selected / Unselected, with category icon | Used in quote builder, material library |
| **Project card** | Compact / Expanded | Shows status pill, client, due date, total |
| **Cost summary** | Inline / Sticky-footer | Tabular numerics, line items expandable |
| **Photo thumbnail** | Square / Before-After slider | Tap to fullscreen, long-press to tag |
| **Calendar row** | Job, Material pickup, Finishing step, Maintenance | Color-coded by type via leading icon |
| **Empty state** | With illustration + CTA | Shop-themed line illustrations only |
| **Toast** | Info, Success, Warning, Error | Auto-dismiss except errors |
| **Modal / Bottom sheet** | Half / Full | Bottom sheet preferred over modal on mobile |

### Component States
Every interactive component must define: **default, hover (web/tablet), pressed, disabled, loading, error**.

---

## 8. Navigation Structure

### Bottom Tab Bar (Primary)
| Tab | Icon | Default route |
| --- | --- | --- |
| Projects | folder | `/projects` (list) |
| Clients | users | `/clients` (list) |
| Tools | wrench | `/tools` (inventory) |
| Money | dollar-sign | `/quotes` (combined quotes + invoices) |
| Settings | sliders | `/settings` |

### Floating Action Button (FAB)
- **Projects tab:** "+ New Project"
- **Clients tab:** "+ New Client"
- **Money tab:** segmented FAB → "New Quote" / "New Invoice"
- **Tools tab:** "+ Add Tool"
- **Settings tab:** no FAB

### Deep Navigation
- Two-level depth max on each tab before pushing to detail screens (e.g., Projects → Project Detail → Cut List Editor)
- Back navigation always uses platform-native gestures (swipe-from-edge on iOS, back button on Android)

---

## 9. Wireframe Descriptions

The descriptions below define layout, hierarchy, and key interactions for the 10 most important screens. Each is intended to be the brief for a Figma frame.

### 9.1 Onboarding (3 screens + auth)

**Screen 1 — Welcome**
- Full-bleed hero photo (a clean workshop with golden hour light) at 60% screen height
- Headline: "Run your shop from your phone"
- Sub: "Cut lists, quotes, clients — one place."
- Primary CTA: "Get Started"
- Secondary CTA: "I already have an account" (text button)

**Screen 2 — Trade selection**
- "What do you build?" headline
- Chip multi-select: Custom Furniture / Cabinets / Storage Systems / Closets / Doors & Trim / Outdoor / Other
- Used to pre-seed material library and templates
- Continue button bottom-pinned

**Screen 3 — Unit preferences**
- Toggles: Imperial vs Metric (default Imperial in US locale), Decimal vs Fractional inches, Currency
- Continue → Auth

**Auth**
- Email + password (primary), Apple Sign-In (iOS), Google Sign-In (Android)
- Skip available for guest mode — data stored locally only, cloud sync prompts on attempt to use that feature

### 9.2 Home / Dashboard

- Top app bar: WoodWorks Pro wordmark left, search-icon + notifications-icon right
- **KPI strip** (horizontal scroll): Open Quotes • Unpaid Invoices • Jobs This Week • Tools Due for Maintenance — each a tappable card with number + label
- **Today section**: vertical list of today's calendar items (job, material pickup, finishing step)
- **Recent projects** (card carousel): last 5 projects, each card shows hero photo, project name, client, status pill, due date
- FAB: "+" → bottom sheet (New Project / New Quote / New Client)

### 9.3 Projects List

- Top app bar: title "Projects", filter icon
- Filter bar (horizontal scroll, chip-based): All • Draft • In Progress • Awaiting Approval • Completed • Delivered • Overdue
- Sort dropdown right-aligned: Due date / Created / Name / Client
- List of **Project Cards** (compact variant):
  - Hero photo thumbnail (64pt square, left)
  - Project name (H3)
  - Client name (Body, secondary)
  - Status pill + due date (Caption row)
  - Total estimate (Numeric Body, right-aligned)
- Empty state: line illustration of a workbench + "No projects yet. Start your first one." + CTA

### 9.4 Project Detail

Three-tab layout under the project header:
- **Header card** (sticky): hero photo strip, project name, client (tap → client detail), status pill (tap → status change sheet), due date, total cost
- **Tabs:** Overview • Materials & Cut List • Photos & Files • Activity
  - **Overview:** description, dimensions, labor hours, notes; right-rail summary card with cost breakdown
  - **Materials & Cut List:** material rows with quantity / unit / cost; "Generate Cut List" button at top; cut list output rendered as a collapsible diagram
  - **Photos & Files:** photo grid, before/after sliders, attached drawings & CNC files
  - **Activity:** chronological log — created, status changes, quote sent, invoice paid, photos added
- Bottom action row: "Send Quote" • "Mark Complete" • overflow menu (Duplicate / Archive / Delete)

### 9.5 Cut List Generator

- Header: "Cut List — [Project Name]"
- **Sheet stock** section: select plywood sheet size (4×8, 5×5, custom) and quantity
- **Pieces** section: tabular input
  - Columns: Part Name • Material • Length • Width • Qty • Grain Direction
  - Inline editing; add row with "+" button at the bottom
  - Each row has a kebab menu for duplicate / delete
- "Optimize" button (primary, bottom-pinned) → triggers cut algorithm
- **Output panel** (slides up after optimize): sheet layout SVG with parts labeled; waste % shown; estimated cut count
- Top right of output: Export PDF, Share

### 9.6 Board-Foot Calculator

- Single-screen utility, can be reached as a standalone tool or invoked inline from a material row
- Three inputs: Thickness (in), Width (in), Length (ft) — each with stepper and direct entry
- Quantity field
- Live calculated total: **Board Feet** + **Total at $X/BF**
- Material price field (auto-fills from material library)
- "Save to Project" picker at bottom

### 9.7 Quote Builder

- Multi-step flow with a progress indicator at top:
  1. **Project Info** — client picker (or "+ New"), project name, prep notes
  2. **Materials** — pulled from project or manually added; quantities and unit prices editable inline
  3. **Labor** — labor hours × rate; multiple line items allowed
  4. **Markup** — single slider 0–100% with live total preview; tax field
  5. **Review** — full quote rendered in App Store-quality PDF preview
- Bottom row throughout: Back / Continue
- On Review: "Send Quote" primary CTA → bottom sheet (Email / SMS / Save PDF / Show QR for client to sign on this device)

### 9.8 Quote PDF Preview & Send

- Full-screen scrollable PDF preview rendered with the actual quote
- Top bar: close X, share icon
- Bottom sticky action bar:
  - **Send via Email** (primary)
  - **Send via SMS** (secondary)
  - **In-Person Signature** (ghost) → rotates device to landscape, shows signature pad
- After send: success toast, status auto-transitions to "Awaiting Approval"

### 9.9 Client List & Detail

**List**
- Search bar at top
- Alphabetical sectioned list with sticky section headers
- Each row: avatar (initials), name, # of projects, last contact date
- FAB: "+ New Client"

**Detail**
- Top: large avatar, name, phone (tap to call), email (tap to compose), address (tap to map)
- Tabs: Projects • Quotes & Invoices • Notes • Files
- Quick-action buttons: Call, Text, Email, New Project

### 9.10 Settings

Grouped list:
- **Account**: name, email, sign out, biometric lock toggle
- **Subscription & Add-Ons**: manage Cloud Sync, CNC File Manager, Team
- **Preferences**: units, currency, decimal vs fractional, default markup %, default labor rate
- **Templates**: quote template, invoice template, email signature
- **Backup**: last sync time, manual sync button, export all data (.zip)
- **About**: version, privacy policy, terms, send feedback

---

## 10. Empty States, Loading, Errors

### Empty States (the "first run" feel)
Every primary list has a custom empty state — never a blank screen.

| Screen | Illustration | Headline | CTA |
| --- | --- | --- | --- |
| Projects | Workbench line art | "No projects yet" | "Start Your First Project" |
| Clients | Phone receiver line art | "Add your first client" | "+ New Client" |
| Tools | Crossed wrenches | "Track your shop tools" | "+ Add Tool" |
| Quotes | Document line art | "Your quote ledger is empty" | "+ New Quote" |
| Photos (project) | Camera line art | "No photos yet" | "Add Photos" |

### Loading
- Use **skeleton placeholders** for list views (not spinners) — feels faster
- Long operations (cut list optimization, PDF generation) show a progress bar with cancel option
- Pull-to-refresh on all list views with the platform-native indicator

### Errors
- Inline field errors below the field, never as modals
- Network errors: toast with "Retry" action — do not block the user; cache the operation and replay on reconnect
- Sync conflicts: full-screen review showing local vs. remote diff, user picks which to keep per field

---

## 11. Motion

Use motion to communicate causality, not decoration.

- **Duration:** 200ms for most transitions, 300ms for entering modals, 500ms only for celebration moments (e.g., invoice paid)
- **Easing:** `ease-out` for entering, `ease-in` for exiting, `spring(0.7, 1.2)` for the FAB and bottom sheets
- **Reduced motion:** all non-essential animations respect the OS reduced-motion setting

---

## 12. Sound & Haptics

- **Haptics:** light tap on every button press, success haptic on save/send, warning haptic on validation error
- **Sound:** off by default. Optional toggle in Settings for: "Saw click on save" (a subtle one-shot SFX nodding to the brand). Off in any work-quiet context.

---

## 13. Localization (Future)

- v1.0 English-only (US)
- Strings extracted to a resource file from day one — no hard-coded copy
- Number formatting respects locale (commas vs. periods)
- Measurement system is independent of locale — a user in France may still prefer Imperial because they use US plans

---

## 14. Accessibility Checklist

- [ ] Every interactive element has a VoiceOver / TalkBack label
- [ ] Dynamic Type / font scale supported up to 200%
- [ ] Color is never the sole signal of meaning
- [ ] All form fields have visible labels (not placeholder-only)
- [ ] Min 4.5:1 contrast for body text, 3:1 for large text
- [ ] Hit targets ≥ 48×48pt
- [ ] Focus order in forms is top-to-bottom, left-to-right
- [ ] No flashing content above 3Hz

---

## 15. Open Design Decisions

- [ ] Logo direction locked (Plane Mark vs alternates)
- [ ] Light theme vs. dark theme as the default at install (recommend: follow system)
- [ ] Cut list diagram rendering library — native SVG vs. third-party
- [ ] PDF generation library — server-side via Cloud Functions vs. on-device
- [ ] Whether to invest in custom illustrations for empty states in v1.0 (recommend: yes, 5 illustrations)
