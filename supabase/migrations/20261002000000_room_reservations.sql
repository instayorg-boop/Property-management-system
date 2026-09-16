-- Lets a landlord hold a specific vacant room for a specific (currently inactive) returning
-- tenant — e.g. a student who's home for the break but has paid to keep their bed for next
-- semester — and log that holding fee, without reactivating them (which would resume full rent
-- billing) or losing their existing profile/history.
--
-- The reservation fee is deliberately separate from the rent ledger (not a ledger_entries row):
-- per product decision, it's a non-refundable charge that does NOT count toward the first month's
-- rent once the tenant reactivates — mirrors how deposit_amount/deposit_status already sit outside
-- ledger_entries for the same reason.

alter table public.rooms
  add column if not exists reserved_for_tenant_id uuid references public.tenants(id) on delete set null;

alter table public.tenants
  add column if not exists reservation_fee_amount numeric,
  add column if not exists reservation_fee_date text,
  add column if not exists reservation_fee_method text,
  add column if not exists reservation_fee_collected boolean not null default false;
