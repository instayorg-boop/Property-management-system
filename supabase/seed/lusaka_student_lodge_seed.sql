-- ============================================================================
-- Realistic demo data: a Lusaka student boarding house (Zambian context)
-- ============================================================================
--
-- NOT a migration — this lives outside supabase/migrations on purpose so
-- `supabase db push` never runs it. Paste it into the Supabase SQL editor.
--
-- BEFORE RUNNING: change v_email below to the account that should own this data.
--
-- WARNING: this DELETES all existing rooms / tenants / expenses / maintenance /
-- staff data belonging to that account's property before re-seeding, so the
-- script is safely re-runnable. It never touches any other account's data.
--
-- Context modelled on real Lusaka student accommodation near UNZA's Great East
-- Road campus: mostly 4-sharing rooms (self-contained and standard), a handful
-- of 2-sharing and single self-contained rooms, rents in ZMW per bed per month,
-- deposits of one month's rent, ZESCO/LWSC utility bills, and NAPSA/NHIMA-
-- registered staff.
-- ============================================================================

do $$
declare
  v_email text := 'marcus@mail.com';   -- <<< CHANGE ME to your account's email
  v_owner uuid;
  v_prop  uuid;

  v_t_4sc uuid;  -- 4-sharing self-contained
  v_t_4st uuid;  -- 4-sharing standard
  v_t_2sc uuid;  -- 2-sharing self-contained
  v_t_1sc uuid;  -- single self-contained

  v_c_power uuid; v_c_water uuid; v_c_security uuid; v_c_clean uuid;
  v_c_net uuid; v_c_repairs uuid; v_c_refuse uuid; v_c_rates uuid; v_c_transport uuid;

  v_e_caretaker uuid; v_e_guard_day uuid; v_e_guard_night uuid; v_e_cleaner uuid; v_e_handyman uuid;
