# Phase 2 — Pro Features Specification

This document specifies the five Phase 2 features that turn WoodWorks Pro from a single-shop tool into a connected business platform: Cloud Sync, Team Collaboration, CNC File Manager, Finishing Schedule Tracker, and Advanced Analytics.

These features layer on top of the Phase 1 MVP. The base app remains fully functional offline without any of them. Each Phase 2 feature has its own gating (subscription or one-time IAP) and ships independently.

---

## 1. Overview

| Feature | Pricing | Type | Sprint |
| --- | --- | --- | --- |
| Cloud Sync | $4.99/mo or $39.99/yr | Subscription | 1 |
| Team Collaboration | $9.99/mo per seat | Subscription | 2 |
| CNC File Manager | $14.99 | One-time IAP | 3 |
| Finishing Schedule Tracker | Free upgrade with Cloud Sync | Bundled | 4 |
| Advanced Analytics | Free upgrade with Cloud Sync | Bundled | 5 |

**Why this bundling**
- Cloud Sync is the gateway feature: most Phase 2 capabilities require server-side state. Bundling Finishing Tracker and Analytics with Cloud Sync makes the subscription feel rich and steers users toward annual prepay.
- Team Collaboration is independent — a different buyer (shop owner with employees, not solo).
- CNC File Manager is a one-time IAP because it's a discrete, owned capability — fits the "tools you own" pricing ethos.

---

## 2. Cloud Sync

### Goal
Multi-device, multi-platform access to the same shop data, with a clean conflict story.

### User-facing behavior
- After upgrade, the user signs into a Firebase account inside the app.
- All existing local Hive data is migrated to Firestore on first connect (one-time push).
- Subsequent edits write through the optimistic local cache → Firestore. The user never waits on the network for a normal save.
- The Settings screen shows `Last sync` and a manual `Sync now` button.
- A small "pending changes" indicator appears in the app bar when there are unconfirmed writes.

### Conflict UX
- For scalar fields (project name, status, due date): silent last-write-wins. Conflicts in practice are rare.
- For the `cutListItems` collection: if two devices edited the same cut list while offline, a dedicated **Conflict Review** sheet appears on next open, showing local vs. remote side-by-side, item-by-item, with a "Keep local / Keep remote / Keep both" choice per item.
- Conflicts are surfaced once per pair of edits; the user's choice is recorded and never re-prompted for that pair.

### Backend
Specified in detail in `API.md` §3, §5, §8. Key points:
- All collections live under `/users/{uid}`.
- Firestore native persistence is enabled by default in the Flutter client.
- A Cloud Function `validatePurchaseReceipt` validates App Store / Google Play subscriptions and sets `users/{uid}.subscriptions.cloudSync.active`.
- A scheduled `dailyRevalidateSubscriptions` job re-checks active subscriptions daily to catch lapses.

