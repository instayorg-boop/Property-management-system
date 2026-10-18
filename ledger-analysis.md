# IPM Financial Ledger Audit

> **Partly superseded, 18 October 2026.** This audit is kept as written, as the
> record of what the ledger looked like when it was reviewed. Since then the
> payment-allocation work has resolved or changed several of its findings, and
> `docs/BACKEND.md` ("How a payment is allocated" onwards) is now the current
> reference for all of them:
>
> - The "what did this payment pay for" question now has exactly one answer,
>   the Postgres function `allocate_payment`, read by every settlement path
>   through `supabase/functions/_shared/reconcileCollection.ts`. The
>   per-caller FIFO allocation described in sections 2 and 3 is gone.
> - Rent charges and one-off charges are unified by `tenant_charge_status`,
>   with overflow spillover, which removes the "counted differently in
>   different places" problem behind parts of F-1 and the section 5 table.
> - F-6's charge-matching fragility is reduced: the move-in charge created by
>   `AddTenant.tsx` now carries `billing_period_id` and the generator's own
>   `rent_charge:<tenant id>:<YYYY-MM>` idempotency key, so the label-parsing
>   fallback is no longer what stops a duplicate move-in month.
> - F-7's payout-balance workaround is unchanged in approach, but the
>   tenant-side service fee is no longer counted as collected money in
>   `getLencoBalance`, `assistant_get_payouts_summary` or the "Payments
>   received" report.
>
> Everything else below, in particular F-2 (deposits have no ledger), F-4 and
> F-5 (penalties and waivers), F-8 (payout claim concurrency) and the whole
> legacy-model backfill plan in section 7, still stands.


Scope: read-only review of the repo at `c:\Users\user\Desktop\Property management system`. No live DB connection was available (no service-role key / Supabase MCP access was exercised against this project), so findings are based on migrations (`supabase/migrations/*.sql`), edge functions (`supabase/functions/*`), and frontend/lib code. Section 4 lists the queries to run once DB access is available.

## 1. Executive summary

The system is mid-migration from a legacy mutable-balance model to a proper append-only financial-event ledger, and the migration history itself is unusually well documented (`phase2_ledger_foundation`, `phase3a_financial_events`, `phase3e_*`). The new model (charge/payment/penalty/adjustment/credit event types, idempotency keys, void-not-delete, FOR UPDATE row locking, compare-and-swap balance writes) is sound where it has been rolled out. The core risk is that **two ledger models coexist** (legacy `paid_amount`/`status` rows vs. new `event_type` rows) and almost every tenant in production likely still runs on the legacy path, where `tenants.owed_amount` is a stored, independently-mutated cache rather than a ledger-derived value.

Top 5 risks:
1. **Dual ledger model** — `calculate_tenant_balance` and `sync_tenant_balance_if_new_model` only activate for tenants with zero legacy rows; any tenant with history before Phase 3A is permanently stuck on the old mutate-in-place `owed_amount` path with no reconciliation check between the two models.
2. **Security deposits have no ledger at all** — they are plain columns on `tenants` (`deposit_amount`, `deposit_status`, `deposit_resolution_note`), with no transaction trail for partial refunds/forfeitures and no DB-level separation from the operating ledger.
3. **On-demand payout fee model vs documented 1.3%/flat-fee spec mismatch** — the tenant-side collection fee is a banded 1.25%-2% rate keyed to contracted rent (`pay-portal-collect-payment/index.ts`), not a flat 1.3%; landlord payouts carry Lenco's tiered fee **plus a flat K5 on-demand markup** not mentioned in the stated fee model, which is a margin point someone should confirm is intended.
4. **Floating-point currency** — `amount`/`owed_amount`/`fee_amount` etc. are Postgres `numeric` (good) but all arithmetic in JS/TS (edge functions, frontend) uses native `number` with manual `round2()` calls scattered per-file; a missed rounding call anywhere compounds over time.
5. **Reporting (Reports.tsx/generate-report) and the legacy balance path both read the same mutable `owed_amount`/`paid_amount` fields**, so arrears aging and statements are only as correct as whatever manual/webhook write last touched that tenant — there is no single source of truth to reconcile against.

## 2. Current architecture

Money-relevant tables (from migrations + `src/lib/database.types.ts`):

