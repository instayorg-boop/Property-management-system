# 02 — End-to-end workflows

Each workflow is traced from trigger to result. File:line citations point to the code that does the work. "Legacy tenant" means a tenant with at least one `ledger_entries` row where `event_type IS NULL`. The new balance engine ignores such tenants (`sync_tenant_balance_if_new_model`, `20260925000000_sync_balance_respects_penalty_waiver.sql:40-48`). **Every tenant whose deposit was recorded at onboarding is a legacy tenant** (W2), so in practice that means most real tenants.

---

## W1. Onboarding a landlord — **BROKEN** (High)
**Trace:** marketing CTA → `/get-started` → *(no route, blank page)*. If reached: `GetStarted.tsx:35` → `signUp()` (`src/lib/auth.ts:6-14`, stores `property_name` in user metadata) → email confirmation → sign in → first dashboard load → `getOrCreatePrimaryProperty()` (`src/lib/properties.ts:55+`) → `getOrCreateSettings()` (`src/lib/settingsApi.ts:4-57`).

- **Works:** Supabase auth, RLS-scoped property creation, 30-day inactivity sign-out (`AuthContext.tsx:20-44`).
- **Broken:** `/get-started` is not routed (see 01 §2).
- **Wrong defaults on every new account** (`settingsApi.ts:16-55`):
  - `payment_methods` contains a fake MTN number `0977 000 111` that can show on invoices/portal.
  - `due_day: 30`.
  - `subscription_plan: "Pro"`, which matches no tier.
  - `account_email: ""`, so the landlord sets the address their own withdrawal OTPs go to.
- **Live (07 L5): first login fails for every new landlord.** `settings` has no `late_fee_*` columns because migration `20261009010000` was never applied, and the insert at `settingsApi.ts:30-34` includes them.
- **Live:** `slug` **is** unique in the DB, so the scenario below becomes "second landlord with the same property name gets an error", not a lookup collision.
- **Risk (code):** `slug` is `slugify(name)` with no uniqueness handling in code (`properties.ts:17-19`). I can't see whether the DB has a unique constraint (base schema isn't in the repo). If it doesn't, two "Sunrise Lodge" landlords break each other's portal lookups (`.eq("slug").maybeSingle()` errors on 2 rows, `pay-portal-collect-payment/index.ts:138`).
- **Missing:** a support or admin view of landlords. Single property per account only (`getOrCreatePrimaryProperty` returns `existing[0]`).
- **Blocker:** add the route, fix the defaults, and confirm the slug constraint.

## W2. Adding property / units / tenants — **PARTIAL** (High for tenants, Low for rooms)
**Trace:** AddTenant form → `addTenant()` (`TenantsContext.tsx:203-225`) inserts `tenants` with `status:"unpaid", owedAmount: rentDue` (`AddTenant.tsx:1100-1101`). After the insert commits, the following run as fire-and-forget calls from the browser:
- onboarding SMS;
- **deposit ledger row**;
- first-rent `logPayment`;
- document uploads (`AddTenant.tsx:1129-1172`).

- **Works:** tenant insert ordering (awaits FK parent), portal token generation, onboarding SMS.
- **Broken:** the deposit is written with `addLedgerEntry` (`AddTenant.tsx:1142-1156` → `src/lib/tenants.ts:567-582`), which writes **no `event_type`**. That single row makes the tenant "legacy" forever. From that moment their balance is never maintained server-side (W3, W5, W6).
- **Broken:** deposits are mixed into the rent ledger as a `status:"paid"` row, so "how much did X pay" queries and assistant answers count deposit as rent.
- **Risk:** `deleteTenant` hard-deletes (`TenantsContext.tsx:273-279` → `tenants.ts:562`). `collections.tenant_id` is `on delete cascade` (`20260908060000_collections.sql:16`), so **real mobile-money payment records are destroyed**. If those collections were unclaimed, they also vanish from payout availability (the landlord loses money that IPM holds).
- **Rooms:** `RoomsContext`/`rooms.ts` exist and are RLS-scoped. Not deeply reviewed; 546 lines of uncommitted changes in `Rooms.tsx`.

