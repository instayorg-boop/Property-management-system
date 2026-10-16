# 05 — Proposed v1: smallest launchable product

## What v1 is
A Zambian landlord can:
1. Sign up and set up one property with its rooms.
2. Add tenants (deposit recorded separately from rent).
3. Have rent charged automatically every month.
4. Have tenants reminded by SMS with their **real** balance.
5. Have tenants pay by MTN/Airtel/Zamtel through their link, and log cash payments themselves.
6. See one set of numbers that agree everywhere: tenant profile, Rent page, dashboard, monthly statement.
7. Receive payouts to bank or MoMo, scheduled or on demand, without any chance of double payment.

Late fees are **manual** in v1: the landlord adds a "Late fee" charge, which `addAdjustment` already supports. You bill landlords for the subscription by hand.

Everything else is either already working and ships untouched (SHOULD list in 04), or is hidden.

## Ordered build list

Order is risk first, then dependencies. Days are focused dev-days including testing.

### Week 1: stop the bleeding

| # | Item | Days | Done when |
|---|---|---|---|
| 1 | **Schema baseline.** Run [06-live-db-checks.md](06-live-db-checks.md) on prod. `supabase db dump` the public schema into a baseline migration and commit it. | 0.5 | `supabase db reset` locally gives a DB where `supabase db diff` against prod is empty. All 06 queries answered in a note. |
| 2 | **Build green.** Fix the 8 `tsc` errors (real one: `ReportGenerate.tsx:163`). | 0.25 | `npm run build` exits 0. |
| 3 | **Portal security hotfix.** Drop the live anon-executable v1 functions `pay_portal_search_tenants`, `pay_portal_get_tenant`, `pay_portal_get_ledger` and `pay_portal_submit_maintenance_report` (07 L1). Rotate `CRON_SECRET` and delete cron job 1 (07 L8). Drop `pay_portal_log_payment_v2`. Drop the v1 `pay_portal_get_tenant`/`get_ledger` if they exist live. Revoke `pay_portal_increment_property_balance` from anon/authenticated. Add per-IP rate limit on `pay-portal-resolve-token`. New tokens: 10+ chars from `crypto.getRandomValues`/`gen_random_bytes`. Add a "regenerate link" button. | 1 | Calling `pay_portal_log_payment_v2` with a valid token returns *function does not exist*. 60 bad tokens/min from one IP get 429. Existing 6-char links still resolve. |
| 4 | **Payout safety.** (a) Revoke claim/release RPCs from `authenticated`; release only when status is `pending`/`failed`. (b) Drop landlord INSERT/UPDATE/DELETE policies on `payouts`, keeping SELECT. (c) In `lenco-payout` and `pay-portal-scheduled-payouts`, a network error or unreadable response after the transfer POST leaves the payout `processing` and **does not release**. (d) Cron every 15 min re-queries Lenco for payouts in `pending`/`processing` older than 10 min, then marks them successful or failed and releases. | 1.5 | From a landlord JWT, `rpc('pay_portal_release_payout_collections')` is permission denied. A simulated timeout after a Lenco 200 ends as `successful` via the sweep, with collections still claimed. No code path releases a payout Lenco may have sent. |
| 5 | **Collection safety + atomic reconcile.** (a) In `pay-portal-collect-payment`, a network or parse error leaves the collection `pending`, not `failed`. (b) Move `reconcileSuccessfulCollection` into one Postgres function: status flip + ledger event + balance in one transaction, keyed on collection id. (c) Webhook returns 500 if reconcile fails, so Lenco retries. (d) Cron every 10 min re-queries `pending`/`pay-offline` collections older than 10 min. | 1.5 | Four scripted scenarios each credit the tenant **exactly once**: success, duplicate webhook, timeout-then-success, crash mid-reconcile. |
| 6 | **Production config fails closed.** Remove all `devCode` responses and the `ok:true` no-key SMS/email paths outside an explicit `APP_ENV=dev`. Add `health` function reporting each secret, vault secrets and cron last-run. Set `AT_USERNAME` live, `RESEND_API_KEY`, `CRON_SECRET`; `DEV_MODE_PAYMENTS` unset. | 0.5 | Health shows all green in prod. A missing key causes a visible error, never a fake success. |

### Week 2: one ledger you can trust

