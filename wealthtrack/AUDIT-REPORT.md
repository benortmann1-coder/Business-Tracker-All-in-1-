# WealthTrack QA, Security & Performance Audit (Nov 6 2026)

**What was covered:** everything in `wealthtrack/`:

- the web app: `app.js`, `core.js`, `store.js`, `xlsx.js`, `seed.js`, `styles.css`
- the Android wrapper
- the CI workflow

The Bevelry Flutter app in `app/` was **not** audited. The only Bevelry item here is its CI failure (B1).

**How it was tested:**

- automated unit tests in Node
- automated browser tests in Chromium through Playwright, at desktop size and at phone sizes of 360, 390 and 412 px, plus a tablet and a landscape phone
- an Android release build, with its compiled settings checked using aapt

There was **no real phone or emulator**.

## Summary

| | Count |
|---|---|
| Confirmed issues | 47 |
| Fixed and verified | 44 |
| Still open or needing your decision | 3 (B1, R3, R4) |
| Security issues found | 16 (S1–S14, R1, R2), all fixed |
| Recommendations, not bugs | 2 (R5, R6) |
| Automated checks, final run | **all pass**: unit 33/33, end-to-end 24/24, functional 128/128, security browser 27/27, mobile (5 screen sizes × every screen and dialog) |

### Speed

The core agent built a 10-year test dataset: 7,198 bills, 7,080 payments and 5,000 expenses. On it:

| Operation | Before | After |
|---|---|---|
| Dashboard | 26 s | 20 ms |
| Overdue list | 12.6 s | 12 ms |
| 60-day projection | 12.8 s | 16 ms |
| Monthly summary | 112 ms | 2.6 ms |
| Paycheck plan | 68 ms | 1.2 ms |

## Bug list

### App behavior (`app.js`)
| ID | Severity | Location | Description | Root cause | Fix | Verification | Status |
|---|---|---|---|---|---|---|---|
| A1 | High | Paychecks screen `viewPaychecks` | Screen crashed ("Something went wrong") when no paycheck existed near today, e.g. after every job had ended | `paycheckPlan(undefined)` was called with no guard | Guarded, with an empty state that offers to edit each job | functional: "planner with all jobs ended does not crash" | Fixed |
| A2 | Medium | Expense form "New category" | Used the browser's built-in `prompt()`, which can silently fail inside the Android WebView | Native browser dialog | Replaced with the app's own dialog; name capped at 40 characters; no duplicate options | functional: "new category via in-app dialog", "no native dialogs" | Fixed |
| A3 | Medium | `modal()` submit | Slow, behind-the-scenes forms (restore, backup, PIN lock, erase) could run twice on a double tap, and their errors were never shown | Submit didn't wait for those actions to finish or catch their errors | Second submit blocked while busy, button disabled, errors shown | functional: restore, lock, erase flows | Fixed |
| A4 | Low | Startup | An app left open past midnight kept showing the old day: bills didn't turn overdue and the next month's bills weren't created | Upkeep only ran when the app was reopened or brought back to the front | Checks once a minute for a new day | Code review (needs a clock change to test) | Fixed |
| A5 | Low | PIN lock and Erase dialogs | Entering a wrong confirmation closed the dialog | These forms closed themselves on bad input | They now stay open | functional: "short PIN rejected, dialog stays" | Fixed |
| A6 | Low | Form error handling | Ordinary input errors (e.g. missing amount) were logged as app errors | Every thrown error was logged | Input errors use their own error type and aren't logged | functional: "no console errors" | Fixed |
| A7 | Medium | Syncing two open tabs (`onRemoteChange`) | An edit made in this tab while it was reloading another tab's changes could vanish from the screen until restart | Reloaded data replaced the screen's copy even though a write from this tab was still waiting to be saved | Reload is retried until no writes are waiting | functional plus code review | Fixed |

### Phone layout (`styles.css`, small `app.js` markup changes)
| ID | Severity | Location | Description | Fix | Status |
|---|---|---|---|---|---|
| M1 | High | All text boxes and dropdowns | Text under 16px made iPhones zoom the whole page when you tapped a field | 16px text on screens up to 900px wide | Fixed |
| M2 | Medium | Small buttons, chips, ⋯ menus, Mark paid | Touch targets were 32–38px | At least 40px everywhere; Mark paid and menu rows are 44px | Fixed |
| M3 | Medium | Toast messages | They covered bills and buttons above the bottom navigation bar | Shown at the top of the screen on phones | Fixed |
| M4 | Medium | Paycheck planner bill rows | Columns were jumbled on phones | Rows rearranged for phones | Fixed |
| M5 | Low | Payoff table, Reports yearly table | Cut off at 360px | Tighter cells; the yearly table scrolls sideways with the month column pinned | Fixed |
| M6 | Low | Tab buttons, "only this month / future months" switch | Wrapped badly | Equal-width tabs | Fixed |
| M7 | Low | Dialog close (×) button | Shrank next to long titles | Fixed size | Fixed |