## W3. Rent due → charge → reminder SMS — **BROKEN** (High)
**Trace:**
1. Cron 22:05 UTC → `generate-rent-charges` → for every active tenant, `generateRentCharge()` inserts one `event_type='charge'` row per month, idempotent by key (`_shared/generateRentCharge.ts:140-211`).
2. Cron 06:00 UTC → `send-rent-reminders` → pre-due SMS on `due_date - reminder_lead_days`; escalation SMS to guardian when `days_overdue >= escalation_days`.

- **Works:** charge idempotency (unique key and label check), proration, Lusaka-timezone period logic, a reminder sent at most once per period (`reminder_log` unique), and a daily SMS cap.
- **Broken (core):** the charge generator **does not change `tenants.owed_amount`** (`generateRentCharge.ts:6-7`). For legacy tenants the follow-up sync is a no-op (`:201-208`). For a legacy tenant who paid last month:
  - `owed_amount` stays 0 and `status` stays `paid`;
  - the Rent page shows them **Paid** for the new month (`Rent.tsx:104-106` uses live `t.status`);
  - the portal says *"There's nothing due to pay right now"* (`pay-portal-collect-payment/index.ts:192-197`);
  - and the reminder is **skipped** because of `if (owed_amount <= 0) continue` (`send-rent-reminders/index.ts:119`).

  Nothing else in the repo rolls a legacy balance forward. I searched every writer of `owed_amount`: only browser code, the reconcile path and the new-model sync write it.
