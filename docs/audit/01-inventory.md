# 01 — Inventory

Audit date: 2026-10-14. Branch `shadcn-ui-migration-wip` @ `704f2d4` (+3 uncommitted files). Code-only audit: the connected Supabase account does not have access to the IPM project (`rlmcuhejgfftcdshbrbe`), so nothing here was checked against the live database. See [06-live-db-checks.md](06-live-db-checks.md) for the queries that close that gap.

Status key: **DONE** (works end to end in code), **PARTIAL** (exists, gaps), **BROKEN** (exists, produces wrong results or is unsafe), **NOT STARTED**. Confidence: High / Med / Low.

---

## 1. Build health

| Check | Result | Evidence |
|---|---|---|
| `tsc -b` (first half of `npm run build`) | **FAILS, 8 errors.** 7 unused imports/vars, plus 1 real bug: `Property 'filePath' does not exist on type 'GenerateReportResult'` | `src/landlord/pages/ReportGenerate.tsx:163` |
| `oxlint` | Passes (warnings only) | — |
| Test runner | None configured. 6 hand-run assertion scripts | `src/lib/__tests__/*.test.ts` (header says "No test runner is configured"), `supabase/functions/_shared/__tests__/reconcileCollection.test.ts` |
| Schema reproducible from repo | **No.** See §4 | — |

## 2. Frontend routes and pages

Routes are defined in `src/App.tsx:72-145`.

### Marketing / auth (16 pages, `src/pages/`)
`/`, `/pricing`, `/how-it-works`, `/features/:slug`, `/about`, `/careers`, `/contact`, `/help`, `/docs`, `/status`, `/privacy`, `/terms`, `/sign-in` (+`/login`), `/forgot-password`, `/reset-password`. **Sign-up is unreachable (BROKEN, High).** `src/pages/GetStarted.tsx` exists and three CTAs link to `/get-started` (`src/components/CTABanner.tsx:24`, `Compare.tsx:91`, `src/pages/HowItWorks.tsx:48`), but `App.tsx` registers no such route and has no catch-all, so new landlords land on a blank page. `Privacy`/`Terms` are 35-line stubs.

