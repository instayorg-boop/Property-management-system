-- Phase 3E test script — NOT a migration, NOT run automatically. Paste-and-run manually in a SQL
-- Editor (staging strongly preferred; safe on production too since it's transaction-wrapped and
-- rolls back at the end either way — nothing here is left behind regardless of where it runs).
--
-- Covers the 7 required scenarios for sync_tenant_balance_if_new_model:
--   A. charge only                          -> balance 2000, unpaid
--   B. charge + one payment                  -> balance 1000, partial
--   C. charge fully paid                     -> balance 0, paid
--   D. void the only payment                 -> charge balance restored (back to 2000, unpaid)
--   E. voided charge, no linked events       -> balance drops to 0 (the charge no longer counts)
--   F. mixed/legacy tenant                   -> synchronization skipped, nothing written
--   G. audit-only event (affects_balance=false) -> no balance effect
--
-- Each scenario gets its own throwaway property+settings+tenant, created and asserted inside one
-- transaction, then everything rolls back — no real data is created or modified.

begin;

-- One throwaway property + settings row, shared by every scenario tenant below.
insert into public.properties (id, owner_id, name)
values ('00000000-0000-0000-0000-0000000003e0', (select id from auth.users limit 1), 'Phase 3E test property');

insert into public.settings (property_id, due_day, grace_period_days)
values ('00000000-0000-0000-0000-0000000003e0', 5, 3);

-- --------------------------------------------------------------------------------------------
-- A. +2000 charge only -> balance 2000, status unpaid
-- --------------------------------------------------------------------------------------------
insert into public.tenants (id, property_id, name, move_in_date, rent_amount, status, owed_amount, deposit_amount, deposit_status, active)
values ('00000000-0000-0000-0000-00000000003a', '00000000-0000-0000-0000-0000000003e0', 'Scenario A', '1 Jan 2026', 2000, 'unpaid', 0, 0, 'Not collected', true);

insert into public.ledger_entries (tenant_id, label, amount, source, event_type, affects_balance, origin, billing_period_id, due_date, grace_period_end, idempotency_key)
values ('00000000-0000-0000-0000-00000000003a', 'Sept rent', 2000, 'manual', 'charge', true, 'billing_cycle', '2026-09', (current_date + 5), (current_date + 8), 'rent_charge:a:2026-09');

do $$
declare r record;
begin
  select * into r from public.sync_tenant_balance_if_new_model('00000000-0000-0000-0000-00000000003a');
  if not (r.synchronized and r.balance = 2000 and r.status = 'unpaid') then
    raise exception 'Scenario A FAILED: %', row_to_json(r);
  end if;
  raise notice 'Scenario A OK: %', row_to_json(r);
end $$;

-- --------------------------------------------------------------------------------------------
-- B. +2000 charge, -1000 payment -> balance 1000, partial
-- --------------------------------------------------------------------------------------------
insert into public.tenants (id, property_id, name, move_in_date, rent_amount, status, owed_amount, deposit_amount, deposit_status, active)
values ('00000000-0000-0000-0000-00000000003b', '00000000-0000-0000-0000-0000000003e0', 'Scenario B', '1 Jan 2026', 2000, 'unpaid', 0, 0, 'Not collected', true);

insert into public.ledger_entries (id, tenant_id, label, amount, source, event_type, affects_balance, origin, billing_period_id, due_date, grace_period_end, idempotency_key)
values ('00000000-0000-0000-0000-0000000c3a1b', '00000000-0000-0000-0000-00000000003b', 'Sept rent', 2000, 'manual', 'charge', true, 'billing_cycle', '2026-09', (current_date + 5), (current_date + 8), 'rent_charge:b:2026-09');

insert into public.ledger_entries (tenant_id, label, amount, source, event_type, affects_balance, origin, charge_id, idempotency_key)
values ('00000000-0000-0000-0000-00000000003b', 'Partial payment', -1000, 'manual', 'payment', true, 'landlord_manual', '00000000-0000-0000-0000-0000000c3a1b', 'manual_payment:b1');

