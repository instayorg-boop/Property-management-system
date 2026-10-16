# Frontend audit

*2026-10-14 · branch `shadcn-ui-migration-wip` @ `704f2d4` (+3 uncommitted files) · static analysis plus `npm run build` · no code changed. Statuses are from reading code, not clicking through a browser. One read-only DB query (foreign keys on `tenants`) was used for §7.*

**Status key:**
- **WORKS:** routed, renders, and its main action is wired up.
- **BROKEN:** routed, but its main action fails or shows wrong data.
- **DEAD LINK:** something in the UI points to a path, anchor or slug that doesn't exist, or a button has no action.
- **UNROUTED:** a page file exists but no route reaches it.

`App.tsx` has **no catch-all route**, so any unknown path renders a blank page.

---

## 1. Routes and pages

### Marketing / auth (`src/App.tsx:76-91`)
| Path | Page | Status | Notes |
|---|---|---|---|
| `/` | Landing | WORKS, with dead CTAs | **"Book Free Demo"** button has no `onClick`/link (`src/components/Hero.tsx:43-48`). Pricing cards' **"Talk to us"** buttons have none either (`src/components/PricingSection.tsx:247-258`). |
| (nav, every marketing page) | Nav | DEAD LINK | Desktop **"Book Free Demo"** (`src/components/Nav.tsx:198-210`) has no action. The mobile one (`:273-288`) only closes the menu. |
| `/pricing` | Pricing | WORKS, with dead CTAs | "Talk to us" buttons have no action (`src/pages/Pricing.tsx:456-466`). |
| `/how-it-works` | HowItWorks | WORKS, with a dead CTA | Links to `/get-started` (`:48`). |
| `/features/:slug` | FeatureDetail | WORKS for `rent-collection, rooms-occupancy, tenants, reports, payroll` | Unknown slugs redirect to `/` (`FeatureDetail.tsx:20`). |
| — | FeatureShowcase card → `/features/invoicing` | DEAD LINK | No `invoicing` slug in `src/data/features.ts`, so it silently bounces to `/` (`FeatureShowcase.tsx:51`). |
| — | FeatureShowcase card → `/features/payroll` | WORKS but misleading | Payroll is hidden from the product (`FeatureShowcase.tsx:56`). |
| `/about` | About | WORKS | |
| `/contact` | Contact | WORKS | Form opens WhatsApp (`Contact.tsx:43+`). Brand is "Instant Manage" / `hello@instantmanage.com` (`:23`). |
| `/careers`, `/help`, `/docs`, `/status` | stubs | WORKS (stub) | `Docs.tsx:4-7` advertises a `/v1/...` public API that doesn't exist. |
| `/privacy`, `/terms` | stubs (35 lines) | WORKS (stub) | Not launch-grade legal text. |
| Footer → `/faq` | — | DEAD LINK | No route, so a blank page (`Footer.tsx:12`). |
| Footer → `/#features` | — | DEAD LINK (anchor) | No element with `id="features"` on Landing (`Footer.tsx:9`). |
| `/get-started` | `GetStarted.tsx` | **UNROUTED** | Linked from `CTABanner.tsx:24`, `Compare.tsx:91`, `HowItWorks.tsx:48`, and those land on a blank page. **There is no way to sign up.** |
| `/sign-in`, `/login` | SignIn | WORKS | No link to sign-up. |
| `/forgot-password`, `/reset-password` | — | WORKS | |

### Tenant portal (`App.tsx:92-104`)
| Path | Status | Notes |
|---|---|---|
| `/p/:token` | WORKS | Shows balance from `owed_amount` + live penalty. Live DB balances are inflated (07 L4). |
| `/p/:token/pay` | WORKS, with wrong messaging on failure | See §8. |
| `/p/:token/success`, `/failed` | WORKS | `/failed` claims "No amount was charged" even on timeouts (§8). |
| `/p/:token/history`, `/history/:entryKey`, `/documents`, `/maintenance` | WORKS | |
| `/p/:token/statements` | WORKS (redirect to history) | |

