# 07 — Live database findings

*Run 2026-10-14 against project `rlmcuhejgfftcdshbrbe` via the Supabase MCP. Every query was read-only (`SELECT` only). Nothing was written.*

These results **override** the code-only conclusions in 01–05 where they disagree. Corrections are listed at the bottom.

## Who is on the system

| Metric | Value |
|---|---|
| Auth users / property owners / properties | 7 / 6 / 7 (all gmail.com or mail.com addresses) |
| Active tenants | 20 |
| Ledger rows | 87 |
| Collections (tenant payments) | 8. **Zero real money received.** 4 are `DEV-SIMULATED`, 1 is a hand-inserted `MANUAL-TOPUP-20260930`, 1 simulated failure, 2 real attempts still `pay-offline` |
| Payouts | 8: 4 seeded "successful" (no Lenco id), 2 failed "Insufficient Balance in Debit Account", **2 stuck `processing` since 2 Oct** (K21,140 and K1,600) |

**Read this as: pre-launch, test data only.** That's good news. Every data problem below can be fixed by resetting test data instead of migrating customer money.

## Critical: confirmed live

### L1. Anyone on the internet can list every tenant's name, room and balance — CRITICAL
These old portal functions were never dropped, and `anon` can execute them:

| Function | Input | Returns |
|---|---|---|
| `pay_portal_search_tenants` (v1) | property slug only | `id, name, room, owed_amount` for every tenant |
| `pay_portal_get_tenant` (v1) | slug + tenant id | name, room, status, rent, balance, days overdue |
| `pay_portal_get_ledger` (v1) | tenant id only | full ledger |
| `pay_portal_submit_maintenance_report` (v1) | slug + tenant id | submits a maintenance report without a token |

Slugs are the property name in lowercase with hyphens (and unique). So `sunrise-lodge` plus the public anon key from your JS bundle dumps that property's whole tenant roster with balances. This is a data-protection incident waiting to happen.

**Fix:** drop all four today.

### L2. `pay_portal_log_payment_v2` is executable by `anon` — CRITICAL (confirms S1)
ACL includes `anon=X`. A tenant's link token is enough to mark them paid.

### L3. Payout claim/release are executable by `authenticated` — CRITICAL (confirms S2)
Both `pay_portal_claim_payout_collections` and `pay_portal_release_payout_collections` have `authenticated=X`.

### L4. Historical paid rent is now counted as owed — CRITICAL (replaces M1)
Someone reclassified legacy rows to `event_type='charge'` but left their legacy `paid_amount`/`status='paid'` in place. Live `calculate_tenant_balance` treats any row with an `event_type` at its face `amount` and ignores `paid_amount`. Example tenant:

| Row | event_type | amount | paid_amount | status |
|---|---|---|---|---|
| Rent - Jul 2026 | charge | 1800 | 1800 | paid |
| Rent - Aug 2026 | charge | 1800 | 1800 | paid |
| Rent - Sep 2026 | charge | 1800 | 1800 | paid |
| October 2026 rent | charge | 1800 | — | — |
| **Live balance** | | **7,200** | | should be 1,800 |

About **10 of 20 active tenants** show K6,000–K7,500 owed for the same reason. Every screen, the portal "pay" amount and the reminder SMS read this number. A real tenant would be asked to pay 3–4 months they already paid.

There's also drift between `owed_amount` and the calculated balance:
- 2 tenants calculate as **negative** (−900, −1,440) but show 0.
- The 1 remaining legacy tenant calculates 400 but shows 0.

### L5. Every new landlord's first login will fail — CRITICAL (new)
Repo migration `20261009010000_late_fee_config.sql` was **never applied** live. The `settings` table has no `late_fee_enabled / late_fee_mode / late_fee_percent / late_fee_cap_*` columns. But `getOrCreateSettings` inserts them (`src/lib/settingsApi.ts:30-34`). PostgREST rejects unknown columns, so a brand-new property's settings row can't be created. Existing test accounts already have settings rows, which is why you haven't seen it.

Separately, `pay-portal-collect-payment` selects those columns (`index.ts:156`). The error is ignored and it falls back to defaults (late fee **on**, prorated).

## High

