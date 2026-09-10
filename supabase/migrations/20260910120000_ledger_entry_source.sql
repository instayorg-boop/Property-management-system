-- A landlord can delete/correct a payment they typed in by hand, but a real mobile-money payment
-- verified by Lenco (lenco-webhook / pay-portal-check-collection) must not be deletable from the
-- UI — that would let a landlord erase a real, tenant-initiated transaction record. `method`
-- alone can't distinguish these: a manually-logged "mobile money" entry and a real Lenco payment
-- both end up with method = 'mobile-money'. This column is the actual distinction.
--
-- Additive/backfill-safe: existing rows get source = 'manual' (the only path that existed before
-- Lenco collections did), which is also the correct answer for every one of them.

alter table public.ledger_entries
  add column if not exists source text not null default 'manual' check (source in ('manual', 'lenco'));