### Landlord dashboard (`App.tsx:106-139`, behind `RequireAuth`)
| Path | Status | Notes |
|---|---|---|
| `/dashboard` | WORKS, wrong numbers | "Total collected" = `useCollectedRent()` (§4). |
| `/tasks`, `/notifications` | WORKS | Tasks depend on stale `days_overdue`. |
| `/rent` | WORKS, wrong numbers | Current-month status = live `tenants.status` (§4). `?action=log-payment` is handled (`Rent.tsx:167`). |
| `/tenants`, `/tenants/new`, `/tenants/:code`, `/tenants/:code/edit` | WORKS | Delete is a hard delete (§7). The deposit write puts the tenant on the legacy ledger model (02 W2). |
| `/rooms` | WORKS | Has uncommitted edits. `?action=add-room-type` handled (`Rooms.tsx:947`). |
| `/maintenance`, `/expense-tracker` | WORKS | `?action=` handled. |
| `/online-payments`, `/online-payments/transfer` | WORKS, unsafe messaging | Shows "Transfer sent" on timeout (§8). Shows the dev OTP code in the UI (`Payouts.tsx:518-520, 775-777`; `PayoutDetailDrawer.tsx:263-265`). |
| `/accounting`, `/accounting/payouts`, `/expenses` | WORKS (redirects) | |
| `/reports` | WORKS | |
| `/reports/:slug/generate` | **BROKEN build** | TS2339 at `ReportGenerate.tsx:163`. Runtime is fine: the function returns `filePath` (`generate-report/index.ts:1191`), but `GenerateReportResult` (`ReportPreview.tsx:29-39`) doesn't declare it. |
| `/reports/arrears-delinquency`, `/income-expenses`, `/occupancy-rate` | WORKS, wrong numbers | §4. |
| `/settings`, `/settings/:section` | WORKS for existing accounts | **For a new landlord settings never save** (§5). |
| `/staff/*` (employees, payroll, clock) | UNROUTED (deliberate) | `App.tsx:43-48, 126-129` |
| `/reports/bed-rent-roll`, `/owner-payout-statement`, `/payroll-summary` | UNROUTED (deliberate) | `App.tsx:51-55, 132-136` |
| Any unknown path | BROKEN | No `*` route, so a blank screen. |

**Other dead links found:**
- `GenerateInvoicesOverlay.tsx:118` prints `pay.instay.co/<property-slug>` on invoices. That route doesn't exist; only `/p/:token` does.
- The brand is split four ways: "Instay" (`GetStarted.tsx`, portal SMS), "Instant Manage" (`Contact.tsx`), "IPM", and the domains `instay.co` / `instay.app` / `instantmanage.com`.

---

## 2. `npm run build`: 8 TypeScript errors (exit 2; `vite build` never runs)

| # | File:line | Error |
|---|---|---|
| 1 | `src/landlord/components/NotificationsPanel.tsx:7` | TS6133 `CATEGORY_LINK` declared but never read |
| 2 | `src/landlord/components/TodaysTasks.tsx:8` | TS6133 `Sparkle` unused |
| 3 | `src/landlord/pages/Dashboard.tsx:29` | TS6133 `WalletIcon` unused |
| 4 | `src/landlord/pages/Dashboard.tsx:30` | TS6133 `DotsThreeVertical` unused |
| 5 | `src/landlord/pages/Dashboard.tsx:34` | TS6133 `SectionLabel` unused |
| 6 | `src/landlord/pages/Maintenance.tsx:44` | TS6133 `priorityOrder` unused |
| 7 | `src/landlord/pages/ReportGenerate.tsx:163` | **TS2339 `filePath` does not exist on type `GenerateReportResult`.** Real fix: add `filePath: string` to the type in `ReportPreview.tsx:29` |
| 8 | `src/landlord/pages/Rooms.tsx:2` | TS6133 `Link` unused (uncommitted file) |