### Subscription gating
- Client-side gate: feature flag computed from `users/{uid}.subscriptions.cloudSync.active`. Disabled state shows a sticky banner with an upgrade CTA.
- Server-side gate: Firestore security rules check the same flag on writes that should be subscription-gated (currently none in v1 — cloud sync is implicit; we don't reject offline-style writes).
- Grace period: 7 days of read-only sync after a subscription lapses so users don't get hard-blocked by a billing hiccup.

### Migration from Phase 1
- On first Cloud Sync activation, the client iterates the local Hive store and pushes every doc to Firestore via batched writes (max 500 per batch). Total migration for an average user (~50 projects, ~150 cut list items, ~30 photos) takes < 30s on Wi-Fi.
- The migration runs in a foreground state with a progress indicator. Cancel mid-flight is supported and resumable.

---

## 3. Team Collaboration

### Goal
Multi-user shops (2–10 employees) can share projects, assign tasks, and see who did what.

### Org model
A user can belong to multiple orgs but has exactly one "active" org at a time (swap in Settings). Personal data still lives at `/users/{uid}` for users not on a team; team data lives at `/orgs/{orgId}` with the same subcollection layout (`projects`, `clients`, `quotes`, etc.).

### Firestore additions
```
/orgs/{orgId}
{
  id: string                       required
  name: string                     required, 1..120 chars
  ownerUid: string                 required
  seats: int                       required, ≥ 1
  createdAt: Timestamp
  subscription: {
    active: bool
    plan: 'monthly' | 'annual'
    expiresAt: Timestamp
  }
}

/orgs/{orgId}/members/{uid}
{
  id: string                       = uid
  uid: string                      required
  role: 'owner' | 'admin' | 'member' | 'viewer'    required
  joinedAt: Timestamp
  invitedBy: string                uid of inviter
  displayName: string              denormalized for member list
  email: string                    denormalized for member list
}

/orgs/{orgId}/invitations/{invitationId}
{
  id: string
  email: string                    required
  role: 'admin' | 'member' | 'viewer'
  invitedBy: string                uid
  status: 'pending' | 'accepted' | 'expired' | 'revoked'
  expiresAt: Timestamp             createdAt + 7 days
  createdAt: Timestamp
}

/orgs/{orgId}/projects/{projectId}/tasks/{taskId}
{
  id: string
  title: string                    required, 1..120 chars
  description: string              default ''
  assignedToUid: string?
  status: 'todo' | 'inProgress' | 'done'
  dueDate: Timestamp?
  createdAt: Timestamp
  updatedAt: Timestamp
  createdByUid: string
}
```

### Roles
| Role | Read | Write project content | Manage members | Manage billing |
| --- | --- | --- | --- | --- |
| Owner | yes | yes | yes | yes |
| Admin | yes | yes | yes (cannot remove owner) | no |
| Member | yes | yes | no | no |
| Viewer | yes | no | no | no |

### Security rules sketch
Owner-equivalent rules from `API.md` §5 are extended:

```javascript
function hasRole(orgId, allowed) {
  return request.auth != null
    && exists(/databases/$(database)/documents/orgs/$(orgId)/members/$(request.auth.uid))
    && get(/databases/$(database)/documents/orgs/$(orgId)/members/$(request.auth.uid)).data.role in allowed;
}

match /orgs/{orgId} {
  allow read: if hasRole(orgId, ['owner','admin','member','viewer']);
  allow update: if hasRole(orgId, ['owner']);

  match /projects/{projectId} {
    allow read: if hasRole(orgId, ['owner','admin','member','viewer']);
    allow write: if hasRole(orgId, ['owner','admin','member']);

    match /tasks/{taskId} {
      allow read: if hasRole(orgId, ['owner','admin','member','viewer']);
      allow write: if hasRole(orgId, ['owner','admin','member']);
    }
  }
}
```

### Invitations flow
1. Owner / admin enters an email in the Team screen → creates an `invitations` doc.
2. Cloud Function `onInvitationCreate` sends an email via Postmark with a deep link `woodworkspro://invite/{invitationId}`.
3. Recipient opens the link → sign in (or create account) → callable function `acceptInvitation` checks the invitation is valid and adds the user to `/orgs/{orgId}/members/{uid}`.
4. Pending invitations auto-expire after 7 days; expired invitations can be re-sent.

### Activity feed
The existing project `activity` subcollection (Phase 1) is extended to include team events: member joined, task created, task completed, task reassigned. Surface this as a "Recent activity" section on the org dashboard.

### Pricing & billing
- $9.99/mo per seat (annual: $99.99/seat, ~17% discount).
- The owner pays for all seats.
- Adding a seat mid-cycle is prorated automatically via App Store / Play; receipt validation updates `seats` on the org doc.
- The org cannot have more `members` than `seats` — invitations beyond capacity are blocked client-side, with a clear "upgrade seats" CTA.

---

## 4. CNC File Manager

### Goal
Designers and CNC owners can upload, organize, and preview their tool-path and design files inside the project they belong to.

### Supported formats
| Extension | What it is | Preview strategy |
| --- | --- | --- |
| `.dxf` | 2D CAD (AutoCAD Exchange) | Server-side conversion → SVG preview |
| `.svg` | Inkscape / web design | Direct render |
| `.cnc` | Vendor-specific g-code | Tool-path SVG synthesis (best-effort) |
| `.nc`, `.tap`, `.gcode` | G-code variants | Tool-path SVG synthesis |
| `.f3d`, `.step`, `.iges` | 3D CAD (future) | **Phase 3** — not v1 |

### Upload flow
1. User taps "Add CNC File" in the project's CNC tab.
2. Native file picker → file selected → uploaded to `users/{uid}/cnc_files/{fileId}.{ext}` (or `orgs/{orgId}/...` for team accounts).
3. Cloud Storage finalize triggers `onCncFileUpload` Cloud Function.
4. Function downloads the file, detects format, runs the appropriate previewer, writes the SVG preview to `users/{uid}/cnc_files/{fileId}_preview.svg`, and creates the Firestore doc.
5. Client subscribes to the Firestore doc and shows the preview when ready (typically 2–5 seconds).

### Conversion stack
- DXF → SVG: `dxf-to-svg` Node library (open source, MIT)
- G-code → SVG: custom parser that renders rapid + cut moves as different stroke colors
- All conversions run in a Cloud Function with 1GB memory, 60s timeout. Files that fail conversion still upload but show a "preview unavailable" placeholder.

### Storage limits
- Per file: 50 MB hard limit (enforced in Storage rules)
- Per project: no hard limit, but UI warns at 500 MB
- Per user (without subscription beyond IAP): 5 GB
- Per org: 50 GB (raised on request)

### Organization
- Files are organized by project. A project's CNC tab shows a grid of preview thumbnails.
- Filter chips: format (DXF / SVG / G-code), date uploaded.
- Tags supported (e.g. "v2", "client approved"). Stored as `tags: string[]` on the `cnc_files` doc.
- Files can be moved between projects.

### Pricing
- $14.99 one-time IAP.
- The user owns the feature forever, including all future format additions.
- Subscription is **not** required, but Cloud Sync amplifies the value (uploads are useless without server-side rendering).
- Soft upsell: at IAP purchase time, recommend Cloud Sync with a one-tap upgrade.

---

## 5. Finishing Schedule Tracker

### Goal
Track multi-step finishing workflows (sanding → conditioner → stain → seal → topcoat × N) with explicit drying times and per-step reminders.

### Concepts
- **Finishing Schedule**: a sequence of `FinishingStep` items attached to a project (or part of a project).
- **Step types**:
  - Sanding (grit, duration)
  - Wood conditioner (product, drying minutes)
  - Stain (product, color, drying minutes)
  - Sealer (product, drying minutes)
  - Topcoat (product, coats, drying minutes between coats)
  - Custom (free text)
- **Drying time database**: shipped pre-seeded with manufacturer-published drying times for ~80 common products (Minwax, General Finishes, Rubio, Osmo, Watco, etc.). User can override per step.

### Firestore additions
```
/users/{uid}/projects/{projectId}/finishingSchedules/{scheduleId}
{
  id: string                       required
  name: string                     required, e.g. 'Front of bookcase'
  status: 'draft' | 'inProgress' | 'completed'
  steps: FinishingStep[]           ordered
  createdAt: Timestamp
  updatedAt: Timestamp
  startedAt: Timestamp?
  completedAt: Timestamp?
}

FinishingStep (embedded)
{
  id: string
  type: 'sanding' | 'conditioner' | 'stain' | 'sealer' | 'topcoat' | 'custom'
  productName: string?
  productCode: string?             ref → finishing_products library
  notes: string
  dryingMinutes: int               from product DB or user override
  startedAt: Timestamp?
  finishedAt: Timestamp?
  scheduledReadyAt: Timestamp?     = startedAt + dryingMinutes
  reminderSentAt: Timestamp?
}
```

A separate `finishing_products` collection (shared across all users, read-only client-side) seeds the drying-time database. Maintained by the team via Firestore console + a versioned JSON file in the repo.

### Reminder logic
- When a step is marked Started, the app schedules a local notification (offline) at `startedAt + dryingMinutes` minus a 5-minute buffer.
- If Cloud Sync is enabled, a Cloud Function `scheduleFinishingReminder` also schedules a push notification — so the reminder fires even if the app isn't open on the device that started the step.
- Notifications include a deep link back to the schedule.

### Wireframe — Finishing Schedule screen
- App bar: schedule name + edit
- Top card: current step status (Sanding 220 grit • Started 2:15pm • Ready at 2:45pm) with a progress bar
- Step list: ordered card per step with status icon, drying countdown, "Mark started" / "Mark done" actions
- Bottom: "+ Add step" + "Use template" (pre-saved workflows like "Walnut + oil + 3 coats")

### Bundled with Cloud Sync
- Free for any user with active Cloud Sync.
- Without Cloud Sync, the user sees the feature but is told reminders won't fire if they close the app. Soft upsell.

---

## 6. Advanced Analytics

### Goal
Make the business numbers obvious without spreadsheet work.

### KPIs surfaced
**Revenue**
- Revenue this month / quarter / year-to-date
- Top 5 clients by revenue
- Average project value
- Quote → invoice conversion rate
- Time-to-payment median

**Operations**
- Projects shipped this period
- Average project duration (start → delivered)
- Hours logged per project type
- Material spend by category (lumber / sheet goods / hardware / finishes)
- Tool maintenance compliance (% of tools serviced on schedule)

**Profitability**
- Gross margin by project (revenue − material − labor cost)
- Material price drift (% change over trailing 90 days for top materials)
- Labor hours estimated vs actual

### Implementation
- Client-side roll-ups for users without Cloud Sync (local data only).
- Server-side aggregation jobs for Cloud Sync users — a scheduled Cloud Function `nightlyAnalyticsRollup` writes pre-computed buckets to `/users/{uid}/analytics/{period}`. This keeps the dashboard instant on mobile and avoids hammering Firestore reads on every open.
- Charts: bar, line, donut. Library: **fl_chart** (pure Dart, no native deps).

### Time-period filtering
Period selector: This Week / This Month / This Quarter / This Year / Custom range. Selection persists per device.

### Export
- One-tap **Export CSV** for any view.
- One-tap **Export PDF** that renders a snapshot of the current dashboard for sharing with an accountant.

### Bundled with Cloud Sync
- Basic analytics (this month / this quarter, revenue + project counts) free for all users.
- Advanced (margin, drift, custom ranges, exports) gated on Cloud Sync.

---

## 7. Technical Additions

### New Cloud Functions (extending `API.md` §6)

| Function | Trigger | Purpose |
| --- | --- | --- |
| `onInvitationCreate` | Firestore: `orgs/{id}/invitations/{id}` create | Email the invitee |
| `acceptInvitation` | Callable | Validate invitation, add user to org |
| `onCncFileUpload` | Storage: `users/{uid}/cnc_files/*` finalize | Generate SVG preview, write Firestore doc |
| `scheduleFinishingReminder` | Firestore: `finishingSchedules` step started | Schedule push via FCM |
| `nightlyAnalyticsRollup` | Scheduled (daily 02:00 UTC) | Pre-compute analytics buckets |
| `dailyRevalidateSubscriptions` | Scheduled | Re-check IAP/sub status |
| `enforceSeatCount` | Firestore: `orgs/{id}/members` create | Reject if `members.count >= seats` |

### New SDK additions to Flutter app
- `cloud_functions` — already in pubspec via firebase_core; explicit import for callables
- `firebase_messaging` — push notifications for team and finishing reminders
- `fl_chart` — analytics charts
- `share_plus` — CSV / PDF export sharing
- `file_picker` — CNC file selection
- `flutter_svg` — render CNC preview SVGs

### Push notification topics
| Topic | Purpose | Trigger |
| --- | --- | --- |
| `tool-maintenance-{uid}` | Tool maintenance due | Daily scheduled job |
| `finishing-reminder-{scheduleId}` | Drying timer | Step started |
| `team-task-{uid}` | Task assigned to you | Task assignment |
| `quote-followup-{uid}` | Quote sent + 5 days no answer | Scheduled |

---

## 8. Sprint Plan (6–10 weeks)

| Sprint | Duration | Scope | Exit criteria |
| --- | --- | --- | --- |
| 1 — Cloud Sync foundation | 2 weeks | Firebase wiring in app, `FirestoreProjectRepository`, migration from Hive, sync settings screen, receipt validation, conflict UI for `cutListItems` | A user with Cloud Sync sees real Firestore data across two devices |
| 2 — Team Collaboration | 2 weeks | `/orgs` schema, member roles, invitation flow + email, org switcher, task subcollection | A 2-seat org can invite, accept, and share a project |
| 3 — CNC File Manager | 1.5 weeks | Storage upload + size limits, format detection, conversion Cloud Functions, project tab UI | Upload a DXF, see preview in app within 5 seconds |
| 4 — Finishing Tracker | 1.5 weeks | Schedule + step models, drying-time database seed, local + remote reminders, wireframe-perfect UI | Schedule a 4-step finish, get notified when each step is ready |
| 5 — Advanced Analytics | 1.5 weeks | Roll-up Cloud Function, dashboard screen, charts, CSV/PDF export | Dashboard loads under 500ms on a year-old device |
| 6 — Polish, App Store updates, marketing | 1.5 weeks | A/B test new screenshots that feature Phase 2, in-app upsell prompts, refreshed press kit | App Store listing updated, in-app upsell live for 100% of users |

Total: **10 weeks** at the slow end; can compress to 6 with two engineers working in parallel on Sprint 2 + 3.

---

## 9. Migration from Phase 1

### App-side migration
1. Cloud Sync subscription validated.
2. App prompts the user: "Move your data to the cloud?" with a single button.
3. Migration runs:
   - Read every Hive box (projects, clients, materials, tools, quotes, invoices)
   - Batched writes to `/users/{uid}/...` (max 500 docs per batch)
   - Local writes from this point forward go through Firestore (with native offline cache fronting it); Hive becomes a read-through cache for the projects list only.
4. On migration completion, a one-time "Welcome to Cloud Sync" sheet explains the multi-device experience.

### Data preservation guarantee
- Hive data is preserved on-device for 30 days after migration as a safety net.
- After 30 days, a background cleanup removes the local Hive data with a confirmation banner.
- If migration fails midway, the app rolls back to Hive-only mode and reports the error; no data is lost.

---

## 10. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Cloud Function cold-start latency makes uploads feel slow | Medium | Medium | Move CNC preview generation to Cloud Run with min instances = 1 |
| Push notification reliability on Android (especially MIUI / Huawei) | High | Medium | Pair push with local notifications; never rely on push alone |
| Team Collaboration billing edge cases (mid-cycle seat changes) | Medium | Medium | Test with App Store / Play sandbox extensively before launch |
| CNC file format edge cases break the previewer | High | Low | Show "preview unavailable" gracefully; never block the upload itself |
| Finishing-product database goes stale | Low | Low | Quarterly review cadence + community submissions process via support email |
| Analytics rollup miscounts because of soft-deleted projects | Medium | Medium | Rollup function explicitly filters `where deletedAt == null`; unit test |

---

## 11. Open Phase 2 Decisions

- [ ] Whether to offer a discounted Cloud Sync + CNC bundle (recommend: yes, $59.99 for both)
- [ ] Whether viewers count against the seat cap (recommend: no — viewers are free, encourage adding clients as viewers)
- [ ] Whether to support multi-org switching in the UI from launch or hide it until 1% of users need it (recommend: hide; ship single-org for v2.0, add switcher in v2.1)
- [ ] Whether to ship the Finishing Tracker without Cloud Sync gating at all (recommend: yes — it's a great solo-user feature too, and bundling can come later if needed)
- [ ] Push notification provider: stick with FCM or move to OneSignal for richer segmentation (recommend: FCM through v2.0, revisit if segmentation needs grow)