| # | Item | Days | Done when |
|---|---|---|---|
| 7 | **Single ledger model.** *Live update: there are three ledgers (07 L4, L6) and no real customers. Simplest path: delete `ledger_entries_v2` and its crons/flags, fix `calculate_tenant_balance` (or the reclassified rows) so paid legacy rows don't count as owed, and reset the test tenants. That takes (a)/(b) below down to about 1 day; (c)/(d) still apply.* (a) Export every tenant's current `owed_amount` alongside their ledger history so each landlord can confirm opening balances. Do this before migrating, because legacy balances may already be wrong (M1). (b) Migration: for each legacy tenant, insert one `opening_balance` adjustment event equal to the confirmed amount, and flag legacy rows `affects_balance=false, origin='legacy_archived'` (kept for display). (c) Make `sync_tenant_balance_if_new_model` apply to everyone (drop the legacy skip). (d) Delete every browser write of `owed_amount`/`status`/`days_overdue`: the `TenantsContext` fallbacks, the offline `_tenantPatch`, and `AddTenant`'s initial `owedAmount`. The move-in charge becomes a `charge` event. | 3.5 | `select count(*) from tenants where owed_amount <> (calculate_tenant_balance(id)).balance` = 0. `grep owed_amount src/` finds only reads. Existing test scripts updated and passing. |
| 8 | **Deposits off the rent ledger.** New `deposits` table (tenant, amount, held/refunded/forfeited, amount_returned, date, note, created_by). Migrate existing "Security deposit" rows. AddTenant and MoveOut write there. | 1 | No `ledger_entries` row with label "Security deposit" affects balance. Tenant profile shows deposit history. |
| 9 | **Nightly sync.** Cron at 22:20 UTC, after charge generation: sync every active tenant. | 0.5 | A tenant with an unpaid charge past grace shows the correct `status=overdue` and `days_overdue` the next morning with nobody opening the app. |
| 10 | **Manual payments server-side + credit balance.** Manual payments use the same event path. A balance below zero shows as "In credit" and nets against the next charge. | 0.5 | Overpaying K200 shows "K200 in credit". Next month's charge shows rent − 200. |
| 11 | **Penalties off by default.** `late_fee_enabled` defaults to false. When disabled, `collect-payment` doesn't add a penalty. Settings copy says late fees are added manually in v1. | 0.25 | No live-computed penalty appears anywhere for a new account. |
| 12 | Payout recipient OTP works with real email (depends on #6). | 0.25 | Adding a bank account sends a real email code. |

### Week 3: numbers and messages

| # | Item | Days | Done when |
|---|---|---|---|
| 13 | **Reminders quote the real balance.** Use `owed_amount` after the nightly sync. Fix the due-day-1 lead-day edge case. Add a dry-run mode. | 0.5 | Dry run for tomorrow lists recipients and amounts that match the Rent page exactly. |
| 14 | **One monthly statement.** One SQL function `monthly_statement(property_id, month)` returns: opening arrears, rent charged, collected (cash / MoMo, rent portion only), IPM fees, payouts, closing arrears, and per-tenant lines. Dashboard, Rent page totals, in-app reports and the PDF all read it. Delete `useCollectedRent`. | 2 | For a seeded month: opening + charged − collected = closing. MoMo collected = sum of collection rent portions. Dashboard = PDF = statement. |
| 15 | **Wallet reconciliation + alerts.** Daily cron compares Lenco wallet balance with (unclaimed successful collections + IPM fee float) and emails/SMSes **you** on mismatch. Also alerts on any stuck collection/payout and any failed cron. | 1 | A deliberately inserted mismatch triggers an alert within one run. |
| 16 | **Errors the landlord can see.** Sentry (frontend + edge functions), a React error boundary, and rollback of optimistic payment/adjustment state on failure. | 1 | A forced failed payment write disappears from the UI with an error. Sentry receives the event. |
| 17 | **Sign-up + account hygiene.** Route `/get-started`. Remove the fake MoMo number and the `due_day:30`/`"Pro"` defaults. Ensure `properties.slug` is unique with a suffix on collision. Tenant delete becomes move-out/archive only. | 1 | A new landlord signs up from the landing CTA. Two "Sunrise Lodge" accounts get distinct slugs. Collections survive "deleting" a tenant. |

### Week 4: launch readiness

| # | Item | Days | Done when |
|---|---|---|---|
| 18 | Real Privacy Policy and Terms (covers holding funds, payout timing, SMS, data). | 0.5 | Reviewed by someone who knows Zambian data-protection law. |
| 19 | **Hide everything not in v1.** Assistant, AI priority trigger, tasks/briefings, offline **write** queue (keep read cache), WhatsApp, product tour, stub marketing pages. | 0.5 | No route or nav entry reaches them. Offline mode is read-only with a banner. |
| 20 | **Real-money end-to-end run.** One property, 3 tenants, K50 payments on MTN and Airtel, one cash payment, one overpayment, one declined payment, one scheduled and one on-demand payout, then the statement. | 1 | Checklist signed. The statement ties to your Lenco dashboard to the ngwee. |
| 21 | **Pilot:** 1–2 friendly landlords for one full rent cycle before charging anyone new. | (calendar) | One month-end with zero manual DB fixes. |

**Total: about 19 dev-days**, or 4–5 calendar weeks solo.

---

## Parking lot (decided: not in v1)

Write new ideas here instead of building them.

| Item | Why parked | Revisit when |
|---|---|---|
| AI assistant (`assistant-chat`, 19 RPCs) | 19 RPCs not in repo, `assistant_query` unaudited, conversation ownership not checked | After 10 paying landlords ask for it |
| AI maintenance priority (Gemini) | Doesn't affect rent | Post-v1 |
| Today's tasks / AI briefings | Depends on correct balances; nice-to-have | After v1 is stable for 2 cycles |
| Automatic late-penalty accrual + waivers | Fragile live formula in 3 copies; v1 uses a manual late-fee charge | Build as materialised daily `penalty` events |
| Full deposit ledger with refund payouts | v1 records deposit status; refunds paid outside the app | When a landlord asks to refund through IPM |
| In-app subscription billing (bed tiers, setup fee, suspension) | Bill manually for the first 20 landlords | At about 20 landlords |
| Multi-property per account | `getOrCreatePrimaryProperty` assumes one | First landlord with two buildings |
| Invoice PDF generation | Statement covers v1; invoices must be re-pointed at the ledger | Post-v1 |
| WhatsApp sending | Placeholder, no auth | Post-v1 |
| Staff / payroll / clock-in kiosk | Already hidden; separate product | Not before product-market fit |
| Offline write queue | Causes M8 stale-balance overwrites | Only with server-side conflict resolution |
| Tenant OTP functions (`pay-portal-request/verify-otp`) | Superseded by token links | Delete |
| Disabled reports (bed rent roll, owner payout statement, payroll summary) | Covered by the monthly statement | On request |
| Room reservations, product tour, landlord SMS digests | Not rent-critical | Post-v1 |
| Marketing stubs (Careers, Status, Docs, Help) | Empty pages hurt credibility | Remove now, write later |
| Fee constants in one config table | Low risk while there are only 2 copies | When pricing next changes |