### Landlord dashboard (behind `RequireAuth`, `src/landlord/pages/`)
| Route | Page | Lines | Status | Conf. |
|---|---|---|---|---|
| `/dashboard` | Dashboard.tsx | 540 | PARTIAL: "collected" figure is a guess, see 02 §W5 | High |
| `/tasks` | Tasks.tsx (+ TodaysTasks 748) | 251 | PARTIAL: depends on stale `days_overdue` | Med |
| `/notifications` | Notifications.tsx | 217 | DONE (not deeply reviewed) | Low |
| `/rent` | Rent.tsx | 796 | BROKEN: current month shows live `tenants.status`, which never rolls over for legacy tenants | High |
| `/tenants`, `/tenants/new`, `/tenants/:code`, `/tenants/:code/edit` | Tenants, AddTenant (1871), TenantProfile (1691) | — | PARTIAL: deposit write poisons ledger model; hard delete | High |
| `/rooms` | Rooms.tsx | 1399 | DONE (not deeply reviewed; uncommitted edits) | Low |
| `/maintenance` | Maintenance.tsx | 1052 | DONE (not deeply reviewed) | Low |
| `/expense-tracker` | Accounting.tsx | 1970 | DONE (not deeply reviewed) | Low |
| `/online-payments`, `/online-payments/transfer` | Payouts.tsx | 1867 | PARTIAL: UI fine, backend unsafe (03) | High |
| `/reports`, `/reports/:slug/generate` | Reports, ReportGenerate | — | BROKEN: build error at ReportGenerate.tsx:163; income figure wrong | High |
| `/reports/arrears-delinquency`, `/income-expenses`, `/occupancy-rate` | reports/*.tsx | ~140 each | PARTIAL | Med |
| `/settings`, `/settings/:section` | Settings.tsx | 611 | PARTIAL: subscription section is display-only | High |
| Staff: `/staff/*` (employees, payroll, clock/kiosk) | StaffEmployees 889, StaffPayroll 708, StaffClock 253 | — | **Disabled** (commented out in `App.tsx:43-48,126-129` and `Sidebar.tsx:65-69`) | High |
| Reports: bed rent roll, owner payout statement, payroll summary | reports/*.tsx | — | **Disabled** (commented out, `App.tsx:51-55`) | High |

Notable shared components: `GenerateInvoicesOverlay` (587), `LogPaymentModal` (346), `PayoutDetailDrawer` (358), `GlobalSearch` (459), `ProductTour` (205), `AssistantPanel` (684, `src/components/`), `SyncReviewModal`/`SyncStatus`/`SyncToast` (offline).

State lives in 12 React contexts (`src/landlord/*Context.tsx`). **Balance math for legacy tenants is computed in the browser** (`TenantsContext.tsx:324-551`).

### Tenant portal (public, `src/pages/portal/`)
`/p/:token` home, `/pay`, `/success`, `/failed`, `/history`, `/history/:entryKey`, `/maintenance`, `/documents`. Identity = the 6-character token alone (no OTP). See 03 §S1.

## 3. Edge functions (28, `supabase/functions/`)

| Function | Trigger | Auth model | Status | Conf. |
|---|---|---|---|---|
| `pay-portal-resolve-token` | Portal load | Token only, **no rate limit** | DONE / weak | High |
| `pay-portal-request-otp`, `pay-portal-verify-otp` | Legacy portal flow | — | **Superseded**: portal skips OTP (`resolve-token` header comment) | High |
| `pay-portal-collect-payment` | Tenant pays | Token | BROKEN on timeout path (02 §W4) | High |
| `pay-portal-check-collection` | Portal polling | Token | DONE | High |
| `lenco-webhook` | Lenco push | HMAC-SHA512 sig | PARTIAL: ignores late success, non-constant-time compare | High |
| `pay-portal-generate-receipt`, `pay-portal-get-documents` | Portal | Token | DONE (not deeply reviewed) | Low |
| `lenco-payout` | Landlord on-demand withdraw | JWT + email OTP token | BROKEN on timeout path (02 §W8) | High |
| `pay-portal-scheduled-payouts` | Cron daily 06:10 UTC | `CRON_SECRET` | BROKEN on timeout path | High |
| `check-payout-status` | Landlord manual | JWT | DONE | Med |
| `request-withdrawal-otp`, `verify-withdrawal-otp` | Withdraw / add recipient | JWT; returns `devCode` if no email key | PARTIAL | High |
| `create-payout-recipient`, `create-mobile-money-recipient` | Settings | JWT + OTP token | DONE | Med |
| `resolve-bank-account`, `resolve-mobile-money`, `sync-lenco-banks` | Settings | Platform `verify_jwt` only (anon key passes) | PARTIAL | Med |
| `generate-rent-charges` | Cron daily 22:05 UTC | `CRON_SECRET` | PARTIAL: charges don't move legacy balances | High |
| `send-rent-reminders` | Cron daily 06:00 UTC | `CRON_SECRET` | BROKEN in practice (02 §W3) | High |
| `send-payment-receipt-sms` | After manual payment | JWT + RLS | DONE | Med |
| `send-tenant-onboarding-sms` | After add tenant | JWT + RLS | DONE | Med |
| `send-instant-notification-sms`, `send-notification-digests` | Cron hourly / trigger | `CRON_SECRET` | DONE (not deeply reviewed) | Low |
| `classify-maintenance-priority` | Trigger | `CRON_SECRET` | DONE (Gemini) | Low |
| `assistant-chat` | AI panel | JWT + property ownership | PARTIAL: 19 RPCs it calls are not in the repo | High |
| `generate-report` | Reports page | JWT | PARTIAL: income = gross collections incl. IPM fee, excludes cash | High |
| `send-whatsapp` | Invoices | **No auth check in code**; placeholder unless token set | NOT STARTED (placeholder) | High |

Shared: `_shared/reconcileCollection.ts` (money-critical), `generateRentCharge.ts`, `sms.ts`, `email.ts` (Resend, **no key configured** per its own header), `otpCrypto.ts`, `billingPeriod.ts`, `smsCap.ts`, `quietHours.ts`.

## 4. Database

### 4a. Schema drift (blocker)
The 67 migrations **do not create the core tables.** No `CREATE TABLE` exists anywhere in `supabase/migrations/` for `properties`, `rooms`, `room_types`, `tenants`, `ledger_entries`, `settings`, `invoices`, `invoice_tenants`, `expenses`, `expense_categories`, `maintenance_reports`, `employees`, `clock_entries`, `payroll_runs`, `institutions`, `statutory_rates`, `assistant_conversations`, `assistant_messages`. These were created in the Supabase dashboard. Two "reconciliation" migrations admit this (`20260915000000_sync_dashboard_changes.sql:1-14`: "14 migrations applied remotely with no local file"; `20261003030000_document_pay_portal_payout_rpcs.sql:1-6`).

Also missing from migrations:
- Money-critical `collections` columns `payout_id`, `fee_amount`, `line_items`, `owed_before`, which the code reads and writes (`pay-portal-collect-payment/index.ts:228-240`).
- 19 RPCs called by `assistant-chat`, including `assistant_query`, which takes a model-chosen view name and filters (`assistant-chat/index.ts:362-367`). Their bodies, `SECURITY DEFINER` status and grants are unknown.
- Any proof that the old ungated `pay_portal_get_tenant` / `pay_portal_get_ledger` (v1) were dropped. Only `pay_portal_log_payment` v1 was dropped (`20260916000000:20`).

**Consequence:** you cannot rebuild production, stand up staging, or prove RLS from the repo.

**Live update (07 L5, L6):** the drift runs both ways. Nine `ledger_v2_*` migrations are applied live but aren't in git. They created `ledger_entries_v2`, `fee_config`, `property_managers`, 5 views and 2 extra cron jobs. Repo migration `20261009010000_late_fee_config` was never applied live. All 42 live tables have RLS on, and all 10 views are `security_invoker`.

### 4b. Tables (31 in `src/lib/database.types.ts` + 6 created only in migrations)
Money: `tenants` (cached balance), `ledger_entries` (dual model), `collections`, `payouts`, `payout_recipients`, `property_balances` (written, read by nothing user-facing per `20261003030000:8-10`), `invoices`, `invoice_tenants`, `expenses`.
Security tables (RLS on, no policies, service-only): `portal_otp_codes`, `portal_sessions`, `payout_withdrawal_otp_codes`, `payout_recipient_otp_codes`.
Ops: `notifications`, `reminder_log`, `sms_send_log`, `sms_daily_counters`, `pending_instant_sms`, `notification_digest_state`, `tasks`, `task_briefings`, `report_history`, `tenant_documents`, `banks`.

### 4c. RLS
Pattern: `property_id in (select id from properties where owner_id = auth.uid())`. Applied to 12 dashboard-created tables by loop (`20260907020000_auth_and_onboarding.sql:50-84`), plus `ledger_entries`/`invoice_tenants` via joins (`:93-127`), plus each newer table. Isolation **between landlords** looks correct for every table that appears in migrations (High). Unknown for `assistant_*`, `statutory_rates`, `banks` writes.

Problems that are *within* a landlord's own scope but still matter: see 03 §S2, §S3. Landlords have full INSERT/UPDATE/DELETE on `payouts` (`20260908020000_payouts.sql:30-37`) and on `ledger_entries` (`20260907020000:96-104`), so there is no immutable audit trail.

### 4d. Cron jobs (pg_cron → `private.invoke_cron_function`, `20260928010000_reminder_cron.sql`)
| Job | Schedule (UTC) | Calls |
|---|---|---|
| `send-rent-reminders-daily` | `0 6 * * *` | send-rent-reminders |
| `generate-rent-charges-daily` | `5 22 * * *` | generate-rent-charges |
| `pay-portal-scheduled-payouts-daily` | `10 6 * * *` | pay-portal-scheduled-payouts |
| `send-notification-digests-hourly` | `0 * * * *` (`20260928020000:74`) | send-notification-digests |
| `sync-tasks-daily` | `30 3 * * *` (`20261003010000:181`) | `sync_all_tasks()` SQL |

All HTTP jobs silently no-op unless two vault secrets were created by hand (`20260928010000:6-16`). **Missing:** no daily balance/overdue sync, no stuck-payout sweep, no stuck-collection sweep.

## 5. External integrations

| Integration | Used for | Status | Evidence |
|---|---|---|---|
| Lenco v2 | MoMo collections, bank/MoMo transfers, account resolve, bank list | PARTIAL: real endpoints, but one pooled IPM wallet (`accountId = accounts[0]`, `lenco-payout/index.ts:261`) | High |
| Africa's Talking | OTP + all SMS | PARTIAL: **reports success without sending** when `AT_API_KEY` missing (`_shared/sms.ts:35-38`) | High |
| Resend (email) | Withdrawal / add-recipient OTP | NOT CONFIGURED per `_shared/email.ts:1-6`; OTP code returned to browser instead (`request-withdrawal-otp/index.ts:123-126`) | High |
| Gemini (`gemini-flash-lite-latest`) | Assistant, maintenance priority | PARTIAL: floating model alias (`assistant-chat/index.ts:12`) | High |
| WhatsApp Cloud API | Invoice sending | NOT STARTED (placeholder) | High |
| PWA / Dexie offline | Read cache + write queue | PARTIAL: offline payment replay writes a stale absolute balance (02 §W4b) | High |
| Subscription billing (IPM charging landlords) | — | **NOT STARTED.** Tiers are constants (`src/lib/pricing.ts:17-22`); `settings.subscription_plan` defaults to `"Pro"`, which matches no tier (`src/lib/settingsApi.ts:54`) | High |
