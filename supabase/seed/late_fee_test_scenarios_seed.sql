-- ============================================================================
-- Late-fee / ledger test scenarios
-- ============================================================================
--
-- NOT a migration — this lives outside supabase/migrations on purpose so
-- `supabase db push` never runs it. Paste it into the Supabase SQL editor and
-- run it there.
--
-- WARNING: this DELETES all existing tenants + their ledger entries (and any
-- invoice_tenants rows referencing them) for the property owned by v_email
-- below, then replaces them with 9 tenants engineered to exercise every
-- outstanding-balance / late-penalty code path: Rent list, Rooms, Dashboard,
-- Accounting, Reports (arrears), the tenant profile page, and the tenant
-- payment portal (RentStatement / MobileMoneyPayment). It does NOT touch
-- rooms, room_types, settings, expenses, or staff — only tenants/ledger.
-- Re-runnable: run it again any time to reset back to a clean test state.
--
-- BEFORE RUNNING: confirm v_email below is the right account.
-- ============================================================================

do $$
declare
  v_email text := 'marcus@mail.com';   -- <<< CHANGE ME if needed
  v_owner uuid;
  v_prop  uuid;
  v_today date := current_date;

  v_t1 uuid; v_t2 uuid; v_t3 uuid; v_t4 uuid; v_t5 uuid;
  v_t6 uuid; v_t7 uuid; v_t8 uuid; v_t9 uuid;