- **`tenants`** — per-tenant cached state: `owed_amount`, `status`, `days_overdue`, `on_time_count`, `total_months_count`, plus deposit fields (`deposit_amount`, `deposit_date`, `deposit_method`, `deposit_status`, `deposit_resolution_note`) and billing overrides (`due_day`, `grace_period_days`, `rent_amount`). Source of truth for current balance under the legacy model; mutated directly by `applyTenantSettlement` (compare-and-swap) and by `sync_tenant_balance_if_new_model` for new-model tenants.
- **`ledger_entries`** — the core transaction table. Legacy shape: `amount`/`paid_amount`/`status`/`label`/`source`/`method`/`period`. New-model columns (additive, Phase 2A/3A): `event_type` ('charge'|'payment'|'penalty'|'adjustment'|'credit'), `affects_balance`, `voided_at`/`void_reason`, `charge_id` (self-FK linking settlement to charge), `due_date`, `grace_period_end`, `billing_period_id`, `idempotency_key` (unique per tenant), `origin` ('billing_cycle'|'landlord_manual'|'lenco_webhook'|'system'|'penalty_waiver').
- **`collections`** — one row per tenant-initiated mobile-money payment attempt via Lenco (`supabase/migrations/20260908060000_collections.sql`): `amount`, `fee_amount`, `status` (pending/pay-offline/successful/failed), `line_items` (FIFO allocation across open charges), `payout_id` (null until claimed by a payout).
- **`payouts`** — one row per landlord withdrawal attempt (`20260908020000_payouts.sql`): `amount`, `fee_amount`, `net_amount`, `status` (pending/processing/successful/failed), `lenco_transaction_id`, `narration`, `failure_reason`.
- **`payout_recipients`** — bank/mobile-money destinations, `is_default`, `lenco_recipient_id`.
- **`property_balances`** — incremented via `pay_portal_increment_property_balance` RPC on each successful collection; appears to be a second cached running total alongside `collections`-derived sums used by `getLencoBalance`.
- **`banks`** — static Lenco bank-code cache (`sync-lenco-banks`).

Money flow today:
1. Rent charge created monthly by `generate-rent-charges` → `generateRentCharge.ts` (`supabase/functions/_shared/generateRentCharge.ts`), idempotent via `(tenant_id, idempotency_key)` unique index, cross-checked against legacy labeled rows by parsing month/year out of the label text (fragile, see Finding L-1).
2. Tenant pays via tokenized portal link → `pay-portal-collect-payment` calls Lenco, writes a `collections` row with a snapshotted fee and FIFO `line_items`.
3. `lenco-webhook` (push) or `pay-portal-check-collection` (poll fallback) both call the shared `reconcileSuccessfulCollection` (`supabase/functions/_shared/reconcileCollection.ts`), which: increments `property_balances`, then either writes a new-model `payment` event + `sync_tenant_balance_if_new_model` (if the tenant has zero legacy rows) or falls back to legacy `ledger_entries` inserts + compare-and-swap `tenants.owed_amount` update.
4. Landlord payout: `lenco-payout` edge function claims real unclaimed `collections` rows up to the requested cap via `pay_portal_claim_payout_collections` (atomic claim, not a plain read), computes tiered Lenco fee + K5 on-demand markup, calls Lenco, writes `payouts` row as pending→processing, and `lenco-webhook`/`check-payout-status` later flips it to successful/failed (failure triggers `pay_portal_release_payout_collections` to un-claim).
5. Scheduled payouts (`pay-portal-scheduled-payouts`) presumably follow the same claim/fee model minus the on-demand markup (not read in depth in this pass).

## 3. Findings