Checked by `tests/mobile.js`. At 360, 390 and 412 px, a tablet and a landscape phone, on every screen and dialog, it fails on any of: sideways scrolling, touch targets under 40px, text boxes under 16px, or submit buttons off screen.

### Money logic and calculations (`core.js`)
| ID | Severity | Location | Description | Fix | Status |
|---|---|---|---|---|---|
| CORE-14 | Critical | `instPaid`, `hasPayments`, month lookups, `debtCharges`, `paychecksBetween`, … | Every "is this bill paid?" check scanned all payments, so the app got slower the more history you had (26 s dashboard at 10 years) | Payments-by-bill and bills-by-month indexes, updated on every save, plus a cache cleared on each write | Fixed |
| CORE-07 | High | `reactivateTemplate` | Reactivating a cancelled bill brought back the months it had been cancelled for | The cancelled gap is kept as a pause | Fixed |
| CORE-09 | Medium | `billsForPaycheck` | A bill moved by hand to a paycheck more than 120 days away disappeared from both plans | Manually assigned bills are always included | Fixed |
| CORE-10 | Medium | `projection` | Overdue bills charged to a credit card were subtracted from cash | Treated the same as upcoming card-charged bills | Fixed |
| CORE-12 | Medium | `budgetStatus` | Budget rollover stopped after 12 months | Rollover adds up from the budget's start month | Fixed |
| CORE-15 | Low | `updateTemplate` | A skipped or reassigned month kept its old due date after a "this and all future months" edit | Due date follows the edit | Fixed |
| CORE-01 | Medium | `parseMoney` | Amounts too large to store exactly were accepted | Over $9.99 trillion is rejected | Fixed |
| CORE-02 | Low | `parseMoney` | "1,2,3" was accepted as $123 | Commas only allowed as thousands separators | Fixed |
| CORE-03 | Low | `fmt` | "-$0.00" was displayed | No minus sign on zero | Fixed |
| CORE-04 | Low | `parseMoney` | Could produce a "negative zero" internally | Converted to plain 0 | Fixed |
| CORE-05 | Medium | `recordPayment`, `addExpense` | Fractions of a cent were accepted | Whole cents required | Fixed |
| CORE-06 | Low | `markPaid` | Crashed on a bill ID that doesn't exist | Does nothing instead | Fixed |
| CORE-08 | Low | `resumeTemplate` | Pausing and resuming on the same day left an empty pause behind | Empty pause dropped | Fixed |
| CORE-11 | Low | `goalProjection` | Goal progress could go below 0% | Floored at 0 | Fixed |
| CORE-13 | Low | `transactions` | Crashed on extra income with no type | Default type added | Fixed |

Each of these has a regression test in `tests/core.test.js` (29 tests). Speed is checked by `tests/perf.js`.

### Security, storage and Android
| ID | Severity | Location | Description | Fix | Status |
|---|---|---|---|---|---|
| S1 | High | Receipt viewer and expense form | A crafted backup could run its own script through a fake receipt image | Only real image data (PNG/JPEG/WebP/GIF) accepted | Fixed |
| S2 | High | Category colors | A crafted color value could inject HTML | Only `#rrggbb` colors, checked both on display and on restore | Fixed |
| S3 | Medium | Account and debt types, status labels, date filters | Some values were shown without escaping | Escaped; saved screen settings checked on load | Fixed |
| S4 | High | Restore | A malformed or malicious backup could break the app | Every record checked and cleaned; bad ones listed and skipped; newer-format backups refused; your old data is put back if a restore fails | Fixed |
| S5 | Medium | Loading data | A record named `__proto__` could tamper with how the app's objects behave | Such records rejected | Fixed |
| S6 | High | Saving | A failed save (e.g. storage full) was dropped and never retried | Retried, with a clear "storage full" message | Fixed |
| S7 | Medium | Turning on the PIN lock | A crash partway through could leave the data encrypted with no way to read it | Steps reordered and run one at a time | Fixed |
| S8 | Low | PIN key strength | Key stretching was below current guidance | 600,000 rounds; older locks and backups still open | Fixed |
| S9 | Medium | Two open tabs | One tab could save outdated data over the other's changes | Tabs notify each other and reload (see A7) | Fixed |
| S10 | Medium | Startup | A damaged database left you at a dead end | Recovery screen: download raw data, retry, or erase | Fixed |
| S11 | Medium | CSV export | Text starting with `=`, `+`, `-` or `@` would run as a formula in Excel | Such text gets an apostrophe in front | Fixed |
| S12 | Medium | Android settings | Financial data was included in Google cloud backup and phone-to-phone transfer | Both turned off; unencrypted network traffic blocked | Fixed |
| S13 | Medium | Android WebView and bridge | The bridge answered any page, and any kind of link could open externally | Only the bundled app page can use the bridge; network blocked; only http(s), mailto and tel links open; file names and sizes checked | Fixed |
| S14 | Low | Android reminders | No limit on how many alarms were scheduled, and bill names and amounts appeared on the lock screen | Capped at 300; the lock screen shows a generic message | Fixed |
| R1 | Medium | Shipped APK | The debug build lets anyone with USB access to the phone read the app's data | The shipped `dist/WealthTrack.apk` and CI now use the **release** build; confirmed it isn't debuggable and backup is off | Fixed |
| R2 | Medium | PIN lock | A 4-digit PIN can be guessed quickly by someone with a copy of the data | At least 6 characters required | Fixed |
| R3 | Low | PIN lock | The app doesn't re-lock while it stays open | Needs a decision: auto-lock after time away? | Needs review |
| R4 | Low | Encrypted storage | One unreadable encrypted record stops startup (the recovery screen appears) | Option: skip and report bad records instead | Needs review |
| R5 | Info | CI and dependencies | GitHub Actions are referenced by tag, not pinned to a fixed version; androidx libraries are a little out of date | Recommendation | Open |
| R6 | Info | Browser version | Browser storage has no extra protection unless the PIN lock is on | Documented | Open |
| B1 | n/a (not WealthTrack) | Bevelry `Build APK` CI job | `flutter pub get` fails: `intl ^0.19.0` conflicts with Flutter's `intl ^0.20.3` | Also fails on the base branch. One-line fix proposed; waiting for approval to change Bevelry | Unresolved |

