# Phase 7 – Missing Issues & Required Fixes

This document lists each missing or non-compliant item from the Phase 7 spec (Event completion and loyalty reward voucher issuance), **where** it applies in the codebase, and **what** needs to be done.

---

## 1. Scheduler not started (critical)

**Doc:**  
*"Event completion reward job – Triggered: immediately on admin completion or via retry queue if failure"*  
*"Voucher expiry job – Runs daily – Marks expired vouchers as expired"*

**Where:**  
- **File:** `server.js`  
- **Location:** Entire file; `initScheduler()` is never called.

**Current code (server.js, lines 7–13):**
```javascript
async function startServer() {
  try {
    // await setupDatabase();
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
```

**What to do:**
1. Require the scheduler at the top of `server.js`:  
   `const { initScheduler } = require("./src/services/scheduler.service");`
2. After `app.listen(...)` (inside the callback), call `initScheduler();` so that:
   - **Event completion job** runs every hour (cron `0 * * * *`): marks past events completed and issues rewards.
   - **Voucher expiry job** runs daily at midnight (cron `0 0 * * *`): sets `status = 'expired'` for vouchers where `expires_at < NOW()`.
3. Optional: if you use `setupDatabase()`, keep it before `app.listen` as you prefer.

**Result:** Background jobs for auto-completion and voucher expiry actually run.

---

## 2. Reward issuance must check event is completed

**Doc:**  
*"Steps: Check event status == completed"*  
*"Do NOT recalculate booking fees or ledger values. Use ticket counts + reward rate logic only."*

**Where:**  
- **File:** `src/services/reward.service.js`  
- **Function:** `issueRewardsForEvent(eventId, adminId)`  
- **Location:** Start of the function (before line 89: "Calculate rewards first").

**Current code:**  
The function does not verify that the event’s completion status is `'completed'` before issuing vouchers. If it is ever called for a non-completed event (e.g. wrong caller or retry), rewards could be issued too early.

**What to do:**
1. At the **beginning** of `issueRewardsForEvent` (before calling `calculateRewardsForEvent`), query the event:
   ```sql
   SELECT completion_status FROM events WHERE id = $1
   ```
2. If no row or `completion_status !== 'completed'`, return early (e.g. return the same shape as when `ticketsSold === 0` or a clear "not completed" result) and **do not** run the rest of the function (no INSERTs, no audit for rewards_issued).
3. Use the existing client/connection; no need to open a new one if you already have one.

**Result:** Rewards are only issued when the event is completed; retries and misuse do not create vouchers for non-completed events.

---

## 3. Promoter cannot self-complete (per spec)

**Doc:**  
*"Admin-controlled completion is allowed. Promoter cannot self-complete unless explicitly allowed later."*

**Where:**  
- **File:** `src/routes/promoters.routes.js`  
- **Line:** 98  
- **Route:** `POST /events/:eventId/complete` (under `/api/promoters`).

**Current code (promoters.routes.js, line 98):**
```javascript
router.post("/events/:eventId/complete", requireActivePromoter, requireEventOwnership, completeEvent);
```

**What to do (align with spec):**
1. **Remove** the promoter self-complete route: delete the line that registers `POST .../complete` with `completeEvent` in `promoters.routes.js`.
2. **Remove or guard** the promoter `completeEvent` handler in `src/controllers/events.controller.js` (the one that updates `completion_status` and `completed_at` only, **without** calling `issueRewardsForEvent`). Either delete it and stop exporting it, or keep it but unused until you explicitly "allow promoter self-complete" later.
3. Ensure completion is only possible via:
   - **Admin:** `POST /api/admin/events/:eventId/complete` (existing).
   - **System:** hourly job in `scheduler.service.js` (`completePastEvents`).

**Result:** Only admin and the background job can complete events; promoter self-complete is disabled unless you later add a dedicated, documented "allow promoter complete" feature.

---

## 4. Send reward emails when scheduler completes events