| ID | Severity | Area | Description | Evidence | Impact | Suggested fix |
|---|---|---|---|---|---|---|
| F-1 | Critical | Ledger integrity | Two balance models coexist. New-model sync (`sync_tenant_balance_if_new_model`) only runs for tenants with **zero** legacy (`event_type IS NULL`) rows; any tenant with pre-Phase-3A history is permanently excluded and stays on the old mutate-in-place path forever, with no migration path shown. | `supabase/migrations/20260920000000_phase3e_balance_sync_foundation.sql` lines 44-50, 103-111 | Every tenant onboarded before this migration never gets ledger-derived balances; the "authoritative" calculator exists but is dead code for the whole historical tenant base. | Design and run a backfill that classifies/tags historical rows with `event_type` (a one-time, carefully audited migration) so eligibility can flip, or build an explicit hybrid calculator rather than an all-or-nothing legacy/new split. |
| F-2 | Critical | Deposits | Security deposits are plain tenant columns (`deposit_amount`, `deposit_status`, `deposit_resolution_note`), not ledger rows. There is no deposit transaction table, so partial refunds, forfeitures, or multiple deposit top-ups have no audit trail — only the current status/amount is stored. | `src/lib/tenants.ts` lines 89-110, 482-530; `supabase/migrations/20260908090000_tenants_deposit_status_not_collected.sql` | Cannot produce a deposit ledger/statement, cannot prove how a "Partially refunded" amount was derived, no actor/timestamp for a refund decision. | Introduce a `deposit_entries` ledger (held/refund/forfeit/adjustment events, signed amounts, actor, reason, timestamp) separate from `ledger_entries`/operating balance, matching the target design in section 6. |
| F-3 | High | Fees | Tenant collection fee is **not** a flat 1.3%; it is a banded rate from 1.25% to 2% keyed to the tenant's contracted rent (`ONLINE_FEE_BANDS` in `pay-portal-collect-payment/index.ts` lines 59-70), duplicated by hand in `src/lib/pricing.ts` per the file's own comment (Deno can't import frontend code). Landlord on-demand payouts add a flat K5 markup on top of Lenco's tiered fee (`lenco-payout/index.ts` lines 65-82, `ON_DEMAND_MARKUP = 5`), not documented in the stated fee model. | `supabase/functions/pay-portal-collect-payment/index.ts` 58-70; `supabase/functions/lenco-payout/index.ts` 65-82 | Statements/landlord expectations may not match the stated 1.3%/no-markup design; hand-duplicated constants across 3+ files (`invoiceUtils.ts`, `payPortal.ts`, this file, `src/lib/pricing.ts`, `Payouts.tsx`'s own `FEE_TIERS` mirror) risk silent drift. | Centralize fee schedules in one DB-readable config table (even if edge functions still cache it) instead of N hand-synced literal copies; confirm with the business whether the K5 markup and banded rate are the intended, final pricing. |
| F-4 | High | Penalty engine | `generate-rent-charges`/`generateRentCharge.ts` only ever creates **charges**, not penalties. No penalty-accrual cron/edge function was found in this pass (`supabase/functions` list has no `*penalty*`/`*overdue*`-named function); overdue state is derived purely from `days_overdue` computed inside `sync_tenant_balance_if_new_model`/legacy triggers at read/sync time, not written as a discrete penalty ledger event for new-model tenants beyond `late_fee_config` settings. | `supabase/migrations/20261009010000_late_fee_config.sql` (config only); grep of `supabase/functions` for penalty-named functions returned none | Without a discrete, idempotent "penalty accrual" writer, two different syncs computing `days_overdue` at different times could disagree, and there is no durable record of "a K35 penalty was charged on this date" distinct from a live-recomputed number — this directly affects auditability (point 9) and the waiver logic's correctness (see F-5). | Confirm whether penalty amounts are ever materialized as ledger rows anywhere else in the codebase (not found in this pass) or are purely computed-on-read; if purely computed, document that explicitly since it conflicts with "penalties accrue daily" implying a discrete daily event. |
| F-5 | Medium | Penalty engine / waivers | The waiver-aware sync (`20260925000000_sync_balance_respects_penalty_waiver.sql`) measures "effective start" as `greatest(grace_period_end, last_waiver_date)`, so a waiver issued today permanently resets the overdue clock to today even if the charge was originally decades overdue — reasonable for the described "fresh grace period" behavior, but it silently treats *any* waiver (regardless of amount) as a full overdue-clock reset, with no partial-waiver semantics. | `supabase/migrations/20260925000000_sync_balance_respects_penalty_waiver.sql` lines 80-101 | A landlord who intends to waive only part of an accrued penalty gets the whole overdue clock reset. | Clarify intended semantics (full vs. partial waiver) and, if partial waivers are needed, add a waived-amount field rather than inferring everything from "a waiver event exists." |
| F-6 | Medium | Charge matching fragility | Duplicate-charge prevention in `generateRentCharge.ts` falls back to parsing the ledger label's free text for a month name + 4-digit year to detect a charge logged by another code path (manual logging, AddTenant move-in charge, seed data) that doesn't share `billing_period_id`. | `supabase/functions/_shared/generateRentCharge.ts` lines 50-66, 151-176 (`labelPeriod`) | A relabeled or differently-worded manual charge (e.g. no month name match, non-English label, or a label edited after creation) would not be detected as a duplicate, causing a tenant to be billed twice for the same month — the exact historical bug the comment describes already happened once ("six accounts"). | Make `billing_period_id` mandatory on every charge-creating code path (manual logging, move-in charge, seed scripts) going forward so duplicate detection never depends on label text; backfill `billing_period_id` for existing charge rows where derivable. |
| F-7 | Medium | Payout math | `getLencoBalance` (`src/lib/payoutApi.ts` lines 159-185) explicitly computes `available` as unclaimed successful collections net of fee — NOT `collected - paidOut` — because the latter "went negative" for properties with payouts predating the `payout_id` linkage. This is a documented workaround for a known data-quality gap rather than a fix. | `src/lib/payoutApi.ts` lines 159-185 | Any property with payouts from before the `payout_id` claim-tracking migration has an `available` figure that cannot be cross-checked against `collected - paidOut`; the two numbers will not reconcile and the UI gives no way to detect that a property is in this state. | Run a one-time backfill linking historical `payouts` to the `collections` rows they likely covered (by amount/date heuristics or ledger review), or flag affected properties so support knows their lifetime totals won't tie out. |
| F-8 | Medium | Concurrency / payout cap | `lenco-payout` claims real collections atomically via `pay_portal_claim_payout_collections` before calling Lenco (good — fixes a documented prior bug where amount was trusted from the request body). However, if the Lenco HTTP call itself times out or the function crashes after the claim but before `payouts` is updated to "processing"/"failed", the claimed collections stay linked to a payout row stuck at "pending" indefinitely (no explicit timeout/reclaim job was found). | `supabase/functions/lenco-payout/index.ts` lines 196-328; `check-payout-status` exists for the webhook-never-arrives case but is landlord-triggered, not automatic | Funds can appear claimed-but-stuck if the function dies mid-call with no automatic retry/timeout sweep, and a landlord would have to notice and manually invoke `checkPayoutStatus`. | Add a scheduled sweep for payouts stuck in `pending`/`processing` past N minutes that calls Lenco's status endpoint and resolves or releases them automatically. |
| F-9 | Low | Rounding | `round2()` is reimplemented in at least 3 files (`reconcileCollection.ts`, `lenco-payout/index.ts`, `pay-portal-collect-payment/index.ts`) rather than shared, consistent with the broader pattern of hand-duplicated constants (F-3) across the Deno/frontend boundary. | grep hits in each file | Low immediate risk (logic is identical today) but a classic source of drift if one copy is edited and others aren't. | Extract to `supabase/functions/_shared/money.ts` and import everywhere inside the edge functions (frontend already has its own equivalent, which is a separate, acceptable boundary). |
| F-10 | Low | Auditability | Voids are now append-only (`void_ledger_entry` sets `voided_at`/`void_reason`, never deletes — confirmed no remaining `ledger_entries...delete()` call in `src/lib/tenants.ts`; the only remaining hard-delete is `tenants.delete()` for deleting a whole tenant). This resolves the "biggest correctness problem" the Phase 2 comment itself called out. No further issue found here beyond lacking a generalized actor/reason column on every table (only `ledger_entries.void_reason` carries a reason; ordinary adjustment rows rely on `label` as free text for "why"). | `src/lib/tenants.ts` line 563 (`tenants` delete only), lines 694-702 (`voidLedgerEntry`) | Minor: adjustment "reason" is unstructured text inside `label`, not a dedicated field, making programmatic audit queries harder than they need to be. | Add a structured `reason`/`actor_id` pair to all manually-created ledger rows, not just voids. |

## 4. Live-data anomaly queries (could not run — no DB access in this pass)

No Supabase service-role credentials or live MCP connection were exercised in this audit session. Run the following against the project (e.g. via `supabase db` / SQL editor) once ready:

```sql
-- 1. Negative stored balances (should never happen)
select id, owed_amount from public.tenants where owed_amount < 0;

-- 2. Tenants where legacy owed_amount disagrees with the new calculator (only meaningful for
--    tenants eligible for sync_tenant_balance_if_new_model; run for all tenants to see the gap size)
select t.id, t.owed_amount as stored, b.balance as calculated
from public.tenants t
cross join lateral public.calculate_tenant_balance(t.id) b
where round(t.owed_amount, 2) <> round(b.balance, 2);

-- 3. Orphan payments: new-model payment/adjustment rows pointing at a charge_id that doesn't exist
--    or was voided while still linked (should be blocked by charge_has_active_linked_events, verify)
select le.id, le.charge_id
from public.ledger_entries le
left join public.ledger_entries c on c.id = le.charge_id
where le.charge_id is not null and (c.id is null or c.voided_at is not null);

-- 4. Duplicate charges for the same tenant+month (billing_period_id or label-derived)
select tenant_id, billing_period_id, count(*)
from public.ledger_entries
where event_type = 'charge' and voided_at is null and billing_period_id is not null
group by tenant_id, billing_period_id
having count(*) > 1;

-- 5. Collections claimed by a payout that never completed (stuck funds, see F-8)
select p.id, p.status, p.created_at, count(c.id) claimed_collections
from public.payouts p
join public.collections c on c.payout_id = p.id
where p.status in ('pending','processing') and p.created_at < now() - interval '1 day'
group by p.id, p.status, p.created_at;

-- 6. Payouts with amount > sum of their claimed collections net of fee (should never happen)
select p.id, p.amount, sum(c.amount - coalesce(c.fee_amount,0)) as claimed_net
from public.payouts p
join public.collections c on c.payout_id = p.id
group by p.id, p.amount
having p.amount > sum(c.amount - coalesce(c.fee_amount,0)) + 0.01;

-- 7. Idempotency-key collisions that somehow landed anyway (shouldn't be possible given the
--    unique index, but worth confirming the index actually exists in prod)
select tenant_id, idempotency_key, count(*)
from public.ledger_entries
where idempotency_key is not null
group by tenant_id, idempotency_key
having count(*) > 1;

-- 8. Deposit amounts with no corresponding record of how the current status was reached
--    (there is currently no table to query here — this itself is F-2's evidence; once a
--    deposit_entries ledger exists, check sum(deposit_entries) reconciles to tenants.deposit_amount)
```

## 5. Gaps against the target (first-class ledger entries)

| Concept | Current state | Gap |
|---|---|---|
| Rent charge | `event_type = 'charge'` row, has `billing_period_id`, `due_date`, `grace_period_end` | Solid for new-model tenants; legacy tenants have no equivalent typed row. |
| Penalty | Computed at read/sync time (`days_overdue`) from grace_period_end vs now; no discrete penalty ledger row found materializing a specific K amount on a specific date for new-model tenants | Needs a real daily/periodic penalty-accrual writer producing discrete, idempotent `event_type='penalty'` rows (one per day or per period), not just a derived number. |
| Added charge | Manual `ledger_entries` insert, presumably `source='manual'`/`event_type` unset or 'charge' depending on code path | Needs to consistently use `event_type='charge'` + `origin='landlord_manual'` with billing_period_id where applicable. |
| Removed charge / waiver | Represented via `void_ledger_entry` (voids) or an `origin='penalty_waiver'` adjustment row | Reasonably well modeled for new-model tenants; no equivalent for legacy rows beyond the pre-existing "Late penalty waived" label match (`affects_balance=false` backfill). |
| Credit / refund / reversal | `event_type` enum includes `credit`; no explicit `reversal` type seen — a reversal is presumably just a void + an offsetting adjustment | Define whether a "reversal" should be its own typed, linked event (reversal_of = original event id) rather than an untyped adjustment, for cleaner audit queries. |
| Deposit | Plain `tenants` columns, no ledger | Needs a dedicated `deposit_entries` ledger entirely separate from `ledger_entries` (see F-2). |

## 6. Recommended target design

Entry types (single enum, enforced at the DB level, not just convention): `charge`, `payment`, `penalty`, `adjustment`, `credit`, `reversal`, `deposit_hold`, `deposit_refund`, `deposit_forfeit`.

Tables:
- `ledger_entries` (operating balance only) — continue the Phase 3A shape: append-only, `voided_at`/`void_reason` instead of delete, `event_type` NOT NULL for all new rows, `charge_id` self-FK for settlement linkage, `idempotency_key` unique per tenant, `origin` for provenance, signed `amount` (charges/penalties positive, payments/credits negative).
- `deposit_entries` (new, separate ledger) — same append-only/void shape, scoped to `tenant_id`, entry types `deposit_hold`/`deposit_refund`/`deposit_forfeit`/`deposit_adjustment`, each with `actor_id`, `reason`, `created_at`. `tenants.deposit_amount`/`deposit_status` become a cached projection of `sum(deposit_entries)` + latest status, not the source of truth.
- Drop reliance on `tenants.owed_amount` as a writable field long-term; keep it only as a materialized, trigger- or RPC-refreshed cache of `calculate_tenant_balance`, same pattern already built in Phase 2B/3E — just extend eligibility to all tenants once backfilled.

Invariants:
1. `ledger_entries` and `deposit_entries` are append-only — no UPDATE of `amount`/`event_type` after insert, no DELETE ever (enforce with a REVOKE on UPDATE/DELETE grants or a trigger, not just application discipline — the current legacy `tenants.delete()` path and any lingering direct table UPDATE access should be checked against this).
2. `balance = sum(signed amount) where voided_at is null and affects_balance = true` — already implemented in `calculate_tenant_balance`; make this the only writer of `tenants.owed_amount` for all tenants, not a subset.
3. Every machine-originated row carries `idempotency_key`; every landlord-initiated row carries an actor and a reason.
4. A charge cannot be voided while non-voided settling events reference it (`charge_has_active_linked_events`) — already implemented, extend the same FK-linkage pattern to deposits.
5. Reversals reference the event they reverse (`reversal_of_id`) rather than being inferred from a free-text label.

Reversals/waivers: a reversal is a new row (`event_type='reversal'`, `reversal_of_id` pointing at the original), not a mutation of the original row or a bare adjustment — this keeps "what actually happened and when" fully reconstructable, unlike inferring waivers from label text matching as the current legacy backfill does.

## 7. Migration plan

1. **Classify, don't guess, legacy rows.** For every tenant currently excluded from `sync_tenant_balance_if_new_model` (has at least one `event_type IS NULL` row), run a read-only classification pass that maps each legacy row to the inferred new `event_type` using the same rules already encoded in `calculate_tenant_balance`'s CASE statement — write the result to a staging table first, do not write `event_type` onto production rows until a sample has been manually verified against the tenant's actual statement history.
2. **Backfill `event_type` on verified-correct historical rows only**, in batches per property, with a dry-run diff (`old computed owed_amount via legacy rules` vs. `calculate_tenant_balance` after backfill) that must match before committing the batch.
3. **Flip eligibility** for a backfilled property's tenants (remove the `v_has_legacy` skip) and re-run `sync_tenant_balance_if_new_model` for all of them; diff against the old `owed_amount` and require a human sign-off on any property where the two disagree by more than a rounding tolerance before going live on that property.
4. **Build `deposit_entries` alongside, not instead of**, the existing `tenants.deposit_*` columns initially: write new deposit transactions to both the new table and the old columns, verify they agree over a full cycle, then make the old columns a read-only projection.
5. **Verification queries after each step**: query 1 and 2 from section 4 against the affected properties; additionally confirm `sum(ledger_entries where tenant_id=X) == tenants.owed_amount` for every migrated tenant.
6. **Do not touch** in-flight payouts/collections during a migration window — pause `generate-rent-charges`/webhooks for a property only for the minutes needed to flip its eligibility flag, not longer.

## 8. Open questions for the user

1. Is there a separate penalty-accrual function/cron not covered by this pass (e.g. in n8n, which was not found exported anywhere in this repo) — if penalties are computed entirely on-read today, is that the intended design or a gap?
2. Is the K5 on-demand payout markup and the banded 1.25%-2% tenant collection fee the final, approved pricing, or does it need to be reconciled with the "1.3% flat" and "no-markup payout fee" description given for this audit?
3. For properties whose lifetime `collected - paidOut` doesn't reconcile (F-7), is a manual reconciliation pass acceptable, or does this need an automated backfill?
4. What is the intended semantics of a partial penalty waiver (F-5) — should a waiver always reset the full overdue clock, or does the business need partial-amount waivers?
5. Is `n8n` actually used in production for any of these financial flows (penalty accrual, reminders, payouts)? No exported workflow JSON was found in this repo; confirm whether automations live entirely in Supabase edge functions/cron instead.
6. What is the target timeline/appetite for the legacy-to-new-model backfill (section 7) — it touches every historical tenant and is the single highest-leverage fix available.
