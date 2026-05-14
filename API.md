# API & Data Specification — WoodWorks Pro

This document is the source of truth for the WoodWorks Pro backend. It covers the Firestore schema, authentication model, security rules, Cloud Functions, Cloud Storage layout, indexes, and offline sync strategy.

If a discrepancy exists between this document and code, **this document wins** until the discrepancy is resolved by a deliberate update here.

---

## 1. Conventions

### Identifiers
- All document IDs are **UUID v4** generated client-side. This allows offline document creation without round-tripping to the server.
- Document IDs are stored both as the Firestore document key **and** as an `id` field on the document for ease of denormalization.

### Timestamps
- All documents have `createdAt` and `updatedAt` (Firestore `Timestamp`). `updatedAt` is overwritten on every write.
- Soft-delete uses a nullable `deletedAt` (`Timestamp?`). Queries must filter `where('deletedAt', '==', null)`. Hard-delete is reserved for purge jobs and user-initiated account deletion.

### Money
- All monetary fields are stored as **integer cents** in USD. `999` means `$9.99`. Multi-currency support is out of scope for v1.
- Field names use the suffix `Cents` to make the unit explicit (`costEstimateCents`, `markupCents` — except `markupPercent` which is a percentage not money).

### Measurements
- Lengths stored as **doubles in inches** (or millimeters in metric mode — the user's preference, not a per-document setting).
- The user's preferred display unit lives in `/users/{uid}/settings/preferences`. The DB always stores inches; the app converts on display.
- A `unitSystem` field on each project records the unit system in effect when the project was created so the data is interpretable without account context.

### Required vs Optional
- Required: must be set on every write. Server-side validation in security rules.
- Optional: may be `null` or absent. The schema documents which are which per field.

---

## 2. Authentication

- **Provider:** Firebase Authentication
- **Sign-in methods:**
  - Email + password (always available)
  - Sign in with Apple (iOS — required for App Store policy)
  - Sign in with Google (Android primary, iOS secondary)
- **Anonymous auth:** **disabled.** Guest mode is handled entirely client-side (no account, data lives in local Hive only).
- **Email verification:** required before Cloud Sync can be enabled, not required for using the paid base app.
- **Sessions:** Firebase default (1 hour token, 6 month refresh). Biometric lock is enforced client-side as an additional gate.
- **Password reset:** Firebase Auth email flow. No custom template needed for v1.

### User Document
On first sign-in, a Cloud Function (`onUserCreate`) creates `/users/{uid}` and `/users/{uid}/settings/preferences` with defaults.

---

## 3. Firestore Collections

The data model is **user-scoped** (every collection is a subcollection of `/users/{uid}`). Team Collaboration (Phase 2) introduces a parallel `/orgs/{orgId}` hierarchy with the same structure.

### Top-level: `/users/{userId}`
```
{
  id: string                   // = userId
  displayName: string
  email: string
  createdAt: Timestamp
  updatedAt: Timestamp
  subscriptions: {
    cloudSync: { active: bool, expiresAt: Timestamp? }
    cnc: { purchased: bool, purchasedAt: Timestamp? }
    team: { active: bool, seats: int, expiresAt: Timestamp? }
  }
  trade: string                // 'furniture' | 'cabinets' | 'storage' | 'closets' | 'trim' | 'outdoor' | 'other'
}
```

### `/users/{userId}/settings/preferences` (single doc)
```
{
  unitSystem: 'imperial' | 'metric'   default 'imperial'
  fractionalInches: bool              default true
  currency: string                    default 'USD'
  defaultMarkupPercent: number        default 25
  defaultLaborRateCents: int          default 7500   // $75/hr
  biometricLockEnabled: bool          default false
  notifications: {
    materialPickup: bool
    finishingSteps: bool
    toolMaintenance: bool
    quoteFollowUps: bool
  }
}
```

### `/users/{userId}/clients/{clientId}`
```
{
  id: string                   required
  name: string                 required, 1..120 chars
  email: string?               valid email
  phone: string?
  address: string?
  notes: string                default '', max 4000 chars
  createdAt: Timestamp         required
  updatedAt: Timestamp         required
  deletedAt: Timestamp?
}
```

### `/users/{userId}/projects/{projectId}`
```
{
  id: string                   required
  name: string                 required, 1..120 chars
  clientId: string?            ref → /users/{uid}/clients/{clientId}
  status: string               required, enum: 'draft'|'inProgress'|'awaitingApproval'|'completed'|'delivered'|'overdue'
  description: string          default ''
  dimensions: string           default ''       // human-readable, e.g. '36"W × 84"H × 24"D'
  laborHours: number           default 0
  costEstimateCents: int       default 0        // denormalized total of materialLineItems
  photoCount: int              default 0        // denormalized count of photos subcollection
  primaryPhotoUrl: string?     denormalized for list views
  unitSystem: 'imperial' | 'metric'
  dueDate: Timestamp?
  createdAt: Timestamp         required
  updatedAt: Timestamp         required
  deletedAt: Timestamp?
}
```

#### Subcollection: `cutListItems`
`/users/{userId}/projects/{projectId}/cutListItems/{itemId}`
```
{
  id: string                   required
  partName: string             required, 1..80 chars
  materialId: string           required, ref → /users/{uid}/materials
  lengthInches: number         required, > 0
  widthInches: number          required, > 0
  thicknessInches: number?
  quantity: int                required, >= 1
  grainDirection: 'length' | 'width' | 'none'
  notes: string                default ''
  createdAt: Timestamp
  updatedAt: Timestamp
}
```

#### Subcollection: `materialLineItems`
`/users/{userId}/projects/{projectId}/materialLineItems/{lineId}`
```
{
  id: string                   required
  materialId: string?          ref → /users/{uid}/materials (null = ad-hoc)
  name: string                 required
  category: string             enum: 'lumber'|'sheetGoods'|'hardware'|'finishes'|'adhesives'|'fasteners'|'other'
  quantity: number             required
  unit: string                 enum: 'bf'|'sheet'|'each'|'ft'|'oz'|'lb'
  unitCostCents: int           required
  totalCostCents: int          required        // quantity * unitCostCents
  createdAt: Timestamp
}
```

#### Subcollection: `photos`
`/users/{userId}/projects/{projectId}/photos/{photoId}`
```
{
  id: string
  storagePath: string           full Cloud Storage path
  thumbnailPath: string?
  caption: string               default ''
  tags: string[]                e.g. ['before', 'after', 'finish']
  takenAt: Timestamp?           from EXIF; else uploadAt
  uploadedAt: Timestamp
  width: int
  height: int
  bytes: int
}
```

#### Subcollection: `activity`
Immutable audit trail for the project.
`/users/{userId}/projects/{projectId}/activity/{activityId}`
```
{
  id: string
  type: string                  enum: 'created'|'statusChanged'|'quoteSent'|'quoteApproved'|'invoicePaid'|'photoAdded'|'noteAdded'
  payload: map                  type-specific
  at: Timestamp                 required, server time
  actorUid: string              required
}
```

### `/users/{userId}/materials/{materialId}`
Reusable library; project lines reference these by ID.
```
{
  id: string                   required
  name: string                 required, 1..80 chars
  category: string             enum (see materialLineItems)
  defaultUnit: string          enum
  defaultUnitCostCents: int
  vendor: string?
  notes: string                default ''
  createdAt: Timestamp
  updatedAt: Timestamp
  deletedAt: Timestamp?
}
```

### `/users/{userId}/tools/{toolId}`
```
{
  id: string                   required
  name: string                 required, 1..80 chars
  category: string             enum: 'saw'|'sander'|'router'|'planer'|'jointer'|'drill'|'cnc'|'hand'|'other'
  brand: string?
  model: string?
  serialNumber: string?
  purchaseDate: Timestamp?
  purchasePriceCents: int?
  warrantyExpires: Timestamp?
  nextMaintenance: Timestamp?
  maintenanceIntervalDays: int? default 90
  notes: string                default ''
  photoStoragePath: string?
  createdAt: Timestamp
  updatedAt: Timestamp
  deletedAt: Timestamp?
}
```

### `/users/{userId}/quotes/{quoteId}`
```
{
  id: string                   required
  projectId: string            required, ref → projects
  clientId: string             required, ref → clients
  status: string               enum: 'draft'|'sent'|'approved'|'declined'
  materialTotalCents: int      required        // snapshot at send time
  laborHours: number
  laborRateCents: int
  laborTotalCents: int                          // computed
  markupPercent: number        default 25
  taxPercent: number           default 0
  subtotalCents: int                            // computed
  afterMarkupCents: int                         // computed
  totalCents: int                               // computed
  pdfStoragePath: string?      set after PDF generation
  sentAt: Timestamp?
  signedAt: Timestamp?
  signatureStoragePath: string? PNG of captured signature
  emailSentTo: string?
  declinedReason: string?
  createdAt: Timestamp
  updatedAt: Timestamp
  deletedAt: Timestamp?
}
```

### `/users/{userId}/invoices/{invoiceId}`
```
{
  id: string                   required
  quoteId: string?             ref → quotes (null if invoice-only)
  projectId: string            required
  clientId: string             required
  status: string               enum: 'draft'|'sent'|'partiallyPaid'|'paid'|'overdue'|'void'
  subtotalCents: int
  taxCents: int
  totalCents: int              required
  amountPaidCents: int         default 0
  balanceCents: int                            // computed: totalCents - amountPaidCents
  paymentMethod: string?       enum: 'cash'|'check'|'card'|'ach'|'venmo'|'other'
  paymentNotes: string         default ''
  paidAt: Timestamp?
  dueDate: Timestamp?
  pdfStoragePath: string?
  createdAt: Timestamp
  updatedAt: Timestamp
  deletedAt: Timestamp?
}
```

### `/users/{userId}/cnc_files/{fileId}` (Phase 2)
```
{
  id: string
  projectId: string?           ref → projects
  filename: string
  storagePath: string
  format: string               enum: 'dxf'|'svg'|'cnc'|'nc'|'tap'
  bytes: int
  thumbnailPath: string?       PNG preview generated on upload
  uploadedAt: Timestamp
}
```

---

## 4. Indexes

Required composite indexes (Firestore auto-suggests, but explicit so they're versioned):

| Collection | Fields | Order |
| --- | --- | --- |
| `projects` | `deletedAt`, `status`, `createdAt` | asc, asc, desc |
| `projects` | `deletedAt`, `clientId`, `createdAt` | asc, asc, desc |
| `projects` | `deletedAt`, `dueDate` | asc, asc |
| `quotes` | `deletedAt`, `status`, `createdAt` | asc, asc, desc |
| `invoices` | `deletedAt`, `status`, `dueDate` | asc, asc, asc |
| `tools` | `deletedAt`, `nextMaintenance` | asc, asc |

Single-field indexes (auto) cover the rest. The `firestore.indexes.json` file in deployment should be checked into the repo.

---

## 5. Security Rules

Full Firestore security rules below. Owner-only access. Team Collaboration (Phase 2) will introduce an `/orgs` parallel hierarchy with role-based read/write.

```javascript
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    // Helpers
    function isAuthed() {
      return request.auth != null;
    }
    function isOwner(uid) {
      return isAuthed() && request.auth.uid == uid;
    }
    function isValidString(s, maxLen) {
      return s is string && s.size() > 0 && s.size() <= maxLen;
    }
    function nonNegInt(n) {
      return n is int && n >= 0;
    }
    function isProjectStatus(s) {
      return s in [
        'draft','inProgress','awaitingApproval',
        'completed','delivered','overdue'
      ];
    }

    // /users/{uid}
    match /users/{uid} {
      allow read: if isOwner(uid);
      allow create: if isOwner(uid)
        && request.resource.data.id == uid
        && isValidString(request.resource.data.displayName, 120);
      allow update: if isOwner(uid)
        && request.resource.data.id == uid;
      allow delete: if false; // account deletion via Cloud Function

      // Settings (single doc 'preferences')
      match /settings/{docId} {
        allow read, write: if isOwner(uid);
      }

      // Clients
      match /clients/{clientId} {
        allow read: if isOwner(uid);
        allow create, update: if isOwner(uid)
          && isValidString(request.resource.data.name, 120);
        allow delete: if isOwner(uid);
      }

      // Projects
      match /projects/{projectId} {
        allow read: if isOwner(uid);
        allow create, update: if isOwner(uid)
          && isValidString(request.resource.data.name, 120)
          && isProjectStatus(request.resource.data.status)
          && nonNegInt(request.resource.data.costEstimateCents);
        allow delete: if isOwner(uid);

        match /cutListItems/{itemId} {
          allow read: if isOwner(uid);
          allow create, update: if isOwner(uid)
            && isValidString(request.resource.data.partName, 80)
            && request.resource.data.lengthInches > 0
            && request.resource.data.widthInches > 0
            && request.resource.data.quantity >= 1;
          allow delete: if isOwner(uid);
        }

        match /materialLineItems/{lineId} {
          allow read, write: if isOwner(uid);
        }

        match /photos/{photoId} {
          allow read, write: if isOwner(uid);
        }

        match /activity/{activityId} {
          // Activity is write-once by Cloud Functions
          allow read: if isOwner(uid);
          allow write: if false;
        }
      }

      // Materials library
      match /materials/{materialId} {
        allow read: if isOwner(uid);
        allow create, update: if isOwner(uid)
          && isValidString(request.resource.data.name, 80);
        allow delete: if isOwner(uid);
      }

      // Tools
      match /tools/{toolId} {
        allow read: if isOwner(uid);
        allow create, update: if isOwner(uid)
          && isValidString(request.resource.data.name, 80);
        allow delete: if isOwner(uid);
      }

      // Quotes
      match /quotes/{quoteId} {
        allow read: if isOwner(uid);
        allow create, update: if isOwner(uid)
          && nonNegInt(request.resource.data.totalCents);
        allow delete: if isOwner(uid);
      }

      // Invoices
      match /invoices/{invoiceId} {
        allow read: if isOwner(uid);
        allow create, update: if isOwner(uid)
          && nonNegInt(request.resource.data.totalCents)
          && nonNegInt(request.resource.data.amountPaidCents);
        allow delete: if isOwner(uid);
      }

      // CNC files (Phase 2)
      match /cnc_files/{fileId} {
        allow read: if isOwner(uid);
        allow create, update: if isOwner(uid)
          && get(/databases/$(database)/documents/users/$(uid)).data.subscriptions.cnc.purchased == true;
        allow delete: if isOwner(uid);
      }
    }
  }
}
```

### Storage Rules
```javascript
rules_version = '2';

service firebase.storage {
  match /b/{bucket}/o {
    function isOwner(uid) {
      return request.auth != null && request.auth.uid == uid;
    }
    function isImage() {
      return request.resource.contentType.matches('image/.*')
        && request.resource.size < 10 * 1024 * 1024; // 10MB
    }
    function isPdf() {
      return request.resource.contentType == 'application/pdf'
        && request.resource.size < 25 * 1024 * 1024;
    }

    match /users/{uid}/{allPaths=**} {
      allow read: if isOwner(uid);
    }
    match /users/{uid}/projects/{projectId}/photos/{file} {
      allow write: if isOwner(uid) && isImage();
    }
    match /users/{uid}/projects/{projectId}/drawings/{file} {
      allow write: if isOwner(uid)
        && (isImage() || isPdf());
    }
    match /users/{uid}/quotes/{file} {
      allow write: if isOwner(uid) && isPdf();
    }
    match /users/{uid}/invoices/{file} {
      allow write: if isOwner(uid) && isPdf();
    }
    match /users/{uid}/cnc_files/{file} {
      allow write: if isOwner(uid)
        && request.resource.size < 50 * 1024 * 1024;
    }
  }
}
```

---

## 6. Cloud Functions

Hosted on Firebase Functions (Node.js 20, 2nd gen).

### Triggers

| Function | Trigger | Purpose |
| --- | --- | --- |
| `onUserCreate` | Auth: user created | Provision `/users/{uid}` doc and default preferences |
| `onUserDelete` | Auth: user deleted | Schedule purge of all user data within 30 days |
| `onProjectStatusChange` | Firestore: `projects/{id}` update | Append `activity/{id}` doc with status change details |
| `onQuoteSent` | Firestore: `quotes/{id}` update where `status == 'sent'` | Send email via SendGrid, append activity |
| `onInvoicePaid` | Firestore: `invoices/{id}` update where `status == 'paid'` | Append activity, optionally schedule a 14-day follow-up |
| `onPhotoUpload` | Cloud Storage: photo path finalize | Generate thumbnail, write `photos/{id}` document |
| `onCncFileUpload` | Cloud Storage: cnc_files path finalize | Generate thumbnail SVG preview |

### Callable Functions

| Name | Inputs | Output | Notes |
| --- | --- | --- | --- |
| `generateQuotePdf` | `{ quoteId }` | `{ pdfStoragePath, pdfUrl }` | Server-side PDF render; saves to Storage |
| `generateInvoicePdf` | `{ invoiceId }` | `{ pdfStoragePath, pdfUrl }` | Same approach |
| `sendQuoteEmail` | `{ quoteId, toEmail, message? }` | `{ status }` | Sends SendGrid email; updates quote `sentAt` |
| `validatePurchaseReceipt` | `{ platform, receipt }` | `{ subscriptionState }` | App Store / Play receipt validation; updates `users/{uid}.subscriptions` |
| `purgeUserData` | `{ uid }` | `{ status }` | Triggered by `onUserDelete` after 30 days; admin-only outside that flow |

### Scheduled Functions

| Name | Schedule | Purpose |
| --- | --- | --- |
| `dailyMaintenanceReminders` | `0 14 * * *` (UTC) | Find tools with `nextMaintenance <= now + 7d`, send push notifications |
| `dailyOverdueProjects` | `0 14 * * *` | Set projects past `dueDate` and not `completed` to `status: 'overdue'` |
| `weeklyDigestEmail` | `0 13 * * MON` | Opt-in summary email of last week's projects, quotes, payments |

---

## 7. Cloud Storage Layout

```
gs://<project>-prod/
├── users/
│   └── {uid}/
│       ├── projects/
│       │   └── {projectId}/
│       │       ├── photos/
│       │       │   ├── {photoId}.jpg            // original
│       │       │   └── {photoId}_thumb.jpg      // 512px thumbnail
│       │       └── drawings/
│       │           └── {filename}
│       ├── quotes/
│       │   └── {quoteId}.pdf
│       │   └── {quoteId}_signature.png
│       ├── invoices/
│       │   └── {invoiceId}.pdf
│       └── cnc_files/
│           └── {fileId}.{ext}
│           └── {fileId}_preview.svg
```

Naming rules:
- Photo `{photoId}` matches the Firestore `photos` doc ID
- PDFs and previews share their parent doc ID
- Original uploads keep their MIME type; thumbnails are JPEG; previews are SVG

---

## 8. Offline & Sync Strategy

### Local persistence
- **Firestore SDK** has native offline persistence enabled. Most reads/writes go through it automatically.
- **Hive** is used in addition for performance-critical paths (project list rendering on cold start) where Firestore's hydration is slow on older Android devices.

### Write model
- Every client-side write is **optimistic**: the local store is updated first, the Firestore mutation queued, and the UI reflects the change immediately.
- Failed Firestore writes (auth lapse, server reject) bubble up as a toast and revert the local change.

### Conflict resolution
- **Field-level last-write-wins** for scalar fields (status, name, dimensions).
- **Set semantics** for tag arrays (union of local and remote tags).
- **Manual conflict UI** for `cutListItems` collection — if two devices edited the same cut list while offline, present the user with both versions field-by-field on next sync. Conflicts are rare; this is the safe path.

### Sync indicator
- The Settings screen shows the timestamp of the last successful Firestore sync.
- A pending-writes indicator appears in the app bar when local edits haven't been confirmed by the server.

---

## 9. Pagination

- Lists use **cursor-based pagination** with Firestore `startAfter(lastDoc)`.
- Default page size: **20** items. Infinite scroll triggers when the user is within 4 items of the end.
- Client caches the last cursor in memory; on app resume, it re-fetches the first page only to capture remote changes.

---

## 10. Soft Delete & Data Lifecycle

- All user-facing deletes set `deletedAt = Timestamp.now()` and are filtered out of every query.
- A scheduled Cloud Function (`weeklyHardDelete`) purges documents with `deletedAt < now - 30 days` and the associated Storage objects.
- Account deletion (user-initiated):
  1. App calls `purgeUserData` callable
  2. Function tombstones all docs with `deletedAt`
  3. 30 days later (or immediately if the user opts in to "delete now"), `weeklyHardDelete` removes everything

---

## 11. Sample Documents

### Sample `projects/abc-123`
```json
{
  "id": "abc-123",
  "name": "Walnut bookcase",
  "clientId": "client-789",
  "status": "inProgress",
  "description": "8ft floor-to-ceiling bookcase, walnut with maple interiors",
  "dimensions": "96\"H × 48\"W × 14\"D",
  "laborHours": 36,
  "costEstimateCents": 285000,
  "photoCount": 4,
  "primaryPhotoUrl": "https://storage.googleapis.com/.../abc-123/photos/p1_thumb.jpg",
  "unitSystem": "imperial",
  "dueDate": "2026-06-15T00:00:00Z",
  "createdAt": "2026-04-22T15:31:00Z",
  "updatedAt": "2026-05-10T18:02:11Z",
  "deletedAt": null
}
```

### Sample `quotes/quote-456`
```json
{
  "id": "quote-456",
  "projectId": "abc-123",
  "clientId": "client-789",
  "status": "sent",
  "materialTotalCents": 142000,
  "laborHours": 36,
  "laborRateCents": 7500,
  "laborTotalCents": 270000,
  "markupPercent": 25,
  "taxPercent": 8.5,
  "subtotalCents": 412000,
  "afterMarkupCents": 515000,
  "totalCents": 558775,
  "pdfStoragePath": "users/uid-1/quotes/quote-456.pdf",
  "sentAt": "2026-05-11T19:42:08Z",
  "signedAt": null,
  "emailSentTo": "client@example.com",
  "createdAt": "2026-05-11T19:30:00Z",
  "updatedAt": "2026-05-11T19:42:09Z",
  "deletedAt": null
}
```

---

## 12. Performance & Cost Considerations

### Firestore
- Avoid `array-contains-any` with > 10 elements (Firestore hard limit).
- Denormalize `primaryPhotoUrl` and `photoCount` on the project doc so the list view doesn't fan-out reads.
- Use `getCountFromServer` (Firestore Aggregation) for KPI tiles on the dashboard rather than client-side counting.

### Storage
- Always upload via Resumable Upload for files > 5MB (drawings, CNC files).
- Thumbnails generated server-side, never client-side bandwidth-tax.

### Cost model (back-of-envelope, per active user/month)
- Firestore reads: ~3,000/mo @ $0.06/100K = $0.0018
- Firestore writes: ~1,500/mo @ $0.18/100K = $0.0027
- Storage: ~200MB @ $0.026/GB = $0.0052
- Functions: ~500 invocations @ $0.40/M = ~$0
- **Total per user/month: < $0.02** at v1 scale; Cloud Sync subscription at $4.99/mo has very healthy gross margin even after Apple's 15–30%.

---

## 13. Versioning

- Schema changes ship via a `schemaVersion` integer at the user doc root.
- Migration functions run on app launch if `user.schemaVersion < APP_SCHEMA_VERSION`. Migrations must be idempotent.
- Backwards-incompatible changes (renaming fields) require a two-release ramp: first release writes both old and new fields, second release reads the new field only.

---

## 14. Open Backend Decisions

- [ ] Whether to use Firebase **App Check** at launch (recommended: yes, enforce after first 1,000 installs)
- [ ] Email provider (SendGrid vs. Resend vs. Postmark) — recommend **Postmark** for transactional reliability
- [ ] Push notification provider — Firebase Cloud Messaging by default; consider OneSignal for richer segmentation in Phase 2
- [ ] Whether to migrate to Firestore in **Datastore mode** for scale beyond ~100K users (Native mode is the right choice for v1; revisit at Phase 3)
- [ ] Whether to add Stripe Connect in Phase 3 for in-app payment collection on invoices (large surface area; not v1)
