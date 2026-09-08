-- The frontend's DepositStatus type (src/lib/tenants.ts) has always included "Not collected" (the
-- default for a tenant whose room has no deposit, e.g. deposit_amount = 0) but the database check
-- constraint never allowed it — only Held/Refunded/Forfeited/Partially refunded. This never showed
-- up because every seed tenant had a real deposit; it surfaced now testing a K0-deposit room type.

alter table public.tenants drop constraint if exists tenants_deposit_status_check;
alter table public.tenants add constraint tenants_deposit_status_check
  check (deposit_status = any (array['Not collected', 'Held', 'Refunded', 'Forfeited', 'Partially refunded']));