**Doc:**  
*"On reward issuance – Send notification to: promoter, guru – Content: event name, voucher amount, expiry date"*

**Where:**  
- **File:** `src/services/scheduler.service.js`  
- **Function:** `completePastEvents()`  
- **Location:** The loop that calls `issueRewardsForEvent(eventId, null)` (around lines 34–41).

**Current code:**  
After `issueRewardsForEvent(eventId, null)` the scheduler does **not** call `sendRewardNotificationEmails`. So when the **system** auto-completes events, promoter and guru do not get the "reward issued" email.

**What to do:**
1. In `scheduler.service.js`, require the email service at the top:  
   `const { sendRewardNotificationEmails } = require('./email.service');`
2. Inside the `for (const eventId of eventIds)` loop, after a successful `issueRewardsForEvent(eventId, null)`:
   - Capture the return value: `const rewards = await issueRewardsForEvent(eventId, null);`
   - Call `sendRewardNotificationEmails(eventId, rewards)` (same as admin path).
   - Use `.catch(err => console.error('Error sending reward emails:', err))` so email failures do not break the job or duplicate rewards.
3. Keep the rest of the flow unchanged (e.g. still log "Rewards issued for event X").

**Result:** Promoter and guru receive the same "reward issued" notification for system-completed events as they do for admin-completed events.

---

## 5. Use actual expiry in “reward issued” emails

**Doc:**  
*"Expiry date is mandatory – expiry duration comes from config"*

**Where:**  
- **File:** `src/services/email.service.js`  
- **Function:** `sendRewardNotificationEmails(eventId, rewards)`  
- **Location:** Where `expiresAt` is set for the promoter email (around lines 171–174) and for the guru email (around 193–196).

**Current code:**  
Both branches use a **hardcoded** 12 months:  
`const expiresAt = new Date(); expiresAt.setMonth(expiresAt.getMonth() + 12);`  
So the email may show a different expiry than the voucher’s actual `expires_at` (which comes from `voucher_expiry_months` in `reward.service.js`).

**What to do:**
1. **Option A (recommended):** Have `issueRewardsForEvent` return the **actual** `expires_at` used for the vouchers (e.g. add `expiresAt` to the returned object). Then change `sendRewardNotificationEmails(eventId, rewards)` to accept and use `rewards.expiresAt` (or per-owner expiry if you ever have different expiries). Use that when calling `sendRewardVoucherEmail(..., expiresAt: rewards.expiresAt)`.
2. **Option B:** Inside `sendRewardNotificationEmails`, read `voucher_expiry_months` from `system_config` and compute the same expiry (e.g. `new Date()` + that many months) and use it for both promoter and guru emails.

**Result:** The expiry date in the "reward issued" email matches the voucher’s real expiry from config.

---

## 6. Voucher expiry reminder (notification before expiry)

**Doc:**  
*"On voucher expiry reminder – Send reminder before expiry – Timing comes from config (for example X days before expiry)"*

**Where:**  
- **New:** Config, scheduler job, and email.
- **Existing:** `src/db/init.sql` (system_config), `src/services/scheduler.service.js`, `src/services/email.service.js`.

**Current state:**  
There is no config key for “days before expiry”, no job that finds vouchers expiring soon, and no email template or send for “your voucher expires on …”.

**What to do:**

1. **Config**  
   - **File:** `src/db/init.sql`  
   - **Location:** In the `INSERT INTO system_config ...` block (around lines 969–973).  
   - Add a row, e.g.:  
     `('voucher_expiry_reminder_days', '7', 'Send reminder this many days before voucher expires')`  
     with `ON CONFLICT (config_key) DO NOTHING` (or your existing conflict handling).

2. **Email**  
   - **File:** `src/services/email.service.js`  
   - Add a function, e.g. `sendVoucherExpiryReminderEmail({ to, userName, eventTitle, amountPence, expiresAt })`, that sends an email saying the voucher expires on `expiresAt` and (if you like) the amount. Export it.