begin
  ---------------------------------------------------------------------------
  -- 0. Resolve the owning account + property
  ---------------------------------------------------------------------------
  select id into v_owner from auth.users where email = v_email;
  if v_owner is null then
    raise exception 'No account found with email %. Fix v_email.', v_email;
  end if;

  select id into v_prop from public.properties where owner_id = v_owner order by created_at limit 1;
  if v_prop is null then
    raise exception 'No property found for account %.', v_email;
  end if;

  ---------------------------------------------------------------------------
  -- 1. Clear this property's tenants + ledger (re-runnable). Rooms, settings,
  --    expenses and staff are left untouched.
  ---------------------------------------------------------------------------
  delete from public.ledger_entries where tenant_id in (select id from public.tenants where property_id = v_prop);
  delete from public.invoice_tenants where invoice_id in (select id from public.invoices where property_id = v_prop);
  delete from public.tenants where property_id = v_prop;

  ---------------------------------------------------------------------------
  -- 2. Tenants — one per scenario
  ---------------------------------------------------------------------------

  -- Scenario 1: Perfect payer — paid on time, 4 months straight, nothing owed,
  -- no penalty. Baseline "everything is fine" case.
  insert into public.tenants (property_id, name, phones, move_in_date, rent_amount, status, days_overdue, owed_amount, on_time_count, total_months_count, active, notes)
  values (v_prop, 'Perfect Pemba', array['0966 100 001'], '12 Jun 2026', 1200, 'paid', null, 0, 4, 4, true,
    'TEST SCENARIO 1: paid on time every month, no penalty.')
  returning id into v_t1;

  -- Scenario 2: Partial payer — pays in instalments most months, never late,
  -- currently partway through this month with no penalty accruing.
  insert into public.tenants (property_id, name, phones, move_in_date, rent_amount, status, days_overdue, owed_amount, on_time_count, total_months_count, active, notes)
  values (v_prop, 'Partial Patricia', array['0966 100 002'], '12 May 2026', 900, 'partial', null, 300, 3, 5, true,
    'TEST SCENARIO 2: pays in two instalments most months, not overdue.')
  returning id into v_t2;

  -- Scenario 3: Moderately overdue — one month's rent unpaid, penalty
  -- currently accruing (18 days). Exercises calcTotalOwed/calcPenalty live.
  insert into public.tenants (property_id, name, phones, move_in_date, rent_amount, status, days_overdue, owed_amount, on_time_count, total_months_count, active, notes)
  values (v_prop, 'Overdue Oliver', array['0966 100 003'], '12 Mar 2026', 1000, 'overdue', 18, 1000, 5, 6, true,
    'TEST SCENARIO 3: 18 days overdue, one month unpaid, penalty accruing.')
  returning id into v_t3;

  -- Scenario 4: Long-term overdue — two months' arrears stacked up plus a
  -- large accrued penalty (52 days). Exercises the "big number" edge case.
  insert into public.tenants (property_id, name, phones, move_in_date, rent_amount, status, days_overdue, owed_amount, on_time_count, total_months_count, active, notes)
  values (v_prop, 'LongOverdue Laura', array['0966 100 004'], '12 Jan 2026', 1400, 'overdue', 52, 2800, 7, 7, true,
    'TEST SCENARIO 4: two months behind, 52 days overdue, large penalty.')
  returning id into v_t4;

  -- Scenario 5: Brand-new tenant, moved in on the 1st this month (no proration),
  -- unpaid, and has NO ledger row at all yet — exercises the "Current rent"
  -- fallback fix (previously read as "No balance owed"/"Rent in advance").
  insert into public.tenants (property_id, name, phones, move_in_date, rent_amount, status, days_overdue, owed_amount, on_time_count, total_months_count, active, notes)
  values (v_prop, 'NewUnpaid Nelson', array['0966 100 005'], to_char(date_trunc('month', v_today), 'DD Mon YYYY'), 800, 'unpaid', null, 800, 0, 0, true,
    'TEST SCENARIO 5: moved in the 1st of this month, unpaid, no ledger row yet.')
  returning id into v_t5;

  -- Scenario 6: Partial payment AND overdue at the same time — a real edge
  -- case the type system allows (status=partial with daysOverdue > 0), since
  -- calcPenalty doesn't check status the way calcTotalOwed's "paid" guard does.
  insert into public.tenants (property_id, name, phones, move_in_date, rent_amount, status, days_overdue, owed_amount, on_time_count, total_months_count, active, notes)
  values (v_prop, 'PartialOverdue Peter', array['0966 100 006'], '12 Apr 2026', 1100, 'partial', 10, 550, 5, 6, true,
    'TEST SCENARIO 6: partial payment this month, also 10 days overdue — penalty + partial both apply.')
  returning id into v_t6;

  -- Scenario 7: Fully paid up right now, but with an imperfect on-time record
  -- (one past month was settled late) — history should still read cleanly.
  insert into public.tenants (property_id, name, phones, move_in_date, rent_amount, status, days_overdue, owed_amount, on_time_count, total_months_count, active, notes)
  values (v_prop, 'PaidHistory Hannah', array['0966 100 007'], '12 Feb 2026', 1300, 'paid', null, 0, 5, 7, true,
    'TEST SCENARIO 7: paid up now, but was late once in the past (see on-time record).')
  returning id into v_t7;

  -- Scenario 8: Uncollected security deposit AND unpaid rent, moved in mid-
  -- month (prorated first invoice) — exercises the deposit-due synthetic row
  -- sitting alongside the current-period row.
  insert into public.tenants (property_id, name, phones, move_in_date, rent_amount, status, days_overdue, owed_amount, deposit_amount, deposit_status, on_time_count, total_months_count, active, notes)
  values (v_prop, 'DepositDue Diana', array['0966 100 008'], to_char(v_today - interval '4 days', 'DD Mon YYYY'), 950, 'unpaid', null, 950, 950, 'Not collected', 0, 0, true,
    'TEST SCENARIO 8: moved in a few days ago (prorated), deposit not collected, rent unpaid.')
  returning id into v_t8;

  -- Scenario 9: Moved out with an unpaid balance left behind — exercises
  -- inactive-tenant handling (no synthetic current-period/penalty row should
  -- apply once inactive) and move-out history.
  insert into public.tenants (property_id, name, phones, move_in_date, move_out_date, rent_amount, status, days_overdue, owed_amount, on_time_count, total_months_count, active, notes)
  values (v_prop, 'MovedOut Moses', array['0966 100 009'], '12 Jan 2026', to_char(v_today - interval '15 days', 'DD Mon YYYY'), 1000, 'unpaid', null, 500, 7, 8, false,
    'TEST SCENARIO 9: moved out with K500 unpaid balance left behind.')
  returning id into v_t9;

  ---------------------------------------------------------------------------
  -- 3. Ledger history — built to match each tenant's live status.
  --    Uses "Month Rent YYYY" — the same label format LogPaymentModal.tsx generates and
  --    furthestPaidMonth() (TenantProfile.tsx) parses to decide whether the current month is
  --    already covered. Using the wrong format here made every seeded month look "uncovered",
  --    which showed a phantom "September 2026 · Due" row above an already-paid September.
  ---------------------------------------------------------------------------

  -- T1: Perfect Pemba — Jun, Jul, Aug, Sep all paid in full, on time.
  insert into public.ledger_entries (tenant_id, label, amount, paid_amount, status, created_at)
  select v_t1, to_char(m, 'FMMonth') || ' Rent ' || to_char(m, 'YYYY'), 1200, null, 'paid', m + interval '3 days'
  from generate_series(date_trunc('month', v_today) - interval '3 months', date_trunc('month', v_today), interval '1 month') m;

  -- T2: Partial Patricia — May paid, Jun partial-then-topped-up (two rows), Jul paid, Aug
  -- partial-then-topped-up too (two rows, so every past month nets to fully settled — only the
  -- current month, Sep, is genuinely still open, matching owed_amount=300 above exactly).
  insert into public.ledger_entries (tenant_id, label, amount, paid_amount, status, created_at) values
    (v_t2, to_char(date_trunc('month', v_today) - interval '4 months', 'FMMonth') || ' Rent ' || to_char(date_trunc('month', v_today) - interval '4 months', 'YYYY'), 900, null, 'paid', date_trunc('month', v_today) - interval '4 months' + interval '2 days'),
    -- amount is always the FULL amount owed at that moment (900), not the paid portion — same
    -- convention TenantsContext.tsx's logPayments uses, so amount-minus-paidAmount = balance left.
    (v_t2, to_char(date_trunc('month', v_today) - interval '3 months', 'FMMonth') || ' Rent ' || to_char(date_trunc('month', v_today) - interval '3 months', 'YYYY'), 900, 600, 'partial', date_trunc('month', v_today) - interval '3 months' + interval '3 days'),
    (v_t2, to_char(date_trunc('month', v_today) - interval '3 months', 'FMMonth') || ' Rent ' || to_char(date_trunc('month', v_today) - interval '3 months', 'YYYY'), 300, null, 'paid', date_trunc('month', v_today) - interval '3 months' + interval '18 days'),
    (v_t2, to_char(date_trunc('month', v_today) - interval '2 months', 'FMMonth') || ' Rent ' || to_char(date_trunc('month', v_today) - interval '2 months', 'YYYY'), 900, null, 'paid', date_trunc('month', v_today) - interval '2 months' + interval '4 days'),
    (v_t2, to_char(date_trunc('month', v_today) - interval '1 months', 'FMMonth') || ' Rent ' || to_char(date_trunc('month', v_today) - interval '1 months', 'YYYY'), 900, 600, 'partial', date_trunc('month', v_today) - interval '1 months' + interval '3 days'),
    (v_t2, to_char(date_trunc('month', v_today) - interval '1 months', 'FMMonth') || ' Rent ' || to_char(date_trunc('month', v_today) - interval '1 months', 'YYYY'), 300, null, 'paid', date_trunc('month', v_today) - interval '1 months' + interval '20 days'),
    (v_t2, to_char(date_trunc('month', v_today), 'FMMonth') || ' Rent ' || to_char(date_trunc('month', v_today), 'YYYY'), 900, 600, 'partial', date_trunc('month', v_today) + interval '3 days');

  -- T3: Overdue Oliver — Mar through Aug paid in full; Sep (current) has no
  -- row at all, which is exactly what makes the app synthesize the
  -- current-period row + live penalty.
  insert into public.ledger_entries (tenant_id, label, amount, paid_amount, status, created_at)
  select v_t3, to_char(m, 'FMMonth') || ' Rent ' || to_char(m, 'YYYY'), 1000, null, 'paid', m + interval '3 days'
  from generate_series(date_trunc('month', v_today) - interval '6 months', date_trunc('month', v_today) - interval '1 month', interval '1 month') m;

  -- T4: LongOverdue Laura — Jan through Jul paid; Aug and Sep both unpaid
  -- (no rows), matching the 2-months-arrears owed_amount above.
  insert into public.ledger_entries (tenant_id, label, amount, paid_amount, status, created_at)
  select v_t4, to_char(m, 'FMMonth') || ' Rent ' || to_char(m, 'YYYY'), 1400, null, 'paid', m + interval '3 days'
  from generate_series(date_trunc('month', v_today) - interval '8 months', date_trunc('month', v_today) - interval '2 months', interval '1 month') m;

  -- T5: NewUnpaid Nelson — deliberately no ledger rows at all.

  -- T6: PartialOverdue Peter — Apr through Aug paid; Sep partial (550 of 1100).
  insert into public.ledger_entries (tenant_id, label, amount, paid_amount, status, created_at)
  select v_t6, to_char(m, 'FMMonth') || ' Rent ' || to_char(m, 'YYYY'), 1100, null, 'paid', m + interval '3 days'
  from generate_series(date_trunc('month', v_today) - interval '5 months', date_trunc('month', v_today) - interval '1 month', interval '1 month') m;
  insert into public.ledger_entries (tenant_id, label, amount, paid_amount, status, created_at) values
    (v_t6, to_char(date_trunc('month', v_today), 'FMMonth') || ' Rent ' || to_char(date_trunc('month', v_today), 'YYYY'), 1100, 550, 'partial', date_trunc('month', v_today) + interval '3 days');

  -- T7: PaidHistory Hannah — Feb through Aug paid (one, Jun, settled late but
  -- still ends up 'paid'), Sep (current) paid too.
  insert into public.ledger_entries (tenant_id, label, amount, paid_amount, status, created_at)
  select v_t7, to_char(m, 'FMMonth') || ' Rent ' || to_char(m, 'YYYY'), 1300, null, 'paid',
    case when m = date_trunc('month', v_today) - interval '3 months' then m + interval '22 days' else m + interval '3 days' end
  from generate_series(date_trunc('month', v_today) - interval '7 months', date_trunc('month', v_today), interval '1 month') m;

  -- T8: DepositDue Diana — deliberately no ledger rows at all (moved in days ago).

  -- T9: MovedOut Moses — Jan through Jul paid, Aug partial (500 of 1000, left
  -- unpaid when they moved out).
  insert into public.ledger_entries (tenant_id, label, amount, paid_amount, status, created_at)
  select v_t9, to_char(m, 'FMMonth') || ' Rent ' || to_char(m, 'YYYY'), 1000, null, 'paid', m + interval '3 days'
  from generate_series(date_trunc('month', v_today) - interval '8 months', date_trunc('month', v_today) - interval '2 months', interval '1 month') m;
  insert into public.ledger_entries (tenant_id, label, amount, paid_amount, status, created_at) values
    (v_t9, to_char(date_trunc('month', v_today) - interval '1 months', 'FMMonth') || ' Rent ' || to_char(date_trunc('month', v_today) - interval '1 months', 'YYYY'), 1000, 500, 'partial', date_trunc('month', v_today) - interval '1 months' + interval '3 days');

  raise notice 'Seeded 9 test tenants into property % for %', v_prop, v_email;
end $$;