---

## 3. Supabase RPCs and edge functions called by the frontend

### RPCs (`supabase.rpc`)
| RPC | Called at | Used by | Flag |
|---|---|---|---|
| **`pay_portal_get_property`** | `src/lib/payPortal.ts:279` (`getPortalProperty`), `:326` (inside `getPortalTenant`) | `src/pages/portal/portalData.ts`, so every portal page | ⚠ **FLAGGED.** Live version predates `late_fee_config`, so penalty config falls back to defaults (`payPortal.ts:265-273`). |
| `pay_portal_get_tenant_v2` | `payPortal.ts:321` | portalData.ts | session = permanent link token |
| `pay_portal_get_ledger_v2` | `payPortal.ts:352` | portalData.ts | — |
| **`pay_portal_log_payment_v2`** | `payPortal.ts:365` (`logPortalPayment`) | **No callers.** Dead code | ⚠ **FLAGGED.** Wrapper is unused, but the RPC is live and anon-executable (07 L2). Delete both. |
| `pay_portal_get_collection_status` | `payPortal.ts:437` | fallback inside `getCollectionStatus` → `PortalCheckout.tsx` | — |
| `pay_portal_get_maintenance_v1` | `payPortal.ts:482` | portalData.ts | — |
| `pay_portal_submit_maintenance_report_v2` | `payPortal.ts:549` | `PortalMaintenance.tsx` | — |
| `sync_tenant_balance_if_new_model` | `src/lib/tenants.ts:645` | `TenantsContext.tsx`, `offline/sync.ts` | — |
| `void_ledger_entry` | `tenants.ts:699` | TenantProfile via TenantsContext | — |
| `get_today_tasks`, `get_all_open_tasks`, `set_task_status` | `src/lib/todaysTasksApi.ts:96,117,127` | TodaysTasks, Tasks | — |
| `assistant_get_overdue_tenants`, `assistant_get_collections_summary`, `assistant_get_vacancy_summary`, `assistant_explain_tenant_balance`, `assistant_get_current_statutory_rates` | `src/lib/assistantApi.ts:118,131,144,152,169` | **No callers** (dead code) | `assistant_get_collections_summary` and `assistant_get_current_statutory_rates` **don't exist live**. Delete. |