do $$
declare r record;
begin
  select * into r from public.sync_tenant_balance_if_new_model('00000000-0000-0000-0000-00000000003b');
  if not (r.synchronized and r.balance = 1000 and r.status = 'partial') then
    raise exception 'Scenario B FAILED: %', row_to_json(r);
  end if;
  raise notice 'Scenario B OK: %', row_to_json(r);
end $$;

-- --------------------------------------------------------------------------------------------
-- C. +2000 charge, -2000 payment -> balance 0, paid
-- --------------------------------------------------------------------------------------------
insert into public.ledger_entries (tenant_id, label, amount, source, event_type, affects_balance, origin, charge_id, idempotency_key)
values ('00000000-0000-0000-0000-00000000003b', 'Remaining payment', -1000, 'manual', 'payment', true, 'landlord_manual', '00000000-0000-0000-0000-0000000c3a1b', 'manual_payment:b2');

do $$
declare r record;
begin
  select * into r from public.sync_tenant_balance_if_new_model('00000000-0000-0000-0000-00000000003b');
  if not (r.synchronized and r.balance = 0 and r.status = 'paid') then
    raise exception 'Scenario C FAILED: %', row_to_json(r);
  end if;
  raise notice 'Scenario C OK: %', row_to_json(r);
end $$;

