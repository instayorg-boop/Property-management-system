-- Phase 3A — financial-event schema for NEW transactions only (design approved in chat history).
-- Purely additive: six nullable columns plus three supporting indexes. Does NOT touch owed_amount,
-- does NOT backfill or modify any existing row, does NOT add parent_event_id (deferred), does NOT
-- add any trigger or generation job, and does NOT change any payment/reconciliation/UI code path.
-- Builds directly on the Phase 2A columns (voided_at, void_reason, affects_balance, event_type)
-- added in 20260917000000_phase2_ledger_foundation.sql.

alter table public.ledger_entries
  -- The 'YYYY-MM' billing period a new charge/penalty belongs to. Distinct from the existing
  -- free-text `period` column (still used by legacy manual-payment rows) — new code populates
  -- this one going forward rather than overloading `period`'s existing, looser meaning.
  add column if not exists billing_period_id text null,

  -- Points a payment or adjustment row at the specific charge (or adjustment) row it settles.
  -- Self-referencing FK on purpose: lets "how much of this charge has been paid" be answered by
  -- summing rows with charge_id = <that charge's id> instead of inferring it from ordering/labels.
  -- Null is valid — a payment not attributable to one specific debit still stands on its own.
  add column if not exists charge_id uuid null references public.ledger_entries(id),

  -- Computed once, at charge-creation time, from settings.due_day (or the tenant-level override)
  -- and stored rather than derived on read, so a later change to settings.due_day can't silently
  -- rewrite the due date of a charge that already exists.
  add column if not exists due_date date null,

  -- Computed once, at charge-creation time, from settings.grace_period_days (or the tenant-level
  -- override in tenants.grace_period_days). Same stored-not-derived rationale as due_date.
  add column if not exists grace_period_end date null,

  -- De-duplication key for machine-originated rows (a billing-cycle generator, the Lenco webhook,
  -- or its polling fallback) so a retried job or a webhook/poll race can't insert the same event
  -- twice. Enforced below via a partial unique index on (tenant_id, idempotency_key). Left blank
  -- for landlord-initiated manual rows, which don't need it.
  add column if not exists idempotency_key text null,

  -- Why the row exists (system-generated vs. landlord-initiated), independent of the existing
  -- `source` column which already means "which payment rail moved money" (manual/lenco/adjustment).
  -- Expected values going forward: 'billing_cycle' | 'landlord_manual' | 'lenco_webhook' | 'system'.
  -- Left null on rows this phase doesn't touch.
  add column if not exists origin text null;

-- One idempotency key can only be used once per tenant. Partial (idempotency_key is not null) so
-- it imposes nothing on the historical rows or any row a future manual write leaves blank.
create unique index if not exists ledger_entries_idempotency_key_uniq
  on public.ledger_entries (tenant_id, idempotency_key)
  where idempotency_key is not null;

-- Fast "sum everything settling this charge" lookups. Partial so it stays cheap and small — most
-- existing rows (and plenty of new ones, e.g. tenant-level adjustments) have no charge_id at all.
create index if not exists ledger_entries_charge_id_idx
  on public.ledger_entries (charge_id)
  where charge_id is not null;

-- Fast "this tenant's events for billing period X" lookups. Partial for the same reason as above —
-- no historical row will ever have billing_period_id set.
create index if not exists ledger_entries_billing_period_idx
  on public.ledger_entries (tenant_id, billing_period_id)
  where billing_period_id is not null;