- **Broken:** escalation reads `tenants.days_overdue`. Nothing advances that column daily (see W6), so escalations effectively never fire. The team already hit this: `20261003010000_todays_tasks_step2_sync.sql:16-19` ("Bupe Chola read days_overdue = 0 while … 23 days" overdue). They fixed the task board but not reminders, penalties or the portal.
- **Bug:** the reminder quotes `plan.amount` (this month's rent), not the actual balance including arrears.
- **Bug:** due_day 1 with `reminder_lead_days > 0` means the reminder date falls in the previous month, so it never matches.
- **Config risk:** both crons do nothing unless `cron_secret` and `functions_base_url` were added to vault by hand (`20260928010000:6-16`). If `AT_API_KEY` is unset, SMS sends are **logged as `sent`** with no delivery (`_shared/sms.ts:35-38`).
- **Exact blocker:** a single balance model plus a daily sync job (v1 items 4–5).

## W4. Tenant pays via link — **PARTIAL, with a money-loss bug** (High)
**Trace:** SMS link `/p/:token` → `pay-portal-resolve-token` (token is the identity; no OTP) → `/pay` → `pay-portal-collect-payment`:
1. Validates the token (`:127-136`).
2. Computes `owedBefore` = `owed_amount` + live penalty (`:173-192`).
3. Clamps the amount, with a K50 floor.
4. Adds the fee band (`:200-205`).
5. Does a FIFO `line_items` snapshot (`:207-226`).
6. Inserts `collections` as `pending` (`:228-242`).
7. POSTs to Lenco (`:275-290`) and stores `pay-offline`.

The tenant approves on their phone. Then the webhook or polling runs W5.

- **Works:** server-side amount clamp (the client can't inflate the amount), the fee band keyed on rent (no split-to-lower-band), a `DEV_MODE_PAYMENTS` gate, and a clear tenant error for "nothing due".
- **Money loss:** if the Lenco POST throws or times out **after Lenco accepted it**, the `catch` marks the collection `failed` (`:328-329`). When `collection.successful` arrives later, the webhook's guard `.in("status", ["pending","pay-offline"])` matches 0 rows and skips reconciliation (`lenco-webhook/index.ts:146-162`). Polling also returns early on `failed` (`pay-portal-check-collection/index.ts:105-110`). Result: **the tenant paid, IPM holds the money, and the tenant is never credited.** The same happens if `lencoResponse.json()` throws on a non-JSON 5xx.
- **Wrong:** the penalty portion of `owedBefore` has no ledger row to allocate to. It falls through to a `"Rent paid in advance"` line item (`:224-226`). For new-model tenants, the payment drives the balance negative, so the "penalty" comes back as credit next month (see M6).
- **Security:** see 03 §S1 (token = permanent session, `pay_portal_log_payment_v2` reachable).

### W4b. Landlord logs a cash / manual payment — **PARTIAL** (High)
**Trace:** `LogPaymentModal` → `logPayments()` (`TenantsContext.tsx:324-551`) writes a new-model `payment` event. Then `sync_tenant_balance_if_new_model`. For legacy tenants it falls back to **writing an absolute `owed_amount` computed in the browser** from its cached snapshot (`:531-533`).
- **Race:** if a Lenco payment reconciled after the page loaded, the browser's absolute write **overwrites** the webhook's decrement. The webhook's compare-and-swap protects only itself (`reconcileCollection.ts:39-81`).
- **Overpayment is lost:** `remaining = max(0, owedBefore - amount)` (`:366`). There's "no tenant is in credit concept" (`:564-566`), so extra cash disappears from the balance.
- **Offline:** queued payments carry `baseUpdatedAt: null` (`:502`), so conflict detection is off. Replay writes the stale absolute `_tenantPatch` (`src/lib/offline/sync.ts:168-172`). The only guard is "skip if server owed ≤ 0" (`:142-144`).
- Errors show a toast. The optimistic UI state is **not rolled back** on failure (`:545-548`), so the screen shows a payment that never saved until the next refetch.

## W5. Payment reconciliation — **PARTIAL** (High)
**Trace:** `lenco-webhook` (HMAC verified, `:86-97`) or `pay-portal-check-collection` → conditional update of `collections` to `successful` → `reconcileSuccessfulCollection()` (`_shared/reconcileCollection.ts:195-262`):
1. Increments `property_balances`.
2. Either a new-model `payment` event plus sync (idempotency key `lenco_payment:<collection id>`), or legacy `paid_amount` updates plus CAS on `owed_amount`.
3. Sends the receipt SMS.

- **Works:** exactly-once guard via conditional status update, a shared implementation for webhook and polling, idempotency key on new-model inserts, and CAS on legacy balance writes. There is a unit test (`_shared/__tests__/reconcileCollection.test.ts`).
- **Not atomic:** the status flip and 3–6 writes run as separate HTTP calls with no transaction. Every failure is only `console.error`'d (`:71-74, :171-173, :179-181, :204-206`). If the function dies after the status flip, Lenco's retry is (correctly) treated as a duplicate and skipped, so **the payment is permanently half-applied** with no alert.
- **Silent give-up:** legacy CAS stops after 5 attempts and only logs (`:80`).
- **Legacy line items** are re-read and written without a lock (`:217-224`).
- **No sweep:** a collection stuck in `pay-offline` (webhook not registered, tenant closed the tab) is resolved only when the tenant reopens the page and polls. No cron re-queries it.
- **No wallet reconciliation:** nothing compares the Lenco wallet balance with `sum(unclaimed successful collections)`.

## W6. Penalty accrual — **BROKEN** (High)
**Design:** penalties are never stored. They're computed live as `days_overdue × rate` in three hand-synced copies:
- `invoiceUtils.ts:117-145`;
- `payPortal.ts`;
- `pay-portal-collect-payment/index.ts:173-191`.

- **Broken:** `days_overdue` is only written:
  - by the browser (legacy tenants);
  - by `sync_tenant_balance_if_new_model`, which only runs **when a ledger event happens** for new-model tenants.

  No daily job recomputes it. The daily charge cron returns `already_exists` before reaching the sync (`generateRentCharge.ts:174-176`). So penalties freeze at whatever value was last written, usually 0.
- **Wrong when it does run:** days are counted from the **most recent** open charge (`order by due_date desc`, `20260925000000:68-70`). A tenant three months behind is charged as if one month late.
- **Waiver:** any waiver fully resets the overdue clock (`:80-101`). There are no partial waivers.
- **Audit:** no record exists of "K35 penalty charged on date X". The penalty paid via the portal is recorded as "Rent paid in advance".
- **Recommendation:** v1 ships with automatic penalties **off**, and landlords add late fees as a manual charge (already built: `addAdjustment`). Materialised daily penalty events come later.

## W7. Deposit ledger — **NOT STARTED as a ledger; BROKEN as implemented** (High)
- Deposit is 5 columns on `tenants` (`deposit_amount/date/method/status/resolution_note`, `src/lib/tenants.ts:89-110`). It is set at move-out via `moveOutTenant` (`TenantsContext.tsx:281-295`), which overwrites status and note.
- There's no transaction history, no refund amount, no actor, and no link to a payout or refund transfer.
- The "collected" deposit is a legacy row in the **rent** ledger (W2), which poisons the balance model.
- **v1 minimum:** move the deposit out of `ledger_entries` into its own small table (held / refunded / forfeited, amount, date, note, user).

## W8. Landlord payout — **BROKEN (can pay twice)** (High)
**Trace (on-demand):**
1. Withdraw → `request-withdrawal-otp` (email) → `verify-withdrawal-otp` → `lenco-payout`.
2. `lenco-payout` burns the confirmation token (`:147-162`), loads the recipient under RLS, and inserts a `payouts` row as `pending`.
3. It calls `pay_portal_claim_payout_collections` (`FOR UPDATE SKIP LOCKED`, `20261003030000:52-111`).
4. Fee = Lenco tier + K5. It fetches `accounts[0]` and POSTs the transfer, then sets the status to `processing`.
5. The webhook or `check-payout-status` sets `successful`/`failed`; a failure releases the collections.

**Scheduled:** the same, minus the OTP and markup, cron 06:10 UTC on `settings.payout_day` (`pay-portal-scheduled-payouts`).

- **Works:** amount is derived from real unclaimed collections, never the request body; atomic claim; OTP token is single-use and purpose-scoped; in-flight check on the scheduled path.
- **Double pay #1:** a timeout or non-JSON response **after Lenco accepted the transfer** → `catch` marks the payout failed **and releases the collections** (`lenco-payout/index.ts:320-322`, `pay-portal-scheduled-payouts/index.ts:209-211`). The next payout sends the same rent again. The webhook can't correct it (its guard excludes `failed`, `lenco-webhook/index.ts:126`).
- **Double pay #2 (exploitable):** `pay_portal_release_payout_collections` checks ownership but **not status** (`20261003030000:113-145`). It is callable by any signed-in landlord over REST, since no `REVOKE` exists for it. A landlord can release a **successful** payout's collections and withdraw them again. The wallet is pooled across all landlords (`accountId = accountsJson.data[0].id`, `lenco-payout/index.ts:261`), so **other landlords' money funds it.**
- **Unprotected rows:** landlords can also `UPDATE`/`DELETE` their `payouts` rows directly (`20260908020000_payouts.sql:34-37`), e.g. flip `processing`→`failed` and then release.
- **Stuck:** no sweep for payouts stuck in `pending`/`processing`. `check-payout-status` is landlord-triggered only.
- **Unchecked balance:** `pay_portal_increment_property_balance` is `SECURITY DEFINER` with **no caller check and no revoke**, so anyone can call it (`20261003030000:31-43`). Impact is low today because nothing user-facing reads `property_balances`, but it should be locked.
- **Exact blocker:** v1 item 2.

## W9. Monthly report — **BROKEN (numbers disagree)** (High)
There are three different definitions of "rent collected":
1. **Dashboard / in-app reports**, via `useCollectedRent()` (`TenantsContext.tsx:801-814`): `status==='paid'` counts **full rent** whether or not it was paid this month, and `partial` counts `ledger[0].paidAmount` (an arbitrary first row).
2. **PDF/CSV `generate-report`** (`index.ts:379-387`): `sum(collections.amount)`, which **includes IPM's fee** and **excludes all cash and manual payments**.
3. **Assistant** `assistant_get_payouts_summary` says in the migration itself that it "can go negative/stale" (`20261003030000:147-152`).

The report page also fails to build (`ReportGenerate.tsx:163`). Owner payout statement, bed rent roll and payroll reports are disabled.
- **Exact blocker:** one ledger-derived monthly statement (v1 item 8).

## W10. Subscription billing (IPM charging landlords) — **NOT STARTED** (High)
Only constants (`src/lib/pricing.ts:17-22`) and a read-only Settings panel ("Set by IPM at onboarding — contact us", `Settings.tsx:318-319`). Nothing invoices, collects, suspends or meters beds. **v1 recommendation:** bill manually (your own invoice plus MoMo/bank transfer) and set `subscription_plan` by SQL. Don't build this before launch.

---

## Money-correctness register

| ID | Where money goes wrong | Severity | Evidence | Conf. |
|---|---|---|---|---|
| M0 | **Live:** reclassified, already-paid rent rows counted as owed. ~10/20 tenants show K6,000–7,500 instead of 1 month (07 L4) | Critical | live `calculate_tenant_balance` | High |
| M1 | Legacy tenants never re-billed after month 1 (owed stays 0, status stays paid). **Live: only 1/20 tenants is legacy today**, but every new tenant with a recorded deposit joins them | Critical | `generateRentCharge.ts:6-7,201-208`; `send-rent-reminders/index.ts:119`; `Rent.tsx:104-106` | High* |
| M2 | Tenant (or anyone with their link) can zero their own balance with no money | Critical | 03 §S1 | High |
| M3 | Payout released after Lenco accepted → same rent paid twice | Critical | `lenco-payout/index.ts:320-322`; `pay-portal-scheduled-payouts/index.ts:209-211` | High |
| M4 | Landlord can release a successful payout via RPC and withdraw again from the pooled wallet | Critical | `20261003030000:113-145` (no status check, no revoke) | High* |
| M5 | Collection timed out but succeeded at Lenco → tenant never credited | Critical | `pay-portal-collect-payment/index.ts:328-329`; `lenco-webhook/index.ts:155` | High |
| M6 | Penalty paid via portal stored as "rent paid in advance"; new-model balance goes negative and refunds it as credit | High | `pay-portal-collect-payment/index.ts:192,224-226`; sync writes negative `owed_amount` (`20260925000000:105`) | Med |
| M7 | Reconcile is not atomic; partial failure is permanent and silent | High | `reconcileCollection.ts:195-262` | High |
| M8 | Browser writes an absolute `owed_amount` from a stale snapshot, overwriting webhook credits | High | `TenantsContext.tsx:531-533`; `offline/sync.ts:168-172` | High |
| M9 | Overpayments discarded (no credit balance) | Medium | `TenantsContext.tsx:366,564-566` | High |
| M10 | Hard-deleting a tenant cascades away `collections` (payment proof and unclaimed funds) | High | `20260908060000_collections.sql:16`; `tenants.ts:562` | High |
| M11 | Three different "collected" numbers; report includes IPM fee and omits cash | High | W9 | High |
| M12 | Overdue days counted from latest open charge, not oldest | Medium | `20260925000000:68-70` | High |
| M13 | Fee bands / penalty formula duplicated by hand in 3–5 files | Low | `pricing.ts:1-6`, `pay-portal-collect-payment/index.ts:58-77` | High |
| M14 | Float math in JS with per-file `round2`; penalties `Math.round` to whole kwacha while payments keep ngwee | Low | `pay-portal-collect-payment/index.ts:79-81,187` | High |

\* "High" assumes no dashboard-only trigger or function exists that isn't in the repo. Run the checks in [06-live-db-checks.md](06-live-db-checks.md) to confirm.