-- --------------------------------------------------------------------------------------------
-- D. void the only payment (back on scenario A's tenant, add + then void one payment)
--    -> charge balance restored to 2000, unpaid
-- --------------------------------------------------------------------------------------------
insert into public.ledger_entries (id, tenant_id, label, amount, source, event_type, affects_balance, origin, charge_id, idempotency_key)
values ('00000000-0000-0000-0000-0000000d0001', '00000000-0000-0000-0000-00000000003a', 'Payment to be voided', -2000, 'manual', 'payment', true, 'landlord_manual',
  (select id from public.ledger_entries where tenant_id = '00000000-0000-0000-0000-00000000003a' and event_type = 'charge'),
  'manual_payment:d1');

-- confirm it settled first
do $$
declare r record;
begin
  select * into r from public.sync_tenant_balance_if_new_model('00000000-0000-0000-0000-00000000003a');
  if not (r.balance = 0 and r.status = 'paid') then
    raise exception 'Scenario D precondition FAILED: %', row_to_json(r);
  end if;
end $$;

update public.ledger_entries set voided_at = now(), void_reason = 'test: voiding the only payment'
where id = '00000000-0000-0000-0000-0000000d0001';

do $$
declare r record;
begin
  select * into r from public.sync_tenant_balance_if_new_model('00000000-0000-0000-0000-00000000003a');
  if not (r.synchronized and r.balance = 2000 and r.status = 'unpaid') then
    raise exception 'Scenario D FAILED: %', row_to_json(r);
  end if;
  raise notice 'Scenario D OK: %', row_to_json(r);
end $$;

-- --------------------------------------------------------------------------------------------
-- E. void the charge itself, no linked events -> balance drops to 0 (documents the flat-sum
--    edge case named in the Phase 3E design audit: this is safe ONLY because this charge has no
--    active linked payments — see charge_has_active_linked_events, not yet wired to any guard).
-- --------------------------------------------------------------------------------------------
insert into public.tenants (id, property_id, name, move_in_date, rent_amount, status, owed_amount, deposit_amount, deposit_status, active)
values ('00000000-0000-0000-0000-00000000003e', '00000000-0000-0000-0000-0000000003e0', 'Scenario E', '1 Jan 2026', 2000, 'unpaid', 0, 0, 'Not collected', true);

insert into public.ledger_entries (id, tenant_id, label, amount, source, event_type, affects_balance, origin, billing_period_id, due_date, grace_period_end, idempotency_key)
values ('00000000-0000-0000-0000-0000000e0001', '00000000-0000-0000-0000-00000000003e', 'Sept rent', 2000, 'manual', 'charge', true, 'billing_cycle', '2026-09', (current_date + 5), (current_date + 8), 'rent_charge:e:2026-09');

do $$
declare has_linked boolean;
begin
  select public.charge_has_active_linked_events('00000000-0000-0000-0000-0000000e0001') into has_linked;
  if has_linked then
    raise exception 'Scenario E precondition FAILED: charge unexpectedly has active linked events';
  end if;
end $$;

update public.ledger_entries set voided_at = now(), void_reason = 'test: voiding an unlinked charge'
where id = '00000000-0000-0000-0000-0000000e0001';

do $$
declare r record;
begin
  select * into r from public.sync_tenant_balance_if_new_model('00000000-0000-0000-0000-00000000003e');
  if not (r.synchronized and r.balance = 0 and r.status = 'paid') then
    raise exception 'Scenario E FAILED: %', row_to_json(r);
  end if;
  raise notice 'Scenario E OK: %', row_to_json(r);
end $$;

-- --------------------------------------------------------------------------------------------
-- F. mixed/legacy tenant -> synchronization skipped, nothing written
-- --------------------------------------------------------------------------------------------
insert into public.tenants (id, property_id, name, move_in_date, rent_amount, status, owed_amount, deposit_amount, deposit_status, active)
values ('00000000-0000-0000-0000-00000000003f', '00000000-0000-0000-0000-0000000003e0', 'Scenario F', '1 Jan 2026', 2000, 'partial', 999, 0, 'Not collected', true);

-- a legacy row: event_type left NULL entirely
insert into public.ledger_entries (tenant_id, label, amount, paid_amount, status, source)
values ('00000000-0000-0000-0000-00000000003f', 'Sept rent', 2000, 1001, 'partial', 'manual');

do $$
declare r record;
declare owed_before numeric;
begin
  select owed_amount into owed_before from public.tenants where id = '00000000-0000-0000-0000-00000000003f';
  select * into r from public.sync_tenant_balance_if_new_model('00000000-0000-0000-0000-00000000003f');
  if not (r.synchronized = false and r.skip_reason = 'skipped_legacy_or_mixed') then
    raise exception 'Scenario F FAILED (result): %', row_to_json(r);
  end if;
  if (select owed_amount from public.tenants where id = '00000000-0000-0000-0000-00000000003f') != owed_before then
    raise exception 'Scenario F FAILED: owed_amount was changed despite being a legacy/mixed tenant';
  end if;
  raise notice 'Scenario F OK: %', row_to_json(r);
end $$;

-- --------------------------------------------------------------------------------------------
-- G. audit-only event (affects_balance = false) -> no balance effect
-- --------------------------------------------------------------------------------------------
insert into public.tenants (id, property_id, name, move_in_date, rent_amount, status, owed_amount, deposit_amount, deposit_status, active)
values ('00000000-0000-0000-0000-000000000037', '00000000-0000-0000-0000-0000000003e0', 'Scenario G', '1 Jan 2026', 2000, 'unpaid', 0, 0, 'Not collected', true);

insert into public.ledger_entries (id, tenant_id, label, amount, source, event_type, affects_balance, origin, billing_period_id, due_date, grace_period_end, idempotency_key)
values ('00000000-0000-0000-0000-000000070001', '00000000-0000-0000-0000-000000000037', 'Sept rent', 2000, 'manual', 'charge', true, 'billing_cycle', '2026-09', (current_date + 5), (current_date + 8), 'rent_charge:g:2026-09');

-- an audit-only "penalty waived" style event, linked to the charge but affects_balance=false
insert into public.ledger_entries (tenant_id, label, amount, source, event_type, affects_balance, origin, charge_id, idempotency_key)
values ('00000000-0000-0000-0000-000000000037', 'Late penalty waived (audit only)', -50, 'adjustment', 'penalty', false, 'landlord_manual',
  '00000000-0000-0000-0000-000000070001', 'penalty_waived:g1');

do $$
declare r record;
begin
  select * into r from public.sync_tenant_balance_if_new_model('00000000-0000-0000-0000-000000000037');
  if not (r.synchronized and r.balance = 2000 and r.status = 'unpaid') then
    raise exception 'Scenario G FAILED: %', row_to_json(r);
  end if;
  raise notice 'Scenario G OK: %', row_to_json(r);
end $$;

do $$
begin
  raise notice 'All Phase 3E scenarios passed.';
end $$;

rollback;