**Not called anywhere in `src/`:**
- `pay_portal_search_tenants` (v1 and v2);
- `pay_portal_get_tenant` (v1);
- `pay_portal_get_ledger` (v1);
- `post_payout` (doesn't exist in the repo or the DB function list);
- `pay_portal_claim_payout_collections`;
- `pay_portal_release_payout_collections`.

They appear only in generated types (`database.types.ts:1815, 1819, 1903, 1912`) and comments (`payoutApi.ts:160`). The frontend doesn't need them, so they can be dropped or revoked in the DB with **no frontend change**. Claim/release are only used server-side by `lenco-payout` / `pay-portal-scheduled-payouts`.

Nothing in `src/` references `ledger_entries_v2`, `ledger_v2_*` or the v2 views.

### Edge functions (`supabase.functions.invoke`)
| Function | Called at | Caller |
|---|---|---|
| `pay-portal-resolve-token` | `payPortal.ts:304` | portalData.ts (every `/p/:token` load) |
| `pay-portal-collect-payment` | `payPortal.ts:416` | `PortalCheckout.tsx:183` |
| `pay-portal-check-collection` | `payPortal.ts:457` | `PortalCheckout.tsx:137` (polling) |
| `pay-portal-generate-receipt` | `payPortal.ts:532` | `PortalCheckout.tsx:126` |
| `pay-portal-get-documents` | `payPortal.ts:513` | portalData.ts |
| `pay-portal-request-otp`, `pay-portal-verify-otp` | `payPortal.ts:50, 61` | **No callers** (dead) |
| `lenco-payout` | `src/lib/payoutApi.ts:217` (`sendPayout`) | `useWithdrawFlow.ts`, `PayoutDetailDrawer.tsx` |
| `check-payout-status` | `payoutApi.ts:337` | `useWithdrawFlow.ts`, `PayoutDetailDrawer.tsx` |
| `request-withdrawal-otp`, `verify-withdrawal-otp` | `payoutApi.ts:102, 120` | `Payouts.tsx`, `PayoutDetailDrawer.tsx`, `useWithdrawFlow.ts` |
| `resolve-bank-account`, `resolve-mobile-money` | `payoutApi.ts:133, 61` | `Payouts.tsx` (add recipient) |
| `create-payout-recipient`, `create-mobile-money-recipient` | `payoutApi.ts:150, 81` | `Payouts.tsx` |
| `generate-report` | `ReportGenerate.tsx:130`, `Payouts.tsx:1351` | Reports, payouts export |
| `send-payment-receipt-sms` | `TenantsContext.tsx:540` | after manual payment |
| `send-tenant-onboarding-sms` | `AddTenant.tsx:1139` | after add tenant |
| `send-whatsapp` | `src/landlord/invoiceUtils.ts:212` | `GenerateInvoicesOverlay.tsx` (placeholder backend) |
| `assistant-chat` | `src/lib/assistantApi.ts:202` | `src/hooks/useAssistant.ts` → AssistantPanel |

---

## 4. Where "collected", "owed" and "balance" are calculated

**Every frontend calculation reads `tenants.owed_amount` / `tenants.status` plus the event-model `ledger_entries` (`listTenants`, `src/lib/tenants.ts:431`), or the `collections` table. None reads `ledger_entries_v2`.** The live DB also has `ledger_entries_v2`, which nothing in the UI uses.

| # | Figure | Where | Formula | Source |
|---|---|---|---|---|
| 1 | Dashboard "Total collected" | `Dashboard.tsx:133, 251-253` → `useCollectedRent()` `TenantsContext.tsx:801-814` | paid → **full `rentAmount`** (assumed, not measured); partial → `ledger[0].paidAmount` (an arbitrary row) | `tenants.status`, `ledger_entries` |
| 2 | Income vs expenses "Rent collected" | `reports/IncomeExpenses.tsx:64-69` | Same assumption as #1, duplicated; current month only | `tenants.status`, `ledger_entries` |
| 3 | Owner payout statement | `reports/OwnerPayoutStatement.tsx:18` | `useCollectedRent()` | unrouted |
| 4 | Rent page "collected / outstanding / %" | `Rent.tsx:241-246`, row logic `:99-114` | Current month: paid → `rentAmount`, partial → `ledger[0].paidAmount`, owed = `owedAmount`. Past months: first ledger row whose `createdAt` falls in that month | `tenants`, `ledger_entries` (legacy row shape) |
| 5 | "Total owed" (tenant profile, payment drawer, Rent row, arrears report) | `calcTotalOwed()` `invoiceUtils.ts:143-145`, used at `TenantProfile.tsx:634`, `TenantPaymentDrawer.tsx:74`, `Rent.tsx:124`, `reports/shared.tsx:130` | `max(0, owed_amount) + live penalty (days_overdue × rate)` | `tenants.owed_amount`, `days_overdue` |
| 6 | Arrears report total | `reports/ArrearsDelinquency.tsx:34` | sum of #5 for status overdue/unpaid (partial excluded) | as #5 |
| 7 | Months owed | `TenantProfile.tsx:338` | `round(owedAmount / rentAmount)` | `tenants` |
| 8 | Manual payment new balance | `TenantsContext.tsx:364-366` | `max(0, calcTotalOwed − amount)`; falls back to `rentAmount` if 0 | **computed in the browser**, written back to `tenants` |
| 9 | Manual charge/credit new balance | `TenantsContext.tsx:584` | `max(0, owed + amount)` | browser-computed |
| 10 | Portal "balance owed" | `payPortal.ts:338-341` → `PortalHome.tsx:88`, `PortalCheckout.tsx:97` | `owed_amount + penalty` (0 if status paid). Checkout falls back to `rentAmount` when owed is 0 | `pay_portal_get_tenant_v2` → `tenants` |
| 11 | Online payments "Total collected" | `Payouts.tsx:1448, 1517-1519` | `sum(collections.amount)`, **including the tenant fee (IPM revenue)** | `collections` |
| 12 | Available to withdraw / collected / paid out | `getLencoBalance()` `payoutApi.ts:166-186` → `Dashboard.tsx`, `usePayoutSummary.ts` | collected = `sum(amount)` gross; available = `sum(amount − fee)` where `payout_id is null`. **Includes `DEV-SIMULATED` rows** | `collections`, `payouts` |
| 13 | PDF/CSV report "Rent collected" | Frontend renders it (`ReportPreview.tsx:108-110`); value from `generate-report/index.ts:379-387` | `sum(collections.amount)` for the period. Includes fee, **excludes cash** | `collections` |
| 14 | Invoice totals | `calcTenantInvoice()` `invoiceUtils.ts:164+` | rent + `owedAmount` as "outstanding" + penalty | `tenants` |
| 15 | Assistant | `assistant-chat` edge function → live RPCs `assistant_get_collected_rent`, `assistant_get_overdue_tenants`, `assistant_get_payouts_summary` | server-side; payouts summary = gross collections − payouts | `ledger_entries` / `collections` (not v2) |

Net result: "collected" has **four different definitions**. Status-based (#1, #2, #4) is one. Gross collections including the fee (#11, #12, #13) is another. Ledger first-row (#4, past months) is the third. The assistant's RPCs are the fourth.

---

## 5. New landlord settings creation

**Path:** first dashboard load → `SettingsContext.tsx:375` `getOrCreatePrimaryProperty()` (`src/lib/properties.ts:55-62`) → `:386` `getOrCreateSettings()` (`src/lib/settingsApi.ts:4-57`). That inserts one `settings` row.

| Column inserted (`settingsApi.ts:16-55`) | Value | In live `settings`? |
|---|---|---|
| property_id | property.id | ✅ |
| invoices_on | false | ✅ |
| collection_target_pct | 90 | ✅ |
| landlord_name | from signup metadata | ✅ |
| landlord_phone | "" | ✅ |
| payment_methods | `[{mtn, "0977 000 111"}, {cash}]` | ✅ |
| management_fee_rate | 0.1 | ✅ |
| billing_period | "Monthly" | ✅ |
| due_day | **30** | ✅ |
| grace_period_days | 5 | ✅ |
| daily_penalty_rate | 15 | ✅ |
| **late_fee_enabled** | true | ❌ **missing** |
| **late_fee_mode** | "prorated_rent" | ❌ **missing** |
| **late_fee_percent** | 1 | ❌ **missing** |
| **late_fee_cap_enabled** | false | ❌ **missing** |
| **late_fee_cap_amount** | null | ❌ **missing** |
| reminder_lead_days | 3 | ✅ |
| escalation_days | 7 | ✅ |
| pre_due_reminders_enabled, escalation_enabled | true | ✅ |
| task_overdue_rent_enabled, task_stale_maintenance_enabled, task_collections_target_enabled | true | ✅ |
| contact_order | "student" | ✅ |
| notification_phone | "" | ✅ |
| payment_sms_mode | "daily_digest" | ✅ |
| sms_notification_prefs | `{newMaintenanceReport, overdueEscalated}` | ✅ |
| send_onboarding_sms, send_payment_receipt_sms | true | ✅ |
| napsa_insurable_earnings_ceiling | 37236 | ✅ |
| minimum_wage_reference | 1978.99 | ✅ |
| payout_day | "Friday" | ✅ |
| account_email | "" | ✅ |
| subscription_plan | **"Pro"** | ✅ |
| subscription_renews_at | null | ✅ |

**What actually happens to a new landlord:**
1. PostgREST rejects the insert because of the 5 unknown columns.
2. The error is caught and only `console.error`'d (`SettingsContext.tsx:406-414`). `propertyId` is already set (`:377`), so the dashboard loads and looks normal.
3. No settings row exists. Every later `updateSettings` is an `UPDATE … where property_id = X` that matches **0 rows and reports no error** (`settingsApi.ts:63-66`), so **no Settings change ever saves**.
4. The UI keeps the `useState` fallbacks (§6).
5. The crons iterate `settings` rows, so this property **never gets rent charges or reminders**.

The 5 late-fee setters (`SettingsContext.tsx:491-507`) also fail for *existing* landlords, because the columns don't exist.

---

## 6. Hardcoded defaults

| Value | Where | Shown to |
|---|---|---|
| MTN payment number **`0977 000 111`** | `settingsApi.ts:26`; also `SettingsContext.tsx:240` initial state | Landlord settings, invoices, portal payment methods |
| Landlord phone **`0977 000 000`** | `SettingsContext.tsx:238` initial state (shown whenever the settings row is missing, which is every new landlord per §5) | Settings, invoices |
| Due day **30** | `settingsApi.ts:29`; `SettingsContext.tsx:247` | Charges, reminders, invoices |
| Grace 5 days, penalty K15/day, late fee on, prorated | `settingsApi.ts:30-34`; `SettingsContext.tsx:248-249` | Penalty math |
| Plan **"Pro"** (matches no tier in `src/lib/pricing.ts:17-22`) | `settingsApi.ts:54` | Settings → Subscription |
| Payout day "Friday" | `settingsApi.ts:51`; `SettingsContext.tsx:212, 284` | Scheduled payouts |
| Management fee 10%, collection target 90% | `settingsApi.ts:20, 23` | Dashboard target |
| Property name "My Property" if signup metadata missing | `properties.ts:60` | Everywhere, and becomes the slug `my-property`; since slug is unique, the second such landlord fails |
| Portal domain `pay.instay.co` | `send-rent-reminders` (server), `TenantProfile.tsx:972`, `GenerateInvoicesOverlay.tsx:118` | Tenants |
| Dev phone `0977000000` in simulated payments | `PortalCheckout.tsx:171` (only with `?dev=1`) | — |

---

## 7. What happens when a tenant is deleted

**UI:** "Delete tenant?" modal ("permanently remove … and their payment history. This can't be undone"), from `Tenants.tsx:407-411` and `TenantProfile.tsx:1576-1580` → `deleteTenant()` (`TenantsContext.tsx:273-279`) → `deleteTenantRow()` → `supabase.from("tenants").delete()` (`src/lib/tenants.ts:562-565`).

**Order:** the tenant is removed from local state first (optimistic). On failure, a toast shows but **the tenant isn't restored** in the UI until a reload.

**Database effect (live foreign keys):**
| Table | On delete | Consequence |
|---|---|---|
| `collections` | **CASCADE** | Real mobile-money payment records destroyed. Unclaimed money vanishes from "available to withdraw". |
| `ledger_entries` | **CASCADE** | Full payment history gone (no audit trail) |
| `invoice_tenants` | CASCADE | Invoice links gone |
| `tenant_documents` | CASCADE | Rows deleted. **Files stay in storage** (orphaned ID copies and leases) |
| `reminder_log`, `portal_sessions`, `portal_otp_codes`, `ledger_v2_date_exceptions` | CASCADE | — |
| `invoices.tenant_id`, `maintenance_reports.tenant_id`, `rooms.reserved_for_tenant_id` | SET NULL | Orphaned rows |
| `ledger_entries_v2`, `ledger_entries_legacy_archive` | **RESTRICT** | For the v2 test landlord, the delete **fails** and the tenant reappears only after a reload |

Tenant photo and document files in storage are never deleted. Move-out (`moveOutTenant`) is the safe alternative and already exists.

---

## 8. Where the UI shows success or failure on a timeout

| # | Where | What the user sees | Problem |
|---|---|---|---|
| 1 | `PortalCheckout.tsx:196-204` | Any error from `initiateCollection` goes to `/failed`, with the server message or *"Something went wrong starting the payment. **No amount was charged.**"* | A Lenco timeout returns 502 "Failed to reach Lenco" after the request may have reached Lenco. The tenant is told nothing was charged, retries, and **pays twice**. |
| 2 | `PortalCheckout.tsx:187-192, 140-145` | status `failed` → *"The mobile money provider declined this payment. **No amount was charged.**"* | The backend sets `failed` on its own network errors too (`pay-portal-collect-payment/index.ts:328-329`), so this can be false. |
| 3 | `PortalCheckout.tsx:147-150, 155-158, 375-376` | After 20 polls (~60 s): "Still waiting on your network… you can safely close this page" | Correct wording. But if the page closes, nothing else resolves the payment (no sweep). Two live collections have been stuck since 7 Oct. |
| 4 | `useWithdrawFlow.ts:62-67` → `Payouts.tsx:465-490` | After 20 polls a still-`processing` payout shows **"Transfer sent — K… is on its way"** | **Timeout shown as success.** Two live payouts have been `processing` since 2 Oct and may still fail. |
| 5 | `useWithdrawFlow.ts:96-105`, `PayoutDetailDrawer.tsx:208-220` | `sendPayout` error → "Failed to send the transfer" / error toast | On a timeout after Lenco accepted, money may have left. The landlord is invited to retry, and the backend has already released the collections, so they pay out twice. |
| 6 | `PayoutDetailDrawer.tsx:149-170` | Polling: success/failed toast, otherwise "still waiting" | OK. |
| 7 | `TenantsContext.tsx:331-460, 545-548` (manual payment) | Balance and ledger update **instantly** (optimistic). On failure only a toast shows | A failed save still **shows as paid** until a reload. |
| 8 | `TenantsContext.tsx:273-279` (delete), `addAdjustment` `:581-641` | Same optimistic pattern | Same: UI shows success on failure. |

---

## 9. Pages needed for the demo flow

**Demo flow:** sign up → add property → add tenants → tenant pays via link → landlord sees payment → monthly report.

| Step | Pages / components needed | Ready? |
|---|---|---|
| Sign up | `/get-started` (GetStarted.tsx, **must be routed**), `/sign-in`, `/forgot-password`, `/reset-password` | ❌ unrouted; settings creation fails (§5) |
| Add property | Auto-created on first load (`properties.ts:55-62`). `/settings/property` for name/address/logo; `/rooms` for room types and rooms | ⚠ settings row missing |
| Add tenants | `/tenants`, `/tenants/new`, `/tenants/:code` | ✅ (deposit creates a legacy row) |
| Tenant pays via link | `/p/:token`, `/p/:token/pay`, `/p/:token/success`, `/p/:token/failed`, `/p/:token/history` | ✅ with real Lenco. Use `?dev=1` + `DEV_MODE_PAYMENTS` only for a rehearsal |
| Landlord sees payment | `/dashboard`, `/rent`, `/tenants/:code`, `/online-payments` (collections list) | ✅ realtime, numbers inconsistent (§4) |
| Monthly report | `/reports`, `/reports/:slug/generate` (income vs expenses) | ❌ build error; figure includes fee and excludes cash |
| Shell | `DashboardLayout`, `Sidebar`, `Header`, `RequireAuth`, `/` landing, `/pricing` | ✅ |

**Hide-able for the demo** (remove from Sidebar / MobileBottomNav / GlobalSearch / CreateLauncher; keep the files):
- **Landlord:** `/tasks`, TodaysTasks card, `/notifications` (and NotificationsPanel), `/maintenance`, `/expense-tracker`, `/reports/arrears-delinquency`, `/reports/occupancy-rate`, `/online-payments/transfer` + withdraw flow (or keep it read-only), AssistantPanel, ProductTour, SetupChecklist (optional), invoices (GenerateInvoicesOverlay / WhatsApp), offline SyncStatus / SyncToast / SyncReviewModal.
- **Portal:** `/p/:token/maintenance`, `/p/:token/documents`.
- **Marketing:** `/careers`, `/help`, `/docs`, `/status`, `/how-it-works`, `/features/*`, `/about`.

---

## Prioritized fix list (frontend only)

| # | Fix | Hours |
|---|---|---|
| 1 | Route `/get-started` → GetStarted. Add a `*` catch-all 404. Point every "Book Free Demo" / "Talk to us" CTA at `/get-started` or `/contact`. Remove the `/faq`, `/#features` and `/features/invoicing` links. | 1.5 |
| 2 | Fix the build: add `filePath: string` to `GenerateReportResult`, delete 7 unused imports. | 0.5 |
| 3 | Settings creation: remove the 5 `late_fee_*` fields from the insert (`settingsApi.ts:30-34`) **or** apply the migration. Make `getOrCreateSettings` failure **visible** (blocking error screen, not `console.error`). Make `updateSettings` check that one row was updated. | 2 |
| 4 | Defaults: empty `payment_methods`, `landlord_phone`, `due_day` = 1 (or ask during onboarding), `subscription_plan` = null, initial `useState` values blank. | 1 |
| 5 | Portal failure copy: never say "No amount was charged" unless status is `failed` **from Lenco**. For thrown/network errors, show "We couldn't confirm this payment. Don't pay again. Check your history in a few minutes." and keep polling `check-collection` with the collection id when one exists. | 2 |
| 6 | Withdraw flow: after polling times out, show "Transfer processing" (not "Transfer sent"). On `sendPayout` error, show "Status unknown. Don't retry." and disable retry until `check-payout-status` resolves. | 2 |
| 7 | Remove dev-OTP display (`Payouts.tsx:518-520, 775-777`; `PayoutDetailDrawer.tsx:263-265`), or gate it behind `import.meta.env.DEV`. | 0.5 |
| 8 | Replace tenant **Delete** with **Archive** (move-out). Remove or hide the delete modal from `Tenants.tsx` and `TenantProfile.tsx`. | 1 |
| 9 | Roll back optimistic state on failed manual payment, adjustment or delete (`TenantsContext.tsx`). | 3 |
| 10 | One "collected" definition: replace `useCollectedRent`, `IncomeExpenses` income, the Rent-page current-month calculation and `Payouts` lifetime total with one helper that sums **payment events** (manual + mobile money, rent portion only) per month from `ledger_entries`. | 4 |
| 11 | Exclude `DEV-SIMULATED` / `MANUAL-TOPUP` collections from `getLencoBalance` and the Payouts totals (until the data is reset). | 0.5 |
| 12 | Hide the non-demo pages and widgets listed in §9 (nav arrays + launcher + search). | 1.5 |
| 13 | Fix the invoice payment link (`GenerateInvoicesOverlay.tsx:118`) to use `/p/<token>` per tenant, or hide invoices. | 0.5 |
| 14 | Delete dead code: `logPortalPayment`, `requestPortalOtp`/`verifyPortalOtp`, the 5 unused `assistantApi` RPC wrappers. | 0.5 |
| 15 | Pick one brand name and domain across Contact, GetStarted, portal and footer. | 1 |
| 16 | Error boundary around `DashboardLayout` and `PortalLayout`. | 1 |
| | **Total** | **≈ 22.5 h** (about 3 days) |

Items 1–5 (about 7 h) are the minimum for the demo flow to work end to end. The backend issues in [07-live-db-findings.md](07-live-db-findings.md) still apply: inflated live balances, the anon-callable RPCs, and stuck payouts. Resetting the test data before a demo avoids showing K7,200 balances.