Checked by `tests/security.test.js` (CSV and Excel escaping, Excel files open in openpyxl) and `tests/security.js` (script-injection attempts in every field, malicious restores, prototype tampering, recovery screen). Run against the code from before the fixes, these tests fail, so they really detect the problems.

## What was tested
- **Every screen and action** (`tests/functional.js`, 128 checks):
  - **Bills:** add a bill with each frequency; invalid input; long or special-character text; Mark paid and Undo; double-click; partial payment and overpayment; void a payment.
  - **Editing bills:** edit this month only or all future months; move a due date; skip and unskip; choose a paycheck; search, filter and sort.
  - **Monthly actions:** generate next month twice (no duplicates); reset a month (typing confirmation, payments voided not erased).
  - **Recurring bills:** pause, resume, cancel, reactivate, delete; the subscriptions list.
  - **Paychecks:** mark received with the real amount, undo, move a bill between checks, set-asides, a second job paid twice a month, bonuses, all jobs ended.
  - **Expenses:** add, edit, delete, search; charged to a card; recorded as a bill payment; duplicate warning; new category; receipt upload and view.
  - **Debt:** add a debt with its bill; extra payment, charge, statement balance, history, void; payoff calculator with bad input.
  - **Budgets:** add, remove, rollover, over-budget alert.
  - **Goals:** contribute and withdraw.
  - **Calendar:** month grid, day popup, add from a day, drag a bill to a new date, next month.
  - **Reports and history:** reports with month drill-down; history filter and search.
  - **Dashboard:** set the balance.
  - **Settings:** theme, hide and reorder dashboard widgets, accounts, transfers, categories, reminder settings.
  - **Data:** Excel, CSV, backup, encrypted backup, data check; data still there after restart; restore with wrong and right password; rejecting a file that isn't a backup.
  - **PIN lock:** reject a short PIN; lock and reload; data is not loaded before unlocking; wrong PIN rejected; data encrypted at rest; turn the lock off.
  - **Phone navigation:** bottom navigation, the More menu, the + button, and the Android back button (closes the dialog, then goes to the dashboard, then exits).
  - **Erase:** erase everything (backup downloaded first); every screen on a blank app.
- **Edge cases:** empty, invalid, huge, comma-misplaced and fraction-of-a-cent amounts; 300-character names containing HTML; double clicks; double submits; restarts; jumping years ahead and back; month-end and Feb 29 dates; storage-full errors (simulated); malicious backups.

## Not tested (no tools or environment for it)
- **The APK on a real phone or emulator:** WebView behavior, the bridge (saving to Downloads, sharing, file picker, camera), reminder alarms, reboot rescheduling, the on-screen keyboard and screen notches.
- **Actually running out of storage or memory:** errors were simulated instead.
- **Two tabs editing at the same time:** the code is reviewed, but not run in a test.
- **Changing the device's clock or time zone while the app is open:** the code was reviewed.
- **Accounts, login, password recovery, cloud sync and outside services:** these don't exist. The app is offline and stores data only on the device by design. The optional PIN lock is the only authentication.
- **Screen readers and measured color contrast.**
- **The Bevelry Flutter app:** no Flutter tools here.

## Recommendations
1. Decide on R3, auto-lock after N minutes in the background, and on R4, skipping corrupt encrypted records.
2. Approve the one-line Bevelry fix (B1) so its CI goes green.
3. Before publishing to the Play Store, sign with your own release keystore. The current release APK is signed with a debug key, which is fine for installing yourself.
4. Install the APK on your phone and check the file-save, reminder and camera flows, which couldn't be tested here.