### L6. A third ledger exists only in the database
Nine live migrations are not in the repo: `ledger_v2_schema`, `ledger_v2_payout_account`, `ledger_v2_rpcs`, `ledger_v2_penalty_cron`, plus five `*_fix` migrations from 2026-10-04. They created:
- **Tables:** `ledger_entries_v2` (40 rows), `ledger_entries_legacy_archive` (0), `ledger_entry_type_rules`, `ledger_feature_flags`, `ledger_v2_date_exceptions`, `fee_config`, `property_managers`.
- **Views:** `tenant_balance_view`, `tenant_ledger_view`, `arrears_aging_view`, `payout_ledger_view`, `period_status_view`.
- **Functions:** `ledger_v2_*`, `pay_portal_get_balance_v2`, `pay_portal_get_statement_v2`.
- **Cron jobs:** `ledger_v2_daily_penalty_accrual` and `ledger_v2_reclaim_stuck_payouts` (every 15 min).

It's switched on for one landlord ("TEST landlord (demo@gmail.com)"), `cutover_completed_at` is null, and no app code references these tables. **You currently have three ledger models** (legacy, event-model `ledger_entries`, `ledger_entries_v2`).

`ledger_v2_reclaim_stuck_payouts` reverses a payout's ledger entry after 15 minutes **without asking Lenco** whether the transfer went through. That's the same double-pay pattern as M3, now on a timer.

### L7. Real money attempts are stuck, and the payout job tried to pay out simulated money
- 2 real collections (K357, K51) have been `pay-offline` since 7 Oct. Check the Lenco dashboard for whether these tenants were actually debited.
- 2 scheduled payouts (K21,140, K1,600) have been `processing` since 2 Oct, with real Lenco transaction ids. The earlier attempts for the same K21,140 failed with "Insufficient Balance in Debit Account". **The scheduled payout claimed `DEV-SIMULATED` and `MANUAL-TOPUP` collections and tried to send them from the real wallet.** `pay_portal_claim_payout_collections` doesn't exclude simulated rows. If the pooled wallet had held other landlords' money, that transfer would have succeeded.
- Nothing has resolved these in 12 days. The v2 reclaim cron only covers `ledger_entries_v2` rows.

### L8. Cron secret in plain text, and payouts scheduled twice
Cron job `daily-payout-check` (job 1, 06:00 UTC) has the `CRON_SECRET` value written in its command, visible to anyone who can read `cron.job`. **Rotate `CRON_SECRET`.** It calls `pay-portal-scheduled-payouts`, the same function as job 6 at 06:10, so payouts run twice each morning. Only the in-flight check stops a double send.

### L9. Overdue days never advance — confirmed (W6)
All 20 tenants have `days_overdue` 0 or null, including ~10 showing K7,200 owed with October's charge past due. No penalty, escalation or overdue task will fire from this column.

## Medium / informational
- 1 duplicate rent charge (same tenant and billing period).
- The 1 remaining legacy tenant is legacy because of a `Security deposit` row with `event_type NULL`, exactly the W2 mechanism. Every new tenant whose deposit is recorded will join them.
- `sms_send_log`: 8 rows, all `sent`. I can't tell from the DB whether they were real or dev-mode.
- Vault secrets `cron_secret` and `functions_base_url` exist, and all 8 cron jobs report success for 14 days. HTTP responses that were still retained were all 200.
- `collections.tenant_id` / `property_id` are `ON DELETE CASCADE` (confirms M10). `collections.payout_id` has no cascade.

## Corrections to 01–05

| Earlier claim | Live truth |
|---|---|
| M1: "most tenants are legacy and never re-billed" | Only 1/20 is legacy. The bigger live bug is the **opposite**: paid history is re-billed (L4). The deposit→legacy mechanism is still real for new tenants. |
| S5: `assistant_query` might be injectable | **Safe.** It allow-lists views, uses `%I`/`%L`, and runs as invoker under RLS. The remaining assistant issue is the unchecked `conversationId`. |
| S6: `pay_portal_increment_property_balance` executable by anon | **Wrong.** It's revoked (only postgres and service_role). |
| W1: slug may not be unique | It **is** unique (`properties_slug_key`). A second landlord with the same property name gets an error on property creation instead. Still a bug, just a different one. |
| Views without RLS | All 10 views are `security_invoker=true`, so RLS applies. OK. |
| Tables without RLS | None. All 42 base tables have RLS on. |
