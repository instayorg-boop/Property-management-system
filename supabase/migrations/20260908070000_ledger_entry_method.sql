-- Every ledger entry — cash logged manually by the landlord, or a real mobile-money payment via
-- the tenant portal — currently looks identical: amount, label, status, date. There's no way to
-- tell how a payment was actually made. This adds that.
--
-- Additive/backfill-safe: existing rows get method = null (unknown — they predate this column),
-- shown in the UI as "Manual" rather than guessed at.

alter table public.ledger_entries
  add column if not exists method text check (method is null or method in ('cash', 'mobile-money', 'bank-transfer', 'other'));
