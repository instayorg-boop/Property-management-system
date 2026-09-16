-- Phase 2A — ledger event-model foundation. Purely additive: four nullable-or-defaulted columns
-- plus one targeted backfill. Does NOT redesign any payment flow, does NOT make owed_amount
-- ledger-derived, does NOT add a trigger, does NOT change what amount/paid_amount mean on any
-- existing row, and does NOT touch the UI. See the Phase 2 ledger-mapping analysis (chat history)
-- for the full classification this is built on.

alter table public.ledger_entries
  -- Preserves financial history instead of hard-deleting it. A voided row stays in the table
  -- permanently — deleteLedgerEntry (lib/tenants.ts) currently does a real DELETE, which the audit
  -- flagged as the single biggest correctness problem in the whole system: deleting a payment row
  -- removes the evidence it existed but leaves owed_amount/status exactly as the payment had
  -- already set them, permanently forgiving real debt with no trace. voided_at/void_reason exist
  -- so a future correction can mark a row void (and why) without erasing it — that migration of
  -- deleteLedgerEntry itself is NOT part of this change; these columns are only the foundation.
  add column if not exists voided_at timestamptz null,
  add column if not exists void_reason text null,

  -- Distinguishes a row that's a real financial event (a charge or payment that should count
  -- toward the tenant's balance) from an audit-only entry that documents something without itself
  -- changing what's owed. The concrete case this exists for: waivePenalty's ledger row records
  -- "a K-amount penalty was waived, and why" for history's sake, but that penalty was never added
  -- to owed_amount in the first place (it's always been a live-computed value, never stored) — so
  -- summing that row as an ordinary negative adjustment would double-subtract an amount that was
  -- never really there, creating phantom credit. affects_balance = false is how such rows opt out
  -- of any future balance derivation while staying fully visible in history. Defaults to true
  -- because every other existing row (manual payments, real adjustments) really is a financial
  -- event and should count.
  add column if not exists affects_balance boolean not null default true,

  -- The explicit event classification (e.g. 'charge', 'payment', 'adjustment') for rows going
  -- forward. Left nullable and unbackfilled here on purpose — existing rows' event meaning can
  -- already be inferred from source/paid_amount the same way the application does today (a
  -- source='manual' row with no paid_amount nets to zero against the balance; one with paid_amount
  -- less than amount nets to the remainder), so guessing and writing a value onto 109 historical
  -- rows isn't necessary for correctness and risks encoding a wrong guess as if it were fact. New
  -- code introduced in a later phase can start populating this explicitly.
  add column if not exists event_type text null;

-- Targeted backfill — every row matching source='adjustment' with a "Late penalty waived" label,
-- the class the Phase 2 analysis identified as unsafe to sum as an ordinary adjustment (see the
-- affects_balance comment above). This is the only label waivePenalty (TenantsContext.tsx) ever
-- writes, so the match is exact, not a guess. No other existing row is touched: every other row
-- keeps affects_balance at the column default (true), including the "Broken Window"/"broken door"
-- charge-adjustment rows (source='adjustment' but not this label) and every manual/lenco payment row.
update public.ledger_entries
set affects_balance = false
where source = 'adjustment'
  and label like 'Late penalty waived%';