3. **Job**  
   - **File:** `src/services/scheduler.service.js`  
   - Add a function, e.g. `sendVoucherExpiryReminders()`:
     - Read `voucher_expiry_reminder_days` from `system_config` (default e.g. 7).
     - Find `reward_vouchers` where `status = 'active'` and `expires_at` is between `NOW()` and `NOW() + reminder_days` (e.g. `expires_at::date = (CURRENT_DATE + reminder_days::int)` or equivalent).
     - Optionally add a "reminder_sent_at" or similar on `reward_vouchers` (or a small table) so you send the reminder only once per voucher; if not, you may send once per day until expiry.
     - For each voucher, get owner (promoter/guru) email and name, event title, then call `sendVoucherExpiryReminderEmail(...)`.
   - In `initScheduler()`, schedule this job daily (e.g. same time as voucher expiry or early morning), e.g. `cron.schedule("0 9 * * *", ...)`.

**Result:** Users get a configurable “your voucher expires in X days” email; timing comes from config as required by the doc.

---

## 7. Admin cancel event (optional)

**Doc:**  
*"Optional (only if already in your rules): POST /api/admin/events/:id/cancel – Cancellation logic exists but refunds are not handled in this phase."*

**Where:**  
- **File:** `src/routes/admin.routes.js`  
- **File:** `src/controllers/admin.controller.js`

**Current state:**  
Promoter cancel exists (`POST /api/promoters/events/:eventId/cancel`). Admin cancel for events was not verified.

**What to do (only if you want admin cancel):**
1. If you do **not** have `POST /api/admin/events/:eventId/cancel`:
   - In `admin.routes.js`, add a route, e.g. `router.post("/events/:eventId/cancel", cancelEvent);` (reuse or implement an admin-only cancel).
   - In `admin.controller.js`, implement or reuse a handler that:
     - Ensures the user is admin.
     - Updates the event (e.g. `status = 'cancelled'`, `cancelled_at`, `cancel_reason` from body).
     - Does **not** implement refunds in Phase 7.
2. If you already have admin cancel, ensure it does not do refunds in this phase.

**Result:** Optional admin cancel is available; cancellation logic is clear and refunds are out of scope for Phase 7.

---

## Summary table

| # | Issue | File(s) | Action |
|---|--------|---------|--------|
| 1 | Scheduler not started | `server.js` | Call `initScheduler()` after app listen |
| 2 | Check event completed before issuing rewards | `src/services/reward.service.js` → `issueRewardsForEvent` | At start, require `completion_status === 'completed'`; else return early |
| 3 | Promoter cannot self-complete | `src/routes/promoters.routes.js`, `src/controllers/events.controller.js` | Remove promoter complete route (and optionally handler) |
| 4 | Reward emails on scheduler completion | `src/services/scheduler.service.js` → `completePastEvents` | After `issueRewardsForEvent`, call `sendRewardNotificationEmails` |
| 5 | Actual expiry in issuance emails | `src/services/email.service.js` → `sendRewardNotificationEmails` | Use config or return value for real `expires_at` in emails |
| 6 | Voucher expiry reminder | `system_config`, `email.service.js`, `scheduler.service.js` | Config key, reminder email, daily job with configurable days |
| 7 | Admin cancel (optional) | `admin.routes.js`, `admin.controller.js` | Add admin cancel route/handler if desired; no refunds in Phase 7 |

---

## Definition of done (Phase 7) after fixes

- Admin can mark events as completed.  
- Reward issuance runs only after completion (and only when event is completed).  
- Reward vouchers are issued exactly once per event per owner.  
- Vouchers have expiry and status lifecycle.  
- Promoter and guru can view vouchers.  
- Notifications are sent on issuance (admin and system completion) and before expiry (reminder).  
- Retry does not duplicate rewards.  
- Promoter cannot self-complete unless you later add an explicit, documented exception.
