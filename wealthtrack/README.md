# WealthTrack

Personal finance and bill tracker. It works offline, needs no account or bank connection, and keeps all data on your device.

## Get it

| How | File |
|---|---|
| **Android app** | `WealthTrack.apk` in your Google Drive: every build replaces it there (see DRIVE-SETUP.md). It's also attached to each "Build WealthTrack APK" run on GitHub Actions. Open it on your phone and install it; you'll need to allow "Install unknown apps" for Drive or your Files app. |
| **Any browser (phone or computer)** | `dist/WealthTrack.html`: one file. Open it in Chrome, Edge, Safari or Firefox and it works offline. |
| CI build | Every push that changes `wealthtrack/**` runs the **Build WealthTrack APK** workflow. It uploads the APK as a build artifact, and also to Google Drive once the `GDRIVE_SA_JSON` / `GDRIVE_FOLDER_ID` secrets are set (see `../BUILD-APK.md`). |

Each install keeps its own data. The Android app, Chrome on your laptop and Safari on your phone don't share data. To move data between them, use **Settings → Back up all data**, then **Restore** on the other device.

## What's in it

- **Dashboard.** Shows monthly income, bills, paid and unpaid amounts, what's left after bills, available balance, upcoming and overdue bills, the current paycheck plan, spending progress, charts, a 60-day cash projection, debt, budgets and goals. You can show, hide and reorder the widgets in Settings.
- **Bills.**
  - Recurring bills: weekly, every 2 weeks, monthly, quarterly, yearly, custom (every N days/weeks/months/years) or one time.
  - Each month gets its own copy of each bill, with its own paid/unpaid status.
  - You can make partial payments and pay future months early.
  - Edits can apply to *this month only* or *this and all future months*.
  - You can move one month's due date, skip a month, or pause, cancel or delete a bill.
  - Delete bills and subscriptions with the trash button (All bills, Subscriptions, or the Delete button when editing a bill). The bill disappears from this month on; every payment already recorded stays in History. Deleted bills are hidden under **Show deleted bills** on the All bills tab.
  - **Due on the last day of each month** (monthly, quarterly and yearly bills): tick it and the date picker becomes a small month picker; the bill is then due Nov 30, Dec 31, Feb 28 and so on.
  - Subscriptions can be edited (pencil button) or deleted right from the Subscriptions tab.
  - One **Sort & group** dropdown on the bill lists: sort by due date, status or name, or group by category or paycheck. Paid bills sit together at the top (except with Status, which puts overdue first).
  - **Upcoming → Through a date…** lists every unpaid bill due up to the end of a day you pick (defaults to the 1st of next month), with the total and the paychecks coming before then. Use it to pay bills due on the 1st during the month before.
  - **Refresh due dates** (bottom of the month view): a bill you moved into another month (say November's bill to Oct 31) stays in that month for good, with its payments, and the month it left gets its normal bill back.
  - **Generate next month** and **Reset this month's statuses** each ask you to confirm. The reset voids payments; it never deletes them.
- **Paycheck planner.**
  - Multiple jobs, paid weekly, every 2 weeks, twice a month or monthly. Pay can be net or gross.
  - Each bill is automatically assigned to the last paycheck before its due date. You can move it to a different check.
  - Per-paycheck set-asides, such as food and gas.
  - Shows what's left from each check and warns you when the *next* check will come up short.
  - Records deposits, plus bonuses and overtime.
- **Expenses.**
  - Categories, including custom ones, and receipt photos.
  - Search, filter and sort.
  - Shows spending by category.
  - Warns when an expense looks like a duplicate of a bill payment.
- **Debt.**
  - Credit cards and loans: APR, minimum payment, due day, credit limit and utilization.
  - Interest is added automatically each month, once per month.
  - Paying a linked bill lowers the debt's balance.
  - Also: charges, extra payments, statement balance updates and history.
  - Payoff calculator comparing snowball, avalanche and minimum-only, with total interest saved.
- **Budgets.** A monthly limit per category, alerts at 80% and 100%, and optional rollover of unused money.
- **Calendar.** Shows bills, paychecks and payments. Tap a day to view, add or pay bills. Drag a bill to another day to move it for that month only.
- **Savings goals.** Shows progress and projected finish date. Contributions are transfers between your own accounts, not spending.
- **Reports and History.** Month-to-month comparison, 12-month trends, debt trend, yearly table, and a searchable list of every transaction.
- **Color themes (Pro).** Ocean, Plum, Slate, Espresso and High contrast, each in light and dark, on top of System / Light / Dark (Settings → App theme). Every theme passes WCAG AA contrast (`tests/themes.test.js`); the Android status and navigation bars follow the theme.
- **Data.**
  - Stored in IndexedDB on your device.
  - Export to Excel (.xlsx, several sheets) and CSV.
  - JSON backup, optionally encrypted with a password; restore asks before replacing anything.
  - Optional PIN lock that encrypts data on the device with AES-256-GCM.
  - Android bill reminders work even when the app is closed.
  - **Home-screen widgets (Android, Pro):** a small "money left + next bill" widget and an "upcoming bills" list. They show only what the app last sent (web/widget.js → WidgetData.java); with the PIN lock on they show no amounts.

- **WealthTrack Pro** (one-time Google Play purchase, product ID `wealthtrack_pro`).
  - Pro adds: automatic Google Drive backup, Reports, Excel/CSV export, the debt payoff planner and Smart Budget. Bills, paychecks, expenses, debts, goals, calendar, history and file backup/restore stay free.
  - Locked features never hide or delete data. Restoring an existing Drive backup is always free.
  - Only the Google Play build enforces Pro (`./gradlew bundleRelease -PplayBuild=true`, which CI uses for the `.aab`). The Drive APK and the browser version have everything unlocked, because Play Billing only works for apps installed from Google Play.
  - Code: `web/pro.js` (the single `isPro()` answer), `android/.../ProBilling.java` (Play Billing Library 8). Settings → WealthTrack Pro has Upgrade and Restore purchase.

### Not double counting

- Credit-card bill payments are **not** counted as spending, because the purchases on the card already were (when you enter them as expenses paid with that card).
- Savings goal contributions and transfers between accounts are not spending.
- Expenses paid with a card raise that card's balance.
- Each bill is assigned to exactly one paycheck, so it can't be subtracted twice.

## Starting data

A new install starts **blank**: the built-in categories and an empty Checking account, nothing else. Add your paychecks, bills and debts in the app, or restore a backup.

**Setup wizard.** On a blank install (after the demo, if you looked at it), a short skippable wizard walks you through your checking balance, paychecks, bills (with one-tap presets like Rent and Electric) and credit cards or loans, then shows your next paycheck's plan. Closing it keeps what you entered and it won't come back on its own; **Settings → Your data → Setup wizard** runs it again (`web/setup-wizard.js`).

The automated tests use made-up example data from `tests/fixtures/sample-data.js`. It is never included in the app.

Full audit results: [AUDIT-REPORT.md](AUDIT-REPORT.md). Publishing on Google Play: [PLAY-STORE.md](PLAY-STORE.md) (privacy policy in `privacy/`, listing text and images in `store-listing/`).

## Developing

```
wealthtrack/
  web/        the app: index.html, styles.css, core.js (logic), store.js (IndexedDB+crypto), seed.js, xlsx.js, app.js (UI), setup-wizard.js (first-run setup)
  android/    native WebView wrapper (see android/README.md)
  tests/      core.test.js, pro.test.js (node:test), e2e.js, pro-ui.js (Playwright)
  build.js    bundles web/ into dist/WealthTrack.html
```

Money is always stored as integer cents and parsed from strings, never with floating-point math. Data is kept in three separate layers:

- **templates:** recurring bill definitions, with dated schedule versions
- **instances:** one row per bill per period. The id is `i_<template>_<periodKey>`, so generating a month twice can't create duplicates.
- **payments:** voided instead of deleted

```
node --test wealthtrack/tests/core.test.js wealthtrack/tests/security.test.js   # unit tests
node wealthtrack/tests/e2e.js          # browser smoke test (needs playwright)
node wealthtrack/tests/functional.js   # clicks through every screen and action
node wealthtrack/tests/mobile.js       # phone layout at 360/390/412px, tablet, landscape
node wealthtrack/tests/security.js     # XSS / malicious-restore checks
node wealthtrack/tests/perf.js         # speed on 10 years of data
node wealthtrack/build.js                      # rebuild dist/WealthTrack.html
BUILD_TYPE=release wealthtrack/android/build-apk.sh   # rebuild the APK (needs Android SDK)
```
