-- Reconciliation migration: captures schema that was created directly via the Supabase dashboard
-- SQL editor (14 migrations applied remotely with no local file — see chat history) so the local
-- migrations folder matches what's actually live. Written idempotently (IF NOT EXISTS / CREATE OR
-- REPLACE) since the exact historical diffs per dashboard edit aren't recoverable, only the final
-- state — safe to run against a database that already has some or all of this.
--
-- Scope: only the two pieces relevant to the tenant-balance audit currently underway
-- (property_balances, ledger_entries.period). The pay_portal_*/assistant_* RPC functions that were
-- also edited live in the dashboard are NOT re-created here — their current bodies are already
-- confirmed correct via direct introspection (see chat), and mechanically dumping every function
-- into a migration risks silently reverting a dashboard edit this file doesn't know about. Treat
-- those as a separate "bring supabase/functions in sync" pass if/when needed.

-- property_balances: the landlord-level "available to withdraw" running total, incremented
-- atomically by pay_portal_increment_property_balance (a single UPSERT — confirmed race-free,
-- unlike tenants.owed_amount's read-then-write pattern flagged in the audit).
create table if not exists public.property_balances (
  property_id uuid primary key references public.properties(id) on delete cascade,
  available_balance numeric(12,2) not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.property_balances enable row level security;

drop policy if exists "property_balances_select" on public.property_balances;
create policy "property_balances_select" on public.property_balances for select using (
  property_id in (select id from public.properties where owner_id = auth.uid())
);

-- ledger_entries.period: a billing-period tag (e.g. "2026-09") that exists on the live table but
-- is not populated by any current write path (logPayments, reconcileCollection, addAdjustment) and
-- isn't in the app's TypeScript types — this is the "period-tagged charge" concept the balance
-- audit identified as the one genuinely missing piece, already sitting unused in the schema.
alter table public.ledger_entries add column if not exists period text;