begin
  ---------------------------------------------------------------------------
  -- 0. Resolve the owning account + property
  ---------------------------------------------------------------------------
  select id into v_owner from auth.users where email = v_email;
  if v_owner is null then
    raise exception 'No account found with email %. Sign up first, or fix v_email.', v_email;
  end if;

  select id into v_prop from public.properties where owner_id = v_owner order by created_at limit 1;

  if v_prop is null then
    insert into public.properties (name, address, property_type, slug, owner_id)
    values ('Great East Student Lodge', 'Plot 4127, Great East Road, Kalingalinga, Lusaka',
            'Student accommodation', 'great-east-student-lodge', v_owner)
    returning id into v_prop;
  else
    update public.properties
       set name = 'Great East Student Lodge',
           address = 'Plot 4127, Great East Road, Kalingalinga, Lusaka',
           property_type = 'Student accommodation',
           slug = 'great-east-student-lodge'
     where id = v_prop;
  end if;

  ---------------------------------------------------------------------------
  -- 1. Clear this property's existing data (re-runnable)
  ---------------------------------------------------------------------------
  delete from public.ledger_entries where tenant_id in (select id from public.tenants where property_id = v_prop);
  delete from public.invoice_tenants where invoice_id in (select id from public.invoices where property_id = v_prop);
  delete from public.invoices           where property_id = v_prop;
  delete from public.tenants            where property_id = v_prop;
  delete from public.rooms              where property_id = v_prop;
  delete from public.room_types         where property_id = v_prop;
  delete from public.institutions       where property_id = v_prop;
  delete from public.expenses           where property_id = v_prop;
  delete from public.expense_categories where property_id = v_prop;
  delete from public.maintenance_reports where property_id = v_prop;
  delete from public.clock_entries      where property_id = v_prop;
  delete from public.payroll_runs       where property_id = v_prop;
  delete from public.employees          where property_id = v_prop;

  ---------------------------------------------------------------------------
  -- 2. Settings
  ---------------------------------------------------------------------------
  if exists (select 1 from public.settings where property_id = v_prop) then
    update public.settings
       set landlord_name = 'Marcus Chongwani',
           landlord_phone = '0966 214 780',
           invoices_on = true,
           collection_target_pct = 92,
           management_fee_rate = 0.08,
           billing_period = 'Monthly',
           due_day = 5,
           grace_period_days = 5,
           daily_penalty_rate = 20,
           reminder_lead_days = 3,
           escalation_days = 7,
           contact_order = 'student',
           bank_name = 'Zanaco',
           account_number = '0123456789012',
           account_holder_name = 'Marcus Chongwani',
           payout_day = 'Friday',
           account_email = v_email,
           payment_methods = '[{"type":"mtn","number":"0966 214 780"},{"type":"airtel","number":"0977 415 302"},{"type":"bank","bankName":"Zanaco","accountNumber":"0123456789012"},{"type":"cash"}]'::jsonb
     where property_id = v_prop;
  else
    insert into public.settings (
      property_id, landlord_name, landlord_phone, invoices_on, collection_target_pct,
      management_fee_rate, billing_period, due_day, grace_period_days, daily_penalty_rate,
      reminder_lead_days, escalation_days, contact_order, bank_name, account_number,
      account_holder_name, payout_day, account_email, payment_methods,
      napsa_insurable_earnings_ceiling, minimum_wage_reference, subscription_plan
    ) values (
      v_prop, 'Marcus Chongwani', '0966 214 780', true, 92,
      0.08, 'Monthly', 5, 5, 20,
      3, 7, 'student', 'Zanaco', '0123456789012',
      'Marcus Chongwani', 'Friday', v_email,
      '[{"type":"mtn","number":"0966 214 780"},{"type":"airtel","number":"0977 415 302"},{"type":"bank","bankName":"Zanaco","accountNumber":"0123456789012"},{"type":"cash"}]'::jsonb,
      37236, 1978.99, 'Pro'
    );
  end if;

  ---------------------------------------------------------------------------
  -- 3. Institutions the students attend
  ---------------------------------------------------------------------------
  insert into public.institutions (property_id, name) values
    (v_prop, 'University of Zambia (UNZA)'),
    (v_prop, 'Evelyn Hone College'),
    (v_prop, 'ZCAS University'),
    (v_prop, 'Cavendish University Zambia'),
    (v_prop, 'University of Lusaka (UNILUS)'),
    (v_prop, 'Natural Resources Development College (NRDC)'),
    (v_prop, 'Chainama College of Health Sciences');

  ---------------------------------------------------------------------------
  -- 4. Room types — per-bed pricing, typical Lusaka student rates
  ---------------------------------------------------------------------------
  insert into public.room_types (property_id, name, capacity, rent, deposit_amount, deposit_refundability)
  values (v_prop, '4-sharing self-contained', 4, 1200, 1200, 'Refundable') returning id into v_t_4sc;

  insert into public.room_types (property_id, name, capacity, rent, deposit_amount, deposit_refundability)
  values (v_prop, '4-sharing standard', 4, 900, 900, 'Refundable') returning id into v_t_4st;

  insert into public.room_types (property_id, name, capacity, rent, deposit_amount, deposit_refundability)
  values (v_prop, '2-sharing self-contained', 2, 1800, 1800, 'Refundable') returning id into v_t_2sc;

  insert into public.room_types (property_id, name, capacity, rent, deposit_amount, deposit_refundability)
  values (v_prop, 'Single self-contained', 1, 3000, 3000, 'Partially refundable') returning id into v_t_1sc;

  ---------------------------------------------------------------------------
  -- 5. Rooms (18 rooms / 58 beds)
  ---------------------------------------------------------------------------
  insert into public.rooms (property_id, number, room_type_id, override)
  select v_prop, n::text, v_t_4sc, null from generate_series(1, 8) n;

  insert into public.rooms (property_id, number, room_type_id, override)
  select v_prop, n::text, v_t_4st, null from generate_series(9, 12) n;

  insert into public.rooms (property_id, number, room_type_id, override)
  select v_prop, n::text, v_t_2sc, null from generate_series(13, 16) n;

  insert into public.rooms (property_id, number, room_type_id, override)
  values (v_prop, '17', v_t_1sc, null),
         (v_prop, '18', v_t_1sc, 'not-ready');   -- being repainted after a move-out

  ---------------------------------------------------------------------------
  -- 6. Tenants
  --    Derived fields (rent, deposit, owed) come from the room type so the
  --    numbers stay internally consistent with the Rooms page.
  ---------------------------------------------------------------------------
  insert into public.tenants (
    property_id, name, phones, emergency_contacts, room_id, room_type_id, institution_id,
    move_in_date, rent_amount, status, days_overdue, owed_amount,
    deposit_amount, deposit_date, deposit_method, deposit_status,
    notes, on_time_count, total_months_count, active
  )
  select
    v_prop,
    v.name,
    v.phones,
    jsonb_build_array(jsonb_build_object(
      'id', gen_random_uuid()::text,
      'name', v.kin_name,
      'relation', v.kin_relation,
      'phones', jsonb_build_array(v.kin_phone)
    )),
    r.id,
    r.room_type_id,
    i.id,
    v.move_in,
    rt.rent,
    v.status,
    case when v.status = 'overdue' then v.overdue_days else null end,
    case
      when v.status = 'paid'    then 0
      when v.status = 'partial' then rt.rent - v.paid_part
      else rt.rent
    end,
    rt.deposit_amount,
    v.move_in,
    v.deposit_method,
    'Held',
    v.notes,
    v.on_time,
    v.months,
    true
  from (values
    -- Room 1 — 4-sharing self-contained
    ('Chanda Mulenga',      array['0966 341 208'],                 'Beatrice Mulenga',  'Parent',   '0977 118 402', '1',  '12 Sep 2025', 'paid',    0,  0,    'mobile', 'Third-year Engineering student.',                       11, 12),
    ('Mwape Bwalya',        array['0977 502 913','0966 118 774'],  'Charles Bwalya',    'Parent',   '0966 233 190', '1',  '12 Sep 2025', 'paid',    0,  0,    'mobile', '',                                                      10, 12),
    ('Kondwani Phiri',      array['0955 774 201'],                 'Esther Phiri',      'Parent',   '0977 640 118', '1',  '14 Sep 2025', 'overdue', 12, 0,    'cash',   'Guardian pays termly, often late in the first month.',   7, 12),
    ('Brian Tembo',         array['0967 220 583'],                 'Alice Tembo',       'Guardian', '0955 302 771', '1',  '02 Feb 2026', 'paid',    0,  0,    'mobile', '',                                                       6,  7),
    -- Room 2
    ('Joseph Banda',        array['0966 815 337'],                 'Rodgers Banda',     'Parent',   '0977 209 664', '2',  '12 Sep 2025', 'paid',    0,  0,    'bank',   '',                                                      12, 12),
    ('Emmanuel Zulu',       array['0978 114 026'],                 'Miriam Zulu',       'Parent',   '0966 553 810', '2',  '12 Sep 2025', 'partial', 0,  500,  'mobile', 'Pays in two instalments most months.',                   8, 12),
    ('Gift Mwansa',         array['0966 447 190'],                 'Patrick Mwansa',    'Parent',   '0977 881 245', '2',  '20 Sep 2025', 'paid',    0,  0,    'mobile', '',                                                      11, 12),
    ('Kelvin Sakala',       array['0955 619 402','0771 330 815'],  'Justine Sakala',    'Sibling',  '0966 774 013', '2',  '05 Jan 2026', 'paid',    0,  0,    'mobile', '',                                                       7,  8),
    -- Room 3 (one bed free)
    ('Given Nyirenda',      array['0977 336 128'],                 'Loveness Nyirenda', 'Parent',   '0966 402 559', '3',  '12 Sep 2025', 'unpaid',  0,  0,    'cash',   'Waiting on bursary disbursement.',                       9, 12),
    ('Bright Lungu',        array['0966 250 471'],                 'Fredrick Lungu',    'Parent',   '0978 116 330', '3',  '12 Sep 2025', 'paid',    0,  0,    'mobile', '',                                                      12, 12),
    ('Musonda Kabwe',       array['0965 802 117'],                 'Agnes Kabwe',       'Guardian', '0977 445 208', '3',  '18 Feb 2026', 'paid',    0,  0,    'mobile', '',                                                       6,  6),
    -- Room 4
    ('Natasha Banda',       array['0977 715 903'],                 'Dorothy Banda',     'Parent',   '0966 128 447', '4',  '12 Sep 2025', 'paid',    0,  0,    'mobile', '',                                                      12, 12),
    ('Chipo Mwanza',        array['0966 384 220'],                 'Kelvin Mwanza',     'Parent',   '0955 771 604', '4',  '12 Sep 2025', 'paid',    0,  0,    'mobile', '',                                                      11, 12),
    ('Mutinta Hachambwa',   array['0978 553 116'],                 'Namakau Hachambwa', 'Parent',   '0966 907 331', '4',  '12 Sep 2025', 'overdue', 23, 0,    'mobile', 'Second month behind — follow up with guardian.',          6, 12),
    ('Thandiwe Phiri',      array['0966 118 992'],                 'Grace Phiri',       'Parent',   '0977 224 806', '4',  '10 Jan 2026', 'paid',    0,  0,    'bank',   '',                                                       8,  8),
    -- Room 5
    ('Grace Mulenga',       array['0955 447 130'],                 'Bwalya Mulenga',    'Parent',   '0966 615 228', '5',  '12 Sep 2025', 'paid',    0,  0,    'mobile', '',                                                      12, 12),
    ('Mercy Zulu',          array['0977 902 148'],                 'Peter Zulu',        'Parent',   '0966 337 419', '5',  '12 Sep 2025', 'paid',    0,  0,    'mobile', '',                                                      10, 12),
    ('Precious Tembo',      array['0966 671 205'],                 'Janet Tembo',       'Parent',   '0978 440 137', '5',  '12 Sep 2025', 'partial', 0,  700,  'cash',   '',                                                       9, 12),
    ('Namakau Lubinda',     array['0967 118 340'],                 'Inonge Lubinda',    'Parent',   '0955 226 918', '5',  '03 Feb 2026', 'paid',    0,  0,    'mobile', 'From Mongu — travels home each break.',                   7,  7),
    -- Room 6
    ('Inonge Mubita',       array['0966 220 774'],                 'Sitali Mubita',     'Parent',   '0977 118 550', '6',  '12 Sep 2025', 'paid',    0,  0,    'mobile', '',                                                      12, 12),
    ('Monde Silwamba',      array['0977 449 231'],                 'Choolwe Silwamba',  'Parent',   '0966 802 174', '6',  '12 Sep 2025', 'paid',    0,  0,    'mobile', '',                                                      11, 12),
    ('Mwaka Sikombe',       array['0955 337 902'],                 'Mubita Sikombe',    'Guardian', '0966 441 208', '6',  '12 Sep 2025', 'paid',    0,  0,    'bank',   '',                                                      12, 12),
    ('Chisomo Nyirenda',    array['0966 774 118','0977 205 663'],  'Temwani Nyirenda',  'Sibling',  '0978 330 147', '6',  '22 Jan 2026', 'overdue', 8,  0,    'mobile', '',                                                       6,  8),
    -- Room 7
    ('Lubuto Chola',        array['0977 118 226'],                 'Mwila Chola',       'Parent',   '0966 553 771', '7',  '12 Sep 2025', 'paid',    0,  0,    'mobile', '',                                                      12, 12),
    ('Mwila Katongo',       array['0966 902 445'],                 'Nsofwa Katongo',    'Parent',   '0955 118 337', '7',  '12 Sep 2025', 'paid',    0,  0,    'mobile', '',                                                      10, 12),
    ('Taonga Mwale',        array['0978 226 809'],                 'Wongani Mwale',     'Parent',   '0966 337 118', '7',  '12 Sep 2025', 'unpaid',  0,  0,    'cash',   '',                                                       8, 12),
    ('Wongani Ngoma',       array['0966 445 337'],                 'Chimwemwe Ngoma',   'Parent',   '0977 802 226', '7',  '15 Feb 2026', 'paid',    0,  0,    'mobile', '',                                                       6,  6),
    -- Room 8 (one bed free)
    ('Chimwemwe Daka',      array['0955 118 774'],                 'Blessings Daka',    'Parent',   '0966 226 903', '8',  '12 Sep 2025', 'paid',    0,  0,    'mobile', '',                                                      12, 12),
    ('Blessings Simukonda', array['0977 337 220'],                 'Davies Simukonda',  'Parent',   '0966 118 449', '8',  '12 Sep 2025', 'paid',    0,  0,    'bank',   '',                                                      11, 12),
    ('Lweendo Muyunda',     array['0966 553 118'],                 'Choolwe Muyunda',   'Parent',   '0955 774 226', '8',  '08 Jan 2026', 'partial', 0,  600,  'mobile', '',                                                       7,  8),
    -- Room 9 — 4-sharing standard
    ('Choolwe Hamoonga',    array['0966 226 117'],                 'Nchimunya Hamoonga','Parent',   '0977 449 330', '9',  '12 Sep 2025', 'paid',    0,  0,    'mobile', '',                                                      12, 12),
    ('Mubita Sitali',       array['0978 802 445'],                 'Namakau Sitali',    'Parent',   '0966 337 226', '9',  '12 Sep 2025', 'paid',    0,  0,    'mobile', '',                                                      11, 12),
    ('Kaunda Chibale',      array['0955 449 118'],                 'Peter Chibale',     'Parent',   '0966 226 774', '9',  '12 Sep 2025', 'overdue', 34, 0,    'cash',   'Third notice sent — escalate if unpaid this week.',       5, 12),
    ('Nsofwa Kunda',        array['0966 118 553'],                 'Bupe Kunda',        'Parent',   '0977 226 118', '9',  '19 Jan 2026', 'paid',    0,  0,    'mobile', '',                                                       7,  8),
    -- Room 10
    ('Mapalo Silavwe',      array['0977 774 449'],                 'Isaac Silavwe',     'Parent',   '0966 553 226', '10', '12 Sep 2025', 'paid',    0,  0,    'mobile', '',                                                      12, 12),
    ('Isaac Chirwa',        array['0966 337 802'],                 'Mercy Chirwa',      'Parent',   '0955 118 449', '10', '12 Sep 2025', 'paid',    0,  0,    'mobile', '',                                                      10, 12),
    ('Peter Mumba',         array['0978 449 226'],                 'Chanda Mumba',      'Parent',   '0966 774 337', '10', '12 Sep 2025', 'partial', 0,  400,  'mobile', '',                                                       9, 12),
    ('Chola Kalaba',        array['0966 802 118'],                 'Mable Kalaba',      'Guardian', '0977 553 449', '10', '26 Feb 2026', 'paid',    0,  0,    'cash',   '',                                                       6,  6),
    -- Room 11 (half empty)
    ('Bupe Mubanga',        array['0955 226 553'],                 'Davies Mubanga',    'Parent',   '0966 449 118', '11', '12 Sep 2025', 'paid',    0,  0,    'mobile', '',                                                      12, 12),
    ('Davies Sinkala',      array['0966 118 226'],                 'Agnes Sinkala',     'Parent',   '0978 337 774', '11', '11 Feb 2026', 'unpaid',  0,  0,    'mobile', 'Newest arrival — first invoice just issued.',             5,  6),
    -- Room 13 — 2-sharing self-contained
    ('Towela Mwale',        array['0977 226 337'],                 'Lushomo Mwale',     'Parent',   '0966 118 802', '13', '12 Sep 2025', 'paid',    0,  0,    'bank',   'Postgraduate — quiet-room request on file.',            12, 12),
    ('Lushomo Munsanje',    array['0966 553 774'],                 'Nchimunya Munsanje','Parent',   '0955 226 118', '13', '12 Sep 2025', 'paid',    0,  0,    'mobile', '',                                                      11, 12),
    -- Room 14
    ('Nchimunya Choongo',   array['0978 118 337'],                 'Mapalo Choongo',    'Parent',   '0966 226 449', '14', '12 Sep 2025', 'paid',    0,  0,    'mobile', '',                                                      12, 12),
    ('Mapalo Chisanga',     array['0966 449 553'],                 'Bupe Chisanga',     'Parent',   '0977 118 226', '14', '05 Jan 2026', 'overdue', 6,  0,    'mobile', '',                                                       7,  8),
    -- Room 15
    ('Bupe Chembe',         array['0955 802 226'],                 'Temwani Chembe',    'Parent',   '0966 337 553', '15', '12 Sep 2025', 'paid',    0,  0,    'mobile', '',                                                      12, 12),
    ('Temwani Sichone',     array['0966 226 118'],                 'Kondwani Sichone',  'Parent',   '0978 553 337', '15', '12 Sep 2025', 'paid',    0,  0,    'bank',   '',                                                      11, 12),
    -- Room 16 (half empty)
    ('Sibongile Ngoma',     array['0977 337 118'],                 'Thandiwe Ngoma',    'Parent',   '0966 802 553', '16', '14 Jan 2026', 'paid',    0,  0,    'mobile', '',                                                       8,  8),
    -- Room 17 — single self-contained
    ('Chileshe Mwamba',     array['0966 118 337','0955 449 226'],  'Mulenga Mwamba',    'Spouse',   '0977 226 802', '17', '12 Sep 2025', 'paid',    0,  0,    'bank',   'Lecturer''s assistant — long-stay tenant.',             12, 12)
  ) as v(name, phones, kin_name, kin_relation, kin_phone, room_no, move_in, status, overdue_days, paid_part, deposit_method, notes, on_time, months)
  join public.rooms r      on r.property_id = v_prop and r.number = v.room_no
  join public.room_types rt on rt.id = r.room_type_id
  left join lateral (
    select institutions.id from public.institutions
     where institutions.property_id = v_prop
     order by md5(v.name || institutions.name)   -- stable, varied spread across institutions
     limit 1
  ) i on true;

  -- Two former tenants, for move-out history
  insert into public.tenants (
    property_id, name, phones, emergency_contacts, room_id, room_type_id, institution_id,
    move_in_date, move_out_date, rent_amount, status, owed_amount,
    deposit_amount, deposit_date, deposit_method, deposit_status, deposit_resolution_note,
    notes, on_time_count, total_months_count, active
  )
  select v_prop, v.name, v.phones,
         jsonb_build_array(jsonb_build_object(
           'id', gen_random_uuid()::text, 'name', v.kin_name,
           'relation', 'Parent', 'phones', jsonb_build_array(v.kin_phone))),
         null, v_t_4sc,
         (select id from public.institutions where property_id = v_prop order by name limit 1),
         v.move_in, v.move_out, 1200, 'paid', 0,
         1200, v.move_in, 'mobile', v.dep_status, v.dep_note,
         v.notes, v.on_time, v.months, false
  from (values
    ('Nelson Mukuka',  array['0966 774 553'], 'Rabecca Mukuka', '0977 118 449', '12 Sep 2025', '20 Dec 2025', 'Refunded',            'Room inspected, no damage — full deposit returned by mobile money.', 'Completed studies and returned to Ndola.', 3, 3),
    ('Beauty Chilufya',array['0977 553 226'], 'Andrew Chilufya','0966 449 802', '12 Sep 2025', '28 Jan 2026', 'Partially refunded',  'K300 withheld for a broken window pane in Room 18.',                 'Transferred to a campus hostel.',          4, 4)
  ) as v(name, phones, kin_name, kin_phone, move_in, move_out, dep_status, dep_note, notes, on_time, months);

  ---------------------------------------------------------------------------
  -- 7. Ledger history — up to 6 months of rent per active tenant.
  --    The current month reflects each tenant's live status; prior months are
  --    settled, which is what makes the dashboard chart and trend look real.
  ---------------------------------------------------------------------------
  insert into public.ledger_entries (tenant_id, label, amount, paid_amount, status, period, created_at)
  select
    t.id,
    to_char(m.month_start, 'FMMonth YYYY') || ' rent',
    t.rent_amount,
    case when m.offset_months = 0 and t.status = 'partial' then t.rent_amount - t.owed_amount else null end,
    case when m.offset_months = 0 then t.status else 'paid' end,
    to_char(m.month_start, 'YYYY-MM'),
    -- Prior months land a few days after the 5th due date; the current month's
    -- entry is timestamped early in the month.
    (m.month_start + interval '4 days'
                   + (floor(random() * 5)::int  || ' days')::interval
                   + (floor(random() * 10)::int || ' hours')::interval)
  from public.tenants t
  cross join lateral (
    select gs as offset_months,
           date_trunc('month', current_date) - (gs || ' months')::interval as month_start
    from generate_series(0, 5) gs
  ) m
  where t.property_id = v_prop
    and t.active
    -- only bill months the tenant was actually resident for
    and m.month_start >= date_trunc('month', t.move_in_date::date)
    -- unpaid/overdue tenants have no payment recorded for the current month
    and not (m.offset_months = 0 and t.status in ('unpaid', 'overdue'));

  ---------------------------------------------------------------------------
  -- 8. Expense categories + real running costs
  ---------------------------------------------------------------------------
  insert into public.expense_categories (property_id, name) values (v_prop, 'Electricity (ZESCO)')       returning id into v_c_power;
  insert into public.expense_categories (property_id, name) values (v_prop, 'Water (LWSC)')              returning id into v_c_water;
  insert into public.expense_categories (property_id, name) values (v_prop, 'Security')                  returning id into v_c_security;
  insert into public.expense_categories (property_id, name) values (v_prop, 'Cleaning & sanitation')     returning id into v_c_clean;
  insert into public.expense_categories (property_id, name) values (v_prop, 'Internet & Wi-Fi')          returning id into v_c_net;
  insert into public.expense_categories (property_id, name) values (v_prop, 'Repairs & maintenance')     returning id into v_c_repairs;
  insert into public.expense_categories (property_id, name) values (v_prop, 'Refuse collection')         returning id into v_c_refuse;
  insert into public.expense_categories (property_id, name) values (v_prop, 'Council rates & licences')  returning id into v_c_rates;
  insert into public.expense_categories (property_id, name) values (v_prop, 'Transport & fuel')          returning id into v_c_transport;

  insert into public.expenses (property_id, category_id, name, description, amount, date, source)
  values
    -- current month
    (v_prop, v_c_power,     'ZESCO prepaid units',            'Three-phase meter, Blocks A and B',                    4250, to_char(current_date, 'YYYY-MM-') || '03', 'manual'),
    (v_prop, v_c_water,     'LWSC water bill',                 'Monthly account 4471-0092',                            2380, to_char(current_date, 'YYYY-MM-') || '04', 'manual'),
    (v_prop, v_c_net,       'Liquid Home fibre — 60Mbps',      'Shared Wi-Fi for both blocks',                          1650, to_char(current_date, 'YYYY-MM-') || '02', 'manual'),
    (v_prop, v_c_clean,     'Cleaning supplies',               'Jik, handwash, mops — Shoprite Manda Hill',              742, to_char(current_date, 'YYYY-MM-') || '06', 'manual'),
    (v_prop, v_c_repairs,   'Blocked drain — Block B ablution','Plumber call-out and rodding',                           900, to_char(current_date, 'YYYY-MM-') || '08', 'manual'),
    (v_prop, v_c_refuse,    'Refuse collection — LCC',         'Monthly skip service',                                   450, to_char(current_date, 'YYYY-MM-') || '05', 'manual'),
    -- last month
    (v_prop, v_c_power,     'ZESCO prepaid units',             'Higher usage — cold nights, more heaters',              5120, to_char(current_date - interval '1 month', 'YYYY-MM-') || '03', 'manual'),
    (v_prop, v_c_water,     'LWSC water bill',                 'Monthly account 4471-0092',                             2210, to_char(current_date - interval '1 month', 'YYYY-MM-') || '04', 'manual'),
    (v_prop, v_c_net,       'Liquid Home fibre — 60Mbps',      '',                                                      1650, to_char(current_date - interval '1 month', 'YYYY-MM-') || '02', 'manual'),
    (v_prop, v_c_repairs,   'Borehole pump repair',            'Impeller replaced, technician from Chilenje',           1850, to_char(current_date - interval '1 month', 'YYYY-MM-') || '14', 'manual'),
    (v_prop, v_c_repairs,   'Repaint Room 18',                 'After move-out — paint, filler, labour',                2300, to_char(current_date - interval '1 month', 'YYYY-MM-') || '22', 'manual'),
    (v_prop, v_c_security,  'Guard uniforms and torches',      'Two sets plus rechargeable torches',                    1240, to_char(current_date - interval '1 month', 'YYYY-MM-') || '11', 'manual'),
    (v_prop, v_c_refuse,    'Refuse collection — LCC',         '',                                                       450, to_char(current_date - interval '1 month', 'YYYY-MM-') || '05', 'manual'),
    (v_prop, v_c_transport, 'Fuel — hardware runs',            'Trips to Kamwala for fittings',                           680, to_char(current_date - interval '1 month', 'YYYY-MM-') || '17', 'manual'),
    -- two months back
    (v_prop, v_c_power,     'ZESCO prepaid units',             '',                                                      3980, to_char(current_date - interval '2 months', 'YYYY-MM-') || '03', 'manual'),
    (v_prop, v_c_water,     'LWSC water bill',                 '',                                                      2050, to_char(current_date - interval '2 months', 'YYYY-MM-') || '04', 'manual'),
    (v_prop, v_c_net,       'Liquid Home fibre — 60Mbps',      '',                                                      1650, to_char(current_date - interval '2 months', 'YYYY-MM-') || '02', 'manual'),
    (v_prop, v_c_rates,     'Lusaka City Council — lodging levy','Annual licence, paid in two parts',                    3200, to_char(current_date - interval '2 months', 'YYYY-MM-') || '09', 'manual'),
    (v_prop, v_c_clean,     'Pest control — fumigation',       'Both blocks, quarterly service',                         1500, to_char(current_date - interval '2 months', 'YYYY-MM-') || '19', 'manual'),
    (v_prop, v_c_repairs,   'Replace geyser element — Room 5', '',                                                        620, to_char(current_date - interval '2 months', 'YYYY-MM-') || '25', 'manual'),
    (v_prop, v_c_refuse,    'Refuse collection — LCC',         '',                                                        450, to_char(current_date - interval '2 months', 'YYYY-MM-') || '05', 'manual');

  ---------------------------------------------------------------------------
  -- 9. Maintenance reports (as submitted by tenants via the payment portal)
  ---------------------------------------------------------------------------
  insert into public.maintenance_reports (property_id, location, description, tenant, status, unread, submitted_at, resolved_at, photo_url)
  values
    (v_prop, 'Room 14 bathroom', 'The shower drain is blocked and water is standing ankle deep after every bath. It has been like this for three days.',
      'Mapalo Chisanga', 'open', true, now() - interval '1 day', null,
      'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?q=80&w=1200&auto=format&fit=crop'),
    (v_prop, 'Block B corridor', 'The passage light near the stairs is not working at night. It is very dark when we come from evening classes.',
      'Chisomo Nyirenda', 'open', true, now() - interval '2 days', null, null),
    (v_prop, 'Room 9', 'The socket near my bed sparks when I plug in my laptop charger. I have stopped using it.',
      'Kaunda Chibale', 'in-progress', false, now() - interval '5 days', null,
      'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?q=80&w=1200&auto=format&fit=crop'),
    (v_prop, 'Room 3 window', 'One window pane is cracked and rain comes in when it storms.',
      'Given Nyirenda', 'in-progress', false, now() - interval '8 days', null, null),
    (v_prop, 'Upper floor, Block A', 'There is no water pressure upstairs between 6am and 8am when everyone is bathing.',
      'Natasha Banda', 'open', true, now() - interval '3 days', null, null),
    (v_prop, 'Room 19 door', 'The door lock is jammed, I have to push very hard to open it.',
      'Sibongile Ngoma', 'resolved', false, now() - interval '21 days', now() - interval '19 days', null),
    (v_prop, 'Room 11 ceiling', 'Ceiling board is sagging where the roof leaked last rainy season.',
      'Bupe Mubanga', 'resolved', false, now() - interval '34 days', now() - interval '27 days',
      'https://images.unsplash.com/photo-1632759145351-1d592919f522?q=80&w=1200&auto=format&fit=crop'),
    (v_prop, 'Kitchen area', 'The tap in the shared kitchen drips all night and wastes water.',
      'Grace Mulenga', 'resolved', false, now() - interval '45 days', now() - interval '43 days', null);

  ---------------------------------------------------------------------------
  -- 10. Staff — NAPSA/NHIMA registered, Zambian payroll fields
  ---------------------------------------------------------------------------
  insert into public.employees (property_id, name, role, phone, nrc, napsa_number, nhima_number, tpin,
    pay_type, contract_type, basic_salary, start_date, gender, date_of_birth, marital_status, dependants,
    address, days_worked, standard_hours_per_day, bank, allowances, deductions, emergency_contact, active)
  values (v_prop, 'Godfrey Mwanza', 'Property caretaker', '0966 552 118', '284416/61/1', '3084416721', 'NH0841627', '1002884416',
    'monthly', 'permanent', 4800, '2024-03-01', 'Male', '1986-07-14', 'Married', 3,
    'House 214, Kalingalinga, Lusaka', 26, 8,
    '{"bankName":"Zanaco","accountNumber":"0330014782","accountName":"Godfrey Mwanza"}'::jsonb,
    '[{"label":"Housing allowance","amount":600},{"label":"Airtime","amount":150}]'::jsonb,
    '[]'::jsonb,
    '{"name":"Mirriam Mwanza","relation":"Spouse","phone":"0977 118 664"}'::jsonb, true)
  returning id into v_e_caretaker;

  insert into public.employees (property_id, name, role, phone, nrc, napsa_number, nhima_number, tpin,
    pay_type, contract_type, basic_salary, start_date, gender, date_of_birth, marital_status, dependants,
    address, days_worked, standard_hours_per_day, bank, allowances, deductions, emergency_contact, active)
  values (v_prop, 'Mathews Zulu', 'Security guard (day shift)', '0977 204 883', '331207/68/1', '3131207884', 'NH1312078', '1003312078',
    'monthly', 'permanent', 2400, '2024-08-12', 'Male', '1991-02-03', 'Married', 2,
    'Mtendere East, Lusaka', 26, 12,
    '{"bankName":"FNB","accountNumber":"6244019873","accountName":"Mathews Zulu"}'::jsonb,
    '[{"label":"Night allowance","amount":0}]'::jsonb, '[]'::jsonb,
    '{"name":"Loveness Zulu","relation":"Spouse","phone":"0966 337 209"}'::jsonb, true)
  returning id into v_e_guard_day;

  insert into public.employees (property_id, name, role, phone, nrc, napsa_number, nhima_number, tpin,
    pay_type, contract_type, basic_salary, start_date, gender, date_of_birth, marital_status, dependants,
    address, days_worked, standard_hours_per_day, bank, allowances, deductions, emergency_contact, active)
  values (v_prop, 'Patrick Banda', 'Security guard (night shift)', '0955 771 026', '402118/74/1', '3402118976', 'NH4021189', '1004021189',
    'monthly', 'permanent', 2600, '2025-01-06', 'Male', '1994-11-22', 'Single', 1,
    'Chainda, Lusaka', 26, 12,
    '{"bankName":"Zanaco","accountNumber":"0330117845","accountName":"Patrick Banda"}'::jsonb,
    '[{"label":"Night allowance","amount":400}]'::jsonb, '[]'::jsonb,
    '{"name":"Rodgers Banda","relation":"Sibling","phone":"0978 226 114"}'::jsonb, true)
  returning id into v_e_guard_night;

  insert into public.employees (property_id, name, role, phone, nrc, napsa_number, nhima_number, tpin,
    pay_type, contract_type, basic_salary, start_date, gender, date_of_birth, marital_status, dependants,
    address, days_worked, standard_hours_per_day, bank, allowances, deductions, emergency_contact, active)
  values (v_prop, 'Agnes Phiri', 'Cleaner', '0966 118 447', '295530/62/1', '3295530118', 'NH2955301', '1002955301',
    'monthly', 'permanent', 2100, '2024-05-20', 'Female', '1989-09-08', 'Widowed', 4,
    'Kalingalinga, Lusaka', 26, 8,
    '{"bankName":"Zanaco","accountNumber":"0330229106","accountName":"Agnes Phiri"}'::jsonb,
    '[{"label":"Transport allowance","amount":300}]'::jsonb, '[]'::jsonb,
    '{"name":"Chanda Phiri","relation":"Sibling","phone":"0977 449 118"}'::jsonb, true)
  returning id into v_e_cleaner;

  insert into public.employees (property_id, name, role, phone, nrc, napsa_number, nhima_number, tpin,
    pay_type, contract_type, daily_rate, start_date, gender, date_of_birth, marital_status, dependants,
    address, days_worked, standard_hours_per_day, bank, allowances, deductions, emergency_contact, active)
  values (v_prop, 'Kelvin Sakala', 'Handyman (casual)', '0967 553 210', '318824/70/1', '3318824550', 'NH3188245', '1003188245',
    'daily', 'casual', 280, '2025-04-02', 'Male', '1992-06-17', 'Married', 2,
    'Chelstone, Lusaka', 9, 8,
    '{"bankName":"","accountNumber":"","accountName":""}'::jsonb,
    '[]'::jsonb, '[]'::jsonb,
    '{"name":"Justine Sakala","relation":"Spouse","phone":"0966 802 337"}'::jsonb, true)
  returning id into v_e_handyman;

  -- Clock entries for the last 14 days (guards work 12s, others 8s)
  insert into public.clock_entries (property_id, employee_id, date, hours, overtime_hours, source)
  select v_prop, e.id, d::date,
         case when e.id in (v_e_guard_day, v_e_guard_night) then 12 else 8 end,
         case when e.id = v_e_guard_night and extract(dow from d) in (0, 6) then 2 else 0 end,
         'manual'
  from generate_series(current_date - interval '13 days', current_date, interval '1 day') d
  cross join (
    select unnest(array[v_e_caretaker, v_e_guard_day, v_e_guard_night, v_e_cleaner]) as id
  ) e
  where not (extract(dow from d) = 0 and e.id = v_e_cleaner);   -- cleaner is off on Sundays

  raise notice 'Seeded property % for %', v_prop, v_email;
end $$;
