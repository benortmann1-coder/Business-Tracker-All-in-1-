# Data safety form answers

Play Console → Policy → App content → **Data safety**. These answers come from reading the code (Nov 13 2026, v1.5.6 plus the Pro upgrade). Re-check them whenever a feature sends data anywhere new.

## How Google defines it

- **Collected** = sent off the user's device by the app (even if it goes to the user's own cloud storage or to a service provider), unless it's processed only ephemerally or is end-to-end encrypted.
- **Shared** = given to a third party. Data sent to a service provider that processes it for you, or transfers the user starts themselves, don't count as sharing.

WealthTrack stores everything on the device. Data leaves the device in only two app features: **Google Drive backup** (optional, to the user's own Drive) and **address suggestions** (the typed street address goes to photon.komoot.io). Google Play purchases are handled by Google Play itself.

The conservative, honest answer is to declare what those two features send, as **optional**, for **app functionality**.

## Section 1: Data collection and security

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | **Yes** |
| Is all of the user data collected by your app encrypted in transit? | **Yes** (HTTPS only; the manifest blocks unencrypted traffic) |
| Do you provide a way for users to request that their data is deleted? | **Yes**: Settings → Your data → Erase all data, and deleting the backup file in Google Drive. Deletion URL (if asked): the privacy policy URL, "Keeping and deleting your data" section |
| Account creation | **My app does not allow users to create an account** (Google sign-in is only used to reach the user's own Drive; there is no WealthTrack account or server) |

## Section 2: Data types

Declare these. For **each**: Collected = Yes, Shared = **No**, Processed ephemerally = **No**, Required or optional = **Optional** (users can choose whether this data is collected), Purpose = **App functionality** only.

| Category → type | Why |
|---|---|
| **Personal info → Name** | in the Drive backup file (Personal info) |
| **Personal info → Email address** | Google sign-in email, and in the Drive backup |
| **Personal info → Address** | in the Drive backup; typed address sent for address suggestions |
| **Financial info → Other financial info** | bills, income, balances, debts in the Drive backup |
| **Financial info → Purchase history** | expenses/payments the user records, in the Drive backup |
| **Photos and videos → Photos** | receipt and profile photos, in the Drive backup |

**Do not** declare (the app never sends them): location, contacts, messages, calendar, app activity/analytics, web browsing, device or other IDs (no Advertising ID), health, audio, files and docs (other than the above), crash logs or diagnostics.

**Financial info → User payment info**: **No**. Card details for the Pro purchase go to Google Play, never to the app.

## Section 3: Security practices shown on the listing

- Data is encrypted in transit: **Yes**
- You can request that data be deleted: **Yes**
- Committed to the Families policy: **No** (not a kids' app)
- Independent security review: **No**

## Notes

- If Play Console's help text convinces you that a user-initiated backup to the user's own Drive isn't "collection", you could answer "No data collected" for those types. The table above is the safer choice: over-declaring optional collection is fine, under-declaring is a policy violation.
- Advertising ID declaration (separate question under App content): **No, my app does not use advertising ID**.
