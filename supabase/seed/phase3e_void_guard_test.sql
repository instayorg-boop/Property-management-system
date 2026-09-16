-- Phase 3E charge-void-guard test script — NOT a migration, NOT run automatically. Transaction-
-- wrapped and rolls back at the end regardless of where it runs, same pattern as
-- phase3e_sync_test.sql. Covers the 5 required cases for void_ledger_entry:
--   1. new charge, no linked events              -> void succeeds
--   2. new charge, one active linked payment      -> void rejected
--   3. new charge, only a VOIDED linked payment   -> void succeeds
--   4. legacy row                                 -> existing void behavior unchanged
--   5. a rejected void leaves the row untouched (voided_at/void_reason still null)

begin;

insert into public.properties (id, owner_id, name)
values ('00000000-0000-0000-0000-00000000fe00', (select id from auth.users limit 1), 'Phase 3E void-guard test property');

insert into public.settings (property_id, due_day, grace_period_days)
values ('00000000-0000-0000-0000-00000000fe00', 5, 3);

-- --------------------------------------------------------------------------------------------
-- 1. New charge with no linked events -> void succeeds
-- --------------------------------------------------------------------------------------------
insert into public.tenants (id, property_id, name, move_in_date, rent_amount, status, owed_amount, deposit_amount, deposit_status, active)
values ('00000000-0000-0000-0000-00000000fe01', '00000000-0000-0000-0000-00000000fe00', 'Void Guard 1', '1 Jan 2026', 2000, 'unpaid', 0, 0, 'Not collected', true);

insert into public.ledger_entries (id, tenant_id, label, amount, source, event_type, affects_balance, origin, billing_period_id, due_date, grace_period_end, idempotency_key)
values ('00000000-0000-0000-0000-0000000fe101', '00000000-0000-0000-0000-00000000fe01', 'Sept rent', 2000, 'manual', 'charge', true, 'billing_cycle', '2026-09', (current_date + 5), (current_date + 8), 'rent_charge:fe1:2026-09');

do $$
declare r record;
declare v_voided_at timestamptz;
begin
  select * into r from public.void_ledger_entry('00000000-0000-0000-0000-0000000fe101', 'test: no linked events, should succeed');
  if not (r.voided = true and r.refusal_reason is null) then
    raise exception 'Case 1 FAILED (result): %', row_to_json(r);
  end if;
  select voided_at into v_voided_at from public.ledger_entries where id = '00000000-0000-0000-0000-0000000fe101';
  if v_voided_at is null then
    raise exception 'Case 1 FAILED: voided_at was not actually set';
  end if;
  raise notice 'Case 1 OK: %', row_to_json(r);
end $$;

-- --------------------------------------------------------------------------------------------
-- 2 & 5. New charge with one ACTIVE linked payment -> void rejected, and the charge is left
--         completely untouched (voided_at/void_reason still null).
-- --------------------------------------------------------------------------------------------
insert into public.tenants (id, property_id, name, move_in_date, rent_amount, status, owed_amount, deposit_amount, deposit_status, active)
values ('00000000-0000-0000-0000-00000000fe02', '00000000-0000-0000-0000-00000000fe00', 'Void Guard 2', '1 Jan 2026', 2000, 'unpaid', 0, 0, 'Not collected', true);

insert into public.ledger_entries (id, tenant_id, label, amount, source, event_type, affects_balance, origin, billing_period_id, due_date, grace_period_end, idempotency_key)
values ('00000000-0000-0000-0000-0000000fe201', '00000000-0000-0000-0000-00000000fe02', 'Sept rent', 2000, 'manual', 'charge', true, 'billing_cycle', '2026-09', (current_date + 5), (current_date + 8), 'rent_charge:fe2:2026-09');

insert into public.ledger_entries (tenant_id, label, amount, source, event_type, affects_balance, origin, charge_id, idempotency_key)
values ('00000000-0000-0000-0000-00000000fe02', 'Active payment', -1000, 'manual', 'payment', true, 'landlord_manual', '00000000-0000-0000-0000-0000000fe201', 'manual_payment:fe2a');

do $$
declare r record;
declare v_voided_at timestamptz;
declare v_void_reason text;
begin
  select * into r from public.void_ledger_entry('00000000-0000-0000-0000-0000000fe201', 'test: should be rejected');
  if not (r.voided = false and r.refusal_reason = 'charge_has_active_linked_events') then
    raise exception 'Case 2 FAILED (result): %', row_to_json(r);
  end if;
  select voided_at, void_reason into v_voided_at, v_void_reason from public.ledger_entries where id = '00000000-0000-0000-0000-0000000fe201';
  if v_voided_at is not null or v_void_reason is not null then
    raise exception 'Case 5 FAILED: charge was modified despite the void being rejected (voided_at=%, void_reason=%)', v_voided_at, v_void_reason;
  end if;
  raise notice 'Case 2 & 5 OK: %', row_to_json(r);
end $$;

-- --------------------------------------------------------------------------------------------
-- 3. New charge whose only linked payment is ITSELF already voided -> void succeeds (no ACTIVE
--    linked events remain, so the guard doesn't apply).
-- --------------------------------------------------------------------------------------------
update public.ledger_entries set voided_at = now(), void_reason = 'test: voiding the payment first'
where tenant_id = '00000000-0000-0000-0000-00000000fe02' and event_type = 'payment';

do $$
declare r record;
declare v_voided_at timestamptz;
begin
  select * into r from public.void_ledger_entry('00000000-0000-0000-0000-0000000fe201', 'test: only a voided payment remains, should succeed now');
  if not (r.voided = true and r.refusal_reason is null) then
    raise exception 'Case 3 FAILED (result): %', row_to_json(r);
  end if;
  select voided_at into v_voided_at from public.ledger_entries where id = '00000000-0000-0000-0000-0000000fe201';
  if v_voided_at is null then
    raise exception 'Case 3 FAILED: voided_at was not actually set';
  end if;
  raise notice 'Case 3 OK: %', row_to_json(r);
end $$;

-- --------------------------------------------------------------------------------------------
-- 4. Legacy row (event_type is null) -> existing unconditional void behavior unchanged
-- --------------------------------------------------------------------------------------------
insert into public.tenants (id, property_id, name, move_in_date, rent_amount, status, owed_amount, deposit_amount, deposit_status, active)
values ('00000000-0000-0000-0000-00000000fe04', '00000000-0000-0000-0000-00000000fe00', 'Void Guard 4', '1 Jan 2026', 2000, 'partial', 1000, 0, 'Not collected', true);

insert into public.ledger_entries (id, tenant_id, label, amount, paid_amount, status, source)
values ('00000000-0000-0000-0000-0000000fe401', '00000000-0000-0000-0000-00000000fe04', 'Sept rent', 2000, 1000, 'partial', 'manual');

do $$
declare r record;
declare v_voided_at timestamptz;
begin
  select * into r from public.void_ledger_entry('00000000-0000-0000-0000-0000000fe401', 'test: legacy row, should succeed unconditionally');
  if not (r.voided = true and r.refusal_reason is null) then
    raise exception 'Case 4 FAILED (result): %', row_to_json(r);
  end if;
  select voided_at into v_voided_at from public.ledger_entries where id = '00000000-0000-0000-0000-0000000fe401';
  if v_voided_at is null then
    raise exception 'Case 4 FAILED: voided_at was not actually set on the legacy row';
  end if;
  raise notice 'Case 4 OK: %', row_to_json(r);
end $$;

do $$
begin
  raise notice 'All Phase 3E void-guard cases passed.';
end $$;

rollback;
